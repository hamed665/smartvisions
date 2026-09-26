import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Cloudflare scheduled pilot invocation', () => {
  it('invokes canonical evidence, controlled dispatch and acquisition handlers in-process', () => {
    const source = readFileSync(resolve(process.cwd(), 'worker/index.ts'), 'utf8');

    expect(source).toContain("import { POST as controlledAutoDispatchPost } from '../app/api/operations/controlled-auto-dispatch/route'");
    expect(source).toContain("controlledAutoDispatchPost(internalJsonRequest(env, '/api/operations/controlled-auto-dispatch', {}))");
    expect(source).toContain("pilotAcquisitionPost(internalJsonRequest(env, '/api/operations/pilot-acquisition', {}))");
    expect(source).not.toContain("internalPost(env, '/api/operations/pilot-acquisition', {})");
    expect(source).toContain("import { POST as chatwootInboxReconcilePost } from '../app/api/operations/chatwoot-inbox-reconcile/route'");
    expect(source).toContain("internalJsonRequest(env, '/api/operations/chatwoot-inbox-reconcile', { limit: 10 })");
  });

  it('keeps normal Worker fetch routing and gates scheduled work only by production environment', () => {
    const source = readFileSync(resolve(process.cwd(), 'worker/index.ts'), 'utf8');

    expect(source).toContain('return handler.fetch(request)');
    expect(source).toContain('if (!shouldRunScheduledOperations(env)) return');
    expect(source).toContain("internalPost(env, '/api/operations/tick', {})");
  });

  it('routes inbound agent tasks through the channel guard before the canonical Agent endpoint', () => {
    const worker = readFileSync(resolve(process.cwd(), 'worker/index.ts'), 'utf8');
    const tick = readFileSync(resolve(process.cwd(), 'app/api/operations/tick/route.ts'), 'utf8');

    expect(worker).toContain('const tasks = Array.isArray(tick.agentTasks) ? tick.agentTasks.slice(0, 5) : []');
    expect(worker).toContain("internalPost(env, '/api/operations/channel-guard', { organizationId, channel: task.channel })");
    expect(worker).toContain("internalPost(env, '/api/ai/process-inbound', task.payload)");
    expect(worker.indexOf("'/api/operations/channel-guard'")).toBeLessThan(worker.indexOf("'/api/ai/process-inbound'"));

    expect(tick).toContain(".eq('direction', 'INBOUND').eq('status', 'RECEIVED').in('channel', ['EMAIL','WHATSAPP'])");
    expect(tick).toContain("payload.deliveryContext = { conversationId, to, marketCode }");
    expect(tick).toContain("agentTasks.push({ requestKey, channel: channel as 'EMAIL'|'WHATSAPP', payload })");
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
