export type ControlledPreviewPilotInput = {
  shadowMode: boolean;
  globalKillSwitch: boolean;
  businessCategory?: string | null;
  leadId?: string | null;
  voiceLeadId?: string | null;
  leadStatus?: string | null;
  leadAgentMode?: string | null;
  voiceStatus?: string | null;
  voiceTranscript?: string | null;
  previewDirectorEnabled: boolean;
  salesLane?: string | null;
  recommendedServices?: string[] | null;
  nextActionCanSpendMoney: boolean;
};

export type ControlledPreviewPilotVerification =
  | { verified: true }
  | { verified: false; reason: string };

function hasWebsiteIntent(value?: string | null) {
  const text = String(value ?? '').toLowerCase();
  return /\bwebsite\b|\bweb site\b/.test(text);
}

export function verifyControlledPreviewPilot(
  input: ControlledPreviewPilotInput,
): ControlledPreviewPilotVerification {
  if (!input.shadowMode) return { verified: false, reason: 'SHADOW_MODE_REQUIRED' };
  if (input.globalKillSwitch) return { verified: false, reason: 'GLOBAL_KILL_SWITCH_ON' };
  if (input.businessCategory !== 'INTERNAL_TEST') return { verified: false, reason: 'INTERNAL_TEST_REQUIRED' };
  if (!input.leadId || input.leadId !== input.voiceLeadId) return { verified: false, reason: 'VOICE_LEAD_LINKAGE_REQUIRED' };
  if (input.leadStatus === 'DO_NOT_CONTACT' || input.leadStatus === 'LOST') return { verified: false, reason: 'LEAD_STATUS_BLOCKED' };
  if (input.leadAgentMode === 'HUMAN') return { verified: false, reason: 'HUMAN_TAKEOVER_ACTIVE' };
  if (input.voiceStatus !== 'SUCCEEDED' || !hasWebsiteIntent(input.voiceTranscript)) {
    return { verified: false, reason: 'REAL_WEBSITE_VOICE_EVIDENCE_REQUIRED' };
  }
  if (!input.previewDirectorEnabled) return { verified: false, reason: 'PREVIEW_DIRECTOR_DISABLED' };
  if (input.salesLane !== 'MUSCAT_LOCAL_GROWTH') return { verified: false, reason: 'CONTROLLED_GROWTH_ROUTE_REQUIRED' };
  if (!(input.recommendedServices ?? []).map((service) => service.toUpperCase()).includes('WEBSITE')) {
    return { verified: false, reason: 'WEBSITE_SERVICE_ROUTE_REQUIRED' };
  }
  if (input.nextActionCanSpendMoney) return { verified: false, reason: 'PROVIDER_SPEND_NOT_ALLOWED' };
  return { verified: true };
}
