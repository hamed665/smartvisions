import { describe, expect, it } from 'vitest';
import { processInboundMessage } from '@/lib/agents/pipeline';
import { executeAgent } from '@/lib/agents/executor';
import { standaloneGreetingReply } from '@/lib/agents/standalone-greeting';
import { safeVehicleQuoteClarification } from '@/lib/agents/safe-clarification';
import { safeOmaniConversationClarification } from '@/lib/agents/omani-conversation-clarification';
import { isSahraCustomerContext, sahraCustomerReplyLanguage, sahraCustomerDraftAllowed } from '@/lib/agents/sahra-customer-language';
import type { AgentContext, AgentResult } from '@/lib/agents/contracts';
import type { AgentRuntime } from '@/lib/agents/runtime';

const sahra: AgentContext = {
  message: 'السلام عليكم',
  countryCode: 'OM',
  language: 'fa',
  servingBusiness: { name: 'مركز صحرا', countryCode: 'OM' },
  marketLocaleStyle: { countryCode: 'OM', primaryLocale: 'ar-OM', fallbackLocale: 'en', dialect: 'omani' },
  agentMode: 'AUTO',
  shadowMode: true,
};

const context = (message: string, changes: Partial<AgentContext> = {}): AgentContext => ({
  ...sahra, message, ...changes,
});

const draft = (text: string, language: string) => ({
  text, language, generatedBy: 'secretary' as const,
});

describe('Sahra Arabic-first, English-second, never Persian', () => {
  it.each([
    ['السلام عليكم', 'ar-OM'],
    ['السلام علیکم', 'ar-OM'],
    ['سلام', 'ar-OM'],
    ['درود', 'ar-OM'],
    ['قیمت کفپوش تویوتا کمری چنده؟', 'ar-OM'],
    ['كم سعر الفرش لكامري ٢٠٢٢؟', 'ar-OM'],
    ['عندكم PPF ولا 5D؟', 'ar-OM'],
    ['عازل LED', 'ar-OM'],
    ['PPF', 'ar-OM'],
    ['5D', 'ar-OM'],
    ['Hi', 'en'],
    ['Hello!', 'en'],
    ['How much for a Toyota Camry 2022?', 'en'],
    ['Do you have floor mats?', 'en'],
  ])('chooses language for %s', (message, expected) => {
    expect(sahraCustomerReplyLanguage(context(message))).toBe(expected);
  });

  it('keeps short neutral English turns in English after explicit English history', () => {
    const history = [{ direction: 'INBOUND' as const, body: 'Can you install PPF for my car?' }];
    for (const message of ['ok', 'PPF', 'yes']) {
      expect(sahraCustomerReplyLanguage(context(message, { conversationHistory: history }))).toBe('en');
    }
  });

  it('does not inherit old Persian or English when a new Persian/Arabic enquiry arrives', () => {
    const history = [{ direction: 'INBOUND' as const, body: 'How much is window tint?' }];
    expect(sahraCustomerReplyLanguage(context('قیمت کفپوش چنده؟', { language: 'en', conversationHistory: history }))).toBe('ar-OM');
    expect(sahraCustomerReplyLanguage(context('كم سعر الفرش؟', { language: 'en', conversationHistory: history }))).toBe('ar-OM');
  });

  it('forbids Persian even when tagged ar-OM or English, while accepting Arabic mixed with PPF', () => {
    const arabic = context('عندكم PPF؟');
    expect(sahraCustomerDraftAllowed(arabic, draft('حياك الله، حماية البوية PPF تحتاج تأكيد الفريق.', 'ar-OM'))).toBe(true);
    expect(sahraCustomerDraftAllowed(arabic, draft('سلام، خوش آمدید، قیمت کفپوش مشخص نیست.', 'ar-OM'))).toBe(false);
    expect(sahraCustomerDraftAllowed(arabic, draft('الفرش متوفر', 'fa'))).toBe(false);
    expect(sahraCustomerDraftAllowed(arabic, draft('Hello, we can help you.', 'ar-OM'))).toBe(false);
    expect(sahraCustomerDraftAllowed(context('Hi'), draft('Hello! How can we help you?', 'en'))).toBe(true);
    expect(sahraCustomerDraftAllowed(context('Hi'), draft('مرحبا حياك الله', 'ar-OM'))).toBe(false);
  });

  it('isolates Sahra rule from another Omani business', () => {
    const different = context('سلام', { servingBusiness: { name: 'Example Omani Clinic', countryCode: 'OM' } });
    expect(isSahraCustomerContext(different)).toBe(false);
    expect(standaloneGreetingReply(different)?.language).toBe('fa');
    expect(isSahraCustomerContext(sahra)).toBe(true);
  });

  it('responds to a Persian greeting in natural Omani Arabic without product memory leakage', () => {
    const result = standaloneGreetingReply(context('سلام', {
      conversationHistory: [{ direction: 'INBOUND', body: 'قیمت کفپوش چنده؟' }],
    }));
    expect(result?.language).toBe('ar-OM');
    expect(result?.text).toContain('حياك الله');
    expect(result?.text).not.toMatch(/کفپوش|قیمت|فارسی|37/);
  });

  it('sets the culture agent language to Arabic instead of Persian', async () => {
    const result = await executeAgent('culture_locale', context('قیمت کفپوش چنده؟'));
    expect(result.data).toMatchObject({ locale: 'ar-OM', dialect: 'omani' });
  });

  it('keeps a Persian floor-mat quote clarification in Arabic and does not invent a price', () => {
    const reply = safeVehicleQuoteClarification(context('قیمت کفپوش تویوتا کمری ۲۰۲۲ چنده؟'));
    expect(reply?.draft.language).toBe('ar-OM');
    expect(reply?.draft.text).toMatch(/السعر|سعر/);
    expect(reply?.draft.text).not.toMatch(/قیمت|کفپوش|37|٣٧/);
  });

  it('keeps a Persian floor-mat service follow-up in Arabic', () => {
    const reply = safeOmaniConversationClarification(context('کفپوش تویوتا کمری ۲۰۲۲ دارید؟'));
    expect(reply?.draft.language).toBe('ar-OM');
    expect(reply?.draft.text).toContain('فرش الأرضيات');
    expect(reply?.draft.text).not.toMatch(/کفپوش|قیمت/);
  });

  it('recovers an invalid Farsi model reply safely without weakening Shadow Mode', async () => {
    const fixture: AgentRuntime = {
      async run(agent): Promise<AgentResult> {
        return {
          agent, confidence: 0.94, summary: 'test model', evidence: [], blockers: [],
          data: agent === 'secretary'
            ? { customer_reply: 'قیمت کفپوش برای ماشین شما ۳۷ ریال است.', customer_reply_language: 'fa' }
            : {},
        };
      },
    };
    const result = await processInboundMessage(context('قیمت کفپوش تویوتا کمری ۲۰۲۲ چنده؟'), undefined, fixture);
    expect(result.draft.language).toBe('ar-OM');
    expect(result.draft.text).not.toMatch(/قیمت|کفپوش|۳۷|37/);
    expect(result.trace.guardrails).toContain('SAHRA_CUSTOMER_ARABIC_ENGLISH_ONLY');
    expect(result.trace.delivery).toBe('REVIEW');
  });
});
