import type { SupabaseClient } from '@supabase/supabase-js';

export const CRM_SUPPORT_PRIORITIES = ['LOW','NORMAL','HIGH','URGENT','CRITICAL'] as const;
export const CRM_SUPPORT_STATUSES = ['OPEN','PENDING_CUSTOMER','PENDING_INTERNAL','RESOLVED','CLOSED'] as const;
export const CRM_SUPPORT_MUTATION_ROLES = ['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'] as const;

export type CrmSupportPriority = typeof CRM_SUPPORT_PRIORITIES[number];
export type CrmSupportStatus = typeof CRM_SUPPORT_STATUSES[number];

export type CrmSupportCaseRow = {
  id: string;
  business_id: string | null;
  business_name: string | null;
  person_id: string | null;
  person_name: string | null;
  conversation_id: string | null;
  conversation_channel: string | null;
  subject: string;
  status: CrmSupportStatus;
  priority: CrmSupportPriority;
  assignee_user_id: string | null;
  sla_policy_id: string | null;
  sla_policy_name: string | null;
  first_response_due_at: string | null;
  resolution_due_at: string | null;
  first_responded_at: string | null;
  first_response_breached: boolean;
  resolution_breached: boolean;
  escalation_level: number;
  resolution_summary: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  csat_score: number | null;
  version: number;
  updated_at: string;
  created_at: string;
};

export type CrmSupportSlaPolicy = {
  id: string;
  name: string;
  priority: CrmSupportPriority;
  first_response_minutes: number;
  resolution_minutes: number;
  escalation_minutes: number | null;
  status: 'ACTIVE' | 'RETIRED';
  version: number;
  updated_at: string;
};

export function isCrmSupportPriority(value: unknown): value is CrmSupportPriority {
  return typeof value === 'string'
    && (CRM_SUPPORT_PRIORITIES as readonly string[]).includes(value);
}

export function isCrmSupportStatus(value: unknown): value is CrmSupportStatus {
  return typeof value === 'string'
    && (CRM_SUPPORT_STATUSES as readonly string[]).includes(value);
}

export function canMutateCrmSupport(role: unknown) {
  return typeof role === 'string'
    && (CRM_SUPPORT_MUTATION_ROLES as readonly string[]).includes(role);
}

export async function listCrmSupportCases(input: {
  supabase: SupabaseClient;
  organizationId: string;
  status?: CrmSupportStatus | null;
  priority?: CrmSupportPriority | null;
  assigneeUserId?: string | null;
  includeClosed?: boolean;
  limit?: number;
  cursor?: { updatedAt: string; id: string } | null;
}) {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 100);
  const { data, error } = await input.supabase.rpc('get_crm_support_cases', {
    p_organization_id: input.organizationId,
    p_status: input.status ?? null,
    p_priority: input.priority ?? null,
    p_assignee_user_id: input.assigneeUserId ?? null,
    p_include_closed: input.includeClosed ?? false,
    p_limit: limit,
    p_before_updated_at: input.cursor?.updatedAt ?? null,
    p_before_id: input.cursor?.id ?? null,
  });
  if (error) throw new Error(`CRM Support Case list failed: ${error.message}`);
  const items = (data ?? []) as unknown as CrmSupportCaseRow[];
  const last = items.length === limit ? items.at(-1) : null;
  return {
    items,
    nextCursor: last ? { updatedAt: last.updated_at, id: last.id } : null,
  };
}

export async function listCrmSupportSlaPolicies(input: {
  supabase: SupabaseClient;
  organizationId: string;
  includeRetired?: boolean;
}) {
  const { data, error } = await input.supabase.rpc('get_crm_support_sla_policies', {
    p_organization_id: input.organizationId,
    p_include_retired: input.includeRetired ?? false,
  });
  if (error) throw new Error(`CRM Support SLA list failed: ${error.message}`);
  return (data ?? []) as unknown as CrmSupportSlaPolicy[];
}

async function oneRow(service: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await service.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(`${fn} returned no result`);
  return row as Record<string, unknown>;
}

