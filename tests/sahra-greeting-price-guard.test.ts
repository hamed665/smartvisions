import { describe, expect, it } from 'vitest';
import { buildSelectiveRoutePlan } from '@/lib/agents/selective-routing';
import { secretaryCompose } from '@/lib/agents/executor';
import { processInboundMessage } from '@/lib/agents/pipeline';
import { standaloneGreetingKind, standaloneGreetingReply } from '@/lib/agents/standalone-greeting';
import { detectHighConfidenceMessageLanguage, replyMatchesHighConfidenceMessageLanguage } from '@/lib/outreach/locale';
import { evaluateAgentQualitySafety } from '@/lib/agents/quality-safety';
import type { AgentContext } from '@/lib/agents/contracts';

const base: AgentContext = {
  message: 'السلام عليكم',
  countryCode: 'OM',
  agentMode: 'AUTO',
  shadowMode: true,
  servingBusiness: { name: 'مركز صحرا', countryCode: 'OM' },
  marketLocaleStyle: { countryCode: 'OM', primaryLocale: 'ar-OM', dialect: 'omani', toneProfile: 'warm_short_business' },
  conversationHistory: [
    { direction: 'INBOUND', body: 'عندكم فرش أرضيات لكامري ٢٠٢٢؟' },
    { direction: 'OUTBOUND', body: 'سعر الفرش ٣٧ ريال عماني مع ضمان سنة' },
  ],
  quotedService: 'FLOOR_MATS',
  quotedPrice: 37,
  quotedCurrency: 'OMR',
};

describe('Sahra greeting should not become a sales claim', () => {
  it.each(['السلام عليكم', 'السلام علیکم', 'السلام عليكم ورحمة الله', 'مرحبا', 'يا هلا', 'Hello', 'hi'])(
    'identifies a greeting without a product request: %s', message => {
      expect(standaloneGreetingKind(message)).not.toBeNull();
    },
  );

  it.each(['السلام عليكم، عندكم فرش لكامري؟', 'هلا كم السعر؟', 'Hi, do you have PPF?', 'سلام قیمت چنده؟'])(
    'never discards a greeting plus a substantive enquiry: %s', message => {
      expect(standaloneGreetingKind(message)).toBeNull();
    },
  );

  it('answers a new Arabic greeting promptly without replaying an old quote or warranty', async () => {
    expect(detectHighConfidenceMessageLanguage('السلام عليكم')).toBe('ar');
    const plan = buildSelectiveRoutePlan(base);
    expect(plan.tier).toBe('ZERO_COST');
    expect(plan.estimatedLlmCalls).toBe(0);
    const reply = standaloneGreetingReply(base);
    expect(reply?.language).toBe('ar-OM');
    expect(reply?.text).toContain('وعليكم السلام');
    expect(reply?.text).not.toMatch(/37|٣٧|ضمان|سعر|فرش|صورة/);

    // Even a deliberately wrong model response is superseded on greetings.
    const draft = secretaryCompose(base, { action: 'ANSWER', useDiscount: false, explainValue: false, askLowPressureCta: false, requiresHuman: false, reasons: [] }, [
      { agent: 'secretary', confidence: 0.9, summary: 'fixture', evidence: [], blockers: [], data: { customer_reply: 'کفپوش ۳۷ ریال', customer_reply_language: 'fa' } },
    ]);
    expect(draft.text).toBe(reply?.text);
    const processed = await processInboundMessage(base);
    expect(processed.draft.language).toBe('ar-OM');
    expect(processed.draft.text).toContain('وعليكم السلام');
    expect(processed.trace.paidAgentCallsPlanned).toBe(0);
    expect(processed.trace.delivery).toBe('REVIEW'); // Shadow Mode preserved.
  });

  it('honors recent Persian customer context on ambiguous standalone سلام', () => {
    const reply = standaloneGreetingReply({
      ...base, message: 'سلام', language: 'fa', conversationHistory: [{ direction: 'INBOUND', body: 'قیمت کفپوش چنده؟' }],
    });
    expect(reply?.language).toBe('fa');
    expect(reply?.text).toContain('سلام');
    expect(reply?.text).not.toMatch(/ريال|37/);
  });

  it('rejects Persian wording mislabeled as Omani Arabic', () => {
    expect(replyMatchesHighConfidenceMessageLanguage({
      message: 'السلام عليكم', replyLanguage: 'ar-OM',
      replyText: 'سلام، خوش آمدید. درباره کفپوش اطلاعات بدید.',
    })).toBe(false);
  });
});

describe('Sahra real-currency quote and warranty gates', () => {
  const clearQuote = { ...base, quotedPrice: undefined, quotedCurrency: undefined, serviceKnowledge: [] };

  it.each(['سعر فرش ٣٧ ريال عماني', 'قیمت ۳۷ ریال عمان', 'السعر 37 ر.ع', 'OMR 37'])(
    'blocks owner-unverified currency: %s', text => {
      const trace = evaluateAgentQualitySafety({ context: clearQuote, draft: { text, language: 'ar-OM', generatedBy: 'secretary' } });
      expect(trace.blockReasons).toContain('UNSUPPORTED_MONETARY_CLAIM');
    },
  );

  it('does not trust a customer-mentioned price as owner pricing authority', () => {
    const context = { ...clearQuote, message: 'سمعت عندكم السعر ٣٧ ريال؟' };
    const trace = evaluateAgentQualitySafety({
      context, draft: { text: 'السعر ٣٧ ريال عماني', language: 'ar-OM', generatedBy: 'secretary' },
    });
    expect(trace.blockReasons).toContain('UNSUPPORTED_MONETARY_CLAIM');
  });

  it('allows a canonical OMR amount but flags an unverified one-year warranty for review', () => {
    const price = evaluateAgentQualitySafety({
      context: base, draft: { text: 'السعر المعتمد ٣٧ ريال عماني', language: 'ar-OM', generatedBy: 'secretary' },
    });
    expect(price.blockReasons).not.toContain('UNSUPPORTED_MONETARY_CLAIM');
    const warranty = evaluateAgentQualitySafety({
      context: base, draft: { text: 'المنتج عليه ضمان سنة', language: 'ar-OM', generatedBy: 'secretary' },
    });
    expect(warranty.reviewReasons).toContain('UNSUPPORTED_ABSOLUTE_GUARANTEE');
  });
});
