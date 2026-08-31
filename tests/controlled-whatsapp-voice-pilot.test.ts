import { describe, expect, it } from 'vitest';
import { verifyControlledWhatsAppVoicePilot } from '@/lib/voice/controlled-pilot';

const valid = {
  shadowMode: true,
  globalKillSwitch: false,
  agentsPaused: false,
  whatsappAiPaused: false,
  whatsappConnected: true,
  whatsappEnabled: true,
  openAiConnected: true,
  openAiEnabled: true,
  businessCategory: 'INTERNAL_TEST',
  messageLeadId: 'lead-1',
  conversationLeadId: 'lead-1',
  conversationChannel: 'WHATSAPP',
  leadAgentMode: 'AUTO',
  conversationAgentMode: 'AUTO',
  voice: true,
  providerMessageId: 'wamid-real',
  mediaId: 'media-real',
  conversationId: 'conversation-1',
} as const;

describe('controlled WhatsApp voice pilot', () => {
  it('allows only a fully linked INTERNAL_TEST voice with production providers connected', () => {
    expect(verifyControlledWhatsAppVoicePilot(valid)).toEqual({ verified: true });
  });

  it.each([
    [{ shadowMode: false }, 'SHADOW_MODE_REQUIRED'],
    [{ globalKillSwitch: true }, 'GLOBAL_KILL_SWITCH_ON'],
    [{ agentsPaused: true }, 'AGENTS_PAUSED'],
    [{ whatsappAiPaused: true }, 'WHATSAPP_AI_PAUSED'],
    [{ whatsappConnected: false }, 'WHATSAPP_NOT_CONNECTED'],
    [{ openAiEnabled: false }, 'OPENAI_NOT_CONNECTED'],
    [{ businessCategory: 'DENTAL' }, 'INTERNAL_TEST_REQUIRED'],
    [{ voice: false }, 'REAL_LINKED_VOICE_REQUIRED'],
    [{ mediaId: '' }, 'REAL_LINKED_VOICE_REQUIRED'],
    [{ conversationLeadId: 'lead-2' }, 'LEAD_LINKAGE_MISMATCH'],
    [{ conversationChannel: 'EMAIL' }, 'WHATSAPP_CONVERSATION_REQUIRED'],
    [{ leadAgentMode: 'HUMAN' }, 'HUMAN_TAKEOVER_ACTIVE'],
  ])('fails closed for %o', (override, reason) => {
    expect(verifyControlledWhatsAppVoicePilot({ ...valid, ...override })).toEqual({ verified: false, reason });
  });
});
