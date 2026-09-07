import { describe, expect, it } from 'vitest';
import {
  getSmartVisionsCatalogItem,
  isSmartVisionsCatalogContentVerifiedForSend,
  resolveSmartVisionsCatalogRecommendation,
} from '@/lib/whatsapp/catalog';
import { processInboundMessage } from '@/lib/agents/pipeline';
import { deterministicAgentRuntime } from '@/lib/agents/runtime';

describe('WhatsApp catalog recommendation bridge', () => {
  it('maps canonical service IDs to the approved Meta catalog without duplicating pricing', () => {
    expect(getSmartVisionsCatalogItem('SV-WEB-001').serviceKey).toBe('website_design');
    expect(isSmartVisionsCatalogContentVerifiedForSend('SV-WEB-001')).toBe(true);
    expect(resolveSmartVisionsCatalogRecommendation({ serviceId: 'business_website' })?.contentId).toBe('SV-WEB-001');
    expect(resolveSmartVisionsCatalogRecommendation({ serviceId: 'whatsapp_ai_setup' })?.contentId).toBe('SV-WA-001');
    expect(resolveSmartVisionsCatalogRecommendation({ serviceId: 'ai_reels_8' })?.contentId).toBe('SV-IG-CONTENT-001');
    expect(resolveSmartVisionsCatalogRecommendation({ serviceId: 'custom_content_production' })?.contentId).toBe('SV-IG-CONTENT-001');
    expect(resolveSmartVisionsCatalogRecommendation({ serviceId: 'seo_growth' })?.contentId).toBe('SV-SEO-001');
    expect(resolveSmartVisionsCatalogRecommendation({ serviceId: 'business_automation' })?.contentId).toBe('SV-BIZ-AUTO-001');
  });

  it('recognizes one explicit verified service request without guessing', () => {
    expect(resolveSmartVisionsCatalogRecommendation({ message: 'I need WhatsApp automation for my clinic' })?.contentId).toBe('SV-WA-001');
    expect(resolveSmartVisionsCatalogRecommendation({ message: 'احتاج إدارة حسابات التواصل للمطعم' })?.contentId).toBe('SV-SM-001');
    expect(resolveSmartVisionsCatalogRecommendation({ message: 'We need business automation for our processes' })?.contentId).toBe('SV-BIZ-AUTO-001');
  });

  it('never recommends a service the customer explicitly rejected', () => {
    expect(resolveSmartVisionsCatalogRecommendation({ message: "I don't want website" })).toBeNull();
    expect(resolveSmartVisionsCatalogRecommendation({
      serviceId: 'business_website',
      message: "I don't want website",
    })).toBeNull();
    expect(resolveSmartVisionsCatalogRecommendation({
      message: "I don't want website, I need WhatsApp automation",
    })?.contentId).toBe('SV-WA-001');
  });

  it('fails closed when a message clearly mentions multiple catalog services', () => {
    expect(resolveSmartVisionsCatalogRecommendation({ message: 'I need WhatsApp automation and SEO' })).toBeNull();
  });

  it('does not recommend a product for vague intent', () => {
    expect(resolveSmartVisionsCatalogRecommendation({ message: 'Tell me what you can do for my business' })).toBeNull();
  });

  it('suppresses automatic product cards on direct price questions', () => {
    expect(resolveSmartVisionsCatalogRecommendation({
      serviceId: 'business_website',
      message: 'How much does the website cost?',
    })).toBeNull();
    expect(resolveSmartVisionsCatalogRecommendation({ message: 'كم سعر أتمتة واتساب؟' })).toBeNull();
    expect(resolveSmartVisionsCatalogRecommendation({ message: 'قیمت سئو چقدره؟' })).toBeNull();
  });

  it('surfaces only a send-verified recommendation on a reviewable agent result', async () => {
    const result = await processInboundMessage({
      message: 'I need WhatsApp automation for my dental clinic',
      countryCode: 'OM',
      industry: 'dental',
      businessName: 'Example Dental',
      intentScore: 55,
      shadowMode: true,
      verifiedEvidence: ['Customer explicitly requested WhatsApp automation.'],
    }, { agentsPaused: false }, deterministicAgentRuntime);

    expect(result.trace.delivery).toBe('REVIEW');
    expect(result.catalogRecommendation?.contentId).toBe('SV-WA-001');
    expect(result.trace.catalogRecommendation).toEqual(result.catalogRecommendation);
  });
});
