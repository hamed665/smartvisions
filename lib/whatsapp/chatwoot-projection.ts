import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { provisionChatwootAccount } from '@/lib/chatwoot/account-orchestration';
import { provisionChatwootApiInbox } from '@/lib/chatwoot/api-inbox-provisioning';
import { provisionCurrentOwnerChatwootAccess } from '@/lib/chatwoot/owner-access-orchestration';
import {
  ChatwootProvisioningError,
} from '@/lib/chatwoot/provisioning';
import {
  createChatwootAccountMapping,
  isUuid,
} from '@/lib/chatwoot/tenant-bridge';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { processPendingWhatsAppChatwootSync } from '@/lib/whatsapp/chatwoot-inbound-sync';

type WhatsAppBinding = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  branch_id: string | null;
  channel: string;
  status: string;
  provider: string | null;
  provider_account_id: string | null;
  provider_destination_id: string | null;
  provider_destination_label: string | null;
  last_verified_at: string | null;
  last_error_code: string | null;
};

type ChatwootAccountMapping = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  chatwoot_account_id: number | null;
  status: 'PROVISIONING' | 'ACTIVE' | 'DEGRADED' | 'ARCHIVED';
  version: number;
};

function fail(message: string): never {
  throw new ChatwootProvisioningError('RECONCILIATION_REQUIRED', message);
}

function boundedName(value: string) {
  const name = value.trim();
  const projected = `${name} · WhatsApp`;
  return projected.length <= 120 ? projected : `${projected.slice(0, 117)}...`;
}

function requestKey(bindingId: string, suffix: string) {
  const key = `whatsapp-chatwoot:${bindingId}:${suffix}:v1`;
  if (key.length > 200) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      'WhatsApp Chatwoot projection request key is too long',
    );
  }
  return key;
}

async function requireOwner(input: {
  supabase: SupabaseClient;
  organizationId: string;
}) {
  const { data: auth, error: authError } = await input.supabase.auth.getUser();
  if (authError || !auth.user?.id || !isUuid(auth.user.id)) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      'Authenticated Smart Visions OWNER is required',
    );
  }

  const { data: membership, error: membershipError } = await input.supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', input.organizationId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (membershipError || membership?.role !== 'OWNER') {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      'Organization OWNER authority is required',
    );
  }

  return auth.user.id;
}

function evidenceObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function requireMetaProvisioningEvidence(input: {
  service: SupabaseClient;
  binding: WhatsAppBinding;
}) {
  const { data, error } = await input.service
    .from('audit_logs')
    .select('id,after_data,created_at')
    .eq('organization_id', input.binding.organization_id)
    .eq('action', 'META_WHATSAPP_PROVIDER_PROVISIONED')
    .eq('entity_type', 'communication_channel_binding')
    .eq('entity_id', input.binding.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const evidence = evidenceObject(data?.after_data);
  if (
    error
    || !data
    || !evidence
    || evidence.waba_id !== input.binding.provider_account_id
    || evidence.phone_number_id !== input.binding.provider_destination_id
    || evidence.subscription_confirmed !== true
  ) {
    return fail('Verified Meta provider provisioning evidence is required before Chatwoot projection');
  }

  return data;
}

async function loadLiveAccountMapping(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
}) {
  const { data, error } = await input.supabase
    .from('chatwoot_account_mappings')
    .select('id,organization_id,tenant_business_id,chatwoot_account_id,status,version')
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.tenantBusinessId)
    .in('status', ['PROVISIONING', 'ACTIVE', 'DEGRADED'])
    .maybeSingle();

  if (error) return fail('Unable to read Chatwoot Account mapping state');
  return (data ?? null) as ChatwootAccountMapping | null;
}

