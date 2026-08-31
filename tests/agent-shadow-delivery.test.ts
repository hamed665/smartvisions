import { describe, expect, it } from 'vitest';
import { planAgentWhatsAppShadowApproval, type AgentShadowResult } from '@/lib/agents/shadow-delivery';
import type { AgentContext } from '@/lib/agents/contracts';

const NOW = new Date('2026-08-31T03:20:00.000Z');
const context: AgentContext = {
  organizationId: '00000000-0000-0000-0000-000000000001',
  leadId: '00000000-0000-0000-0000-000000000002',
  message: 'I need a website for my clinic',
  shadowMode: true,
};

const result: AgentShadowResult = {
  draft: { text: 'A website is the best fit for this request.', language: 'en', generatedBy: 'secretary' },
  trace: {
    delivery: 'REVIEW',
    agentResults: [
      {
        agent: 'culture_locale', confidence: 0.95, summary: 'locale', evidence: [], blockers: [],
        data: { reply_dialect: 'omani' },
      },
      {
        agent: 'secretary', confidence: 0.9, summary: 'reply', evidence: [], blockers: [],
        data: { operator_persian_translation: 'برای این درخواست، وب‌سایت مناسب‌ترین گزینه است.', operator_persian_summary: 'مشتری برای کلینیک وب‌سایت می‌خواهد.' },
      },
    ],
  },
  catalogRecommendation: {
    contentId: 'SV-WEB-001', serviceKey: 'website_design', label: 'Website Design & Development', source: 'EXPLICIT_MESSAGE',
  },
};

const baseDelivery = {
  conversationId: '00000000-0000-0000-0000-000000000003',
  to: '+96890000000',
  marketCode: 'OM',
};

describe('agent WhatsApp Shadow Approval delivery plan', () => {
  it('attaches the recommended catalog item only inside an open 24-hour session', () => {
    const plan = planAgentWhatsAppShadowApproval({
      context,
      result,
      deliveryContext: { ...baseDelivery, lastCustomerMessageAt: '2026-08-31T02:30:00.000Z' },
      requestKey: 'wa-inbound-1',
      now: NOW,
    });

    expect(plan.action).toBe('QUEUE');
    if (plan.action !== 'QUEUE') throw new Error('expected queue plan');
    expect(plan.policy.mode).toBe('FREEFORM');
    expect(plan.catalogAttached).toBe(true);
    expect(plan.input.catalogContentId).toBe('SV-WEB-001');
    expect(plan.input.idempotencyKey).toBe('agent:wa-inbound-1:shadow');
    expect(plan.input.persianSummary).toContain('وب‌سایت');
    expect(plan.input.replyDialect).toBe('omani');
  });

  it('keeps a template reviewable outside 24 hours but deliberately omits the catalog product', () => {
    const plan = planAgentWhatsAppShadowApproval({
      context,
      result,
      deliveryContext: {
        ...baseDelivery,
        lastCustomerMessageAt: '2026-08-29T03:00:00.000Z',
        templateName: 'service_followup',
        templateLanguageCode: 'en',
      },
      requestKey: 'wa-inbound-2',
      now: NOW,
    });

    expect(plan.action).toBe('QUEUE');
    if (plan.action !== 'QUEUE') throw new Error('expected queue plan');
    expect(plan.policy.mode).toBe('TEMPLATE');
    expect(plan.catalogAttached).toBe(false);
    expect(plan.input.catalogContentId).toBeUndefined();
    expect(plan.input.templateName).toBe('service_followup');
  });

  it('does not create a dead approval when WhatsApp policy blocks the send', () => {
    const plan = planAgentWhatsAppShadowApproval({
      context,
      result,
      deliveryContext: { ...baseDelivery, lastCustomerMessageAt: '2026-08-29T03:00:00.000Z' },
      requestKey: 'wa-inbound-3',
      now: NOW,
    });

    expect(plan.action).toBe('BLOCK');
    if (plan.action !== 'BLOCK') throw new Error('expected blocked plan');
    expect(plan.reason).toBe('WHATSAPP_POLICY_BLOCKED');
    expect(plan.policy.reason).toBe('OUTSIDE_24H_WINDOW_TEMPLATE_REQUIRED');
  });

  it('never queues a pipeline result that is blocked before delivery', () => {
    const plan = planAgentWhatsAppShadowApproval({
      context,
      result: { ...result, trace: { ...result.trace, delivery: 'BLOCK' } },
      deliveryContext: { ...baseDelivery, lastCustomerMessageAt: '2026-08-31T02:30:00.000Z' },
      requestKey: 'wa-inbound-4',
      now: NOW,
    });

    expect(plan).toEqual({ action: 'SKIP', reason: 'DELIVERY_NOT_REVIEW' });
  });

  it('never queues when Shadow Mode is not active', () => {
    const plan = planAgentWhatsAppShadowApproval({
      context: { ...context, shadowMode: false },
      result,
      deliveryContext: { ...baseDelivery, lastCustomerMessageAt: '2026-08-31T02:30:00.000Z' },
      requestKey: 'wa-inbound-5',
      now: NOW,
    });

    expect(plan).toEqual({ action: 'SKIP', reason: 'SHADOW_MODE_OFF' });
  });
});
