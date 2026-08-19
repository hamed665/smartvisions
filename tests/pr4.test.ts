import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { routeAgents } from '@/lib/agents/router';
import { processInboundMessage } from '@/lib/agents/pipeline';
import { canAutoSend, evaluateHandoff } from '@/lib/handoff/policy';
import { generatePreview, isPreviewEligible } from '@/lib/preview/engine';
import { evaluatePreviewQuality, previewSendGate } from '@/lib/preview/quality';
import { verifyMetaSignature, extractWhatsAppInbound } from '@/lib/whatsapp/webhook';
import { calculateFunnelMetrics } from '@/lib/reports/funnel';
import { evaluateLocalWindow } from '@/lib/outreach/scheduler';

describe('agent router', () => {
  it('routes a simple thank-you only to secretary', () => {
    expect(routeAgents({ message: 'Thanks' })).toEqual(['secretary']);
  });

  it('routes price questions through business, sales and evidence checks', () => {
    const agents = routeAgents({ message: 'How much does the website cost?' });
    expect(agents).toContain('business_analyst');
    expect(agents).toContain('sales_marketing');
    expect(agents).toContain('evidence_checker');
    expect(agents).toContain('secretary');
    expect(agents).toContain('relevance_checker');
  });

  it('routes objections through psychology and culture', () => {
    const agents = routeAgents({ message: 'This is too expensive, I am not sure.' });
    expect(agents).toContain('conversation_psychology');
    expect(agents).toContain('culture_locale');
  });
});

describe('human handoff', () => {
  it('hands off high-intent leads', () => {
    const result = evaluateHandoff({ intentScore: 75 });
    expect(result.handoff).toBe(true);
    expect(result.reasons).toContain('HIGH_INTENT');
  });

  it('hard-blocks AI send during human takeover', () => {
    expect(canAutoSend({ agentMode: 'HUMAN' }).delivery).toBe('BLOCK');
  });

  it('returns review in shadow mode', () => {
    expect(canAutoSend({ agentMode: 'AUTO', shadowMode: true }).delivery).toBe('REVIEW');
  });
});

describe('multi-agent pipeline', () => {
  it('uses secretary as the only customer-facing composer and blocks high-intent auto-send', async () => {
    const result = await processInboundMessage({
      message: 'How much is the website and can we have a call tomorrow?',
      businessName: 'Example Clinic',
      countryCode: 'OM',
      language: 'en',
      industry: 'dental',
      intentScore: 80,
      quotedService: 'premium_bilingual_website',
      quotedPrice: 249,
      quotedCurrency: 'OMR',
      verifiedEvidence: ['Current website has no Arabic version'],
      agentMode: 'AUTO',
      shadowMode: false,
    });

    expect(result.draft.generatedBy).toBe('secretary');
    expect(result.trace.relevancePassed).toBe(true);
    expect(result.trace.delivery).toBe('BLOCK');
    expect(result.nextAgentMode).toBe('HUMAN');
  });

  it('keeps low-risk replies in review while shadow mode is enabled', async () => {
    const result = await processInboundMessage({
      message: 'Can you show me a preview?',
      businessName: 'Example Salon',
      countryCode: 'AE',
      language: 'en',
      industry: 'salon',
      intentScore: 62,
      verifiedEvidence: ['Booking CTA is difficult to find on mobile'],
      agentMode: 'AUTO',
      shadowMode: true,
    });
    expect(result.previewRecommended).toBe(true);
    expect(result.trace.delivery).toBe('REVIEW');
  });
});

describe('smart preview', () => {
  it('does not generate previews for uninterested cold leads', () => {
    expect(isPreviewEligible({ businessName: 'Cold Lead', vertical: 'dental', countryCode: 'OM', language: 'en', intentScore: 20 }).eligible).toBe(false);
  });

  it('passes curated premium preview through quality gate', () => {
    const preview = generatePreview({
      businessName: 'Harbour Dental', vertical: 'dental', countryCode: 'OM', language: 'en', city: 'Muscat',
      services: ['General Dentistry', 'Cosmetic Dentistry', 'Appointments'], explicitRequest: true, intentScore: 70,
    });
    const quality = evaluatePreviewQuality(preview);
    expect(quality.passed).toBe(true);
    expect(quality.score).toBeGreaterThanOrEqual(85);
    expect(previewSendGate({ quality, approved: false }).allowed).toBe(false);
    expect(previewSendGate({ quality, approved: true }).allowed).toBe(true);
  });

  it('keeps Arabic previews RTL', () => {
    const preview = generatePreview({ businessName: 'عيادة النور', vertical: 'dental', countryCode: 'OM', language: 'ar', explicitRequest: true });
    expect(preview.direction).toBe('rtl');
    expect(evaluatePreviewQuality(preview).passed).toBe(true);
  });
});

describe('whatsapp security and delivery', () => {
  it('verifies Meta webhook HMAC signature', () => {
    const raw = JSON.stringify({ entry: [] });
    const secret = 'test-secret';
    const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    expect(verifyMetaSignature(raw, signature, secret)).toBe(true);
    expect(verifyMetaSignature(raw, 'sha256=deadbeef', secret)).toBe(false);
  });

  it('normalizes inbound WhatsApp text messages', () => {
    const events = extractWhatsAppInbound({ entry: [{ changes: [{ value: { contacts: [{ profile: { name: 'Ali' } }], messages: [{ id: 'wamid.1', from: '96890000000', type: 'text', text: { body: 'Hello' } }] } }] }] });
    expect(events).toHaveLength(1);
    expect(events[0].text).toBe('Hello');
    expect(events[0].contactName).toBe('Ali');
  });

  it('applies 09:00-19:00 local window to non-email outbound too', () => {
    expect(evaluateLocalWindow({ marketCode: 'OM', nowUtc: new Date('2026-08-20T06:00:00Z') }).allowed).toBe(true);
    expect(evaluateLocalWindow({ marketCode: 'OM', nowUtc: new Date('2026-08-20T16:00:00Z') }).allowed).toBe(false);
  });
});

describe('reporting', () => {
  it('calculates funnel and preview conversion metrics', () => {
    const metrics = calculateFunnelMetrics({
      newLeads: 100, audited: 80, qualified: 50, contacted: 40, replies: 10, positive: 6, hot: 3, won: 2, lost: 1,
      revenue: 1000, apiCost: 100, previewSent: 4, previewViewed: 3, previewHot: 2, previewWon: 1,
    });
    expect(metrics.replyRate).toBe(0.25);
    expect(metrics.previewToWonRate).toBeCloseTo(1 / 3);
    expect(metrics.roi).toBe(9);
  });
});
