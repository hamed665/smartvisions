import { NextResponse } from 'next/server';

import {
  acceptCrmNextActionCandidate,
  listCrmNextActions,
} from '@/lib/crm/next-actions';
import { createClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCEPTABLE = new Set(['LEAD_STALE','DEAL_STALE','DEAL_CLOSE_OVERDUE']);

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function optionalUuid(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || isUuid(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseIso(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return undefined;
  return new Date(time).toISOString();
}

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function statusFromError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/permission denied|not permitted|row-level security/i.test(message)) return 403;
  if (/not found|not stale|superseded|already has an active CRM task|overdue/i.test(message)) return 409;
  return 500;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const assigneeUserId = url.searchParams.get('assigneeUserId');
  const staleHours = parseBoundedInt(url.searchParams.get('staleHours'), 72, 1, 720);
  const limit = parseBoundedInt(url.searchParams.get('limit'), 100, 1, 200);

  if (!isUuid(organizationId)
      || !optionalUuid(assigneeUserId)
      || staleHours === null
      || limit === null) {
    return NextResponse.json({ error: 'Invalid next-action query' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const items = await listCrmNextActions({
      supabase,
      organizationId,
      assigneeUserId,
      staleHours,
      limit,
    });
    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('CRM next-action query failed', error);
    return NextResponse.json(
      { error: 'CRM next-action query failed' },
      { status: statusFromError(error) },
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) throw new Error('invalid body');
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.action !== 'ACCEPT') {
    return NextResponse.json({ error: 'Unsupported next-action operation' }, { status: 400 });
  }

  const organizationId = body.organizationId;
  const candidateKind = body.candidateKind;
  const entityId = body.entityId;
  const assigneeUserId = Object.prototype.hasOwnProperty.call(body,'assigneeUserId')
    ? body.assigneeUserId
    : auth.user.id;
  const dueAt = parseIso(body.dueAt);
  const reminderAt = parseIso(body.reminderAt);
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';
  const staleHours = Number(body.staleHours ?? 72);

  if (!isUuid(organizationId)
      || typeof candidateKind !== 'string'
      || !ACCEPTABLE.has(candidateKind)
      || !isUuid(entityId)
      || !optionalUuid(assigneeUserId)
      || dueAt === undefined
      || reminderAt === undefined
      || !Number.isInteger(staleHours)
      || staleHours < 1
      || staleHours > 720
      || requestKey.length < 1
      || requestKey.length > 200) {
    return NextResponse.json({ error: 'Invalid next-action acceptance payload' }, { status: 400 });
  }

  try {
    const trustedSupabase = createSupabaseServiceClient();
    const result = await acceptCrmNextActionCandidate({
      supabase: trustedSupabase,
      organizationId,
      actorUserId: auth.user.id,
      candidateKind: candidateKind as 'LEAD_STALE' | 'DEAL_STALE' | 'DEAL_CLOSE_OVERDUE',
      entityId,
      assigneeUserId,
      dueAt,
      reminderAt,
      requestKey,
      staleHours,
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    console.error('CRM next-action acceptance failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'CRM next-action acceptance failed' },
      { status: statusFromError(error) },
    );
  }
}
