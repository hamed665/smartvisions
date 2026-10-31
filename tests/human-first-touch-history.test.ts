import { describe, expect, it } from 'vitest';
import { humanFirstTouchBlockReason } from '@/lib/hunters/business/human-acquisition';
describe('human first-touch history', () => {
  it('reviews an existing draft or ambiguous send rather than preparing a competing introduction', () => {
    expect(humanFirstTouchBlockReason({ leadStatuses: ['NEW'], agentModes: ['AUTO'], hasOutboundHistory: false, hasPreparedOutbound: true })).toBe('EXISTING_OUTBOUND_ACTIVITY');
  });
  it.each(['CONTACTED','REPLIED','INTERESTED','HOT'])('respects explicitly recorded %s state even without a provider mirror', status => {
    expect(humanFirstTouchBlockReason({ leadStatuses: [status], agentModes: ['AUTO'], hasOutboundHistory: false })).toBe('PREVIOUSLY_CONTACTED');
  });
  it('preserves lead-level human handoff when modes have not yet reconciled', () => {
    expect(humanFirstTouchBlockReason({ leadStatuses: ['HUMAN'], agentModes: ['AUTO'], hasOutboundHistory: false })).toBe('HUMAN_OR_PAUSED_CONVERSATION');
  });
  it('does not suggest a second introduction after a confirmed outbound on any channel', () => {
    expect(humanFirstTouchBlockReason({ leadStatuses: ['NEW'], agentModes: ['AUTO'], hasOutboundHistory: true })).toBe('PREVIOUSLY_CONTACTED');
  });
  it.each(['DNC','DO_NOT_CONTACT','SUPPRESSED','UNSUBSCRIBED','WON','LOST'])('removes cold-contact actions for %s', status => {
    expect(humanFirstTouchBlockReason({ leadStatuses: [status], agentModes: ['AUTO'], hasOutboundHistory: false })).toBe('LEAD_REQUIRES_REVIEW');
  });
  it.each(['HUMAN','PAUSED'])('preserves %s handling', mode => {
    expect(humanFirstTouchBlockReason({ leadStatuses: ['NEW'], agentModes: [mode], hasOutboundHistory: false })).toBe('HUMAN_OR_PAUSED_CONVERSATION');
  });
  it('allows a fresh introduction only when canonical context has no blocker', () => {
    expect(humanFirstTouchBlockReason({ leadStatuses: ['NEW'], agentModes: ['AUTO'], hasOutboundHistory: false })).toBeNull();
  });
  it('continues a customer-initiated conversation instead of introducing the business again', () => {
    expect(humanFirstTouchBlockReason({ leadStatuses: ['NEW'], agentModes: ['AUTO'], hasOutboundHistory: false, hasConversation: true })).toBe('EXISTING_CONVERSATION');
  });
});
