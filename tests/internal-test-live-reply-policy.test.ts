import { describe, expect, it } from 'vitest';
import { evaluateInternalTestLiveReplyPolicy } from '@/lib/whatsapp/internal-test-live-reply-policy';

const now = new Date('2026-09-05T14:00:00.000Z');
const config = {
  internalTestLiveReply: {
    enabled: true,
    recipient: '+968 7751 1053',
    startsAt: '2026-09-05T13:30:00.000Z',
    endsAt: '2026-09-05T14:30:00.000Z',
    maxReplies: 10,
  },
};

function base() {
  return {
    ruleRequiresApproval: true,
    ruleConfig: config,
    businessCategory: 'INTERNAL_TEST',
    businessWhatsapp: '+96877511053',
    businessPhone: null,
    inboundFrom: '96877511053',
    shadowMode: true,
    globalKillSwitch: false,
    agentsPaused: false,
    whatsappPaused: false,
    claimedCount: 0,
    now,
  };
}

describe('internal test live WhatsApp reply policy', () => {
  it('allows only the exact INTERNAL_TEST recipient inside the short window while global approval and Shadow remain on', () => {
    expect(evaluateInternalTestLiveReplyPolicy(base())).toEqual({
      allowed: true,
      recipient: '96877511053',
      startsAt: '2026-09-05T13:30:00.000Z',
      endsAt: '2026-09-05T14:30:00.000Z',
      maxReplies: 10,
    });
  });

  it('allows a different exact Oman inbound sender only when the time-boxed Oman multi-number flag is enabled', () => {
    const result = evaluateInternalTestLiveReplyPolicy({
      ...base(),
      businessCategory: 'dental_clinic',
      businessWhatsapp: '+968 9115 0976',
      inboundFrom: '96891150976',
      ruleConfig: {
        internalTestLiveReply: {
          ...config.internalTestLiveReply,
          allowVerifiedOmanInbound: true,
          maxReplies: 20,
        },
      },
    });
    expect(result).toEqual({
      allowed: true,
      recipient: '96891150976',
      startsAt: '2026-09-05T13:30:00.000Z',
      endsAt: '2026-09-05T14:30:00.000Z',
      maxReplies: 20,
    });
  });

  it('does not treat a non-Oman sender as part of the Oman multi-number window', () => {
    expect(evaluateInternalTestLiveReplyPolicy({
      ...base(),
      businessCategory: 'internal_contact',
      businessWhatsapp: '+971501234567',
      inboundFrom: '971501234567',
      ruleConfig: {
        internalTestLiveReply: {
          ...config.internalTestLiveReply,
          allowVerifiedOmanInbound: true,
        },
      },
    })).toEqual({ allowed: false, reason: 'OMAN_TEST_RECIPIENT_REQUIRED' });
  });

  it.each([
    [{ businessCategory: 'dental_clinic' }, 'BUSINESS_NOT_INTERNAL_TEST'],
    [{ inboundFrom: '96891150976' }, 'RECIPIENT_NOT_EXACT_INTERNAL_TEST_BUSINESS'],
    [{ shadowMode: false }, 'SHADOW_MODE_REQUIRED'],
    [{ globalKillSwitch: true }, 'GLOBAL_KILL_SWITCH'],
    [{ agentsPaused: true }, 'AGENTS_PAUSED'],
    [{ whatsappPaused: true }, 'WHATSAPP_PAUSED'],
    [{ ruleRequiresApproval: false }, 'GLOBAL_WHATSAPP_APPROVAL_RULE_MUST_REMAIN_ON'],
  ])('fails closed for unsafe state %#', (patch, reason) => {
    expect(evaluateInternalTestLiveReplyPolicy({ ...base(), ...patch })).toEqual({ allowed: false, reason });
  });

  it('fails closed before or after the configured live-test window', () => {
    expect(evaluateInternalTestLiveReplyPolicy({ ...base(), now: new Date('2026-09-05T13:29:59.999Z') })).toEqual({ allowed: false, reason: 'LIVE_TEST_NOT_STARTED' });
    expect(evaluateInternalTestLiveReplyPolicy({ ...base(), now: new Date('2026-09-05T14:30:00.000Z') })).toEqual({ allowed: false, reason: 'LIVE_TEST_EXPIRED' });
  });

  it('rejects a window longer than the hard 90-minute ceiling', () => {
    expect(evaluateInternalTestLiveReplyPolicy({
      ...base(),
      ruleConfig: {
        internalTestLiveReply: {
          ...config.internalTestLiveReply,
          startsAt: '2026-09-05T13:00:00.000Z',
          endsAt: '2026-09-05T14:31:00.000Z',
        },
      },
    })).toEqual({ allowed: false, reason: 'LIVE_TEST_WINDOW_TOO_LONG' });
  });

  it('caps automatic replies and fails closed when the claim budget is consumed', () => {
    expect(evaluateInternalTestLiveReplyPolicy({ ...base(), claimedCount: 10 })).toEqual({ allowed: false, reason: 'LIVE_TEST_REPLY_CAP_REACHED' });
  });
});
