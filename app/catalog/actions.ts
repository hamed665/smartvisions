'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

function requiredText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function optionalText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return value || null;
}

function optionalInteger(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${key} must be a positive integer`);
  return value;
}

function numberValue(formData: FormData, key: string, fallback?: number | null) {
  const raw = String(formData.get(key) ?? '').trim();
  if (!raw) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${key} is required`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${key} must be numeric`);
  return value;
}

function branchIds(formData: FormData) {
  return formData.getAll('branch_id').map((value) => String(value).trim()).filter(Boolean);
}

function requestKey(formData: FormData, prefix: string, entityId: string) {
  return optionalText(formData, 'request_key') ?? `${prefix}:${entityId}:${crypto.randomUUID()}`;
}

function parseObject(raw: string) {
  const value = raw.trim() ? JSON.parse(raw) as unknown : {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('attributes_json must be a JSON object');
  }
  return value as Record<string, unknown>;
}

type Subject = {
  serviceId: string | null;
  productId: string | null;
  variantId: string | null;
};

function parseSubject(value: string): Subject {
  const split = value.indexOf(':');
  if (split <= 0) throw new Error('Catalog subject is invalid');
  const kind = value.slice(0, split);
  const id = value.slice(split + 1).trim();
  if (!id) throw new Error('Catalog subject ID is missing');
  if (kind === 'SERVICE') return { serviceId: id, productId: null, variantId: null };
  if (kind === 'PRODUCT') return { serviceId: null, productId: id, variantId: null };
  if (kind === 'VARIANT') return { serviceId: null, productId: null, variantId: id };
  throw new Error('Catalog subject kind is invalid');
}

function refreshCatalog() {
  revalidatePath('/catalog');
  revalidatePath('/services');
  revalidatePath('/pricing');
}

export async function configureServiceCatalogV2(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const service = createSupabaseServiceClient();
  const serviceId = requiredText(formData, 'service_id');
  const { error } = await service.rpc('upsert_catalog_service_profile_v2', {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_service_id: serviceId,
    p_description: optionalText(formData, 'description'),
    p_warranty_text: optionalText(formData, 'warranty_text'),
    p_availability_mode: requiredText(formData, 'availability_mode').toUpperCase(),
    p_expected_version: optionalInteger(formData, 'expected_version'),
    p_branch_ids: branchIds(formData),
    p_request_key: requestKey(formData, 'catalog-v2-service', serviceId),
  });
  if (error) throw new Error(error.message);
  refreshCatalog();
}

export async function saveCatalogProductV2(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const service = createSupabaseServiceClient();
  const productId = optionalText(formData, 'product_id') ?? crypto.randomUUID();
  const { error } = await service.rpc('upsert_catalog_product_v2', {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_product_id: productId,
    p_tenant_business_id: requiredText(formData, 'tenant_business_id'),
    p_sku: requiredText(formData, 'sku').toUpperCase(),
    p_name: requiredText(formData, 'name'),
    p_description: optionalText(formData, 'description'),
    p_status: requiredText(formData, 'status').toUpperCase(),
    p_warranty_text: optionalText(formData, 'warranty_text'),
    p_availability_mode: requiredText(formData, 'availability_mode').toUpperCase(),
    p_inventory_mode: requiredText(formData, 'inventory_mode').toUpperCase(),
    p_inventory_reference: optionalText(formData, 'inventory_reference'),
    p_expected_version: optionalInteger(formData, 'expected_version'),
    p_branch_ids: branchIds(formData),
    p_request_key: requestKey(formData, 'catalog-v2-product', productId),
  });
  if (error) throw new Error(error.message);
  refreshCatalog();
}

export async function saveCatalogVariantV2(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const service = createSupabaseServiceClient();
  const variantId = optionalText(formData, 'variant_id') ?? crypto.randomUUID();
  const attributes = parseObject(String(formData.get('attributes_json') ?? '{}'));
  const { error } = await service.rpc('upsert_catalog_product_variant_v2', {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_variant_id: variantId,
    p_product_id: requiredText(formData, 'product_id'),
    p_sku: requiredText(formData, 'sku').toUpperCase(),
    p_name: requiredText(formData, 'name'),
    p_attributes: attributes,
    p_status: requiredText(formData, 'status').toUpperCase(),
    p_inventory_mode: requiredText(formData, 'inventory_mode').toUpperCase(),
    p_inventory_reference: optionalText(formData, 'inventory_reference'),
    p_expected_version: optionalInteger(formData, 'expected_version'),
    p_request_key: requestKey(formData, 'catalog-v2-variant', variantId),
  });
  if (error) throw new Error(error.message);
  refreshCatalog();
}

export async function saveCatalogProductPriceV2(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const service = createSupabaseServiceClient();
  const priceId = optionalText(formData, 'price_id') ?? crypto.randomUUID();
  const { error } = await service.rpc('upsert_catalog_product_price_v2', {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_price_id: priceId,
    p_product_id: requiredText(formData, 'product_id'),
    p_variant_id: optionalText(formData, 'variant_id'),
    p_country_code: requiredText(formData, 'country_code').toUpperCase(),
    p_currency: requiredText(formData, 'currency').toUpperCase(),
    p_price: numberValue(formData, 'price'),
    p_minimum_price: numberValue(formData, 'minimum_price', null),
    p_compare_at_price: numberValue(formData, 'compare_at_price', null),
    p_expected_version: optionalInteger(formData, 'expected_version'),
    p_request_key: requestKey(formData, 'catalog-v2-price', priceId),
  });
  if (error) throw new Error(error.message);
  refreshCatalog();
}

export async function saveCatalogMediaV2(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const service = createSupabaseServiceClient();
  const mediaId = optionalText(formData, 'media_id') ?? crypto.randomUUID();
  const subject = parseSubject(requiredText(formData, 'subject_ref'));
  const { error } = await service.rpc('upsert_catalog_media_asset_v2', {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_media_id: mediaId,
    p_service_id: subject.serviceId,
    p_product_id: subject.productId,
    p_variant_id: subject.variantId,
    p_media_type: requiredText(formData, 'media_type').toUpperCase(),
    p_source_type: requiredText(formData, 'source_type').toUpperCase(),
    p_public_url: optionalText(formData, 'public_url'),
    p_portfolio_item_id: optionalText(formData, 'portfolio_item_id'),
    p_alt_text: optionalText(formData, 'alt_text'),
    p_sort_order: Math.trunc(numberValue(formData, 'sort_order', 0) ?? 0),
    p_approved: formData.get('approved') === 'on',
    p_expected_version: optionalInteger(formData, 'expected_version'),
    p_request_key: requestKey(formData, 'catalog-v2-media', mediaId),
  });
  if (error) throw new Error(error.message);
  refreshCatalog();
}

export async function saveCatalogRelationV2(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const service = createSupabaseServiceClient();
  const relationId = optionalText(formData, 'relation_id') ?? crypto.randomUUID();
  const source = parseSubject(requiredText(formData, 'source_ref'));
  const target = parseSubject(requiredText(formData, 'target_ref'));
  const { error } = await service.rpc('upsert_catalog_item_relation_v2', {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_relation_id: relationId,
    p_source_service_id: source.serviceId,
    p_source_product_id: source.productId,
    p_source_variant_id: source.variantId,
    p_target_service_id: target.serviceId,
    p_target_product_id: target.productId,
    p_target_variant_id: target.variantId,
    p_relation_type: requiredText(formData, 'relation_type').toUpperCase(),
    p_quantity: numberValue(formData, 'quantity', 1),
    p_required: formData.get('required') === 'on',
    p_sort_order: Math.trunc(numberValue(formData, 'sort_order', 0) ?? 0),
    p_expected_version: optionalInteger(formData, 'expected_version'),
    p_request_key: requestKey(formData, 'catalog-v2-relation', relationId),
  });
  if (error) throw new Error(error.message);
  refreshCatalog();
}