export async function provisionWhatsAppChatwootProjection(input: {
  supabase: SupabaseClient;
  organizationId: string;
  bindingId: string;
  fetchImpl?: typeof fetch;
}) {
  if (!isUuid(input.organizationId) || !isUuid(input.bindingId)) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      'WhatsApp Chatwoot projection scope is invalid',
    );
  }

  const ownerUserId = await requireOwner({
    supabase: input.supabase,
    organizationId: input.organizationId,
  });

  const { data: bindingData, error: bindingError } = await input.supabase
    .from('communication_channel_bindings')
    .select(
      'id,organization_id,tenant_business_id,branch_id,channel,status,provider,provider_account_id,provider_destination_id,provider_destination_label,last_verified_at,last_error_code',
    )
    .eq('organization_id', input.organizationId)
    .eq('id', input.bindingId)
    .maybeSingle();

  const binding = bindingData as WhatsAppBinding | null;
  if (
    bindingError
    || !binding
    || binding.organization_id !== input.organizationId
    || binding.channel !== 'WHATSAPP'
    || binding.status !== 'ACTIVE'
    || binding.provider !== 'META'
    || !binding.provider_account_id
    || !binding.provider_destination_id
    || !binding.last_verified_at
    || binding.last_error_code
  ) {
    return fail('Canonical WhatsApp binding is not ready for Chatwoot projection');
  }

  const { data: business, error: businessError } = await input.supabase
    .from('tenant_businesses')
    .select('id,name,status')
    .eq('organization_id', input.organizationId)
    .eq('id', binding.tenant_business_id)
    .maybeSingle();

  if (
    businessError
    || !business
    || business.id !== binding.tenant_business_id
    || business.status !== 'ACTIVE'
    || typeof business.name !== 'string'
    || !business.name.trim()
  ) {
    return fail('Active tenant Business is required for Chatwoot projection');
  }

  const service = createSupabaseServiceClient();
  await requireMetaProvisioningEvidence({ service, binding });

  let accountMapping = await loadLiveAccountMapping({
    supabase: input.supabase,
    organizationId: input.organizationId,
    tenantBusinessId: binding.tenant_business_id,
  });

  if (!accountMapping) {
    accountMapping = await createChatwootAccountMapping({
      supabase: input.supabase,
      organizationId: input.organizationId,
      tenantBusinessId: binding.tenant_business_id,
      requestKey: requestKey(binding.id, 'account-mapping'),
    }) as ChatwootAccountMapping;
  }

  if (
    !isUuid(accountMapping.id)
    || accountMapping.organization_id !== input.organizationId
    || accountMapping.tenant_business_id !== binding.tenant_business_id
    || accountMapping.status === 'ARCHIVED'
  ) {
    return fail('Chatwoot Account mapping does not match the WhatsApp tenant scope');
  }

  accountMapping = await provisionChatwootAccount({
    supabase: input.supabase,
    organizationId: input.organizationId,
    mappingId: accountMapping.id,
    requestKey: requestKey(binding.id, 'account-provision'),
    fetchImpl: input.fetchImpl,
  }) as ChatwootAccountMapping;

  if (accountMapping.status !== 'ACTIVE' || !accountMapping.chatwoot_account_id) {
    return fail('Chatwoot Account projection is not ACTIVE');
  }

  await provisionCurrentOwnerChatwootAccess({
    supabase: input.supabase,
    organizationId: input.organizationId,
    tenantBusinessId: binding.tenant_business_id,
    fetchImpl: input.fetchImpl,
  });

  const inbox = await provisionChatwootApiInbox({
    supabase: input.supabase,
    organizationId: input.organizationId,
    tenantBusinessId: binding.tenant_business_id,
    branchId: binding.branch_id,
    communicationChannelBindingId: binding.id,
    chatwootAccountMappingId: accountMapping.id,
    projectedName: boundedName(business.name),
    requestKey: requestKey(binding.id, 'api-inbox'),
    fetchImpl: input.fetchImpl,
  });

  const mapping = inbox.mapping;
  if (
    mapping.status !== 'ACTIVE'
    || mapping.communication_channel_binding_id !== binding.id
    || mapping.chatwoot_account_mapping_id !== accountMapping.id
  ) {
    return fail('Chatwoot Inbox projection did not reconcile to the WhatsApp binding');
  }

  const { data: priorAudit } = await service
    .from('audit_logs')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('action', 'META_WHATSAPP_CHATWOOT_PROJECTED')
    .eq('entity_type', 'communication_channel_binding')
    .eq('entity_id', binding.id)
    .eq('after_data->>chatwoot_inbox_mapping_id', mapping.id)
    .limit(1)
    .maybeSingle();

  if (!priorAudit) {
    const { error: auditError } = await service.from('audit_logs').insert({
      organization_id: input.organizationId,
      actor_type: 'USER',
      actor_id: ownerUserId,
      action: 'META_WHATSAPP_CHATWOOT_PROJECTED',
      entity_type: 'communication_channel_binding',
      entity_id: binding.id,
      tenant_business_id: binding.tenant_business_id,
      branch_id: binding.branch_id,
      after_data: {
        binding_id: binding.id,
        chatwoot_account_mapping_id: accountMapping.id,
        chatwoot_inbox_mapping_id: mapping.id,
        chatwoot_inbox_id: mapping.chatwoot_inbox_id,
        outcome: inbox.outcome,
        projection: 'SMART_CORE_TO_CHATWOOT_CHANNEL_API',
      },
    });
    if (auditError) return fail('Chatwoot projection audit evidence could not be committed');
  }

  let pendingInboundSync: Awaited<ReturnType<typeof processPendingWhatsAppChatwootSync>> | null = null;
  try {
    pendingInboundSync = await processPendingWhatsAppChatwootSync({
      service,
      organizationId: input.organizationId,
      bindingId: binding.id,
      limit: 25,
      fetchImpl: input.fetchImpl,
    });
  } catch {
    // Inbox activation remains valid; durable PENDING journal rows are retried
    // by the existing operations reconciler without repeating Meta onboarding.
  }

  return {
    ok: true as const,
    bindingId: binding.id,
    tenantBusinessId: binding.tenant_business_id,
    branchId: binding.branch_id,
    accountMappingId: accountMapping.id,
    inboxMappingId: mapping.id,
    chatwootInboxId: mapping.chatwoot_inbox_id,
    outcome: inbox.outcome,
    pendingInboundSync,
  };
}
