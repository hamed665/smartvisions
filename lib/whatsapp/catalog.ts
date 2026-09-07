export const SMART_VISIONS_WHATSAPP_CATALOG_ID = '1773319100642340';

// These are Meta Commerce product identities, not a second Growth OS pricing table.
// Customer-facing quote amounts continue to come only from canonical service_prices.
export const SMART_VISIONS_CATALOG_ITEMS = {
  'SV-IG-CONTENT-001': { serviceKey: 'instagram_content', label: 'Content & Reels / صناعة المحتوى والريلز' },
  'SV-SM-001': { serviceKey: 'social_media_management', label: 'Social Media Management / إدارة حسابات التواصل الاجتماعي' },
  'SV-WEB-001': { serviceKey: 'website_design', label: 'Business Website / تصميم وتطوير موقع احترافي' },
  'SV-SEO-001': { serviceKey: 'seo_geo', label: 'Google Visibility & SEO / SEO والظهور في جوجل' },
  'SV-WA-001': { serviceKey: 'whatsapp_automation', label: 'WhatsApp Automation / أتمتة واتساب للأعمال' },
  'SV-BIZ-AUTO-001': { serviceKey: 'business_automation', label: 'Business Automation / أتمتة الأعمال والعمليات' },
  'SV-AI-AGENT-001': { serviceKey: 'ai_agents', label: 'AI Agent for Business / موظف ذكي بالذكاء الاصطناعي لنشاطك' },
} as const;

export type SmartVisionsCatalogContentId = keyof typeof SMART_VISIONS_CATALOG_ITEMS;

const SERVICE_ALIASES: Record<string, SmartVisionsCatalogContentId> = {
  instagram_content: 'SV-IG-CONTENT-001',
  ai_reels_4: 'SV-IG-CONTENT-001',
  ai_reels_8: 'SV-IG-CONTENT-001',
  custom_content_production: 'SV-IG-CONTENT-001',
  social_media_management: 'SV-SM-001',
  website_design: 'SV-WEB-001',
  business_website: 'SV-WEB-001',
  premium_bilingual_website: 'SV-WEB-001',
  custom_website: 'SV-WEB-001',
  seo_geo: 'SV-SEO-001',
  seo_growth: 'SV-SEO-001',
  whatsapp_automation: 'SV-WA-001',
  whatsapp_ai_setup: 'SV-WA-001',
  business_automation: 'SV-BIZ-AUTO-001',
  workflow_automation: 'SV-BIZ-AUTO-001',
  ai_agents: 'SV-AI-AGENT-001',
  ai_agent: 'SV-AI-AGENT-001',
};

const EXPLICIT_SERVICE_PATTERNS: Array<{ contentId: SmartVisionsCatalogContentId; pattern: RegExp }> = [
  { contentId: 'SV-IG-CONTENT-001', pattern: /\b(instagram content|content creation|instagram reels?|reels? package)\b|محتوى\s*(انستغرام|إنستغرام)|ريلز\s*انستغرام|تولید\s*محتوا|ریلز\s*اینستاگرام/i },
  { contentId: 'SV-SM-001', pattern: /\b(social media management|manage (my|our) social media|social media manager)\b|إدارة\s*وسائل\s*التواصل|إدارة\s*حسابات\s*التواصل|مدیریت\s*شبکه(\s|‌)*های\s*اجتماعی/i },
  { contentId: 'SV-WEB-001', pattern: /\b(website|web site|web design|website design|website development|business website)\b|موقع\s*(إلكتروني|الكتروني)?|تصميم\s*وتطوير\s*موقع|طراحی\s*سایت|وب\s*سایت/i },
  { contentId: 'SV-SEO-001', pattern: /\b(SEO|GEO|google visibility|search engine optimization|generative engine optimization)\b|تحسين\s*محركات\s*البحث|الظهور\s*في\s*جوجل|سئو/i },
  { contentId: 'SV-WA-001', pattern: /\b(whatsapp automation|whatsapp ai|whatsapp bot)\b|أتمتة\s*واتساب|واتساب\s*(آلي|ذكي|بوت)|اتوماسیون\s*واتساپ|ربات\s*واتساپ/i },
  { contentId: 'SV-BIZ-AUTO-001', pattern: /\b(business automation|workflow automation|process automation|automate (?:my|our) business)\b|أتمتة\s*(?:الأعمال|العمليات)|اتوماسیون\s*(?:کسب|فرآیند|فرایند)/i },
  { contentId: 'SV-AI-AGENT-001', pattern: /\b(ai agents?|ai sales agent|ai assistant|chatbot|ai employee)\b|وكيل\s*(ذكاء\s*اصطناعي|ذكي)|مساعد\s*ذكي|موظف\s*ذكي|ایجنت\s*هوش\s*مصنوعی|چت\s*بات/i },
];

