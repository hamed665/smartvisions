import { describe, expect, it } from 'vitest';
import { verifyControlledPreviewPilot } from '@/lib/preview/controlled-pilot';

const valid = {
  shadowMode: true,
  globalKillSwitch: false,
  businessCategory: 'INTERNAL_TEST',
  leadId: 'lead-1',
  voiceLeadId: 'lead-1',
  leadStatus: 'REPLIED',
  leadAgentMode: 'AUTO',
  voiceStatus: 'SUCCEEDED',
  voiceTranscript: 'I need a website for my clinic. Can you show me your website services?',
  previewDirectorEnabled: true,
  salesLane: 'MUSCAT_LOCAL_GROWTH',
  recommendedServices: ['WEBSITE'],
  nextActionCanSpendMoney: false,
};

describe('controlled Preview production pilot', () => {
  it('allows only the linked INTERNAL_TEST website voice proof in Shadow Mode', () => {
    expect(verifyControlledPreviewPilot(valid)).toEqual({ verified: true });
  });

  it('blocks loss of Shadow Mode and global kill switch activation', () => {
    expect(verifyControlledPreviewPilot({ ...valid, shadowMode: false })).toEqual({ verified: false, reason: 'SHADOW_MODE_REQUIRED' });
    expect(verifyControlledPreviewPilot({ ...valid, globalKillSwitch: true })).toEqual({ verified: false, reason: 'GLOBAL_KILL_SWITCH_ON' });
  });

  it('blocks unrelated or human-controlled leads', () => {
    expect(verifyControlledPreviewPilot({ ...valid, voiceLeadId: 'other' })).toEqual({ verified: false, reason: 'VOICE_LEAD_LINKAGE_REQUIRED' });
    expect(verifyControlledPreviewPilot({ ...valid, leadAgentMode: 'HUMAN' })).toEqual({ verified: false, reason: 'HUMAN_TAKEOVER_ACTIVE' });
  });

  it('requires successful explicit website voice evidence and a zero-spend website route', () => {
    expect(verifyControlledPreviewPilot({ ...valid, voiceTranscript: 'Hello there' })).toEqual({ verified: false, reason: 'REAL_WEBSITE_VOICE_EVIDENCE_REQUIRED' });
    expect(verifyControlledPreviewPilot({ ...valid, recommendedServices: ['REELS'] })).toEqual({ verified: false, reason: 'WEBSITE_SERVICE_ROUTE_REQUIRED' });
    expect(verifyControlledPreviewPilot({ ...valid, nextActionCanSpendMoney: true })).toEqual({ verified: false, reason: 'PROVIDER_SPEND_NOT_ALLOWED' });
  });
});
