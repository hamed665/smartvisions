import { describe, expect, it } from 'vitest';
import {
  evaluateProjectHunter,
  normalizeProjectHunterInput,
  projectHunterSourceId,
} from '@/lib/hunters/intent/project-hunter';

// Synthetic unit-test input only: NOT a real project, sender or Production fixture.
const example = {
  channel: 'PEOPLEPERHOUR' as const,
  title: 'Next.js TypeScript SaaS integration project',
  body: 'Seeking a developer to integrate Next.js, TypeScript, React, Supabase, and an AI agent into an existing SaaS product. Remote collaboration.',
  sourceUrl: 'https://www.peopleperhour.com/freelance-jobs/example-project/123456?utm_source=email&ref=alert',
};

describe('PeoplePerHour official-email channel readiness (no provider calls)', () => {
  it('only accepts official PeoplePerHour HTTPS source hosts', () => {
    const normalized = normalizeProjectHunterInput(example);
    expect(new URL(normalized.sourceUrl).hostname).toBe('www.peopleperhour.com');
    expect(normalized.sourceUrl).not.toContain('utm_source');
    expect(normalized.sourceUrl).not.toContain('ref=');
    expect(() => normalizeProjectHunterInput({
      ...example,
      sourceUrl: 'https://peopleperhour.com.evil.example/freelance-jobs/123',
    })).toThrow('does not match');
    expect(() => normalizeProjectHunterInput({
      ...example,
      sourceUrl: 'http://www.peopleperhour.com/freelance-jobs/123',
    })).toThrow();
  });

  it('deduplicates the same source after removing email tracking', () => {
    const tracked = normalizeProjectHunterInput(example);
    const plain = normalizeProjectHunterInput({
      ...example,
      sourceUrl: 'https://www.peopleperhour.com/freelance-jobs/example-project/123456',
    });
    expect(projectHunterSourceId('PEOPLEPERHOUR', tracked.sourceUrl))
      .toBe(projectHunterSourceId('PEOPLEPERHOUR', plain.sourceUrl));
  });

  it('does not invent a price or verified payment from an email alert', () => {
    const result = evaluateProjectHunter(example, '2026-10-11T14:00:00Z');
    expect(result.input.budgetAmount).toBeUndefined();
    expect(result.input.paymentVerified).toBeUndefined();
    expect(result.contactability).toBe('REVIEW');
    expect(result.sourceType).toBe('peopleperhour_alert');
  });

  it('withholds drafts for explicit UK-only eligibility', () => {
    const result = evaluateProjectHunter({
      ...example,
      body: example.body + ' UK residents only.',
    }, '2026-10-11T14:00:00Z');
    expect(result.geoRestricted).toBe(true);
    expect(result.fitScore).toBe(0);
    expect(result.status).toBe('REVIEW');
    expect(result.draft).toBeNull();
  });
});
