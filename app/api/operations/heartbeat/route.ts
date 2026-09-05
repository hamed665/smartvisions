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
  pilotStatus?: number;
  pilotFailedOutcomes?: number;
};

const ACTION_BY_PHASE: Record<HeartbeatPhase, string> = {
  START: 'OPERATIONS_SCHEDULED_START',
  RESULT: 'OPERATIONS_SCHEDULED_RESULT',
};

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
    pilotStatus: boundedInteger(raw.pilotStatus),
    pilotFailedOutcomes: boundedInteger(raw.pilotFailedOutcomes),
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
  } | null;
  const phase = String(body?.phase ?? '').toUpperCase() as HeartbeatPhase;
  const cron = String(body?.cron ?? '').trim().slice(0, 80);
  if (body?.source !== 'CLOUDFLARE_CRON' || !Object.hasOwn(ACTION_BY_PHASE, phase) || !cron) {
    return NextResponse.json({ error: 'Valid Cloudflare scheduled heartbeat metadata is required' }, { status: 400 });
  }

  const scheduledTime = Number.isFinite(Number(body?.scheduledTime)) ? Number(body?.scheduledTime) : null;
  const metrics = sanitizeMetrics(body?.metrics);
  const supabase = serviceClient();
  const { data: controls, error: controlsError } = await supabase.from('system_controls').select('organization_id');
  if (controlsError) return NextResponse.json({ error: `Heartbeat organization lookup failed: ${controlsError.message}` }, { status: 503 });

  const organizationIds = [...new Set((controls ?? []).map((row) => String(row.organization_id)).filter(Boolean))];
  if (!organizationIds.length) return NextResponse.json({ recorded: 0, sampled: true });

  const action = ACTION_BY_PHASE[phase];
  const hourStart = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();
  const { data: existing, error: existingError } = await supabase.from('audit_logs')
    .select('organization_id')
    .in('organization_id', organizationIds)
    .eq('action', action)
    .gte('created_at', hourStart);
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
      entity_id: `${cron}:${hourStart}`.slice(0, 240),
      after_data: {
        source: 'CLOUDFLARE_CRON',
        phase,
        cron,
        scheduledTime,
        metrics,
      },
    }));

  if (rows.length) {
    const { error: insertError } = await supabase.from('audit_logs').insert(rows);
    if (insertError) return NextResponse.json({ error: `Heartbeat persistence failed: ${insertError.message}` }, { status: 503 });
  }

  return NextResponse.json({ recorded: rows.length, sampled: true });
}
