export const SMS_RCS_CHANNELS = ['SMS', 'RCS'] as const;

export type SmsRcsChannel = typeof SMS_RCS_CHANNELS[number];

export type SmsRcsPermissionState =
  | 'VERIFIED_ALLOWED'
  | 'VERIFIED_DENIED'
  | 'UNKNOWN';

export type SmsRcsPricingEvidence =
  | 'VERIFIED'
  | 'CONSERVATIVE'
  | 'UNKNOWN';

export type SenderRegistrationRequirement =
  | 'REQUIRED'
  | 'NOT_REQUIRED'
  | 'UNKNOWN';

export type SmsRcsCapabilityEvidence = {
  provider: string;
  countryCode: string;
  channel: SmsRcsChannel;
  outboundText: boolean;
  inboundText: boolean;
  deliveryReceipts: boolean;
  readReceipts: boolean;
  media: boolean;
  senderRegistration: SenderRegistrationRequirement;
  automaticFallbackChannel?: SmsRcsChannel | null;
  verifiedAt: string;
  evidenceSource: string;
};

export type SmsRcsRouteBlocker =
  | 'PROVIDER_NOT_CONNECTED'
  | 'PERMISSION_EVIDENCE_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'SUPPRESSED'
  | 'PRICING_EVIDENCE_REQUIRED'
  | 'CAPABILITY_EVIDENCE_MISSING'
  | 'CAPABILITY_EVIDENCE_STALE'
  | 'OUTBOUND_TEXT_UNSUPPORTED'
  | 'SENDER_REGISTRATION_EVIDENCE_REQUIRED'
  | 'SENDER_REGISTRATION_REQUIRED';

export type SmsRcsRouteDecision = {
  allowed: boolean;
  blockers: SmsRcsRouteBlocker[];
  route: {
    provider: string;
    countryCode: string;
    primaryChannel: SmsRcsChannel;
    fallbackChannel: SmsRcsChannel | null;
    capabilityVerifiedAt: string;
    capabilityEvidenceSource: string;
    pricingEvidence: Exclude<SmsRcsPricingEvidence, 'UNKNOWN'>;
  } | null;
};

export type EvaluateSmsRcsRouteInput = {
  provider: string;
  providerConnected: boolean;
  requestedChannel: SmsRcsChannel;
  recipientCountryCode: string;
  permissionState: SmsRcsPermissionState;
  suppressed: boolean;
  pricingEvidence: SmsRcsPricingEvidence;
  senderReady: boolean;
  capabilities: SmsRcsCapabilityEvidence[];
  maxEvidenceAgeMs: number;
  now?: Date;
};

function canonicalProvider(value: string) {
  return value.trim().toUpperCase();
}

function canonicalCountry(value: string) {
  return value.trim().toUpperCase();
}

function evidenceAgeMs(evidence: SmsRcsCapabilityEvidence, now: Date) {
  const verifiedAtMs = Date.parse(evidence.verifiedAt);
  if (!Number.isFinite(verifiedAtMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, now.getTime() - verifiedAtMs);
}

function exactCapability(
  input: EvaluateSmsRcsRouteInput,
  channel: SmsRcsChannel,
) {
  const provider = canonicalProvider(input.provider);
  const countryCode = canonicalCountry(input.recipientCountryCode);
  return input.capabilities.find((row) =>
    canonicalProvider(row.provider) === provider
    && canonicalCountry(row.countryCode) === countryCode
    && row.channel === channel);
}

function capabilityUsable(
  capability: SmsRcsCapabilityEvidence,
  input: EvaluateSmsRcsRouteInput,
  now: Date,
) {
  if (evidenceAgeMs(capability, now) > input.maxEvidenceAgeMs) return false;
  if (!capability.outboundText) return false;
  if (capability.senderRegistration === 'UNKNOWN') return false;
  if (capability.senderRegistration === 'REQUIRED' && !input.senderReady) return false;
  return true;
}

export function evaluateSmsRcsRoute(
  input: EvaluateSmsRcsRouteInput,
): SmsRcsRouteDecision {
  const blockers: SmsRcsRouteBlocker[] = [];
  const now = input.now ?? new Date();

  if (!input.providerConnected || !canonicalProvider(input.provider)) {
    blockers.push('PROVIDER_NOT_CONNECTED');
  }

  if (input.permissionState === 'UNKNOWN') {
    blockers.push('PERMISSION_EVIDENCE_REQUIRED');
  } else if (input.permissionState === 'VERIFIED_DENIED') {
    blockers.push('PERMISSION_DENIED');
  }

  if (input.suppressed) blockers.push('SUPPRESSED');
  if (input.pricingEvidence === 'UNKNOWN') {
    blockers.push('PRICING_EVIDENCE_REQUIRED');
  }

  const capability = exactCapability(input, input.requestedChannel);
  if (!capability) {
    blockers.push('CAPABILITY_EVIDENCE_MISSING');
  } else {
    if (evidenceAgeMs(capability, now) > input.maxEvidenceAgeMs) {
      blockers.push('CAPABILITY_EVIDENCE_STALE');
    }
    if (!capability.outboundText) {
      blockers.push('OUTBOUND_TEXT_UNSUPPORTED');
    }
    if (capability.senderRegistration === 'UNKNOWN') {
      blockers.push('SENDER_REGISTRATION_EVIDENCE_REQUIRED');
    } else if (capability.senderRegistration === 'REQUIRED' && !input.senderReady) {
      blockers.push('SENDER_REGISTRATION_REQUIRED');
    }
  }

  if (!capability || blockers.length > 0 || input.pricingEvidence === 'UNKNOWN') {
    return { allowed: false, blockers: [...new Set(blockers)], route: null };
  }

  let fallbackChannel: SmsRcsChannel | null = null;
  const requestedFallback = capability.automaticFallbackChannel ?? null;
  if (requestedFallback && requestedFallback !== input.requestedChannel) {
    const fallback = exactCapability(input, requestedFallback);
    if (fallback && capabilityUsable(fallback, input, now)) {
      fallbackChannel = requestedFallback;
    }
  }

  return {
    allowed: true,
    blockers: [],
    route: {
      provider: canonicalProvider(input.provider),
      countryCode: canonicalCountry(input.recipientCountryCode),
      primaryChannel: input.requestedChannel,
      fallbackChannel,
      capabilityVerifiedAt: capability.verifiedAt,
      capabilityEvidenceSource: capability.evidenceSource,
      pricingEvidence: input.pricingEvidence,
    },
  };
}

export function smsRcsCapabilitiesFromEvidence(
  evidence: SmsRcsCapabilityEvidence | null | undefined,
) {
  if (!evidence) return [] as string[];
  return [
    evidence.outboundText ? 'OUTBOUND_TEXT' : null,
    evidence.inboundText ? 'INBOUND_TEXT' : null,
    evidence.deliveryReceipts ? 'DELIVERY_RECEIPTS' : null,
    evidence.readReceipts ? 'READ_RECEIPTS' : null,
    evidence.media ? 'MEDIA' : null,
    evidence.automaticFallbackChannel ? `FALLBACK_${evidence.automaticFallbackChannel}` : null,
  ].filter((value): value is string => Boolean(value));
}
