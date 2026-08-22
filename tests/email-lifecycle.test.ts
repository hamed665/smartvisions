import { describe, expect, it } from 'vitest';
import { shouldReplayEmailSideEffects } from '@/lib/outreach/email-lifecycle';

describe('email lifecycle retry behavior', () => {
  it('replays side effects for both first delivery and duplicate webhook retries', () => {
    expect(shouldReplayEmailSideEffects(1)).toBe(true);
    expect(shouldReplayEmailSideEffects(0)).toBe(true);
  });
});
