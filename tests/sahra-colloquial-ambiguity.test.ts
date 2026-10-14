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

  it('does not fake a location or bypass a request for a person, complaint or discount', () => {
    for (const message of ['وين موقعكم؟', 'أريد خصم', 'أريد موظف', 'شكوى عندي', 'أبغي حجز', 'تمام']) {
      expect(safeOmaniConversationClarification({ ...context, message })).toBeNull();
    }
  });

  it('does not generate a default fallback for unrelated markets/businesses', () => {
    expect(safeOmaniConversationClarification({ ...context, countryCode: 'AE', servingBusiness: { countryCode: 'AE', name: 'Example' }, industry: 'consulting' })).toBeNull();
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
