export type VoiceReplyRuntimeConfig = {
  enabled: true;
  aiGeneratedDisclosureText: string;
  costReserveUsd: number;
  pricingStatus: 'CONSERVATIVE_CONFIGURED_RESERVE';
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function resolveVoiceReplyRuntimeConfig(value: unknown):
  | { ready: true; config: VoiceReplyRuntimeConfig }
  | { ready: false; reason: string } {
  const root = record(value);
  const config = record(root.voiceReply);

  if (config.enabled !== true) return { ready: false, reason: 'VOICE_REPLY_DISABLED' };

  const disclosure = typeof config.aiGeneratedDisclosureText === 'string'
    ? config.aiGeneratedDisclosureText.trim()
    : '';
  if (!disclosure) return { ready: false, reason: 'AI_VOICE_DISCLOSURE_REQUIRED' };
  if (disclosure.length > 300) return { ready: false, reason: 'AI_VOICE_DISCLOSURE_TOO_LONG' };

  const reserve = Number(config.costReserveUsd);
  if (!Number.isFinite(reserve) || reserve <= 0 || reserve > 5) {
    return { ready: false, reason: 'VOICE_REPLY_COST_RESERVE_INVALID' };
  }

  if (config.pricingStatus !== 'CONSERVATIVE_CONFIGURED_RESERVE') {
    return { ready: false, reason: 'VOICE_REPLY_PRICING_EVIDENCE_REQUIRED' };
  }

  return {
    ready: true,
    config: {
      enabled: true,
      aiGeneratedDisclosureText: disclosure,
      costReserveUsd: Number(reserve.toFixed(6)),
      pricingStatus: 'CONSERVATIVE_CONFIGURED_RESERVE',
    },
  };
}

export function voiceReplySynthesisText(disclosure: string, reply: string) {
  const normalizedDisclosure = disclosure.trim();
  const normalizedReply = reply.trim();
  if (!normalizedDisclosure || !normalizedReply) {
    throw new Error('Voice reply disclosure and reply text are required');
  }
  return `${normalizedDisclosure}\n\n${normalizedReply}`;
}
