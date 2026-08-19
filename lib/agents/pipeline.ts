import type { AgentContext, AgentResult, PipelineTrace } from './contracts';
import { routeAgents } from './router';
import { checkRelevance, decideCommercialAction, executeAgent, secretaryCompose } from './executor';
import { canAutoSend, evaluateHandoff } from '@/lib/handoff/policy';

const inferHandoffSignals = (message: string) => {
  const text = message.toLowerCase();
  return {
    asksHuman: /(human|person|manager|someone|موظف|شخص|مدير)/i.test(text),
    asksMeeting: /(meeting|call|zoom|meet|مكالمة|اجتماع)/i.test(text),
    asksPayment: /(payment|pay|invoice|deposit|دفع|فاتورة|عربون)/i.test(text),
    complaint: /(complaint|unhappy|bad service|شكوى|مشكلة|غير راضي)/i.test(text),
  };
};

export async function processInboundMessage(context: AgentContext, controls?: { agentsPaused?: boolean }) {
  const routedAgents = routeAgents(context);
  const specialists = routedAgents.filter((agent) => !['decision_orchestrator', 'secretary', 'relevance_checker'].includes(agent));

  const specialistResults = await Promise.all(specialists.map((agent) => executeAgent(agent, context)));
  const orchestratorResult = routedAgents.includes('decision_orchestrator')
    ? await executeAgent('decision_orchestrator', context)
    : null;
  const agentResults: AgentResult[] = orchestratorResult ? [...specialistResults, orchestratorResult] : specialistResults;

  const decision = decideCommercialAction(context, agentResults);
  const confidence = agentResults.length ? Math.min(...agentResults.map((result) => result.confidence)) : 0.9;
  const inferred = inferHandoffSignals(context.message);
  const handoff = evaluateHandoff({
    intentScore: context.intentScore,
    ...inferred,
    customQuote: decision.action === 'HUMAN' && !!context.quotedService,
    confidence,
  });

  const secretaryResult = routedAgents.includes('secretary') ? await executeAgent('secretary', context) : null;
  if (secretaryResult) agentResults.push(secretaryResult);

  const draft = secretaryCompose(context, decision, agentResults);
  const relevancePassed = checkRelevance(context, draft);
  if (routedAgents.includes('relevance_checker')) agentResults.push(await executeAgent('relevance_checker', context));

  const sendGate = canAutoSend({
    agentMode: handoff.handoff ? 'HUMAN' : context.agentMode,
    agentsPaused: controls?.agentsPaused,
    shadowMode: context.shadowMode,
  });

  const guardrails: string[] = [];
  if (!relevancePassed) guardrails.push('RELEVANCE_GATE_FAILED');
  if (sendGate.reason !== 'AUTO_ALLOWED') guardrails.push(sendGate.reason);
  if (decision.useDiscount && decision.discountPct == null) guardrails.push('DISCOUNT_WITHOUT_CONFIGURED_VALUE');

  const delivery: PipelineTrace['delivery'] = !relevancePassed
    ? 'BLOCK'
    : sendGate.delivery;

  const trace: PipelineTrace = {
    routedAgents,
    agentResults,
    decision,
    guardrails,
    handoffReasons: handoff.reasons,
    relevancePassed,
    delivery,
  };

  return {
    draft,
    trace,
    nextAgentMode: handoff.handoff ? 'HUMAN' as const : context.agentMode ?? 'AUTO' as const,
    previewRecommended: decision.action === 'SHOW_PREVIEW',
  };
}
