import type { SupabaseClient } from '@supabase/supabase-js';

export type CustomerSuccessAction = 'ONBOARDING' | 'RETENTION_REVIEW' | 'REACTIVATION' | 'NONE';

export type CustomerSuccessAccount = {
  business_id: string;
  business_name: string;
  account_lifecycle: 'CUSTOMER' | 'FORMER_CUSTOMER';
  account_owner_user_id: string | null;
  onboarding_state: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'NOT_APPLICABLE';
  health_score: number;
  health_status: 'HEALTHY' | 'AT_RISK' | 'CRITICAL' | 'CHURNED';
  risk_signals: string[];
  last_activity_at: string;
  open_support_case_count: number;
  sla_breach_count: number;
  overdue_task_count: number;
  negative_sentiment_count: number;
  active_relationship_count: number;
  loyalty_points_balance: number;
  referral_count: number;
  suggested_action_kind: CustomerSuccessAction;
  suggested_task_type: string;
  suggested_title: string;
  suggested_priority: string;
};

export type CustomerSuccessSummary = {
  customer_account_count: number;
  former_customer_count: number;
  open_customer_success_task_count: number;
  loyalty_event_count: number;
  loyalty_points_balance: number;
  referral_count: number;
  converted_referral_count: number;
  rewarded_referral_count: number;
  lifecycle_campaign_count: number;
};

function firstRow<T>(data: unknown): T | null {
  return Array.isArray(data) && data.length ? data[0] as T : null;
}

export async function getCustomerSuccessSummary(input: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<CustomerSuccessSummary | null> {
  const { data, error } = await input.supabase.rpc('get_customer_success_summary', {
    p_organization_id: input.organizationId,
  });
  if (error) throw new Error(`Customer Success summary failed: ${error.message}`);
  return firstRow<CustomerSuccessSummary>(data);
}

export async function listCustomerSuccessAccounts(input: {
  supabase: SupabaseClient;
  organizationId: string;
  businessId?: string | null;
  limit?: number;
}): Promise<CustomerSuccessAccount[]> {
  const { data, error } = await input.supabase.rpc('get_customer_success_accounts', {
    p_organization_id: input.organizationId,
    p_business_id: input.businessId ?? null,
    p_limit: input.limit ?? 100,
  });
  if (error) throw new Error(`Customer Success accounts failed: ${error.message}`);
  return (Array.isArray(data) ? data : []) as CustomerSuccessAccount[];
}

export async function acceptCustomerSuccessTaskCandidate(input: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  businessId: string;
  actionKind: Exclude<CustomerSuccessAction, 'NONE'>;
  assigneeUserId?: string | null;
  dueAt?: string | null;
  reminderAt?: string | null;
  requestKey: string;
}) {
  const { data, error } = await input.supabase.rpc('accept_customer_success_task_candidate', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_business_id: input.businessId,
    p_action_kind: input.actionKind,
    p_assignee_user_id: input.assigneeUserId ?? null,
    p_due_at: input.dueAt ?? null,
    p_reminder_at: input.reminderAt ?? null,
    p_request_key: input.requestKey,
  });
  if (error) throw new Error(`Customer Success Task acceptance failed: ${error.message}`);
  const row = firstRow<{ resolved_task_id: string; replayed: boolean }>(data);
  if (!row?.resolved_task_id) throw new Error('Customer Success Task acceptance returned no Task');
  return { taskId: row.resolved_task_id, replayed: row.replayed === true };
}

export async function recordCustomerLoyaltyEvent(input: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  businessId: string;
  personId?: string | null;
  eventType: 'EARN' | 'REDEEM' | 'ADJUST' | 'EXPIRE';
  pointsDelta: number;
  rewardKey?: string | null;
  sourceType?: 'MANUAL' | 'REFERRAL' | 'CAMPAIGN' | 'SERVICE_RECOVERY' | 'OTHER';
  sourceRef: string;
  occurredAt: string;
  requestKey: string;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await input.supabase.rpc('record_customer_loyalty_event', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_business_id: input.businessId,
    p_person_id: input.personId ?? null,
    p_event_type: input.eventType,
    p_points_delta: input.pointsDelta,
    p_reward_key: input.rewardKey ?? null,
    p_source_type: input.sourceType ?? 'MANUAL',
    p_source_ref: input.sourceRef,
    p_occurred_at: input.occurredAt,
    p_request_key: input.requestKey,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw new Error(`Customer loyalty event failed: ${error.message}`);
  const row = firstRow<{ resolved_event_id: string; balance_after: number; replayed: boolean }>(data);
  if (!row?.resolved_event_id) throw new Error('Customer loyalty event returned no event');
  return { eventId: row.resolved_event_id, balanceAfter: Number(row.balance_after ?? 0), replayed: row.replayed === true };
}

export async function recordCustomerReferral(input: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  referrerBusinessId: string;
  referrerPersonId?: string | null;
  referredLeadId?: string | null;
  referredBusinessId?: string | null;
  sourceRef: string;
  occurredAt: string;
  requestKey: string;
  evidence: Record<string, unknown>;
}) {
  const { data, error } = await input.supabase.rpc('record_customer_referral', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_referrer_business_id: input.referrerBusinessId,
    p_referrer_person_id: input.referrerPersonId ?? null,
    p_referred_lead_id: input.referredLeadId ?? null,
    p_referred_business_id: input.referredBusinessId ?? null,
    p_source_ref: input.sourceRef,
    p_occurred_at: input.occurredAt,
    p_request_key: input.requestKey,
    p_evidence: input.evidence,
  });
  if (error) throw new Error(`Customer referral failed: ${error.message}`);
  const row = firstRow<{ resolved_referral_id: string; replayed: boolean }>(data);
  if (!row?.resolved_referral_id) throw new Error('Customer referral returned no record');
  return { referralId: row.resolved_referral_id, replayed: row.replayed === true };
}

export async function transitionCustomerReferral(input: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  referralId: string;
  action: 'QUALIFY' | 'CONVERT' | 'REWARD' | 'CANCEL';
  evidence: Record<string, unknown>;
}) {
  const { data, error } = await input.supabase.rpc('transition_customer_referral', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_referral_id: input.referralId,
    p_action: input.action,
    p_evidence: input.evidence,
  });
  if (error) throw new Error(`Customer referral transition failed: ${error.message}`);
  const row = firstRow<{ resolved_referral_id: string; resolved_status: string; replayed: boolean }>(data);
  if (!row?.resolved_referral_id) throw new Error('Customer referral transition returned no record');
  return { referralId: row.resolved_referral_id, status: row.resolved_status, replayed: row.replayed === true };
}

export async function classifyCustomerSuccessCampaign(input: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  campaignId: string;
  lifecycle: 'ONBOARDING' | 'RETENTION' | 'REACTIVATION' | 'LOYALTY' | 'REFERRAL' | null;
}) {
  const { data, error } = await input.supabase.rpc('set_marketing_campaign_customer_success_lifecycle', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_campaign_id: input.campaignId,
    p_lifecycle: input.lifecycle,
  });
  if (error) throw new Error(`Customer Success Campaign classification failed: ${error.message}`);
  return firstRow<{ resolved_campaign_id: string; resolved_lifecycle: string | null; replayed: boolean }>(data);
}
