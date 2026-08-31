export type ApprovedSendChannel = 'EMAIL' | 'WHATSAPP';

export type ApprovedSendPolicyInput = {
  messageStatus: string;
  requiresApproval: boolean;
  shadowMode: boolean;
  shadowModeExceptionVerified?: boolean;
  globalKillSwitch: boolean;
  channelPaused: boolean;
  agentsPaused?: boolean;
  doNotContact: boolean;
  agentMode?: string | null;
  messageChannel: string;
};

export function evaluateApprovedSendPolicy(input: ApprovedSendPolicyInput) {
  const blocks: string[] = [];

  if (input.messageStatus !== 'APPROVED') blocks.push('MESSAGE_NOT_APPROVED');
  if (input.requiresApproval) blocks.push('APPROVAL_STILL_REQUIRED');
  if (input.shadowMode && !input.shadowModeExceptionVerified) blocks.push('SHADOW_MODE_ENABLED');
  if (input.globalKillSwitch) blocks.push('GLOBAL_KILL_SWITCH');
  if (input.channelPaused) blocks.push('CHANNEL_PAUSED');
  if (input.agentsPaused) blocks.push('AGENTS_PAUSED');
  if (input.doNotContact) blocks.push('DO_NOT_CONTACT');
  if (input.agentMode === 'HUMAN') blocks.push('HUMAN_TAKEOVER');
  if (input.agentMode === 'PAUSED') blocks.push('AGENT_PAUSED');
  if (input.messageChannel !== 'EMAIL' && input.messageChannel !== 'WHATSAPP') blocks.push('UNSUPPORTED_CHANNEL');

  return {
    allowed: blocks.length === 0,
    blocks,
    channel: input.messageChannel as ApprovedSendChannel,
  };
}

export function approvedSendFailureDisposition(providerAccepted: boolean) {
  return providerAccepted
    ? { markFailed: false as const, httpStatus: 202 as const, retryPolicy: 'RECONCILIATION_ONLY' as const }
    : { markFailed: true as const, httpStatus: 502 as const, retryPolicy: 'NO_AUTOMATIC_RETRY' as const };
}
