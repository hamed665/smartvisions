import type { SupabaseClient } from '@supabase/supabase-js';

export type SmartChatwootRole =
  | 'OWNER'
  | 'ADMIN'
  | 'SALES_MANAGER'
  | 'SALES_AGENT'
  | 'VIEWER';

export type ChatwootAccountRole = 'administrator' | 'agent';

export type ChatwootProjectionStatus =
  | 'PROVISIONING'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'ARCHIVED';

export type ChatwootAccountMembershipSummary = {
  id: string;
  tenant_business_id: string;
  smart_user_id: string;
  chatwoot_user_mapping_id: string;
  chatwoot_account_mapping_id: string;
  chatwoot_account_user_id: string | null;
  effective_smart_role: Exclude<SmartChatwootRole, 'VIEWER'>;
  chatwoot_role: ChatwootAccountRole;
  status: ChatwootProjectionStatus;
  version: number;
  last_verified_at: string | null;
  last_error_code: string | null;
  updated_at: string;
};

export type ChatwootInboxMappingSummary = {
  id: string;
  tenant_business_id: string;
  branch_id: string | null;
  communication_channel_binding_id: string;
  chatwoot_account_mapping_id: string;
  chatwoot_inbox_id: number | null;
  chatwoot_channel_identifier: string | null;
  channel_type: 'Channel::Api';
  status: ChatwootProjectionStatus;
  version: number;
  last_verified_at: string | null;
  last_error_code: string | null;
  updated_at: string;
};

export type ChatwootTeamMappingSummary = {
  id: string;
  tenant_business_id: string;
  smart_team_id: string;
  chatwoot_account_mapping_id: string;
  chatwoot_team_id: string | null;
  projected_name: string;
  status: ChatwootProjectionStatus;
  version: number;
  last_verified_at: string | null;
  last_error_code: string | null;
  updated_at: string;
};

const INT32_MAX = 2_147_483_647;
const INT64_MAX = 9_223_372_036_854_775_807n;

export function chatwootRoleForSmartRole(
  role: SmartChatwootRole,
): ChatwootAccountRole | null {
  if (role === 'OWNER') return 'administrator';
  if (role === 'ADMIN' || role === 'SALES_MANAGER' || role === 'SALES_AGENT') {
    return 'agent';
  }
  return null;
}

export function projectedChatwootUserName(input: {
  email: string;
  trustedDisplayName?: string | null;
}) {
  const email = input.email.trim();
  const displayName = input.trustedDisplayName?.trim();

  if (!email) throw new Error('Canonical Smart user email is required');
  return displayName || email;
}

export function normalizeChatwootInt32Id(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^[1-9][0-9]*$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;

  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= INT32_MAX
    ? parsed
    : null;
}

export function normalizeChatwootInt64Id(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  const normalized =
    typeof value === 'bigint'
      ? value.toString()
      : typeof value === 'number' && Number.isSafeInteger(value)
        ? String(value)
        : typeof value === 'string'
          ? value.trim()
          : '';

  if (!/^[1-9][0-9]*$/.test(normalized)) return null;

  try {
    const parsed = BigInt(normalized);
    return parsed > 0n && parsed <= INT64_MAX ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function boundedLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(Math.max(Math.trunc(value ?? 50), 1), 100);
}

export async function listChatwootSliceBResources(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId?: string | null;
  includeArchived?: boolean;
  limit?: number;
}) {
  const limit = boundedLimit(input.limit);

  let membershipQuery = input.service
    .from('chatwoot_account_memberships')
    .select(
      'id,tenant_business_id,smart_user_id,chatwoot_user_mapping_id,chatwoot_account_mapping_id,chatwoot_account_user_id,effective_smart_role,chatwoot_role,status,version,last_verified_at,last_error_code,updated_at',
    )
    .eq('organization_id', input.organizationId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  let inboxQuery = input.service
    .from('chatwoot_inbox_mappings')
    .select(
      'id,tenant_business_id,branch_id,communication_channel_binding_id,chatwoot_account_mapping_id,chatwoot_inbox_id,chatwoot_channel_identifier,channel_type,status,version,last_verified_at,last_error_code,updated_at',
    )
    .eq('organization_id', input.organizationId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  let teamQuery = input.service
    .from('chatwoot_team_mappings')
    .select(
      'id,tenant_business_id,smart_team_id,chatwoot_account_mapping_id,chatwoot_team_id,projected_name,status,version,last_verified_at,last_error_code,updated_at',
    )
    .eq('organization_id', input.organizationId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (input.tenantBusinessId) {
    membershipQuery = membershipQuery.eq('tenant_business_id', input.tenantBusinessId);
    inboxQuery = inboxQuery.eq('tenant_business_id', input.tenantBusinessId);
    teamQuery = teamQuery.eq('tenant_business_id', input.tenantBusinessId);
  }

  if (!input.includeArchived) {
    membershipQuery = membershipQuery.neq('status', 'ARCHIVED');
    inboxQuery = inboxQuery.neq('status', 'ARCHIVED');
    teamQuery = teamQuery.neq('status', 'ARCHIVED');
  }

  const [memberships, inboxes, teams] = await Promise.all([
    membershipQuery,
    inboxQuery,
    teamQuery,
  ]);

  if (memberships.error) throw new Error(memberships.error.message);
  if (inboxes.error) throw new Error(inboxes.error.message);
  if (teams.error) throw new Error(teams.error.message);

  return {
    memberships: (memberships.data ?? []).map((row) => ({
      ...row,
      chatwoot_account_user_id:
        row.chatwoot_account_user_id === null
          ? null
          : String(row.chatwoot_account_user_id),
    })) as ChatwootAccountMembershipSummary[],
    inboxes: (inboxes.data ?? []) as ChatwootInboxMappingSummary[],
    teams: (teams.data ?? []).map((row) => ({
      ...row,
      chatwoot_team_id:
        row.chatwoot_team_id === null ? null : String(row.chatwoot_team_id),
    })) as ChatwootTeamMappingSummary[],
  };
}
