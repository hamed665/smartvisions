import { describe, expect, it } from 'vitest';
import {
  evaluateProjectHunter,
  normalizeProjectHunterInput,
  projectHunterSourceId,
} from '@/lib/hunters/intent/project-hunter';

// Unit-test-only example; no real client, job or Production data.
const sample = {
  channel: 'CONTRA' as const,
  title: 'React TypeScript SaaS integration',
  body: 'Remote project integrating React, TypeScript, Supabase and AI agents into an existing SaaS application.',
  sourceUrl: 'https://contra.com/jobs/sample?utm_source=email&ref=alert',
};

describe('Contra source validation', () => {
  it('normalizes official HTTPS URLs and removes tracking', () => {
    const normalized = normalizeProjectHunterInput(sample);
    expect(new URL(normalized.sourceUrl).hostname).toBe('contra.com');
    expect(normalized.sourceUrl).not.toContain('utm_source');
    expect(normalized.sourceUrl).not.toContain('ref=');
  });

  it('deduplicates equivalent listing URLs', () => {
    const first = normalizeProjectHunterInput(sample);
    const second = normalizeProjectHunterInput({
      ...sample,
      sourceUrl: 'https://contra.com/jobs/sample',
    });
    expect(projectHunterSourceId('CONTRA', first.sourceUrl))
      .toBe(projectHunterSourceId('CONTRA', second.sourceUrl));
  });

  it('does not infer budget or verified client from unverified input', () => {
    const result = evaluateProjectHunter(sample, '2026-10-12T08:00:00Z');
    expect(result.sourceType).toBe('public_post');
    expect(result.input.budgetAmount).toBeUndefined();
    expect(result.input.paymentVerified).toBeUndefined();
    expect(result.contactability).toBe('REVIEW');
  });

  it('withholds drafts for country-only restrictions', () => {
    const result = evaluateProjectHunter({
      ...sample,
      body: sample.body + ' United States residents only.',
    }, '2026-10-12T08:00:00Z');
    expect(result.geoRestricted).toBe(true);
    expect(result.status).toBe('REVIEW');
    expect(result.draft).toBeNull();
  });
});
