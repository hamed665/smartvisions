import { NextResponse } from 'next/server';

import {
  canMutateCrmLeadScoring,
  clearCrmLeadScoreOverride,
  getCrmLeadScoring,
  recomputeCrmLeadEngagement,
  recordCrmLeadModelSuggestion,
  setCrmLeadScoreOverride,
  type CrmLeadModelSuggestion,
} from '@/lib/crm/lead-scoring';
import { createClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_KEY_RE = /^[A-Za-z0-9._:-]{1,200}$/;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function integer(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

async function membership(organizationId: string) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) } as const;
  }
  const { data, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error || !data) {
    return { response: NextResponse.json({ error: 'Organization membership required' }, { status: 403 }) } as const;
  }
  return { supabase, userId: auth.user.id, role: String(data.role) } as const;
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/version conflict|request key conflict|override is not active/i.test(message)) return 409;
  if (/was not found/i.test(message)) return 404;
  if (/requires OWNER|trusted server boundary|permission denied|row-level security/i.test(message)) return 403;
  if (/payload is invalid|unsupported fields|provenance is invalid|score is invalid|reasons are invalid/i.test(message)) return 400;
  return 500;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId') ?? '';
  const leadId = url.searchParams.get('leadId') ?? '';
  if (!isUuid(organizationId) || !isUuid(leadId)) {
    return NextResponse.json({ error: 'Invalid Organization or Lead' }, { status: 400 });
  }

  const auth = await membership(organizationId);
  if ('response' in auth) return auth.response;

  try {
    const scoring = await getCrmLeadScoring({
      supabase: auth.supabase,
      organizationId,
      leadId,
    });
    if (!scoring) return NextResponse.json({ error: 'Lead scoring state not found' }, { status: 404 });
    return NextResponse.json({ scoring }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('CRM Lead scoring read failed', error);
    return NextResponse.json({ error: 'CRM Lead scoring read failed' }, { status: statusFor(error) });
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
  const leadId = body.leadId;
  const action = String(body.action ?? '');
  const expectedRevision = integer(body.expectedRevision);
  const requestKey = String(body.requestKey ?? '');

  if (!isUuid(organizationId)
      || !isUuid(leadId)
      || expectedRevision === null
      || expectedRevision < 0
      || !REQUEST_KEY_RE.test(requestKey)) {
    return NextResponse.json({ error: 'Invalid scoring mutation envelope' }, { status: 400 });
  }

  const auth = await membership(organizationId);
  if ('response' in auth) return auth.response;
  if (!canMutateCrmLeadScoring(auth.role)) {
    return NextResponse.json({ error: 'Lead scoring mutation requires OWNER, ADMIN or SALES_MANAGER' }, { status: 403 });
  }

  const service = createSupabaseServiceClient();

  try {
    if (action === 'RECOMPUTE_ENGAGEMENT') {
      const result = await recomputeCrmLeadEngagement({
        service, organizationId, actorUserId: auth.userId, leadId,
        expectedRevision, requestKey,
      });
      return NextResponse.json({ action, result });
    }

    if (action === 'SET_OVERRIDE') {
      const overrideScore = integer(body.overrideScore);
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      const expiresAt = body.expiresAt == null || body.expiresAt === ''
        ? null
        : typeof body.expiresAt === 'string' && Number.isFinite(Date.parse(body.expiresAt))
          ? new Date(body.expiresAt).toISOString()
          : 'INVALID';
      if (overrideScore === null || overrideScore < 0 || overrideScore > 100
          || reason.length < 1 || reason.length > 240 || expiresAt === 'INVALID') {
        return NextResponse.json({ error: 'Invalid score override payload' }, { status: 400 });
      }
      const result = await setCrmLeadScoreOverride({
        service, organizationId, actorUserId: auth.userId, leadId,
        overrideScore, reason, expiresAt, expectedRevision, requestKey,
      });
      return NextResponse.json({ action, result });
    }

    if (action === 'CLEAR_OVERRIDE') {
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (reason.length < 1 || reason.length > 240) {
        return NextResponse.json({ error: 'Invalid override correction reason' }, { status: 400 });
      }
      const result = await clearCrmLeadScoreOverride({
        service, organizationId, actorUserId: auth.userId, leadId,
        reason, expectedRevision, requestKey,
      });
      return NextResponse.json({ action, result });
    }

    if (action === 'RECORD_MODEL_SUGGESTION') {
      if (!isObject(body.suggestion)) {
        return NextResponse.json({ error: 'Invalid model suggestion payload' }, { status: 400 });
      }
      const result = await recordCrmLeadModelSuggestion({
        service, organizationId, actorUserId: auth.userId, leadId,
        suggestion: body.suggestion as CrmLeadModelSuggestion,
        expectedRevision, requestKey,
      });
      return NextResponse.json({ action, result });
    }

    return NextResponse.json({ error: 'Unsupported scoring action' }, { status: 400 });
  } catch (error) {
    console.error('CRM Lead scoring mutation failed', error);
    return NextResponse.json({ error: 'CRM Lead scoring mutation failed' }, { status: statusFor(error) });
  }
}
