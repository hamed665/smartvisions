import { describe, expect, it } from 'vitest';
import {
  CONTROLLED_OMAN_AUTOMATION_AUTHORIZATION,
  mailboxWarmupAllowsAutomaticSend,
  verifyControlledEmailAutoPilot,
} from '@/lib/outreach/controlled-email-auto-pilot';

const campaignConfig = {
  marketCode: 'OM',
  targetDate: '2026-09-08',
  outreachMode: 'CONTROLLED',
  dailyOutreachTarget: true,
  shadowModeRequired: true,
  outreachEnabled: true,
  autoApprovalEnabled: true,
  automatedSendingEnabled: true,
  manualReviewOnly: false,
  automationAuthorization: CONTROLLED_OMAN_AUTOMATION_AUTHORIZATION,
};

const base = {
  messageStatus: 'APPROVED',
  requiresApproval: false,
  channel: 'EMAIL',
  metadataSource: 'SHADOW_MODE',
  providerMessageId: 'shadow:growth-first-touch:lead-1',
  idempotencyKey: 'growth-first-touch:lead-1',
  marketCode: 'OM',
  messageLeadId: 'lead-1',
  conversationLeadId: 'lead-1',
  conversationChannel: 'EMAIL',
  campaignStatus: 'RUNNING',
  campaignCountryCode: 'OM',
  campaignConfig,
  currentOmanDateKey: '2026-09-08',
};

describe('controlled Oman email autopilot', () => {
  it('verifies both a deterministic preapproval draft and its approved state', () => {
    expect(verifyControlledEmailAutoPilot({ ...base, messageStatus: 'APPROVAL_REQUIRED', requiresApproval: true }).verified).toBe(true);
    expect(verifyControlledEmailAutoPilot(base).verified).toBe(true);
  });

  it('fails closed without explicit owner automation authorization', () => {
    const result = verifyControlledEmailAutoPilot({
      ...base,
      campaignConfig: { ...campaignConfig, automationAuthorization: null },
    });
    expect(result).toEqual({ verified: false, reason: 'CAMPAIGN_OWNER_AUTHORIZATION_MISSING' });
  });

  it('fails closed for stale targets, manual-review mode and non-Oman messages', () => {
    expect(verifyControlledEmailAutoPilot({ ...base, currentOmanDateKey: '2026-09-09' }).verified).toBe(false);
    expect(verifyControlledEmailAutoPilot({ ...base, campaignConfig: { ...campaignConfig, manualReviewOnly: true } }).verified).toBe(false);
    expect(verifyControlledEmailAutoPilot({ ...base, marketCode: 'AE' }).verified).toBe(false);
  });

  it('requires explicit warmup readiness for automatic provider send', () => {
    expect(mailboxWarmupAllowsAutomaticSend('NOT_STARTED')).toBe(false);
    expect(mailboxWarmupAllowsAutomaticSend('WARMING')).toBe(false);
    expect(mailboxWarmupAllowsAutomaticSend('READY')).toBe(true);
    expect(mailboxWarmupAllowsAutomaticSend('COMPLETED')).toBe(true);
  });
});
