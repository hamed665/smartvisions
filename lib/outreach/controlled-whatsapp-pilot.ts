import { isSmartVisionsCatalogContentId } from '@/lib/whatsapp/catalog';

export type ControlledWhatsAppCatalogPilotEvidence = {
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
};

export type ControlledWhatsAppCatalogPilotVerification =
  | { verified: true; catalogContentId: string; recipient: string }
  | { verified: false; reason: string };

export function normalizeControlledPilotPhone(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function verifyControlledWhatsAppCatalogPilot(
  input: ControlledWhatsAppCatalogPilotEvidence,
): ControlledWhatsAppCatalogPilotVerification {
  if (input.messageStatus !== 'APPROVED' || input.requiresApproval) {
    return { verified: false, reason: 'MESSAGE_NOT_OWNER_APPROVED' };
  }
  if (input.channel !== 'WHATSAPP') return { verified: false, reason: 'CHANNEL_NOT_WHATSAPP' };
  if (input.metadataSource !== 'SHADOW_MODE') return { verified: false, reason: 'SOURCE_NOT_SHADOW_MODE' };
  if (input.businessCategory !== 'INTERNAL_TEST') return { verified: false, reason: 'BUSINESS_NOT_INTERNAL_TEST' };
  if (input.conversationChannel !== 'WHATSAPP') return { verified: false, reason: 'CONVERSATION_NOT_WHATSAPP' };
  if (!input.messageLeadId || input.conversationLeadId !== input.messageLeadId) {
    return { verified: false, reason: 'CONVERSATION_LEAD_MISMATCH' };
  }

  const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
  if (!idempotencyKey.startsWith('agent:whatsapp-pilot:') || !idempotencyKey.endsWith(':shadow')) {
    return { verified: false, reason: 'IDEMPOTENCY_KEY_NOT_CONTROLLED_PILOT' };
  }
  if (input.providerMessageId !== `shadow:${idempotencyKey}`) {
    return { verified: false, reason: 'SHADOW_PROVIDER_ID_MISMATCH' };
  }
  if (!isSmartVisionsCatalogContentId(input.catalogContentId)) {
    return { verified: false, reason: 'CATALOG_CONTENT_NOT_ALLOWLISTED' };
  }

  const recipient = normalizeControlledPilotPhone(input.sendTo);
  const businessRecipient = normalizeControlledPilotPhone(input.businessWhatsapp || input.businessPhone);
  if (recipient.length < 8 || businessRecipient.length < 8 || recipient !== businessRecipient) {
    return { verified: false, reason: 'RECIPIENT_NOT_INTERNAL_TEST_BUSINESS' };
  }

  return { verified: true, catalogContentId: input.catalogContentId, recipient };
}
