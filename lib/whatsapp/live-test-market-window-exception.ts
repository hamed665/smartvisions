import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyControlledWhatsAppPilot } from '@/lib/outreach/controlled-whatsapp-pilot';
import { evaluateInternalTestLiveReplyPolicy } from '@/lib/whatsapp/internal-test-live-reply-policy';

export async function verifyLiveTestMarketWindowException(input: {
  supabase: SupabaseClient;
  organizationId: string;
  messageStatus: string;
  requiresApproval: boolean;
  channel: string;
  metadataSource?: unknown;
  providerMessageId?: string | null;
  idempotencyKey?: unknown;
  catalogContentId?: unknown;
  sendTo?: unknown;
  messageLeadId?: string | null;
  conversationLeadId?: string | null;
  conversationChannel?: string | null;
  businessCategory?: string | null;
  businessWhatsapp?: string | null;
  businessPhone?: string | null;
  shadowMode: boolean;
  globalKillSwitch: boolean;
  agentsPaused: boolean;
  whatsappPaused: boolean;
  now?: Date;
}) {
  const verification = verifyControlledWhatsAppPilot(input);
  if (!verification.verified) return false;

  const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
  const match = idempotencyKey.match(/^agent:whatsapp-pilot:live:([0-9a-f-]{36}):shadow$/i);
  if (!match) return false;
  const inboundMessageId = match[1];

  const [{ data: rule, error: ruleError }, { data: claim, error: claimError }] = await Promise.all([
    input.supabase.from('approval_rules')
      .select('requires_approval,config')
      .eq('organization_id', input.organizationId)
      .eq('action_key', 'WHATSAPP_OUTBOUND')
      .maybeSingle(),
    input.supabase.from('audit_logs')
      .select('id,created_at')
      .eq('organization_id', input.organizationId)
      .eq('action', 'INTERNAL_TEST_LIVE_REPLY_CLAIMED')
      .eq('entity_type', 'outreach_message')
      .eq('entity_id', inboundMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (ruleError || claimError || !rule || !claim) return false;

  const policy = evaluateInternalTestLiveReplyPolicy({
    ruleRequiresApproval: Boolean(rule.requires_approval),
    ruleConfig: rule.config,
    businessCategory: input.businessCategory,
    businessWhatsapp: input.businessWhatsapp,
    businessPhone: input.businessPhone,
    inboundFrom: verification.recipient,
    shadowMode: input.shadowMode,
    globalKillSwitch: input.globalKillSwitch,
    agentsPaused: input.agentsPaused,
    whatsappPaused: input.whatsappPaused,
    claimedCount: 0,
    now: input.now,
  });
  if (!policy.allowed) return false;

  const claimMs = new Date(claim.created_at).getTime();
  const startMs = new Date(policy.startsAt).getTime();
  const endMs = new Date(policy.endsAt).getTime();
  return Number.isFinite(claimMs) && claimMs >= startMs && claimMs < endMs;
}
