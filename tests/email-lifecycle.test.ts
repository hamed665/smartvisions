import { describe, expect, it } from 'vitest';
import { isEmailInboundDuplicateError, shouldReplayEmailSideEffects } from '@/lib/outreach/email-lifecycle';

describe('email lifecycle retry behavior', () => {
  it('replays side effects for both first delivery and duplicate webhook retries', () => {
    expect(shouldReplayEmailSideEffects(1)).toBe(true);
    expect(shouldReplayEmailSideEffects(0)).toBe(true);
  });

  it('treats only PostgreSQL unique violations as idempotent inbound duplicates', () => {
    expect(isEmailInboundDuplicateError('23505')).toBe(true);
    expect(isEmailInboundDuplicateError('42P10')).toBe(false);
    expect(isEmailInboundDuplicateError(undefined)).toBe(false);
  });
});
