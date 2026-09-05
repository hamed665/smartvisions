import { createClient } from '@supabase/supabase-js';
import { POST as processInboundPost } from '@/app/api/ai/process-inbound/route';
import { POST as approvedSendPost } from '@/app/api/outreach/approved-send/route';
import { POST as channelGuardPost } from '@/app/api/operations/channel-guard/route';
import { stableAgentRequestKey } from '@/lib/operations/executor-core';
import { queueShadowDraft, shadowProviderMessageId } from '@/lib/outreach/shadow-approval';
import { verifyControlledWhatsAppPilot } from '@/lib/outreach/controlled-whatsapp-pilot';
import { evaluateInternalTestLiveReplyPolicy } from '@/lib/whatsapp/internal-test-live-reply-policy';

export type InternalTestLiveReplyResult = {
  attempted: boolean;
  sent: boolean;
  reason: string;
  messageId?: string;
  runId?: string;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for internal live reply');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function internalJsonRequest(path: string, internalKey: string, body: unknown) {
  return new Request(`https://growth-os.internal${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-api-key': internalKey,
    },
    body: JSON.stringify(body),
  });
}

function agentData(trace: Record<string, unknown>, agentName: string) {
  const results = Array.isArray(trace.agentResults) ? trace.agentResults : [];
  const match = results.find((item) => record(item).agent === agentName);
  return record(record(match).data);
}

async function audit(input: {
  organizationId: string;
  action: string;
  entityId: string;
  afterData: Record<string, unknown>;
}) {
  const { error } = await serviceClient().from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_type: 'SYSTEM',
    actor_id: 'whatsapp_webhook_live_test',
    action: input.action,
    entity_type: 'outreach_message',
    entity_id: input.entityId,
    after_data: input.afterData,
  });
  if (error) throw new Error(`Internal live reply audit failed: ${error.message}`);
}

export async function runInternalTestLiveReply(input: {
  organizationId: string;
  providerMessageId: string;
  inboundFrom: string;
  messageType: string;
  now?: Date;
}): Promise<InternalTestLiveReplyResult> {
  if (input.messageType.toLowerCase() !== 'text') {
    return { attempted: false, sent: false, reason: 'TEXT_ONLY_LIVE_TEST' };
  }

  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) return { attempted: false, sent: false, reason: 'INTERNAL_API_KEY_UNAVAILABLE' };

  const supabase = serviceClient();
  const { data: inbound, error: inboundError } = await supabase.from('outreach_messages')
    .select('id,lead_id,body,provider_message_id,received_at,metadata')
    .eq('organization_id', input.organizationId)
    .eq('channel', 'WHATSAPP')
    .eq('direction', 'INBOUND')
    .eq('provider_message_id', input.providerMessageId)
    .maybeSingle();
  if (inboundError || !inbound?.id || !inbound.lead_id || !inbound.body) {
    return { attempted: false, sent: false, reason: 'DURABLE_INBOUND_NOT_READY' };
  }

  const conversationId = stringValue(record(inbound.metadata).conversation_id);
  if (!conversationId) return { attempted: false, sent: false, reason: 'CONVERSATION_LINKAGE_MISSING' };

  const [{ data: rule, error: ruleError }, { data: controls, error: controlsError }, { data: lead, error: leadError }] = await Promise.all([
    supabase.from('approval_rules')
      .select('requires_approval,config')
      .eq('organization_id', input.organizationId)
      .eq('action_key', 'WHATSAPP_OUTBOUND')
      .maybeSingle(),
    supabase.from('system_controls')
      .select('global_kill_switch,agents_paused,whatsapp_ai_paused,shadow_mode')
      .eq('organization_id', input.organizationId)
      .maybeSingle(),
    supabase.from('leads')
      .select('id,business_id,status,agent_mode')
      .eq('organization_id', input.organizationId)
      .eq('id', inbound.lead_id)
      .maybeSingle(),
  ]);
  if (ruleError || controlsError || leadError || !rule || !controls || !lead?.business_id) {
    return { attempted: false, sent: false, reason: 'LIVE_TEST_CANONICAL_STATE_UNAVAILABLE' };
  }

  const [{ data: business, error: businessError }, { data: conversation, error: conversationError }] = await Promise.all([
    supabase.from('businesses')
      .select('id,name,country_code,category,whatsapp,phone,international_phone')
      .eq('organization_id', input.organizationId)
      .eq('id', lead.business_id)
      .maybeSingle(),
    supabase.from('sales_conversations')
      .select('id,lead_id,channel,agent_mode,requires_human')
      .eq('organization_id', input.organizationId)
      .eq('id', conversationId)
      .maybeSingle(),
  ]);
  if (businessError || conversationError || !business || !conversation) {
    return { attempted: false, sent: false, reason: 'LIVE_TEST_LINKAGE_UNAVAILABLE' };
  }
  if (conversation.lead_id !== inbound.lead_id || conversation.channel !== 'WHATSAPP') {
    return { attempted: false, sent: false, reason: 'LIVE_TEST_LINKAGE_MISMATCH' };
  }
  if (Boolean(conversation.requires_human) || ['HUMAN', 'PAUSED'].includes(String(conversation.agent_mode ?? '').toUpperCase())) {
    return { attempted: false, sent: false, reason: 'CONVERSATION_AUTOMATION_BLOCKED' };
  }
  if (['DO_NOT_CONTACT', 'WON', 'LOST'].includes(String(lead.status ?? '').toUpperCase()) || ['HUMAN', 'PAUSED'].includes(String(lead.agent_mode ?? '').toUpperCase())) {
    return { attempted: false, sent: false, reason: 'LEAD_AUTOMATION_BLOCKED' };
  }

  const initialPolicy = evaluateInternalTestLiveReplyPolicy({
    ruleRequiresApproval: Boolean(rule.requires_approval),
    ruleConfig: rule.config,
    businessCategory: business.category,
    businessWhatsapp: business.whatsapp,
    businessPhone: business.phone ?? business.international_phone,
    inboundFrom: input.inboundFrom,
    shadowMode: Boolean(controls.shadow_mode),
    globalKillSwitch: Boolean(controls.global_kill_switch),
    agentsPaused: Boolean(controls.agents_paused),
    whatsappPaused: Boolean(controls.whatsapp_ai_paused),
    claimedCount: 0,
    now: input.now,
  });
  if (!initialPolicy.allowed) return { attempted: false, sent: false, reason: initialPolicy.reason };

  const [{ count: duplicateClaim, error: duplicateClaimError }, { count: claimedCount, error: claimedCountError }] = await Promise.all([
    supabase.from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', input.organizationId)
      .eq('action', 'INTERNAL_TEST_LIVE_REPLY_CLAIMED')
      .eq('entity_type', 'outreach_message')
      .eq('entity_id', String(inbound.id)),
    supabase.from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', input.organizationId)
      .eq('action', 'INTERNAL_TEST_LIVE_REPLY_CLAIMED')
      .gte('created_at', initialPolicy.startsAt)
      .lt('created_at', initialPolicy.endsAt),
  ]);
  if (duplicateClaimError || claimedCountError) {
    return { attempted: false, sent: false, reason: 'LIVE_TEST_CLAIM_LEDGER_UNAVAILABLE' };
  }
  if ((duplicateClaim ?? 0) > 0) return { attempted: false, sent: false, reason: 'LIVE_TEST_INBOUND_ALREADY_CLAIMED' };

  const policy = evaluateInternalTestLiveReplyPolicy({
    ruleRequiresApproval: Boolean(rule.requires_approval),
    ruleConfig: rule.config,
    businessCategory: business.category,
    businessWhatsapp: business.whatsapp,
    businessPhone: business.phone ?? business.international_phone,
    inboundFrom: input.inboundFrom,
    shadowMode: Boolean(controls.shadow_mode),
    globalKillSwitch: Boolean(controls.global_kill_switch),
    agentsPaused: Boolean(controls.agents_paused),
    whatsappPaused: Boolean(controls.whatsapp_ai_paused),
    claimedCount: Number(claimedCount ?? 0),
    now: input.now,
  });
  if (!policy.allowed) return { attempted: false, sent: false, reason: policy.reason };

  const requestKey = stableAgentRequestKey('WHATSAPP', input.providerMessageId);
  const { data: existingRun, error: existingRunError } = await supabase.from('agent_runs')
    .select('id,status')
    .eq('organization_id', input.organizationId)
    .eq('request_key', requestKey)
    .maybeSingle();
  if (existingRunError) return { attempted: false, sent: false, reason: 'AGENT_REPLAY_STATE_UNAVAILABLE' };
  if (existingRun) return { attempted: false, sent: false, reason: `AGENT_ALREADY_${existingRun.status}` };

  const guard = await channelGuardPost(internalJsonRequest('/api/operations/channel-guard', internalKey, {
    organizationId: input.organizationId,
    channel: 'WHATSAPP',
  }));
  if (!guard.ok) return { attempted: false, sent: false, reason: `CHANNEL_GUARD_${guard.status}` };

  await audit({
    organizationId: input.organizationId,
    action: 'INTERNAL_TEST_LIVE_REPLY_CLAIMED',
    entityId: String(inbound.id),
    afterData: {
      providerMessageId: input.providerMessageId,
      windowStartsAt: policy.startsAt,
      windowEndsAt: policy.endsAt,
      maxReplies: policy.maxReplies,
      shadowModeRemainsOn: true,
      automaticRetry: false,
    },
  });

  const agentResponse = await processInboundPost(internalJsonRequest('/api/ai/process-inbound', internalKey, {
    idempotencyKey: requestKey,
    context: {
      organizationId: input.organizationId,
      leadId: inbound.lead_id,
      conversationId,
      message: String(inbound.body),
    },
  }));
  const payload = await agentResponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!agentResponse.ok || agentResponse.status === 202 || payload.replayed === true) {
    return {
      attempted: true,
      sent: false,
      reason: agentResponse.status === 202 ? 'AGENT_RECONCILIATION_REQUIRED' : `AGENT_HTTP_${agentResponse.status}`,
      runId: stringValue(payload.runId),
    };
  }

  const draft = record(payload.draft);
  const trace = record(payload.trace);
  const decision = record(trace.decision);
  if (trace.delivery !== 'REVIEW' || decision.requiresHuman === true || record(payload.handoffState).persisted === true) {
    return { attempted: true, sent: false, reason: 'AGENT_RESULT_NOT_AUTO_SEND_ELIGIBLE', runId: stringValue(payload.runId) };
  }
  const draftText = stringValue(draft.text);
  const replyLanguage = stringValue(draft.language);
  if (!draftText || !replyLanguage) {
    return { attempted: true, sent: false, reason: 'AGENT_DRAFT_INVALID', runId: stringValue(payload.runId) };
  }

  const secretary = agentData(trace, 'secretary');
  const culture = agentData(trace, 'culture_locale');
  const catalog = record(payload.catalogRecommendation);
  const catalogContentId = stringValue(catalog.contentId);
  const idempotencyKey = `agent:whatsapp-pilot:live:${inbound.id}:shadow`;
  const queued = await queueShadowDraft({
    organizationId: input.organizationId,
    conversationId,
    leadId: String(inbound.lead_id),
    channel: 'WHATSAPP',
    draft: draftText,
    idempotencyKey,
    to: policy.recipient,
    marketCode: String(business.country_code ?? 'OM').toUpperCase(),
    leadTimezone: String(business.country_code ?? '').toUpperCase() === 'OM' ? 'Asia/Muscat' : undefined,
    lastCustomerMessageAt: stringValue(inbound.received_at),
    catalogContentId,
    replyLanguage,
    replyDialect: stringValue(culture.reply_dialect) ?? stringValue(culture.dialect),
    persianTranslation: stringValue(secretary.operator_persian_translation),
    persianSummary: stringValue(secretary.operator_persian_summary),
    rememberCustomerLanguage: true,
  });
  if (queued.duplicate) {
    return { attempted: true, sent: false, reason: 'CONTROLLED_DRAFT_ALREADY_EXISTS', messageId: String(queued.messageId), runId: stringValue(payload.runId) };
  }

  const shadowId = shadowProviderMessageId(idempotencyKey);
  const { data: approved, error: approveError } = await supabase.from('conversation_messages')
    .update({
      status: 'APPROVED',
      requires_approval: false,
      approval_reason: 'INTERNAL_TEST_LIVE_WINDOW_AUTO_APPROVAL',
    })
    .eq('organization_id', input.organizationId)
    .eq('id', queued.messageId)
    .eq('status', 'APPROVAL_REQUIRED')
    .eq('requires_approval', true)
    .eq('provider_message_id', shadowId)
    .select('id,status,requires_approval,channel,lead_id,conversation_id,provider_message_id,metadata')
    .maybeSingle();
  if (approveError || !approved) {
    return { attempted: true, sent: false, reason: 'CONTROLLED_AUTO_APPROVAL_FAILED', messageId: String(queued.messageId), runId: stringValue(payload.runId) };
  }

  const metadata = record(approved.metadata);
  const sendContext = record(metadata.send_context);
  const verification = verifyControlledWhatsAppPilot({
    messageStatus: approved.status,
    requiresApproval: Boolean(approved.requires_approval),
    channel: approved.channel,
    metadataSource: metadata.source,
    providerMessageId: approved.provider_message_id,
    idempotencyKey: metadata.idempotency_key,
    catalogContentId: sendContext.catalog_content_id,
    sendTo: sendContext.to,
    messageLeadId: approved.lead_id,
    conversationLeadId: conversation.lead_id,
    conversationChannel: conversation.channel,
    businessCategory: business.category,
    businessWhatsapp: business.whatsapp,
    businessPhone: business.phone ?? business.international_phone,
  });
  if (!verification.verified) {
    await supabase.from('conversation_messages').update({
      status: 'BLOCKED',
      approval_reason: `INTERNAL_TEST_LIVE_VERIFICATION_FAILED:${verification.reason}`,
    }).eq('organization_id', input.organizationId).eq('id', approved.id).eq('status', 'APPROVED');
    return { attempted: true, sent: false, reason: verification.reason, messageId: String(approved.id), runId: stringValue(payload.runId) };
  }

  const sendResponse = await approvedSendPost(internalJsonRequest('/api/outreach/approved-send', internalKey, {
    organizationId: input.organizationId,
    messageId: approved.id,
    priority: 'LOW',
    controlledShadowPilot: true,
  }));
  const sendPayload = await sendResponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!sendResponse.ok) {
    const { data: current } = await supabase.from('conversation_messages')
      .select('status')
      .eq('organization_id', input.organizationId)
      .eq('id', approved.id)
      .maybeSingle();
    if (current?.status === 'APPROVED') {
      await supabase.from('conversation_messages').update({
        status: 'BLOCKED',
        approval_reason: `INTERNAL_TEST_LIVE_SEND_BLOCKED:HTTP_${sendResponse.status}`,
      }).eq('organization_id', input.organizationId).eq('id', approved.id).eq('status', 'APPROVED');
    }
    return {
      attempted: true,
      sent: false,
      reason: stringValue(sendPayload.error) ?? `APPROVED_SEND_HTTP_${sendResponse.status}`,
      messageId: String(approved.id),
      runId: stringValue(payload.runId),
    };
  }

  try {
    await audit({
      organizationId: input.organizationId,
      action: 'INTERNAL_TEST_LIVE_REPLY_SENT',
      entityId: String(inbound.id),
      afterData: {
        messageId: approved.id,
        runId: payload.runId ?? null,
        controlledShadowPilot: true,
        shadowModeRemainsOn: true,
        automaticRetry: false,
        responseStatus: sendResponse.status,
      },
    });
  } catch {
    // Provider/send ledger is authoritative. Never turn a successful send into a retry because audit logging failed.
  }

  return {
    attempted: true,
    sent: true,
    reason: sendResponse.status === 202 ? 'SENT_RECONCILIATION_ATTENTION' : 'SENT',
    messageId: String(approved.id),
    runId: stringValue(payload.runId),
  };
}
