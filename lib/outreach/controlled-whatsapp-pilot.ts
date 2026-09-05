import {
  isSmartVisionsCatalogContentId,
  isSmartVisionsCatalogContentVerifiedForSend,
} from '@/lib/whatsapp/catalog';

export type ControlledWhatsAppPilotEvidence = {
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

export type ControlledWhatsAppPilotVerification =
  | { verified: true; mode: 'TEXT'|'CATALOG'; catalogContentId: string | null; recipient: string }
  | { verified: false; reason: string };

export function normalizeControlledPilotPhone(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function verifyControlledWhatsAppPilot(
  input: ControlledWhatsAppPilotEvidence,
): ControlledWhatsAppPilotVerification {
  if (input.messageStatus !== 'APPROVED' || input.requiresApproval) {
    return { verified: false, reason: 'MESSAGE_NOT_OWNER_APPROVED' };
  }
  if (input.channel !== 'WHATSAPP') return { verified: false, reason: 'CHANNEL_NOT_WHATSAPP' };
  if (input.metadataSource !== 'SHADOW_MODE') return { verified: false, reason: 'SOURCE_NOT_SHADOW_MODE' };
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

  const catalogContentId = typeof input.catalogContentId === 'string'
    ? input.catalogContentId.trim()
    : '';
  if (catalogContentId && !isSmartVisionsCatalogContentId(catalogContentId)) {
    return { verified: false, reason: 'CATALOG_CONTENT_NOT_ALLOWLISTED' };
  }
  if (catalogContentId && !isSmartVisionsCatalogContentVerifiedForSend(catalogContentId)) {
    return { verified: false, reason: 'CATALOG_CONTENT_NOT_SEND_VERIFIED' };
  }

  const recipient = normalizeControlledPilotPhone(input.sendTo);
  const businessRecipient = normalizeControlledPilotPhone(input.businessWhatsapp || input.businessPhone);
  if (recipient.length < 8 || businessRecipient.length < 8 || recipient !== businessRecipient) {
    return { verified: false, reason: 'RECIPIENT_NOT_INTERNAL_TEST_BUSINESS' };
  }

  const internalTestBusiness = String(input.businessCategory ?? '').toUpperCase() === 'INTERNAL_TEST';
  const verifiedOmanLiveInbound = idempotencyKey.startsWith('agent:whatsapp-pilot:live:')
    && recipient.length === 11
    && recipient.startsWith('968');
  if (!internalTestBusiness && !verifiedOmanLiveInbound) {
    return { verified: false, reason: 'BUSINESS_NOT_INTERNAL_TEST' };
  }

  return {
    verified: true,
    mode: catalogContentId ? 'CATALOG' : 'TEXT',
    catalogContentId: catalogContentId || null,
    recipient,
  };
}

// Backward-compatible export for the canonical approved-send core. The verifier now
// supports both controlled text replies and verified catalog replies while keeping
// the same INTERNAL_TEST + owner approval + shadow provenance contract. The only
// non-INTERNAL_TEST exception is the webhook-only `live:` Oman inbound provenance,
// which is upstream time-boxed and still passes the canonical provider-boundary gate.
export const verifyControlledWhatsAppCatalogPilot = verifyControlledWhatsAppPilot;
