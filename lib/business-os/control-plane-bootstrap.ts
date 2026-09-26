import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;
const MAX_NAME_LENGTH = 160;
const MAX_LEGAL_NAME_LENGTH = 240;
const MAX_METADATA_BYTES = 8192;

export type ControlPlaneBootstrapErrorCode =
  | 'INVALID'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DATABASE';

export class ControlPlaneBootstrapError extends Error {
  code: ControlPlaneBootstrapErrorCode;

  constructor(code: ControlPlaneBootstrapErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type BrandBootstrapPayload = {
  organizationId: string;
  name: string;
  slug: string;
  metadata: Record<string, unknown>;
};

export type BusinessBootstrapPayload = {
  organizationId: string;
  brandId: string;
  name: string;
  slug: string;
  legalName: string | null;
  countryCode: string;
  timezone: string;
  metadata: Record<string, unknown>;
};

export type BrandRow = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'ARCHIVED';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TenantBusinessRow = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  country_code: string | null;
  timezone: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function invalid(message: string): never {
  throw new ControlPlaneBootstrapError('INVALID', message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeUuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    invalid(field + ' must be a UUID');
  }
  return value.trim();
}

function normalizeName(value: unknown, field: string, maxLength = MAX_NAME_LENGTH) {
  if (typeof value !== 'string') invalid(field + ' must be a string');
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > maxLength) {
    invalid(field + ' has an invalid length');
  }
  return normalized;
}

function normalizeSlug(value: unknown) {
  if (typeof value !== 'string') invalid('slug must be a string');
  const normalized = value.trim().toLowerCase();
  if (!SLUG_RE.test(normalized)) {
    invalid('slug must match the canonical control-plane slug format');
  }
  return normalized;
}

function normalizeMetadata(value: unknown) {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) invalid('metadata must be a JSON object');

  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    invalid('metadata must be JSON serializable');
  }

  if (Buffer.byteLength(encoded, 'utf8') > MAX_METADATA_BYTES) {
    invalid('metadata exceeds the bootstrap size limit');
  }

  return value;
}

function normalizeCountryCode(value: unknown) {
  if (typeof value !== 'string') invalid('countryCode must be a string');
  const normalized = value.trim().toUpperCase();
  if (!COUNTRY_CODE_RE.test(normalized)) {
    invalid('countryCode must be an ISO alpha-2 code');
  }
  return normalized;
}

function normalizeTimezone(value: unknown) {
  if (typeof value !== 'string') invalid('timezone must be a string');
  const normalized = value.trim();
  if (!normalized || normalized.length > 80) invalid('timezone is invalid');

  try {
    new Intl.DateTimeFormat('en', { timeZone: normalized }).format();
  } catch {
    invalid('timezone must be a valid IANA timezone');
  }

  return normalized;
}

function normalizeLegalName(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  return normalizeName(value, 'legalName', MAX_LEGAL_NAME_LENGTH);
}

export function parseBrandBootstrapPayload(value: unknown): BrandBootstrapPayload {
  if (!isPlainObject(value)) invalid('brand payload must be an object');

  return {
    organizationId: normalizeUuid(value.organizationId, 'organizationId'),
    name: normalizeName(value.name, 'name'),
    slug: normalizeSlug(value.slug),
    metadata: normalizeMetadata(value.metadata),
  };
}

export function parseBusinessBootstrapPayload(value: unknown): BusinessBootstrapPayload {
  if (!isPlainObject(value)) invalid('business payload must be an object');

  return {
    organizationId: normalizeUuid(value.organizationId, 'organizationId'),
    brandId: normalizeUuid(value.brandId, 'brandId'),
    name: normalizeName(value.name, 'name'),
    slug: normalizeSlug(value.slug),
    legalName: normalizeLegalName(value.legalName),
    countryCode: normalizeCountryCode(value.countryCode),
    timezone: normalizeTimezone(value.timezone),
    metadata: normalizeMetadata(value.metadata),
  };
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key])]),
  );
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(sortJson(left)) === JSON.stringify(sortJson(right));
}

export function brandMatchesBootstrap(row: BrandRow, payload: BrandBootstrapPayload) {
  return row.organization_id === payload.organizationId
    && row.slug === payload.slug
    && row.name === payload.name
    && row.status === 'ACTIVE'
    && sameJson(row.metadata ?? {}, payload.metadata);
}

export function businessMatchesBootstrap(
  row: TenantBusinessRow,
  payload: BusinessBootstrapPayload,
) {
  return row.organization_id === payload.organizationId
    && row.brand_id === payload.brandId
    && row.slug === payload.slug
    && row.name === payload.name
    && row.legal_name === payload.legalName
    && row.country_code === payload.countryCode
    && row.timezone === payload.timezone
    && row.status === 'ACTIVE'
    && sameJson(row.metadata ?? {}, payload.metadata);
}

export async function requireOrganizationOwner(input: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
}) {
  const { data, error } = await input.supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', input.organizationId)
    .eq('user_id', input.userId)
    .maybeSingle();

  if (error) {
    throw new ControlPlaneBootstrapError(
      'DATABASE',
      'Unable to verify control-plane ownership',
    );
  }

  if (data?.role !== 'OWNER') {
    throw new ControlPlaneBootstrapError(
      'FORBIDDEN',
      'Organization OWNER authority is required',
    );
  }
}

