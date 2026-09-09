import { describe, expect, it } from 'vitest';
import {
  evidencePipelineAuditDecision,
  evidencePipelineCandidatePriority,
  evidencePipelineLeadBlocksCandidate,
  evidencePipelineTargetMatches,
} from '@/lib/operations/evidence-pipeline-policy';

describe('controlled evidence pipeline policy', () => {
  it('keeps a scoped Muscat dental campaign inside its city and industry', () => {
    expect(evidencePipelineTargetMatches({ targetCity: 'Muscat', targetIndustry: 'Dental', businessCity: 'Muscat', category: 'Dentist' })).toBe(true);
    expect(evidencePipelineTargetMatches({ targetCity: 'Muscat', targetIndustry: 'Dental', businessCity: 'Salalah', category: 'Dental clinic' })).toBe(false);
    expect(evidencePipelineTargetMatches({ targetCity: 'Muscat', targetIndustry: 'Dental', formattedAddress: 'Muscat, Oman', category: 'Beauty salon' })).toBe(false);
  });

  it('prioritizes contact-ready Tier A prospects with an existing email before enrichment candidates', () => {
    expect(evidencePipelineCandidatePriority({
      prospectTier: 'A',
      shouldContact: true,
      cheapestNextAction: 'CONTACT_READY',
      hasStandaloneWebsite: true,
      hasEmail: true,
    })).toBe(0);
    expect(evidencePipelineCandidatePriority({
      prospectTier: 'A',
      shouldContact: true,
      cheapestNextAction: 'CONTACT_READY',
      hasStandaloneWebsite: true,
      hasEmail: false,
    })).toBe(1);
  });

  it('then accepts website-evidence candidates and rejects unrelated or no-website rows', () => {
    expect(evidencePipelineCandidatePriority({
      prospectTier: 'SKIP',
      shouldContact: false,
      cheapestNextAction: 'WEBSITE_EVIDENCE',
      hasStandaloneWebsite: true,
      hasEmail: false,
    })).toBe(2);
    expect(evidencePipelineCandidatePriority({
      prospectTier: 'A',
      shouldContact: true,
      cheapestNextAction: 'CONTACT_READY',
      hasStandaloneWebsite: false,
      hasEmail: true,
    })).toBeNull();
    expect(evidencePipelineCandidatePriority({
      prospectTier: 'B',
      shouldContact: false,
      cheapestNextAction: 'SOCIAL_CHECK',
      hasStandaloneWebsite: true,
      hasEmail: false,
    })).toBeNull();
  });

  it('blocks candidates that cannot advance first-touch while preserving blocked-channel recovery', () => {
    expect(evidencePipelineLeadBlocksCandidate({ hasExactEmailFirstTouch: true })).toBe(true);
    expect(evidencePipelineLeadBlocksCandidate({ hasNonBlockedConversationActivity: true })).toBe(true);
    expect(evidencePipelineLeadBlocksCandidate({ hasOutreachActivity: true })).toBe(true);
    expect(evidencePipelineLeadBlocksCandidate({ leadStatus: 'DO_NOT_CONTACT' })).toBe(true);
    expect(evidencePipelineLeadBlocksCandidate({ leadAgentMode: 'HUMAN' })).toBe(true);
    expect(evidencePipelineLeadBlocksCandidate({ latestEmailConversationStage: 'QUALIFYING' })).toBe(true);
    expect(evidencePipelineLeadBlocksCandidate({ latestEmailConversationRequiresHuman: true })).toBe(true);
    expect(evidencePipelineLeadBlocksCandidate({
      leadStatus: 'NEW',
      leadAgentMode: 'AUTO',
      hasExactEmailFirstTouch: false,
      hasNonBlockedConversationActivity: false,
      hasOutreachActivity: false,
      latestEmailConversationStage: 'NEW',
      latestEmailConversationAgentMode: 'AUTO',
      latestEmailConversationRequiresHuman: false,
    })).toBe(false);
  });

  it('reuses a fresh real Supabase audit only when it contains a first-party email', () => {
    const now = new Date('2026-09-06T10:00:00Z');
    expect(evidencePipelineAuditDecision({
      status: 'SUCCEEDED',
      audited_at: '2026-09-05T10:00:00Z',
      source_url: 'https://www.example.om/contact',
      contact_emails: ['sales@example.om'],
    }, now, 30)).toBe('USE_CACHED');
  });

  it('does not let a fresh no-email success monopolize every scheduled tick', () => {
    const now = new Date('2026-09-06T10:00:00Z');
    expect(evidencePipelineAuditDecision({
      status: 'SUCCEEDED',
      audited_at: '2026-09-05T10:00:00Z',
      source_url: 'https://example.om',
      contact_emails: [],
    }, now, 30)).toBe('WAIT_AFTER_FAILURE');
  });

  it('does not automatically retry a failed website inside 24 hours', () => {
    const now = new Date('2026-09-06T10:00:00Z');
    expect(evidencePipelineAuditDecision({
      status: 'FAILED',
      audited_at: '2026-09-06T09:00:00Z',
    }, now, 30)).toBe('WAIT_AFTER_FAILURE');
    expect(evidencePipelineAuditDecision({
      status: 'FAILED',
      audited_at: '2026-09-05T08:00:00Z',
    }, now, 30)).toBe('FETCH');
  });
});
