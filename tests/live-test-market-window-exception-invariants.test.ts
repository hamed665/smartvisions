import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('live-test market-window exception invariants', () => {
  it('requires active live provenance, durable claim and the existing live policy', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/whatsapp/live-test-market-window-exception.ts'), 'utf8');
    expect(source).toContain('controlledInboundId(input.idempotencyKey)');
    expect(source).toContain('controlledInboundEvidence({');
    expect(source).toContain('if (!evidence.allowed) return false');
  });

  it('does not let a controlled-pilot request alone bypass the provider-boundary market gate', () => {
    const core = readFileSync(resolve(process.cwd(), 'app/api/outreach/approved-send/route-core.ts'), 'utf8');
    expect(core).toContain('liveTestMarketWindowExceptionVerified = await verifyLiveTestMarketWindowException({');
    expect(core).toContain('if (!window.allowed && !liveTestMarketWindowExceptionVerified)');
    expect(core).toContain('marketWindowExceptionVerified: liveTestMarketWindowExceptionVerified');
  });

  it('never lets the temporary exception enable a disabled market', () => {
    const gate = readFileSync(resolve(process.cwd(), 'lib/outreach/canonical-send-gate.ts'), 'utf8');
    expect(gate).toContain('const marketWindowAllowed = Boolean(market.enabled)');
    expect(gate).toContain('&& (marketWindow.allowed || Boolean(input.marketWindowExceptionVerified));');
  });

  it('keeps the outer preflight fail-closed for normal sends and disabled markets', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/outreach/approved-send/route.ts'), 'utf8');
    expect(route).toContain('if (!window.allowed && !body.controlledShadowPilot)');
    expect(route).toContain('if (!market.enabled)');
    expect(route).toContain('return corePost(request);');
  });
});
