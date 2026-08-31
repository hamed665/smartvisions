import { describe, expect, it } from 'vitest';
import { resolveSmartVisionsCatalogRecommendation } from '@/lib/whatsapp/catalog';
import { processInboundMessage } from '@/lib/agents/pipeline';
import { deterministicAgentRuntime } from '@/lib/agents/runtime';

describe('WhatsApp catalog recommendation bridge', () => {
  it('maps canonical Growth OS service IDs to the production catalog', () => {
    expect(resolveSmartVisionsCatalogRecommendation({ serviceId: 'business_website' })?.contentId).toBe('SV-WEB-001');
    expect(resolveSmartVisionsCatalogRecommendation({ serviceId: 'whatsapp_ai_setup' })?.contentId).toBe('SV-WA-001');
    expect(resolveSmartVisionsCatalogRecommendation({ serviceId: 'ai_reels_8' })?.contentId).toBe('SV-IG-CONTENT-001');
  });

  it('recognizes one explicit service request without guessing', () => {
    expect(resolveSmartVisionsCatalogRecommendation({ message: 'I need WhatsApp automation for my clinic' })?.contentId).toBe('SV-WA-001');
    expect(resolveSmartVisionsCatalogRecommendation({ message: 'احتاج إدارة وسائل التواصل للمطعم' })?.contentId).toBe('SV-SM-001');
  });

  it('fails closed when a message clearly mentions multiple catalog services', () => {
    expect(resolveSmartVisionsCatalogRecommendation({ message: 'I need a website and WhatsApp automation' })).toBeNull();
  });

  it('does not recommend a product for vague intent', () => {
    expect(resolveSmartVisionsCatalogRecommendation({ message: 'Tell me what you can do for my business' })).toBeNull();
  });

  it('surfaces the recommendation on a reviewable agent result', async () => {
    const result = await processInboundMessage({
      message: 'I need a website for my dental clinic',
      countryCode: 'OM',
      industry: 'dental',
      businessName: 'Example Dental',
      intentScore: 55,
      shadowMode: true,
      verifiedEvidence: ['Customer explicitly requested a website.'],
    }, { agentsPaused: false }, deterministicAgentRuntime);

    expect(result.trace.delivery).toBe('REVIEW');
    expect(result.catalogRecommendation?.contentId).toBe('SV-WEB-001');
    expect(result.trace.catalogRecommendation).toEqual(result.catalogRecommendation);
  });
});
