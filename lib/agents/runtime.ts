import type { AgentContext, AgentName, AgentResult } from './contracts';
import { executeAgent } from './executor';

export interface AgentRuntime {
  run(agent: AgentName, context: AgentContext): Promise<AgentResult>;
}

export const deterministicAgentRuntime: AgentRuntime = {
  run: executeAgent,
};

export function withConfidenceFloor(runtime: AgentRuntime, floor: number): AgentRuntime {
  return {
    async run(agent, context) {
      const result = await runtime.run(agent, context);
      if (result.confidence < floor && !result.blockers.includes('BELOW_CONFIDENCE_FLOOR')) {
        return { ...result, blockers: [...result.blockers, 'BELOW_CONFIDENCE_FLOOR'] };
      }
      return result;
    },
  };
}
