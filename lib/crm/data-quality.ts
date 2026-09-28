import type { SupabaseClient } from '@supabase/supabase-js';

import {
  normalizeCrmIdentity,
  type CrmIdentityType,
} from '@/lib/crm/contact-identity';

export const CRM_DATA_QUALITY_MUTATION_ROLES = ['OWNER', 'ADMIN', 'SALES_MANAGER'] as const;
export type CrmDataQualityMutationRole = typeof CRM_DATA_QUALITY_MUTATION_ROLES[number];

export const CRM_VERIFIED_IMPORT_IDENTITY_TYPES = [
  'EMAIL',
  'PHONE',
  'WHATSAPP',
  'INSTAGRAM',
] as const;

export type CrmVerifiedImportIdentityType = typeof CRM_VERIFIED_IMPORT_IDENTITY_TYPES[number];

export type CrmVerifiedContactImportInput = {
  clientRowKey: string;
  businessId: string;
  identityType: CrmVerifiedImportIdentityType;
  identityValue: string;
  displayName?: string | null;
  displayValue?: string | null;
  relationshipType?: 'CONTACT' | 'OWNER' | 'EMPLOYEE' | 'DECISION_MAKER' | 'BILLING_CONTACT' | 'OTHER';
  jobTitle?: string | null;
};

export type CrmVerifiedContactImportRow = {
  clientRowKey: string;
  businessId: string;
  identityType: CrmVerifiedImportIdentityType;
  normalizedValue: string;
  displayValue: string | null;
  displayName: string | null;
  relationshipType: 'CONTACT' | 'OWNER' | 'EMPLOYEE' | 'DECISION_MAKER' | 'BILLING_CONTACT' | 'OTHER';
  jobTitle: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RELATIONSHIPS = ['CONTACT','OWNER','EMPLOYEE','DECISION_MAKER','BILLING_CONTACT','OTHER'] as const;

export function isCrmDataQualityMutationRole(value: unknown): value is CrmDataQualityMutationRole {
  return typeof value === 'string'
    && (CRM_DATA_QUALITY_MUTATION_ROLES as readonly string[]).includes(value);
}

export function prepareVerifiedContactImportRows(
  rows: CrmVerifiedContactImportInput[],
): CrmVerifiedContactImportRow[] {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100) {
    throw new Error('Verified Contact import supports 1 to 100 rows');
  }

  const estimatedSize = Buffer.byteLength(JSON.stringify(rows), 'utf8');
  if (estimatedSize > 262_144) {
    throw new Error('Verified Contact import payload exceeds 256 KiB');
  }

  const clientKeys = new Set<string>();
  const businessIdentityKeys = new Set<string>();

  return rows.map((row, index) => {
    const clientRowKey = String(row.clientRowKey ?? '').trim();
    const businessId = String(row.businessId ?? '').trim();
    const identityType = String(row.identityType ?? '').trim().toUpperCase() as CrmVerifiedImportIdentityType;
    const relationshipType = String(row.relationshipType ?? 'CONTACT').trim().toUpperCase() as CrmVerifiedContactImportRow['relationshipType'];
    const identityValue = String(row.identityValue ?? '');

    if (!clientRowKey || clientRowKey.length > 120) {
      throw new Error(`Import row ${index + 1} has an invalid clientRowKey`);
    }
    if (clientKeys.has(clientRowKey)) {
      throw new Error(`Import clientRowKey "${clientRowKey}" is duplicated`);
    }
    clientKeys.add(clientRowKey);

    if (!UUID_RE.test(businessId)) {
      throw new Error(`Import row ${clientRowKey} has an invalid businessId`);
    }
    if (!(CRM_VERIFIED_IMPORT_IDENTITY_TYPES as readonly string[]).includes(identityType)) {
      throw new Error(`Import row ${clientRowKey} has an unsupported identityType`);
    }

    const normalizedValue = normalizeCrmIdentity(identityType as CrmIdentityType, identityValue);
    if (!normalizedValue) {
      throw new Error(`Import row ${clientRowKey} has an invalid identityValue`);
    }

    const identityKey = `${businessId}:${identityType}:${normalizedValue}`;
    if (businessIdentityKeys.has(identityKey)) {
      throw new Error(`Import row ${clientRowKey} duplicates another Business/identity row`);
    }
    businessIdentityKeys.add(identityKey);

    if (!(RELATIONSHIPS as readonly string[]).includes(relationshipType)) {
      throw new Error(`Import row ${clientRowKey} has an invalid relationshipType`);
    }

    const displayName = row.displayName == null ? null : String(row.displayName).trim() || null;
    const displayValue = row.displayValue == null ? identityValue.trim() || null : String(row.displayValue).trim() || null;
    const jobTitle = row.jobTitle == null ? null : String(row.jobTitle).trim() || null;

    if (displayName && displayName.length > 200) {
      throw new Error(`Import row ${clientRowKey} displayName is too long`);
    }
    if (displayValue && displayValue.length > 512) {
      throw new Error(`Import row ${clientRowKey} displayValue is too long`);
    }
    if (jobTitle && jobTitle.length > 200) {
      throw new Error(`Import row ${clientRowKey} jobTitle is too long`);
    }

    return {
      clientRowKey,
      businessId,
      identityType,
      normalizedValue,
      displayValue,
      displayName,
      relationshipType,
      jobTitle,
    };
  });
}

