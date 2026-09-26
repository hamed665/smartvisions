'use server';

import { revalidatePath } from 'next/cache';
import {
  createBrandBootstrap,
  createBusinessBootstrap,
  parseBrandBootstrapPayload,
  parseBusinessBootstrapPayload,
} from '@/lib/business-os/control-plane-bootstrap';
import { bootstrapOperatingHierarchy } from '@/lib/business-os/control-plane-hierarchy';
import { provisionChatwootAccount } from '@/lib/chatwoot/account-orchestration';
import { provisionChatwootApiInbox } from '@/lib/chatwoot/api-inbox-provisioning';
import { prepareChatwootTenantProjection } from '@/lib/chatwoot/prepare-tenant-projection';
import { loadChatwootReadiness } from '@/lib/chatwoot/readiness';
import { provisionCurrentOwnerChatwootAccess } from '@/lib/chatwoot/owner-access-orchestration';
import { provisionChatwootTeam } from '@/lib/chatwoot/team-provisioning';
import { getCurrentOrganization } from '@/lib/supabase/org';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

export async function bootstrapCanonicalTenant(formData: FormData) {
  const ctx = await getCurrentOrganization(true);

  const brandPayload = parseBrandBootstrapPayload({
    organizationId: ctx.organizationId,
    name: value(formData, 'brand_name'),
    slug: value(formData, 'brand_slug'),
    metadata: {},
  });

  const brand = await createBrandBootstrap({
    supabase: ctx.supabase,
    userId: ctx.userId,
    payload: brandPayload,
  });

  const businessPayload = parseBusinessBootstrapPayload({
    organizationId: ctx.organizationId,
    brandId: brand.row.id,
    name: value(formData, 'business_name'),
    slug: value(formData, 'business_slug'),
    legalName: value(formData, 'legal_name') || null,
    countryCode: value(formData, 'country_code'),
    timezone: value(formData, 'timezone'),
    metadata: {},
  });

  const business = await createBusinessBootstrap({
    supabase: ctx.supabase,
    userId: ctx.userId,
    payload: businessPayload,
  });

  revalidatePath('/settings');
  revalidatePath('/system');
}


export async function prepareCommunicationPlaneProjection(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const tenantBusinessId = value(formData, 'tenant_business_id');

  await prepareChatwootTenantProjection({
    supabase: ctx.supabase,
    organizationId: ctx.organizationId,
    tenantBusinessId,
  });

  revalidatePath('/settings');
  revalidatePath('/system');
}


export async function provisionCommunicationPlaneAccount(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const mappingId = value(formData, 'chatwoot_account_mapping_id');
  const readiness = await loadChatwootReadiness({
    supabase: ctx.supabase,
    organizationId: ctx.organizationId,
  });

  if (!readiness.liveProvisioningReady) {
    throw new Error('Communication Plane external provisioning is not ready');
  }

  await provisionChatwootAccount({
    supabase: ctx.supabase,
    organizationId: ctx.organizationId,
    mappingId,
    requestKey: `comm-tenant-bridge:${mappingId}:external-account:v1`,
  });

  revalidatePath('/settings');
  revalidatePath('/system');
}


export async function provisionCommunicationPlaneOwnerAccess(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const tenantBusinessId = value(formData, 'tenant_business_id');
  const readiness = await loadChatwootReadiness({
    supabase: ctx.supabase,
    organizationId: ctx.organizationId,
  });

  if (!readiness.liveProvisioningReady) {
    throw new Error('Communication Plane external provisioning is not ready');
  }

  await provisionCurrentOwnerChatwootAccess({
    supabase: ctx.supabase,
    organizationId: ctx.organizationId,
    tenantBusinessId,
  });

  revalidatePath('/settings');
  revalidatePath('/system');
}


export async function bootstrapCanonicalOperatingHierarchy(formData: FormData) {
  const ctx = await getCurrentOrganization(true);

  await bootstrapOperatingHierarchy({
    supabase: ctx.supabase,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    tenantBusinessId: value(formData, 'tenant_business_id'),
    branchName: value(formData, 'branch_name'),
    branchCode: value(formData, 'branch_code'),
    branchCountryCode: value(formData, 'branch_country_code') || null,
    branchTimezone: value(formData, 'branch_timezone') || null,
    departmentName: value(formData, 'department_name'),
    departmentCode: value(formData, 'department_code'),
    teamName: value(formData, 'team_name'),
    teamCode: value(formData, 'team_code'),
  });

  revalidatePath('/settings');
  revalidatePath('/system');
}

