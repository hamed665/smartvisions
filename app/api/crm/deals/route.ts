import { NextResponse } from 'next/server';
import {
  createCrmDeal,
  createCrmDealFromLead,
  listCrmDeals,
  updateCrmDeal,
  CrmDealMutationError,
  type CrmDealState,
} from '@/lib/crm/deals';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES: CrmDealState[] = ['OPEN','WON','LOST'];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
function optionalUuid(value: unknown) {
  return value === null || value === undefined || isUuid(value);
}
function parseLimit(value: string | null) {
  if (!value) return 50;
  const parsed = Number.parseInt(value,10);
  if (!Number.isInteger(parsed)) return null;
  return Math.min(Math.max(parsed,1),100);
}
function parseIso(value: unknown) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}
function mutationStatus(error: unknown) {
  if (error instanceof CrmDealMutationError) {
    if (error.code === 'NOT_FOUND') return 404;
    if (error.code === 'FORBIDDEN') return 403;
    return 409;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/row-level security|permission denied|not permitted/i.test(message)) return 403;
  return 500;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const pipelineId = url.searchParams.get('pipelineId');
  const businessId = url.searchParams.get('businessId');
  const ownerUserId = url.searchParams.get('ownerUserId');
  const state = url.searchParams.get('state');
  const limit = parseLimit(url.searchParams.get('limit'));
  const beforeUpdatedAt = url.searchParams.get('beforeUpdatedAt');
  const beforeId = url.searchParams.get('beforeId');

  if (!isUuid(organizationId)
      || !optionalUuid(pipelineId)
      || !optionalUuid(businessId)
      || !optionalUuid(ownerUserId)
      || (state !== null && !STATES.includes(state as CrmDealState))
      || limit === null) {
    return NextResponse.json({ error: 'Invalid CRM Deal query parameters' }, { status: 400 });
  }

  const hasCursorAt = Boolean(beforeUpdatedAt);
  const hasCursorId = Boolean(beforeId);
  if (hasCursorAt !== hasCursorId) {
    return NextResponse.json({ error: 'beforeUpdatedAt and beforeId must be provided together' }, { status: 400 });
  }

  let cursor: {updatedAt:string; id:string} | null = null;
  if (beforeUpdatedAt && beforeId) {
    const updatedAt = parseIso(beforeUpdatedAt);
    if (!updatedAt || !isUuid(beforeId)) {
      return NextResponse.json({ error: 'Invalid CRM Deal cursor' }, { status: 400 });
    }
    cursor = { updatedAt, id: beforeId };
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const page = await listCrmDeals({
      supabase,
      organizationId,
      pipelineId,
      businessId,
      ownerUserId,
      state: state as CrmDealState | null,
      limit,
      cursor,
    });
    return NextResponse.json(page,{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    console.error('CRM Deal query failed', error);
    return NextResponse.json({ error: 'CRM Deal query failed' }, { status: mutationStatus(error) });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: Record<string,unknown>;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) throw new Error('invalid body');
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const mode = body.mode;
  const organizationId = body.organizationId;
  const businessId = body.businessId;
  const leadId = body.leadId;
  const pipelineId = body.pipelineId;
  const stageId = body.stageId;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const amount = body.amount === null || body.amount === undefined ? null : Number(body.amount);
  const currency = body.currency === null || body.currency === undefined
    ? null
    : String(body.currency).trim().toUpperCase();
  const expectedCloseAt = Object.prototype.hasOwnProperty.call(body,'expectedCloseAt')
    ? parseIso(body.expectedCloseAt)
    : null;
  const ownerUserId = body.ownerUserId;
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';
  const metadata = body.metadata ?? {};

  if ((mode !== 'MANUAL' && mode !== 'LEAD_CONVERSION')
      || !isUuid(organizationId)
      || !isUuid(pipelineId)
      || !isUuid(stageId)
      || title.length < 1
      || title.length > 240
      || (amount !== null && (!Number.isFinite(amount) || amount < 0))
      || (currency !== null && !/^[A-Z]{3}$/.test(currency))
      || ((amount === null) !== (currency === null))
      || expectedCloseAt === undefined
      || !isUuid(ownerUserId)
      || requestKey.length < 1
      || requestKey.length > 200
      || !isObject(metadata)
      || (mode === 'MANUAL' && !isUuid(businessId))
      || (mode === 'MANUAL' && !optionalUuid(leadId))
      || (mode === 'LEAD_CONVERSION' && !isUuid(leadId))) {
    return NextResponse.json({ error: 'Invalid CRM Deal payload' }, { status: 400 });
  }

  try {
    if (mode === 'LEAD_CONVERSION') {
      const dealId = await createCrmDealFromLead({
        supabase,
        organizationId,
        leadId: leadId as string,
        pipelineId,
        stageId,
        title,
        amount,
        currency,
        expectedCloseAt,
        ownerUserId,
        requestKey,
        metadata,
      });
      return NextResponse.json({ dealId }, { status: 201 });
    }

    const deal = await createCrmDeal({
      supabase,
      organizationId,
      actorUserId: auth.user.id,
      businessId: businessId as string,
      leadId: leadId as string | null | undefined,
      pipelineId,
      stageId,
      title,
      amount,
      currency,
      expectedCloseAt,
      ownerUserId,
      requestKey,
      metadata,
    });

    return NextResponse.json({ deal }, { status: 201 });
  } catch (error) {
    console.error('CRM Deal create failed', error);
    return NextResponse.json({ error: 'CRM Deal create failed' }, { status: mutationStatus(error) });
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: Record<string,unknown>;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) throw new Error('invalid body');
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const organizationId = body.organizationId;
  const dealId = body.dealId;
  const expectedVersion = body.expectedVersion;
  const patch = body.patch;

  if (!isUuid(organizationId)
      || !isUuid(dealId)
      || !Number.isInteger(expectedVersion)
      || Number(expectedVersion) < 1
      || !isObject(patch)
      || Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Invalid CRM Deal update payload' }, { status: 400 });
  }

  const allowed = new Set([
    'title','stageId','amount','currency','expectedCloseAt',
    'ownerUserId','lostReason','metadata',
  ]);
  if (Object.keys(patch).some(key => !allowed.has(key))) {
    return NextResponse.json({ error: 'Unsupported CRM Deal patch field' }, { status: 400 });
  }

  const expectedCloseAt = Object.prototype.hasOwnProperty.call(patch,'expectedCloseAt')
    ? parseIso(patch.expectedCloseAt)
    : undefined;
  const amount = Object.prototype.hasOwnProperty.call(patch,'amount')
    ? (patch.amount === null ? null : Number(patch.amount))
    : undefined;
  const currency = Object.prototype.hasOwnProperty.call(patch,'currency')
    ? (patch.currency === null ? null : String(patch.currency).trim().toUpperCase())
    : undefined;

  if ((patch.title !== undefined && (typeof patch.title !== 'string' || patch.title.trim().length < 1 || patch.title.trim().length > 240))
      || (patch.stageId !== undefined && !isUuid(patch.stageId))
      || (amount !== undefined && amount !== null && (!Number.isFinite(amount) || amount < 0))
      || (currency !== undefined && currency !== null && !/^[A-Z]{3}$/.test(currency))
      || expectedCloseAt === undefined && Object.prototype.hasOwnProperty.call(patch,'expectedCloseAt')
      || (patch.ownerUserId !== undefined && !isUuid(patch.ownerUserId))
      || (patch.lostReason !== undefined && patch.lostReason !== null
        && (typeof patch.lostReason !== 'string' || patch.lostReason.length > 2000))
      || (patch.metadata !== undefined && !isObject(patch.metadata))) {
    return NextResponse.json({ error: 'Invalid CRM Deal patch' }, { status: 400 });
  }

  try {
    const deal = await updateCrmDeal({
      supabase,
      organizationId,
      dealId,
      expectedVersion: Number(expectedVersion),
      patch: {
        title: patch.title as string | undefined,
        stageId: patch.stageId as string | undefined,
        amount,
        currency,
        expectedCloseAt,
        ownerUserId: patch.ownerUserId as string | undefined,
        lostReason: patch.lostReason as string | null | undefined,
        metadata: patch.metadata as Record<string,unknown> | undefined,
      },
    });

    return NextResponse.json({ deal });
  } catch (error) {
    if (error instanceof CrmDealMutationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: mutationStatus(error) },
      );
    }
    console.error('CRM Deal update failed', error);
    return NextResponse.json({ error: 'CRM Deal update failed' }, { status: mutationStatus(error) });
  }
}
