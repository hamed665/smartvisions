import { evaluateSendWindow, type MarketCode } from './scheduler';

export interface OutreachEligibilityInput {
  marketCode: MarketCode;
  leadTimezone?: string;
  nowUtc?: Date;
  suppressed: boolean;
  agentMode: 'AUTO' | 'PAUSED' | 'HUMAN';
  globalKillSwitch: boolean;
  emailPaused: boolean;
  emailValid: boolean;
  opportunityScore: number;
  minimumOpportunityScore?: number;
}

export function evaluateOutreachEligibility(input: OutreachEligibilityInput) {
  const blocks: string[] = [];
  if (input.globalKillSwitch) blocks.push('GLOBAL_KILL_SWITCH');
  if (input.emailPaused) blocks.push('EMAIL_PAUSED');
  if (input.suppressed) blocks.push('SUPPRESSED');
  if (input.agentMode === 'HUMAN') blocks.push('HUMAN_TAKEOVER');
  if (input.agentMode === 'PAUSED') blocks.push('AGENT_PAUSED');
  if (!input.emailValid) blocks.push('INVALID_EMAIL');
  if (input.opportunityScore < (input.minimumOpportunityScore ?? 55)) blocks.push('LOW_OPPORTUNITY_SCORE');

  const window = evaluateSendWindow({ marketCode: input.marketCode, leadTimezone: input.leadTimezone, nowUtc: input.nowUtc });
  if (!window.allowed) blocks.push(window.reason.toUpperCase());

  return {
    allowed: blocks.length === 0,
    blocks,
    sendWindow: window,
  };
}
