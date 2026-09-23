import { NextResponse } from 'next/server';
import {
  CrmSegmentMutationError,
  evaluateCrmLeadSegment,
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
function statusFor(error: unknown) {
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
  const segmentId = body.segmentId;
  const segmentVersion = body.segmentVersion ?? null;
  const limit = body.limit === undefined ? 50 : Number(body.limit);
  const afterLeadId = body.afterLeadId ?? null;

  if (!isUuid(organizationId)
      || !isUuid(segmentId)
      || (segmentVersion !== null
        && (!Number.isInteger(segmentVersion) || Number(segmentVersion) < 1))
      || !Number.isInteger(limit)
      || limit < 1
      || limit > 100
      || (afterLeadId !== null && !isUuid(afterLeadId))) {
    return NextResponse.json({ error: 'Invalid CRM Segment evaluation payload' }, { status: 400 });
  }

  try {
    const evaluation = await evaluateCrmLeadSegment({
      supabase,
      organizationId,
      segmentId,
      segmentVersion: segmentVersion === null ? null : Number(segmentVersion),
      limit,
      afterLeadId: afterLeadId as string | null,
    });
    return NextResponse.json(evaluation, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('CRM Segment evaluation failed', error);
    return NextResponse.json({ error: 'CRM Segment evaluation failed' }, { status: statusFor(error) });
  }
}
