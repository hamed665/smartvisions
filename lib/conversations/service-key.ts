export type SalesServiceKey =
  | 'CONTENT_REELS'
  | 'SOCIAL_MEDIA_MANAGEMENT'
  | 'BUSINESS_WEBSITE'
  | 'SEO'
  | 'WHATSAPP_AUTOMATION'
  | 'BUSINESS_AUTOMATION'
  | 'AI_AGENT';

const EXACT_SERVICE_KEY_BY_ID: Record<string, SalesServiceKey> = {
  ai_reels_4: 'CONTENT_REELS',
  ai_reels_8: 'CONTENT_REELS',
  custom_content_production: 'CONTENT_REELS',
  business_website: 'BUSINESS_WEBSITE',
  custom_website: 'BUSINESS_WEBSITE',
  premium_bilingual_website: 'BUSINESS_WEBSITE',
  seo_growth: 'SEO',
  whatsapp_ai_setup: 'WHATSAPP_AUTOMATION',
};

export function salesServiceKeyForCanonicalId(serviceId?: string | null) {
  const id = String(serviceId ?? '').trim().toLowerCase();
  return id ? EXACT_SERVICE_KEY_BY_ID[id] : undefined;
}

export function isRejectedCanonicalService(serviceId: string | null | undefined, rejectedKeys: string[] = []) {
  const key = salesServiceKeyForCanonicalId(serviceId);
  return Boolean(key && rejectedKeys.includes(key));
}
