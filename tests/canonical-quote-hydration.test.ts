import { describe, expect, it } from 'vitest';
import { resolveCanonicalLeadQuote } from '@/lib/agents/canonical-quote';
import { buildSelectiveRoutePlan } from '@/lib/agents/selective-routing';
import type { ServiceKnowledgeSnapshot } from '@/lib/agents/contracts';

const services: ServiceKnowledgeSnapshot[] = [
  {
    id: 'seo_growth',
    name: 'SEO Growth',
    marketPrice: {
      countryCode: 'OM',
      currency: 'OMR',
      price: 149,
      minimumPrice: 135,
      maxAutoDiscountPct: 5,
      maxDiscountWithApprovalPct: 10,
    },
  },
  {
    id: 'business_website',
    name: 'Business Website',
    marketPrice: {
      countryCode: 'OM',
      currency: 'OMR',
      price: 179,
      minimumPrice: 0,
      maxAutoDiscountPct: 5,
      maxDiscountWithApprovalPct: 10,
    },
  },
];

describe('canonical lead quote hydration', () => {
  it('uses a Lead recommended_offer only when a matching service_prices row is already hydrated', () => {
    const quote = resolveCanonicalLeadQuote({
      countryCode: 'OM',
      serviceKnowledge: services,
      leadRecommendedOffer: 'seo_growth',
    });

    expect(quote).toEqual({
      serviceId: 'seo_growth',
      price: 149,
      currency: 'OMR',
      source: 'LEAD_RECOMMENDED_OFFER',
    });
  });

  it('falls back to the unique catalog-ready Growth Opportunity without guessing a service', () => {
    const quote = resolveCanonicalLeadQuote({
      countryCode: 'OM',
      serviceKnowledge: services,
      leadRecommendedOffer: null,
      growthOpportunityServiceId: 'business_website',
      growthOpportunityCatalogReady: true,
    });

    expect(quote).toEqual({
      serviceId: 'business_website',
      price: 179,
      currency: 'OMR',
      source: 'GROWTH_OPPORTUNITY',
    });
  });

  it('refuses opportunity fallback when the catalog is not ready or market pricing is missing', () => {
    expect(resolveCanonicalLeadQuote({
      countryCode: 'OM',
      serviceKnowledge: services,
      growthOpportunityServiceId: 'business_website',
      growthOpportunityCatalogReady: false,
    })).toBeNull();

    expect(resolveCanonicalLeadQuote({
      countryCode: 'AE',
      serviceKnowledge: services,
      leadRecommendedOffer: 'seo_growth',
      growthOpportunityServiceId: 'business_website',
      growthOpportunityCatalogReady: true,
    })).toBeNull();
  });

  it('turns a simple canonical price question into ZERO_COST with no planned LLM call', () => {
    const quote = resolveCanonicalLeadQuote({
      countryCode: 'OM',
      serviceKnowledge: services,
      leadRecommendedOffer: 'seo_growth',
    });
    expect(quote).not.toBeNull();

    const route = buildSelectiveRoutePlan({
      message: 'How much does this service cost?',
      countryCode: 'OM',
      serviceKnowledge: services,
      quotedService: quote!.serviceId,
      quotedPrice: quote!.price,
      quotedCurrency: quote!.currency,
    });

    expect(route.tier).toBe('ZERO_COST');
    expect(route.estimatedLlmCalls).toBe(0);
    expect(route.paidAgents).toEqual([]);
    expect(route.reasons).toContain('CONFIGURED_PRICE_ALREADY_AVAILABLE');
  });
});
