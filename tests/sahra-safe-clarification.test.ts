import { describe, expect, it } from 'vitest';
import type { AgentResult } from '@/lib/agents/contracts';
import type { AgentRuntime } from '@/lib/agents/runtime';
import { processInboundMessage } from '@/lib/agents/pipeline';
import { safeOmaniConversationClarification } from '@/lib/agents/omani-conversation-clarification';
import { safeVehicleQuoteClarification } from '@/lib/agents/safe-clarification';

const conversationHistory = [{ direction: 'INBOUND' as const, body: 'كم سعر تلبيسات المقاعد للسيارة؟' }];
const context = {
  message: 'كم سعر التلبيسات؟',
  conversationHistory,
  countryCode: 'OM',
  industry: 'automotive interior',
  servingBusiness: { name: 'Example Omani Car Center', countryCode: 'OM' },
  marketLocaleStyle: { countryCode: 'OM', primaryLocale: 'ar-OM', dialect: 'omani', toneProfile: 'friendly_professional' },
  agentMode: 'AUTO' as const,
  shadowMode: true,
};

function modelWithBlockers(options?: { privateLeak?: boolean }): AgentRuntime {
  return {
    async run(agent): Promise<AgentResult> {
      return {
        agent,
        confidence: 0.96,
        summary: 'controlled fixture',
        evidence: [],
        data: agent === 'secretary'
          ? { customer_reply: options?.privateLeak ? 'Private margin secret-for-test-7890' : 'سعر التلبيسات يحتاج بيانات السيارة للتأكيد.', customer_reply_language: 'ar-OM' }
          : {},
        blockers: agent === 'evidence_checker' || agent === 'relevance_checker'
          ? ['عدد المقاعد وسنة الصنع غير محددين قبل العرض النهائي']
          : [],
      };
    },
  };
}

describe('Sahra conversation resilience', () => {
  it('creates a brief natural Omani Arabic clarification without inventing a quote', () => {
    const recovered = safeVehicleQuoteClarification(context);
    expect(recovered?.draft.language).toBe('ar-OM');
    expect(recovered?.draft.text).toContain('الموديل وسنة الصنع');
    expect(recovered?.draft.text).not.toMatch(/99|137|ريال|OMR|ضمان|تم الحجز/);
  });

  it('recovers from evidence-only blocking without bypassing shadow review', async () => {
    const result = await processInboundMessage(context, { agentsPaused: false }, modelWithBlockers());
    expect(result.trace.guardrails).toContain('SAFE_VEHICLE_QUOTE_CLARIFICATION_RECOVERY');
    expect(result.trace.delivery).toBe('REVIEW');
    expect(result.trace.qualitySafety?.disposition).toBe('PASS');
    expect(result.draft.text).toContain('الموديل وسنة الصنع');
    expect(result.trace.agentResults.find((agent) => agent.agent === 'secretary')?.data).toMatchObject({
      customer_reply: result.draft.text,
    });
  });

  it('recovers an unverified all-window quote without leaking unsupported prices', async () => {
    const english = {
      ...context,
      message: 'Toyota Land Cruiser 2022 all How much',
      conversationHistory: [
        { direction: 'INBOUND' as const, body: 'I want to change my cars cover 5 seats' },
        { direction: 'INBOUND' as const, body: 'The window' },
      ],
    };
    const runtime: AgentRuntime = {
      async run(agent): Promise<AgentResult> {
        return {
          agent,
          confidence: 0.96,
          summary: 'controlled incomplete-price fixture',
          evidence: [],
          data: agent === 'secretary'
            ? {
                customer_reply: 'The all-windows tint price is OMR 24 for sides and OMR 10 for rear, but the windscreen price is missing.',
                customer_reply_language: 'en',
              }
            : {},
          blockers: agent === 'evidence_checker'
            ? ['Unverified full-car bundle and front-windscreen price']
            : [],
        };
      },
    };
    const result = await processInboundMessage(english, { agentsPaused: false }, runtime);
    expect(result.trace.guardrails).toContain('SAFE_VEHICLE_QUOTE_CLARIFICATION_RECOVERY');
    expect(result.trace.delivery).toBe('REVIEW');
    expect(result.trace.qualitySafety?.disposition).toBe('PASS');
    expect(result.draft.text).not.toMatch(/OMR|24|10|\\$|ريال/);
    expect(result.draft.text).toMatch(/price/i);
    expect(result.draft.text).toMatch(/Land Cruiser.*2022/);
    expect(result.draft.text).toMatch(/windscreen/i);
    expect(result.draft.text).not.toMatch(/send a photo|model and year/i);
    expect(result.trace.agentResults.find((agent) => agent.agent === 'secretary')?.data).toMatchObject({
      customer_reply: result.draft.text,
    });
  });

  it('never recovers confidential leakage even if evidence is also incomplete', async () => {
    const confidential = 'Private margin secret-for-test-7890';
    const result = await processInboundMessage({
      ...context,
      knowledgeContext: [{ key: 'private', version: 1, sensitivity: 'CONFIDENTIAL', payload: { content: confidential } }],
    }, { agentsPaused: false }, modelWithBlockers({ privateLeak: true }));
    expect(result.trace.delivery).toBe('BLOCK');
    expect(result.trace.guardrails).not.toContain('SAFE_VEHICLE_QUOTE_CLARIFICATION_RECOVERY');
  });

  it('does not apply the automotive recovery to unrelated inquiries', () => {
    expect(safeVehicleQuoteClarification({
      ...context,
      message: 'أين موقعكم؟',
      conversationHistory: [],
    })).toBeNull();
  });

  it('does not apply the Oman recovery to a different market', () => {
    expect(safeVehicleQuoteClarification({
      ...context,
      servingBusiness: { name: 'Example', countryCode: 'AE' },
      countryCode: 'AE',
    })).toBeNull();
  });
});

