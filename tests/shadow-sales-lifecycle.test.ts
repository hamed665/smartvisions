import { describe, expect, it } from 'vitest';
import { processInboundMessage } from '@/lib/agents/pipeline';
import { humanHandoffReasons, isDoNotContactReply, shouldPersistHumanHandoff } from '@/lib/conversations/sales-lifecycle';
import { evaluateApprovedSendPolicy } from '@/lib/outreach/approved-send-policy';
import { buildFollowupSchedule } from '@/lib/outreach/followups';

const omWebsiteKnowledge = [{
  id: 'business_website',
  name: 'Business Website',
  marketPrice: {
    countryCode: 'OM',
    currency: 'OMR',
    price: 179,
    minimumPrice: 0,
    maxAutoDiscountPct: 5,
    maxDiscountWithApprovalPct: 10,
  },
}];

describe('Shadow Mode sales lifecycle scenarios', () => {
  it('keeps a positive routine reply in REVIEW while Shadow Mode is on', async () => {
    const result = await processInboundMessage({
      message: 'Sounds good, tell me more about the website service.',
      countryCode: 'OM',
      serviceKnowledge: omWebsiteKnowledge,
      agentMode: 'AUTO',
      shadowMode: true,
    });

    expect(result.trace.reasoningTier).toBe('LIGHT');
    expect(result.trace.delivery).toBe('REVIEW');
    expect(result.nextAgentMode).toBe('AUTO');
    expect(result.trace.guardrails).toContain('SHADOW_MODE');
  });

  it('blocks a price objection and escalates it to HUMAN', async () => {
    const result = await processInboundMessage({
      message: 'This is too expensive. Can you give me a better price or discount?',
      countryCode: 'OM',
      quotedService: 'business_website',
      quotedPrice: 179,
      quotedCurrency: 'OMR',
      serviceKnowledge: omWebsiteKnowledge,
      agentMode: 'AUTO',
      shadowMode: true,
    });

    expect(result.trace.reasoningTier).toBe('FULL');
    expect(result.trace.handoffReasons).toContain('SPECIAL_DISCOUNT');
    expect(result.nextAgentMode).toBe('HUMAN');
    expect(result.trace.delivery).toBe('BLOCK');
  });

  it('blocks consultation requests and marks them for HUMAN takeover', async () => {
    const result = await processInboundMessage({
      message: 'Can we have a consultation call tomorrow?',
      countryCode: 'OM',
      serviceKnowledge: omWebsiteKnowledge,
      agentMode: 'AUTO',
      shadowMode: true,
    });

    expect(result.trace.handoffReasons).toContain('MEETING_REQUEST');
    expect(result.nextAgentMode).toBe('HUMAN');
    expect(result.trace.delivery).toBe('BLOCK');
  });

  it('schedules no-reply follow-ups but stops them once a reply exists', () => {
    const sentAt = new Date('2026-09-01T06:00:00Z');
    expect(buildFollowupSchedule({ sentAt })).toHaveLength(2);
    expect(buildFollowupSchedule({ sentAt, hasReply: true })).toEqual([]);
  });

  it('recognizes explicit DNC language deterministically across English, Arabic and Persian', () => {
    expect(isDoNotContactReply('Please do not contact me again.')).toBe(true);
    expect(isDoNotContactReply('لا ترسل لي رسائل مرة ثانية')).toBe(true);
    expect(isDoNotContactReply('دیگه پیام نده')).toBe(true);
    expect(isDoNotContactReply('Not interested right now')).toBe(false);
  });

  it('never allows an approved send to bypass DNC or human takeover', () => {
    const base = {
      messageStatus: 'APPROVED',
      requiresApproval: false,
      shadowMode: false,
      globalKillSwitch: false,
      channelPaused: false,
      agentsPaused: false,
      messageChannel: 'WHATSAPP',
    };

    expect(evaluateApprovedSendPolicy({ ...base, doNotContact: true, agentMode: 'AUTO' }).blocks).toContain('DO_NOT_CONTACT');
    expect(evaluateApprovedSendPolicy({ ...base, doNotContact: false, agentMode: 'HUMAN' }).blocks).toContain('HUMAN_TAKEOVER');
  });

  it('extracts durable handoff intent from a stored agent result for replay reconciliation', () => {
    const stored = {
      nextAgentMode: 'HUMAN',
      trace: { handoffReasons: ['MEETING_REQUEST', 'HIGH_INTENT'] },
    };
    expect(shouldPersistHumanHandoff(stored)).toBe(true);
    expect(humanHandoffReasons(stored)).toEqual(['MEETING_REQUEST', 'HIGH_INTENT']);
    expect(shouldPersistHumanHandoff({ nextAgentMode: 'AUTO' })).toBe(false);
  });
});
