import type { AgentContext, ReplyDraft } from './contracts';
import { detectHighConfidenceMessageLanguage } from '@/lib/outreach/locale';
import { isSahraCustomerContext, sahraCustomerReplyLanguage } from './sahra-customer-language';

type GreetingKind = 'ar' | 'fa' | 'en' | 'shared';

export function standaloneGreetingKind(message: string): GreetingKind | null {
  const text = String(message ?? '').normalize('NFKC').toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/ک/g, 'ك').replace(/ی/g, 'ي')
    .replace(/[؟?!.,،؛\s]+$/gu, '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  if (/^(?:السلام عليكم(?: ورحمة الله(?: وبركاته)?)?|وعليكم السلام(?: ورحمة الله(?: وبركاته)?)?|مرحبا|هلا|يا هلا|هلا والله|اهلا(?: وسهلا)?|صباح الخير|مساء الخير)$/u.test(text)) return 'ar';
  if (/^(?:درود|صبح بخير|عصر بخير|شب بخير)$/u.test(text)) return 'fa';
  if (/^(?:hi|hello|hey|good morning|good afternoon|good evening)$/i.test(text)) return 'en';
  if (text === 'سلام') return 'shared';
  return null;
}

export function isStandaloneGreeting(message: string) {
  return standaloneGreetingKind(message) !== null;
}

/** A zero-cost, current-turn-only response. Never revive an old quote, offer or service. */
export function standaloneGreetingReply(context: AgentContext): ReplyDraft | null {
  const kind = standaloneGreetingKind(context.message);
  if (!kind) return null;
  const previousCustomerLanguage = [...(context.conversationHistory ?? [])].reverse()
    .filter(item => item.direction === 'INBOUND')
    .map(item => detectHighConfidenceMessageLanguage(item.body))
    .find(lang => lang === 'fa' || lang === 'ar' || lang === 'en');
  const remembered = previousCustomerLanguage ?? context.language;
  const language = isSahraCustomerContext(context) ? sahraCustomerReplyLanguage(context) : kind === 'shared'
    ? (String(remembered ?? context.marketLocaleStyle?.primaryLocale ?? 'ar-OM').toLowerCase().startsWith('fa') ? 'fa' : 'ar-OM')
    : kind === 'ar' ? (context.marketLocaleStyle?.primaryLocale?.toLowerCase() === 'ar-om' ? 'ar-OM' : 'ar')
      : kind;
  const isSahra = /(?:\bsahra\b|صحرا)/i.test(String(context.servingBusiness?.name ?? context.businessName ?? ''));
  const text = language === 'fa'
    ? `سلام، خوش اومدید${isSahra ? ' به مرکز صحرا' : ''}. چطور می‌تونیم کمکتون کنیم؟`
    : language.startsWith('ar')
      ? `${/^(?:السلام|وعليكم)/iu.test(context.message.trim()) ? 'وعليكم السلام ورحمة الله 🌷' : 'يا هلا وسهلا 🌷'} حياك الله${isSahra ? ' في مركز صحرا' : ''}، كيف نقدر نخدمك اليوم؟`
      : `Hello! Welcome${isSahra ? ' to Sahra' : ''}. How can we help you today?`;
  return { text, language, generatedBy: 'secretary' };
}
