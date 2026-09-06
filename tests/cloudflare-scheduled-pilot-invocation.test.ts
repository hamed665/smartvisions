import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Cloudflare scheduled pilot invocation', () => {
  it('invokes the canonical pilot acquisition handler in-process', () => {
    const source = readFileSync(resolve(process.cwd(), 'worker/index.ts'), 'utf8');

    expect(source).toContain("import { POST as pilotAcquisitionPost } from '../app/api/operations/pilot-acquisition/route'");
    expect(source).toContain("pilotAcquisitionPost(internalJsonRequest(env, '/api/operations/pilot-acquisition', {}))");
    expect(source).not.toContain("internalPost(env, '/api/operations/pilot-acquisition', {})");
  });

  it('keeps normal Worker fetch routing and scheduled environment gating unchanged', () => {
    const source = readFileSync(resolve(process.cwd(), 'worker/index.ts'), 'utf8');

    expect(source).toContain('return handler.fetch(request)');
    expect(source).toContain('if (!shouldRunScheduledOperations(env)) return');
    expect(source).toContain("internalPost(env, '/api/operations/tick', {})");
  });

  it('records Cloudflare worker version metadata without turning heartbeat failures into retries', () => {
    const worker = readFileSync(resolve(process.cwd(), 'worker/index.ts'), 'utf8');
    const wrangler = readFileSync(resolve(process.cwd(), 'wrangler.jsonc'), 'utf8');

    expect(wrangler).toContain('"binding": "CF_VERSION_METADATA"');
    expect(worker).toContain('CF_VERSION_METADATA?: WorkerVersionMetadata');
    expect(worker).toContain('workerVersion: env.CF_VERSION_METADATA ?? {}');
    expect(worker).toContain('// Observability must never block or retry operational work.');
  });

  it('keeps duplicate and safety responses non-retryable in the scheduled loop', () => {
    const worker = readFileSync(resolve(process.cwd(), 'worker/index.ts'), 'utf8');

    expect(worker).toContain('if (response.status === 409) metrics.idempotent += 1');
    expect(worker).toContain('else if (response.status === 423) metrics.safetyBlocked += 1');
    expect(worker).toContain('else if (response.status === 429) metrics.throttled += 1');
  });
});
