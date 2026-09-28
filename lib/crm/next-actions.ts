import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type CrmNextActionKind =
  | 'TASK_REMINDER_DUE'
  | 'TASK_OVERDUE'
  | 'TASK_BLOCKED'
  | 'TASK_OPEN'
  | 'LEAD_STALE'
  | 'DEAL_STALE'
  | 'DEAL_CLOSE_OVERDUE';

export type CrmNextActionRow = {
  candidate_key: string;
  candidate_kind: CrmNextActionKind;
  source_entity_type: 'TASK' | 'LEAD' | 'DEAL';
  source_entity_id: string;
  task_id: string | null;
  business_id: string | null;
  lead_id: string | null;
  deal_id: string | null;
  suggested_task_type: string;
  title: string;
  reason_code: string;
  priority: string;
  priority_score: number;
  assignee_user_id: string | null;
  recommended_due_at: string | null;
  recommended_reminder_at: string | null;
  last_activity_at: string;
  source_status: string;
  accepted: boolean;
  model_suggestion: Record<string, unknown> | null;
  model_suggested_at: string | null;
};

export async function listCrmNextActions(input: {
  supabase: SupabaseClient;
  organizationId: string;
  staleHours?: number;
  assigneeUserId?: string | null;
  limit?: number;
}) {
  const { data, error } = await input.supabase.rpc('get_crm_next_actions', {
    p_organization_id: input.organizationId,
    p_stale_hours: input.staleHours ?? 72,
    p_assignee_user_id: input.assigneeUserId ?? null,
    p_limit: input.limit ?? 100,
  });

  if (error) throw new Error(`CRM next-action query failed: ${error.message}`);
  return (Array.isArray(data) ? data : []) as CrmNextActionRow[];
}

export async function acceptCrmNextActionCandidate(input: {
  supabase: SupabaseClient;
  organizationId: string;
  candidateKind: 'LEAD_STALE' | 'DEAL_STALE' | 'DEAL_CLOSE_OVERDUE';
  entityId: string;
  assigneeUserId?: string | null;
  dueAt?: string | null;
  reminderAt?: string | null;
  requestKey: string;
  staleHours?: number;
}) {
  const { data, error } = await input.supabase.rpc('accept_crm_next_action_candidate', {
    p_organization_id: input.organizationId,
    p_candidate_kind: input.candidateKind,
    p_entity_id: input.entityId,
    p_assignee_user_id: input.assigneeUserId ?? null,
    p_due_at: input.dueAt ?? null,
    p_reminder_at: input.reminderAt ?? null,
    p_request_key: input.requestKey,
    p_stale_hours: input.staleHours ?? 72,
  });

  if (error) throw new Error(`CRM next-action acceptance failed: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.resolved_task_id) throw new Error('CRM next-action acceptance returned no Task');
  return {
    taskId: String(row.resolved_task_id),
    replayed: row.replayed === true,
  };
}

export async function recordCrmTaskNextActionModelSuggestion(input: {
  supabase: SupabaseClient;
  organizationId: string;
  taskId: string;
  actorUserId: string;
  suggestion: Record<string, unknown> | null;
}) {
  const { data, error } = await input.supabase.rpc('record_crm_task_next_action_model_suggestion', {
    p_organization_id: input.organizationId,
    p_task_id: input.taskId,
    p_actor_user_id: input.actorUserId,
    p_suggestion: input.suggestion,
  });

  if (error) throw new Error(`CRM next-action model suggestion failed: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : null;
  return {
    taskId: String(row?.resolved_task_id ?? input.taskId),
    cleared: row?.cleared === true,
  };
}
