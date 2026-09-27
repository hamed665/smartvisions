export type VoiceReplyFoundationBlocker =
  | 'CONTROLLED_TEST_ONLY'
  | 'SHADOW_MODE_REQUIRED'
  | 'GLOBAL_KILL_SWITCH'
  | 'AGENTS_PAUSED'
  | 'WHATSAPP_PAUSED'
  | 'WHATSAPP_PROVIDER_NOT_CONNECTED'
  | 'WHATSAPP_FREEFORM_WINDOW_REQUIRED'
  | 'HUMAN_TAKEOVER'
  | 'AI_VOICE_DISCLOSURE_REQUIRED'
  | 'USAGE_RECONCILIATION_REQUIRED'
  | 'TTS_MODEL_NOT_APPROVED'
  | 'AUDIO_FORMAT_NOT_APPROVED';

export type VoiceReplyFoundationInput = {
  businessCategory?: string | null;
  shadowMode: boolean;
  globalKillSwitch: boolean;
  agentsPaused: boolean;
  whatsappPaused: boolean;
  whatsappProviderConnected: boolean;
  whatsappFreeformWindowOpen: boolean;
  humanTakeover: boolean;
  aiVoiceDisclosureConfigured: boolean;
  usageReconciliationReady: boolean;
  ttsModel: string;
  audioMimeType: string;
};

export function evaluateVoiceReplyFoundation(input: VoiceReplyFoundationInput) {
  const blockers: VoiceReplyFoundationBlocker[] = [];

  if (String(input.businessCategory ?? '').toUpperCase() !== 'INTERNAL_TEST') {
    blockers.push('CONTROLLED_TEST_ONLY');
  }
  if (!input.shadowMode) blockers.push('SHADOW_MODE_REQUIRED');
  if (input.globalKillSwitch) blockers.push('GLOBAL_KILL_SWITCH');
  if (input.agentsPaused) blockers.push('AGENTS_PAUSED');
  if (input.whatsappPaused) blockers.push('WHATSAPP_PAUSED');
  if (!input.whatsappProviderConnected) blockers.push('WHATSAPP_PROVIDER_NOT_CONNECTED');
  if (!input.whatsappFreeformWindowOpen) blockers.push('WHATSAPP_FREEFORM_WINDOW_REQUIRED');
  if (input.humanTakeover) blockers.push('HUMAN_TAKEOVER');
  if (!input.aiVoiceDisclosureConfigured) blockers.push('AI_VOICE_DISCLOSURE_REQUIRED');
  if (!input.usageReconciliationReady) blockers.push('USAGE_RECONCILIATION_REQUIRED');
  if (
    input.ttsModel !== 'gpt-4o-mini-tts'
    && !input.ttsModel.startsWith('gpt-4o-mini-tts-')
  ) {
    blockers.push('TTS_MODEL_NOT_APPROVED');
  }
  if (input.audioMimeType.toLowerCase() !== 'audio/mpeg') {
    blockers.push('AUDIO_FORMAT_NOT_APPROVED');
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    mode: 'CONTROLLED_WHATSAPP_AUDIO_REPLY' as const,
    telephonyEnabled: false as const,
    voiceCloningEnabled: false as const,
  };
}
