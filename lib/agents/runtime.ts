import type {
  AgentContext,
  AgentExecutionAttempt,
  AgentExecutionTrace,
  AgentName,
  AgentResult,
} from './contracts';
import { executeAgent } from './executor';

export type AgentRunOptions = {
  signal?: AbortSignal;
};

export interface AgentRuntime {
  run(
    agent: AgentName,
    context: AgentContext,
    options?: AgentRunOptions,
  ): Promise<AgentResult>;
}

export const deterministicAgentRuntime: AgentRuntime = {
  run(agent, context) {
    return executeAgent(agent, context);
  },
};
function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error || 'Agent runtime failed'))
    .slice(0, 600);
}

function isAbort(error: unknown) {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

function failedResult(agent: AgentName, error: unknown): AgentResult {
  return {
    agent,
    confidence: 0,
    summary: 'Agent runtime failed closed.',
    data: {},
    evidence: [],
    blockers: ['AGENT_RUNTIME_FAILED', errorMessage(error)],
  };
}

function attempt(
  runtime: AgentExecutionAttempt['runtime'],
  outcome: AgentExecutionAttempt['outcome'],
  error?: unknown,
): AgentExecutionAttempt {
  return {
    runtime,
    outcome,
    automaticRetries: 0,
    ...(error == null ? {} : { error: errorMessage(error) }),
  };
}
export async function executeBoundedAgent(input: {
  agent: AgentName;
  context: AgentContext;
  runtime: AgentRuntime;
  fallback?: AgentRuntime;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{ result: AgentResult; execution: AgentExecutionTrace }> {
  const timeoutMs = Math.max(250, Math.min(input.timeoutMs ?? 60_000, 60_000));
  const fallback = input.fallback ?? deterministicAgentRuntime;
  const attempts: AgentExecutionAttempt[] = [];
  const configuredProvider = input.runtime !== deterministicAgentRuntime;

  if (!configuredProvider) {
    try {
      const result = await input.runtime.run(input.agent, input.context, { signal: input.signal });
      attempts.push(attempt('deterministic_local', 'SUCCEEDED'));
      return {
        result,
        execution: {
          agent: input.agent,
          attempts,
          finalRuntime: 'deterministic_local',
          fallbackUsed: false,
          failedClosed: false,
        },
      };
    } catch (error) {
      attempts.push(attempt('deterministic_local', isAbort(error) ? 'TIMED_OUT' : 'FAILED', error));
      return {
        result: failedResult(input.agent, error),
        execution: { agent: input.agent, attempts, fallbackUsed: false, failedClosed: true },
      };
    }
  }
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort(input.signal?.reason);
  input.signal?.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Agent runtime timeout', 'AbortError')), timeoutMs);

  try {
    const result = await input.runtime.run(input.agent, input.context, { signal: controller.signal });
    attempts.push(attempt('configured_provider', 'SUCCEEDED'));
    return {
      result,
      execution: {
        agent: input.agent,
        attempts,
        finalRuntime: 'configured_provider',
        fallbackUsed: false,
        failedClosed: false,
      },
    };
  } catch (error) {
    const timedOut = controller.signal.aborted && !input.signal?.aborted;
    attempts.push(attempt('configured_provider', timedOut || isAbort(error) ? 'TIMED_OUT' : 'FAILED', error));

    if (input.signal?.aborted) {
      return {
        result: failedResult(input.agent, error),
        execution: { agent: input.agent, attempts, fallbackUsed: false, failedClosed: true },
      };
    }

    try {
      const result = await fallback.run(input.agent, input.context, { signal: input.signal });
      attempts.push(attempt('deterministic_local', 'SUCCEEDED'));
      return {
        result,
        execution: {
          agent: input.agent,
          attempts,
          finalRuntime: 'deterministic_local',
          fallbackUsed: true,
          failedClosed: false,
        },
      };
    } catch (fallbackError) {
      attempts.push(attempt('deterministic_local', isAbort(fallbackError) ? 'TIMED_OUT' : 'FAILED', fallbackError));
      return {
        result: failedResult(input.agent, fallbackError),
        execution: { agent: input.agent, attempts, fallbackUsed: true, failedClosed: true },
      };
    }
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onCallerAbort);
  }
}
export function withConfidenceFloor(runtime: AgentRuntime, floor: number): AgentRuntime {
  return {
    async run(agent, context, options) {
      const result = await runtime.run(agent, context, options);
      if (result.confidence < floor && !result.blockers.includes('BELOW_CONFIDENCE_FLOOR')) {
        return { ...result, blockers: [...result.blockers, 'BELOW_CONFIDENCE_FLOOR'] };
      }
      return result;
    },
  };
}
