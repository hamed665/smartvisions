import type { SupabaseClient } from '@supabase/supabase-js';

export const CRM_LEAD_SCORING_MUTATION_ROLES = ['OWNER','ADMIN','SALES_MANAGER'] as const;
export const CRM_LEAD_SCORING_SOURCES = [
  'HUNTER_NO_WEBSITE_V1',
  'HUNTER_SERVICE_FIT_V1',
  'CRM_INTENT_V1',
  'CRM_DETERMINISTIC_V1',
  'CRM_ENGAGEMENT_V1',
] as const;

export type CrmLeadScoringSource = typeof CRM_LEAD_SCORING_SOURCES[number];

export type CrmLeadScoringRow = {
  lead_id: string;
  opportunity_score: number;
  effective_score: number;
  fit_score: number | null;
  intent_score: number;
  engagement_score: number | null;
  score_reasons: unknown[];
  scoring_source: CrmLeadScoringSource | null;
  scoring_policy_version: string | null;
  scoring_evidence: Record<string, unknown> | null;
  scoring_revision: number;
  scoring_updated_at: string | null;
  scoring_updated_by_user_id: string | null;
  manual_score_override: number | null;
  manual_score_override_reason: string | null;
  manual_score_override_by_user_id: string | null;
  manual_score_override_at: string | null;
  manual_score_override_expires_at: string | null;
  override_active: boolean;
  model_score_suggestion: Record<string, unknown> | null;
  model_score_suggested_at: string | null;
};

export type CrmLeadModelSuggestion = {
  opportunityScore?: number;
  fitScore?: number;
  intentScore?: number;
  engagementScore?: number;
  reasons?: string[];
  provider: string;
  model: string;
  modelVersion: string;
  sourceRunId?: string;
};

export function canMutateCrmLeadScoring(role: unknown) {
  return typeof role === 'string'
    && (CRM_LEAD_SCORING_MUTATION_ROLES as readonly string[]).includes(role);
}

export function effectiveOpportunityScore(input: {
  opportunityScore: number;
  manualOverride?: number | null;
  manualOverrideExpiresAt?: string | null;
  asOf?: Date;
}) {
  const asOf = input.asOf ?? new Date();
  const active = input.manualOverride != null
    && (
      !input.manualOverrideExpiresAt
      || new Date(input.manualOverrideExpiresAt).getTime() > asOf.getTime()
    );
  return active ? Number(input.manualOverride) : Number(input.opportunityScore);
}

async function rpcOne(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(name + ' failed: ' + error.message);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(name + ' returned no result');
  }
  return data as Record<string, unknown>;
}

export async function getCrmLeadScoring(input: {
  supabase: SupabaseClient;
  organizationId: string;
  leadId: string;
}) {
  const { data, error } = await input.supabase.rpc('get_crm_lead_scoring', {
    p_organization_id: input.organizationId,
    p_lead_id: input.leadId,
  });
  if (error) throw new Error('CRM Lead scoring read failed: ' + error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as CrmLeadScoringRow | null;
}

export async function recomputeCrmLeadEngagement(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  leadId: string;
  expectedRevision: number;
  requestKey: string;
}) {
  return rpcOne(input.service, 'recompute_crm_lead_engagement', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_lead_id: input.leadId,
    p_expected_revision: input.expectedRevision,
    p_request_key: input.requestKey,
  });
}

export async function setCrmLeadScoreOverride(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  leadId: string;
  overrideScore: number;
  reason: string;
  expiresAt: string | null;
  expectedRevision: number;
  requestKey: string;
}) {
  return rpcOne(input.service, 'set_crm_lead_score_override', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_lead_id: input.leadId,
    p_override_score: input.overrideScore,
    p_reason: input.reason,
    p_expires_at: input.expiresAt,
    p_expected_revision: input.expectedRevision,
    p_request_key: input.requestKey,
  });
}

export async function clearCrmLeadScoreOverride(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  leadId: string;
  reason: string;
  expectedRevision: number;
  requestKey: string;
}) {
  return rpcOne(input.service, 'clear_crm_lead_score_override', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_lead_id: input.leadId,
    p_reason: input.reason,
    p_expected_revision: input.expectedRevision,
    p_request_key: input.requestKey,
  });
}

export async function recordCrmLeadModelSuggestion(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  leadId: string;
  suggestion: CrmLeadModelSuggestion;
  expectedRevision: number;
  requestKey: string;
}) {
  return rpcOne(input.service, 'record_crm_lead_model_score_suggestion', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_lead_id: input.leadId,
    p_suggestion: input.suggestion,
    p_expected_revision: input.expectedRevision,
    p_request_key: input.requestKey,
  });
}

export async function recordCrmLeadDeterministicScore(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  leadId: string;
  opportunityScore: number;
  fitScore: number | null;
  intentScore: number;
  engagementScore: number | null;
  scoreReasons: string[];
  source: CrmLeadScoringSource;
  policyVersion: string;
  evidence: Record<string, unknown>;
  expectedRevision: number;
  requestKey: string;
}) {
  return rpcOne(input.service, 'record_crm_lead_deterministic_score', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_lead_id: input.leadId,
    p_opportunity_score: input.opportunityScore,
    p_fit_score: input.fitScore,
    p_intent_score: input.intentScore,
    p_engagement_score: input.engagementScore,
    p_score_reasons: input.scoreReasons,
    p_scoring_source: input.source,
    p_policy_version: input.policyVersion,
    p_evidence: input.evidence,
    p_expected_revision: input.expectedRevision,
    p_request_key: input.requestKey,
  });
}
