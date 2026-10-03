import type {
  AgentToolProposal,
  PermissionContextSnapshot,
  ToolAvailabilitySnapshot,
  ToolProposalDecision,
} from './contracts';

function reject(
  status: Exclude<ToolProposalDecision['status'], 'ELIGIBLE_FOR_DOMAIN_GATE'>,
  ...reasons: string[]
): ToolProposalDecision {
  return {
    status,
    reasons,
    executionAuthorized: false,
  };
}

function eligible(...reasons: string[]): ToolProposalDecision {
  return {
    status: 'ELIGIBLE_FOR_DOMAIN_GATE',
    reasons,
    executionAuthorized: false,
  };
}
export function evaluateToolProposal(input: {
  proposal: AgentToolProposal;
  toolAvailability?: ToolAvailabilitySnapshot[];
  permissionContext?: PermissionContextSnapshot;
  shadowMode?: boolean;
}): ToolProposalDecision {
  const actionKey = input.proposal.actionKey.trim().toUpperCase();
  const contract = (input.toolAvailability ?? [])
    .find((item) => item.actionKey === actionKey && item.executionSurface === 'AI');

  if (!contract) {
    return reject('REJECTED_NOT_REGISTERED', 'ACTION_NOT_REGISTERED_FOR_AI');
  }
  if (contract.availability !== 'AVAILABLE') {
    return reject('REJECTED_UNAVAILABLE', 'ACTION_NOT_AVAILABLE');
  }
  if (contract.providerSend) {
    return reject('REJECTED_PROVIDER_SEND', 'DIRECT_PROVIDER_SEND_FORBIDDEN');
  }
  if (contract.paymentExecution) {
    return reject('REJECTED_FINANCIAL_EXECUTION', 'DIRECT_FINANCIAL_EXECUTION_FORBIDDEN');
  }
  if (
    contract.approvalRequirement !== 'NONE'
    && input.proposal.approvalEvidence?.approved !== true
  ) {
    return reject(
      'REJECTED_APPROVAL_REQUIRED',
      'CANONICAL_APPROVAL_EVIDENCE_REQUIRED',
    );
  }

  if (
    input.shadowMode === true
    && input.proposal.mutation
    && (contract.shadowMutationBlocked || contract.sideEffectClass !== 'READ_ONLY')
  ) {
    return reject('REJECTED_SHADOW_MODE', 'SHADOW_MODE_BLOCKS_MUTATION');
  }

  const permissionReason = input.permissionContext?.actorType === 'USER'
    ? 'USER_SCOPE_CONTEXT_IS_NOT_EXECUTION_PERMISSION'
    : 'SYSTEM_ACTOR_HAS_NO_IMPLICIT_HUMAN_PERMISSION';

  return eligible(
    'REGISTRY_CONTRACT_ELIGIBLE',
    permissionReason,
    'CANONICAL_DOMAIN_GATE_REQUIRED',
  );
}
export function proposalTrace(input: {
  proposal: AgentToolProposal;
  toolAvailability?: ToolAvailabilitySnapshot[];
  permissionContext?: PermissionContextSnapshot;
  shadowMode?: boolean;
}) {
  return {
    proposal: input.proposal,
    decision: evaluateToolProposal(input),
  };
}
