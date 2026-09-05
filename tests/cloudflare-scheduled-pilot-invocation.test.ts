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
});
