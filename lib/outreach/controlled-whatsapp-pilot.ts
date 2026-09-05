import { isSmartVisionsCatalogContentId } from '@/lib/whatsapp/catalog';

const CONTROLLED_PILOT_ALLOWED_ORIGINS = new Set([
  'https://app.smartvisionsai.com',
  'https://smartvisions-growth-os-release-candidate.hamedarezoo900.workers.dev',
  'https://smartvisions.vercel.app',
]);

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

export type ControlledPilotRuntimeInput = {
  appBaseUrl?: string | null;
  vercelProjectProductionUrl?: string | null;
};

function normalizedAllowlistedRuntime(value: string | null | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || !CONTROLLED_PILOT_ALLOWED_ORIGINS.has(url.origin)
  ) {
    return null;
  }

  return url.origin;
}

export function resolveControlledPilotGrowthOsBaseUrl(input: ControlledPilotRuntimeInput) {
  const configuredAppBaseUrl = String(input.appBaseUrl ?? '').trim();
  if (configuredAppBaseUrl) {
    const appBaseUrl = normalizedAllowlistedRuntime(configuredAppBaseUrl);
    if (!appBaseUrl) {
      throw new Error('APP_BASE_URL is not an allowlisted controlled-pilot Growth OS runtime');
    }
    return appBaseUrl;
  }

  const legacyVercelUrl = String(input.vercelProjectProductionUrl ?? '').trim();
  if (legacyVercelUrl) {
    const vercelBaseUrl = normalizedAllowlistedRuntime(legacyVercelUrl);
    if (!vercelBaseUrl) {
      throw new Error('VERCEL_PROJECT_PRODUCTION_URL is not an allowlisted controlled-pilot runtime');
    }
    return vercelBaseUrl;
  }

  throw new Error('Controlled pilot Growth OS base URL is not configured');
}

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
