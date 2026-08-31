import { describe, expect, it } from 'vitest';
import { approvedSendFailureDisposition, evaluateApprovedSendPolicy } from '@/lib/outreach/approved-send-policy';

const base = {
  messageStatus: 'APPROVED',
  requiresApproval: false,
  shadowMode: false,
  shadowModeExceptionVerified: false,
  globalKillSwitch: false,
  channelPaused: false,
  agentsPaused: false,
  doNotContact: false,
  agentMode: 'AUTO',
  messageChannel: 'EMAIL',
};

describe('approved send policy', () => {
  it('allows an approved live-mode message with all guards clear', () => {
    expect(evaluateApprovedSendPolicy(base)).toEqual({ allowed: true, blocks: [], channel: 'EMAIL' });
  });

  it('blocks approved messages while shadow mode is still enabled', () => {
    const result = evaluateApprovedSendPolicy({ ...base, shadowMode: true });
    expect(result.allowed).toBe(false);
    expect(result.blocks).toContain('SHADOW_MODE_ENABLED');
  });

  it('allows only a pre-verified controlled pilot to bypass the shadow-mode block', () => {
    const result = evaluateApprovedSendPolicy({
      ...base,
      messageChannel: 'WHATSAPP',
      shadowMode: true,
      shadowModeExceptionVerified: true,
    });
    expect(result).toEqual({ allowed: true, blocks: [], channel: 'WHATSAPP' });
  });

  it('keeps every other safety gate active during a verified shadow-mode exception', () => {
    const result = evaluateApprovedSendPolicy({
      ...base,
      messageChannel: 'WHATSAPP',
      shadowMode: true,
      shadowModeExceptionVerified: true,
      globalKillSwitch: true,
      doNotContact: true,
      agentsPaused: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.blocks).toEqual(expect.arrayContaining(['GLOBAL_KILL_SWITCH', 'DO_NOT_CONTACT', 'AGENTS_PAUSED']));
    expect(result.blocks).not.toContain('SHADOW_MODE_ENABLED');
  });

  it('blocks do-not-contact leads', () => {
    const result = evaluateApprovedSendPolicy({ ...base, doNotContact: true });
    expect(result.blocks).toContain('DO_NOT_CONTACT');
  });

  it('blocks human takeover even after owner approval', () => {
    const result = evaluateApprovedSendPolicy({ ...base, agentMode: 'HUMAN' });
    expect(result.blocks).toContain('HUMAN_TAKEOVER');
  });

  it('blocks a message that is not actually approved', () => {
    const result = evaluateApprovedSendPolicy({ ...base, messageStatus: 'READY' });
    expect(result.blocks).toContain('MESSAGE_NOT_APPROVED');
  });

  it('blocks kill switch and paused channels independently', () => {
    const result = evaluateApprovedSendPolicy({ ...base, globalKillSwitch: true, channelPaused: true });
    expect(result.blocks).toEqual(expect.arrayContaining(['GLOBAL_KILL_SWITCH', 'CHANNEL_PAUSED']));
  });

  it('blocks approved sending while all agents are globally paused', () => {
    const result = evaluateApprovedSendPolicy({ ...base, agentsPaused: true });
    expect(result.allowed).toBe(false);
    expect(result.blocks).toContain('AGENTS_PAUSED');
  });

  it('never marks a provider-accepted message failed or automatically retryable', () => {
    expect(approvedSendFailureDisposition(true)).toEqual({
      markFailed: false,
      httpStatus: 202,
      retryPolicy: 'RECONCILIATION_ONLY',
    });
    expect(approvedSendFailureDisposition(false)).toEqual({
      markFailed: true,
      httpStatus: 502,
      retryPolicy: 'NO_AUTOMATIC_RETRY',
    });
  });
});
