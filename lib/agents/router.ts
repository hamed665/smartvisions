import type { AgentContext, AgentName } from './contracts';

const lower = (text: string) => text.toLowerCase();

export function routeAgents(context: AgentContext): AgentName[] {
  const text = lower(context.message);
  const agents = new Set<AgentName>();

  const simpleThanks = /^(thanks|thank you|thx|شكرا|شكراً|مشكور|مشكورة|تسلم|تسلمين)[.!\s]*$/i.test(context.message.trim());
  if (simpleThanks) return ['secretary'];

  const asksPrice = /(price|cost|how much|quote|budget|السعر|كم|تكلفة|عرض سعر)/i.test(text);
  const asksTimeline = /(timeline|how long|delivery|when can|مدة|متى|كم يوم)/i.test(text);
  const asksPortfolio = /(portfolio|example|sample|show me|نماذج|مثال|أشوف|ورني)/i.test(text);
  const asksMeeting = /(meeting|call|zoom|meet|مكالمة|اجتماع|نتكلم)/i.test(text);
  const objection = /(expensive|too much|not sure|hesitant|think about|غالي|مرتف|مو متأكد|بفكر)/i.test(text);
  const technical = /(integration|api|booking|payment gateway|wordpress|next\.js|واتساب|تكامل|دفع|حجز)/i.test(text);
  const previewIntent = /(preview|mockup|design idea|show.*design|تصميم|معاينة|نموذج للموقع)/i.test(text);

  agents.add('intent_discovery');

  if (asksPrice || asksTimeline || asksPortfolio || technical) {
    agents.add('business_analyst');
    agents.add('sales_marketing');
    agents.add('evidence_checker');
  }

  if (objection) {
    agents.add('conversation_psychology');
    agents.add('culture_locale');
    agents.add('sales_marketing');
  }

  if (asksMeeting || (context.intentScore ?? 0) >= 70) {
    agents.add('business_analyst');
    agents.add('culture_locale');
    agents.add('sales_marketing');
    agents.add('evidence_checker');
  }

  if (previewIntent || asksPortfolio) {
    agents.add('preview_director');
    agents.add('business_analyst');
    agents.add('culture_locale');
    agents.add('sales_marketing');
    agents.add('evidence_checker');
  }

  if (agents.size === 1) {
    agents.add('culture_locale');
    agents.add('sales_marketing');
  }

  agents.add('decision_orchestrator');
  agents.add('secretary');
  agents.add('relevance_checker');

  return [...agents];
}
