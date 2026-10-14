import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { stableAgentRequestKey } from '@/lib/operations/executor-core';
import { controlledInboundEvidence } from '@/lib/whatsapp/controlled-inbound-evidence';
import { SAHRA_FAST_SCOPE } from '@/lib/whatsapp/sahra-fast-inbound-core';

/**
 * The generic 20-paid-runs-per-lead budget is a lifetime cap, so it eventually
 * disables any long-running customer relationship. Never relax it globally.
 *
 * The only exception is an already-claimed, fresh, owner-consented, signed
 * customer-initiated Sahra WhatsApp inbound. PostgreSQL's existing
 * verify_or_claim_whatsapp_controlled_inbound(false) proves the exact binding,
 * source journal, conversation/lead, approved owner receipt, DNC/human gates,
 * and the 200-per-Oman-day claim cap. All paid monthly/total Cost Guard and
 * DAILY_DEEP_AI_RUNS checks continue to apply.
 *
 * This function cannot create claims, sends, messages or paid retries.
 */
export async function verifySahraInboundLifetimeQuotaExemption(input: {
  supabase: SupabaseClient;
  organizationId: string;
  leadId: string | null | undefined;
  conversationId: string | null | undefined;
  expectedInboundProviderMessageId: string | null | undefined;
  requestKey: string;
}): Promise<boolean> {
  const messageId = input.expectedInboundProviderMessageId?.trim();
  if (input.organizationId !== SAHRA_FAST_SCOPE.organizationId
    || !input.leadId || !input.conversationId
    || !messageId || messageId.length > 512
    || input.requestKey !== stableAgentRequestKey('WHATSAPP', messageId)) return false;

  const inbound = await input.supabase.from('outreach_messages')
    .select('id,lead_id,metadata')
    .eq('organization_id', input.organizationId)
    .eq('channel','WHATSAPP').eq('direction','INBOUND')
    .eq('provider_message_id', messageId)
    .eq('lead_id', input.leadId)
    .maybeSingle();
  if (inbound.error || !inbound.data?.id
    || inbound.data.lead_id !== input.leadId) return false;
  const metadata = inbound.data.metadata as Record<string,unknown> | null;
  if (metadata?.conversation_id !== input.conversationId
    || metadata?.tenant_business_id !== SAHRA_FAST_SCOPE.tenantBusinessId
    || metadata?.communication_channel_binding_id !== SAHRA_FAST_SCOPE.bindingId) return false;

  const message = await input.supabase.from('conversation_messages')
    .select('id,lead_id,conversation_id,metadata')
    .eq('organization_id',input.organizationId)
    .eq('lead_id',input.leadId).eq('conversation_id',input.conversationId)
    .eq('provider_message_id',messageId)
    .eq('direction','INBOUND').eq('channel','WHATSAPP')
    .eq('provenance','CUSTOMER').eq('source_plane','META_WHATSAPP')
    .maybeSingle();
  const canonical = message.data;
  const sourceMetadata = canonical?.metadata as Record<string,unknown> | null;
  const from = typeof sourceMetadata?.from === 'string'
    ? sourceMetadata.from.replace(/\D/g,'') : '';
  if (message.error || !canonical?.id || !/^[0-9]{8,15}$/.test(from)
    || sourceMetadata?.tenant_business_id !== SAHRA_FAST_SCOPE.tenantBusinessId
    || sourceMetadata?.communication_channel_binding_id !== SAHRA_FAST_SCOPE.bindingId) return false;

  const evidence = await controlledInboundEvidence({
    supabase:input.supabase,organizationId:input.organizationId,
    inboundId:inbound.data.id,recipient:from,conversationId:input.conversationId,
  });
  return evidence.allowed;
}
