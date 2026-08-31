export const SMART_VISIONS_WHATSAPP_CATALOG_ID = '1773319100642340';

export const SMART_VISIONS_CATALOG_ITEMS = {
  'SV-WEB-001': { serviceKey: 'website_design', label: 'Website Design & Development' },
  'SV-IG-CONTENT-001': { serviceKey: 'instagram_content', label: 'Instagram Content Creation' },
  'SV-WA-001': { serviceKey: 'whatsapp_automation', label: 'WhatsApp Automation' },
  'SV-SEO-001': { serviceKey: 'seo_geo', label: 'SEO & GEO' },
  'SV-AI-AGENT-001': { serviceKey: 'ai_agents', label: 'AI Agents' },
  'SV-SM-001': { serviceKey: 'social_media_management', label: 'Social Media Management' },
} as const;

export type SmartVisionsCatalogContentId = keyof typeof SMART_VISIONS_CATALOG_ITEMS;

export function resolveWhatsAppCatalogId() {
  return process.env.META_WHATSAPP_CATALOG_ID?.trim()
    || process.env.WHATSAPP_CATALOG_ID?.trim()
    || SMART_VISIONS_WHATSAPP_CATALOG_ID;
}

export function isSmartVisionsCatalogContentId(value: unknown): value is SmartVisionsCatalogContentId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SMART_VISIONS_CATALOG_ITEMS, value);
}

export function assertSmartVisionsCatalogContentId(value: unknown): asserts value is SmartVisionsCatalogContentId {
  if (!isSmartVisionsCatalogContentId(value)) {
    throw new Error('Unknown Smart Visions WhatsApp catalog content ID');
  }
}

export function getSmartVisionsCatalogItem(contentId: SmartVisionsCatalogContentId) {
  return SMART_VISIONS_CATALOG_ITEMS[contentId];
}
