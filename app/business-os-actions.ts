'use server';

import { revalidatePath } from 'next/cache';
import {
  createBrandBootstrap,
  createBusinessBootstrap,
  parseBrandBootstrapPayload,
  parseBusinessBootstrapPayload,
} from '@/lib/business-os/control-plane-bootstrap';
import { prepareChatwootTenantProjection } from '@/lib/chatwoot/prepare-tenant-projection';
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
