import { describe, expect, it } from 'vitest';
import { evaluateVoiceReplyFoundation } from '@/lib/voice/reply-policy';

function baseInput() {
  return {
    businessCategory: 'INTERNAL_TEST',
    shadowMode: true,
    globalKillSwitch: false,
    agentsPaused: false,
    whatsappPaused: false,
    whatsappProviderConnected: true,
    whatsappFreeformWindowOpen: true,
    humanTakeover: false,
    aiVoiceDisclosureConfigured: true,
    usageReconciliationReady: true,
    ttsModel: 'gpt-4o-mini-tts',
    audioMimeType: 'audio/mpeg',
  };
}

describe('OMNI-VOICE reply foundation policy', () => {
  it('fails closed outside the controlled internal-test boundary', () => {
    const result = evaluateVoiceReplyFoundation({
      ...baseInput(),
      businessCategory: 'DENTAL_CLINIC',
      shadowMode: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'CONTROLLED_TEST_ONLY',
      'SHADOW_MODE_REQUIRED',
    ]));
  });

  it('requires runtime and provider safety to remain green', () => {
    const result = evaluateVoiceReplyFoundation({
      ...baseInput(),
      globalKillSwitch: true,
      agentsPaused: true,
      whatsappPaused: true,
      whatsappProviderConnected: false,
      whatsappFreeformWindowOpen: false,
      humanTakeover: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'GLOBAL_KILL_SWITCH',
      'AGENTS_PAUSED',
      'WHATSAPP_PAUSED',
      'WHATSAPP_PROVIDER_NOT_CONNECTED',
      'WHATSAPP_FREEFORM_WINDOW_REQUIRED',
      'HUMAN_TAKEOVER',
    ]));
  });

  it('requires AI voice disclosure and cost reconciliation evidence', () => {
    const result = evaluateVoiceReplyFoundation({
      ...baseInput(),
      aiVoiceDisclosureConfigured: false,
      usageReconciliationReady: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'AI_VOICE_DISCLOSURE_REQUIRED',
      'USAGE_RECONCILIATION_REQUIRED',
    ]));
  });

  it('rejects unapproved synthesis models and media formats', () => {
    const result = evaluateVoiceReplyFoundation({
      ...baseInput(),
      ttsModel: 'custom-voice-clone',
      audioMimeType: 'audio/webm',
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'TTS_MODEL_NOT_APPROVED',
      'AUDIO_FORMAT_NOT_APPROVED',
    ]));
  });

  it('allows only the exact controlled WhatsApp audio-reply foundation', () => {
    const result = evaluateVoiceReplyFoundation(baseInput());
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.mode).toBe('CONTROLLED_WHATSAPP_AUDIO_REPLY');
    expect(result.telephonyEnabled).toBe(false);
    expect(result.voiceCloningEnabled).toBe(false);
  });
});
