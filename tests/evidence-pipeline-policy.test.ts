import { describe, expect, it } from 'vitest';
import { evidencePipelineAuditDecision, evidencePipelineCandidatePriority } from '@/lib/operations/evidence-pipeline-policy';

describe('controlled evidence pipeline policy', () => {
  it('prioritizes Tier A prospects that have a website but still lack email', () => {
    expect(evidencePipelineCandidatePriority({
      prospectTier: 'A',
      shouldContact: true,
      cheapestNextAction: 'CONTACT_READY',
      hasStandaloneWebsite: true,
      hasEmail: false,
    })).toBe(0);
  });

  it('then accepts website-evidence candidates and rejects unrelated or no-website rows', () => {
    expect(evidencePipelineCandidatePriority({
      prospectTier: 'SKIP',
      shouldContact: false,
      cheapestNextAction: 'WEBSITE_EVIDENCE',
      hasStandaloneWebsite: true,
      hasEmail: false,
    })).toBe(1);
    expect(evidencePipelineCandidatePriority({
      prospectTier: 'A',
      shouldContact: true,
      cheapestNextAction: 'CONTACT_READY',
      hasStandaloneWebsite: false,
      hasEmail: false,
    })).toBeNull();
    expect(evidencePipelineCandidatePriority({
      prospectTier: 'B',
      shouldContact: false,
      cheapestNextAction: 'SOCIAL_CHECK',
      hasStandaloneWebsite: true,
      hasEmail: false,
    })).toBeNull();
  });

  it('reuses fresh successful evidence instead of refetching', () => {
    const now = new Date('2026-09-06T10:00:00Z');
    expect(evidencePipelineAuditDecision({
      status: 'SUCCEEDED',
      auditedAt: '2026-09-05T10:00:00Z',
    }, now, 30)).toBe('USE_CACHED');
  });

  it('does not automatically retry a failed website inside 24 hours', () => {
    const now = new Date('2026-09-06T10:00:00Z');
    expect(evidencePipelineAuditDecision({
      status: 'FAILED',
      auditedAt: '2026-09-06T09:00:00Z',
    }, now, 30)).toBe('WAIT_AFTER_FAILURE');
    expect(evidencePipelineAuditDecision({
      status: 'FAILED',
      auditedAt: '2026-09-05T08:00:00Z',
    }, now, 30)).toBe('FETCH');
  });
});
