import type { AgentContext, AgentName, AgentResult, PipelineTrace, ReplyDraft } from './contracts';
import { buildSelectiveRoutePlan } from './selective-routing';
import { checkRelevance, decideCommercialAction, secretaryCompose } from './executor';
import { deterministicAgentRuntime, type AgentRuntime } from './runtime';
import { canAutoSend, evaluateHandoff } from '@/lib/handoff/policy';
import { resolveSmartVisionsCatalogRecommendation } from '@/lib/whatsapp/catalog';

const inferHandoffSignals = (message: string) => {
  const text = message.toLowerCase();
  return {
    asksHuman: /(human|person|manager|someone|موظف|شخص|مدير|مسؤول)/i.test(text),
    asksMeeting: /(meeting|call|zoom|meet|consultation|consult|مكالمة|اجتماع|استشارة|نتكلم)/i.test(text),
    asksPayment: /(payment|pay|invoice|deposit|contract|دفع|فاتورة|عربون|عقد)/i.test(text),
    specialDiscount: /(discount|better price|best price|reduce the price|cheaper|خصم|تخفيض|سعر أفضل|آخر سعر|ارخص|أرخص)/i.test(text),
    complaint: /(complaint|unhappy|bad service|شكوى|مشكلة|غير راضي)/i.test(text),
  };
};

function applyConfidenceThreshold(context: AgentContext, result: AgentResult) {
  const threshold = context.agentSettings?.[result.agent]?.confidenceThreshold;
  if (threshold == null || result.confidence >= threshold || result.blockers.includes('BELOW_CONFIGURED_CONFIDENCE')) return result;
  return { ...result, blockers: [...result.blockers, 'BELOW_CONFIGURED_CONFIDENCE'] };
}

export function checkHumanReplyQuality(draft: ReplyDraft) {
  const text = draft.text.trim();
  const reasons: string[] = [];
  if (!text) reasons.push('EMPTY_REPLY');
  if (text.length > 1100) reasons.push('REPLY_TOO_LONG');
  if ((text.match(/[?؟]/g) ?? []).length > 1) reasons.push('TOO_MANY_QUESTIONS');
  if (/(thank you for reaching out|we would be delighted|we are pleased to inform|dear valued customer)/i.test(text)) {
    reasons.push('CORPORATE_BOILERPLATE');
  }
  if ((text.match(/!/g) ?? []).length > 2) reasons.push('OVEREXCITED_TONE');
  return { passed: reasons.length === 0, reasons };
}

export async function processInboundMessage(
  context: AgentContext,
  controls?: { agentsPaused?: boolean },
  runtime: AgentRuntime = deterministicAgentRuntime,
) {
  const routePlan = buildSelectiveRoutePlan(context);
  const routedAgents = routePlan.agents.filter((agent) => context.agentSettings?.[agent]?.enabled !== false);
  const specialists = routedAgents.filter((agent) => !['decision_orchestrator', 'secretary', 'relevance_checker'].includes(agent));

  const shouldUsePaidRuntime = (agent: AgentName) => {
    if (runtime === deterministicAgentRuntime) return false;
    if (routePlan.tier === 'ZERO_COST') return false;
    if (routePlan.tier === 'LIGHT') return agent === 'secretary';
    return true;
  };
  const runAgent = (agent: AgentName, agentContext: AgentContext) =>
    (shouldUsePaidRuntime(agent) ? runtime : deterministicAgentRuntime).run(agent, agentContext);

  const paidAgentCallsPlanned = routedAgents.filter(shouldUsePaidRuntime).length;
  const specialistResults = (await Promise.all(specialists.map((agent) => runAgent(agent, context))))
    .map((result) => applyConfidenceThreshold(context, result));

  const orchestratorContext: AgentContext = {
    ...context,
    collaboration: { specialistResults },
  };
  const orchestratorResult = routedAgents.includes('decision_orchestrator')
    ? applyConfidenceThreshold(context, await runAgent('decision_orchestrator', orchestratorContext))
    : null;

  const agentResults: AgentResult[] = orchestratorResult ? [...specialistResults, orchestratorResult] : [...specialistResults];
  const decision = decideCommercialAction(context, agentResults);
  const confidence = agentResults.length ? Math.min(...agentResults.map((result) => result.confidence)) : 0.9;
  const inferred = inferHandoffSignals(context.message);
  const handoff = evaluateHandoff({
    intentScore: context.intentScore,
    ...inferred,
    customQuote: decision.action === 'HUMAN' && !!context.quotedService,
    confidence,
  });

  const secretaryContext: AgentContext = {
    ...context,
    collaboration: {
      specialistResults,
      orchestratorResult,
      commercialDecision: decision,
    },
  };
  const secretaryResult = routedAgents.includes('secretary')
    ? applyConfidenceThreshold(context, await runAgent('secretary', secretaryContext))
    : null;
  if (secretaryResult) agentResults.push(secretaryResult);

  const draft = secretaryCompose(context, decision, agentResults);
  const deterministicRelevance = checkRelevance(context, draft);

  const relevanceContext: AgentContext = {
    ...context,
    collaboration: {
      specialistResults,
      orchestratorResult,
      commercialDecision: decision,
      proposedReply: draft,
    },
  };
  const relevanceResult = routedAgents.includes('relevance_checker')
    ? applyConfidenceThreshold(context, await runAgent('relevance_checker', relevanceContext))
    : null;
  if (relevanceResult) agentResults.push(relevanceResult);

  const relevancePassed = deterministicRelevance && (!relevanceResult || relevanceResult.blockers.length === 0);
  const humanStyle = checkHumanReplyQuality(draft);

  const sendGate = canAutoSend({
    agentMode: handoff.handoff ? 'HUMAN' : context.agentMode,
    agentsPaused: controls?.agentsPaused,
    shadowMode: context.shadowMode,
  });

  const guardrails: string[] = [];
  if (!relevancePassed) guardrails.push('RELEVANCE_GATE_FAILED');
  if (!humanStyle.passed) guardrails.push('HUMAN_STYLE_GATE_FAILED', ...humanStyle.reasons);
  if (!routedAgents.includes('secretary')) guardrails.push('SECRETARY_DISABLED');
  if (sendGate.reason !== 'AUTO_ALLOWED') guardrails.push(sendGate.reason);
  if (decision.useDiscount && decision.discountPct == null) guardrails.push('DISCOUNT_WITHOUT_CONFIGURED_VALUE');

  let delivery: PipelineTrace['delivery'];
  if (!relevancePassed || !routedAgents.includes('secretary')) delivery = 'BLOCK';
  else if (!humanStyle.passed && sendGate.delivery === 'SEND') delivery = 'REVIEW';
  else delivery = sendGate.delivery;

  const catalogRecommendation = delivery === 'BLOCK'
    ? null
    : resolveSmartVisionsCatalogRecommendation({ serviceId: decision.serviceId, message: context.message });

  const trace: PipelineTrace = {
    reasoningTier: routePlan.tier,
    routeReasons: routePlan.reasons,
    estimatedLlmCalls: routePlan.estimatedLlmCalls,
    paidAgentCallsPlanned,
    routedAgents,
    agentResults,
    decision,
    guardrails,
    handoffReasons: handoff.reasons,
    relevancePassed,
    humanStylePassed: humanStyle.passed,
    delivery,
    catalogRecommendation,
  };

  return {
    draft,
    trace,
    nextAgentMode: handoff.handoff ? 'HUMAN' as const : context.agentMode ?? 'AUTO' as const,
    previewRecommended: decision.action === 'SHOW_PREVIEW',
    catalogRecommendation,
  };
}
