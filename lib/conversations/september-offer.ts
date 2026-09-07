import { salesServiceKeyForCanonicalId, type SalesServiceKey } from './service-key';

export const SEPTEMBER_2026_OFFER = {
  campaignId: 'SEPTEMBER_2026_OMAN_CHAT',
  marketCode: 'OM',
  startsAt: '2026-09-01T00:00:00+04:00',
  endsAtExclusive: '2026-10-01T00:00:00+04:00',
  surface: 'CHAT_ONLY',
  discounts: {
    CONTENT_REELS: 25,
    SOCIAL_MEDIA_MANAGEMENT: 20,
    BUSINESS_WEBSITE: 20,
    SEO: 25,
    WHATSAPP_AUTOMATION: 15,
    BUSINESS_AUTOMATION: 15,
    AI_AGENT: 0,
  } satisfies Record<SalesServiceKey, number>,
} as const;

const SALES_SERVICE_KEYS = new Set<SalesServiceKey>(Object.keys(SEPTEMBER_2026_OFFER.discounts) as SalesServiceKey[]);

function normalizeSalesServiceKey(value?: string | null): SalesServiceKey | undefined {
  const normalized = String(value ?? '').trim().toUpperCase() as SalesServiceKey;
  return SALES_SERVICE_KEYS.has(normalized) ? normalized : undefined;
}

export function hasSeptemberOfferRevealIntent(input: {
  message: string;
  stage?: string | null;
  intentScore?: number;
}) {
  const message = input.message.trim();
  const explicitCommercial = /\b(?:price|pricing|cost|how much|discount|best price|last price|offer|deal)\b|(?:السعر|سعر|تكلفة|خصم|تخفيض|عرض|آخر سعر)|(?:قیمت|هزینه|تخفیف|آفر|پیشنهاد)/i.test(message);
  const buyingStage = ['HOT', 'CLOSING'].includes(String(input.stage ?? '').toUpperCase());
  return explicitCommercial || buyingStage || Number(input.intentScore ?? 0) >= 70;
}

export function resolveSeptember2026Offer(input: {
  countryCode?: string | null;
  serviceId?: string | null;
  selectedService?: string | null;
  message: string;
  stage?: string | null;
  intentScore?: number;
  now?: Date;
}) {
  if (String(input.countryCode ?? '').trim().toUpperCase() !== SEPTEMBER_2026_OFFER.marketCode) return null;
  const now = input.now ?? new Date();
  const startsAt = new Date(SEPTEMBER_2026_OFFER.startsAt);
  const endsAt = new Date(SEPTEMBER_2026_OFFER.endsAtExclusive);
  if (now < startsAt || now >= endsAt) return null;

  const serviceKey = salesServiceKeyForCanonicalId(input.serviceId) ?? normalizeSalesServiceKey(input.selectedService);
  if (!serviceKey) return null;

  const discountPct = SEPTEMBER_2026_OFFER.discounts[serviceKey];
  return {
    campaignId: SEPTEMBER_2026_OFFER.campaignId,
    surface: SEPTEMBER_2026_OFFER.surface,
    serviceKey,
    discountPct,
    noDiscount: discountPct === 0,
    reveal: hasSeptemberOfferRevealIntent({ message: input.message, stage: input.stage, intentScore: input.intentScore }),
    startsAt: SEPTEMBER_2026_OFFER.startsAt,
    endsAtExclusive: SEPTEMBER_2026_OFFER.endsAtExclusive,
  } as const;
}

export function applyPercentageDiscount(price: number, discountPct: number) {
  return Math.round(Number(price) * (1 - Number(discountPct) / 100) * 100) / 100;
}
