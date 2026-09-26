import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createChatwootAccountMapping,
  createCommunicationChannelBinding,
  isUuid,
  type ChatwootAccountMappingRow,
  type CommunicationChannel,
  type CommunicationChannelBindingRow,
} from '@/lib/chatwoot/tenant-bridge';

export type ChatwootTenantProjectionPreparationErrorCode =
  | 'INVALID'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DATABASE';

export class ChatwootTenantProjectionPreparationError extends Error {
  code: ChatwootTenantProjectionPreparationErrorCode;

  constructor(
    code: ChatwootTenantProjectionPreparationErrorCode,
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

type EligibleIntegration = {
  id: string;
  channel: CommunicationChannel;
  enabled: boolean;
  status: string;
};

type TenantBusiness = {
  id: string;
  organization_id: string;
  name: string;
  status: string;
};

function requestKey(parts: string[]) {
  const key = ['comm-tenant-bridge', ...parts, 'v1'].join(':');
  if (key.length > 200) {
    throw new ChatwootTenantProjectionPreparationError(
      'INVALID',
      'Projection request key exceeds the durable command limit',
    );
  }
  return key;
}

function isEligibleChannel(value: unknown): value is CommunicationChannel {
  return value === 'EMAIL' || value === 'WHATSAPP';
}

async function loadTenantBusiness(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
}) {
  const { data, error } = await input.supabase
    .from('tenant_businesses')
    .select('id,organization_id,name,status')
    .eq('organization_id', input.organizationId)
    .eq('id', input.tenantBusinessId)
    .maybeSingle();

  if (error) {
    throw new ChatwootTenantProjectionPreparationError(
      'DATABASE',
      'Unable to read canonical tenant Business',
    );
  }

  if (
    !data ||
    data.id !== input.tenantBusinessId ||
    data.organization_id !== input.organizationId ||
    data.status !== 'ACTIVE'
  ) {
    throw new ChatwootTenantProjectionPreparationError(
      'NOT_FOUND',
      'An ACTIVE canonical tenant Business is required',
    );
  }

  return data as TenantBusiness;
}

async function loadEligibleIntegrations(input: {
  supabase: SupabaseClient;
  organizationId: string;
}) {
  const { data, error } = await input.supabase
    .from('integration_connections')
    .select('id,channel,enabled,status')
    .eq('organization_id', input.organizationId)
    .in('channel', ['EMAIL', 'WHATSAPP'])
    .eq('enabled', true)
    .eq('status', 'CONNECTED');

  if (error) {
    throw new ChatwootTenantProjectionPreparationError(
      'DATABASE',
      'Unable to read connected communication integrations',
    );
  }

  const integrations = (data ?? []).filter(
    (row): row is EligibleIntegration =>
      typeof row.id === 'string' &&
      isUuid(row.id) &&
      isEligibleChannel(row.channel) &&
      row.enabled === true &&
      row.status === 'CONNECTED',
  );

  if (integrations.length === 0) {
    throw new ChatwootTenantProjectionPreparationError(
      'NOT_FOUND',
      'At least one connected Email or WhatsApp integration is required',
    );
  }

  return integrations.sort((left, right) =>
    left.channel.localeCompare(right.channel),
  );
}

async function loadActiveBindings(input: {
  supabase: SupabaseClient;
  organizationId: string;
  integrationIds: string[];
}) {
  const { data, error } = await input.supabase
    .from('communication_channel_bindings')
    .select(
      'id,organization_id,tenant_business_id,branch_id,integration_connection_id,channel,status,version,last_request_key,last_verified_at,last_error_code,created_by_user_id,updated_by_user_id,created_at,updated_at',
    )
    .eq('organization_id', input.organizationId)
    .in('integration_connection_id', input.integrationIds)
    .eq('status', 'ACTIVE');

  if (error) {
    throw new ChatwootTenantProjectionPreparationError(
      'DATABASE',
      'Unable to read communication binding state',
    );
  }

  return (data ?? []) as CommunicationChannelBindingRow[];
}

async function loadLiveAccountMapping(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
}) {
  const { data, error } = await input.supabase
    .from('chatwoot_account_mappings')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.tenantBusinessId)
    .in('status', ['PROVISIONING', 'ACTIVE', 'DEGRADED'])
    .maybeSingle();

  if (error) {
    throw new ChatwootTenantProjectionPreparationError(
      'DATABASE',
      'Unable to read Chatwoot Account mapping state',
    );
  }

  return (data ?? null) as ChatwootAccountMappingRow | null;
}

export async function prepareChatwootTenantProjection(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
}) {
  if (
    !isUuid(input.organizationId) ||
    !isUuid(input.tenantBusinessId)
  ) {
    throw new ChatwootTenantProjectionPreparationError(
      'INVALID',
      'Organization and tenant Business identifiers must be UUIDs',
    );
  }

  const business = await loadTenantBusiness(input);
  const integrations = await loadEligibleIntegrations({
    supabase: input.supabase,
    organizationId: input.organizationId,
  });

  const existingBindings = await loadActiveBindings({
    supabase: input.supabase,
    organizationId: input.organizationId,
    integrationIds: integrations.map((integration) => integration.id),
  });

  const bindings: CommunicationChannelBindingRow[] = [];
  let createdBindingCount = 0;

  for (const integration of integrations) {
    const existing = existingBindings.find(
      (binding) =>
        binding.integration_connection_id === integration.id,
    );

    if (existing) {
      if (
        existing.tenant_business_id !== input.tenantBusinessId ||
        existing.channel !== integration.channel
      ) {
        throw new ChatwootTenantProjectionPreparationError(
          'CONFLICT',
          'A connected communication integration is already bound to a different tenant scope',
        );
      }

      bindings.push(existing);
      continue;
    }

    const binding = await createCommunicationChannelBinding({
      supabase: input.supabase,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      branchId: null,
      integrationConnectionId: integration.id,
      channel: integration.channel,
      requestKey: requestKey([
        input.tenantBusinessId,
        integration.channel.toLowerCase(),
        integration.id,
      ]),
    });

    bindings.push(binding);
    createdBindingCount += 1;
  }

  let accountMapping = await loadLiveAccountMapping(input);
  let createdAccountMapping = false;

  if (!accountMapping) {
    accountMapping = await createChatwootAccountMapping({
      supabase: input.supabase,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      requestKey: requestKey([
        input.tenantBusinessId,
        'account-mapping',
      ]),
    });
    createdAccountMapping = true;
  }

  if (
    accountMapping.tenant_business_id !== input.tenantBusinessId ||
    accountMapping.organization_id !== input.organizationId
  ) {
    throw new ChatwootTenantProjectionPreparationError(
      'CONFLICT',
      'Chatwoot Account mapping scope does not match the canonical tenant',
    );
  }

  return {
    business,
    bindings,
    accountMapping,
    createdBindingCount,
    createdAccountMapping,
  };
}
