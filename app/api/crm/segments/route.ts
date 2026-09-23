import { NextResponse } from 'next/server';
import {
  createCrmLeadSegment,
  CrmSegmentMutationError,
  listCrmSegments,
  parseCrmSegmentPredicateTree,
  setCrmLeadSegmentLifecycle,
  updateCrmLeadSegmentDefinition,
  type CrmSegmentStatus,
} from '@/lib/crm/segments';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
function parseLimit(value: string | null) {
  if (!value) return 50;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 100) : null;
}
function parseBoolean(value: string | null, fallback: boolean) {
  if (value === null) return fallback;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
}
function parseIso(value: unknown) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
function mutationStatus(error: unknown) {
  if (error instanceof CrmSegmentMutationError) {
    if (error.code === 'NOT_FOUND') return 404;
    if (error.code === 'VERSION_CONFLICT') return 409;
    if (error.code === 'FORBIDDEN') return 403;
    return 400;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/row-level security|permission denied|not permitted/i.test(message)) return 403;
  return 500;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const includeArchived = parseBoolean(url.searchParams.get('includeArchived'), false);
  const limit = parseLimit(url.searchParams.get('limit'));
  const beforeUpdatedAt = url.searchParams.get('beforeUpdatedAt');
  const beforeId = url.searchParams.get('beforeId');

  if (!isUuid(organizationId) || includeArchived === null || limit === null) {
    return NextResponse.json({ error: 'Invalid CRM Segment query parameters' }, { status: 400 });
  }

  const hasCursorAt = Boolean(beforeUpdatedAt);
  const hasCursorId = Boolean(beforeId);
  if (hasCursorAt !== hasCursorId) {
    return NextResponse.json(
      { error: 'beforeUpdatedAt and beforeId must be provided together' },
      { status: 400 },
    );
  }

  let cursor: { updatedAt: string; id: string } | null = null;
  if (beforeUpdatedAt && beforeId) {
    const updatedAt = parseIso(beforeUpdatedAt);
    if (!updatedAt || !isUuid(beforeId)) {
      return NextResponse.json({ error: 'Invalid CRM Segment cursor' }, { status: 400 });
    }
    cursor = { updatedAt, id: beforeId };
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const page = await listCrmSegments({
      supabase,
      organizationId,
      includeArchived,
      limit,
      cursor,
    });
    return NextResponse.json(page, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('CRM Segment query failed', error);
    return NextResponse.json({ error: 'CRM Segment query failed' }, { status: mutationStatus(error) });
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

  const organizationId = body.organizationId;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';
  const predicateTree = parseCrmSegmentPredicateTree(body.predicateTree);

  if (!isUuid(organizationId)
      || name.length < 1 || name.length > 160
      || requestKey.length < 1 || requestKey.length > 200
      || !predicateTree) {
    return NextResponse.json({ error: 'Invalid CRM Segment payload' }, { status: 400 });
  }

  try {
    const segment = await createCrmLeadSegment({
      supabase,
      organizationId,
      name,
      predicateTree,
      requestKey,
    });
    return NextResponse.json({ segment }, { status: 201 });
  } catch (error) {
    console.error('CRM Segment create failed', error);
    return NextResponse.json({ error: 'CRM Segment create failed' }, { status: mutationStatus(error) });
  }
}

export async function PATCH(request: Request) {
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

  const mode = body.mode;
  const organizationId = body.organizationId;
  const segmentId = body.segmentId;
  const expectedVersion = body.expectedVersion;
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';

  if (!isUuid(organizationId)
      || !isUuid(segmentId)
      || !Number.isInteger(expectedVersion)
      || Number(expectedVersion) < 1
      || requestKey.length < 1
      || requestKey.length > 200) {
    return NextResponse.json({ error: 'Invalid CRM Segment update payload' }, { status: 400 });
  }

  try {
    if (mode === 'DEFINITION') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const predicateTree = parseCrmSegmentPredicateTree(body.predicateTree);
      if (name.length < 1 || name.length > 160 || !predicateTree) {
        return NextResponse.json({ error: 'Invalid CRM Segment definition' }, { status: 400 });
      }

      const segment = await updateCrmLeadSegmentDefinition({
        supabase,
        organizationId,
        segmentId,
        expectedVersion: Number(expectedVersion),
        name,
        predicateTree,
        requestKey,
      });
      return NextResponse.json({ segment });
    }

    if (mode === 'LIFECYCLE') {
      const status = typeof body.status === 'string' ? body.status.toUpperCase() : '';
      if (status !== 'ACTIVE' && status !== 'ARCHIVED') {
        return NextResponse.json({ error: 'Invalid CRM Segment lifecycle status' }, { status: 400 });
      }

      const segment = await setCrmLeadSegmentLifecycle({
        supabase,
        organizationId,
        segmentId,
        expectedVersion: Number(expectedVersion),
        status: status as CrmSegmentStatus,
        requestKey,
      });
      return NextResponse.json({ segment });
    }

    return NextResponse.json({ error: 'Unsupported CRM Segment update mode' }, { status: 400 });
  } catch (error) {
    console.error('CRM Segment update failed', error);
    return NextResponse.json({ error: 'CRM Segment update failed' }, { status: mutationStatus(error) });
  }
}
