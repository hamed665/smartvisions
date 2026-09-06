import handler from 'vinext/server/fetch-handler';
import { POST as evidencePipelinePost } from '../app/api/operations/evidence-pipeline/route';
import { POST as pilotAcquisitionPost } from '../app/api/operations/pilot-acquisition/route';
import { shouldRunScheduledOperations } from './schedule-policy';

type WorkerEnv = { INTERNAL_API_KEY?: string; DEPLOYMENT_ENV?: string };
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
  evidenceStatus?: number;
  evidenceFailedOutcomes?: number;
  evidenceAction?: string;
  evidenceReason?: string;
  evidenceFirstTouchStatus?: string;
  evidenceFirstTouchReason?: string;
  pilotStatus?: number;
  pilotFailedOutcomes?: number;
};

function organizationIdFromTask(task: AgentTask) {
  const context = task.payload.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const organizationId = (context as Record<string, unknown>).organizationId;
  return typeof organizationId === 'string' && organizationId.trim() ? organizationId.trim() : null;
}

function internalJsonRequest(env: WorkerEnv, path: string, body: unknown) {
  if (!env.INTERNAL_API_KEY) throw new Error('INTERNAL_API_KEY is required for scheduled operations');
  return new Request(`https://smartvisions.internal${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-api-key': env.INTERNAL_API_KEY,
    },
    body: JSON.stringify(body),
  });
}

async function internalPost(env: WorkerEnv, path: string, body: unknown) {
  return handler.fetch(internalJsonRequest(env, path, body));
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

  // Use already-discovered first-party websites before buying more Google Places detail work.
  // This route is deterministic and can only produce Shadow drafts; it never calls an LLM,
  // paid enrichment provider, or outbound provider. One evidence candidate is processed per tick.
  try {
    const evidenceResponse = await evidencePipelinePost(internalJsonRequest(env, '/api/operations/evidence-pipeline', {}));
    metrics.evidenceStatus = evidenceResponse.status;
    if (evidenceResponse.status === 429) metrics.throttled += 1;
    else if (evidenceResponse.status === 409 || evidenceResponse.status === 423) metrics.safetyBlocked += 1;
    else if (!evidenceResponse.ok) metrics.failed += 1;
    else {
      const evidence = await evidenceResponse.json().catch(() => null) as {
        action?: string;
        reason?: string;
        firstTouch?: { status?: string; reason?: string };
      } | null;
      metrics.evidenceAction = typeof evidence?.action === 'string' ? evidence.action : undefined;
      metrics.evidenceReason = typeof evidence?.reason === 'string' ? evidence.reason : undefined;
      metrics.evidenceFirstTouchStatus = typeof evidence?.firstTouch?.status === 'string' ? evidence.firstTouch.status : undefined;
      metrics.evidenceFirstTouchReason = typeof evidence?.firstTouch?.reason === 'string' ? evidence.firstTouch.reason : undefined;
      metrics.evidenceFailedOutcomes = evidence?.action === 'FAILED' ? 1 : 0;
      if (metrics.evidenceFailedOutcomes) metrics.failed += 1;
    }
  } catch {
    metrics.failed += 1;
  }

  // Acquisition is deliberately isolated from inbound Agent work. It is a no-op unless
  // an Oman campaign is explicitly time-boxed with Shadow/manual-review safeguards.
  // It runs after deterministic website evidence so we never spend on a new Place detail
  // while a cheaper, already-discovered first-party evidence path is available.
  try {
    const pilotResponse = await pilotAcquisitionPost(internalJsonRequest(env, '/api/operations/pilot-acquisition', {}));
    metrics.pilotStatus = pilotResponse.status;
    if (pilotResponse.status === 429) metrics.throttled += 1;
    else if (pilotResponse.status === 409 || pilotResponse.status === 423) metrics.safetyBlocked += 1;
    else if (!pilotResponse.ok) metrics.failed += 1;
    else {
      const pilot = await pilotResponse.json().catch(() => null) as { outcomes?: Array<{ action?: string }> } | null;
      const failedOutcomes = (pilot?.outcomes ?? []).filter((outcome) => outcome.action === 'FAILED').length;
      metrics.pilotFailedOutcomes = failedOutcomes;
      if (failedOutcomes > 0) metrics.failed += failedOutcomes;
    }
  } catch {
    metrics.failed += 1;
  }

  await recordScheduledHeartbeat(env, controller, 'RESULT', metrics);
  return metrics;
}

const worker = {
  fetch(request: Request) {
    return handler.fetch(request);
  },
  scheduled(controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContextLike) {
    if (!shouldRunScheduledOperations(env)) return;
    ctx.waitUntil(runScheduledOperations(env, controller));
  },
};

export default worker;
