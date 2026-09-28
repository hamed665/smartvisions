import { NextResponse } from 'next/server';

import {
  getCrmAccountV2,
  isCrmAccountHierarchyRelation,
  isCrmAccountLifecycle,
  isCrmAccountMutationRole,
  setCrmAccountLifecycleManual,
  setCrmAccountOwnerManual,
  setCrmAccountParentManual,
} from '@/lib/crm/accounts';
import { createClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseLimit(value: string | null) {
  if (!value) return 50;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return null;
  return Math.min(Math.max(parsed, 1), 100);
}

function errorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/requires Organization membership|requires an authorized CRM role|permission denied|trusted server boundary|row-level security/i.test(message)) return 403;
  if (/was not found in the Organization|parent was not found/i.test(message)) return 404;
  if (/would create a cycle|cannot parent an Account to itself/i.test(message)) return 409;
  if (/invalid|required|bounded limit|non-empty|assignable Organization member/i.test(message)) return 400;
  return 500;
}

async function authenticatedMembership(organizationId: string) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) } as const;
  }

  const { data: membership, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: 'Organization membership lookup failed' }, { status: 500 }) } as const;
  }
  if (!membership) {
    return { error: NextResponse.json({ error: 'Organization membership required' }, { status: 403 }) } as const;
  }

  return {
    supabase,
    userId: auth.user.id,
    role: String(membership.role),
  } as const;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const businessId = url.searchParams.get('businessId')?.trim() ?? '';
  const limit = parseLimit(url.searchParams.get('limit'));

  if (!isUuid(organizationId) || !isUuid(businessId) || limit === null) {
    return NextResponse.json({ error: 'Invalid CRM Account query' }, { status: 400 });
  }

  const membership = await authenticatedMembership(organizationId);
  if ('error' in membership) return membership.error;

  try {
    const account = await getCrmAccountV2({
      supabase: membership.supabase,
      organizationId,
      businessId,
      limit,
    });
    return NextResponse.json({ account }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('CRM Account lookup failed', error);
    const status = errorStatus(error);
    return NextResponse.json({
      error: status >= 500
        ? 'CRM Account lookup failed'
        : (error instanceof Error ? error.message : 'CRM Account lookup failed'),
    }, { status });
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
  const businessId = body.businessId;
  const action = String(body.action ?? '');
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!isUuid(organizationId)
      || !isUuid(businessId)
      || !['SET_OWNER', 'SET_LIFECYCLE', 'SET_PARENT'].includes(action)
      || reason.length < 1
      || reason.length > 500) {
    return NextResponse.json({ error: 'Invalid CRM Account mutation payload' }, { status: 400 });
  }

  const membership = await authenticatedMembership(organizationId);
  if ('error' in membership) return membership.error;
  if (!isCrmAccountMutationRole(membership.role)) {
    return NextResponse.json({ error: 'CRM Account mutation requires an authorized CRM role' }, { status: 403 });
  }

  const service = createSupabaseServiceClient();
  const evidence = { source: 'CRM_ACCOUNT_UI', reason };

  try {
    if (action === 'SET_OWNER') {
      const ownerUserId = body.ownerUserId === null || body.ownerUserId === ''
        ? null
        : body.ownerUserId;
      if (ownerUserId !== null && !isUuid(ownerUserId)) {
        return NextResponse.json({ error: 'Invalid CRM Account owner' }, { status: 400 });
      }
      const result = await setCrmAccountOwnerManual({
        service,
        organizationId,
        actorUserId: membership.userId,
        businessId,
        ownerUserId,
        reason,
        evidence,
      });
      return NextResponse.json({ action, ...result });
    }

    if (action === 'SET_LIFECYCLE') {
      if (!isCrmAccountLifecycle(body.lifecycle)) {
        return NextResponse.json({ error: 'Invalid CRM Account lifecycle' }, { status: 400 });
      }
      const result = await setCrmAccountLifecycleManual({
        service,
        organizationId,
        actorUserId: membership.userId,
        businessId,
        lifecycle: body.lifecycle,
        reason,
        evidence,
      });
      return NextResponse.json({ action, ...result });
    }

    const parentBusinessId = body.parentBusinessId === null || body.parentBusinessId === ''
      ? null
      : body.parentBusinessId;
    const relation = body.relation === null || body.relation === '' ? null : body.relation;

    if (parentBusinessId !== null && !isUuid(parentBusinessId)) {
      return NextResponse.json({ error: 'Invalid CRM Account parent' }, { status: 400 });
    }
    if (parentBusinessId !== null && !isCrmAccountHierarchyRelation(relation)) {
      return NextResponse.json({ error: 'CRM Account hierarchy relation is required' }, { status: 400 });
    }
    if (parentBusinessId === null && relation !== null) {
      return NextResponse.json({ error: 'CRM Account hierarchy relation requires a parent' }, { status: 400 });
    }

    const result = await setCrmAccountParentManual({
      service,
      organizationId,
      actorUserId: membership.userId,
      businessId,
      parentBusinessId,
      relation,
      reason,
      evidence,
    });
    return NextResponse.json({ action, ...result });
  } catch (error) {
    console.error('CRM Account mutation failed', error);
    const status = errorStatus(error);
    return NextResponse.json({
      error: status >= 500
        ? 'CRM Account mutation failed'
        : (error instanceof Error ? error.message : 'CRM Account mutation failed'),
    }, { status });
  }
}
