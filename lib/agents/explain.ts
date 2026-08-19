import type { PipelineTrace } from './contracts';

export function explainReply(trace: PipelineTrace) {
  return {
    routedAgents: trace.routedAgents,
    agentFindings: trace.agentResults.map((result) => ({
      agent: result.agent,
      confidence: result.confidence,
      summary: result.summary,
      evidence: result.evidence,
      blockers: result.blockers,
    })),
    commercialDecision: trace.decision,
    guardrails: trace.guardrails,
    handoffReasons: trace.handoffReasons,
    relevancePassed: trace.relevancePassed,
    delivery: trace.delivery,
  };
}
