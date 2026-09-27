import { NextResponse } from 'next/server';

import {
  createOrResolveCrmPerson,
  isCrmPersonMutationRole,
  isCrmPersonRelationshipType,
  isCrmPersonVerificationMethod,
  listCrmPeople,
} from '@/lib/crm/people';
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
  if (/requires an authorized|permission denied|row-level security/i.test(message)) return 403;
  if (/not in the same Organization|requires an active canonical identity/i.test(message)) return 404;
  if (/ambiguous/i.test(message)) return 409;
  if (/invalid|required|non-empty|require business_id/i.test(message)) return 400;
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
  const businessId = url.searchParams.get('businessId')?.trim() || null;
  const identityId = url.searchParams.get('identityId')?.trim() || null;
  const limit = parseLimit(url.searchParams.get('limit'));

  if (!isUuid(organizationId)
      || (businessId !== null && !isUuid(businessId))
      || (identityId !== null && !isUuid(identityId))) {
    return NextResponse.json({ error: 'Invalid CRM Person query' }, { status: 400 });
  }

  const membership = await authenticatedMembership(organizationId);
  if ('error' in membership) return membership.error;

  try {
    const people = await listCrmPeople({
      supabase: membership.supabase,
      organizationId,
      businessId,
      identityId,
      limit,
    });
    return NextResponse.json({ people });
  } catch (error) {
    console.error('CRM Person list failed', error);
    return NextResponse.json({ error: 'CRM Person list failed' }, { status: errorStatus(error) });
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
  const identityId = body.identityId;
  const displayName = body.displayName == null ? null : body.displayName;
  const verificationMethod = body.verificationMethod;
  const sourceRef = body.sourceRef;
  const evidence = body.evidence;
  const relationship = body.relationship;

  if (!isUuid(organizationId)
      || !isUuid(identityId)
      || (displayName !== null && typeof displayName !== 'string')
      || !isCrmPersonVerificationMethod(verificationMethod)
      || typeof sourceRef !== 'string'
      || !sourceRef.trim()
      || !isObject(evidence)
      || Object.keys(evidence).length === 0
      || (relationship !== undefined && relationship !== null && !isObject(relationship))) {
    return NextResponse.json({ error: 'Invalid CRM Person mutation payload' }, { status: 400 });
  }

  let normalizedRelationship: {
    businessId: string;
    relationshipType: Parameters<typeof isCrmPersonRelationshipType>[0] & string;
    jobTitle: string | null;
    verificationMethod: Parameters<typeof isCrmPersonVerificationMethod>[0] & string;
    sourceRef: string;
    evidence: Record<string, unknown>;
  } | null = null;

  if (isObject(relationship)) {
    const businessId = relationship.businessId;
    const relationshipType = relationship.relationshipType;
    const jobTitle = relationship.jobTitle == null ? null : relationship.jobTitle;
    const relationshipVerificationMethod = relationship.verificationMethod;
    const relationshipSourceRef = relationship.sourceRef;
    const relationshipEvidence = relationship.evidence;

    if (!isUuid(businessId)
        || !isCrmPersonRelationshipType(relationshipType)
        || (jobTitle !== null && typeof jobTitle !== 'string')
        || !isCrmPersonVerificationMethod(relationshipVerificationMethod)
        || typeof relationshipSourceRef !== 'string'
        || !relationshipSourceRef.trim()
        || !isObject(relationshipEvidence)
        || Object.keys(relationshipEvidence).length === 0) {
      return NextResponse.json({ error: 'Invalid CRM Person relationship payload' }, { status: 400 });
    }

    normalizedRelationship = {
      businessId,
      relationshipType,
      jobTitle,
      verificationMethod: relationshipVerificationMethod,
      sourceRef: relationshipSourceRef,
      evidence: relationshipEvidence,
    };
  }

  const membership = await authenticatedMembership(organizationId);
  if ('error' in membership) return membership.error;
  if (!isCrmPersonMutationRole(membership.role)) {
    return NextResponse.json({ error: 'CRM Person mutation requires a write role' }, { status: 403 });
  }

  try {
    const result = await createOrResolveCrmPerson({
      service: createSupabaseServiceClient(),
      organizationId,
      actorUserId: membership.userId,
      identityId,
      displayName,
      verificationMethod,
      sourceRef,
      evidence,
      relationship: normalizedRelationship,
    });

    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error('CRM Person mutation failed', error);
    return NextResponse.json(
      { error: errorStatus(error) >= 500 ? 'CRM Person mutation failed' : (error instanceof Error ? error.message : 'CRM Person mutation failed') },
      { status: errorStatus(error) },
    );
  }
}
