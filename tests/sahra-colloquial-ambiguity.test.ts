import { describe, expect, it } from 'vitest';
import { safeOmaniConversationClarification } from '@/lib/agents/omani-conversation-clarification';
import { processInboundMessage } from '@/lib/agents/pipeline';
import type { AgentRuntime } from '@/lib/agents/runtime';

const context = {
  message: 'عندكم حق اللاندكروزر؟',
  countryCode: 'OM',
  servingBusiness: { countryCode: 'OM', name: 'Sahra Car Care' },
  industry: 'automotive',
  language: 'ar-OM',
  marketLocaleStyle: { countryCode: 'OM', primaryLocale: 'ar-OM', dialect: 'omani', toneProfile: 'warm_short_business' },
  conversationHistory: [{ direction: 'INBOUND' as const, body: 'أبغي فرش أرضيات 5D' }],
  agentMode: 'AUTO' as const,
  shadowMode: true,
};

describe('Omani brief conversation follow-ups', () => {
  it('asks for fitment details without claiming stock for the customer’s car', () => {
    const result = safeOmaniConversationClarification(context);
    expect(result?.draft.text).toContain('فرش الأرضيات');
    expect(result?.draft.text).toContain('من أي سنة');
    expect(result?.draft.text).not.toContain('ممكن الموديل');
    expect(result?.draft.text).not.toMatch(/متوفر|موجود|أكيد يركب|ريال/);
  });

  it('understands casual recommendation questions in the prior service context', () => {
    const result = safeOmaniConversationClarification({
      ...context, message: 'شو تنصح؟',
      conversationHistory: [{ direction: 'INBOUND', body: 'أبغي عازل حراري' }],
    });
    expect(result?.draft.text).toContain('العازل الحراري');
  });

  it('understands short Omani comparisons without forgetting the earlier tint topic', () => {
    const result = safeOmaniConversationClarification({
      ...context,
      message: 'وش الفرق؟',
      conversationHistory: [{ direction: 'INBOUND', body: 'بغيت دودي للجامات' }],
    });
    expect(result?.draft.language).toBe('ar-OM');
    expect(result?.draft.text).toContain('العازل الحراري');
    expect(result?.draft.text).not.toMatch(/متوفر|ريال|أكيد يركب/);
  });

  it('prefers the customer’s newly named service over older conversation topics', () => {
    const result = safeOmaniConversationClarification({
      ...context,
      message: 'شو تنصح للعازل؟',
      conversationHistory: [{ direction: 'INBOUND', body: 'أبغي فرش أرضيات 5D' }],
    });
    expect(result?.draft.text).toContain('العازل الحراري');
    expect(result?.draft.text).not.toContain('فرش الأرضيات');
  });

  it('keeps Arabic as the reply language when the product name is English', () => {
    for (const message of ['في Android screen عندكم؟', 'عندكم 5D mats?', 'PPF بكم؟']) {
      const result = safeOmaniConversationClarification({ ...context, message });
      expect(result?.draft.language).toBe('ar-OM');
      expect(result?.draft.text).not.toMatch(/OMR|ريال|ضمان/);
    }
  });

  it('uses the customer topic for very short followups but not generic acknowledgements', () => {
    for (const message of ['بكم؟', 'price', 'all', 'fits?', 'stock']) {
      const result = safeOmaniConversationClarification({
        ...context, message,
        conversationHistory: [{ direction: 'INBOUND', body: 'أبغي شاشات اندرويد' }],
      });
      expect(result?.draft.text).toMatch(/شاشات السيارة|car screens/);
    }
    for (const message of ['ok', 'yes', 'no', 'تمام', 'شكرا']) {
      expect(safeOmaniConversationClarification({ ...context, message })).toBeNull();
    }
  });

  it('does not fake a location or bypass a request for a person, complaint or discount', () => {
    for (const message of ['وين موقعكم؟', 'أريد خصم', 'أريد موظف', 'شكوى عندي', 'أبغي حجز', 'تمام']) {
      expect(safeOmaniConversationClarification({ ...context, message })).toBeNull();
    }
  });

  it('does not generate a default fallback for unrelated markets/businesses', () => {
    expect(safeOmaniConversationClarification({ ...context, countryCode: 'AE', servingBusiness: { countryCode: 'AE', name: 'Example' }, industry: 'consulting' })).toBeNull();
  });

  it('does not abandon a customer asking in colloquial Arabic for 5D mats', async () => {
    const actualMessage = 'في عندكم ارضيات 5d';
    const recovery = safeOmaniConversationClarification({
      ...context, message: actualMessage,
      conversationHistory: [{ direction: 'INBOUND', body: 'مرحبا' }],
    });
    expect(recovery?.draft.language).toBe('ar-OM');
    expect(recovery?.draft.text).toContain('فرش الأرضيات');
    expect(recovery?.draft.text).not.toMatch(/37|٣٧|ريال|ضمان|المخزون متوفر/);
    const runtime: AgentRuntime = { async run(agent) {
      return {
        agent, confidence: 0.98, summary: 'production regression', evidence: [],
        data: agent === 'secretary' ? {
          customer_reply: 'أكيد، نوفر أرضيات 5D بسعر إرشادي ٣٧ ريال عماني، ومعها ضمان سنة حسب المنتج. ممكن نوع السيارة وسنة الصنع عشان نأكد لك المقاس والتوافق؟',
          customer_reply_language: 'ar-OM',
        } : {},
        blockers: agent === 'relevance_checker'
          ? ['المخزون الفوري لموديل محدد والتوافق النهائي يحتاجان تأكيد المسؤول.'] : [],
      };
    }};
    const result = await processInboundMessage({
      ...context, message: actualMessage,
      conversationHistory: [{ direction: 'INBOUND', body: 'مرحبا' }],
    }, undefined, runtime);
    expect(result.trace.guardrails).toContain('SAFE_OMANI_CUSTOMER_CLARIFICATION_RECOVERY');
    expect(result.trace.delivery).toBe('REVIEW');
    expect(result.draft.text).not.toMatch(/37|٣٧|ريال|ضمان/);
    expect(result.trace.qualitySafety?.disposition).toBe('PASS');
  });

  it('can recover an evidence-only agent failure without overriding Shadow Mode', async () => {
    const runtime: AgentRuntime = { async run(agent) {
      return {
        agent, confidence: 0.95, summary: 'fixture', evidence: [], data: agent === 'secretary'
          ? { customer_reply: 'موجود حق لاندكروزر ضمان عشر سنوات', customer_reply_language: 'ar-OM' }
          : {},
        blockers: agent === 'evidence_checker' || agent === 'relevance_checker'
          ? ['الموديل غير معروف قبل التحقق من المقاس'] : [],
      };
    } };
    const result = await processInboundMessage(context, undefined, runtime);
    expect(result.trace.guardrails).toContain('SAFE_OMANI_CUSTOMER_CLARIFICATION_RECOVERY');
    expect(result.trace.delivery).toBe('REVIEW');
    expect(result.draft.text).not.toMatch(/ضمان عشر سنوات|موجود حق/);
  });
});
