export const SAHRA_FAST_CRON = '* * * * *';
export const SAHRA_FAST_SCOPE = {
  organizationId: '4824ef22-a53e-480f-b40e-be901e891a03',
  tenantBusinessId: 'c0db8ad8-04d5-40b8-843f-59b87a88bc0d',
  bindingId: '417d76e7-b228-4bfd-a20c-73dc660f8ebe',
} as const;

export type FastInboundCandidate = {
  id: string;
  organization_id: string;
  provider_message_id: string;
  received_at: string;
  metadata: Record<string, unknown>;
};
export type FastInboundResult = { attempted: boolean; sent: boolean; reason: string };
export type FastWindowDependencies = {
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
  scan: () => Promise<{ active: boolean; candidates: FastInboundCandidate[] }>;
  run: (candidate: FastInboundCandidate) => Promise<FastInboundResult>;
};
export type FastWindowMetrics = {
  scans: number; attempted: number; sent: number; blocked: number; failed: number; disabled: boolean;
};

export function selectFreshSahraInbound(rows: FastInboundCandidate[], now: number) {
  const latest = new Map<string, FastInboundCandidate>();
  for (const row of rows) {
    const at = Date.parse(row.received_at);
    const conversationId = row.metadata.conversation_id;
    if (row.organization_id !== SAHRA_FAST_SCOPE.organizationId
      || row.metadata.tenant_business_id !== SAHRA_FAST_SCOPE.tenantBusinessId
      || row.metadata.communication_channel_binding_id !== SAHRA_FAST_SCOPE.bindingId
      || typeof conversationId !== 'string' || !conversationId
      || !row.id || !row.provider_message_id
      || !Number.isFinite(at) || at > now || now - at > 120_000
      || !['text', 'audio', 'voice'].includes(String(row.metadata.type ?? '').toLowerCase())) continue;
    const previous = latest.get(conversationId);
    if (!previous || Date.parse(previous.received_at) < at) latest.set(conversationId, row);
  }
  return [...latest.values()].sort((a,b) => Date.parse(b.received_at) - Date.parse(a.received_at)).slice(0, 2);
}

/** Two read sweeps in one existing Worker scheduled invocation. No local queue,
 * no webhook paid work and no retry after the canonical paid claim. */
export async function runSahraFastWindow(
  deploymentEnv: string | undefined,
  scheduledTime: number | undefined,
  dependencies: FastWindowDependencies,
): Promise<FastWindowMetrics> {
  const metrics: FastWindowMetrics = { scans: 0, attempted: 0, sent: 0, blocked: 0, failed: 0, disabled: false };
  if (deploymentEnv?.trim().toLowerCase() !== 'production'
    || scheduledTime == null || !Number.isFinite(scheduledTime)
    || scheduledTime > dependencies.now() || dependencies.now() - scheduledTime >= 60_000) return metrics;
  const visited = new Set<string>();
  for (const offset of [0, 30_000]) {
    const wait = scheduledTime + offset - dependencies.now();
    if (wait > 0) await dependencies.sleep(wait);
    if (dependencies.now() >= scheduledTime + 60_000) break;
    try {
      const sweep = await dependencies.scan();
      metrics.scans++;
      if (!sweep.active) { metrics.disabled = true; break; }
      for (const row of selectFreshSahraInbound(sweep.candidates, dependencies.now())) {
        if (visited.has(row.id)) continue;
        visited.add(row.id);
        // Each invocation still goes through the atomic persisted inbound claim
        // and exact canonical approval/send gate. Full tick races cannot send twice.
        const result = await dependencies.run(row);
        if (result.attempted) metrics.attempted++;
        if (result.sent) metrics.sent++;
        else if (result.attempted) metrics.blocked++;
      }
    } catch {
      metrics.failed++;
      // An ambiguous paid boundary is never replayed by this window.
      break;
    }
  }
  return metrics;
}
