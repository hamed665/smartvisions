import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';

type HeartbeatPhase = 'START' | 'RESULT';

type HeartbeatMetrics = {
  discovered?: number;
  processed?: number;
  safetyBlocked?: number;
  idempotent?: number;
  throttled?: number;
  failed?: number;
  reconciliationAttention?: number;
  tickStatus?: number;
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
  dailyAcquisitionStatus?: number;
  dailyAcquisitionAction?: string;
  dailyAcquisitionReason?: string;
  dailyAcquisitionMarket?: string;
  telegramDigestStatus?: number;
  telegramDigestAction?: string;
  telegramDigestReason?: string;
  pilotStatus?: number;
  pilotFailedOutcomes?: number;
  chatwootReconcileStatus?: number;
  chatwootReconciled?: number;
  chatwootIgnored?: number;
  chatwootReconcileFailed?: number;
};

type WorkerVersion = {
  id?: string;
  tag?: string;
  timestamp?: string;
};

const ACTION_BY_PHASE: Record<HeartbeatPhase, string> = {
  START: 'OPERATIONS_SCHEDULED_START',
  RESULT: 'OPERATIONS_SCHEDULED_RESULT',
};
const HEARTBEAT_SAMPLE_MS = 10 * 60 * 1000;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for scheduled runtime evidence');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function boundedInteger(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, Math.min(10000, Math.round(numeric)));
}

function boundedText(value: unknown, max = 120) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : undefined;
}

function sanitizeMetrics(value: unknown): HeartbeatMetrics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return {
    discovered: boundedInteger(raw.discovered),
    processed: boundedInteger(raw.processed),
    safetyBlocked: boundedInteger(raw.safetyBlocked),
    idempotent: boundedInteger(raw.idempotent),
    throttled: boundedInteger(raw.throttled),
    failed: boundedInteger(raw.failed),
    reconciliationAttention: boundedInteger(raw.reconciliationAttention),
    tickStatus: boundedInteger(raw.tickStatus),
    evidenceStatus: boundedInteger(raw.evidenceStatus),
    evidenceFailedOutcomes: boundedInteger(raw.evidenceFailedOutcomes),
    evidenceAction: boundedText(raw.evidenceAction),
    evidenceReason: boundedText(raw.evidenceReason),
    evidenceFirstTouchStatus: boundedText(raw.evidenceFirstTouchStatus),
    evidenceFirstTouchReason: boundedText(raw.evidenceFirstTouchReason),
    evidenceMarket: boundedText(raw.evidenceMarket, 8),
    autoDispatchStatus: boundedInteger(raw.autoDispatchStatus),
    autoDispatchAction: boundedText(raw.autoDispatchAction),
    autoDispatchReason: boundedText(raw.autoDispatchReason),
    autoDispatchMarket: boundedText(raw.autoDispatchMarket, 8),
    dailyAcquisitionStatus: boundedInteger(raw.dailyAcquisitionStatus),
    dailyAcquisitionAction: boundedText(raw.dailyAcquisitionAction),
    dailyAcquisitionReason: boundedText(raw.dailyAcquisitionReason),
    dailyAcquisitionMarket: boundedText(raw.dailyAcquisitionMarket, 8),
    telegramDigestStatus: boundedInteger(raw.telegramDigestStatus),
    telegramDigestAction: boundedText(raw.telegramDigestAction),
    telegramDigestReason: boundedText(raw.telegramDigestReason),
    pilotStatus: boundedInteger(raw.pilotStatus),
    pilotFailedOutcomes: boundedInteger(raw.pilotFailedOutcomes),
    chatwootReconcileStatus: boundedInteger(raw.chatwootReconcileStatus),
    chatwootReconciled: boundedInteger(raw.chatwootReconciled),
    chatwootIgnored: boundedInteger(raw.chatwootIgnored),
    chatwootReconcileFailed: boundedInteger(raw.chatwootReconcileFailed),
  };
}

function sanitizeWorkerVersion(value: unknown): WorkerVersion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return {
    id: boundedText(raw.id, 80),
    tag: boundedText(raw.tag, 120),
    timestamp: boundedText(raw.timestamp, 80),
  };
}

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null) as {
    source?: string;
    phase?: string;
    cron?: string;
    scheduledTime?: number;
    metrics?: HeartbeatMetrics;
    workerVersion?: WorkerVersion;
  } | null;
  const phase = String(body?.phase ?? '').toUpperCase() as HeartbeatPhase;
  const cron = String(body?.cron ?? '').trim().slice(0, 80);
  if (body?.source !== 'CLOUDFLARE_CRON' || !Object.hasOwn(ACTION_BY_PHASE, phase) || !cron) {
    return NextResponse.json({ error: 'Valid Cloudflare scheduled heartbeat metadata is required' }, { status: 400 });
  }

  const scheduledTime = Number.isFinite(Number(body?.scheduledTime)) ? Number(body?.scheduledTime) : null;
  const metrics = sanitizeMetrics(body?.metrics);
  const workerVersion = sanitizeWorkerVersion(body?.workerVersion);
  const supabase = serviceClient();
  const { data: controls, error: controlsError } = await supabase.from('system_controls').select('organization_id');
  if (controlsError) return NextResponse.json({ error: `Heartbeat organization lookup failed: ${controlsError.message}` }, { status: 503 });

  const organizationIds = [...new Set((controls ?? []).map((row) => String(row.organization_id)).filter(Boolean))];
  if (!organizationIds.length) return NextResponse.json({ recorded: 0, sampled: true });

  const action = ACTION_BY_PHASE[phase];
  const sampleBasis = scheduledTime ?? Date.now();
  const sampleStartMs = Math.floor(sampleBasis / HEARTBEAT_SAMPLE_MS) * HEARTBEAT_SAMPLE_MS;
  const sampleStart = new Date(sampleStartMs).toISOString();
  const sampleEnd = new Date(sampleStartMs + HEARTBEAT_SAMPLE_MS).toISOString();
  const { data: existing, error: existingError } = await supabase.from('audit_logs')
    .select('organization_id')
    .in('organization_id', organizationIds)
    .eq('action', action)
    .gte('created_at', sampleStart)
    .lt('created_at', sampleEnd);
  if (existingError) return NextResponse.json({ error: `Heartbeat sampling lookup failed: ${existingError.message}` }, { status: 503 });

  const alreadyRecorded = new Set((existing ?? []).map((row) => String(row.organization_id)));
  const rows = organizationIds
    .filter((organizationId) => !alreadyRecorded.has(organizationId))
    .map((organizationId) => ({
      organization_id: organizationId,
      actor_type: 'SYSTEM',
      actor_id: 'cloudflare_cron',
      action,
      entity_type: 'operations',
      entity_id: `${cron}:${phase}:${sampleStart}`.slice(0, 240),
      after_data: {
        source: 'CLOUDFLARE_CRON',
        phase,
        cron,
        scheduledTime,
        sampleStart,
        sampleMinutes: HEARTBEAT_SAMPLE_MS / 60_000,
        workerVersion,
        metrics,
      },
    }));

  if (rows.length) {
    const { error: insertError } = await supabase.from('audit_logs').insert(rows);
    if (insertError) return NextResponse.json({ error: `Heartbeat persistence failed: ${insertError.message}` }, { status: 503 });
  }

  return NextResponse.json({ recorded: rows.length, sampled: true, sampleStart });
}
