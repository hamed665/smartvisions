import { describe, expect, it } from 'vitest';
import {
  resolveOmaniAutomotiveShortLanguage,
  resolveReplyLanguage,
  replyMatchesHighConfidenceMessageLanguage,
} from '@/lib/outreach/locale';
import {
  automotiveServiceCandidates,
  inferAutomotiveFacts,
  updateAutomotiveSalesMemory,
} from '@/lib/conversations/automotive-sales-memory';
import { safeOmaniConversationClarification } from '@/lib/agents/omani-conversation-clarification';
import { processInboundMessage } from '@/lib/agents/pipeline';
import type { AgentRuntime } from '@/lib/agents/runtime';

const base = {
  countryCode: 'OM',
  servingBusiness: { countryCode: 'OM', name: 'Sahra Car Care' },
  industry: 'automotive',
  marketLocaleStyle: { countryCode: 'OM', primaryLocale: 'ar-OM', dialect: 'omani' },
  language: 'ar-OM',
  agentMode: 'AUTO' as const,
  shadowMode: true,
  message: 'عندكم PPF؟',
  conversationHistory: [{ direction: 'INBOUND' as const, body: 'مرحبا، عندكم تظليل؟' }],
};

describe('customer-first Arabic/English automotive code switching', () => {
  it.each([
    ['عندكم PPF؟', 'ar-OM'],
    ['بجم ceramic tint؟', 'ar-OM'],
    ['أبي Android screen', 'ar-OM'],
    ['في شاشات CarPlay؟', 'ar-OM'],
    ['كم سعر 5D؟', 'ar-OM'],
    ['I need عازل حراري', 'en'],
    ['price for عازل', 'en'],
    ['PPF', 'ar-OM'],
    ['5D', 'ar-OM'],
    ['تمام', 'ar-OM'],
  ])('understands code-switched or one-word "%s" as %s', (message, expected) => {
    expect(resolveReplyLanguage({
      message, primaryLocale: 'ar-OM', preferredLanguage: 'ar-OM',
      conversationHistory: base.conversationHistory,
    })).toBe(expected);
  });

  it('retains actual English or Persian customer language for a neutral follow-up', () => {
    expect(resolveReplyLanguage({
      message: 'PPF', primaryLocale: 'ar-OM', preferredLanguage: 'ar-OM',
      conversationHistory: [{ direction: 'INBOUND', body: 'Hi, I want seat covers for my car' }],
    })).toBe('en');
    expect(resolveReplyLanguage({
      message: 'PPF', primaryLocale: 'ar-OM', preferredLanguage: 'ar-OM',
      conversationHistory: [{ direction: 'INBOUND', body: 'قیمت روکش چنده؟' }],
    })).toBe('fa');
    expect(resolveReplyLanguage({
      message: 'قیمت PPF چنده؟', primaryLocale: 'ar-OM', preferredLanguage: 'ar-OM',
    })).not.toBe('ar-OM');
    expect(resolveReplyLanguage({
      message: 'Hi', primaryLocale: 'ar-OM', preferredLanguage: 'ar-OM',
      conversationHistory: base.conversationHistory,
    })).toBe('en');
  });

  it('does not change multilingual behavior outside Oman or without car-care evidence', () => {
    expect(resolveOmaniAutomotiveShortLanguage({ message: 'عندكم PPF', primaryLocale: 'ar-AE' })).toBeNull();
    expect(resolveReplyLanguage({ message: 'ممكن price للموقع؟', primaryLocale: 'ar-OM' })).toBe('und');
    expect(resolveReplyLanguage({ message: 'Hola quiero ayuda', primaryLocale: 'ar-OM' })).toBe('und');
  });

  it('accepts the corresponding Arabic script instead of blocking on Latin automotive product length', () => {
    expect(replyMatchesHighConfidenceMessageLanguage({
      message: 'عندكم Android screen؟', replyLanguage: 'ar-OM',
      replyText: 'بالنسبة لشاشات السيارة، ممكن موديل السيارة وسنة الصنع؟',
      primaryLocale: 'ar-OM', conversationHistory: base.conversationHistory,
    })).toBe(true);
    expect(replyMatchesHighConfidenceMessageLanguage({
      message: 'عندكم Android screen؟', replyLanguage: 'en',
      replyText: 'What car do you have?', primaryLocale: 'ar-OM',
    })).toBe(false);
    expect(replyMatchesHighConfidenceMessageLanguage({
      message: 'Hi', replyLanguage: 'ar-OM', replyText: 'حياك الله', primaryLocale: 'ar-OM',
    })).toBe(false);
  });

  it.each([
    ['5D', 'FLOOR_MATS'],
    ['في عندكم أرضيات 5d', 'FLOOR_MATS'],
    ['Android screen', 'CAR_SCREEN'],
    ['CarPlay', 'CAR_SCREEN'],
    ['PPF', 'PPF'],
    ['ceramic tint', 'THERMAL_TINT'],
    ['تنجيد', 'SEAT_UPHOLSTERY'],
    ['LED', 'LED_LIGHTING'],
  ])('maps standalone service "%s" to canonical memory %s', (message, service) => {
    expect(inferAutomotiveFacts(message).service).toBe(service);
  });

  it('drops a previous car year and seat count when customer names a different car', () => {
    const first = { direction: 'INBOUND' as const, body: 'Toyota Camry 2022 5 seats' };
    const second = { direction: 'INBOUND' as const, body: 'لا، Nissan Patrol' };
    const evidence: Record<string, any> = {};
    const revisions: any[] = [];
    const old = updateAutomotiveSalesMemory({
      body:first.body,item:first,evidence,revisions,
    });
    const next = updateAutomotiveSalesMemory({
      previous: old, body:second.body,item:second,evidence,revisions,
    });
    expect(next).toMatchObject({ make: 'Nissan', model: 'Patrol' });
    expect(next.year).toBeUndefined();
    expect(next.seats).toBeUndefined();
    expect(revisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'automotive.year', from: 2022, to: null }),
    ]));
  });

  it('refuses to assume an order when several services are mentioned', () => {
    expect(automotiveServiceCandidates('PPF و 5D')).toEqual(expect.arrayContaining(['PPF', 'FLOOR_MATS']));
    expect(inferAutomotiveFacts('PPF و 5D').service).toBeUndefined();
  });

  it.each([
    ['PPF', 'حماية البوية PPF'],
    ['5D', 'الأرضيات'],
    ['شاشات Android', 'شاشات السيارة'],
    ['CarPlay', 'شاشات السيارة'],
    ['LED', 'إضاءة LED'],
  ])('asks one fitment question after "%s", never promises stock or invents prices', (message, service) => {
    const result = safeOmaniConversationClarification({ ...base, message, conversationHistory: [] });
    expect(result?.draft.text).toContain(service);
    expect(result?.draft.text).toContain('الموديل وسنة الصنع');
    expect(result?.draft.text).not.toMatch(/متوفر|موجود|ريال|OMR|ضمان|تأكيد التركيب/);
    expect((result?.draft.text.match(/[؟?]/g) ?? [])).toHaveLength(1);
  });

  it('uses only previous customer turns, and a new service overrides the old one', () => {
    const result = safeOmaniConversationClarification({
      ...base, message: 'وش تنصح؟',
      conversationHistory: [
        { direction: 'INBOUND', body: 'أبغي فرش أرضيات' },
        { direction: 'OUTBOUND', body: 'We have PPF' },
        { direction: 'INBOUND', body: 'بغيت عازل حراري' },
      ],
    });
    expect(result?.draft.text).toContain('العازل الحراري');
    expect(result?.draft.text).not.toContain('الأرضيات');
    expect(result?.draft.text).not.toContain('حماية البوية PPF');
  });

  it('does not pick a service from an ambiguous new request', () => {
    const result = safeOmaniConversationClarification({ ...base, message: 'عندكم PPF و 5D؟' });
    expect(result?.draft.text).toContain('أي خدمة');
    expect(result?.draft.text).not.toContain('متوفر');
  });

  it('keeps English wording for short English service questions after English history', () => {
    const result = safeOmaniConversationClarification({
      ...base, language: 'en', message: 'screen',
      conversationHistory: [{ direction: 'INBOUND', body: 'Hi, I want seats for my car' }],
    });
    expect(result?.draft.language).toBe('en');
    expect(result?.draft.text).toContain('car screens');
    expect(result?.draft.text).toContain('model and year');
  });

  it('passes all safety gates on a recovered mixed-language customer query, without fabricated claims', async () => {
    const runtime: AgentRuntime = { async run(agent) {
      return {
        agent, confidence: 0.95, summary: 'conservative fixture', evidence: [],
        data: agent === 'secretary' ? {
          customer_reply: 'أكيد متوفر مضمون لمدة عشر سنوات',
          customer_reply_language: 'ar-OM',
        } : {},
        blockers: agent === 'relevance_checker' ? ['Needs vehicle fitment confirmation'] : [],
      };
    } };
    const result = await processInboundMessage({
      ...base, message: 'عندكم PPF؟',
    }, undefined, runtime);
    expect(result.trace.guardrails).toContain('SAFE_OMANI_CUSTOMER_CLARIFICATION_RECOVERY');
    expect(result.trace.delivery).toBe('REVIEW');
    expect(result.draft.text).toContain('حماية البوية PPF');
    expect(result.draft.text).not.toMatch(/مضمون|عشر سنوات|متوفر|ريال/);
    expect(result.trace.qualitySafety?.disposition).toBe('PASS');
  });
});
