import type { SupabaseClient } from '@supabase/supabase-js';

export type CrmIdentityType = 'EMAIL' | 'PHONE' | 'WHATSAPP' | 'INSTAGRAM';
export type CrmIdentitySourceType =
  | 'BUSINESS_FIELD'
  | 'EMAIL_INBOUND'
  | 'WHATSAPP_INBOUND'
  | 'MANUAL'
  | 'IMPORT';

export type CrmIdentityResolution =
  | { status: 'NO_MATCH'; normalizedValue: string | null }
  | { status: 'MATCH'; normalizedValue: string; businessId: string }
  | { status: 'AMBIGUOUS'; normalizedValue: string; businessIds: string[] };

function normalizeInstagram(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      if (host !== 'instagram.com') return null;
      const firstSegment = url.pathname.split('/').filter(Boolean)[0];
      if (!firstSegment) return null;
      return firstSegment.replace(/^@/, '').trim().toLowerCase() || null;
    } catch {
      return null;
    }
  }

  return trimmed.replace(/^@/, '').split(/[/?#]/, 1)[0]?.trim().toLowerCase() || null;
}

export function normalizeCrmIdentity(
  identityType: CrmIdentityType,
  value: string | null | undefined,
): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  if (identityType === 'EMAIL') {
    const normalized = raw.toLowerCase();
    const at = normalized.indexOf('@');
    if (at <= 0 || at === normalized.length - 1) return null;
    return normalized.length <= 512 ? normalized : null;
  }

  if (identityType === 'PHONE' || identityType === 'WHATSAPP') {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 32 ? digits : null;
  }

  const instagram = normalizeInstagram(raw);
  return instagram && instagram.length <= 512 ? instagram : null;
}

export async function resolveBusinessByCrmIdentity(input: {
  supabase: SupabaseClient;
  organizationId: string;
  identityType: CrmIdentityType;
  value: string | null | undefined;
}): Promise<CrmIdentityResolution> {
  const normalizedValue = normalizeCrmIdentity(input.identityType, input.value);
  if (!normalizedValue) return { status: 'NO_MATCH', normalizedValue: null };

  const { data: identity, error: identityError } = await input.supabase
    .from('crm_identities')
    .select('id,status')
    .eq('organization_id', input.organizationId)
    .eq('identity_type', input.identityType)
    .eq('normalized_value', normalizedValue)
    .maybeSingle();

  if (identityError) throw new Error(`CRM identity lookup failed: ${identityError.message}`);
  if (!identity || identity.status === 'RETIRED') {
    return { status: 'NO_MATCH', normalizedValue };
  }

  const { data: links, error: linksError } = await input.supabase
    .from('crm_identity_links')
    .select('business_id,status')
    .eq('organization_id', input.organizationId)
    .eq('identity_id', identity.id)
    .neq('status', 'RETIRED');

  if (linksError) throw new Error(`CRM identity link lookup failed: ${linksError.message}`);

  const businessIds = [...new Set((links ?? []).map(row => String(row.business_id)))];
  if (businessIds.length === 0) return { status: 'NO_MATCH', normalizedValue };

  if (
    businessIds.length > 1
    || (links ?? []).some(row => row.status === 'CONFLICTED')
  ) {
    return { status: 'AMBIGUOUS', normalizedValue, businessIds };
  }

  return { status: 'MATCH', normalizedValue, businessId: businessIds[0] };
}

export async function resolveBusinessByCrmIdentityCandidates(input: {
  supabase: SupabaseClient;
  organizationId: string;
  candidates: Array<{
    identityType: CrmIdentityType;
    value: string | null | undefined;
  }>;
}): Promise<
  | { status: 'NO_MATCH' }
  | { status: 'MATCH'; businessId: string }
  | { status: 'AMBIGUOUS'; businessIds: string[] }
> {
  const resolutions = await Promise.all(
    input.candidates.map(candidate => resolveBusinessByCrmIdentity({
      supabase: input.supabase,
      organizationId: input.organizationId,
      identityType: candidate.identityType,
      value: candidate.value,
    })),
  );

  const businessIds = new Set<string>();
  let ambiguous = false;

  for (const resolution of resolutions) {
    if (resolution.status === 'AMBIGUOUS') {
      ambiguous = true;
      for (const id of resolution.businessIds) businessIds.add(id);
    } else if (resolution.status === 'MATCH') {
      businessIds.add(resolution.businessId);
    }
  }

  if (ambiguous || businessIds.size > 1) {
    return { status: 'AMBIGUOUS', businessIds: [...businessIds] };
  }

  if (businessIds.size === 1) {
    return { status: 'MATCH', businessId: [...businessIds][0] };
  }

  return { status: 'NO_MATCH' };
}

export async function recordCrmBusinessIdentityEvidence(input: {
  supabase: SupabaseClient;
  organizationId: string;
  businessId: string;
  identityType: CrmIdentityType;
  value: string | null | undefined;
  displayValue?: string | null;
  sourceType: CrmIdentitySourceType;
  sourceRef: string;
  evidenceStrength: 'OBSERVED' | 'VERIFIED';
  evidence?: Record<string, unknown>;
}) {
  const normalizedValue = normalizeCrmIdentity(input.identityType, input.value);
  if (!normalizedValue) return null;

  const { data, error } = await input.supabase.rpc('record_crm_business_identity', {
    p_organization_id: input.organizationId,
    p_business_id: input.businessId,
    p_identity_type: input.identityType,
    p_normalized_value: normalizedValue,
    p_display_value: input.displayValue ?? input.value ?? null,
    p_source_type: input.sourceType,
    p_source_ref: input.sourceRef,
    p_evidence_strength: input.evidenceStrength,
    p_evidence: input.evidence ?? {},
  });

  if (error) throw new Error(`CRM identity evidence write failed: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}
