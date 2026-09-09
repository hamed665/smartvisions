import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { marketDayUtcRange, isSupportedMarketCode } from '@/lib/outreach/market-profile';
import { verifyControlledEmailAutoPilot, mailboxWarmupAllowsAutomaticSend } from '@/lib/outreach/controlled-email-auto-pilot';
import { POST as controlledEmailSendPost } from '@/app/api/operations/controlled-email-send/route';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for controlled auto dispatch');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request); if (denied) return denied;
  const supabase = serviceClient(); const now = new Date();
  const { data: campaigns, error: campaignError } = await supabase.from('campaigns')
    .select('id,organization_id,status,country_code,city,industry,config,updated_at')
    .eq('status', 'RUNNING').order('updated_at', { ascending: true }).limit(50);
  if (campaignError) return NextResponse.json({ error: `Autopilot campaign lookup failed: ${campaignError.message}` }, { status: 503 });
  const eligibleCampaigns = (campaigns ?? []).filter((row) => {
    const code = String(row.country_code ?? '').toUpperCase(); const config = record(row.config);
    if (!isSupportedMarketCode(code)) return false;
    const day = marketDayUtcRange(code, now);
    return config.dailyOutreachTarget === true && config.automatedSendingEnabled === true && String(config.marketCode ?? '').toUpperCase() === code && String(config.targetDate ?? '') === day.dateKey;
  });
  if (!eligibleCampaigns.length) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'NO_ACTIVE_AUTOMATED_DAILY_TARGET' });

  for (const campaign of eligibleCampaigns) {
    const organizationId = String(campaign.organization_id); const marketCode = String(campaign.country_code).toUpperCase(); const day = marketDayUtcRange(marketCode, now); const config = record(campaign.config);
    const { data: controls } = await supabase.from('system_controls').select('global_kill_switch,agents_paused,email_paused,shadow_mode').eq('organization_id', organizationId).maybeSingle();
    if (!controls || controls.global_kill_switch || controls.agents_paused || controls.email_paused || !controls.shadow_mode) continue;
    const { data: messages, error: messagesError } = await supabase.from('conversation_messages')
      .select('id,conversation_id,lead_id,channel,status,requires_approval,metadata,provider_message_id,created_at')
      .eq('organization_id', organizationId).eq('channel', 'EMAIL').eq('direction', 'OUTBOUND')
      .in('status', ['APPROVAL_REQUIRED','APPROVED']).like('provider_message_id', 'shadow:growth-first-touch:%')
      .gte('created_at', day.startIso).lt('created_at', day.endIso).order('created_at', { ascending: true }).limit(20);
    if (messagesError) return NextResponse.json({ error: `Autopilot queue lookup failed: ${messagesError.message}` }, { status: 503 });

    for (const message of messages ?? []) {
      if (!message.lead_id || !message.conversation_id) continue;
      const metadata = record(message.metadata); const sendContext = record(metadata.send_context); const idempotencyKey = typeof metadata.idempotency_key === 'string' ? metadata.idempotency_key : null;
      if (String(sendContext.market_code ?? '').toUpperCase() !== marketCode) continue;
      const { data: conversation } = await supabase.from('sales_conversations').select('id,lead_id,channel').eq('organization_id', organizationId).eq('id', message.conversation_id).maybeSingle();
      if (!conversation) continue;
      const verification = verifyControlledEmailAutoPilot({ messageStatus: message.status, requiresApproval: Boolean(message.requires_approval), channel: message.channel, metadataSource: metadata.source, providerMessageId: message.provider_message_id, idempotencyKey, marketCode, messageLeadId: message.lead_id, conversationLeadId: conversation.lead_id, conversationChannel: conversation.channel, campaignStatus: campaign.status, campaignCountryCode: campaign.country_code, campaignConfig: config, currentMarketDateKey: day.dateKey });
      if (!verification.verified) continue;

      const mailboxId = String(sendContext.mailbox_id ?? '').trim();
      if (!mailboxId) return NextResponse.json({ ok: true, action: 'HELD_FOR_READINESS', reason: 'MAILBOX_CONTEXT_MISSING', marketCode, messageId: message.id });
      const { data: mailbox } = await supabase.from('mailboxes').select('id,enabled,warmup_status,health_status').eq('organization_id', organizationId).eq('id', mailboxId).maybeSingle();
      if (!mailbox?.enabled || String(mailbox.health_status).toUpperCase() !== 'HEALTHY' || !mailboxWarmupAllowsAutomaticSend(mailbox.warmup_status)) return NextResponse.json({ ok: true, action: 'HELD_FOR_READINESS', reason: !mailboxWarmupAllowsAutomaticSend(mailbox?.warmup_status) ? 'MAILBOX_WARMUP_NOT_READY' : 'MAILBOX_NOT_HEALTHY', marketCode, messageId: message.id, warmupStatus: mailbox?.warmup_status, healthStatus: mailbox?.health_status });

      if (message.status === 'APPROVAL_REQUIRED') {
        const { data: approved, error } = await supabase.from('conversation_messages').update({ status: 'APPROVED', requires_approval: false, approval_reason: 'SYSTEM_CONTROLLED_AUTO_APPROVAL', processed_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', message.id).eq('status', 'APPROVAL_REQUIRED').eq('requires_approval', true).select('id').maybeSingle();
        if (error) return NextResponse.json({ error: `Autopilot approval failed: ${error.message}` }, { status: 503 });
        if (!approved) continue;
        await supabase.from('audit_logs').insert({ organization_id: organizationId, actor_type: 'SYSTEM', actor_id: 'controlled_multi_market_autopilot', action: 'AUTO_APPROVE_GROWTH_FIRST_TOUCH', entity_type: 'conversation_message', entity_id: message.id, after_data: { campaignId: campaign.id, marketCode, targetDate: day.dateKey, providerSendTriggered: false } });
      }

      const internalKey = request.headers.get('x-internal-api-key');
      if (!internalKey) return NextResponse.json({ error: 'Internal authorization unavailable for autopilot dispatch' }, { status: 500 });
      const sendResponse = await controlledEmailSendPost(new Request('https://smartvisions.internal/api/operations/controlled-email-send', { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-api-key': internalKey }, body: JSON.stringify({ organizationId, messageId: message.id, priority: 'NORMAL' }) }));
      const sendBody = await sendResponse.json().catch(() => null) as Record<string, unknown> | null;
      if (!sendResponse.ok && String(sendBody?.error ?? '').includes('Outside recipient local send window')) return NextResponse.json({ ok: true, action: 'HELD_FOR_SEND_WINDOW', marketCode, messageId: message.id, send: sendBody });
      return NextResponse.json({ ok: sendResponse.ok, action: sendResponse.ok ? 'SENT' : 'SEND_BLOCKED', marketCode, messageId: message.id, sendStatus: sendResponse.status, send: sendBody }, { status: sendResponse.ok ? 200 : sendResponse.status });
    }
  }
  return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'NO_ELIGIBLE_AUTOPILOT_MESSAGE' });
}
