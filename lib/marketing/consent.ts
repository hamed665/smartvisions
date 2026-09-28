import type { SupabaseClient } from '@supabase/supabase-js';

export const MARKETING_PERMISSION_PURPOSE = 'MARKETING' as const;
export const MARKETING_PERMISSION_CHANNELS = [
  'EMAIL',
  'WHATSAPP',
  'INSTAGRAM',
  'FACEBOOK_MESSENGER',
  'TELEGRAM',
] as const;

export type MarketingPermissionChannel = typeof MARKETING_PERMISSION_CHANNELS[number];

export type MarketingPermissionResult = {
  allowed: boolean;
  reason: 'VERIFIED_PERMISSION' | 'NO_PERMISSION_EVIDENCE' | 'LATEST_PERMISSION_IS_REVOKE' | 'PERMISSION_NOT_VERIFIED' | string;
  eventId: string | null;
  action: 'GRANT' | 'REVOKE' | null;
  legalBasis: string | null;
  sourceType: string | null;
  sourceReference: string | null;
  occurredAt: string | null;
  verifiedAt: string | null;
  preferenceCenterManaged: boolean | null;
};

type PermissionRpcRow = {
  allowed?: boolean | null;
  reason?: string | null;
  event_id?: string | null;
  permission_action?: string | null;
  legal_basis?: string | null;
  source_type?: string | null;
  source_reference?: string | null;
  occurred_at?: string | null;
  verified_at?: string | null;
  preference_center_managed?: boolean | null;
};

export function normalizeMarketingPermissionRecipient(channel: MarketingPermissionChannel, recipient: string) {
  const value = String(recipient ?? '').trim();
  if (channel === 'EMAIL') return value.toLowerCase();
  if (channel === 'WHATSAPP') return value.replace(/\D/g, '');
  return value;
}

export async function getMarketingPermission(input: {
  supabase: SupabaseClient;
  organizationId: string;
  leadId: string;
  channel: MarketingPermissionChannel;
  recipient: string;
}) : Promise<MarketingPermissionResult> {
  const { data, error } = await input.supabase.rpc('get_marketing_permission', {
    p_organization_id: input.organizationId,
    p_lead_id: input.leadId,
    p_channel: input.channel,
    p_purpose: MARKETING_PERMISSION_PURPOSE,
    p_recipient: normalizeMarketingPermissionRecipient(input.channel, input.recipient),
  });

  if (error) throw new Error(`MARKETING_PERMISSION_EVIDENCE_UNAVAILABLE:${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as PermissionRpcRow | null;
  if (!row) {
    return {
      allowed: false,
      reason: 'NO_PERMISSION_EVIDENCE',
      eventId: null,
      action: null,
      legalBasis: null,
      sourceType: null,
      sourceReference: null,
      occurredAt: null,
      verifiedAt: null,
      preferenceCenterManaged: null,
    };
  }

  return {
    allowed: row.allowed === true,
    reason: String(row.reason ?? 'NO_PERMISSION_EVIDENCE'),
    eventId: row.event_id ?? null,
    action: row.permission_action === 'GRANT' || row.permission_action === 'REVOKE'
      ? row.permission_action
      : null,
    legalBasis: row.legal_basis ?? null,
    sourceType: row.source_type ?? null,
    sourceReference: row.source_reference ?? null,
    occurredAt: row.occurred_at ?? null,
    verifiedAt: row.verified_at ?? null,
    preferenceCenterManaged: row.preference_center_managed ?? null,
  };
}
