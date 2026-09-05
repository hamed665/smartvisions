export type InternalTestLiveReplyPolicyInput = {
  ruleRequiresApproval: boolean;
  ruleConfig: unknown;
  businessCategory?: string | null;
  businessWhatsapp?: string | null;
  businessPhone?: string | null;
  inboundFrom?: string | null;
  shadowMode: boolean;
  globalKillSwitch: boolean;
  agentsPaused: boolean;
  whatsappPaused: boolean;
  claimedCount: number;
  now?: Date;
};

export type InternalTestLiveReplyPolicy =
  | {
      allowed: true;
      recipient: string;
      startsAt: string;
      endsAt: string;
      maxReplies: number;
    }
  | { allowed: false; reason: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeInternalTestPhone(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function evaluateInternalTestLiveReplyPolicy(
  input: InternalTestLiveReplyPolicyInput,
): InternalTestLiveReplyPolicy {
  if (!input.ruleRequiresApproval) return { allowed: false, reason: 'GLOBAL_WHATSAPP_APPROVAL_RULE_MUST_REMAIN_ON' };
  if (!input.shadowMode) return { allowed: false, reason: 'SHADOW_MODE_REQUIRED' };
  if (input.globalKillSwitch) return { allowed: false, reason: 'GLOBAL_KILL_SWITCH' };
  if (input.agentsPaused) return { allowed: false, reason: 'AGENTS_PAUSED' };
  if (input.whatsappPaused) return { allowed: false, reason: 'WHATSAPP_PAUSED' };

  const config = record(record(input.ruleConfig).internalTestLiveReply);
  if (config.enabled !== true) return { allowed: false, reason: 'LIVE_TEST_DISABLED' };

  const configuredRecipient = normalizeInternalTestPhone(config.recipient);
  const businessRecipient = normalizeInternalTestPhone(input.businessWhatsapp || input.businessPhone);
  const inboundFrom = normalizeInternalTestPhone(input.inboundFrom);
  if (businessRecipient.length < 8 || inboundFrom.length < 8) {
    return { allowed: false, reason: 'RECIPIENT_UNAVAILABLE' };
  }

  const businessCategory = String(input.businessCategory ?? '').toUpperCase();
  if (businessCategory === 'INTERNAL_TEST') {
    if (configuredRecipient.length < 8) return { allowed: false, reason: 'RECIPIENT_UNAVAILABLE' };
    if (configuredRecipient !== businessRecipient || inboundFrom !== businessRecipient) {
      return { allowed: false, reason: 'RECIPIENT_NOT_EXACT_INTERNAL_TEST_BUSINESS' };
    }
  } else {
    if (config.allowVerifiedOmanInbound !== true) {
      return { allowed: false, reason: 'BUSINESS_NOT_INTERNAL_TEST' };
    }
    if (inboundFrom !== businessRecipient) {
      return { allowed: false, reason: 'RECIPIENT_NOT_EXACT_OMAN_TEST_BUSINESS' };
    }
    if (businessRecipient.length !== 11 || !businessRecipient.startsWith('968')) {
      return { allowed: false, reason: 'OMAN_TEST_RECIPIENT_REQUIRED' };
    }
  }

  const startsAt = typeof config.startsAt === 'string' ? config.startsAt : '';
  const endsAt = typeof config.endsAt === 'string' ? config.endsAt : '';
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  const nowMs = (input.now ?? new Date()).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { allowed: false, reason: 'LIVE_TEST_WINDOW_INVALID' };
  }
  if (endMs - startMs > 90 * 60_000) {
    return { allowed: false, reason: 'LIVE_TEST_WINDOW_TOO_LONG' };
  }
  if (nowMs < startMs) return { allowed: false, reason: 'LIVE_TEST_NOT_STARTED' };
  if (nowMs >= endMs) return { allowed: false, reason: 'LIVE_TEST_EXPIRED' };

  const maxReplies = Math.max(1, Math.min(20, Number(config.maxReplies ?? 10) || 10));
  if (input.claimedCount >= maxReplies) return { allowed: false, reason: 'LIVE_TEST_REPLY_CAP_REACHED' };

  return {
    allowed: true,
    recipient: businessRecipient,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
    maxReplies,
  };
}
