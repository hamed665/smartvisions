import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { approvedSendFailureDisposition, evaluateApprovedSendPolicy } from '@/lib/outreach/approved-send-policy';
import { assertCanonicalSendAllowed } from '@/lib/outreach/canonical-send-gate';
import { verifyControlledWhatsAppCatalogPilot } from '@/lib/outreach/controlled-whatsapp-pilot';
import { verifyControlledEmailAutoPilot, mailboxWarmupAllowsAutomaticSend } from '@/lib/outreach/controlled-email-auto-pilot';
import { omanDateKey } from '@/lib/outreach/daily-target';
import { evidencePipelineTargetMatches } from '@/lib/operations/evidence-pipeline-policy';
import { evaluateLocalWindow, type MarketCode } from '@/lib/outreach/scheduler';
import { evaluateMailboxHealth } from '@/lib/outreach/mailbox-health';
import { countMailboxSendsLast24Hours } from '@/lib/outreach/mailbox-usage';
import { MetaCloudWhatsAppProvider } from '@/lib/whatsapp/meta-cloud';
import { assertSmartVisionsCatalogContentId } from '@/lib/whatsapp/catalog';
import { verifyLiveTestMarketWindowException } from '@/lib/whatsapp/live-test-market-window-exception';
import type { WhatsAppSendResult } from '@/lib/whatsapp/provider';
import { ResendEmailProvider } from '@/lib/outreach/resend-provider';
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
  template_body_parameters?: string[] | null;
  catalog_content_id?: string | null;
};

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as {
    organizationId?: string;
    messageId?: string;
    priority?: 'LOW'|'NORMAL'|'HIGH'|'CRITICAL';
    controlledShadowPilot?: boolean;
    controlledEmailPilot?: boolean;
  };
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

  const providerIdentity = message.channel === 'EMAIL'
    ? { provider: 'EMAIL_PROVIDER', channel: 'EMAIL' }
    : message.channel === 'WHATSAPP'
      ? { provider: 'META', channel: 'WHATSAPP' }
      : null;

  const [{ data: controls, error: controlsError }, { data: lead, error: leadError }, providerConnectionResult] = await Promise.all([
    supabase.from('system_controls').select('global_kill_switch,email_paused,whatsapp_ai_paused,agents_paused,shadow_mode').eq('organization_id', body.organizationId).maybeSingle(),
    message.lead_id ? supabase.from('leads').select('id,business_id,status,agent_mode').eq('organization_id', body.organizationId).eq('id', message.lead_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    providerIdentity
      ? supabase.from('integration_connections')
        .select('enabled,status,last_error')
        .eq('organization_id', body.organizationId)
        .eq('provider', providerIdentity.provider)
        .eq('channel', providerIdentity.channel)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (controlsError || !controls) return NextResponse.json({ error: controlsError?.message ?? 'Runtime controls unavailable' }, { status: 409 });
  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 });

  const metadata = (message.metadata ?? {}) as Record<string, unknown>;
  const sendContext = ((metadata.send_context ?? {}) as SendContext);
  const idempotencyKey = typeof metadata.idempotency_key === 'string' ? metadata.idempotency_key : null;
  if (!sendContext.to || !sendContext.market_code || !idempotencyKey || !message.original_text) {
    return NextResponse.json({ error: 'Approved draft is missing persisted send context' }, { status: 409 });
  }

  let shadowModeExceptionVerified = false;
  let liveTestMarketWindowExceptionVerified = false;
  if (body.controlledShadowPilot) {
    if (!controls.shadow_mode) {
      return NextResponse.json({ error: 'Controlled shadow pilot requires Shadow Mode to remain ON' }, { status: 409 });
    }
    if (!message.lead_id || !message.conversation_id || !lead?.business_id) {
      return NextResponse.json({ error: 'Controlled shadow pilot is missing durable lead/conversation/business linkage' }, { status: 409 });
    }

    const [{ data: business, error: businessError }, { data: conversation, error: conversationError }] = await Promise.all([
      supabase.from('businesses')
        .select('id,category,whatsapp,phone')
        .eq('organization_id', body.organizationId)
        .eq('id', lead.business_id)
        .maybeSingle(),
      supabase.from('sales_conversations')
        .select('id,lead_id,channel')
        .eq('organization_id', body.organizationId)
        .eq('id', message.conversation_id)
        .maybeSingle(),
    ]);
    if (businessError || !business) {
      return NextResponse.json({ error: `Controlled pilot business verification failed: ${businessError?.message ?? 'not found'}` }, { status: 409 });
    }
    if (conversationError || !conversation) {
      return NextResponse.json({ error: `Controlled pilot conversation verification failed: ${conversationError?.message ?? 'not found'}` }, { status: 409 });
    }

    const verification = verifyControlledWhatsAppCatalogPilot({
      messageStatus: message.status,
      requiresApproval: Boolean(message.requires_approval),
      channel: message.channel,
      metadataSource: metadata.source,
      providerMessageId: message.provider_message_id,
      idempotencyKey,
      catalogContentId: sendContext.catalog_content_id,
      sendTo: sendContext.to,
      messageLeadId: message.lead_id,
      conversationLeadId: conversation.lead_id,
      conversationChannel: conversation.channel,
      businessCategory: business.category,
      businessWhatsapp: business.whatsapp,
      businessPhone: business.phone,
    });
    if (!verification.verified) {
      return NextResponse.json({ error: 'Controlled shadow pilot evidence failed closed', reason: verification.reason }, { status: 409 });
    }
    shadowModeExceptionVerified = true;
    liveTestMarketWindowExceptionVerified = await verifyLiveTestMarketWindowException({
      supabase,
      organizationId: body.organizationId,
      messageStatus: message.status,
      requiresApproval: Boolean(message.requires_approval),
      channel: message.channel,
      metadataSource: metadata.source,
      providerMessageId: message.provider_message_id,
      idempotencyKey,
      catalogContentId: sendContext.catalog_content_id,
      sendTo: sendContext.to,
      messageLeadId: message.lead_id,
      conversationLeadId: conversation.lead_id,
      conversationChannel: conversation.channel,
      businessCategory: business.category,
      businessWhatsapp: business.whatsapp,
      businessPhone: business.phone,
      shadowMode: Boolean(controls.shadow_mode),
      globalKillSwitch: Boolean(controls.global_kill_switch),
      agentsPaused: Boolean(controls.agents_paused),
      whatsappPaused: Boolean(controls.whatsapp_ai_paused),
    });
  }

  if (body.controlledEmailPilot) {
    if (!controls.shadow_mode) return NextResponse.json({ error: 'Controlled email autopilot requires Shadow Mode to remain ON' }, { status: 409 });
    if (message.channel !== 'EMAIL' || !message.lead_id || !message.conversation_id || !lead?.business_id) {
      return NextResponse.json({ error: 'Controlled email autopilot is missing canonical email linkage' }, { status: 409 });
    }
    const dateKey = omanDateKey(new Date());
    const [{ data: conversation, error: conversationError }, { data: business, error: businessError }, { data: campaign, error: campaignError }] = await Promise.all([
      supabase.from('sales_conversations').select('id,lead_id,channel').eq('organization_id', body.organizationId).eq('id', message.conversation_id).maybeSingle(),
      supabase.from('businesses').select('id,city,category,formatted_address,google_primary_type_display_name').eq('organization_id', body.organizationId).eq('id', lead.business_id).maybeSingle(),
      supabase.from('campaigns')
        .select('id,status,country_code,city,industry,config')
        .eq('organization_id', body.organizationId)
        .eq('status', 'RUNNING')
        .eq('country_code', 'OM')
        .contains('config', { dailyOutreachTarget: true, targetDate: dateKey, marketCode: 'OM' })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (conversationError || businessError || campaignError || !conversation || !business || !campaign) {
      return NextResponse.json({ error: 'Controlled email autopilot campaign/linkage verification failed' }, { status: 409 });
    }
    if (!evidencePipelineTargetMatches({
      targetCity: campaign.city,
      targetIndustry: campaign.industry,
      businessCity: business.city,
      formattedAddress: business.formatted_address,
      category: business.category,
      primaryType: business.google_primary_type_display_name,
    })) return NextResponse.json({ error: 'Controlled email autopilot target mismatch' }, { status: 409 });

    const verification = verifyControlledEmailAutoPilot({
      messageStatus: message.status,
      requiresApproval: Boolean(message.requires_approval),
      channel: message.channel,
      metadataSource: metadata.source,
      providerMessageId: message.provider_message_id,
      idempotencyKey,
      marketCode: String(sendContext.market_code),
      messageLeadId: message.lead_id,
      conversationLeadId: conversation.lead_id,
      conversationChannel: conversation.channel,
      campaignStatus: campaign.status,
      campaignCountryCode: campaign.country_code,
      campaignConfig: campaign.config,
      currentOmanDateKey: dateKey,
    });
    if (!verification.verified) return NextResponse.json({ error: 'Controlled email autopilot evidence failed closed', reason: verification.reason }, { status: 409 });
    shadowModeExceptionVerified = true;
  }

  const policy = evaluateApprovedSendPolicy({
    messageStatus: message.status,
    requiresApproval: Boolean(message.requires_approval),
    shadowMode: Boolean(controls.shadow_mode),
    shadowModeExceptionVerified,
    globalKillSwitch: Boolean(controls.global_kill_switch),
    channelPaused: message.channel === 'EMAIL' ? Boolean(controls.email_paused) : Boolean(controls.whatsapp_ai_paused),
    agentsPaused: Boolean(controls.agents_paused),
    doNotContact: lead?.status === 'DO_NOT_CONTACT',
    agentMode: lead?.agent_mode ?? null,
    messageChannel: message.channel,
  });
  if (!policy.allowed) return NextResponse.json({ error: 'Approved send blocked by safety policy', policy }, { status: 409 });

  if (!providerIdentity) {
    return NextResponse.json({ error: 'Approved send channel has no configured provider mapping' }, { status: 409 });
  }
  if (providerConnectionResult.error) {
    return NextResponse.json({ error: `Provider connection lookup failed: ${providerConnectionResult.error.message}` }, { status: 409 });
  }
  const providerConnection = providerConnectionResult.data;
  if (!providerConnection || !providerConnection.enabled || providerConnection.status !== 'CONNECTED') {
    return NextResponse.json({
      error: 'Approved send blocked because provider is not production-verified CONNECTED',
      provider: providerIdentity,
      providerStatus: providerConnection?.status ?? 'MISSING',
    }, { status: 409 });
  }

  const window = evaluateLocalWindow({ marketCode: sendContext.market_code, leadTimezone: sendContext.lead_timezone ?? undefined });
  if (!window.allowed && !liveTestMarketWindowExceptionVerified) {
    return NextResponse.json({ error: 'Outside recipient local send window', window }, { status: 409 });
  }

  try {
    const costState = await getCostGuardState(body.organizationId);
    assertPaidOperationAllowed(costState, body.priority ?? 'NORMAL');
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Cost guard block' }, { status: 409 });
  }

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

  let providerAccepted = false;
  let providerMessageId: string | null = null;
  try {
    if (!message.lead_id || !message.conversation_id) throw new Error('Approved send is missing canonical lead/conversation linkage');
    if (message.channel !== 'EMAIL' && message.channel !== 'WHATSAPP') throw new Error('Approved send channel is unsupported');

    const assertFinalProviderBoundary = async () => {
      const gate = await assertCanonicalSendAllowed({
        supabase,
        organizationId: body.organizationId!,
        leadId: message.lead_id!,
        conversationId: message.conversation_id!,
        channel: message.channel as 'EMAIL' | 'WHATSAPP',
        recipient: sendContext.to!,
        templateName: sendContext.template_name,
        shadowModeExceptionVerified,
        marketWindowExceptionVerified: liveTestMarketWindowExceptionVerified,
      });
      const costState = await getCostGuardState(body.organizationId!);
      assertPaidOperationAllowed(costState, body.priority ?? 'NORMAL');
      return gate;
    };

    if (message.channel === 'EMAIL') {
      if (!sendContext.mailbox_id || !sendContext.subject) throw new Error('Approved email is missing mailbox_id or subject');
      const { data: mailbox, error: mailboxError } = await supabase
        .from('mailboxes')
        .select('id,enabled,daily_limit,bounce_rate,complaint_rate,warmup_status,health_status')
        .eq('organization_id', body.organizationId)
        .eq('id', sendContext.mailbox_id)
        .maybeSingle();
      if (mailboxError || !mailbox) throw new Error(mailboxError?.message ?? 'Mailbox not found');
      if (body.controlledEmailPilot && (!mailboxWarmupAllowsAutomaticSend(mailbox.warmup_status) || String(mailbox.health_status ?? '').toUpperCase() !== 'HEALTHY')) {
        throw new Error(`Controlled email autopilot mailbox readiness blocks sending: warmup=${mailbox.warmup_status ?? 'UNKNOWN'}, health=${mailbox.health_status ?? 'UNKNOWN'}`);
      }

      const sentLast24Hours = await countMailboxSendsLast24Hours({
        supabase,
        organizationId: body.organizationId,
        mailboxId: sendContext.mailbox_id,
      });
      const provider = new ResendEmailProvider();
      const providerHealth = await provider.health();
      const mailboxHealth = evaluateMailboxHealth({
        enabled: Boolean(mailbox.enabled),
        dailyLimit: Number(mailbox.daily_limit),
        sentToday: sentLast24Hours,
        bounceRate: Number(mailbox.bounce_rate),
        complaintRate: Number(mailbox.complaint_rate),
        providerHealthy: providerHealth.ok,
      });
      if (!mailboxHealth.allowed) throw new Error(`Mailbox health blocks sending: ${mailboxHealth.blocks.join(',')}`);

      await assertFinalProviderBoundary();
      const result = await provider.sendEmail({
        mailboxId: sendContext.mailbox_id,
        to: sendContext.to,
        subject: sendContext.subject,
        text: message.original_text,
        html: sendContext.html ?? undefined,
        idempotencyKey,
      });
      providerMessageId = result.providerMessageId;
      providerAccepted = true;

      const accepted = await supabase.from('conversation_messages').update({
        status: 'SENT', provider_message_id: providerMessageId, sent_at: new Date().toISOString(), processed_at: new Date().toISOString(), approval_reason: null,
      }).eq('organization_id', body.organizationId).eq('id', body.messageId).eq('status', 'PROCESSING');
      if (accepted.error) throw new Error(`Provider-accepted email reconciliation failed: ${accepted.error.message}`);

      const outreach = await supabase.from('outreach_messages').upsert({
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
      if (outreach.error) throw new Error(`Email send ledger reconciliation failed: ${outreach.error.message}`);

      const mailboxUpdate = await supabase.from('mailboxes').update({ sent_today: sentLast24Hours + 1, updated_at: new Date().toISOString() }).eq('organization_id', body.organizationId).eq('id', sendContext.mailbox_id);
      if (mailboxUpdate.error) throw new Error(`Mailbox counter reconciliation failed: ${mailboxUpdate.error.message}`);
      await recordUsage({ organizationId: body.organizationId, provider: 'EMAIL', operation: 'SEND_EMAIL', costUsd: 0, units: 1, leadId: message.lead_id ?? undefined, metadata: { provider: 'RESEND', source: 'APPROVED_SHADOW_DRAFT', pricing_status: 'PENDING_RECONCILIATION' } });
    } else {
      const finalGate = await assertFinalProviderBoundary();
      const whatsappPolicy = finalGate.whatsappPolicy;
      if (!whatsappPolicy?.allowed) throw new Error('WhatsApp canonical 24-hour policy blocks this approved send');
      const provider = new MetaCloudWhatsAppProvider();
      const catalogContentId = sendContext.catalog_content_id?.trim() || null;
      let whatsappOperation: 'SEND_TEMPLATE' | 'SEND_TEXT' | 'SEND_PRODUCT';
      let whatsappEventType: 'TEMPLATE_SENT' | 'TEXT_SENT' | 'PRODUCT_SENT';
      let result: WhatsAppSendResult;

      if (catalogContentId) {
        if (whatsappPolicy.mode !== 'FREEFORM') throw new Error('WhatsApp catalog product messages require an open 24-hour customer service window');
        assertSmartVisionsCatalogContentId(catalogContentId);
        result = await provider.sendCatalogProduct({
          to: sendContext.to,
          contentId: catalogContentId,
          bodyText: message.original_text,
        });
        whatsappOperation = 'SEND_PRODUCT';
        whatsappEventType = 'PRODUCT_SENT';
      } else if (whatsappPolicy.mode === 'TEMPLATE') {
        result = await provider.sendTemplate({
          to: sendContext.to,
          templateName: sendContext.template_name!,
          languageCode: sendContext.template_language_code ?? 'en',
          bodyParameters: Array.isArray(sendContext.template_body_parameters)
            ? sendContext.template_body_parameters.map((value) => String(value))
            : undefined,
        });
        whatsappOperation = 'SEND_TEMPLATE';
        whatsappEventType = 'TEMPLATE_SENT';
      } else {
        result = await provider.sendText({ to: sendContext.to, text: message.original_text });
        whatsappOperation = 'SEND_TEXT';
        whatsappEventType = 'TEXT_SENT';
      }
      providerMessageId = result.providerMessageId;
      providerAccepted = true;

      const accepted = await supabase.from('conversation_messages').update({
        status: 'SENT', provider_message_id: providerMessageId, sent_at: new Date().toISOString(), processed_at: new Date().toISOString(), approval_reason: null,
      }).eq('organization_id', body.organizationId).eq('id', body.messageId).eq('status', 'PROCESSING');
      if (accepted.error) throw new Error(`Provider-accepted WhatsApp reconciliation failed: ${accepted.error.message}`);

      const eventWrite = await supabase.from('whatsapp_events').upsert({
        organization_id: body.organizationId,
        lead_id: message.lead_id ?? null,
        conversation_id: message.conversation_id,
        provider_message_id: providerMessageId,
        direction: 'OUTBOUND',
        event_type: whatsappEventType,
        payload: { source: 'APPROVED_SHADOW_DRAFT', ...(catalogContentId ? { catalog_content_id: catalogContentId } : {}) },
      }, { onConflict: 'organization_id,provider_message_id,direction,event_type', ignoreDuplicates: true });
      if (eventWrite.error) throw new Error(`WhatsApp event reconciliation failed: ${eventWrite.error.message}`);
      await recordUsage({ organizationId: body.organizationId, provider: 'WHATSAPP', operation: whatsappOperation, costUsd: 0, units: 1, leadId: message.lead_id ?? undefined, metadata: { source: 'APPROVED_SHADOW_DRAFT', pricing_status: 'PENDING_RECONCILIATION', canonical_last_inbound_at: finalGate.lastInboundAt, ...(catalogContentId ? { catalog_content_id: catalogContentId } : {}) } });
    }

    const conversationUpdate = await supabase.from('sales_conversations').update({ last_outbound_at: new Date().toISOString(), last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('organization_id', body.organizationId).eq('id', message.conversation_id);
    if (conversationUpdate.error) throw new Error(`Conversation reconciliation failed: ${conversationUpdate.error.message}`);

    return NextResponse.json({ sent: true, channel: message.channel, providerMessageId, idempotencyKey, controlledShadowPilot: Boolean(body.controlledShadowPilot), controlledEmailPilot: Boolean(body.controlledEmailPilot) });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Approved send failed';
    const disposition = approvedSendFailureDisposition(providerAccepted);
    if (disposition.markFailed) {
      await supabase.from('conversation_messages').update({ status: 'FAILED', approval_reason: errorMessage.slice(0, 500), processed_at: new Date().toISOString() }).eq('organization_id', body.organizationId).eq('id', body.messageId).eq('status', 'PROCESSING');
    } else {
      await supabase.from('conversation_messages').update({ approval_reason: `PROVIDER_ACCEPTED_RECONCILIATION_REQUIRED: ${errorMessage}`.slice(0, 500), processed_at: new Date().toISOString() }).eq('organization_id', body.organizationId).eq('id', body.messageId);
    }
    return NextResponse.json({
      error: errorMessage,
      providerAccepted,
      providerMessageId,
      retryPolicy: disposition.retryPolicy,
    }, { status: disposition.httpStatus });
  }
}
