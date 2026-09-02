import type { ServiceKnowledgeSnapshot } from './contracts';

export type CanonicalQuoteSource = 'LEAD_RECOMMENDED_OFFER' | 'GROWTH_OPPORTUNITY';

export type CanonicalLeadQuote = {
  serviceId: string;
  price: number;
  currency: string;
  source: CanonicalQuoteSource;
};

function canonicalServiceQuote(
  serviceId: string | null | undefined,
  serviceKnowledge: ServiceKnowledgeSnapshot[],
  countryCode: string,
) {
  const normalizedServiceId = String(serviceId ?? '').trim();
  if (!normalizedServiceId) return null;
  const service = serviceKnowledge.find((item) => item.id === normalizedServiceId);
  const marketPrice = service?.marketPrice;
  if (!marketPrice) return null;
  if (marketPrice.countryCode.trim().toUpperCase() !== countryCode.trim().toUpperCase()) return null;
  if (!marketPrice.currency || !Number.isFinite(marketPrice.price) || marketPrice.price < 0) return null;
  return { serviceId: normalizedServiceId, price: marketPrice.price, currency: marketPrice.currency };
}

export function resolveCanonicalLeadQuote(input: {
  countryCode?: string;
  serviceKnowledge?: ServiceKnowledgeSnapshot[];
  leadRecommendedOffer?: string | null;
  growthOpportunityServiceId?: string | null;
  growthOpportunityCatalogReady?: boolean | null;
}): CanonicalLeadQuote | null {
  const countryCode = String(input.countryCode ?? '').trim().toUpperCase();
  const serviceKnowledge = input.serviceKnowledge ?? [];
  if (!countryCode || serviceKnowledge.length === 0) return null;

  const leadQuote = canonicalServiceQuote(input.leadRecommendedOffer, serviceKnowledge, countryCode);
  if (leadQuote) return { ...leadQuote, source: 'LEAD_RECOMMENDED_OFFER' };

  if (input.growthOpportunityCatalogReady !== true) return null;
  const opportunityQuote = canonicalServiceQuote(input.growthOpportunityServiceId, serviceKnowledge, countryCode);
  if (!opportunityQuote) return null;
  return { ...opportunityQuote, source: 'GROWTH_OPPORTUNITY' };
}
