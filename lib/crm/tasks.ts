import type { SupabaseClient } from '@supabase/supabase-js';

export type CrmTaskStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELED';
export type CrmTaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type CrmTaskType =
  | 'GENERAL'
  | 'CALL'
  | 'EMAIL'
  | 'WHATSAPP'
  | 'MEETING'
  | 'REVIEW'
  | 'FOLLOW_UP'
  | 'OTHER';

export type CrmTaskRow = {
  id: string;
  organization_id: string;
  business_id: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  task_type: CrmTaskType;
  title: string;
  description: string | null;
  status: CrmTaskStatus;
  priority: CrmTaskPriority;
  assignee_user_id: string | null;
  due_at: string | null;
  blocked_reason: string | null;
  completion_note: string | null;
  source_type: string;
  source_id: string | null;
  request_key: string;
  creator_type: 'USER' | 'SYSTEM';
  created_by_user_id: string | null;
  completed_by_user_id: string | null;
  canceled_by_user_id: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  version: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CrmTaskCursor = {
  updatedAt: string;
  id: string;
};

export type CrmTaskPage = {
  items: CrmTaskRow[];
  nextCursor: CrmTaskCursor | null;
};

export class CrmTaskMutationError extends Error {
  code: 'NOT_FOUND' | 'VERSION_CONFLICT';

  constructor(code: 'NOT_FOUND' | 'VERSION_CONFLICT', message: string) {
    super(message);
    this.code = code;
  }
}

function clampLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(Math.max(Math.trunc(value ?? 50), 1), 100);
}

function parseIso(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

export function normalizeCrmTaskCursor(
  cursor: CrmTaskCursor | null | undefined,
): CrmTaskCursor | null {
  if (!cursor) return null;
  const updatedAt = parseIso(cursor.updatedAt);
  if (!updatedAt || !/^[0-9a-f-]{36}$/i.test(cursor.id)) return null;
  return { updatedAt, id: cursor.id };
}

export async function listCrmTasks(input: {
  supabase: SupabaseClient;
  organizationId: string;
  businessId?: string | null;
  leadId?: string | null;
  assigneeUserId?: string | null;
  status?: CrmTaskStatus | null;
  includeClosed?: boolean;
  limit?: number;
  cursor?: CrmTaskCursor | null;
}): Promise<CrmTaskPage> {
  const limit = clampLimit(input.limit);
  const cursor = normalizeCrmTaskCursor(input.cursor);

  const { data, error } = await input.supabase.rpc('get_crm_tasks', {
    p_organization_id: input.organizationId,
    p_business_id: input.businessId ?? null,
    p_lead_id: input.leadId ?? null,
    p_assignee_user_id: input.assigneeUserId ?? null,
    p_status: input.status ?? null,
    p_include_closed: input.includeClosed === true,
    p_limit: limit + 1,
    p_before_updated_at: cursor?.updatedAt ?? null,
    p_before_id: cursor?.id ?? null,
  });

  if (error) throw new Error(`CRM task query failed: ${error.message}`);

  const rows = (Array.isArray(data) ? data : []) as CrmTaskRow[];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = hasMore ? items.at(-1) : null;

  return {
    items,
    nextCursor: last ? { updatedAt: last.updated_at, id: last.id } : null,
  };
}

export async function createCrmTask(input: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  businessId?: string | null;
  leadId?: string | null;
  conversationId?: string | null;
  taskType?: CrmTaskType;
  title: string;
  description?: string | null;
  priority?: CrmTaskPriority;
  assigneeUserId?: string | null;
  dueAt?: string | null;
  requestKey: string;
  metadata?: Record<string, unknown>;
}): Promise<CrmTaskRow> {
  const existing = await input.supabase
    .from('crm_tasks')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('request_key', input.requestKey)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`CRM task idempotency lookup failed: ${existing.error.message}`);
  }
  if (existing.data) return existing.data as CrmTaskRow;

  const { data, error } = await input.supabase
    .from('crm_tasks')
    .insert({
      organization_id: input.organizationId,
      business_id: input.businessId ?? null,
      lead_id: input.leadId ?? null,
      conversation_id: input.conversationId ?? null,
      task_type: input.taskType ?? 'GENERAL',
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: 'OPEN',
      priority: input.priority ?? 'NORMAL',
      assignee_user_id: input.assigneeUserId ?? null,
      due_at: input.dueAt ?? null,
      source_type: 'MANUAL',
      source_id: null,
      request_key: input.requestKey.trim(),
      creator_type: 'USER',
      created_by_user_id: input.actorUserId,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();

  if (!error && data) return data as CrmTaskRow;

  if (error?.code === '23505') {
    const retry = await input.supabase
      .from('crm_tasks')
      .select('*')
      .eq('organization_id', input.organizationId)
      .eq('request_key', input.requestKey)
      .maybeSingle();

    if (!retry.error && retry.data) return retry.data as CrmTaskRow;
  }

  throw new Error(`CRM task create failed: ${error?.message ?? 'unknown error'}`);
}

export async function updateCrmTask(input: {
  supabase: SupabaseClient;
  organizationId: string;
  taskId: string;
  expectedVersion: number;
  patch: {
    taskType?: CrmTaskType;
    title?: string;
    description?: string | null;
    status?: CrmTaskStatus;
    priority?: CrmTaskPriority;
    assigneeUserId?: string | null;
    dueAt?: string | null;
    blockedReason?: string | null;
    completionNote?: string | null;
    metadata?: Record<string, unknown>;
  };
}): Promise<CrmTaskRow> {
  const update: Record<string, unknown> = {};

  if (input.patch.taskType !== undefined) update.task_type = input.patch.taskType;
  if (input.patch.title !== undefined) update.title = input.patch.title.trim();
  if (input.patch.description !== undefined) {
    update.description = input.patch.description?.trim() || null;
  }
  if (input.patch.status !== undefined) update.status = input.patch.status;
  if (input.patch.priority !== undefined) update.priority = input.patch.priority;
  if (input.patch.assigneeUserId !== undefined) {
    update.assignee_user_id = input.patch.assigneeUserId;
  }
  if (input.patch.dueAt !== undefined) update.due_at = input.patch.dueAt;
  if (input.patch.blockedReason !== undefined) {
    update.blocked_reason = input.patch.blockedReason?.trim() || null;
  }
  if (input.patch.completionNote !== undefined) {
    update.completion_note = input.patch.completionNote?.trim() || null;
  }
  if (input.patch.metadata !== undefined) update.metadata = input.patch.metadata;

  const { data, error } = await input.supabase
    .from('crm_tasks')
    .update(update)
    .eq('organization_id', input.organizationId)
    .eq('id', input.taskId)
    .eq('version', input.expectedVersion)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`CRM task update failed: ${error.message}`);
  if (data) return data as CrmTaskRow;

  const current = await input.supabase
    .from('crm_tasks')
    .select('id,version')
    .eq('organization_id', input.organizationId)
    .eq('id', input.taskId)
    .maybeSingle();

  if (current.error) {
    throw new Error(`CRM task conflict lookup failed: ${current.error.message}`);
  }
  if (!current.data) {
    throw new CrmTaskMutationError('NOT_FOUND', 'CRM task not found');
  }

  throw new CrmTaskMutationError(
    'VERSION_CONFLICT',
    `CRM task version conflict; current version is ${current.data.version}`,
  );
}
