export type ApprovedSendChannel = 'EMAIL' | 'WHATSAPP';

export type ApprovedSendPolicyInput = {
  messageStatus: string;
  requiresApproval: boolean;
  shadowMode: boolean;
  globalKillSwitch: boolean;
  channelPaused: boolean;
  doNotContact: boolean;
  agentMode?: string | null;
  messageChannel: string;
};

export function evaluateApprovedSendPolicy(input: ApprovedSendPolicyInput) {
  const blocks: string[] = [];

  if (input.messageStatus !== 'APPROVED') blocks.push('MESSAGE_NOT_APPROVED');
  if (input.requiresApproval) blocks.push('APPROVAL_STILL_REQUIRED');
  if (input.shadowMode) blocks.push('SHADOW_MODE_ENABLED');
  if (input.globalKillSwitch) blocks.push('GLOBAL_KILL_SWITCH');
  if (input.channelPaused) blocks.push('CHANNEL_PAUSED');
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
