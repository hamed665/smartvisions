import { describe, expect, it } from 'vitest';
import { agentInstructionsForContext } from '@/lib/agents/openai-runtime-core';
import { classifyWebsiteUri } from '@/lib/hunters/business/selective-enrichment';
import { effectiveCampaignStatus } from '@/lib/reliability/operational-truth';
import { buildCanonicalFirstTouchDraft } from '@/lib/outreach/message-plan';

describe('Hunter controlled readiness', () => {
  it('keeps car-care sales guidance scoped to Sahra', () => {
    for (const agent of ['sales_marketing', 'secretary', 'intent_discovery', 'evidence_checker', 'relevance_checker'] as const) {
      const generic = agentInstructionsForContext(agent, { message: 'We need a salon website' });
      expect(generic).not.toMatch(/car-care|vehicle|car model|seat count|automotive|car make|car or/i);
    }
    expect(agentInstructionsForContext('sales_marketing', { message: 'Hello', servingBusiness: { name: 'Sahra', countryCode: 'OM' } })).toContain('car-care');
  });
  it.each(['https://noona.app/my-salon/book', 'https://n123.alteg.io/', 'https://mysalon.salonist.io/booking-online'])('recognizes an existing hosted booking presence: %s', url => {
    expect(classifyWebsiteUri(url)).toBe('CONTACT_ONLY');
  });
  it.each(['https://salonist.io.evil.test', 'https://evilalteg.io', 'https://my-noona.app', 'https://salon.om'])('does not collapse a real or lookalike domain: %s', url => {
    expect(classifyWebsiteUri(url)).toBe('STANDALONE');
  });
  it('shows expired campaign targets using the market day boundary', () => {
    expect(effectiveCampaignStatus({ status: 'RUNNING', config: { marketCode: 'OM', targetDate: '2026-10-30' }, now: new Date('2026-10-30T20:01:00Z') }))
      .toEqual({ status: 'PAUSED', reason: 'TARGET_DATE_EXPIRED' });
    expect(effectiveCampaignStatus({ status: 'RUNNING', config: { marketCode: 'OM', targetDate: '2026-10-31' }, now: new Date('2026-10-30T20:01:00Z') }).status).toBe('RUNNING');
    expect(effectiveCampaignStatus({ status: 'DRAFT', config: { marketCode: 'OM', targetDate: '2026-10-30' }, now: new Date('2026-10-31T00:00:00Z') }).status).toBe('DRAFT');
  });
  it('uses service-relevant website value without claiming the salon has no booking', () => {
    const draft = buildCanonicalFirstTouchDraft({ marketCode: 'OM', businessName: 'A Salon', industry: 'beauty salon',
      evidence: ['No standalone website is currently known.'], recommendedOffer: 'business_website' });
    expect(draft.text).toContain('services and link to your existing booking');
    expect(draft.sections.arabic).toContain('خدماتكم');
    expect(draft.text).not.toContain('no booking');
    expect(draft.text).not.toMatch(/guarantee|increase revenue|free preview/i);
  });
});
