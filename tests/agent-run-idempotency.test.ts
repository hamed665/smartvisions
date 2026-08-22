import { describe, expect, it } from 'vitest';
import { agentRunReplayState, normalizeIdempotencyKey } from '@/lib/agents/idempotency';

describe('agent run idempotency', () => {
  it('replays completed requests without rerunning paid AI', () => {
    expect(agentRunReplayState({ status: 'COMPLETED', result_payload: { ok: true } })).toBe('REPLAY');
  });

  it('blocks blind retry for processing and failed logical requests', () => {
    expect(agentRunReplayState({ status: 'PROCESSING', result_payload: null })).toBe('IN_PROGRESS');
    expect(agentRunReplayState({ status: 'FAILED', result_payload: null })).toBe('FAILED_LOCKED');
  });

  it('validates caller idempotency keys', () => {
    expect(normalizeIdempotencyKey('wa:message:12345')).toBe('wa:message:12345');
    expect(() => normalizeIdempotencyKey('short')).toThrow();
    expect(() => normalizeIdempotencyKey('bad key with spaces')).toThrow();
  });
});