describe('known customer vehicle regression', () => {
  it.each(['٢٠٢٢', '۲۰۲۲', '2022'])('does not ask again for Camry model/year %s', (year) => {
    const recovered = safeVehicleQuoteClarification({
      ...context, message: 'السلام عليكم، عندكم فرش أرضيات لتويوتا كامري '+year+'؟ وكم السعر؟',
    });
    expect(recovered?.draft.text).toContain('بيانات سيارتك واضحة');
    expect(recovered?.draft.text).not.toMatch(/الموديل|سنة الصنع|٣٧|37|ضمان/);
    expect(recovered?.draft.text).toContain('تأكيد المسؤول');
  });

  it('asks only for the year when the model is already known', () => {
    const recovered = safeVehicleQuoteClarification({ ...context, message: 'كم سعر فرش تويوتا كامري؟' });
    expect(recovered?.draft.text).toContain('من أي سنة');
    expect(recovered?.draft.text).not.toContain('ممكن الموديل');
  });

  it('asks only for the model when the year is already known', () => {
    const recovered = safeVehicleQuoteClarification({ ...context, message: 'كم سعر فرش تويوتا ٢٠٢٢؟' });
    expect(recovered?.draft.text).toContain('ممكن تذكر موديل');
    expect(recovered?.draft.text).not.toContain('سنة الصنع؟');
  });

  it('preserves customer facts across turns without treating outgoing claims as facts', () => {
    const recovered = safeVehicleQuoteClarification({
      ...context, message: 'بكم؟',
      conversationHistory: [
        { direction: 'INBOUND', body: 'فرش أرضيات لكامري ٢٠٢٢' },
        { direction: 'OUTBOUND', body: 'هل سيارتك نيسان باترول ٢٠٢٠؟' },
      ],
    });
    expect(recovered?.draft.text).toContain('بيانات سيارتك واضحة');
  });

  it('clears the old model after a customer changes the make', () => {
    const recovered = safeVehicleQuoteClarification({
      ...context, message: 'كم سعر الفرش للنيسان؟',
      conversationHistory: [{ direction: 'INBOUND', body: 'كامري ٢٠٢٢' }],
    });
    expect(recovered?.draft.text).toContain('ممكن تذكر موديل');
  });

  it('uses the same known-fact boundary for colloquial compatibility enquiries', () => {
    const recovered = safeOmaniConversationClarification({
      ...context, message: 'عندكم فرش أرضيات لكامري ٢٠٢٢؟',
    });
    expect(recovered?.draft.text).toContain('بيانات سيارتك واضحة');
    expect(recovered?.draft.text).not.toMatch(/الموديل|سنة الصنع/);
  });

  it('keeps known facts in the evidence-only pipeline recovery and retains shadow review', async () => {
    const result = await processInboundMessage({
      ...context, message: 'السلام عليكم، عندكم فرش أرضيات لتويوتا كامري ٢٠٢٢؟ وكم السعر؟',
    }, { agentsPaused: false }, modelWithBlockers());
    expect(result.trace.guardrails).toContain('SAFE_VEHICLE_QUOTE_CLARIFICATION_RECOVERY');
    expect(result.trace.delivery).toBe('REVIEW');
    expect(result.draft.text).not.toMatch(/الموديل|سنة الصنع/);
    expect(result.draft.text).toContain('تأكيد المسؤول');
  });

  it.each([
    ['fa', 'قیمت کفپوش تویوتا کمری ۲۰۲۲ چقدر است؟'],
    ['en', 'How much for floor mats for a Toyota Camry 2022?'],
  ])('preserves supplied model/year in %s', (language, message) => {
    const recovered = safeVehicleQuoteClarification({ ...context, language, message, conversationHistory: [] });
    expect(recovered).not.toBeNull();
    expect(recovered?.draft.text).not.toMatch(/مدل و سال|model and year/);
  });
});
