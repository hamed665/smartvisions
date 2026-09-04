import type { AgentContext, AgentName, AgentResult, CommercialDecision, ReplyDraft } from './contracts';
import { getLocaleProfile, chooseLanguage } from '@/lib/outreach/locale';
import { decidePreviewStrategy, previewIntent } from './preview-policy';

const lower = (value: string) => value.toLowerCase();
const VALID_ACTIONS = new Set<CommercialDecision['action']>(['ANSWER','ASK','OFFER','SHOW_PREVIEW','MEETING','WAIT','HUMAN']);

function configuredKnowledgeAvailable(context: AgentContext) {
  return Boolean((context.verifiedEvidence?.length ?? 0) > 0 || (context.serviceKnowledge?.length ?? 0) > 0 || (context.knowledgeContext?.length ?? 0) > 0);
}

function normalizedAction(value: unknown): CommercialDecision['action'] | undefined {
  const action = String(value ?? '').trim().toUpperCase() as CommercialDecision['action'];
  return VALID_ACTIONS.has(action) ? action : undefined;
}

export async function executeAgent(agent: AgentName, context: AgentContext): Promise<AgentResult> {
  const text = lower(context.message);
  const evidence = context.verifiedEvidence ?? [];
  const hasKnowledge = configuredKnowledgeAvailable(context);
  const preview = decidePreviewStrategy({ message: context.message, approvedPortfolio: context.approvedPortfolio });
  const previewSignals = previewIntent(context.message);

  switch (agent) {
    case 'intent_discovery': {
      const askedPrice = /(price|cost|how much|discount|best price|السعر|كم|تكلفة|خصم|تخفيض|آخر سعر)/i.test(text);
      const askedMeeting = /(meeting|call|zoom|consultation|consult|مكالمة|اجتماع|استشارة)/i.test(text);
      const askedPayment = /(payment|pay|invoice|deposit|contract|دفع|فاتورة|عربون|عقد)/i.test(text);
      return { agent, confidence: 0.92, summary: 'Detected explicit commercial intent signals.', data: { askedPrice, askedMeeting, askedPayment, askedPreview: previewSignals.customPreviewRequested, askedPortfolio: previewSignals.portfolioRequested }, evidence: [], blockers: [] };
    }
    case 'conversation_psychology': {
      const priceObjection = /(expensive|too much|discount|better price|cheaper|غالي|مرتف|خصم|تخفيض|سعر أفضل|أرخص)/i.test(text);
      const hesitation = /(not sure|think about|hesitant|مو متأكد|بفكر|متردد)/i.test(text);
      return { agent, confidence: 0.82, summary: 'Conversation state assessed without sensitive-trait inference.', data: { priceObjection, hesitation, urgency: /(today|urgent|asap|اليوم|عاجل)/i.test(text) }, evidence: [], blockers: [] };
    }
    case 'business_analyst':
      return {
        agent,
        confidence: hasKnowledge ? 0.88 : 0.62,
        summary: hasKnowledge ? 'Business recommendation grounded in supplied evidence and canonical service knowledge.' : 'Business evidence is incomplete.',
        data: { recommendedOffer: context.quotedService ?? null, industry: context.industry ?? null, serviceCount: context.serviceKnowledge?.length ?? 0 },
        evidence,
        blockers: hasKnowledge ? [] : ['MISSING_VERIFIED_BUSINESS_EVIDENCE'],
      };
    case 'culture_locale': {
      const marketCode = (context.countryCode ?? 'OM') as Parameters<typeof getLocaleProfile>[0];
      const profile = getLocaleProfile(marketCode);
      return { agent, confidence: 0.95, summary: 'Localized language, dialect and tone selected.', data: { locale: chooseLanguage({ marketCode, preferredLanguage: context.language }), dialect: context.dialect ?? profile.dialect, tone: profile.tone }, evidence, blockers: [] };
    }
    case 'sales_marketing':
      return {
        agent,
        confidence: 0.84,
        summary: 'Recommended the lowest-pressure next commercial action.',
        data: {
          nextAction: preview.strategy === 'CUSTOM_PREVIEW' ? 'SHOW_PREVIEW' : (context.intentScore ?? 0) >= 70 ? 'HUMAN' : 'ANSWER',
          showPortfolio: preview.strategy === 'SHOW_PORTFOLIO',
          scopeReductionPreferred: /(expensive|discount|cheaper|غالي|خصم|أرخص)/i.test(text),
        },
        evidence,
        blockers: [],
      };
    case 'evidence_checker': {
      const priceVerified = context.quotedPrice != null || context.serviceKnowledge?.some((service) => service.marketPrice != null) === true;
      return {
        agent,
        confidence: hasKnowledge || priceVerified ? 0.96 : 0.55,
        summary: hasKnowledge || priceVerified ? 'Claims can be grounded in available evidence or canonical configuration.' : 'Critical business-specific claims must be omitted or escalated.',
        data: { verifiedEvidenceCount: evidence.length, priceVerified, serviceKnowledgeCount: context.serviceKnowledge?.length ?? 0 },
        evidence,
        blockers: hasKnowledge || priceVerified ? [] : ['NO_VERIFIED_EVIDENCE'],
      };
    }
    case 'preview_director':
      return {
        agent,
        confidence: context.businessName ? 0.92 : 0.68,
        summary: 'Portfolio-first preview policy assessed deterministically.',
        data: {
          showPortfolio: preview.strategy === 'SHOW_PORTFOLIO',
          portfolioExamples: preview.approvedExamples,
          customPreviewRequested: previewSignals.customPreviewRequested,
          eligible: preview.strategy === 'CUSTOM_PREVIEW' && Boolean(context.businessName),
          industry: context.industry ?? 'general',
        },
        evidence,
        blockers: preview.strategy === 'CUSTOM_PREVIEW' && !context.businessName ? ['BUSINESS_NAME_REQUIRED'] : [],
      };
    case 'decision_orchestrator': {
      const specialistResults = context.collaboration?.specialistResults ?? [];
      const sales = specialistResults.find((item) => item.agent === 'sales_marketing')?.data as { nextAction?: unknown } | undefined;
      const blocked = specialistResults.some((item) => item.blockers.length > 0 && item.confidence < 0.65);
      return {
        agent,
        confidence: blocked ? 0.62 : 0.9,
        summary: 'Specialist outputs reconciled into one constrained commercial direction.',
        data: { recommended_action: blocked ? 'HUMAN' : normalizedAction(sales?.nextAction) ?? 'ANSWER' },
        evidence,
        blockers: blocked ? ['SPECIALIST_CONFIDENCE_OR_EVIDENCE_GAP'] : [],
      };
    }
    case 'secretary':
      return { agent, confidence: 0.9, summary: 'Secretary is the only customer-facing composer.', data: {}, evidence, blockers: [] };
    case 'relevance_checker': {
      const proposed = context.collaboration?.proposedReply?.text?.trim();
      if (!proposed) return { agent, confidence: 1, summary: 'No actual draft was supplied for relevance checking.', data: { proposedReplyPresent: false }, evidence: [], blockers: ['MISSING_PROPOSED_REPLY'] };
      return { agent, confidence: 0.94, summary: 'The actual proposed reply is available for direct relevance checking.', data: { proposedReplyPresent: true }, evidence: [], blockers: [] };
    }
  }
}