async function loadBrandBySlug(input: {
  supabase: SupabaseClient;
  organizationId: string;
  slug: string;
}) {
  const { data, error } = await input.supabase
    .from('brands')
    .select('id,organization_id,name,slug,status,metadata,created_at,updated_at')
    .eq('organization_id', input.organizationId)
    .eq('slug', input.slug)
    .maybeSingle();

  if (error) {
    throw new ControlPlaneBootstrapError('DATABASE', 'Unable to read Brand state');
  }

  return (data ?? null) as BrandRow | null;
}

async function loadBusinessBySlug(input: {
  supabase: SupabaseClient;
  organizationId: string;
  brandId: string;
  slug: string;
}) {
  const { data, error } = await input.supabase
    .from('tenant_businesses')
    .select(
      'id,organization_id,brand_id,name,slug,legal_name,country_code,timezone,status,metadata,created_at,updated_at',
    )
    .eq('organization_id', input.organizationId)
    .eq('brand_id', input.brandId)
    .eq('slug', input.slug)
    .maybeSingle();

  if (error) {
    throw new ControlPlaneBootstrapError('DATABASE', 'Unable to read Business state');
  }

  return (data ?? null) as TenantBusinessRow | null;
}

function returnReplayOrConflict<T>(
  row: T,
  matches: (row: T) => boolean,
  entity: 'Brand' | 'Business',
) {
  if (!matches(row)) {
    throw new ControlPlaneBootstrapError(
      'CONFLICT',
      entity + ' slug already exists with different canonical data',
    );
  }
  return { row, created: false as const };
}

export async function createBrandBootstrap(input: {
  supabase: SupabaseClient;
  userId: string;
  payload: BrandBootstrapPayload;
}) {
  await requireOrganizationOwner({
    supabase: input.supabase,
    organizationId: input.payload.organizationId,
    userId: input.userId,
  });

  const existing = await loadBrandBySlug({
    supabase: input.supabase,
    organizationId: input.payload.organizationId,
    slug: input.payload.slug,
  });

  if (existing) {
    return returnReplayOrConflict(
      existing,
      (row) => brandMatchesBootstrap(row, input.payload),
      'Brand',
    );
  }

  const { data, error } = await input.supabase
    .from('brands')
    .insert({
      organization_id: input.payload.organizationId,
      name: input.payload.name,
      slug: input.payload.slug,
      status: 'ACTIVE',
      metadata: input.payload.metadata,
    })
    .select('id,organization_id,name,slug,status,metadata,created_at,updated_at')
    .single();

  if (!error && data) {
    return { row: data as BrandRow, created: true as const };
  }

  if (error?.code === '23505') {
    const raced = await loadBrandBySlug({
      supabase: input.supabase,
      organizationId: input.payload.organizationId,
      slug: input.payload.slug,
    });
    if (raced) {
      return returnReplayOrConflict(
        raced,
        (row) => brandMatchesBootstrap(row, input.payload),
        'Brand',
      );
    }
  }

  throw new ControlPlaneBootstrapError('DATABASE', 'Brand creation failed');
}

export async function createBusinessBootstrap(input: {
  supabase: SupabaseClient;
  userId: string;
  payload: BusinessBootstrapPayload;
}) {
  await requireOrganizationOwner({
    supabase: input.supabase,
    organizationId: input.payload.organizationId,
    userId: input.userId,
  });

  const { data: brand, error: brandError } = await input.supabase
    .from('brands')
    .select('id,status')
    .eq('organization_id', input.payload.organizationId)
    .eq('id', input.payload.brandId)
    .maybeSingle();

  if (brandError) {
    throw new ControlPlaneBootstrapError('DATABASE', 'Unable to verify parent Brand');
  }

  if (!brand || brand.status !== 'ACTIVE') {
    throw new ControlPlaneBootstrapError(
      'NOT_FOUND',
      'An ACTIVE parent Brand in the same Organization is required',
    );
  }

  const existing = await loadBusinessBySlug({
    supabase: input.supabase,
    organizationId: input.payload.organizationId,
    brandId: input.payload.brandId,
    slug: input.payload.slug,
  });

  if (existing) {
    return returnReplayOrConflict(
      existing,
      (row) => businessMatchesBootstrap(row, input.payload),
      'Business',
    );
  }

  const { data, error } = await input.supabase
    .from('tenant_businesses')
    .insert({
      organization_id: input.payload.organizationId,
      brand_id: input.payload.brandId,
      name: input.payload.name,
      slug: input.payload.slug,
      legal_name: input.payload.legalName,
      country_code: input.payload.countryCode,
      timezone: input.payload.timezone,
      status: 'ACTIVE',
      metadata: input.payload.metadata,
    })
    .select(
      'id,organization_id,brand_id,name,slug,legal_name,country_code,timezone,status,metadata,created_at,updated_at',
    )
    .single();

  if (!error && data) {
    return { row: data as TenantBusinessRow, created: true as const };
  }

  if (error?.code === '23505') {
    const raced = await loadBusinessBySlug({
      supabase: input.supabase,
      organizationId: input.payload.organizationId,
      brandId: input.payload.brandId,
      slug: input.payload.slug,
    });
    if (raced) {
      return returnReplayOrConflict(
        raced,
        (row) => businessMatchesBootstrap(row, input.payload),
        'Business',
      );
    }
  }

  throw new ControlPlaneBootstrapError('DATABASE', 'Business creation failed');
}
