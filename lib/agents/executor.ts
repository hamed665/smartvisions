import type { AgentContext, AgentName, AgentResult, CommercialDecision, ReplyDraft } from './contracts';
import { getLocaleProfile, chooseLanguage } from '@/lib/outreach/locale';

const lower = (value: string) => value.toLowerCase();

export async function executeAgent(agent: AgentName, context: AgentContext): Promise<AgentResult> {
  const text = lower(context.message);
  const evidence = context.verifiedEvidence ?? [];

  switch (agent) {
    case 'intent_discovery': {
      const askedPrice = /(price|cost|how much|السعر|كم|تكلفة)/i.test(text);
      const askedMeeting = /(meeting|call|zoom|مكالمة|اجتماع)/i.test(text);
      const askedPayment = /(payment|pay|invoice|deposit|دفع|فاتورة|عربون)/i.test(text);
      const askedPreview = /(preview|mockup|sample|example|معاينة|نموذج|مثال)/i.test(text);
      return { agent, confidence: 0.92, summary: 'Detected explicit commercial intent signals.', data: { askedPrice, askedMeeting, askedPayment, askedPreview }, evidence: [], blockers: [] };
    }
    case 'conversation_psychology': {
      const priceObjection = /(expensive|too much|غالي|مرتف)/i.test(text);
      const hesitation = /(not sure|think about|مو متأكد|بفكر)/i.test(text);
      return { agent, confidence: 0.82, summary: 'Conversation state assessed without sensitive-trait inference.', data: { priceObjection, hesitation, urgency: /(today|urgent|asap|اليوم|عاجل)/i.test(text) }, evidence: [], blockers: [] };
    }
    case 'business_analyst':
      return { agent, confidence: evidence.length ? 0.88 : 0.62, summary: evidence.length ? 'Business recommendation grounded in verified evidence.' : 'Business evidence is incomplete.', data: { recommendedOffer: context.quotedService ?? null, industry: context.industry ?? null }, evidence, blockers: evidence.length ? [] : ['MISSING_VERIFIED_BUSINESS_EVIDENCE'] };
    case 'culture_locale': {
      const marketCode = (context.countryCode ?? 'OM') as Parameters<typeof getLocaleProfile>[0];
      const profile = getLocaleProfile(marketCode);
      return { agent, confidence: 0.95, summary: 'Localized language, dialect and tone selected.', data: { locale: chooseLanguage({ marketCode, preferredLanguage: context.language }), dialect: profile.dialect, tone: profile.tone }, evidence, blockers: [] };
    }
    case 'sales_marketing': {
      const wantsExample = /(preview|sample|example|mockup|معاينة|نموذج|مثال)/i.test(text);
      return { agent, confidence: 0.84, summary: 'Recommended the lowest-pressure next commercial action.', data: { nextAction: wantsExample ? 'SHOW_PREVIEW' : (context.intentScore ?? 0) >= 70 ? 'HUMAN' : 'ANSWER', scopeReductionPreferred: /(expensive|غالي)/i.test(text) }, evidence, blockers: [] };
    }
    case 'evidence_checker':
      return { agent, confidence: evidence.length ? 0.96 : 0.55, summary: evidence.length ? 'Claims can be grounded in available evidence.' : 'Critical business-specific claims must be omitted or escalated.', data: { verifiedEvidenceCount: evidence.length, priceVerified: context.quotedPrice != null }, evidence, blockers: evidence.length ? [] : ['NO_VERIFIED_EVIDENCE'] };
    case 'preview_director':
      return { agent, confidence: context.businessName && context.industry ? 0.9 : 0.6, summary: 'Preview eligibility and vertical direction assessed.', data: { eligible: !!context.businessName && ((context.intentScore ?? 0) >= 60 || /(preview|sample|example|معاينة|نموذج)/i.test(text)), industry: context.industry ?? 'general' }, evidence, blockers: context.businessName ? [] : ['BUSINESS_NAME_REQUIRED'] };
    case 'decision_orchestrator':
      return { agent, confidence: 0.87, summary: 'Specialist outputs should be combined into one constrained commercial decision.', data: {}, evidence, blockers: [] };
    case 'secretary':
      return { agent, confidence: 0.9, summary: 'Secretary is the only customer-facing composer.', data: {}, evidence, blockers: [] };
    case 'relevance_checker':
      return { agent, confidence: 0.9, summary: 'Final reply must answer the prospect’s explicit question first.', data: { requiredTerms: /(price|cost|how much|السعر|كم)/i.test(text) ? ['price'] : [] }, evidence: [], blockers: [] };
  }
}

