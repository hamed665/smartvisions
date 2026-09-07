import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { evaluateCanonicalMarketWindow } from '@/lib/outreach/canonical-market-window';
import { omanDateKey, omanDayUtcRange } from '@/lib/outreach/daily-target';
import { evidencePipelineTargetMatches } from '@/lib/operations/evidence-pipeline-policy';
import { mailboxWarmupAllowsAutomaticSend, verifyControlledEmailAutoPilot } from '@/lib/outreach/controlled-email-auto-pilot';
import { POST as approvedSendPost } from '@/app/api/outreach/approved-send/route';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for controlled auto dispatch');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;
  const supabase = serviceClient();
  const now = new Date();
  const dateKey = omanDateKey(now);
  const omanDay = omanDayUtcRange(now);

  const { data: campaign, error: campaignError } = await supabase.from('campaigns')
    .select('id,organization_id,status,country_code,city,industry,config')
    .eq('status', 'RUNNING')
    .eq('country_code', 'OM')
    .contains('config', { dailyOutreachTarget: true, targetDate: dateKey, marketCode: 'OM' })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: `Autopilot campaign lookup failed: ${campaignError.message}` }, { status: 503 });
  if (!campaign) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'NO_ACTIVE_AUTOMATED_DAILY_TARGET' });

  const organizationId = String(campaign.organization_id);
  const campaignConfig = record(campaign.config);
  const { data: controls, error: controlsError } = await supabase.from('system_controls')
    .select('global_kill_switch,agents_paused,email_paused,shadow_mode')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (controlsError || !controls) return NextResponse.json({ error: controlsError?.message ?? 'Runtime controls unavailable' }, { status: 503 });
  if (controls.global_kill_switch || controls.agents_paused || controls.email_paused || !controls.shadow_mode) {
    return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'RUNTIME_SAFETY_CONTROLS_BLOCKED' });
  }

  const { data: messages, error: messagesError } = await supabase.from('conversation_messages')
    .select('id,conversation_id,lead_id,channel,status,requires_approval,metadata,provider_message_id,created_at')
    .eq('organization_id', organizationId)
    .eq('channel', 'EMAIL')
    .eq('direction', 'OUTBOUND')
    .in('status', ['APPROVAL_REQUIRED', 'APPROVED'])
    .like('provider_message_id', 'shadow:growth-first-touch:%')
    .gte('created_at', omanDay.startIso)
    .lt('created_at', omanDay.endIso)
    .order('created_at', { ascending: true })
    .limit(10);
  if (messagesError) return NextResponse.json({ error: `Autopilot queue lookup failed: ${messagesError.message}` }, { status: 503 });

  for (const message of messages ?? []) {
    if (!message.lead_id || !message.conversation_id) continue;
    const metadata = record(message.metadata);
    const sendContext = record(metadata.send_context);
    const idempotencyKey = typeof metadata.idempotency_key === 'string' ? metadata.idempotency_key : null;

    const [{ data: lead, error: leadError }, { data: conversation, error: conversationError }] = await Promise.all([
      supabase.from('leads').select('id,business_id,status,agent_mode').eq('organization_id', organizationId).eq('id', message.lead_id).maybeSingle(),
      supabase.from('sales_conversations').select('id,lead_id,channel').eq('organization_id', organizationId).eq('id', message.conversation_id).maybeSingle(),
    ]);
    if (leadError || conversationError || !lead?.business_id || !conversation) continue;
    const { data: business, error: businessError } = await supabase.from('businesses')
      .select('id,city,category,formatted_address,google_primary_type_display_name')
      .eq('organization_id', organizationId)
      .eq('id', lead.business_id)
      .maybeSingle();
    if (businessError || !business) continue;
    if (!evidencePipelineTargetMatches({
      targetCity: campaign.city,
      targetIndustry: campaign.industry,
      businessCity: business.city,
      formattedAddress: business.formatted_address,
      category: business.category,
      primaryType: business.google_primary_type_display_name,
    })) continue;

    const verification = verifyControlledEmailAutoPilot({
      messageStatus: message.status,
      requiresApproval: Boolean(message.requires_approval),
      channel: message.channel,
      metadataSource: metadata.source,
      providerMessageId: message.provider_message_id,
      idempotencyKey,
      marketCode: String(sendContext.market_code ?? ''),
      messageLeadId: message.lead_id,
      conversationLeadId: conversation.lead_id,
      conversationChannel: conversation.channel,
      campaignStatus: campaign.status,
      campaignCountryCode: campaign.country_code,
      campaignConfig,
      currentOmanDateKey: dateKey,
    });
    if (!verification.verified) continue;

    if (message.status === 'APPROVAL_REQUIRED') {
      const { data: approved, error: approvalError } = await supabase.from('conversation_messages')
        .update({
          status: 'APPROVED',
          requires_approval: false,
          approval_reason: 'SYSTEM_CONTROLLED_AUTO_APPROVAL',
          processed_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .eq('id', message.id)
        .eq('status', 'APPROVAL_REQUIRED')
        .eq('requires_approval', true)
        .select('id')
        .maybeSingle();
      if (approvalError) return NextResponse.json({ error: `Autopilot approval failed: ${approvalError.message}` }, { status: 503 });
      if (!approved) continue;
      const { error: auditError } = await supabase.from('audit_logs').insert({
        organization_id: organizationId,
        actor_type: 'SYSTEM',
        actor_id: 'controlled_oman_autopilot',
        action: 'AUTO_APPROVE_GROWTH_FIRST_TOUCH',
        entity_type: 'conversation_message',
        entity_id: message.id,
        after_data: { campaignId: campaign.id, marketCode: 'OM', targetDate: dateKey, providerSendTriggered: false },
      });
      if (auditError) return NextResponse.json({ error: `Autopilot approval audit failed: ${auditError.message}` }, { status: 503 });
    }

    const { data: market, error: marketError } = await supabase.from('market_settings')
      .select('enabled,timezone,send_window_start,send_window_end')
      .eq('organization_id', organizationId)
      .eq('country_code', 'OM')
      .maybeSingle();
    if (marketError || !market) return NextResponse.json({ error: `Canonical market settings unavailable: ${marketError?.message ?? 'not found'}` }, { status: 503 });
    const window = evaluateCanonicalMarketWindow({
      marketEnabled: Boolean(market.enabled),
      marketTimezone: String(market.timezone),
      leadTimezone: String(sendContext.lead_timezone ?? '') || null,
      start: String(market.send_window_start),
      end: String(market.send_window_end),
      nowUtc: now,
    });
    if (!window.allowed) return NextResponse.json({ ok: true, action: 'HELD_FOR_SEND_WINDOW', reason: window.reason, messageId: message.id, window });

    const mailboxId = String(sendContext.mailbox_id ?? '').trim();
    if (!mailboxId) return NextResponse.json({ ok: true, action: 'HELD_FOR_READINESS', reason: 'MAILBOX_CONTEXT_MISSING', messageId: message.id });
    const { data: mailbox, error: mailboxError } = await supabase.from('mailboxes')
      .select('id,enabled,warmup_status,health_status')
      .eq('organization_id', organizationId)
      .eq('id', mailboxId)
      .maybeSingle();
    if (mailboxError || !mailbox) return NextResponse.json({ error: `Autopilot mailbox lookup failed: ${mailboxError?.message ?? 'not found'}` }, { status: 503 });
    if (!mailbox.enabled || String(mailbox.health_status).toUpperCase() !== 'HEALTHY' || !mailboxWarmupAllowsAutomaticSend(mailbox.warmup_status)) {
      return NextResponse.json({
        ok: true,
        action: 'HELD_FOR_READINESS',
        reason: !mailboxWarmupAllowsAutomaticSend(mailbox.warmup_status) ? 'MAILBOX_WARMUP_NOT_READY' : 'MAILBOX_NOT_HEALTHY',
        messageId: message.id,
        warmupStatus: mailbox.warmup_status,
        healthStatus: mailbox.health_status,
      });
    }

    const internalKey = request.headers.get('x-internal-api-key');
    if (!internalKey) return NextResponse.json({ error: 'Internal authorization unavailable for autopilot dispatch' }, { status: 500 });
    const sendResponse = await approvedSendPost(new Request('https://smartvisions.internal/api/outreach/approved-send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-api-key': internalKey },
      body: JSON.stringify({ organizationId, messageId: message.id, priority: 'NORMAL', controlledEmailPilot: true }),
    }));
    const sendBody = await sendResponse.json().catch(() => null);
    return NextResponse.json({
      ok: sendResponse.ok,
      action: sendResponse.ok ? 'SENT' : 'SEND_BLOCKED',
      messageId: message.id,
      sendStatus: sendResponse.status,
      send: sendBody,
    }, { status: sendResponse.ok ? 200 : sendResponse.status });
  }

  return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'NO_ELIGIBLE_AUTOPILOT_MESSAGE' });
}
