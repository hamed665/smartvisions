import { NextResponse } from 'next/server';

import {
  getCrmCustomer360,
  isCrmCustomer360EntityType,
  isCrmCustomer360ResolutionRole,
  linkCrmCustomer360PersonContext,
  unlinkCrmCustomer360PersonContext,
} from '@/lib/crm/customer360';
import { createClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

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
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(1, parsed));
}

function errorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/requires Organization membership|requires a resolution role|permission denied|trusted server boundary|row-level security/i.test(message)) return 403;
  if (/was not found|same-Organization Person/i.test(message)) return 404;
  if (/already belongs|does not match current binding|requires an active Person-Company relationship/i.test(message)) return 409;
  if (/invalid|required|bounded limit|non-empty|limit must/i.test(message)) return 400;
  return 500;
}

async function authenticatedMembership(organizationId: string) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) } as const;
  }

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (membershipError) {
    return { error: NextResponse.json({ error: 'Organization membership lookup failed' }, { status: 500 }) } as const;
  }
  if (!membership) {
    return { error: NextResponse.json({ error: 'Organization membership required' }, { status: 403 }) } as const;
  }

  return { supabase, userId: auth.user.id, role: membership.role } as const;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const personId = url.searchParams.get('personId')?.trim() ?? '';
  const limit = parseLimit(url.searchParams.get('limit'));

  if (!isUuid(organizationId) || !isUuid(personId)) {
    return NextResponse.json({ error: 'Invalid CRM Customer 360 query' }, { status: 400 });
  }

  const membership = await authenticatedMembership(organizationId);
  if ('error' in membership) return membership.error;

  try {
    const customer = await getCrmCustomer360({
      supabase: membership.supabase,
      organizationId,
      personId,
      limit,
    });
    return NextResponse.json({ customer });
  } catch (error) {
    console.error('CRM Customer 360 lookup failed', error);
    return NextResponse.json(
      { error: errorStatus(error) >= 500 ? 'CRM Customer 360 lookup failed' : (error instanceof Error ? error.message : 'CRM Customer 360 lookup failed') },
      { status: errorStatus(error) },
    );
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
  const action = body.action;
  const entityType = body.entityType;
  const entityId = body.entityId;
  const personId = body.personId;
  const reason = body.reason;

  if (!isUuid(organizationId)
      || !['LINK', 'UNLINK'].includes(String(action))
      || !isCrmCustomer360EntityType(entityType)
      || !isUuid(entityId)
      || !isUuid(personId)
      || typeof reason !== 'string'
      || !reason.trim()
      || reason.trim().length > 500) {
    return NextResponse.json({ error: 'Invalid CRM Customer 360 mutation payload' }, { status: 400 });
  }

  const membership = await authenticatedMembership(organizationId);
  if ('error' in membership) return membership.error;
  if (!isCrmCustomer360ResolutionRole(membership.role)) {
    return NextResponse.json({ error: 'CRM Customer 360 resolution requires a resolution role' }, { status: 403 });
  }

  const evidence = {
    source: 'CUSTOMER360_UI',
    reason: reason.trim(),
  };
  const service = createSupabaseServiceClient();

  try {
    if (action === 'LINK') {
      const result = await linkCrmCustomer360PersonContext({
        service,
        organizationId,
        actorUserId: membership.userId,
        entityType,
        entityId,
        personId,
        verificationMethod: 'MANUAL_CONFIRMED',
        sourceRef: `customer360-ui:${entityType.toLowerCase()}:${entityId}`,
        evidence,
      });
      return NextResponse.json({ action: 'LINK', ...result });
    }

    const result = await unlinkCrmCustomer360PersonContext({
      service,
      organizationId,
      actorUserId: membership.userId,
      entityType,
      entityId,
      expectedPersonId: personId,
      reason,
      evidence,
    });
    return NextResponse.json({ action: 'UNLINK', ...result });
  } catch (error) {
    console.error('CRM Customer 360 mutation failed', error);
    return NextResponse.json(
      { error: errorStatus(error) >= 500 ? 'CRM Customer 360 mutation failed' : (error instanceof Error ? error.message : 'CRM Customer 360 mutation failed') },
      { status: errorStatus(error) },
    );
  }
}