export async function upsertCrmSupportSlaPolicy(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  policyId: string;
  name: string;
  priority: CrmSupportPriority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  escalationMinutes: number | null;
  status: 'ACTIVE' | 'RETIRED';
  expectedVersion: number;
  requestKey: string;
}) {
  return oneRow(input.service, 'upsert_crm_support_sla_policy_manual', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_policy_id: input.policyId,
    p_name: input.name,
    p_priority: input.priority,
    p_first_response_minutes: input.firstResponseMinutes,
    p_resolution_minutes: input.resolutionMinutes,
    p_escalation_minutes: input.escalationMinutes,
    p_status: input.status,
    p_expected_version: input.expectedVersion,
    p_request_key: input.requestKey,
  });
}

export async function createCrmSupportCase(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  caseId: string;
  businessId: string | null;
  personId: string | null;
  conversationId: string | null;
  subject: string;
  description: string | null;
  priority: CrmSupportPriority;
  assigneeUserId: string | null;
  slaPolicyId: string | null;
  sourceType: 'MANUAL' | 'CONVERSATION' | 'WEBHOOK' | 'IMPORT_VERIFIED';
  sourceRef: string | null;
  requestKey: string;
  metadata: Record<string, unknown>;
}) {
  return oneRow(input.service, 'create_crm_support_case_manual', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_case_id: input.caseId,
    p_business_id: input.businessId,
    p_person_id: input.personId,
    p_conversation_id: input.conversationId,
    p_subject: input.subject,
    p_description: input.description,
    p_priority: input.priority,
    p_assignee_user_id: input.assigneeUserId,
    p_sla_policy_id: input.slaPolicyId,
    p_source_type: input.sourceType,
    p_source_ref: input.sourceRef,
    p_request_key: input.requestKey,
    p_metadata: input.metadata,
  });
}

export async function mutateCrmSupportCase(input: {
  service: SupabaseClient;
  action: 'ASSIGN' | 'FIRST_RESPONSE' | 'TRANSITION' | 'ESCALATE' | 'CSAT';
  organizationId: string;
  actorUserId: string;
  caseId: string;
  expectedVersion: number;
  reason?: string;
  assigneeUserId?: string | null;
  status?: CrmSupportStatus;
  resolutionSummary?: string | null;
  score?: number;
  comment?: string | null;
  sourceRef?: string;
}) {
  if (input.action === 'ASSIGN') {
    return oneRow(input.service, 'assign_crm_support_case_manual', {
      p_organization_id: input.organizationId,
      p_actor_user_id: input.actorUserId,
      p_case_id: input.caseId,
      p_assignee_user_id: input.assigneeUserId ?? null,
      p_expected_version: input.expectedVersion,
      p_reason: input.reason ?? '',
    });
  }
  if (input.action === 'FIRST_RESPONSE') {
    return oneRow(input.service, 'mark_crm_support_first_response_manual', {
      p_organization_id: input.organizationId,
      p_actor_user_id: input.actorUserId,
      p_case_id: input.caseId,
      p_expected_version: input.expectedVersion,
      p_reason: input.reason ?? '',
    });
  }
  if (input.action === 'TRANSITION') {
    return oneRow(input.service, 'transition_crm_support_case_manual', {
      p_organization_id: input.organizationId,
      p_actor_user_id: input.actorUserId,
      p_case_id: input.caseId,
      p_status: input.status,
      p_expected_version: input.expectedVersion,
      p_reason: input.reason ?? '',
      p_resolution_summary: input.resolutionSummary ?? null,
    });
  }
  if (input.action === 'ESCALATE') {
    return oneRow(input.service, 'escalate_crm_support_case_manual', {
      p_organization_id: input.organizationId,
      p_actor_user_id: input.actorUserId,
      p_case_id: input.caseId,
      p_expected_version: input.expectedVersion,
      p_reason: input.reason ?? '',
    });
  }
  return oneRow(input.service, 'record_crm_support_csat_manual', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_case_id: input.caseId,
    p_score: input.score,
    p_comment: input.comment ?? null,
    p_source_ref: input.sourceRef,
    p_expected_version: input.expectedVersion,
  });
}
