import type { ServiceKnowledgeSnapshot } from './contracts';
import { salesServiceKeyForCanonicalId } from '@/lib/conversations/service-key';

export type CanonicalQuoteSource = 'LEAD_RECOMMENDED_OFFER' | 'GROWTH_OPPORTUNITY' | 'CUSTOMER_SELECTED_SERVICE';

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
  selectedServiceKey?: string;
  customQuoteRequired?: boolean;
}): CanonicalLeadQuote | null {
  const countryCode = String(input.countryCode ?? '').trim().toUpperCase();
  const serviceKnowledge = input.serviceKnowledge ?? [];
  if (!countryCode || serviceKnowledge.length === 0) return null;
  if (input.customQuoteRequired) return null;

  const selected = input.selectedServiceKey;
  const eligible = selected
    ? serviceKnowledge.filter((service) => salesServiceKeyForCanonicalId(service.id) === selected)
    : serviceKnowledge;
  // Never answer a new service question with the old prospecting recommendation.
  if (selected && eligible.length === 1) {
    const requested = canonicalServiceQuote(eligible[0].id, eligible, countryCode);
    return requested ? { ...requested, source: 'CUSTOMER_SELECTED_SERVICE' } : null;
  }

  const leadQuote = canonicalServiceQuote(input.leadRecommendedOffer, eligible, countryCode);
  if (leadQuote) return { ...leadQuote, source: 'LEAD_RECOMMENDED_OFFER' };

  if (input.growthOpportunityCatalogReady !== true) return null;
  const opportunityQuote = canonicalServiceQuote(input.growthOpportunityServiceId, eligible, countryCode);
  if (!opportunityQuote) return null;
  return { ...opportunityQuote, source: 'GROWTH_OPPORTUNITY' };
}
