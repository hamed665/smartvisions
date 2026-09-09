import handler from 'vinext/server/fetch-handler';
import { POST as dailyAcquisitionPost } from '../app/api/operations/daily-acquisition/route';
import { POST as evidencePipelinePost } from '../app/api/operations/daily-evidence/route';
import { POST as controlledAutoDispatchPost } from '../app/api/operations/controlled-auto-dispatch/route';
import { POST as pilotAcquisitionPost } from '../app/api/operations/pilot-acquisition/route';
import { shouldRunScheduledOperations } from './schedule-policy';

type WorkerVersionMetadata = { id?: string; tag?: string; timestamp?: string };
type WorkerEnv = { INTERNAL_API_KEY?: string; DEPLOYMENT_ENV?: string; CF_VERSION_METADATA?: WorkerVersionMetadata };
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
  dailyAcquisitionStatus?: number;
  dailyAcquisitionAction?: string;
  dailyAcquisitionReason?: string;
  dailyAcquisitionMarket?: string;
  evidenceStatus?: number;
  evidenceFailedOutcomes?: number;
  evidenceAction?: string;
  evidenceReason?: string;
  evidenceFirstTouchStatus?: string;
  evidenceFirstTouchReason?: string;
  evidenceMarket?: string;
  autoDispatchStatus?: number;
  autoDispatchAction?: string;
  autoDispatchReason?: string;
  autoDispatchMarket?: string;
  pilotStatus?: number;
  pilotFailedOutcomes?: number;
  telegramDigestStatus?: number;
  telegramDigestAction?: string;
  telegramDigestReason?: string;
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
      workerVersion: env.CF_VERSION_METADATA ?? {},
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

  // Multi-market acquisition is journal-first and permits at most one paid
  // qualification per tick. It cannot send a provider message itself.
  try {
    const acquisitionResponse = await dailyAcquisitionPost(internalJsonRequest(env, '/api/operations/daily-acquisition', {}));
    metrics.dailyAcquisitionStatus = acquisitionResponse.status;
    if (acquisitionResponse.status === 429) metrics.throttled += 1;
    else if (acquisitionResponse.status === 409 || acquisitionResponse.status === 423) metrics.safetyBlocked += 1;
    else if (!acquisitionResponse.ok) metrics.failed += 1;
    const acquisition = await acquisitionResponse.json().catch(() => null) as { action?: string; reason?: string; marketCode?: string } | null;
    metrics.dailyAcquisitionAction = acquisition?.action;
    metrics.dailyAcquisitionReason = acquisition?.reason;
    metrics.dailyAcquisitionMarket = acquisition?.marketCode;
  } catch {
    metrics.failed += 1;
  }

  // Canonical deterministic evidence works for today's active market target and
  // creates at most one evidence-backed Shadow first touch per tick.
  try {
    const evidenceResponse = await evidencePipelinePost(internalJsonRequest(env, '/api/operations/daily-evidence', {}));
    metrics.evidenceStatus = evidenceResponse.status;
    if (evidenceResponse.status === 429) metrics.throttled += 1;
    else if (evidenceResponse.status === 409 || evidenceResponse.status === 423) metrics.safetyBlocked += 1;
    else if (!evidenceResponse.ok) metrics.failed += 1;
    else {
      const evidence = await evidenceResponse.json().catch(() => null) as {
        action?: string;
        reason?: string;
        marketCode?: string;
        firstTouch?: { status?: string; reason?: string };
      } | null;
      metrics.evidenceAction = evidence?.action;
      metrics.evidenceReason = evidence?.reason;
      metrics.evidenceMarket = evidence?.marketCode;
      metrics.evidenceFirstTouchStatus = evidence?.firstTouch?.status;
      metrics.evidenceFirstTouchReason = evidence?.firstTouch?.reason;
      metrics.evidenceFailedOutcomes = evidence?.action === 'FAILED' ? 1 : 0;
      if (metrics.evidenceFailedOutcomes) metrics.failed += 1;
    }
  } catch {
    metrics.failed += 1;
  }

  // Dispatch is market-aware, local-window aware and sends at most one approved
  // first touch per tick through the canonical controlled email boundary.
  try {
    const autoDispatchResponse = await controlledAutoDispatchPost(internalJsonRequest(env, '/api/operations/controlled-auto-dispatch', {}));
    metrics.autoDispatchStatus = autoDispatchResponse.status;
    if (autoDispatchResponse.status === 429) metrics.throttled += 1;
    else if (autoDispatchResponse.status === 409 || autoDispatchResponse.status === 423) metrics.safetyBlocked += 1;
    else if (!autoDispatchResponse.ok) metrics.failed += 1;
    const dispatch = await autoDispatchResponse.json().catch(() => null) as { action?: string; reason?: string; marketCode?: string } | null;
    metrics.autoDispatchAction = dispatch?.action;
    metrics.autoDispatchReason = dispatch?.reason;
    metrics.autoDispatchMarket = dispatch?.marketCode;
  } catch {
    metrics.failed += 1;
  }

  // Legacy Oman pilot acquisition remains isolated for old pilot campaigns only.
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

  try {
    const digestResponse = await internalPost(env, '/api/operations/telegram-daily-digest', {});
    metrics.telegramDigestStatus = digestResponse.status;
    if (!digestResponse.ok) metrics.failed += 1;
    else {
      const digest = await digestResponse.json().catch(() => null) as { action?: string; reason?: string } | null;
      metrics.telegramDigestAction = digest?.action;
      metrics.telegramDigestReason = digest?.reason;
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