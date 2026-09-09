import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateCanonicalMarketWindow } from '@/lib/outreach/canonical-market-window';
import { evaluateWhatsAppSendPolicy } from '@/lib/whatsapp/policy';
import { getWhatsAppMarketingPermission } from '@/lib/whatsapp/marketing-opt-in';

export type CanonicalSendChannel = 'EMAIL' | 'WHATSAPP';

export type CanonicalSendSafetySnapshot = {
  channel: CanonicalSendChannel;
  globalKillSwitch: boolean;
  channelPaused: boolean;
  agentsPaused: boolean;
  shadowMode: boolean;
  shadowModeExceptionVerified?: boolean;
  ownerManualSendVerified?: boolean;
  leadStatus?: string | null;
  leadAgentMode?: string | null;
  conversationStage?: string | null;
  conversationAgentMode?: string | null;
  conversationRequiresHuman?: boolean;
  recipientMatchesCanonicalBusiness: boolean;
  suppressed: boolean;
  marketWindowAllowed: boolean;
  whatsappPolicyAllowed?: boolean;
};

export function evaluateCanonicalSendSafety(input: CanonicalSendSafetySnapshot) {
  const blocks: string[] = [];
  if (input.globalKillSwitch) blocks.push('GLOBAL_KILL_SWITCH');
  if (input.channelPaused) blocks.push('CHANNEL_PAUSED');
  if (input.agentsPaused) blocks.push('AGENTS_PAUSED');
  if (input.shadowMode && !input.shadowModeExceptionVerified && !input.ownerManualSendVerified) blocks.push('SHADOW_MODE_ENABLED');
  if (input.leadStatus === 'DO_NOT_CONTACT') blocks.push('DO_NOT_CONTACT');
  const humanTakeover = input.leadAgentMode === 'HUMAN'
    || input.conversationAgentMode === 'HUMAN'
    || input.conversationRequiresHuman;
  const fullHumanTakeover = input.leadAgentMode === 'HUMAN'
    && input.conversationAgentMode === 'HUMAN'
    && input.conversationRequiresHuman === true;
  if (input.ownerManualSendVerified && !fullHumanTakeover) blocks.push('OWNER_MANUAL_REQUIRES_HUMAN_TAKEOVER');
  if (humanTakeover && !input.ownerManualSendVerified) blocks.push('HUMAN_TAKEOVER');
  if (input.leadAgentMode === 'PAUSED' || input.conversationAgentMode === 'PAUSED' || input.conversationStage === 'PAUSED') blocks.push('AGENT_PAUSED');
  if (input.conversationStage === 'DO_NOT_CONTACT') blocks.push('CONVERSATION_DO_NOT_CONTACT');
  if (input.conversationStage === 'SPAM') blocks.push('CONVERSATION_SPAM');
  if (!input.recipientMatchesCanonicalBusiness) blocks.push('RECIPIENT_MISMATCH');
  if (input.suppressed) blocks.push('SUPPRESSED_RECIPIENT');
  if (!input.marketWindowAllowed) blocks.push('OUTSIDE_CANONICAL_MARKET_WINDOW');
  if (input.channel === 'WHATSAPP' && input.whatsappPolicyAllowed === false) blocks.push('WHATSAPP_24H_POLICY');
  return { allowed: blocks.length === 0, blocks };
}

export function normalizeCanonicalEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function normalizeCanonicalPhone(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function latestInboundTimestamp(...values: Array<string | null | undefined>) {
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed) && parsed > latestMs) latestMs = parsed;
  }
  return Number.isFinite(latestMs) ? new Date(latestMs).toISOString() : null;
}

type AssertCanonicalSendAllowedInput = {
  supabase: SupabaseClient;
  organizationId: string;
  leadId: string;
  conversationId: string;
  channel: CanonicalSendChannel;
  recipient: string;
  templateName?: string | null;
  shadowModeExceptionVerified?: boolean;
  ownerManualSendVerified?: boolean;
  marketWindowExceptionVerified?: boolean;
  nowUtc?: Date;
};

