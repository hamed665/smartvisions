import { describe, expect, it } from 'vitest';
import type { AgentResult } from '@/lib/agents/contracts';
import type { AgentRuntime } from '@/lib/agents/runtime';
import { processInboundMessage } from '@/lib/agents/pipeline';
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