// Keep an explicit quarantine primitive for future provider-side eligibility drift.
// The approved seven-item Meta catalog is currently eligible, so the set is empty.
const CATALOG_SEND_QUARANTINE = new Set<SmartVisionsCatalogContentId>();

const REJECTION_PATTERNS: Partial<Record<SmartVisionsCatalogContentId, RegExp[]>> = {
  'SV-IG-CONTENT-001': [
    /\b(?:don['’]?t|dont|do not|not|no longer)\s+(?:want|need|require|looking for|interested in)?\s*(?:instagram\s+)?(?:content|reels?)\b/i,
  ],
  'SV-SM-001': [
    /\b(?:don['’]?t|dont|do not|not|no longer)\s+(?:want|need|require|looking for|interested in)?\s*(?:social media management|social media manager)\b/i,
  ],
  'SV-WEB-001': [
    /\b(?:don['’]?t|dont|do not|not|no longer)\s+(?:want|need|require|looking for|interested in)?\s*(?:a\s+)?(?:website|web site|web design|website design|website development)\b/i,
    /\bwithout\s+(?:a\s+)?(?:website|web site)\b/i,
    /(?:لا|ما)\s*(?:أريد|اريد|أحتاج|احتاج)\s*(?:موقع|موقع إلكتروني|موقع الكتروني)/i,
    /(?:نمی[‌\s-]?(?:خوام|خواهم)|نیازی\s+به)\s*(?:وب[‌\s-]?سایت|سایت)/i,
  ],
  'SV-SEO-001': [
    /\b(?:don['’]?t|dont|do not|not|no longer)\s+(?:want|need|require|looking for|interested in)?\s*(?:seo|geo|google visibility)\b/i,
  ],
  'SV-WA-001': [
    /\b(?:don['’]?t|dont|do not|not|no longer)\s+(?:want|need|require|looking for|interested in)?\s*(?:whatsapp\s+(?:automation|ai|bot))\b/i,
  ],
  'SV-BIZ-AUTO-001': [
    /\b(?:don['’]?t|dont|do not|not|no longer)\s+(?:want|need|require|looking for|interested in)?\s*(?:business automation|workflow automation|process automation)\b/i,
  ],
  'SV-AI-AGENT-001': [
    /\b(?:don['’]?t|dont|do not|not|no longer)\s+(?:want|need|require|looking for|interested in)?\s*(?:an?\s+)?(?:ai agent|ai assistant|chatbot|ai employee)\b/i,
  ],
};

const DIRECT_PRICE_QUESTION = /\b(?:price|cost|how much|pricing)\b|(?:السعر|سعر|كم\s+(?:السعر|يكلف|تكلف)|تكلفة)|(?:قیمت|چقدر|هزینه)/i;

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

  // Meta controls the price rendered on a product card, while Growth OS quotes use
  // canonical service_prices. Never attach an automatic product card to a direct price
  // answer because the two offer surfaces intentionally have separate commercial scopes.
  if (message && DIRECT_PRICE_QUESTION.test(message)) return null;

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
