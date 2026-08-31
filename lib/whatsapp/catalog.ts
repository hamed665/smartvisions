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

const SERVICE_ALIASES: Record<string, SmartVisionsCatalogContentId> = {
  website_design: 'SV-WEB-001',
  business_website: 'SV-WEB-001',
  premium_bilingual_website: 'SV-WEB-001',
  custom_website: 'SV-WEB-001',
  instagram_content: 'SV-IG-CONTENT-001',
  ai_reels_4: 'SV-IG-CONTENT-001',
  ai_reels_8: 'SV-IG-CONTENT-001',
  whatsapp_automation: 'SV-WA-001',
  whatsapp_ai_setup: 'SV-WA-001',
  seo_geo: 'SV-SEO-001',
  ai_agents: 'SV-AI-AGENT-001',
  social_media_management: 'SV-SM-001',
};

const EXPLICIT_SERVICE_PATTERNS: Array<{ contentId: SmartVisionsCatalogContentId; pattern: RegExp }> = [
  { contentId: 'SV-WEB-001', pattern: /\b(website|web site|web design|website design|website development)\b|موقع\s*(إلكتروني|الكتروني)?|طراحی\s*سایت|وب\s*سایت/i },
  { contentId: 'SV-IG-CONTENT-001', pattern: /\b(instagram content|content creation|instagram reels?|reels? package)\b|محتوى\s*(انستغرام|إنستغرام)|ريلز\s*انستغرام|تولید\s*محتوا|ریلز\s*اینستاگرام/i },
  { contentId: 'SV-WA-001', pattern: /\b(whatsapp automation|whatsapp ai|whatsapp bot)\b|أتمتة\s*واتساب|واتساب\s*(آلي|ذكي|بوت)|اتوماسیون\s*واتساپ|ربات\s*واتساپ/i },
  { contentId: 'SV-SEO-001', pattern: /\b(SEO|GEO|search engine optimization|generative engine optimization)\b|تحسين\s*محركات\s*البحث|سئو/i },
  { contentId: 'SV-AI-AGENT-001', pattern: /\b(ai agents?|ai sales agent|ai assistant|chatbot)\b|وكيل\s*(ذكاء\s*اصطناعي|ذكي)|مساعد\s*ذكي|ایجنت\s*هوش\s*مصنوعی|چت\s*بات/i },
  { contentId: 'SV-SM-001', pattern: /\b(social media management|manage (my|our) social media|social media manager)\b|إدارة\s*وسائل\s*التواصل|مدیریت\s*شبکه(\s|‌)*های\s*اجتماعی/i },
];

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

export function resolveSmartVisionsCatalogRecommendation(input: { serviceId?: string | null; message?: string | null }) {
  const normalizedServiceId = input.serviceId?.trim().toLowerCase();
  if (normalizedServiceId && SERVICE_ALIASES[normalizedServiceId]) {
    const contentId = SERVICE_ALIASES[normalizedServiceId];
    return { contentId, ...SMART_VISIONS_CATALOG_ITEMS[contentId], source: 'SERVICE_ID' as const };
  }

  const message = input.message?.trim();
  if (!message) return null;
  const matches = EXPLICIT_SERVICE_PATTERNS.filter(({ pattern }) => pattern.test(message));
  const uniqueContentIds = [...new Set(matches.map(({ contentId }) => contentId))];
  if (uniqueContentIds.length !== 1) return null;

  const contentId = uniqueContentIds[0];
  return { contentId, ...SMART_VISIONS_CATALOG_ITEMS[contentId], source: 'EXPLICIT_MESSAGE' as const };
}