export async function provisionCommunicationPlaneApiInbox(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const tenantBusinessId = value(formData, 'tenant_business_id');
  const branchId = value(formData, 'branch_id');
  const bindingId = value(formData, 'communication_channel_binding_id');
  const accountMappingId = value(formData, 'chatwoot_account_mapping_id');

  const readiness = await loadChatwootReadiness({
    supabase: ctx.supabase,
    organizationId: ctx.organizationId,
  });

  if (!readiness.liveProvisioningReady) {
    throw new Error('Communication Plane external provisioning is not ready');
  }

  const [businessResult, branchResult, bindingResult, accountResult] =
    await Promise.all([
      ctx.supabase
        .from('tenant_businesses')
        .select('id,name,status')
        .eq('organization_id', ctx.organizationId)
        .eq('id', tenantBusinessId)
        .single(),
      ctx.supabase
        .from('branches')
        .select('id,tenant_business_id,name,status')
        .eq('organization_id', ctx.organizationId)
        .eq('id', branchId)
        .single(),
      ctx.supabase
        .from('communication_channel_bindings')
        .select('id,tenant_business_id,branch_id,channel,status')
        .eq('organization_id', ctx.organizationId)
        .eq('id', bindingId)
        .single(),
      ctx.supabase
        .from('chatwoot_account_mappings')
        .select('id,tenant_business_id,status')
        .eq('organization_id', ctx.organizationId)
        .eq('id', accountMappingId)
        .single(),
    ]);

  const business = businessResult.data;
  const branch = branchResult.data;
  const binding = bindingResult.data;
  const account = accountResult.data;

  if (
    businessResult.error ||
    branchResult.error ||
    bindingResult.error ||
    accountResult.error ||
    !business ||
    !branch ||
    !binding ||
    !account ||
    business.status !== 'ACTIVE' ||
    branch.status !== 'ACTIVE' ||
    binding.status !== 'ACTIVE' ||
    account.status !== 'ACTIVE' ||
    branch.tenant_business_id !== tenantBusinessId ||
    binding.tenant_business_id !== tenantBusinessId ||
    account.tenant_business_id !== tenantBusinessId ||
    (binding.branch_id !== null && binding.branch_id !== branchId)
  ) {
    throw new Error('Canonical Inbox projection scope is not ready');
  }

  const projectedName =
    (business.name + ' ' + binding.channel + ' ' + branch.name)
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 120);

  await provisionChatwootApiInbox({
    supabase: ctx.supabase,
    organizationId: ctx.organizationId,
    tenantBusinessId,
    branchId,
    communicationChannelBindingId: bindingId,
    chatwootAccountMappingId: accountMappingId,
    projectedName,
    requestKey:
      'comm-tenant-bridge:' +
      tenantBusinessId +
      ':' +
      branchId +
      ':' +
      bindingId +
      ':api-inbox:v1',
  });

  revalidatePath('/settings');
  revalidatePath('/system');
}

export async function provisionCommunicationPlaneTeam(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const tenantBusinessId = value(formData, 'tenant_business_id');
  const smartTeamId = value(formData, 'smart_team_id');
  const accountMappingId = value(formData, 'chatwoot_account_mapping_id');

  const readiness = await loadChatwootReadiness({
    supabase: ctx.supabase,
    organizationId: ctx.organizationId,
  });

  if (!readiness.liveProvisioningReady) {
    throw new Error('Communication Plane external provisioning is not ready');
  }

  await provisionChatwootTeam({
    supabase: ctx.supabase,
    organizationId: ctx.organizationId,
    tenantBusinessId,
    smartTeamId,
    chatwootAccountMappingId: accountMappingId,
    requestKey:
      'comm-tenant-bridge:' +
      tenantBusinessId +
      ':' +
      smartTeamId +
      ':chatwoot-team:v1',
  });

  revalidatePath('/settings');
  revalidatePath('/system');
}
