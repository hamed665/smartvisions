import { NextResponse } from 'next/server';
import {
  createCrmTask,
  CrmTaskMutationError,
  listCrmTasks,
  updateCrmTask,
  type CrmTaskPriority,
  type CrmTaskStatus,
  type CrmTaskType,
} from '@/lib/crm/tasks';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES: CrmTaskStatus[] = ['OPEN','IN_PROGRESS','BLOCKED','DONE','CANCELED'];
const PRIORITIES: CrmTaskPriority[] = ['LOW','NORMAL','HIGH','URGENT'];
const TASK_TYPES: CrmTaskType[] = [
  'GENERAL','CALL','EMAIL','WHATSAPP','MEETING','REVIEW','FOLLOW_UP','OTHER',
];

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function optionalUuid(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || isUuid(value);
}

function parseLimit(value: string | null) {
  if (!value) return 50;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return null;
  return Math.min(Math.max(parsed, 1), 100);
}

function parseBoolean(value: string | null, fallback: boolean) {
  if (value === null) return fallback;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
}

function parseIso(value: unknown) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return undefined;
  return new Date(time).toISOString();
}

function isMetadata(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mutationStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/row-level security|permission denied|not allowed/i.test(message)) return 403;
  return 500;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const businessId = url.searchParams.get('businessId');
  const leadId = url.searchParams.get('leadId');
  const assigneeUserId = url.searchParams.get('assigneeUserId');
  const status = url.searchParams.get('status');
  const includeClosed = parseBoolean(url.searchParams.get('includeClosed'), false);
  const limit = parseLimit(url.searchParams.get('limit'));
  const beforeUpdatedAt = url.searchParams.get('beforeUpdatedAt');
  const beforeId = url.searchParams.get('beforeId');

  if (!isUuid(organizationId)
      || !optionalUuid(businessId)
      || !optionalUuid(leadId)
      || !optionalUuid(assigneeUserId)
      || (status !== null && !STATUSES.includes(status as CrmTaskStatus))
      || includeClosed === null
      || limit === null) {
    return NextResponse.json({ error: 'Invalid CRM task query parameters' }, { status: 400 });
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
      return NextResponse.json({ error: 'Invalid CRM task cursor' }, { status: 400 });
    }
    cursor = { updatedAt, id: beforeId };
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const page = await listCrmTasks({
      supabase,
      organizationId,
      businessId,
      leadId,
      assigneeUserId,
      status: status as CrmTaskStatus | null,
      includeClosed,
      limit,
      cursor,
    });

    return NextResponse.json(page, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('CRM task query failed', error);
    return NextResponse.json(
      { error: 'CRM task query failed' },
      { status: mutationStatus(error) },
    );
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
    if (!isMetadata(parsed)) throw new Error('invalid body');
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const organizationId = body.organizationId;
  const businessId = body.businessId;
  const leadId = body.leadId;
  const conversationId = body.conversationId;
  const taskType = body.taskType ?? 'GENERAL';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = body.description;
  const priority = body.priority ?? 'NORMAL';
  const assigneeUserId = Object.prototype.hasOwnProperty.call(body, 'assigneeUserId')
    ? body.assigneeUserId
    : auth.user.id;
  const dueAt = Object.prototype.hasOwnProperty.call(body, 'dueAt')
    ? parseIso(body.dueAt)
    : null;
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';
  const metadata = body.metadata ?? {};

  if (!isUuid(organizationId)
      || !optionalUuid(businessId)
      || !optionalUuid(leadId)
      || !optionalUuid(conversationId)
      || !TASK_TYPES.includes(taskType as CrmTaskType)
      || title.length < 1
      || title.length > 240
      || (description !== undefined && description !== null
        && (typeof description !== 'string' || description.length > 8000))
      || !PRIORITIES.includes(priority as CrmTaskPriority)
      || !optionalUuid(assigneeUserId)
      || dueAt === undefined
      || requestKey.length < 1
      || requestKey.length > 200
      || !isMetadata(metadata)) {
    return NextResponse.json({ error: 'Invalid CRM task payload' }, { status: 400 });
  }

  try {
    const task = await createCrmTask({
      supabase,
      organizationId,
      actorUserId: auth.user.id,
      businessId,
      leadId,
      conversationId,
      taskType: taskType as CrmTaskType,
      title,
      description: typeof description === 'string' ? description : null,
      priority: priority as CrmTaskPriority,
      assigneeUserId,
      dueAt,
      requestKey,
      metadata,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('CRM task create failed', error);
    return NextResponse.json(
      { error: 'CRM task create failed' },
      { status: mutationStatus(error) },
    );
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
    if (!isMetadata(parsed)) throw new Error('invalid body');
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const organizationId = body.organizationId;
  const taskId = body.taskId;
  const expectedVersion = body.expectedVersion;
  const patch = body.patch;

  if (!isUuid(organizationId)
      || !isUuid(taskId)
      || typeof expectedVersion !== 'number'
      || !Number.isInteger(expectedVersion)
      || expectedVersion < 1
      || !isMetadata(patch)
      || Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Invalid CRM task update payload' }, { status: 400 });
  }

  const allowed = new Set([
    'taskType','title','description','status','priority','assigneeUserId',
    'dueAt','blockedReason','completionNote','metadata',
  ]);
  if (Object.keys(patch).some(key => !allowed.has(key))) {
    return NextResponse.json({ error: 'Unsupported CRM task patch field' }, { status: 400 });
  }

  const dueAt = Object.prototype.hasOwnProperty.call(patch, 'dueAt')
    ? parseIso(patch.dueAt)
    : undefined;

  if ((patch.taskType !== undefined && !TASK_TYPES.includes(patch.taskType as CrmTaskType))
      || (patch.title !== undefined
        && (typeof patch.title !== 'string'
          || patch.title.trim().length < 1
          || patch.title.trim().length > 240))
      || (patch.description !== undefined && patch.description !== null
        && (typeof patch.description !== 'string' || patch.description.length > 8000))
      || (patch.status !== undefined && !STATUSES.includes(patch.status as CrmTaskStatus))
      || (patch.priority !== undefined
        && !PRIORITIES.includes(patch.priority as CrmTaskPriority))
      || (patch.assigneeUserId !== undefined && !optionalUuid(patch.assigneeUserId))
      || dueAt === undefined && Object.prototype.hasOwnProperty.call(patch, 'dueAt')
      || (patch.blockedReason !== undefined && patch.blockedReason !== null
        && (typeof patch.blockedReason !== 'string' || patch.blockedReason.length > 2000))
      || (patch.completionNote !== undefined && patch.completionNote !== null
        && (typeof patch.completionNote !== 'string' || patch.completionNote.length > 4000))
      || (patch.metadata !== undefined && !isMetadata(patch.metadata))) {
    return NextResponse.json({ error: 'Invalid CRM task patch' }, { status: 400 });
  }

  try {
    const task = await updateCrmTask({
      supabase,
      organizationId,
      taskId,
      expectedVersion,
      patch: {
        taskType: patch.taskType as CrmTaskType | undefined,
        title: patch.title as string | undefined,
        description: patch.description as string | null | undefined,
        status: patch.status as CrmTaskStatus | undefined,
        priority: patch.priority as CrmTaskPriority | undefined,
        assigneeUserId: patch.assigneeUserId as string | null | undefined,
        dueAt,
        blockedReason: patch.blockedReason as string | null | undefined,
        completionNote: patch.completionNote as string | null | undefined,
        metadata: patch.metadata as Record<string, unknown> | undefined,
      },
    });

    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof CrmTaskMutationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === 'NOT_FOUND' ? 404 : 409 },
      );
    }

    console.error('CRM task update failed', error);
    return NextResponse.json(
      { error: 'CRM task update failed' },
      { status: mutationStatus(error) },
    );
  }
}