export function decideCommercialAction(context: AgentContext, results: AgentResult[]): CommercialDecision {
  const byName = new Map(results.map((result) => [result.agent, result]));
  const intent = byName.get('intent_discovery')?.data as Record<string, boolean> | undefined;
  const sales = byName.get('sales_marketing')?.data as { nextAction?: CommercialDecision['action'] } | undefined;
  const lowConfidence = results.some((result) => result.confidence < 0.65 && result.blockers.length > 0);

  return {
    action: lowConfidence ? 'HUMAN' : sales?.nextAction ?? (intent?.askedMeeting ? 'MEETING' : 'ANSWER'),
    serviceId: context.quotedService,
    useDiscount: false,
    explainValue: true,
    askLowPressureCta: true,
    requiresHuman: lowConfidence || (context.intentScore ?? 0) >= 70 || !!intent?.askedPayment || !!intent?.askedMeeting,
    reasons: lowConfidence ? ['CRITICAL_EVIDENCE_OR_CONFIDENCE_GAP'] : ['SPECIALIST_CONSENSUS'],
  };
}

export function secretaryCompose(context: AgentContext, decision: CommercialDecision, results: AgentResult[]): ReplyDraft {
  const culture = results.find((result) => result.agent === 'culture_locale')?.data as { locale?: string; reply_language?: string } | undefined;
  const locale = culture?.reply_language ?? culture?.locale ?? 'en-US';
  const secretaryData = results.find((result) => result.agent === 'secretary')?.data as { customer_reply?: unknown; customer_reply_language?: unknown; customerText?: unknown; language?: unknown } | undefined;
  const rawText = secretaryData?.customer_reply ?? secretaryData?.customerText;
  const rawLanguage = secretaryData?.customer_reply_language ?? secretaryData?.language;
  const runtimeText = typeof rawText === 'string' ? rawText.trim() : '';
  const runtimeLanguage = typeof rawLanguage === 'string' ? rawLanguage : locale;

  if (runtimeText) {
    return { text: runtimeText, language: runtimeLanguage, generatedBy: 'secretary' };
  }

  const asksPrice = /(price|cost|how much|السعر|كم|تكلفة)/i.test(context.message);
  const asksPreview = /(preview|sample|example|mockup|معاينة|نموذج|مثال)/i.test(context.message);

  let text: string;
  if (asksPrice && context.quotedPrice != null && context.quotedCurrency) {
    text = `The configured price is ${context.quotedPrice} ${context.quotedCurrency}. I can keep the scope focused on what you actually need rather than padding the package.`;
  } else if (asksPreview && decision.action === 'SHOW_PREVIEW') {
    text = `I can show you a tailored concept based on the business, so you can judge the direction before discussing a full build.`;
  } else {
    text = `I’ve checked the request and the best next step is to answer the specific point first, then only move forward if it fits the business.`;
  }

  return { text, language: locale, generatedBy: 'secretary' };
}

export function checkRelevance(context: AgentContext, draft: ReplyDraft) {
  const asksPrice = /(price|cost|how much|السعر|كم|تكلفة)/i.test(context.message);
  if (asksPrice && !/(price|cost|OMR|AED|SAR|QAR|GBP|USD|ريال|درهم|دولار|£|\$)/i.test(draft.text)) return false;
  const asksPreview = /(preview|sample|example|mockup|معاينة|نموذج|مثال)/i.test(context.message);
  if (asksPreview && !/(preview|concept|sample|معاينة|نموذج|تصور)/i.test(draft.text)) return false;
  return true;
}
