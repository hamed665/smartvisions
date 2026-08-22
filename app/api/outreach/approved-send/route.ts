import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { evaluateApprovedSendPolicy } from '@/lib/outreach/approved-send-policy';
import { evaluateLocalWindow, type MarketCode } from '@/lib/outreach/scheduler';
import { evaluateMailboxHealth } from '@/lib/outreach/mailbox-health';
import { evaluateWhatsAppSendPolicy } from '@/lib/whatsapp/policy';
import { MetaCloudWhatsAppProvider } from '@/lib/whatsapp/meta-cloud';
import { ResendEmailProvider } from '@/lib/outreach/resend-provider';
import { getRuntimeControls } from '@/lib/reliability/runtime-controls';
import { assertPaidOperationAllowed, getCostGuardState, recordUsage } from '@/lib/reliability/cost-guard';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for approved sending');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type SendContext = {
  to?: string;
  subject?: string | null;
  html?: string | null;
  mailbox_id?: string | null;
  market_code?: MarketCode | null;
  lead_timezone?: string | null;
  last_customer_message_at?: string | null;
  template_name?: string | null;
  template_language_code?: string | null;
};

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as { organizationId?: string; messageId?: string; priority?: 'LOW'|'NORMAL'|'HIGH'|'CRITICAL' };
  if (!body.organizationId || !body.messageId) {
    return NextResponse.json({ error: 'organizationId and messageId are required' }, { status: 400 });
  }

  const supabase = serviceClient();
  const { data: message, error: messageError } = await supabase
    .from('conversation_messages')
    .select('id,organization_id,conversation_id,lead_id,channel,original_text,status,requires_approval,metadata,provider_message_id')
    .eq('organization_id', body.organizationId)
    .eq('id', body.messageId)
    .maybeSingle();
  if (messageError || !message) return NextResponse.json({ error: messageError?.message ?? 'Approved message not found' }, { status: 404 });

  const [{ data: controls, error: controlsError }, { data: lead, error: leadError }] = await Promise.all([
    supabase.from('system_controls').select('global_kill_switch,email_paused,whatsapp_ai_paused,shadow_mode').eq('organization_id', body.organizationId).maybeSingle(),
    message.lead_id ? supabase.from('leads').select('id,status,agent_mode').eq('organization_id', body.organizationId).eq('id', message.lead_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (controlsError || !controls) return NextResponse.json({ error: controlsError?.message ?? 'Runtime controls unavailable' }, { status: 409 });
  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 });

  const policy = evaluateApprovedSendPolicy({
    messageStatus: message.status,
    requiresApproval: Boolean(message.requires_approval),
    shadowMode: Boolean(controls.shadow_mode),
    globalKillSwitch: Boolean(controls.global_kill_switch),
    channelPaused: message.channel === 'EMAIL' ? Boolean(controls.email_paused) : Boolean(controls.whatsapp_ai_paused),
    doNotContact: lead?.status === 'DO_NOT_CONTACT',
    agentMode: lead?.agent_mode ?? null,
    messageChannel: message.channel,
  });
  if (!policy.allowed) return NextResponse.json({ error: 'Approved send blocked by safety policy', policy }, { status: 409 });

  const metadata = (message.metadata ?? {}) as Record<string, unknown>;
  const sendContext = ((metadata.send_context ?? {}) as SendContext);
  const idempotencyKey = typeof metadata.idempotency_key === 'string' ? metadata.idempotency_key : null;
  if (!sendContext.to || !sendContext.market_code || !idempotencyKey || !message.original_text) {
    return NextResponse.json({ error: 'Approved draft is missing persisted send context' }, { status: 409 });
  }

  const window = evaluateLocalWindow({ marketCode: sendContext.market_code, leadTimezone: sendContext.lead_timezone ?? undefined });
  if (!window.allowed) return NextResponse.json({ error: 'Outside recipient local send window', window }, { status: 409 });

  try {
    const costState = await getCostGuardState(body.organizationId);
    assertPaidOperationAllowed(costState, body.priority ?? 'NORMAL');
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Cost guard block' }, { status: 409 });
  }

  // Claim the approved message before touching a provider. PROCESSING is deliberately not auto-retried.
  const { data: claimed, error: claimError } = await supabase
    .from('conversation_messages')
    .update({ status: 'PROCESSING', processed_at: new Date().toISOString() })
    .eq('organization_id', body.organizationId)
    .eq('id', body.messageId)
    .eq('status', 'APPROVED')
    .eq('requires_approval', false)
    .select('id')
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimed) return NextResponse.json({ error: 'Message was already claimed or is no longer approved' }, { status: 409 });

  try {
    let providerMessageId: string;

    if (message.channel === 'EMAIL') {
      if (!sendContext.mailbox_id || !sendContext.subject) throw new Error('Approved email is missing mailbox_id or subject');
      const { data: mailbox, error: mailboxError } = await supabase
        .from('mailboxes')
        .select('id,enabled,daily_limit,sent_today,bounce_rate,complaint_rate')
        .eq('organization_id', body.organizationId)
        .eq('id', sendContext.mailbox_id)
        .maybeSingle();
      if (mailboxError || !mailbox) throw new Error(mailboxError?.message ?? 'Mailbox not found');

      const provider = new ResendEmailProvider();
      const providerHealth = await provider.health();
      const mailboxHealth = evaluateMailboxHealth({
        enabled: Boolean(mailbox.enabled),
        dailyLimit: Number(mailbox.daily_limit),
        sentToday: Number(mailbox.sent_today),
        bounceRate: Number(mailbox.bounce_rate),
        complaintRate: Number(mailbox.complaint_rate),
        providerHealthy: providerHealth.ok,
      });
      if (!mailboxHealth.allowed) throw new Error(`Mailbox health blocks sending: ${mailboxHealth.blocks.join(',')}`);

      const result = await provider.sendEmail({
        mailboxId: sendContext.mailbox_id,
        to: sendContext.to,
        subject: sendContext.subject,
        text: message.original_text,
        html: sendContext.html ?? undefined,
        idempotencyKey,
      });
      providerMessageId = result.providerMessageId;

      await supabase.from('outreach_messages').upsert({
        organization_id: body.organizationId,
        lead_id: message.lead_id ?? null,
        mailbox_id: sendContext.mailbox_id,
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        status: 'SENT',
        provider_message_id: providerMessageId,
        subject: sendContext.subject,
        body: message.original_text,
        idempotency_key: idempotencyKey,
        sent_at: new Date().toISOString(),
        metadata: { provider: 'RESEND', source: 'APPROVED_SHADOW_DRAFT' },
      }, { onConflict: 'organization_id,idempotency_key' });
      await supabase.from('mailboxes').update({ sent_today: Number(mailbox.sent_today) + 1, updated_at: new Date().toISOString() }).eq('organization_id', body.organizationId).eq('id', sendContext.mailbox_id);
      await recordUsage({ organizationId: body.organizationId, provider: 'EMAIL', operation: 'SEND_EMAIL', costUsd: 0, units: 1, leadId: message.lead_id ?? undefined, metadata: { provider: 'RESEND', source: 'APPROVED_SHADOW_DRAFT', pricing_status: 'PENDING_RECONCILIATION' } });
    } else {
      const whatsappPolicy = evaluateWhatsAppSendPolicy({ lastCustomerMessageAt: sendContext.last_customer_message_at ?? undefined, templateName: sendContext.template_name ?? undefined });
      if (!whatsappPolicy.allowed) throw new Error('WhatsApp 24-hour policy blocks this approved send');
      const provider = new MetaCloudWhatsAppProvider();
      const result = whatsappPolicy.mode === 'TEMPLATE'
        ? await provider.sendTemplate({ to: sendContext.to, templateName: sendContext.template_name!, languageCode: sendContext.template_language_code ?? 'en' })
        : await provider.sendText({ to: sendContext.to, text: message.original_text });
      providerMessageId = result.providerMessageId;
      await supabase.from('whatsapp_events').upsert({
        organization_id: body.organizationId,
        lead_id: message.lead_id ?? null,
        conversation_id: message.conversation_id,
        provider_message_id: providerMessageId,
        direction: 'OUTBOUND',
        event_type: whatsappPolicy.mode === 'TEMPLATE' ? 'TEMPLATE_SENT' : 'TEXT_SENT',
        payload: { source: 'APPROVED_SHADOW_DRAFT' },
      }, { onConflict: 'organization_id,provider_message_id,direction,event_type', ignoreDuplicates: true });
      await recordUsage({ organizationId: body.organizationId, provider: 'WHATSAPP', operation: whatsappPolicy.mode === 'TEMPLATE' ? 'SEND_TEMPLATE' : 'SEND_TEXT', costUsd: 0, units: 1, leadId: message.lead_id ?? undefined, metadata: { source: 'APPROVED_SHADOW_DRAFT', pricing_status: 'PENDING_RECONCILIATION' } });
    }

    await supabase.from('conversation_messages').update({ status: 'SENT', provider_message_id: providerMessageId, sent_at: new Date().toISOString(), processed_at: new Date().toISOString() }).eq('organization_id', body.organizationId).eq('id', body.messageId);
    await supabase.from('sales_conversations').update({ last_outbound_at: new Date().toISOString(), last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('organization_id', body.organizationId).eq('id', message.conversation_id);

    return NextResponse.json({ sent: true, channel: message.channel, providerMessageId, idempotencyKey });
  } catch (error) {
    await supabase.from('conversation_messages').update({ status: 'FAILED', approval_reason: error instanceof Error ? error.message.slice(0, 500) : 'Approved send failed', processed_at: new Date().toISOString() }).eq('organization_id', body.organizationId).eq('id', body.messageId);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Approved send failed', retryPolicy: 'NO_AUTOMATIC_RETRY' }, { status: 502 });
  }
}
