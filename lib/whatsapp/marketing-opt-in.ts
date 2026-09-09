import type { SupabaseClient } from '@supabase/supabase-js';

export const WHATSAPP_MARKETING_OPT_IN_FIELD = 'whatsapp_marketing_opt_in';
export const WHATSAPP_MARKETING_OPT_OUT_FIELD = 'whatsapp_marketing_opt_out';

export const WHATSAPP_OPT_IN_SOURCE_TYPES = [
  'CUSTOMER_WHATSAPP_MESSAGE',
  'CLICK_TO_WHATSAPP',
  'WEBSITE_FORM',
  'SIGNED_OR_VERBAL_PERMISSION',
] as const;

export type WhatsAppOptInSourceType = typeof WHATSAPP_OPT_IN_SOURCE_TYPES[number];

export type WhatsAppMarketingPermissionRow = {
  field_name?: string | null;
  value?: unknown;
  source_type?: string | null;
  source_url?: string | null;
  retrieved_at?: string | null;
  verified_at?: string | null;
};

export type WhatsAppMarketingPermission =
  | {
      allowed: true;
      reason: 'VERIFIED_OPT_IN';
      sourceType: WhatsAppOptInSourceType;
      verifiedAt: string;
      optedInAt: string;
      recipient: string;
      sourceReference: string;
    }
  | {
      allowed: false;
      reason:
        | 'NO_OPT_IN_EVIDENCE'
        | 'LATEST_PERMISSION_IS_OPT_OUT'
        | 'OPT_IN_NOT_VERIFIED'
        | 'OPT_IN_SOURCE_NOT_ALLOWED'
        | 'OPT_IN_SOURCE_REFERENCE_REQUIRED'
        | 'OPT_IN_PAYLOAD_INVALID'
        | 'OPT_IN_RECIPIENT_MISMATCH';
    };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validIso(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function normalizeWhatsAppRecipient(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function evaluateWhatsAppMarketingPermission(
  rows: WhatsAppMarketingPermissionRow[],
  recipient: string,
): WhatsAppMarketingPermission {
  const canonicalRecipient = normalizeWhatsAppRecipient(recipient);
  const permissionRows = rows
    .filter((row) => row.field_name === WHATSAPP_MARKETING_OPT_IN_FIELD
      || row.field_name === WHATSAPP_MARKETING_OPT_OUT_FIELD)
    .sort((left, right) => {
      const leftTime = Date.parse(String(left.retrieved_at ?? ''));
      const rightTime = Date.parse(String(right.retrieved_at ?? ''));
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    });

  const latest = permissionRows[0];
  if (!latest) return { allowed: false, reason: 'NO_OPT_IN_EVIDENCE' };
  if (latest.field_name === WHATSAPP_MARKETING_OPT_OUT_FIELD) {
    return { allowed: false, reason: 'LATEST_PERMISSION_IS_OPT_OUT' };
  }

  const verifiedAt = validIso(latest.verified_at);
  if (!verifiedAt) return { allowed: false, reason: 'OPT_IN_NOT_VERIFIED' };

  const sourceType = String(latest.source_type ?? '').toUpperCase() as WhatsAppOptInSourceType;
  if (!WHATSAPP_OPT_IN_SOURCE_TYPES.includes(sourceType)) {
    return { allowed: false, reason: 'OPT_IN_SOURCE_NOT_ALLOWED' };
  }

  const sourceReference = String(latest.source_url ?? '').trim();
  if (!sourceReference) return { allowed: false, reason: 'OPT_IN_SOURCE_REFERENCE_REQUIRED' };

  const value = record(latest.value);
  const optedInAt = validIso(value.opted_in_at);
  if (
    value.consent !== true
    || String(value.business_name ?? '') !== 'Smart Visions'
    || String(value.purpose ?? '').toUpperCase() !== 'MARKETING'
    || !optedInAt
  ) {
    return { allowed: false, reason: 'OPT_IN_PAYLOAD_INVALID' };
  }

  const evidenceRecipient = normalizeWhatsAppRecipient(value.recipient);
  if (canonicalRecipient.length < 8 || evidenceRecipient !== canonicalRecipient) {
    return { allowed: false, reason: 'OPT_IN_RECIPIENT_MISMATCH' };
  }

  return {
    allowed: true,
    reason: 'VERIFIED_OPT_IN',
    sourceType,
    verifiedAt,
    optedInAt,
    recipient: canonicalRecipient,
    sourceReference,
  };
}

export async function getWhatsAppMarketingPermission(input: {
  supabase: SupabaseClient;
  organizationId: string;
  leadId: string;
  recipient: string;
}) {
  const { data, error } = await input.supabase
    .from('lead_sources')
    .select('field_name,value,source_type,source_url,retrieved_at,verified_at')
    .eq('organization_id', input.organizationId)
    .eq('lead_id', input.leadId)
    .in('field_name', [WHATSAPP_MARKETING_OPT_IN_FIELD, WHATSAPP_MARKETING_OPT_OUT_FIELD])
    .order('retrieved_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`WHATSAPP_OPT_IN_EVIDENCE_UNAVAILABLE:${error.message}`);
  return evaluateWhatsAppMarketingPermission(
    (data ?? []) as WhatsAppMarketingPermissionRow[],
    input.recipient,
  );
}
