import handler from 'vinext/server/fetch-handler';

type WorkerEnv = { INTERNAL_API_KEY?: string };
type ScheduledController = { scheduledTime?: number; cron?: string };
type ExecutionContextLike = { waitUntil(promise: Promise<unknown>): void };

type AgentTask = {
  requestKey: string;
  channel: 'EMAIL' | 'WHATSAPP';
  payload: Record<string, unknown>;
};

type TickResponse = {
  agentTasks?: AgentTask[];
};

type ScheduledMetrics = {
  discovered: number;
  processed: number;
  safetyBlocked: number;
  idempotent: number;
  throttled: number;
  failed: number;
  reconciliationAttention: number;
  tickStatus: number;
};

function organizationIdFromTask(task: AgentTask) {
  const context = task.payload.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const organizationId = (context as Record<string, unknown>).organizationId;
  return typeof organizationId === 'string' && organizationId.trim() ? organizationId.trim() : null;
}

async function internalPost(env: WorkerEnv, path: string, body: unknown) {
  if (!env.INTERNAL_API_KEY) throw new Error('INTERNAL_API_KEY is required for scheduled operations');
  return handler.fetch(new Request(`https://smartvisions.internal${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-api-key': env.INTERNAL_API_KEY,
    },
    body: JSON.stringify(body),
  }));
}

async function recordScheduledHeartbeat(
  env: WorkerEnv,
  controller: ScheduledController | undefined,
  phase: 'START' | 'RESULT',
  metrics?: ScheduledMetrics,
) {
  const cron = typeof controller?.cron === 'string' ? controller.cron.trim() : '';
  if (!cron) return;
  try {
    await internalPost(env, '/api/operations/heartbeat', {
      source: 'CLOUDFLARE_CRON',
      phase,
      cron,
      scheduledTime: controller?.scheduledTime,
      metrics,
    });
  } catch {
    // Observability must never block or retry operational work.
  }
}

async function reportFailure(env: WorkerEnv, task: AgentTask, detail: string) {
  const organizationId = organizationIdFromTask(task);
  if (!organizationId) return;
  try {
    await internalPost(env, '/api/operations/report', {
      organizationId,
      code: 'AGENT_PROCESSING_FAILED',
      eventKey: `agent:${task.requestKey}:failed`,
      detail: detail.slice(0, 1000),
      entityType: 'agent_run',
      payload: { requestKey: task.requestKey, channel: task.channel },
    });
  } catch {
    // Reporting is never allowed to cause a paid AI retry.
  }
}

export async function runScheduledOperations(env: WorkerEnv, controller?: ScheduledController) {
  await recordScheduledHeartbeat(env, controller, 'START');

  const tickResponse = await internalPost(env, '/api/operations/tick', {});
  const metrics: ScheduledMetrics = {
    discovered: 0,
    processed: 0,
    safetyBlocked: 0,
    idempotent: 0,
    throttled: 0,
    failed: 0,
    reconciliationAttention: 0,
    tickStatus: tickResponse.status,
  };
  if (!tickResponse.ok) {
    metrics.failed += 1;
    await recordScheduledHeartbeat(env, controller, 'RESULT', metrics);
    throw new Error(`Operational tick failed with HTTP ${tickResponse.status}`);
  }

  const tick = await tickResponse.json() as TickResponse;
  const tasks = Array.isArray(tick.agentTasks) ? tick.agentTasks.slice(0, 5) : [];
  metrics.discovered = tasks.length;

  for (const task of tasks) {
    const organizationId = organizationIdFromTask(task);
    if (!organizationId) {
      metrics.failed += 1;
      continue;
    }

    let guard: Response;
    try {
      guard = await internalPost(env, '/api/operations/channel-guard', { organizationId, channel: task.channel });
    } catch (error) {
      metrics.failed += 1;
      await reportFailure(env, task, error instanceof Error ? error.message : 'Channel guard invocation failed');
      continue;
    }
    if (!guard.ok) {
      if (guard.status >= 500) {
        metrics.failed += 1;
        const detail = await guard.text().catch(() => 'Channel guard unavailable');
        await reportFailure(env, task, `Channel guard HTTP ${guard.status}: ${detail}`);
      } else {
        metrics.safetyBlocked += 1;
      }
      continue;
    }

    let response: Response;
    try {
      response = await internalPost(env, '/api/ai/process-inbound', task.payload);
    } catch (error) {
      metrics.failed += 1;
      await reportFailure(env, task, error instanceof Error ? error.message : 'Agent invocation failed');
      continue;
    }

    if (!response.ok) {
      // 409 is an idempotency race; 423 is a deliberate safety pause; 429 is Cost Guard/quota.
      // None should trigger automatic retry or duplicate paid work.
      if (response.status === 409) metrics.idempotent += 1;
      else if (response.status === 423) metrics.safetyBlocked += 1;
      else if (response.status === 429) metrics.throttled += 1;
      else {
        metrics.failed += 1;
        const detail = await response.text().catch(() => 'Agent processing failed');
        await reportFailure(env, task, `HTTP ${response.status}: ${detail}`);
      }
      continue;
    }

    metrics.processed += 1;
    if (task.channel === 'EMAIL') {
      const reconciliation = await internalPost(env, '/api/operations/email-shadow', {
        organizationId,
        requestKey: task.requestKey,
      });
      if (reconciliation.status === 202 || reconciliation.status >= 500) {
        metrics.reconciliationAttention += 1;
        const detail = await reconciliation.text().catch(() => 'Email Shadow reconciliation requires attention');
        try {
          await internalPost(env, '/api/operations/report', {
            organizationId,
            code: 'RECONCILIATION_REQUIRED',
            eventKey: `email-shadow:${task.requestKey}:reconciliation`,
            detail: `Email Shadow reconciliation: HTTP ${reconciliation.status}: ${detail}`.slice(0, 1000),
            entityType: 'agent_run',
            payload: { requestKey: task.requestKey },
          });
        } catch {
          // Notification failure does not affect the completed Agent run.
        }
      }
    }
  }

  await recordScheduledHeartbeat(env, controller, 'RESULT', metrics);
  return metrics;
}

const worker = {
  fetch(request: Request) {
    return handler.fetch(request);
  },
  scheduled(controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContextLike) {
    ctx.waitUntil(runScheduledOperations(env, controller));
  },
};

export default worker;
