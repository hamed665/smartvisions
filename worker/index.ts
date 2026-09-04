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

export async function runScheduledOperations(env: WorkerEnv) {
  const tickResponse = await internalPost(env, '/api/operations/tick', {});
  if (!tickResponse.ok) throw new Error(`Operational tick failed with HTTP ${tickResponse.status}`);
  const tick = await tickResponse.json() as TickResponse;
  const tasks = Array.isArray(tick.agentTasks) ? tick.agentTasks.slice(0, 5) : [];

  for (const task of tasks) {
    const organizationId = organizationIdFromTask(task);
    if (!organizationId) continue;
    let response: Response;
    try {
      response = await internalPost(env, '/api/ai/process-inbound', task.payload);
    } catch (error) {
      await reportFailure(env, task, error instanceof Error ? error.message : 'Agent invocation failed');
      continue;
    }

    if (!response.ok) {
      // 409 is an idempotency race; 423 is a deliberate safety pause; 429 is Cost Guard/quota.
      // None should trigger automatic retry or duplicate paid work.
      if (![409, 423, 429].includes(response.status)) {
        const detail = await response.text().catch(() => 'Agent processing failed');
        await reportFailure(env, task, `HTTP ${response.status}: ${detail}`);
      }
      continue;
    }

    if (task.channel === 'EMAIL') {
      const reconciliation = await internalPost(env, '/api/operations/email-shadow', {
        organizationId,
        requestKey: task.requestKey,
      });
      if (reconciliation.status === 202 || reconciliation.status >= 500) {
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

  return { discovered: tasks.length };
}

export default {
  fetch(request: Request) {
    return handler.fetch(request);
  },
  scheduled(_controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContextLike) {
    ctx.waitUntil(runScheduledOperations(env));
  },
};
