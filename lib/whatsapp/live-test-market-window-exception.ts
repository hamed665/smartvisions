import { controlledInboundEvidence, controlledInboundId } from '@/lib/whatsapp/controlled-inbound-evidence';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyControlledWhatsAppPilot } from '@/lib/outreach/controlled-whatsapp-pilot';

export async function verifyLiveTestMarketWindowException(input: {
  supabase: SupabaseClient;
  organizationId: string;
  messageStatus: string;
  requiresApproval: boolean;
  channel: string;
  metadataSource?: unknown;
  providerMessageId?: string | null;
  idempotencyKey?: unknown;
  catalogContentId?: unknown;
  sendTo?: unknown;
  messageLeadId?: string | null;
  conversationLeadId?: string | null;
  conversationChannel?: string | null;
  businessCategory?: string | null;
  businessWhatsapp?: string | null;
  businessPhone?: string | null;
  shadowMode: boolean;
  globalKillSwitch: boolean;
  agentsPaused: boolean;
  whatsappPaused: boolean;
  now?: Date;
}) {
  const inboundId = controlledInboundId(input.idempotencyKey);
  if (!inboundId || typeof input.sendTo !== 'string') return false;
  const evidence = await controlledInboundEvidence({
    supabase: input.supabase, organizationId: input.organizationId,
    inboundId, recipient: input.sendTo,
  });
  if (!evidence.allowed) return false;
  return verifyControlledWhatsAppPilot({ ...input, canonicalLiveEvidenceVerified: true }).verified;
}
