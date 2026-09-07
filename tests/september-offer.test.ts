import { describe, expect, it } from 'vitest';
import { applyPercentageDiscount, resolveSeptember2026Offer, SEPTEMBER_2026_OFFER } from '@/lib/conversations/september-offer';
import { evaluateCanonicalQuote } from '@/lib/outreach/canonical-pricing';

describe('September 2026 Oman chat offer', () => {
  const now = new Date('2026-09-07T12:00:00+04:00');

  it('uses the approved 15-25% service ladder and keeps AI Agent undiscounted', () => {
    expect(SEPTEMBER_2026_OFFER.discounts).toEqual({
      CONTENT_REELS: 25,
      SOCIAL_MEDIA_MANAGEMENT: 20,
      BUSINESS_WEBSITE: 20,
      SEO: 25,
      WHATSAPP_AUTOMATION: 15,
      BUSINESS_AUTOMATION: 15,
      AI_AGENT: 0,
    });
  });

  it('reveals the offer in Oman when a lead asks price', () => {
    expect(resolveSeptember2026Offer({ countryCode: 'OM', serviceId: 'seo_growth', message: 'How much is SEO?', now }))
      .toMatchObject({ discountPct: 25, reveal: true, surface: 'CHAT_ONLY', serviceKey: 'SEO' });
  });

  it('prefers the customer current selection over an older quoted service', () => {
    expect(resolveSeptember2026Offer({
      countryCode: 'OM',
      serviceId: 'seo_growth',
      selectedService: 'WHATSAPP_AUTOMATION',
      message: 'What is the price for WhatsApp automation?',
      now,
    })).toMatchObject({ discountPct: 15, serviceKey: 'WHATSAPP_AUTOMATION', reveal: true });
  });

  it('does not expose the offer on a generic first-touch message', () => {
    expect(resolveSeptember2026Offer({ countryCode: 'OM', serviceId: 'business_website', message: 'Tell me about your services', now }))
      .toMatchObject({ discountPct: 20, reveal: false });
  });

  it('supports catalog-only service keys without inventing a canonical price', () => {
    expect(resolveSeptember2026Offer({ countryCode: 'OM', selectedService: 'BUSINESS_AUTOMATION', message: 'Any September offer?', now }))
      .toMatchObject({ discountPct: 15, reveal: true, serviceKey: 'BUSINESS_AUTOMATION' });
  });

  it('keeps AI Agent at zero discount', () => {
    expect(resolveSeptember2026Offer({ countryCode: 'OM', selectedService: 'AI_AGENT', message: 'Do you have a discount?', now }))
      .toMatchObject({ discountPct: 0, noDiscount: true, reveal: true });
  });

  it('expires automatically outside September and never applies outside Oman', () => {
    expect(resolveSeptember2026Offer({ countryCode: 'OM', serviceId: 'seo_growth', message: 'price?', now: new Date('2026-10-01T00:00:00+04:00') })).toBeNull();
    expect(resolveSeptember2026Offer({ countryCode: 'AE', serviceId: 'seo_growth', message: 'price?', now })).toBeNull();
  });

  it('calculates campaign prices deterministically', () => {
    expect(applyPercentageDiscount(149, 25)).toBe(111.75);
    expect(applyPercentageDiscount(199, 15)).toBe(169.15);
  });

  it('allows only the explicitly authorized campaign discount to cross normal discount ceilings', () => {
    const common = {
      serviceId: 'seo_growth',
      serviceName: 'SEO Growth',
      servicePrice: 149,
      currency: 'OMR',
      minimumPrice: 135,
      maxAutoDiscountPct: 5,
      maxDiscountWithApprovalPct: 10,
    };
    expect(evaluateCanonicalQuote({ ...common, requestedDiscountPct: 25 })).toMatchObject({ allowed: false });
    expect(evaluateCanonicalQuote({
      ...common,
      requestedDiscountPct: 25,
      authorizedCampaignDiscountPct: 25,
      authorizedCampaignId: SEPTEMBER_2026_OFFER.campaignId,
    })).toMatchObject({ allowed: true, finalPrice: 111.75, reason: 'authorized_campaign_quote', campaignId: SEPTEMBER_2026_OFFER.campaignId });
  });

  it('does not discount add-ons when applying the package campaign', () => {
    expect(evaluateCanonicalQuote({
      serviceId: 'business_website',
      serviceName: 'Business Website',
      servicePrice: 179,
      currency: 'OMR',
      minimumPrice: 0,
      maxAutoDiscountPct: 5,
      maxDiscountWithApprovalPct: 10,
      requestedDiscountPct: 20,
      authorizedCampaignDiscountPct: 20,
      authorizedCampaignId: SEPTEMBER_2026_OFFER.campaignId,
      addons: [{ addonId: 'x', name: 'Addon', price: 20 }],
    })).toMatchObject({ allowed: true, finalPrice: 163.2 });
  });
});
