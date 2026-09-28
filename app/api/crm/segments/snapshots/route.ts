import { NextResponse } from 'next/server';

import {
  createCrmSegmentSnapshot,
  listCrmSegmentSnapshotMembers,
  type CrmSegmentSnapshotPurpose,
} from '@/lib/crm/segments';
import { createClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSES = new Set<CrmSegmentSnapshotPurpose>(['MANUAL','CAMPAIGN','WORKFLOW','EXPORT','OTHER']);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/not found/i.test(message)) return 404;
  if (/request key conflict|version conflict|changed concurrently/i.test(message)) return 409;
  if (/requires OWNER|not permitted|permission denied|row-level security|trusted server/i.test(message)) return 403;
  if (/invalid|exceeds the 10000-member|cannot be snapshotted/i.test(message)) return 400;
  return 500;
}

async function authenticatedMembership(organizationId: string) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) } as const;
  }

  const { data: member, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error || !member) {
    return { response: NextResponse.json({ error: 'Organization membership required' }, { status: 403 }) } as const;
  }

  return { supabase, userId: auth.user.id, role: String(member.role) } as const;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId') ?? '';
  const snapshotId = url.searchParams.get('snapshotId') ?? '';
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '100', 10);
  const afterOrdinalRaw = url.searchParams.get('afterOrdinal');
  const afterOrdinal = afterOrdinalRaw === null ? null : Number.parseInt(afterOrdinalRaw, 10);

  if (!isUuid(organizationId)
      || !isUuid(snapshotId)
      || !Number.isInteger(limit)
      || limit < 1
      || limit > 100
      || (afterOrdinal !== null && (!Number.isInteger(afterOrdinal) || afterOrdinal < 1))) {
    return NextResponse.json({ error: 'Invalid Segment Snapshot query' }, { status: 400 });
  }

  const auth = await authenticatedMembership(organizationId);
  if ('response' in auth) return auth.response;

  try {
    const { data: snapshot, error: snapshotError } = await auth.supabase
      .from('crm_segment_snapshots')
      .select('id,organization_id,segment_id,segment_version,entity_type,predicate_hash,member_count,membership_hash,purpose,source_ref,created_by_user_id,created_at')
      .eq('organization_id', organizationId)
      .eq('id', snapshotId)
      .maybeSingle();

    if (snapshotError) throw new Error(snapshotError.message);
    if (!snapshot) return NextResponse.json({ error: 'Segment Snapshot not found' }, { status: 404 });

    const page = await listCrmSegmentSnapshotMembers({
      supabase: auth.supabase,
      organizationId,
      snapshotId,
      limit,
      afterOrdinal,
    });

    return NextResponse.json({
      snapshot,
      members: page.items,
      nextCursor: page.nextCursor,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('CRM Segment Snapshot read failed', error);
    return NextResponse.json({ error: 'CRM Segment Snapshot read failed' }, { status: statusFor(error) });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) throw new Error('body');
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const organizationId = body.organizationId;
  const segmentId = body.segmentId;
  const segmentVersion = body.segmentVersion === null || body.segmentVersion === undefined
    ? null
    : Number(body.segmentVersion);
  const purpose = String(body.purpose ?? '').toUpperCase() as CrmSegmentSnapshotPurpose;
  const sourceRef = typeof body.sourceRef === 'string' ? body.sourceRef.trim() : '';
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';

  if (!isUuid(organizationId)
      || !isUuid(segmentId)
      || (segmentVersion !== null && (!Number.isInteger(segmentVersion) || segmentVersion < 1))
      || !PURPOSES.has(purpose)
      || !/^[A-Za-z0-9._:/-]{1,240}$/.test(sourceRef)
      || !/^[A-Za-z0-9._:-]{1,200}$/.test(requestKey)) {
    return NextResponse.json({ error: 'Invalid Segment Snapshot payload' }, { status: 400 });
  }

  const auth = await authenticatedMembership(organizationId);
  if ('response' in auth) return auth.response;
  if (!['OWNER','ADMIN','SALES_MANAGER'].includes(auth.role)) {
    return NextResponse.json({
      error: 'Segment Snapshot creation requires OWNER, ADMIN or SALES_MANAGER',
    }, { status: 403 });
  }

  try {
    const snapshot = await createCrmSegmentSnapshot({
      service: createSupabaseServiceClient(),
      organizationId,
      actorUserId: auth.userId,
      segmentId,
      segmentVersion,
      purpose,
      sourceRef,
      requestKey,
    });
    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (error) {
    console.error('CRM Segment Snapshot create failed', error);
    const status = statusFor(error);
    return NextResponse.json({
      error: status >= 500
        ? 'CRM Segment Snapshot create failed'
        : (error instanceof Error ? error.message : 'CRM Segment Snapshot create failed'),
    }, { status });
  }
}
