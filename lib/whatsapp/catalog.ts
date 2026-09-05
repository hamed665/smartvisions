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

// Meta renders catalog price from Commerce Manager rather than Growth OS canonical
// pricing. The website product currently has stale Meta pricing, so it stays quarantined
// from automated or controlled catalog sends until price parity is explicitly re-verified.
const CATALOG_SEND_QUARANTINE = new Set<SmartVisionsCatalogContentId>(['SV-WEB-001']);

const REJECTION_PATTERNS: Partial<Record<SmartVisionsCatalogContentId, RegExp[]>> = {
  'SV-WEB-001': [
    /\b(?:don['’]?t|dont|do not|not|no longer)\s+(?:want|need|require|looking for|interested in)?\s*(?:a\s+)?(?:website|web site|web design|website design|website development)\b/i,
    /\bwithout\s+(?:a\s+)?(?:website|web site)\b/i,
    /(?:لا|ما)\s*(?:أريد|اريد|أحتاج|احتاج)\s*(?:موقع|موقع إلكتروني|موقع الكتروني)/i,
    /(?:نمی[‌\s-]?(?:خوام|خواهم)|نیازی\s+به)\s*(?:وب[‌\s-]?سایت|سایت)/i,
  ],
  'SV-IG-CONTENT-001': [
    /\b(?:don['’]?t|dont|do not|not|no longer)\s+(?:want|need|require|looking for|interested in)?\s*(?:instagram\s+)?(?:content|reels?)\b/i,
  ],
  'SV-WA-001': [
    /\b(?:don['’]?t|dont|do not|not|no longer)\s+(?:want|need|require|looking for|interested in)?\s*(?:whatsapp\s+(?:automation|ai|bot))\b/i,
  ],
  'SV-SEO-001': [
    /\b(?:don['’]?t|dont|do not|not|no longer)\s+(?:want|need|require|looking for|interested in)?\s*(?:seo|geo)\b/i,
  ],
  'SV-AI-AGENT-001': [
    /\b(?:don['’]?t|dont|do not|not|no longer)\s+(?:want|need|require|looking for|interested in)?\s*(?:an?\s+)?(?:ai agent|ai assistant|chatbot)\b/i,
  ],
  'SV-SM-001': [
    /\b(?:don['’]?t|dont|do not|not|no longer)\s+(?:want|need|require|looking for|interested in)?\s*(?:social media management|social media manager)\b/i,
  ],
};

export function resolveWhatsAppCatalogId() {
  return process.env.META_WHATSAPP_CATALOG_ID?.trim()
    || process.env.WHATSAPP_CATALOG_ID?.trim()
    || SMART_VISIONS_WHATSAPP_CATALOG_ID;
}

export function isSmartVisionsCatalogContentId(value: unknown): value is SmartVisionsCatalogContentId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SMART_VISIONS_CATALOG_ITEMS, value);
}

export function isSmartVisionsCatalogContentVerifiedForSend(value: unknown): value is SmartVisionsCatalogContentId {
  return isSmartVisionsCatalogContentId(value) && !CATALOG_SEND_QUARANTINE.has(value);
}

export function assertSmartVisionsCatalogContentId(value: unknown): asserts value is SmartVisionsCatalogContentId {
  if (!isSmartVisionsCatalogContentId(value)) {
    throw new Error('Unknown Smart Visions WhatsApp catalog content ID');
  }
}

export function getSmartVisionsCatalogItem(contentId: SmartVisionsCatalogContentId) {
  return SMART_VISIONS_CATALOG_ITEMS[contentId];
}

function explicitlyRejects(contentId: SmartVisionsCatalogContentId, message: string) {
  return (REJECTION_PATTERNS[contentId] ?? []).some((pattern) => pattern.test(message));
}

function safeRecommendation(contentId: SmartVisionsCatalogContentId, message: string | undefined, source: 'SERVICE_ID' | 'EXPLICIT_MESSAGE') {
  if (message && explicitlyRejects(contentId, message)) return null;
  if (!isSmartVisionsCatalogContentVerifiedForSend(contentId)) return null;
  return { contentId, ...SMART_VISIONS_CATALOG_ITEMS[contentId], source };
}

export function resolveSmartVisionsCatalogRecommendation(input: { serviceId?: string | null; message?: string | null }) {
  const message = input.message?.trim();
  const normalizedServiceId = input.serviceId?.trim().toLowerCase();
  if (normalizedServiceId && SERVICE_ALIASES[normalizedServiceId]) {
    return safeRecommendation(SERVICE_ALIASES[normalizedServiceId], message, 'SERVICE_ID');
  }

  if (!message) return null;
  const matches = EXPLICIT_SERVICE_PATTERNS
    .filter(({ pattern }) => pattern.test(message))
    .filter(({ contentId }) => !explicitlyRejects(contentId, message));
  const uniqueContentIds = [...new Set(matches.map(({ contentId }) => contentId))];
  if (uniqueContentIds.length !== 1) return null;

  return safeRecommendation(uniqueContentIds[0], message, 'EXPLICIT_MESSAGE');
}
