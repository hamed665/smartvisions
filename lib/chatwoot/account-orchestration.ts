import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ChatwootProvisioningError,
  ensureChatwootAccount,
  reconcileChatwootAccount,
} from '@/lib/chatwoot/provisioning';
import {
  isUuid,
  normalizeRequestKey,
  setChatwootAccountMappingState,
  type ChatwootAccountMappingRow,
} from '@/lib/chatwoot/tenant-bridge';

type AccountAttemptClaim = {
  may_attempt_create: boolean;
  mapping_id: string;
  tenant_business_id: string;
  mapping_version: number;
};

function fail(message: string): never {
  throw new ChatwootProvisioningError('RECONCILIATION_REQUIRED', message);
}

async function loadMapping(input: {
  supabase: SupabaseClient;
  organizationId: string;
  mappingId: string;
}): Promise<ChatwootAccountMappingRow> {
  const { data, error } = await input.supabase
    .from('chatwoot_account_mappings')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('id', input.mappingId)
    .single();

  if (error || !data ||
      data.id !== input.mappingId ||
      data.organization_id !== input.organizationId ||
      !isUuid(data.tenant_business_id) ||
      !Number.isSafeInteger(data.version) || data.version < 1) {
    return fail('Chatwoot Account mapping is unavailable or invalid');
  }
  return data as ChatwootAccountMappingRow;
}

async function requireActiveOwnerAndBusiness(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
}): Promise<string> {
  const { data: auth, error: authError } = await input.supabase.auth.getUser();
  if (authError || !auth.user?.id) {
    return fail('Authenticated Smart owner is required');
  }

  const [member, business] = await Promise.all([
    input.supabase.from('organization_members')
      .select('role')
      .eq('organization_id', input.organizationId)
      .eq('user_id', auth.user.id)
      .single(),
    input.supabase.from('tenant_businesses')
      .select('id,organization_id,status,name')
      .eq('organization_id', input.organizationId)
      .eq('id', input.tenantBusinessId)
      .single(),
  ]);

  if (member.error || member.data?.role !== 'OWNER' ||
      business.error || !business.data ||
      business.data.id !== input.tenantBusinessId ||
      business.data.organization_id !== input.organizationId ||
      business.data.status !== 'ACTIVE' ||
      typeof business.data.name !== 'string' ||
      !business.data.name.trim()) {
    return fail('Smart owner or active tenant Business verification failed');
  }
  return business.data.name.trim();
}

/**
 * Candidate-only Account orchestration. Caller supplies an authenticated
 * Supabase client; no service-role mapping write is performed here.
 * No route invokes this module while the dependency stack is Draft.
 */
export async function provisionCandidateChatwootAccount(input: {
  supabase: SupabaseClient;
  organizationId: string;
  mappingId: string;
  requestKey: string;
  fetchImpl?: typeof fetch;
}): Promise<ChatwootAccountMappingRow> {
  if (process.env.CHATWOOT_PROVISIONING_ENABLED !== 'true') {
    return fail('Chatwoot provisioning is disabled');
  }

  const requestKey = normalizeRequestKey(input.requestKey);
  if (!isUuid(input.organizationId) || !isUuid(input.mappingId) ||
      !requestKey || requestKey.length > 190) {
    return fail('Chatwoot Account provisioning input is invalid');
  }

  let mapping = await loadMapping(input);
  let name = await requireActiveOwnerAndBusiness({
    supabase: input.supabase,
    organizationId: input.organizationId,
    tenantBusinessId: mapping.tenant_business_id,
  });

  if (mapping.status === 'ACTIVE') {
    if (mapping.chatwoot_account_id === null) {
      return fail('ACTIVE Chatwoot Account mapping lacks an external ID');
    }
    const account = await reconcileChatwootAccount({
      tenantBusinessId: mapping.tenant_business_id,
      fetchImpl: input.fetchImpl,
    });
    if (!account || account.id !== mapping.chatwoot_account_id) {
      return fail('ACTIVE Chatwoot Account mapping has external identity drift');
    }
    return mapping;
  }

  if ((mapping.status !== 'PROVISIONING' && mapping.status !== 'DEGRADED') ||
      mapping.chatwoot_account_id !== null) {
    return fail('Chatwoot Account mapping is not eligible for provisioning');
  }

  const { data, error } = await input.supabase.rpc(
    'claim_chatwoot_account_external_create',
    {
      p_organization_id: input.organizationId,
      p_mapping_id: input.mappingId,
      p_request_key: requestKey,
    },
  );

  const claim = (Array.isArray(data) ? data[0] : data) as
    | AccountAttemptClaim | null;
  if (error || !claim ||
      typeof claim.may_attempt_create !== 'boolean' ||
      claim.mapping_id !== mapping.id ||
      claim.tenant_business_id !== mapping.tenant_business_id ||
      claim.mapping_version !== mapping.version) {
    return fail('Chatwoot Account external claim is unavailable; reconcile');
  }

  // Recheck after the durable claim. A revoked owner or archived Business
  // must never start an external mutation.
  name = await requireActiveOwnerAndBusiness({
    supabase: input.supabase,
    organizationId: input.organizationId,
    tenantBusinessId: mapping.tenant_business_id,
  });
  mapping = await loadMapping(input);
  if (mapping.version !== claim.mapping_version ||
      (mapping.status !== 'PROVISIONING' && mapping.status !== 'DEGRADED') ||
      mapping.chatwoot_account_id !== null) {
    return fail('Chatwoot Account mapping changed after external claim');
  }

  const account = claim.may_attempt_create
    ? (await ensureChatwootAccount({
        tenantBusinessId: mapping.tenant_business_id,
        name,
        fetchImpl: input.fetchImpl,
      })).account
    : await reconcileChatwootAccount({
        tenantBusinessId: mapping.tenant_business_id,
        fetchImpl: input.fetchImpl,
      });

  if (!account) {
    return fail('Prior Chatwoot Account attempt has no exact external match');
  }

  const updated = await setChatwootAccountMappingState({
    supabase: input.supabase,
    organizationId: input.organizationId,
    mappingId: input.mappingId,
    expectedVersion: claim.mapping_version,
    status: 'ACTIVE',
    chatwootAccountId: account.id,
    requestKey: requestKey + ':active',
  });
  if (updated.id !== input.mappingId ||
      updated.organization_id !== input.organizationId ||
      updated.tenant_business_id !== mapping.tenant_business_id ||
      updated.chatwoot_account_id !== account.id ||
      updated.status !== 'ACTIVE') {
    return fail('Chatwoot Account mapping commit did not match external evidence');
  }
  return updated;
}
