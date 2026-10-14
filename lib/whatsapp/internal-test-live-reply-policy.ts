export type InternalTestLiveReplyPolicyInput = {
  ruleRequiresApproval: boolean;
  ruleConfig: unknown;
  businessCategory?: string | null;
  businessWhatsapp?: string | null;
  businessPhone?: string | null;
  inboundFrom?: string | null;
  tenantBusinessId?: string | null;
  bindingId?: string | null;
  inboundReceivedAt?: string | null;
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
      deliveryMode: 'TEXT' | 'VOICE_REPLY';
      permanentInbound?: boolean;
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

  // The permanent service-reply policy is independent of the 90-minute pilot.
  // Only real customer-initiated inbound for one exact bound tenant qualifies.
  // Its owner's immutable authorization is also verified again in PostgreSQL.
  const production = record(record(input.ruleConfig).permanentInboundReply);
  if (production.enabled === true) {
    const recipient = normalizeInternalTestPhone(input.inboundFrom);
    const businessRecipient = normalizeInternalTestPhone(input.businessWhatsapp || input.businessPhone);
    const cap = Number(production.dailyCap);
    const received = Date.parse(input.inboundReceivedAt ?? '');
    const now = (input.now ?? new Date()).getTime();
    if (production.inboundOnly !== true || production.allowAllCustomerInitiated !== true
      || production.noUnsolicited !== true || production.deliveryMode !== 'TEXT'
      || !production.consentAuditId || !production.senderPhoneNumberId || !production.senderWabaId) {
      return { allowed: false, reason: 'PRODUCTION_INBOUND_CONSENT_CONFIG_REQUIRED' };
    }
    if (!input.tenantBusinessId || !input.bindingId
      || input.tenantBusinessId !== production.tenantBusinessId
      || input.bindingId !== production.bindingId) {
      return { allowed: false, reason: 'PRODUCTION_INBOUND_TENANT_BINDING_MISMATCH' };
    }
    if (businessRecipient !== recipient || !/^[0-9]{8,15}$/.test(recipient)) {
      return { allowed: false, reason: 'PRODUCTION_INBOUND_RECIPIENT_MISMATCH' };
    }
    if (!Number.isFinite(received) || received > now || now-received > 5*60_000) {
      return { allowed: false, reason: 'PRODUCTION_FRESH_INBOUND_REQUIRED' };
    }
    if (!Number.isInteger(cap) || cap < 1 || cap > 200) {
      return { allowed: false, reason: 'PRODUCTION_DAILY_CAP_INVALID' };
    }
    return { allowed: true, recipient, startsAt: '', endsAt: '', maxReplies: cap,
      deliveryMode: 'TEXT', permanentInbound: true };
  }

  const config = record(record(input.ruleConfig).internalTestLiveReply);
  if (config.enabled !== true) return { allowed: false, reason: 'LIVE_TEST_DISABLED' };

  const configuredRecipient = normalizeInternalTestPhone(config.recipient);
  const businessRecipient = normalizeInternalTestPhone(input.businessWhatsapp || input.businessPhone);
  const inboundFrom = normalizeInternalTestPhone(input.inboundFrom);
  if (businessRecipient.length < 8 || inboundFrom.length < 8) {
    return { allowed: false, reason: 'RECIPIENT_UNAVAILABLE' };
  }

  const businessCategory = String(input.businessCategory ?? '').toUpperCase();
  const scopedOmanTest = config.allowVerifiedOmanInbound === true;
  if (businessCategory === 'INTERNAL_TEST' && !scopedOmanTest) {
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
    const recipients = Array.isArray(config.recipients)
      ? config.recipients.map(normalizeInternalTestPhone) : [];
    if (!recipients.includes(inboundFrom)) {
      return { allowed: false, reason: 'RECIPIENT_NOT_CONSENTED' };
    }
    if (!input.tenantBusinessId || !input.bindingId
      || config.tenantBusinessId !== input.tenantBusinessId || config.bindingId !== input.bindingId) {
      return { allowed: false, reason: 'LIVE_TEST_TENANT_BINDING_MISMATCH' };
    }
    if (config.inboundOnly !== true || config.deliveryMode === 'VOICE_REPLY') {
      return { allowed: false, reason: 'INBOUND_TEXT_REPLY_REQUIRED' };
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

  if (scopedOmanTest || businessCategory !== 'INTERNAL_TEST') {
    const inboundMs = Date.parse(input.inboundReceivedAt ?? '');
    if (!Number.isFinite(inboundMs) || inboundMs < startMs || inboundMs > nowMs
      || nowMs - inboundMs > 5 * 60_000) {
      return { allowed: false, reason: 'FRESH_WINDOW_INBOUND_REQUIRED' };
    }
  }

  const maxReplies = Number(config.maxRepliesTotal ?? config.maxReplies ?? 10);
  if (!Number.isInteger(maxReplies) || maxReplies < 1 || maxReplies > 20) {
    return { allowed: false, reason: 'LIVE_TEST_REPLY_CAP_INVALID' };
  }
  if (input.claimedCount >= maxReplies) return { allowed: false, reason: 'LIVE_TEST_REPLY_CAP_REACHED' };

  const configuredDeliveryMode = typeof config.deliveryMode === 'string'
    ? config.deliveryMode.trim().toUpperCase()
    : '';
  if (configuredDeliveryMode && !['TEXT', 'VOICE_REPLY'].includes(configuredDeliveryMode)) {
    return { allowed: false, reason: 'LIVE_TEST_DELIVERY_MODE_INVALID' };
  }
  const deliveryMode = configuredDeliveryMode === 'VOICE_REPLY'
    ? 'VOICE_REPLY' as const
    : 'TEXT' as const;

  return {
    allowed: true,
    recipient: businessRecipient,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
    maxReplies,
    deliveryMode,
  };
}
