import type {
  AgentContext,
  AgentExecutionTrace,
  AgentName,
  AgentResult,
  AgentToolProposal,
  CommercialDecision,
  PipelineTrace,
  ReplyDraft,
  ToolProposalTrace,
} from './contracts';
import { buildSelectiveRoutePlan } from './selective-routing';
import { checkRelevance, decideCommercialAction, secretaryCompose } from './executor';
import { draftOffersUnrequestedCustomPreview } from './preview-policy';
import { deterministicAgentRuntime, executeBoundedAgent, type AgentRuntime } from './runtime';
import { proposalTrace } from './tool-proposals';
import { canAutoSend, evaluateHandoff } from '@/lib/handoff/policy';
import { evaluateSalesReplyPolicy, inferSalesHandoffSignals } from '@/lib/conversations/sales-behavior';
import { resolveSmartVisionsCatalogRecommendation } from '@/lib/whatsapp/catalog';
import { replyMatchesHighConfidenceMessageLanguage } from '@/lib/outreach/locale';
function applyConfidenceThreshold(context: AgentContext, result: AgentResult) {
  const threshold = context.agentSettings?.[result.agent]?.confidenceThreshold;
  if (threshold == null || result.confidence >= threshold || result.blockers.includes('BELOW_CONFIGURED_CONFIDENCE')) {
    return result;
  }
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
export type PipelineHooks = {
  proposeTool?: (input: {
    context: AgentContext;
    specialistResults: AgentResult[];
    orchestratorResult: AgentResult | null;
    decision: CommercialDecision;
  }) => AgentToolProposal | null;
  executeToolProposal?: (input: {
    context: AgentContext;
    proposal: AgentToolProposal;
    trace: ToolProposalTrace;
    specialistResults: AgentResult[];
    orchestratorResult: AgentResult | null;
    decision: CommercialDecision;
  }) => Promise<Record<string, unknown> | undefined>;
};

function blockedPipelineResult(
  context: AgentContext,
  routePlan: ReturnType<typeof buildSelectiveRoutePlan>,
  routedAgents: AgentName[],
  disabledAgents: AgentName[],
  reason: string,
) {
  const requiresHuman = context.agentMode === 'HUMAN';
  const decision: CommercialDecision = {
    action: requiresHuman ? 'HUMAN' : 'WAIT',
    useDiscount: false,
    explainValue: false,
    askLowPressureCta: false,
    requiresHuman,
    reasons: [reason],
  };
  const trace: PipelineTrace = {
    reasoningTier: routePlan.tier,
    routeReasons: routePlan.reasons,
    estimatedLlmCalls: routePlan.estimatedLlmCalls,
    paidAgentCallsPlanned: 0,
    routedAgents,
    disabledAgents,
    agentResults: [],
    agentExecutions: [],
    toolProposals: [],
    decision,
    guardrails: [reason],
    handoffReasons: requiresHuman ? [reason] : [],
    relevancePassed: false,
    delivery: 'BLOCK',
    catalogRecommendation: null,
  };
  return {
    draft: {
      text: '',
      language: context.language ?? 'unknown',
      generatedBy: 'secretary' as const,
    },
    trace,
    nextAgentMode: context.agentMode ?? 'PAUSED' as const,
    previewRecommended: false,
    catalogRecommendation: null,
  };
}
export async function processInboundMessage(
  context: AgentContext,
  controls?: { agentsPaused?: boolean; signal?: AbortSignal },
  runtime: AgentRuntime = deterministicAgentRuntime,
  hooks?: PipelineHooks,
) {
  const routePlan = buildSelectiveRoutePlan(context);
  const disabledAgents = routePlan.agents.filter((agent) => context.agentSettings?.[agent]?.enabled === false);
  const routedAgents = routePlan.agents.filter((agent) => !disabledAgents.includes(agent));

  if (controls?.agentsPaused) {
    return blockedPipelineResult(context, routePlan, routedAgents, disabledAgents, 'AGENTS_PAUSED');
  }
  if (context.agentMode === 'HUMAN') {
    return blockedPipelineResult(context, routePlan, routedAgents, disabledAgents, 'HUMAN_TAKEOVER');
  }
  if (context.agentMode === 'PAUSED') {
    return blockedPipelineResult(context, routePlan, routedAgents, disabledAgents, 'AGENT_MODE_PAUSED');
  }

  const specialists = routedAgents.filter(
    (agent) => !['decision_orchestrator', 'secretary', 'relevance_checker'].includes(agent),
  );
  const shouldUsePaidRuntime = (agent: AgentName) =>
    runtime !== deterministicAgentRuntime && routePlan.paidAgents.includes(agent);
  const runAgent = async (agent: AgentName, agentContext: AgentContext) => {
    const selectedRuntime = shouldUsePaidRuntime(agent) ? runtime : deterministicAgentRuntime;
    return executeBoundedAgent({
      agent,
      context: agentContext,
      runtime: selectedRuntime,
      fallback: deterministicAgentRuntime,
      timeoutMs: 60_000,
      signal: controls?.signal,
    });
  };

  const paidAgentCallsPlanned = routedAgents.filter(shouldUsePaidRuntime).length;
  const specialistRuns = await Promise.all(specialists.map((agent) => runAgent(agent, context)));
  const agentExecutions: AgentExecutionTrace[] = specialistRuns.map((run) => run.execution);
  const specialistResults = specialistRuns
    .map((run) => applyConfidenceThreshold(context, run.result));

  const orchestratorContext: AgentContext = {
    ...context,
    collaboration: { specialistResults },
  };
  let orchestratorResult: AgentResult | null = null;
  if (routedAgents.includes('decision_orchestrator')) {
    const run = await runAgent('decision_orchestrator', orchestratorContext);
    agentExecutions.push(run.execution);
    orchestratorResult = applyConfidenceThreshold(context, run.result);
  }
  const agentResults: AgentResult[] = orchestratorResult
    ? [...specialistResults, orchestratorResult]
    : [...specialistResults];
  const decision = decideCommercialAction(context, agentResults);

  const toolProposals: ToolProposalTrace[] = [];
  let bookingToolResult: Record<string, unknown> | undefined;
  const proposal = hooks?.proposeTool?.({
    context,
    specialistResults,
    orchestratorResult,
    decision,
  }) ?? null;

  if (proposal) {
    const trace = proposalTrace({
      proposal,
      toolAvailability: context.toolAvailability,
      permissionContext: context.permissionContext,
      shadowMode: context.shadowMode,
    });
    toolProposals.push(trace);

    if (trace.decision.status === 'ELIGIBLE_FOR_DOMAIN_GATE' && hooks?.executeToolProposal) {
      try {
        bookingToolResult = await hooks.executeToolProposal({
          context,
          proposal,
          trace,
          specialistResults,
          orchestratorResult,
          decision,
        });
      } catch (error) {
        bookingToolResult = {
          status: 'BLOCKED',
          executed: false,
          mutation: proposal.mutation,
          requiresReview: true,
          error: error instanceof Error ? error.message.slice(0, 600) : 'Domain tool gateway failed',
        };
      }
    }
  }
  const confidence = agentResults.length
    ? Math.min(...agentResults.map((result) => result.confidence))
    : 0.9;
  const inferred = inferSalesHandoffSignals(context.message, context.salesState);
  const handoff = evaluateHandoff({
    intentScore: context.intentScore,
    ...inferred,
    customQuote: inferred.customQuote || (decision.action === 'HUMAN' && !!context.quotedService),
    confidence,
  });

  const secretaryContext: AgentContext = {
    ...context,
    collaboration: {
      specialistResults,
      orchestratorResult,
      commercialDecision: decision,
      ...(bookingToolResult ? { bookingToolResult } : {}),
    },
  };
  let secretaryResult: AgentResult | null = null;
  if (routedAgents.includes('secretary')) {
    const run = await runAgent('secretary', secretaryContext);
    agentExecutions.push(run.execution);
    secretaryResult = applyConfidenceThreshold(context, run.result);
    agentResults.push(secretaryResult);
  }

  const draft = secretaryCompose(context, decision, agentResults);
  const previewPolicyPassed = !draftOffersUnrequestedCustomPreview({
    customerMessage: context.message,
    draft: draft.text,
  });
  const languagePolicyPassed = replyMatchesHighConfidenceMessageLanguage({
    message: context.message,
    replyLanguage: draft.language,
    replyText: draft.text,
  });
  const salesBehavior = evaluateSalesReplyPolicy({ context, draft, decision });
  const deterministicRelevance = checkRelevance(context, draft)
    && previewPolicyPassed
    && languagePolicyPassed
    && salesBehavior.passed;

  const relevanceContext: AgentContext = {
    ...context,
    collaboration: {
      specialistResults,
      orchestratorResult,
      commercialDecision: decision,
      proposedReply: draft,
      ...(bookingToolResult ? { bookingToolResult } : {}),
    },
  };
  let relevanceResult: AgentResult | null = null;
  if (routedAgents.includes('relevance_checker')) {
    const run = await runAgent('relevance_checker', relevanceContext);
    agentExecutions.push(run.execution);
    relevanceResult = applyConfidenceThreshold(context, run.result);
    agentResults.push(relevanceResult);
  }
  const relevancePassed = deterministicRelevance
    && (!relevanceResult || relevanceResult.blockers.length === 0);
  const humanStyle = checkHumanReplyQuality(draft);

  const sendGate = canAutoSend({
    agentMode: handoff.handoff ? 'HUMAN' : context.agentMode,
    agentsPaused: controls?.agentsPaused,
    shadowMode: context.shadowMode,
  });

  const guardrails: string[] = [];
  if (!previewPolicyPassed) guardrails.push('UNREQUESTED_CUSTOM_PREVIEW');
  if (!languagePolicyPassed) guardrails.push('REPLY_LANGUAGE_MISMATCH');
  if (!salesBehavior.passed) guardrails.push(...salesBehavior.reasons);
  if (!relevancePassed) guardrails.push('RELEVANCE_GATE_FAILED');
  if (!humanStyle.passed) guardrails.push('HUMAN_STYLE_GATE_FAILED', ...humanStyle.reasons);
  if (!routedAgents.includes('secretary')) guardrails.push('SECRETARY_DISABLED');
  if (sendGate.reason !== 'AUTO_ALLOWED') guardrails.push(sendGate.reason);
  if (decision.useDiscount && decision.discountPct == null) {
    guardrails.push('DISCOUNT_WITHOUT_CONFIGURED_VALUE');
  }
  if (bookingToolResult?.requiresReview === true) guardrails.push('BOOKING_TOOL_REQUIRES_REVIEW');
  for (const item of toolProposals) {
    if (item.decision.status !== 'ELIGIBLE_FOR_DOMAIN_GATE') guardrails.push(item.decision.status);
  }
  let delivery: PipelineTrace['delivery'];
  if (!relevancePassed || !routedAgents.includes('secretary')) {
    delivery = 'BLOCK';
  } else if (
    (!humanStyle.passed || bookingToolResult?.requiresReview === true)
    && sendGate.delivery === 'SEND'
  ) {
    delivery = 'REVIEW';
  } else {
    delivery = sendGate.delivery;
  }

  const catalogRecommendation = delivery === 'BLOCK'
    ? null
    : resolveSmartVisionsCatalogRecommendation({
      serviceId: decision.serviceId,
      message: context.message,
    });

  const trace: PipelineTrace = {
    reasoningTier: routePlan.tier,
    routeReasons: routePlan.reasons,
    estimatedLlmCalls: routePlan.estimatedLlmCalls,
    paidAgentCallsPlanned,
    routedAgents,
    disabledAgents,
    agentResults,
    agentExecutions,
    toolProposals,
    decision,
    guardrails: [...new Set(guardrails)],
    handoffReasons: handoff.reasons,
    relevancePassed,
    humanStylePassed: humanStyle.passed,
    delivery,
    catalogRecommendation,
    salesEfficiency: salesBehavior.metrics,
    ...(bookingToolResult ? { bookingToolResult } : {}),
  };

  return {
    draft,
    trace,
    nextAgentMode: handoff.handoff ? 'HUMAN' as const : context.agentMode ?? 'AUTO' as const,
    previewRecommended: decision.action === 'SHOW_PREVIEW',
    catalogRecommendation,
  };
}
