import { NextResponse } from 'next/server';

import {
  isCrmIdentityResolutionRole,
  listCrmIdentityResolutionCandidates,
  mergeCrmPeopleManual,
  splitCrmPersonIdentityManual,
  unlinkCrmPersonIdentityManual,
} from '@/lib/crm/identity-graph';
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
  if (/requires an authorized|membership|permission denied|row-level security/i.test(message)) return 403;
  if (/same Organization|active source Person|active canonical identity|not actively linked/i.test(message)) return 404;
  if (/conflict|already in use|requires two active People|would leave/i.test(message)) return 409;
  if (/invalid|required|distinct|non-empty|limit/i.test(message)) return 400;
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
  const limit = parseLimit(url.searchParams.get('limit'));

  if (!isUuid(organizationId)) {
    return NextResponse.json({ error: 'Invalid CRM identity graph query' }, { status: 400 });
  }

  const membership = await authenticatedMembership(organizationId);
  if ('error' in membership) return membership.error;

  try {
    const candidates = await listCrmIdentityResolutionCandidates({
      supabase: membership.supabase,
      organizationId,
      limit,
    });
    return NextResponse.json({ candidates });
  } catch (error) {
    console.error('CRM identity candidate lookup failed', error);
    return NextResponse.json(
      { error: errorStatus(error) >= 500 ? 'CRM identity candidate lookup failed' : (error instanceof Error ? error.message : 'CRM identity candidate lookup failed') },
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
  const reason = body.reason;
  const evidence = body.evidence;

  if (!isUuid(organizationId)
      || !['MERGE', 'SPLIT', 'UNLINK'].includes(String(action))
      || typeof reason !== 'string'
      || !reason.trim()
      || reason.trim().length > 500
      || !isObject(evidence)
      || Object.keys(evidence).length === 0
      || JSON.stringify(evidence).length > 8192) {
    return NextResponse.json({ error: 'Invalid CRM identity resolution payload' }, { status: 400 });
  }

  const membership = await authenticatedMembership(organizationId);
  if ('error' in membership) return membership.error;
  if (!isCrmIdentityResolutionRole(membership.role)) {
    return NextResponse.json({ error: 'CRM identity resolution requires a resolution role' }, { status: 403 });
  }

  const service = createSupabaseServiceClient();

  try {
    if (action === 'MERGE') {
      const sourcePersonId = body.sourcePersonId;
      const targetPersonId = body.targetPersonId;
      if (!isUuid(sourcePersonId) || !isUuid(targetPersonId) || sourcePersonId === targetPersonId) {
        return NextResponse.json({ error: 'Invalid CRM Person merge payload' }, { status: 400 });
      }

      const result = await mergeCrmPeopleManual({
        service,
        organizationId,
        actorUserId: membership.userId,
        sourcePersonId,
        targetPersonId,
        reason,
        evidence,
      });
      return NextResponse.json({ action: 'MERGE', ...result });
    }

    if (action === 'UNLINK') {
      const personId = body.personId;
      const identityId = body.identityId;
      if (!isUuid(personId) || !isUuid(identityId)) {
        return NextResponse.json({ error: 'Invalid CRM Person unlink payload' }, { status: 400 });
      }

      const result = await unlinkCrmPersonIdentityManual({
        service,
        organizationId,
        actorUserId: membership.userId,
        personId,
        identityId,
        reason,
        evidence,
      });
      return NextResponse.json({ action: 'UNLINK', ...result });
    }

    const sourcePersonId = body.sourcePersonId;
    const identityId = body.identityId;
    const newPersonId = body.newPersonId;
    const displayName = body.displayName == null ? null : body.displayName;
    if (!isUuid(sourcePersonId)
        || !isUuid(identityId)
        || !isUuid(newPersonId)
        || sourcePersonId === newPersonId
        || (displayName !== null && typeof displayName !== 'string')) {
      return NextResponse.json({ error: 'Invalid CRM Person split payload' }, { status: 400 });
    }

    const result = await splitCrmPersonIdentityManual({
      service,
      organizationId,
      actorUserId: membership.userId,
      sourcePersonId,
      identityId,
      newPersonId,
      displayName,
      reason,
      evidence,
    });
    return NextResponse.json({ action: 'SPLIT', ...result }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    console.error('CRM identity resolution failed', error);
    return NextResponse.json(
      { error: errorStatus(error) >= 500 ? 'CRM identity resolution failed' : (error instanceof Error ? error.message : 'CRM identity resolution failed') },
      { status: errorStatus(error) },
    );
  }
}
