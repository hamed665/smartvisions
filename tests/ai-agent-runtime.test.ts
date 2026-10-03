import { describe, expect, it, vi } from 'vitest';
import type {
  AgentContext,
  AgentToolProposal,
  PermissionContextSnapshot,
  ToolAvailabilitySnapshot,
} from '@/lib/agents/contracts';
import { evaluateToolProposal } from '@/lib/agents/tool-proposals';
import {
  deterministicAgentRuntime,
  executeBoundedAgent,
  type AgentRuntime,
} from '@/lib/agents/runtime';
import { processInboundMessage } from '@/lib/agents/pipeline';

const baseTool: ToolAvailabilitySnapshot = {
  actionKey: 'BOOKING_CREATE',
  executionSurface: 'AI',
  toolKey: 'BOOKING',
  authorityKey: 'BOOKING_LIFECYCLE',
  contractVersion: 1,
  permissionKey: 'BOOKING_MUTATE',
  scopeType: 'CONVERSATION',
  costClass: 'NONE',
  sideEffectClass: 'INTERNAL_STATE',
  approvalRequirement: 'NONE',
  verifierKey: 'BOOKING_LIFECYCLE_EVENT_RELOAD',
  availability: 'AVAILABLE',
  requiredWorkPackages: [],
  providerSend: false,
  paymentExecution: false,
  shadowMutationBlocked: true,
  runtimeAuthorizationRequired: true,
};
const systemPermission: PermissionContextSnapshot = {
  actorType: 'SYSTEM',
  targetScope: {},
  scopeAssignments: [],
  source: 'IAM_CANONICAL',
  runtimeAuthorizationRequired: true,
};

const proposal: AgentToolProposal = {
  actionKey: 'BOOKING_CREATE',
  proposedBy: 'decision_orchestrator',
  input: { action: 'CREATE' },
  mutation: true,
};

describe('AI Agent Runtime governance', () => {
  it('never turns an eligible proposal into execution authority', () => {
    const decision = evaluateToolProposal({
      proposal,
      toolAvailability: [{ ...baseTool, shadowMutationBlocked: false }],
      permissionContext: systemPermission,
      shadowMode: false,
    });
    expect(decision.status).toBe('ELIGIBLE_FOR_DOMAIN_GATE');
    expect(decision.executionAuthorized).toBe(false);
    expect(decision.reasons).toContain('SYSTEM_ACTOR_HAS_NO_IMPLICIT_HUMAN_PERMISSION');
    expect(decision.reasons).toContain('CANONICAL_DOMAIN_GATE_REQUIRED');
  });

  it('rejects actions outside the AI registry surface', () => {
    const decision = evaluateToolProposal({
      proposal,
      toolAvailability: [],
      permissionContext: systemPermission,
      shadowMode: false,
    });
    expect(decision.status).toBe('REJECTED_NOT_REGISTERED');
  });
  it('rejects unavailable, provider-send and financial execution contracts', () => {
    expect(evaluateToolProposal({
      proposal,
      toolAvailability: [{ ...baseTool, availability: 'DEPENDENCY_PENDING' }],
      permissionContext: systemPermission,
    }).status).toBe('REJECTED_UNAVAILABLE');

    expect(evaluateToolProposal({
      proposal,
      toolAvailability: [{ ...baseTool, providerSend: true }],
      permissionContext: systemPermission,
    }).status).toBe('REJECTED_PROVIDER_SEND');

    expect(evaluateToolProposal({
      proposal,
      toolAvailability: [{ ...baseTool, paymentExecution: true }],
      permissionContext: systemPermission,
    }).status).toBe('REJECTED_FINANCIAL_EXECUTION');
  });

  it('requires canonical approval evidence and blocks Shadow Mode mutation', () => {
    expect(evaluateToolProposal({
      proposal,
      toolAvailability: [{ ...baseTool, approvalRequirement: 'REQUIRED' }],
      permissionContext: systemPermission,
    }).status).toBe('REJECTED_APPROVAL_REQUIRED');

    expect(evaluateToolProposal({
      proposal,
      toolAvailability: [baseTool],
      permissionContext: systemPermission,
      shadowMode: true,
    }).status).toBe('REJECTED_SHADOW_MODE');
  });
  it('calls the configured provider at most once and falls back locally once', async () => {
    const providerRun = vi.fn(async () => {
      throw new Error('provider unavailable');
    });
    const fallbackRun = vi.fn(async (agent) => ({
      agent,
      confidence: 0.8,
      summary: 'fallback',
      data: {},
      evidence: [],
      blockers: [],
    }));
    const provider: AgentRuntime = { run: providerRun };
    const fallback: AgentRuntime = { run: fallbackRun };

    const execution = await executeBoundedAgent({
      agent: 'intent_discovery',
      context: { message: 'hello' },
      runtime: provider,
      fallback,
    });

    expect(providerRun).toHaveBeenCalledTimes(1);
    expect(fallbackRun).toHaveBeenCalledTimes(1);
    expect(execution.execution.fallbackUsed).toBe(true);
    expect(execution.execution.attempts).toHaveLength(2);
    expect(execution.execution.attempts.every((item) => item.automaticRetries === 0)).toBe(true);
    expect(execution.result.summary).toBe('fallback');
  });
  it('fails closed when both provider and local fallback fail', async () => {
    const failing: AgentRuntime = {
      run: vi.fn(async () => {
        throw new Error('failed');
      }),
    };
    const execution = await executeBoundedAgent({
      agent: 'business_analyst',
      context: { message: 'hello' },
      runtime: failing,
      fallback: failing,
    });
    expect(execution.execution.failedClosed).toBe(true);
    expect(execution.result.confidence).toBe(0);
    expect(execution.result.blockers).toContain('AGENT_RUNTIME_FAILED');
  });

  it('stops before every Agent call while globally paused', async () => {
    const run = vi.fn(deterministicAgentRuntime.run);
    const runtime: AgentRuntime = { run };
    const context: AgentContext = {
      message: 'I want pricing',
      agentMode: 'AUTO',
    };
    const result = await processInboundMessage(
      context,
      { agentsPaused: true },
      runtime,
    );
    expect(run).not.toHaveBeenCalled();
    expect(result.trace.delivery).toBe('BLOCK');
    expect(result.trace.guardrails).toContain('AGENTS_PAUSED');
    expect(result.trace.agentExecutions).toEqual([]);
  });
});
