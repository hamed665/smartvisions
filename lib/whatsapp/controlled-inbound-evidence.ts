import type { SupabaseClient } from '@supabase/supabase-js';

/** The persisted rule, consent, tenant, inbound and audit receipt own this exception. */
export async function controlledInboundEvidence(input: {
  supabase: SupabaseClient;
  organizationId: string;
  inboundId: string;
  recipient: string;
  claim?: boolean;
  conversationId?: string;
}) {
  const result = await input.supabase.rpc('verify_or_claim_whatsapp_controlled_inbound', {
    p_organization_id: input.organizationId,
    p_inbound_id: input.inboundId,
    p_recipient: input.recipient,
    p_claim: input.claim === true,
    p_conversation_id: input.conversationId ?? null,
  });
  const value = result.data as { allowed?: boolean; reason?: string } | null;
  return result.error || !value
    ? { allowed: false, reason: 'LIVE_TEST_ATOMIC_EVIDENCE_UNAVAILABLE' }
    : { allowed: value.allowed === true, reason: value.reason ?? 'LIVE_TEST_EVIDENCE_INVALID' };
}

export function controlledInboundId(idempotencyKey: unknown) {
  return typeof idempotencyKey === 'string'
    ? idempotencyKey.match(/^agent:whatsapp-pilot:live:([0-9a-f-]{36}):shadow$/i)?.[1] ?? null
    : null;
}
