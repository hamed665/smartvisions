import { describe, expect, it, vi } from 'vitest';
import { runSahraFastWindow, selectFreshSahraInbound, SAHRA_FAST_SCOPE, type FastInboundCandidate } from '@/lib/whatsapp/sahra-fast-inbound-core';

const start = Date.parse('2026-10-14T12:00:00Z');
function candidate(id = 'message-1', at = start): FastInboundCandidate {
  return { id, organization_id: SAHRA_FAST_SCOPE.organizationId,
    provider_message_id: 'meta-' + id, received_at: new Date(at).toISOString(),
    metadata: { conversation_id: 'conversation-1', type: 'text',
      tenant_business_id: SAHRA_FAST_SCOPE.tenantBusinessId,
      communication_channel_binding_id: SAHRA_FAST_SCOPE.bindingId } };
}
function harness(rows: FastInboundCandidate[] = []) {
  let clock = start;
  const scan = vi.fn(async () => ({ active: true, candidates: rows }));
  const run = vi.fn(async () => ({ attempted: true, sent: true, reason: 'SENT' }));
  const sleep = vi.fn(async (ms: number) => { clock += ms; });
  return { deps: { now: () => clock, sleep, scan, run }, setClock: (at: number) => { clock = at; } };
}

describe('bounded Sahra fresh inbound latency', () => {
  it('scans at zero and thirty seconds without invoking the full operations tick', async () => {
    const h = harness();
    const result = await runSahraFastWindow('production', start, h.deps);
    expect(result.scans).toBe(2);
    expect(h.deps.sleep).toHaveBeenCalledWith(30_000);
    expect(h.deps.run).not.toHaveBeenCalled();
  });
  it.each(['candidate', undefined, 'development'])('does no reads or paid work in %s', async (env) => {
    const h = harness([candidate()]);
    await runSahraFastWindow(env, start, h.deps);
    expect(h.deps.scan).not.toHaveBeenCalled();
    expect(h.deps.run).not.toHaveBeenCalled();
  });
  it.each([undefined, start + 1, start - 60_000, NaN])('does not start stale/invalid scheduled windows %#', async (at) => {
    const h = harness([candidate()]);
    await runSahraFastWindow('production', at, h.deps);
    expect(h.deps.scan).not.toHaveBeenCalled();
  });
  it('detects a new customer message on the second sweep', async () => {
    const h = harness();
    h.deps.scan.mockResolvedValueOnce({ active: true, candidates: [] })
      .mockResolvedValueOnce({ active: true, candidates: [candidate('new', start + 15_000)] });
    const result = await runSahraFastWindow('production', start, h.deps);
    expect(result.sent).toBe(1);
    expect(h.deps.run).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }));
  });
  it('never retries the same candidate within a window', async () => {
    const h = harness([candidate()]);
    const result = await runSahraFastWindow('production', start, h.deps);
    expect(h.deps.run).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
  });
  it('stops before execution when permanent service or safety controls are disabled', async () => {
    const h = harness([candidate()]);
    h.deps.scan.mockResolvedValue({ active: false, candidates: [candidate()] });
    const result = await runSahraFastWindow('production', start, h.deps);
    expect(result.disabled).toBe(true);
    expect(h.deps.run).not.toHaveBeenCalled();
    expect(h.deps.sleep).not.toHaveBeenCalled();
  });
  it('stops after ambiguous paid execution failure without a replay', async () => {
    const h = harness([candidate()]);
    h.deps.run.mockRejectedValueOnce(new Error('ambiguous provider response'));
    const result = await runSahraFastWindow('production', start, h.deps);
    expect(result.failed).toBe(1);
    expect(h.deps.run).toHaveBeenCalledTimes(1);
    expect(h.deps.sleep).not.toHaveBeenCalled();
  });
  it('does not run a second late sweep after a slow paid operation', async () => {
    const h = harness([candidate()]);
    h.deps.run.mockImplementationOnce(async () => {
      h.setClock(start + 65_000);
      return { attempted: true, sent: true, reason: 'SENT' };
    });
    const result = await runSahraFastWindow('production', start, h.deps);
    expect(result.scans).toBe(1);
  });
  it('preserves a canonical claim-race rejection without paid retry', async () => {
    const h = harness([candidate()]);
    h.deps.run.mockResolvedValue({ attempted: true, sent: false, reason: 'LIVE_TEST_INBOUND_ALREADY_CLAIMED' });
    const result = await runSahraFastWindow('production', start, h.deps);
    expect(result.blocked).toBe(1);
    expect(h.deps.run).toHaveBeenCalledTimes(1);
  });
  it('rejects other tenants, bindings, stale/future data and unsupported media', () => {
    const wrongOrganization = { ...candidate('other-org'), organization_id: 'another-org' };
    const wrongTenant = candidate('other-tenant'); wrongTenant.metadata.tenant_business_id = 'other';
    const wrongBinding = candidate('other-binding'); wrongBinding.metadata.communication_channel_binding_id = 'other';
    const image = candidate('image'); image.metadata.type = 'image';
    const result = selectFreshSahraInbound([
      wrongOrganization, wrongTenant, wrongBinding, candidate('old', start - 120_001),
      candidate('future', start + 1), image, candidate('valid'),
    ], start);
    expect(result.map((row) => row.id)).toEqual(['valid']);
  });
  it('only considers the newest message per conversation and bounds each sweep', () => {
    const a = candidate('a', start - 5000);
    const b = candidate('b', start - 1000);
    const c = candidate('c', start - 2000); c.metadata.conversation_id = 'conversation-2';
    const d = candidate('d', start - 3000); d.metadata.conversation_id = 'conversation-3';
    expect(selectFreshSahraInbound([a,b,c,d], start).map((row) => row.id)).toEqual(['b','c']);
  });
});