export async function assertCanonicalSendAllowed(input: AssertCanonicalSendAllowedInput) {
  const { supabase, organizationId, leadId, conversationId, channel } = input;
  if (!organizationId || !leadId || !conversationId) throw new Error('CANONICAL_SEND_LINKAGE_REQUIRED');

  const [{ data: controls, error: controlsError }, { data: lead, error: leadError }, { data: conversation, error: conversationError }] = await Promise.all([
    supabase.from('system_controls')
      .select('global_kill_switch,email_paused,whatsapp_ai_paused,agents_paused,shadow_mode')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase.from('leads')
      .select('id,business_id,status,agent_mode')
      .eq('organization_id', organizationId)
      .eq('id', leadId)
      .maybeSingle(),
    supabase.from('sales_conversations')
      .select('id,lead_id,channel,agent_mode,stage,requires_human')
      .eq('organization_id', organizationId)
      .eq('id', conversationId)
      .maybeSingle(),
  ]);

  if (controlsError || !controls) throw new Error(`CANONICAL_RUNTIME_CONTROLS_UNAVAILABLE:${controlsError?.message ?? 'not found'}`);
  if (leadError || !lead) throw new Error(`CANONICAL_LEAD_UNAVAILABLE:${leadError?.message ?? 'not found'}`);
  if (conversationError || !conversation) throw new Error(`CANONICAL_CONVERSATION_UNAVAILABLE:${conversationError?.message ?? 'not found'}`);
  if (!lead.business_id) throw new Error('CANONICAL_BUSINESS_LINKAGE_REQUIRED');
  if (conversation.lead_id !== leadId) throw new Error('CANONICAL_CONVERSATION_LEAD_MISMATCH');
  if (conversation.channel !== channel) throw new Error('CANONICAL_CONVERSATION_CHANNEL_MISMATCH');

  const { data: business, error: businessError } = await supabase.from('businesses')
    .select('id,country_code,email,whatsapp,phone')
    .eq('organization_id', organizationId)
    .eq('id', lead.business_id)
    .maybeSingle();
  if (businessError || !business) throw new Error(`CANONICAL_BUSINESS_UNAVAILABLE:${businessError?.message ?? 'not found'}`);

  const marketCode = String(business.country_code ?? '').trim().toUpperCase();
  if (!marketCode) throw new Error('CANONICAL_MARKET_CODE_REQUIRED');
  const { data: market, error: marketError } = await supabase.from('market_settings')
    .select('enabled,timezone,send_window_start,send_window_end')
    .eq('organization_id', organizationId)
    .eq('country_code', marketCode)
    .maybeSingle();
  if (marketError || !market) throw new Error(`CANONICAL_MARKET_UNAVAILABLE:${marketError?.message ?? 'not found'}`);

  const recipientEmail = normalizeCanonicalEmail(input.recipient);
  const recipientPhone = normalizeCanonicalPhone(input.recipient);
  const businessEmail = normalizeCanonicalEmail(business.email);
  const businessPhones = [normalizeCanonicalPhone(business.whatsapp), normalizeCanonicalPhone(business.phone)].filter((value) => value.length >= 8);
  const recipientMatchesCanonicalBusiness = channel === 'EMAIL'
    ? Boolean(recipientEmail && businessEmail && recipientEmail === businessEmail)
    : recipientPhone.length >= 8 && businessPhones.includes(recipientPhone);

  let suppressed = false;
  if (channel === 'EMAIL' && recipientEmail) {
    const domain = recipientEmail.split('@')[1] ?? '';
    const [{ data: emailSuppression, error: emailSuppressionError }, { data: domainSuppression, error: domainSuppressionError }] = await Promise.all([
      supabase.from('suppression_list').select('id').eq('organization_id', organizationId).ilike('email', recipientEmail).limit(1).maybeSingle(),
      domain
        ? supabase.from('suppression_list').select('id').eq('organization_id', organizationId).ilike('domain', domain).limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (emailSuppressionError || domainSuppressionError) throw new Error(`CANONICAL_SUPPRESSION_UNAVAILABLE:${emailSuppressionError?.message ?? domainSuppressionError?.message}`);
    suppressed = Boolean(emailSuppression || domainSuppression);
  } else if (channel === 'WHATSAPP' && recipientPhone) {
    const { data: phoneSuppressions, error: phoneSuppressionError } = await supabase.from('suppression_list')
      .select('phone')
      .eq('organization_id', organizationId)
      .not('phone', 'is', null)
      .limit(10_000);
    if (phoneSuppressionError) throw new Error(`CANONICAL_SUPPRESSION_UNAVAILABLE:${phoneSuppressionError.message}`);
    if ((phoneSuppressions ?? []).length >= 10_000) throw new Error('CANONICAL_SUPPRESSION_SCAN_SATURATED');
    suppressed = (phoneSuppressions ?? []).some((row) => normalizeCanonicalPhone(row.phone) === recipientPhone);
  }

  const marketWindow = evaluateCanonicalMarketWindow({
    marketEnabled: Boolean(market.enabled),
    marketTimezone: String(market.timezone),
    start: String(market.send_window_start),
    end: String(market.send_window_end),
    nowUtc: input.nowUtc,
  });

  let whatsappPolicy: ReturnType<typeof evaluateWhatsAppSendPolicy> | null = null;
  let whatsappMarketingPermission: Awaited<ReturnType<typeof getWhatsAppMarketingPermission>> | null = null;
  let lastInboundAt: string | null = null;
  if (channel === 'WHATSAPP') {
    const [conversationInboundResult, outreachInboundResult] = await Promise.all([
      supabase.from('conversation_messages')
        .select('created_at')
        .eq('organization_id', organizationId)
        .eq('conversation_id', conversationId)
        .eq('channel', 'WHATSAPP')
        .eq('direction', 'INBOUND')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('outreach_messages')
        .select('received_at')
        .eq('organization_id', organizationId)
        .eq('lead_id', leadId)
        .eq('channel', 'WHATSAPP')
        .eq('direction', 'INBOUND')
        .not('provider_message_id', 'is', null)
        .not('received_at', 'is', null)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (conversationInboundResult.error) throw new Error(`CANONICAL_WHATSAPP_INBOUND_UNAVAILABLE:${conversationInboundResult.error.message}`);
    if (outreachInboundResult.error) throw new Error(`CANONICAL_WHATSAPP_LEDGER_UNAVAILABLE:${outreachInboundResult.error.message}`);
    lastInboundAt = latestInboundTimestamp(
      conversationInboundResult.data?.created_at,
      outreachInboundResult.data?.received_at,
    );
    if (input.templateName?.trim()) {
      whatsappMarketingPermission = await getWhatsAppMarketingPermission({
        supabase,
        organizationId,
        leadId,
        recipient: input.recipient,
      });
    }
    whatsappPolicy = evaluateWhatsAppSendPolicy({
      lastCustomerMessageAt: lastInboundAt ?? undefined,
      templateName: input.templateName ?? undefined,
      marketingOptInVerified: whatsappMarketingPermission?.allowed === true,
      now: input.nowUtc,
    });
  }

  const marketWindowAllowed = Boolean(market.enabled)
    && (marketWindow.allowed || Boolean(input.marketWindowExceptionVerified));

  const safety = evaluateCanonicalSendSafety({
    channel,
    globalKillSwitch: Boolean(controls.global_kill_switch),
    channelPaused: channel === 'EMAIL' ? Boolean(controls.email_paused) : Boolean(controls.whatsapp_ai_paused),
    agentsPaused: Boolean(controls.agents_paused),
    shadowMode: Boolean(controls.shadow_mode),
    shadowModeExceptionVerified: input.shadowModeExceptionVerified,
    ownerManualSendVerified: input.ownerManualSendVerified,
    leadStatus: lead.status,
    leadAgentMode: lead.agent_mode,
    conversationStage: conversation.stage,
    conversationAgentMode: conversation.agent_mode,
    conversationRequiresHuman: Boolean(conversation.requires_human),
    recipientMatchesCanonicalBusiness,
    suppressed,
    marketWindowAllowed,
    whatsappPolicyAllowed: whatsappPolicy?.allowed,
  });

  if (!safety.allowed) throw new Error(`CANONICAL_SEND_BLOCKED:${safety.blocks.join(',')}`);
  return {
    marketCode,
    marketWindow,
    whatsappPolicy,
    whatsappMarketingPermission,
    lastInboundAt,
    canonicalRecipient: channel === 'EMAIL' ? businessEmail : recipientPhone,
  };
}
