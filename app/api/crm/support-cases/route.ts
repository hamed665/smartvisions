import { NextResponse } from 'next/server';

import {
  canMutateCrmSupport,
  createCrmSupportCase,
  isCrmSupportPriority,
  isCrmSupportStatus,
  listCrmSupportCases,
  listCrmSupportSlaPolicies,
  mutateCrmSupportCase,
  upsertCrmSupportSlaPolicy,
} from '@/lib/crm/support-cases';
import { createClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
function optionalUuid(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || value === '' || isUuid(value);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function integer(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}
function parseIso(value: string | null) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

async function membership(organizationId: string) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) } as const;
  const { data, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error || !data) return { response: NextResponse.json({ error: 'Organization membership required' }, { status: 403 }) } as const;
  return { supabase, userId: auth.user.id, role: String(data.role) } as const;
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/version conflict|lineage mismatch|must be RESOLVED|may only reopen|limit reached/i.test(message)) return 409;
  if (/was not found|requires an active Person|policy was not found/i.test(message)) return 404;
  if (/requires .*authorized|OWNER, ADMIN|permission denied|row-level security/i.test(message)) return 403;
  if (/Invalid|required|must match|assignable Organization member|resolved Case/i.test(message)) return 400;
  return 500;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId') ?? '';
  const mode = url.searchParams.get('mode') ?? 'cases';
  if (!isUuid(organizationId)) return NextResponse.json({ error: 'Invalid Organization' }, { status: 400 });
  const auth = await membership(organizationId);
  if ('response' in auth) return auth.response;

  try {
    if (mode === 'sla') {
      const policies = await listCrmSupportSlaPolicies({
        supabase: auth.supabase,
        organizationId,
        includeRetired: url.searchParams.get('includeRetired') === 'true',
      });
      return NextResponse.json({ policies }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    const status = url.searchParams.get('status');
    const priority = url.searchParams.get('priority');
    const assigneeUserId = url.searchParams.get('assigneeUserId');
    const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
    const beforeUpdatedAt = url.searchParams.get('beforeUpdatedAt');
    const beforeId = url.searchParams.get('beforeId');
    if ((status && !isCrmSupportStatus(status))
      || (priority && !isCrmSupportPriority(priority))
      || (assigneeUserId && !isUuid(assigneeUserId))
      || !Number.isInteger(limitRaw)
      || limitRaw < 1 || limitRaw > 100
      || Boolean(beforeUpdatedAt) !== Boolean(beforeId)
      || (beforeId && !isUuid(beforeId))
      || (beforeUpdatedAt && !parseIso(beforeUpdatedAt))) {
      return NextResponse.json({ error: 'Invalid Support Case query' }, { status: 400 });
    }

    const page = await listCrmSupportCases({
      supabase: auth.supabase,
      organizationId,
      status: status && isCrmSupportStatus(status) ? status : null,
      priority: priority && isCrmSupportPriority(priority) ? priority : null,
      assigneeUserId: assigneeUserId || null,
      includeClosed: url.searchParams.get('includeClosed') === 'true',
      limit: limitRaw,
      cursor: beforeUpdatedAt && beforeId
        ? { updatedAt: parseIso(beforeUpdatedAt)!, id: beforeId }
        : null,
    });
    return NextResponse.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('CRM Support read failed', error);
    return NextResponse.json({ error: 'CRM Support read failed' }, { status: statusFor(error) });
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
  const action = String(body.action ?? '');
  if (!isUuid(organizationId)) return NextResponse.json({ error: 'Invalid Organization' }, { status: 400 });

  const auth = await membership(organizationId);
  if ('response' in auth) return auth.response;
  if (!canMutateCrmSupport(auth.role)) {
    return NextResponse.json({ error: 'Support Case mutation requires an authorized Organization member' }, { status: 403 });
  }
  const service = createSupabaseServiceClient();

  try {
    if (action === 'UPSERT_SLA') {
      if (!['OWNER','ADMIN','SALES_MANAGER'].includes(auth.role)
        || !isUuid(body.policyId)
        || typeof body.name !== 'string'
        || body.name.trim().length < 1 || body.name.trim().length > 120
        || !isCrmSupportPriority(body.priority)
        || integer(body.firstResponseMinutes) === null
        || integer(body.resolutionMinutes) === null
        || !(body.escalationMinutes === null || body.escalationMinutes === undefined || integer(body.escalationMinutes) !== null)
        || !['ACTIVE','RETIRED'].includes(String(body.status))
        || integer(body.expectedVersion) === null
        || typeof body.requestKey !== 'string') {
        return NextResponse.json({ error: 'Invalid Support SLA payload' }, { status: 400 });
      }
      const result = await upsertCrmSupportSlaPolicy({
        service,
        organizationId,
        actorUserId: auth.userId,
        policyId: body.policyId,
        name: body.name.trim(),
        priority: body.priority,
        firstResponseMinutes: body.firstResponseMinutes as number,
        resolutionMinutes: body.resolutionMinutes as number,
        escalationMinutes: body.escalationMinutes == null ? null : body.escalationMinutes as number,
        status: String(body.status) as 'ACTIVE' | 'RETIRED',
        expectedVersion: body.expectedVersion as number,
        requestKey: String(body.requestKey),
      });
      return NextResponse.json({ action, result });
    }

    if (action === 'CREATE_CASE') {
      if (!isUuid(body.caseId)
        || !optionalUuid(body.businessId)
        || !optionalUuid(body.personId)
        || !optionalUuid(body.conversationId)
        || typeof body.subject !== 'string'
        || body.subject.trim().length < 1 || body.subject.trim().length > 240
        || (body.description != null && (typeof body.description !== 'string' || body.description.length > 8000))
        || !isCrmSupportPriority(body.priority)
        || !optionalUuid(body.assigneeUserId)
        || !optionalUuid(body.slaPolicyId)
        || !['MANUAL','CONVERSATION','WEBHOOK','IMPORT_VERIFIED'].includes(String(body.sourceType ?? 'MANUAL'))
        || (body.sourceRef != null && typeof body.sourceRef !== 'string')
        || typeof body.requestKey !== 'string'
        || !isObject(body.metadata ?? {})) {
        return NextResponse.json({ error: 'Invalid Support Case payload' }, { status: 400 });
      }
      const result = await createCrmSupportCase({
        service,
        organizationId,
        actorUserId: auth.userId,
        caseId: body.caseId,
        businessId: body.businessId ? String(body.businessId) : null,
        personId: body.personId ? String(body.personId) : null,
        conversationId: body.conversationId ? String(body.conversationId) : null,
        subject: body.subject.trim(),
        description: typeof body.description === 'string' ? body.description : null,
        priority: body.priority,
        assigneeUserId: body.assigneeUserId ? String(body.assigneeUserId) : null,
        slaPolicyId: body.slaPolicyId ? String(body.slaPolicyId) : null,
        sourceType: String(body.sourceType ?? 'MANUAL') as 'MANUAL' | 'CONVERSATION' | 'WEBHOOK' | 'IMPORT_VERIFIED',
        sourceRef: typeof body.sourceRef === 'string' ? body.sourceRef : null,
        requestKey: body.requestKey,
        metadata: (body.metadata ?? {}) as Record<string, unknown>,
      });
      return NextResponse.json({ action, result }, { status: 201 });
    }

    if (!['ASSIGN','FIRST_RESPONSE','TRANSITION','ESCALATE','CSAT'].includes(action)
      || !isUuid(body.caseId)
      || integer(body.expectedVersion) === null) {
      return NextResponse.json({ error: 'Invalid Support Case mutation' }, { status: 400 });
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (action !== 'CSAT' && (reason.length < 1 || reason.length > 500)) {
      return NextResponse.json({ error: 'Support Case mutation reason is required' }, { status: 400 });
    }

    if (action === 'ASSIGN' && !optionalUuid(body.assigneeUserId)) {
      return NextResponse.json({ error: 'Invalid Support Case assignee' }, { status: 400 });
    }
    if (action === 'TRANSITION' && !isCrmSupportStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid Support Case status' }, { status: 400 });
    }
    if (action === 'CSAT'
      && (integer(body.score) === null || (body.score as number) < 1 || (body.score as number) > 5
        || typeof body.sourceRef !== 'string'
        || body.sourceRef.trim().length < 1
        || (body.comment != null && (typeof body.comment !== 'string' || body.comment.length > 2000)))) {
      return NextResponse.json({ error: 'Invalid Support Case CSAT' }, { status: 400 });
    }

    const result = await mutateCrmSupportCase({
      service,
      action: action as 'ASSIGN' | 'FIRST_RESPONSE' | 'TRANSITION' | 'ESCALATE' | 'CSAT',
      organizationId,
      actorUserId: auth.userId,
      caseId: String(body.caseId),
      expectedVersion: body.expectedVersion as number,
      reason,
      assigneeUserId: body.assigneeUserId ? String(body.assigneeUserId) : null,
      status: isCrmSupportStatus(body.status) ? body.status : undefined,
      resolutionSummary: typeof body.resolutionSummary === 'string' ? body.resolutionSummary : null,
      score: typeof body.score === 'number' ? body.score : undefined,
      comment: typeof body.comment === 'string' ? body.comment : null,
      sourceRef: typeof body.sourceRef === 'string' ? body.sourceRef.trim() : undefined,
    });
    return NextResponse.json({ action, result });
  } catch (error) {
    console.error('CRM Support mutation failed', error);
    const status = statusFor(error);
    return NextResponse.json({
      error: status >= 500 ? 'CRM Support mutation failed' : (error instanceof Error ? error.message : 'CRM Support mutation failed'),
    }, { status });
  }
}