export function decideCommercialAction(context: AgentContext, results: AgentResult[]): CommercialDecision {
  const byName = new Map(results.map((result) => [result.agent, result]));
  const intent = byName.get('intent_discovery')?.data as Record<string, boolean> | undefined;
  const sales = byName.get('sales_marketing')?.data as { nextAction?: unknown } | undefined;
  const orchestrator = byName.get('decision_orchestrator')?.data as { recommended_action?: unknown; recommendedAction?: unknown } | undefined;
  const lowConfidence = results.some((result) => result.confidence < 0.65 && result.blockers.length > 0);
  const orchestratedAction = normalizedAction(orchestrator?.recommended_action ?? orchestrator?.recommendedAction);
  const salesAction = normalizedAction(sales?.nextAction);
  const proposedAction = lowConfidence ? 'HUMAN' : orchestratedAction ?? salesAction ?? (intent?.askedMeeting ? 'MEETING' : 'ANSWER');
  const preview = decidePreviewStrategy({ message: context.message, approvedPortfolio: context.approvedPortfolio });
  const action = proposedAction === 'SHOW_PREVIEW' && preview.strategy !== 'CUSTOM_PREVIEW' ? 'ANSWER' : proposedAction;

  return {
    action,
    serviceId: context.quotedService,
    useDiscount: false,
    explainValue: true,
    askLowPressureCta: action !== 'WAIT' && action !== 'HUMAN',
    requiresHuman: lowConfidence || action === 'HUMAN' || (context.intentScore ?? 0) >= 70 || !!intent?.askedPayment || !!intent?.askedMeeting,
    reasons: lowConfidence
      ? ['CRITICAL_EVIDENCE_OR_CONFIDENCE_GAP']
      : proposedAction === 'SHOW_PREVIEW' && action !== 'SHOW_PREVIEW'
        ? ['PORTFOLIO_BEFORE_FREE_CUSTOM_WORK']
        : ['SPECIALIST_CONSENSUS'],
  };
}

