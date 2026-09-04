export type AgentRunReplayState = 'NEW' | 'REPLAY' | 'IN_PROGRESS' | 'FAILED_LOCKED';

export function agentRunReplayState(run?: { status?: string | null; result_payload?: unknown } | null): AgentRunReplayState {
  if (!run) return 'NEW';
  if (run.status === 'COMPLETED' && run.result_payload) return 'REPLAY';
  if (run.status === 'PROCESSING') return 'IN_PROGRESS';
  return 'FAILED_LOCKED';
}

export function normalizeIdempotencyKey(value: string) {
  const key = value.trim();
  if (key.length < 8 || key.length > 160) throw new Error('idempotencyKey must be 8-160 characters');
  if (!/^[A-Za-z0-9._:=-]+$/.test(key)) throw new Error('idempotencyKey contains unsupported characters');
  return key;
}
