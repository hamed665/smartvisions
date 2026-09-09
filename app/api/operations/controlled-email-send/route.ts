import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { assertCanonicalSendAllowed } from '@/lib/outreach/canonical-send-gate';
import { verifyControlledEmailAutoPilot, mailboxWarmupAllowsAutomaticSend } from '@/lib/outreach/controlled-email-auto-pilot';
import { marketDateKey } from '@/lib/outreach/market-profile';
import { evidencePipelineTargetMatches } from '@/lib/operations/evidence-pipeline-policy';
import { evaluateLocalWindow, type MarketCode } from '@/lib/outreach/scheduler';
import { evaluateMailboxHealth } from '@/lib/outreach/mailbox-health';
import { countMailboxSendsLast24Hours } from '@/lib/outreach/mailbox-usage';
import { ResendEmailProvider } from '@/lib/outreach/resend-provider';
import { assertPaidOperationAllowed, getCostGuardState, recordUsage } from '@/lib/reliability/cost-guard';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for controlled email sending');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request); if (denied) return denied;
  const body = await request.json() as { organizationId?: string; messageId?: string; priority?: 'LOW'|'NORMAL'|'HIGH'|'CRITICAL' };
  if (!body.organizationId || !body.messageId) return NextResponse.json({ error: 'organizationId and messageId are required' }, { status: 400 });
  const supabase = serviceClient();
  const { data: message, error: messageError } = await supabase.from('conversation_messages')
    .select('id,conversation_id,lead_id,channel,original_text,status,requires_approval,metadata,provider_message_id')
    .eq('organization_id', body.organizationId).eq('id', body.messageId).maybeSingle();
  if (messageError || !message) return NextResponse.json({ error: messageError?.message ?? 'Message not found' }, { status: 404 });
  if (message.channel !== 'EMAIL' || !message.lead_id || !message.conversation_id || !message.original_text) return NextResponse.json({ error: 'Controlled email linkage is incomplete' }, { status: 409 });
  const metadata = record(message.metadata); const send = record(metadata.send_context); const marketCode = String(send.market_code ?? '').toUpperCase();
  const recipient = String(send.to ?? '').trim(); const mailboxId = String(send.mailbox_id ?? '').trim(); const subject = String(send.subject ?? '').trim(); const idempotencyKey = String(metadata.idempotency_key ?? '').trim();
  if (!marketCode || !recipient || !mailboxId || !subject || !idempotencyKey) return NextResponse.json({ error: 'Persisted send context is incomplete' }, { status: 409 });

  const [{ data: controls }, { data: lead }, { data: conversation }, { data: business }, { data: providerConnection }, { data: mailbox }] = await Promise.all([
    supabase.from('system_controls').select('global_kill_switch,email_paused,agents_paused,shadow_mode').eq('organization_id', body.organizationId).maybeSingle(),
    supabase.from('leads').select('id,business_id,status,agent_mode').eq('organization_id', body.organizationId).eq('id', message.lead_id).maybeSingle(),
    supabase.from('sales_conversations').select('id,lead_id,channel').eq('organization_id', body.organizationId).eq('id', message.conversation_id).maybeSingle(),
    supabase.from('leads').select('business_id,businesses(id,country_code,city,category,formatted_address,google_primary_type_display_name)').eq('organization_id', body.organizationId).eq('id', message.lead_id).maybeSingle(),
    supabase.from('integration_connections').select('enabled,status').eq('organization_id', body.organizationId).eq('provider', 'EMAIL_PROVIDER').eq('channel', 'EMAIL').maybeSingle(),
    supabase.from('mailboxes').select('id,enabled,daily_limit,bounce_rate,complaint_rate,warmup_status,health_status').eq('organization_id', body.organizationId).eq('id', mailboxId).maybeSingle(),
  ]);
  const businessRelation = business?.businesses; const businessRow = (Array.isArray(businessRelation) ? businessRelation[0] : businessRelation) as Record<string, unknown> | null;
  if (!controls || !lead || !conversation || !businessRow || !mailbox) return NextResponse.json({ error: 'Canonical runtime linkage unavailable' }, { status: 409 });
  if (!providerConnection?.enabled || providerConnection.status !== 'CONNECTED') return NextResponse.json({ error: 'Email provider is not production-verified CONNECTED' }, { status: 409 });
  if (!controls.shadow_mode || controls.global_kill_switch || controls.email_paused || controls.agents_paused || lead.status === 'DO_NOT_CONTACT' || ['HUMAN','PAUSED'].includes(String(lead.agent_mode).toUpperCase())) return NextResponse.json({ error: 'Controlled email blocked by runtime safety state' }, { status: 409 });
  if (String(businessRow.country_code ?? '').toUpperCase() !== marketCode) return NextResponse.json({ error: 'Business/send market mismatch' }, { status: 409 });

  const dateKey = marketDateKey(marketCode, new Date());
  const { data: campaigns, error: campaignError } = await supabase.from('campaigns').select('id,status,country_code,city,industry,config').eq('organization_id', body.organizationId).eq('status', 'RUNNING').eq('country_code', marketCode).order('updated_at', { ascending: false }).limit(20);
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 503 });
  const campaign = (campaigns ?? []).find((row) => { const c = record(row.config); return c.dailyOutreachTarget === true && String(c.marketCode ?? '').toUpperCase() === marketCode && String(c.targetDate ?? '') === dateKey; });
  if (!campaign) return NextResponse.json({ error: 'No active controlled daily campaign for this market/date' }, { status: 409 });
  if (!evidencePipelineTargetMatches({ targetCity: campaign.city, targetIndustry: campaign.industry, businessCity: businessRow.city as string | null, formattedAddress: businessRow.formatted_address as string | null, category: businessRow.category as string | null, primaryType: businessRow.google_primary_type_display_name as string | null })) return NextResponse.json({ error: 'Controlled email target mismatch' }, { status: 409 });

  const verification = verifyControlledEmailAutoPilot({ messageStatus: message.status, requiresApproval: Boolean(message.requires_approval), channel: message.channel, metadataSource: metadata.source, providerMessageId: message.provider_message_id, idempotencyKey, marketCode, messageLeadId: message.lead_id, conversationLeadId: conversation.lead_id, conversationChannel: conversation.channel, campaignStatus: campaign.status, campaignCountryCode: campaign.country_code, campaignConfig: campaign.config, currentMarketDateKey: dateKey });
  if (!verification.verified) return NextResponse.json({ error: 'Controlled email evidence failed closed', reason: verification.reason }, { status: 409 });
  if (!mailbox.enabled || !mailboxWarmupAllowsAutomaticSend(mailbox.warmup_status) || String(mailbox.health_status).toUpperCase() !== 'HEALTHY') return NextResponse.json({ error: 'Mailbox readiness blocks automatic sending', warmupStatus: mailbox.warmup_status, healthStatus: mailbox.health_status }, { status: 409 });

  const localWindow = evaluateLocalWindow({ marketCode: marketCode as MarketCode, leadTimezone: send.lead_timezone ? String(send.lead_timezone) : undefined });
  if (!localWindow.allowed) return NextResponse.json({ error: 'Outside recipient local send window', window: localWindow }, { status: 409 });
  await assertCanonicalSendAllowed({ supabase, organizationId: body.organizationId, leadId: message.lead_id, conversationId: message.conversation_id, channel: 'EMAIL', recipient, shadowModeExceptionVerified: true, marketWindowExceptionVerified: false });
  try { assertPaidOperationAllowed(await getCostGuardState(body.organizationId), body.priority ?? 'NORMAL'); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Cost Guard block' }, { status: 409 }); }
  const sentLast24Hours = await countMailboxSendsLast24Hours({ supabase, organizationId: body.organizationId, mailboxId });
  const provider = new ResendEmailProvider(); const providerHealth = await provider.health();
  const health = evaluateMailboxHealth({ enabled: Boolean(mailbox.enabled), dailyLimit: Number(mailbox.daily_limit), sentToday: sentLast24Hours, bounceRate: Number(mailbox.bounce_rate), complaintRate: Number(mailbox.complaint_rate), providerHealthy: providerHealth.ok });
  if (!health.allowed) return NextResponse.json({ error: `Mailbox health blocks sending: ${health.blocks.join(',')}` }, { status: 409 });

  const { data: claimed, error: claimError } = await supabase.from('conversation_messages').update({ status: 'PROCESSING', processed_at: new Date().toISOString() }).eq('organization_id', body.organizationId).eq('id', body.messageId).eq('status', 'APPROVED').eq('requires_approval', false).select('id').maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimed) return NextResponse.json({ error: 'Message already claimed or no longer approved' }, { status: 409 });

  let providerAccepted = false; let providerMessageId: string | null = null;
  try {
    await assertCanonicalSendAllowed({ supabase, organizationId: body.organizationId, leadId: message.lead_id, conversationId: message.conversation_id, channel: 'EMAIL', recipient, shadowModeExceptionVerified: true, marketWindowExceptionVerified: false });
    assertPaidOperationAllowed(await getCostGuardState(body.organizationId), body.priority ?? 'NORMAL');
    const result = await provider.sendEmail({ mailboxId, to: recipient, subject, text: message.original_text, html: send.html ? String(send.html) : undefined, idempotencyKey });
    providerAccepted = true; providerMessageId = result.providerMessageId;
    const nowIso = new Date().toISOString();
    const accepted = await supabase.from('conversation_messages').update({ status: 'SENT', provider_message_id: providerMessageId, sent_at: nowIso, processed_at: nowIso, approval_reason: null }).eq('organization_id', body.organizationId).eq('id', body.messageId).eq('status', 'PROCESSING');
    if (accepted.error) throw new Error(`Provider-accepted email reconciliation failed: ${accepted.error.message}`);
    const outreach = await supabase.from('outreach_messages').upsert({ organization_id: body.organizationId, lead_id: message.lead_id, mailbox_id: mailboxId, channel: 'EMAIL', direction: 'OUTBOUND', status: 'SENT', provider_message_id: providerMessageId, subject, body: message.original_text, sent_at: nowIso, metadata: { marketCode, campaignId: campaign.id, source: 'CONTROLLED_MULTI_MARKET_AUTOPILOT' } }, { onConflict: 'organization_id,provider_message_id' });
    if (outreach.error) throw new Error(`Outbound ledger reconciliation failed: ${outreach.error.message}`);
    await recordUsage({ organizationId: body.organizationId, provider: 'EMAIL_PROVIDER', operation: 'EMAIL_SEND', costUsd: 0, units: 1, metadata: { marketCode, mailboxId, campaignId: campaign.id, providerMessageId, canonicalGateVerified: true, controlledMultiMarket: true } });
    return NextResponse.json({ ok: true, action: 'SENT', marketCode, messageId: message.id, providerMessageId });
  } catch (error) {
    const text = error instanceof Error ? error.message : 'Controlled email send failed';
    if (!providerAccepted) await supabase.from('conversation_messages').update({ status: 'APPROVED', processed_at: new Date().toISOString(), approval_reason: `SEND_RETRY_REQUIRED:${text.slice(0,160)}` }).eq('organization_id', body.organizationId).eq('id', body.messageId).eq('status', 'PROCESSING');
    else await supabase.from('audit_logs').insert({ organization_id: body.organizationId, actor_type: 'SYSTEM', actor_id: 'controlled_email_send', action: 'PROVIDER_ACCEPTED_RECONCILIATION_REQUIRED', entity_type: 'conversation_message', entity_id: message.id, after_data: { marketCode, providerMessageId, error: text.slice(0,500), automaticProviderRetry: false } });
    return NextResponse.json({ error: text, providerAccepted, providerMessageId, automaticProviderRetry: false }, { status: providerAccepted ? 503 : 409 });
  }
}
