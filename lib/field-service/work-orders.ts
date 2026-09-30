import type { SupabaseClient } from '@supabase/supabase-js';

export const FIELD_SERVICE_BUCKET = 'field-service-evidence';
export const FIELD_SERVICE_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const FIELD_SERVICE_EVIDENCE_TYPES = ['PHOTO','DOCUMENT','SIGNATURE'] as const;
export const FIELD_SERVICE_ALLOWED_MIME_TYPES = [
  'image/jpeg','image/png','image/webp','image/heic','application/pdf',
] as const;

export type FieldServiceEvidenceType = typeof FIELD_SERVICE_EVIDENCE_TYPES[number];

export type FieldServiceTask = {
  id: string;
  organization_id: string;
  person_id: string | null;
  business_id: string | null;
  task_type: 'FIELD_SERVICE';
  title: string;
  status: 'OPEN'|'IN_PROGRESS'|'BLOCKED'|'DONE'|'CANCELED';
  priority: 'LOW'|'NORMAL'|'HIGH'|'URGENT';
  assignee_user_id: string | null;
  due_at: string | null;
  completion_note: string | null;
  version: number;
};

export type FieldServiceWorkOrder = {
  task_id: string;
  organization_id: string;
  booking_id: string | null;
  support_case_id: string | null;
  branch_id: string | null;
  location_source: 'BOOKING_BRANCH'|'BUSINESS_ADDRESS'|'CUSTOMER_CONFIRMED'|'MANUAL_CONFIRMED'|'REMOTE';
  location_reference: string | null;
  location_snapshot: Record<string, unknown>;
  requires_customer_signoff: boolean;
  completion_summary: string | null;
  version: number;
};

export class FieldServiceError extends Error {
  code: 'INVALID_INPUT'|'NOT_FOUND'|'FORBIDDEN'|'CONFLICT'|'STORAGE_ERROR';
  constructor(code: FieldServiceError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export function canManageFieldServiceTask(input: {
  role: string;
  userId: string;
  assigneeUserId: string | null;
}) {
  return ['OWNER','ADMIN','SALES_MANAGER'].includes(input.role)
    || (input.role === 'SALES_AGENT' && input.assigneeUserId === input.userId);
}

export function safeEvidenceFilename(value: string) {
  const trimmed = value.trim().slice(0, 120);
  const safe = trimmed.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return safe || 'evidence';
}

export function fieldServiceObjectPath(input: {
  organizationId: string;
  taskId: string;
  evidenceId: string;
  filename: string;
}) {
  return [
    input.organizationId,
    input.taskId,
    input.evidenceId,
    safeEvidenceFilename(input.filename),
  ].join('/');
}

export function assertFieldServiceObjectPath(input: {
  path: string;
  organizationId: string;
  taskId: string;
  evidenceId: string;
}) {
  const prefix = `${input.organizationId}/${input.taskId}/${input.evidenceId}/`;
  if (!input.path.startsWith(prefix) || input.path.length > 1024) {
    throw new FieldServiceError('INVALID_INPUT','Field Service evidence object path is invalid');
  }
}

export async function loadFieldServiceTask(input: {
  supabase: SupabaseClient;
  organizationId: string;
  taskId: string;
}) {
  const [task,workOrder] = await Promise.all([
    input.supabase.from('crm_tasks')
      .select('id,organization_id,person_id,business_id,task_type,title,status,priority,assignee_user_id,due_at,completion_note,version')
      .eq('organization_id',input.organizationId)
      .eq('id',input.taskId)
      .maybeSingle(),
    input.supabase.from('field_service_work_orders')
      .select('task_id,organization_id,booking_id,support_case_id,branch_id,location_source,location_reference,location_snapshot,requires_customer_signoff,completion_summary,version')
      .eq('organization_id',input.organizationId)
      .eq('task_id',input.taskId)
      .maybeSingle(),
  ]);
  if (task.error) throw new FieldServiceError('CONFLICT',`Field Service Task lookup failed: ${task.error.message}`);
  if (workOrder.error) throw new FieldServiceError('CONFLICT',`Field Service work-order lookup failed: ${workOrder.error.message}`);
  if (!task.data || task.data.task_type !== 'FIELD_SERVICE' || !workOrder.data) {
    throw new FieldServiceError('NOT_FOUND','Field Service work order was not found');
  }
  return {
    task: task.data as FieldServiceTask,
    workOrder: workOrder.data as FieldServiceWorkOrder,
  };
}