export function secretaryCompose(context: AgentContext, decision: CommercialDecision, results: AgentResult[]): ReplyDraft {
  const culture = results.find((result) => result.agent === 'culture_locale')?.data as { locale?: string; reply_language?: string } | undefined;
  const locale = culture?.reply_language ?? culture?.locale ?? context.language ?? 'en-US';
  const secretaryData = results.find((result) => result.agent === 'secretary')?.data as { customer_reply?: unknown; customer_reply_language?: unknown; customerText?: unknown; language?: unknown } | undefined;
  const rawText = secretaryData?.customer_reply ?? secretaryData?.customerText;
  const rawLanguage = secretaryData?.customer_reply_language ?? secretaryData?.language;
  const runtimeText = typeof rawText === 'string' ? rawText.trim() : '';
  const runtimeLanguage = typeof rawLanguage === 'string' ? rawLanguage : locale;

  if (runtimeText) {
    return { text: runtimeText, language: runtimeLanguage, generatedBy: 'secretary' };
  }

  const asksPrice = /(price|cost|how much|السعر|كم|تكلفة)/i.test(context.message);
  const preview = decidePreviewStrategy({ message: context.message, approvedPortfolio: context.approvedPortfolio });
  const simpleThanks = /^(thanks|thank you|thx|شكرا|شكراً|مشكور|مشكورة|تسلم|تسلمين)[.!\s]*$/i.test(context.message.trim());

  let text: string;
  if (simpleThanks) {
    text = /[\u0600-\u06FF]/.test(context.message) ? 'العفو، حاضرين.' : 'You’re welcome.';
  } else if (asksPrice && context.quotedPrice != null && context.quotedCurrency) {
    text = `The configured price is ${context.quotedPrice} ${context.quotedCurrency}.`;
  } else if (preview.strategy === 'SHOW_PORTFOLIO') {
    text = `Here are relevant approved examples: ${preview.approvedExamples.slice(0, 2).join(' | ')}`;
  } else if (preview.strategy === 'CUSTOM_PREVIEW' && decision.action === 'SHOW_PREVIEW') {
    text = 'You asked for a custom preview. I can prepare one based on the verified business context rather than generating a generic concept.';
  } else {
    text = 'I can help with that. I’ll keep the answer focused on what’s relevant to your business.';
  }

  return { text, language: locale, generatedBy: 'secretary' };
}

export function checkRelevance(context: AgentContext, draft: ReplyDraft) {
  const asksPrice = /(price|cost|how much|السعر|كم|تكلفة)/i.test(context.message);
  if (asksPrice && !/(price|cost|OMR|AED|SAR|QAR|GBP|USD|ريال|درهم|دولار|£|\$)/i.test(draft.text)) return false;
  const asksExample = /(preview|sample|example|mockup|portfolio|past work|معاينة|نموذج|مثال|نمونه.?کار|أمثلة|امثلة)/i.test(context.message);
  if (asksExample && !/(preview|concept|sample|example|portfolio|approved|معاينة|نموذج|تصور|مثال|نمونه|أمثلة|امثلة)/i.test(draft.text)) return false;
  return true;
}
