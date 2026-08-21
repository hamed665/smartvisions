import type { AgentContext, AgentName } from './contracts';

export type ReasoningTier = 'ZERO_COST' | 'LIGHT' | 'FULL';

export type SelectiveRoutePlan = {
  tier: ReasoningTier;
  agents: AgentName[];
  reasons: string[];
  estimatedLlmCalls: number;
};

const has = (pattern: RegExp, text: string) => pattern.test(text);

export function buildSelectiveRoutePlan(context: AgentContext): SelectiveRoutePlan {
  const text = context.message.trim();
  const lower = text.toLowerCase();

  if (/^(thanks|thank you|thx|شكرا|شكراً|مشكور|مشكورة|تسلم|تسلمين)[.!\s]*$/i.test(text)) {
    return { tier: 'ZERO_COST', agents: ['secretary'], reasons: ['SIMPLE_ACKNOWLEDGEMENT'], estimatedLlmCalls: 0 };
  }

  const asksPrice = has(/(price|cost|how much|quote|budget|السعر|كم|تكلفة|عرض سعر)/i, lower);
  const asksMeeting = has(/(meeting|call|zoom|meet|مكالمة|اجتماع|نتكلم)/i, lower);
  const asksPayment = has(/(payment|pay|invoice|deposit|دفع|فاتورة|عربون)/i, lower);
  const asksPreview = has(/(preview|mockup|sample|example|show.*design|معاينة|نموذج|مثال|تصميم)/i, lower);
  const objection = has(/(expensive|too much|not sure|hesitant|think about|غالي|مرتف|مو متأكد|بفكر)/i, lower);
  const technical = has(/(integration|api|booking|payment gateway|wordpress|next\.js|تكامل|دفع|حجز)/i, lower);
  const hasVerifiedQuote = context.quotedPrice != null && !!context.quotedCurrency;
  const highIntent = (context.intentScore ?? 0) >= 70;

  if (asksPrice && hasVerifiedQuote && !asksMeeting && !asksPayment && !objection && !technical && !asksPreview) {
    return {
      tier: 'ZERO_COST',
      agents: ['intent_discovery', 'evidence_checker', 'secretary', 'relevance_checker'],
      reasons: ['CONFIGURED_PRICE_ALREADY_AVAILABLE', 'NO_NEGOTIATION_REQUIRED'],
      estimatedLlmCalls: 0,
    };
  }

  if (!asksMeeting && !asksPayment && !objection && !technical && !asksPreview && !highIntent) {
    return {
      tier: 'LIGHT',
      agents: ['intent_discovery', 'culture_locale', 'sales_marketing', 'decision_orchestrator', 'secretary', 'relevance_checker'],
      reasons: ['ROUTINE_REPLY', 'NO_COMPLEX_COMMERCIAL_SIGNAL'],
      estimatedLlmCalls: 1,
    };
  }

  const agents = new Set<AgentName>(['intent_discovery', 'business_analyst', 'sales_marketing', 'evidence_checker']);
  if (objection) agents.add('conversation_psychology');
  if (asksMeeting || objection || highIntent) agents.add('culture_locale');
  if (asksPreview) agents.add('preview_director');
  agents.add('decision_orchestrator');
  agents.add('secretary');
  agents.add('relevance_checker');

  const reasons: string[] = [];
  if (asksMeeting) reasons.push('MEETING_INTENT');
  if (asksPayment) reasons.push('PAYMENT_INTENT');
  if (objection) reasons.push('OBJECTION_OR_HESITATION');
  if (technical) reasons.push('TECHNICAL_SCOPE');
  if (asksPreview) reasons.push('PREVIEW_REQUEST');
  if (highIntent) reasons.push('HIGH_INTENT_SCORE');

  return { tier: 'FULL', agents: [...agents], reasons, estimatedLlmCalls: Math.max(1, agents.size - 3) };
}
