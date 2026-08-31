export type ControlledWhatsAppVoicePilotInput = {
  shadowMode: boolean;
  globalKillSwitch: boolean;
  agentsPaused: boolean;
  whatsappAiPaused: boolean;
  whatsappConnected: boolean;
  whatsappEnabled: boolean;
  openAiConnected: boolean;
  openAiEnabled: boolean;
  businessCategory?: string | null;
  messageLeadId?: string | null;
  conversationLeadId?: string | null;
  conversationChannel?: string | null;
  leadAgentMode?: string | null;
  conversationAgentMode?: string | null;
  voice: boolean;
  providerMessageId?: string | null;
  mediaId?: string | null;
  conversationId?: string | null;
};

export type ControlledWhatsAppVoicePilotVerification =
  | { verified: true }
  | { verified: false; reason: string };

export function verifyControlledWhatsAppVoicePilot(
  input: ControlledWhatsAppVoicePilotInput,
): ControlledWhatsAppVoicePilotVerification {
  if (!input.shadowMode) return { verified: false, reason: 'SHADOW_MODE_REQUIRED' };
  if (input.globalKillSwitch) return { verified: false, reason: 'GLOBAL_KILL_SWITCH_ON' };
  if (input.agentsPaused) return { verified: false, reason: 'AGENTS_PAUSED' };
  if (input.whatsappAiPaused) return { verified: false, reason: 'WHATSAPP_AI_PAUSED' };
  if (!input.whatsappConnected || !input.whatsappEnabled) {
    return { verified: false, reason: 'WHATSAPP_NOT_CONNECTED' };
  }
  if (!input.openAiConnected || !input.openAiEnabled) {
    return { verified: false, reason: 'OPENAI_NOT_CONNECTED' };
  }
  if (input.businessCategory !== 'INTERNAL_TEST') {
    return { verified: false, reason: 'INTERNAL_TEST_REQUIRED' };
  }
  if (!input.voice || !input.providerMessageId || !input.mediaId || !input.conversationId) {
    return { verified: false, reason: 'REAL_LINKED_VOICE_REQUIRED' };
  }
  if (!input.messageLeadId || input.messageLeadId !== input.conversationLeadId) {
    return { verified: false, reason: 'LEAD_LINKAGE_MISMATCH' };
  }
  if (input.conversationChannel !== 'WHATSAPP') {
    return { verified: false, reason: 'WHATSAPP_CONVERSATION_REQUIRED' };
  }
  if (input.leadAgentMode === 'HUMAN' || input.conversationAgentMode === 'HUMAN') {
    return { verified: false, reason: 'HUMAN_TAKEOVER_ACTIVE' };
  }
  return { verified: true };
}
