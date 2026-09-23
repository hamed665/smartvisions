import type { SupabaseClient } from '@supabase/supabase-js';

export type CommunicationChannel = 'EMAIL' | 'WHATSAPP';
export type CommunicationBindingStatus = 'ACTIVE' | 'ARCHIVED';
export type ChatwootAccountMappingStatus =
  | 'PROVISIONING'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'ARCHIVED';

export type CommunicationChannelBindingRow = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  branch_id: string | null;
  integration_connection_id: string;
  channel: CommunicationChannel;
  status: CommunicationBindingStatus;
  version: number;
  last_request_key: string;
  last_verified_at: string | null;
  last_error_code: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type ChatwootAccountMappingRow = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  chatwoot_account_id: number | null;
  status: ChatwootAccountMappingStatus;
  version: number;
  last_request_key: string;
  last_verified_at: string | null;
  last_error_code: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export class ChatwootTenantBridgeError extends Error {
  code: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'FORBIDDEN' | 'CONFLICT' | 'INVALID';

  constructor(code: ChatwootTenantBridgeError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_CODE_RE = /^[A-Z0-9_:.-]{1,120}$/;
const MAX_CHATWOOT_ACCOUNT_ID = 2147483647;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function normalizeRequestKey(value: unknown) {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return key.length >= 1 && key.length <= 200 ? key : null;
}

export function normalizeChatwootErrorCode(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return ERROR_CODE_RE.test(normalized) ? normalized : null;
}

export function normalizeChatwootAccountId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;

  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^[1-9][0-9]*$/.test(value.trim())
      ? Number(value.trim())
      : Number.NaN;

  return Number.isSafeInteger(parsed)
    && parsed > 0
    && parsed <= MAX_CHATWOOT_ACCOUNT_ID
    ? parsed
    : null;
}

function mapMutationError(message: string) {
  if (/not found/i.test(message)) {
    return new ChatwootTenantBridgeError('NOT_FOUND', message);
  }
  if (/version conflict/i.test(message)) {
    return new ChatwootTenantBridgeError('VERSION_CONFLICT', message);
  }
  if (/not permitted|row-level security|permission denied/i.test(message)) {
    return new ChatwootTenantBridgeError('FORBIDDEN', message);
  }
  if (
    /already used|unique constraint|duplicate|one_active|one_live|requires active communication binding/i.test(
      message,
    )
  ) {
    return new ChatwootTenantBridgeError('CONFLICT', message);
  }
  return new ChatwootTenantBridgeError('INVALID', message);
}

function clampLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(Math.max(Math.trunc(value ?? 50), 1), 100);
}

export async function listChatwootTenantBridge(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId?: string | null;
  includeArchived?: boolean;
  limit?: number;
}) {
  const limit = clampLimit(input.limit);

  let bindingQuery = input.supabase
    .from('communication_channel_bindings')
    .select('*')
    .eq('organization_id', input.organizationId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  let accountQuery = input.supabase
    .from('chatwoot_account_mappings')
    .select('*')
    .eq('organization_id', input.organizationId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (input.tenantBusinessId) {
    bindingQuery = bindingQuery.eq('tenant_business_id', input.tenantBusinessId);
    accountQuery = accountQuery.eq('tenant_business_id', input.tenantBusinessId);
  }

  if (!input.includeArchived) {
    bindingQuery = bindingQuery.neq('status', 'ARCHIVED');
    accountQuery = accountQuery.neq('status', 'ARCHIVED');
  }

  const [bindings, accountMappings] = await Promise.all([bindingQuery, accountQuery]);

  if (bindings.error) {
    throw mapMutationError(bindings.error.message);
  }
  if (accountMappings.error) {
    throw mapMutationError(accountMappings.error.message);
  }

  return {
    bindings: (bindings.data ?? []) as CommunicationChannelBindingRow[],
    accountMappings: (accountMappings.data ?? []) as ChatwootAccountMappingRow[],
  };
}

export async function createCommunicationChannelBinding(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  branchId?: string | null;
  integrationConnectionId: string;
  channel: CommunicationChannel;
  requestKey: string;
}) {
  const { data, error } = await input.supabase.rpc('create_communication_channel_binding', {
    p_organization_id: input.organizationId,
    p_tenant_business_id: input.tenantBusinessId,
    p_branch_id: input.branchId ?? null,
    p_integration_connection_id: input.integrationConnectionId,
    p_channel: input.channel,
    p_request_key: input.requestKey,
  });

  if (error) throw mapMutationError(error.message);
  return data as CommunicationChannelBindingRow;
}

export async function setCommunicationChannelBindingLifecycle(input: {
  supabase: SupabaseClient;
  organizationId: string;
  bindingId: string;
  expectedVersion: number;
  status: CommunicationBindingStatus;
  requestKey: string;
}) {
  const { data, error } = await input.supabase.rpc(
    'set_communication_channel_binding_lifecycle',
    {
      p_organization_id: input.organizationId,
      p_binding_id: input.bindingId,
      p_expected_version: input.expectedVersion,
      p_status: input.status,
      p_request_key: input.requestKey,
    },
  );

  if (error) throw mapMutationError(error.message);
  return data as CommunicationChannelBindingRow;
}

export async function createChatwootAccountMapping(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  requestKey: string;
}) {
  const { data, error } = await input.supabase.rpc('create_chatwoot_account_mapping', {
    p_organization_id: input.organizationId,
    p_tenant_business_id: input.tenantBusinessId,
    p_request_key: input.requestKey,
  });

  if (error) throw mapMutationError(error.message);
  return data as ChatwootAccountMappingRow;
}

export async function setChatwootAccountMappingState(input: {
  supabase: SupabaseClient;
  organizationId: string;
  mappingId: string;
  expectedVersion: number;
  status: ChatwootAccountMappingStatus;
  chatwootAccountId?: number | null;
  lastErrorCode?: string | null;
  requestKey: string;
}) {
  const { data, error } = await input.supabase.rpc('set_chatwoot_account_mapping_state', {
    p_organization_id: input.organizationId,
    p_mapping_id: input.mappingId,
    p_expected_version: input.expectedVersion,
    p_status: input.status,
    p_chatwoot_account_id: input.chatwootAccountId ?? null,
    p_last_error_code: input.lastErrorCode ?? null,
    p_request_key: input.requestKey,
  });

  if (error) throw mapMutationError(error.message);
  return data as ChatwootAccountMappingRow;
}