export async function getCrmDataQualitySummary(input: {
  supabase: SupabaseClient;
  organizationId: string;
  limit?: number;
}) {
  const { data, error } = await input.supabase.rpc('get_crm_data_quality_summary', {
    p_organization_id: input.organizationId,
    p_limit: Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 250),
  });
  if (error) throw new Error(`CRM data-quality summary failed: ${error.message}`);
  return (data ?? {}) as Record<string, unknown>;
}

export async function previewVerifiedContactImport(input: {
  supabase: SupabaseClient;
  organizationId: string;
  rows: CrmVerifiedContactImportRow[];
}) {
  const businessIds = [...new Set(input.rows.map(row => row.businessId))];
  const normalizedValues = [...new Set(input.rows.map(row => row.normalizedValue))];

  const [businessResult, identityResult] = await Promise.all([
    input.supabase
      .from('businesses')
      .select('id,name')
      .eq('organization_id', input.organizationId)
      .in('id', businessIds),
    input.supabase
      .from('crm_identities')
      .select('id,identity_type,normalized_value,status')
      .eq('organization_id', input.organizationId)
      .in('normalized_value', normalizedValues),
  ]);

  if (businessResult.error) {
    throw new Error(`Verified import Business lookup failed: ${businessResult.error.message}`);
  }
  if (identityResult.error) {
    throw new Error(`Verified import identity lookup failed: ${identityResult.error.message}`);
  }

  const foundBusinesses = new Map(
    (businessResult.data ?? []).map(row => [String(row.id), String(row.name)]),
  );
  const identities = (identityResult.data ?? []).filter(row => row.status !== 'RETIRED');
  const identityIds = identities.map(row => String(row.id));

  let links: Array<{ identity_id: string; business_id: string; status: string }> = [];
  if (identityIds.length) {
    const linkResult = await input.supabase
      .from('crm_identity_links')
      .select('identity_id,business_id,status')
      .eq('organization_id', input.organizationId)
      .in('identity_id', identityIds)
      .neq('status', 'RETIRED');
    if (linkResult.error) {
      throw new Error(`Verified import identity-link lookup failed: ${linkResult.error.message}`);
    }
    links = (linkResult.data ?? []).map(row => ({
      identity_id: String(row.identity_id),
      business_id: String(row.business_id),
      status: String(row.status),
    }));
  }

  return input.rows.map(row => {
    const businessName = foundBusinesses.get(row.businessId);
    if (!businessName) {
      return { ...row, businessName: null, status: 'BLOCKED_BUSINESS_NOT_FOUND' as const };
    }

    const identity = identities.find(item =>
      String(item.identity_type) === row.identityType
      && String(item.normalized_value) === row.normalizedValue
    );

    if (!identity) {
      return { ...row, businessName, status: 'READY_NEW_IDENTITY' as const };
    }

    const identityLinks = links.filter(link => link.identity_id === String(identity.id));
    const linkedBusinesses = [...new Set(identityLinks.map(link => link.business_id))];
    if (identityLinks.some(link => link.status === 'CONFLICTED') || linkedBusinesses.length > 1) {
      return {
        ...row,
        businessName,
        status: 'BLOCKED_AMBIGUOUS_IDENTITY' as const,
        linkedBusinessIds: linkedBusinesses,
      };
    }
    if (linkedBusinesses.length === 1 && linkedBusinesses[0] !== row.businessId) {
      return {
        ...row,
        businessName,
        status: 'BLOCKED_OTHER_BUSINESS' as const,
        linkedBusinessIds: linkedBusinesses,
      };
    }

    return {
      ...row,
      businessName,
      status: linkedBusinesses[0] === row.businessId
        ? 'READY_EXISTING_IDENTITY'
        : 'READY_UNLINKED_IDENTITY',
    };
  });
}

export async function applyVerifiedContactImport(input: {
  service: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  requestKey: string;
  rows: CrmVerifiedContactImportRow[];
}) {
  const { data, error } = await input.service.rpc('apply_crm_verified_contact_import', {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_request_key: input.requestKey,
    p_rows: input.rows,
  });
  if (error) throw new Error(`Verified Contact import failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.batch_id) throw new Error('Verified Contact import returned no batch receipt');
  return {
    batchId: String(row.batch_id),
    importedRows: Number(row.imported_rows ?? 0),
    createdPeople: Number(row.created_people ?? 0),
    linkedRelationships: Number(row.linked_relationships ?? 0),
    replayed: row.replayed === true,
  };
}
