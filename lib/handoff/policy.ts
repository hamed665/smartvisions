export type HandoffInput = {
  intentScore?: number;
  asksHuman?: boolean;
  asksMeeting?: boolean;
  asksPayment?: boolean;
  customQuote?: boolean;
  specialDiscount?: boolean;
  complaint?: boolean;
  confidence?: number;
};

export function evaluateHandoff(input: HandoffInput) {
  const reasons: string[] = [];

  if ((input.intentScore ?? 0) >= 70) reasons.push('HIGH_INTENT');
  if (input.asksHuman) reasons.push('ASKED_FOR_HUMAN');
  if (input.asksMeeting) reasons.push('MEETING_REQUEST');
  if (input.asksPayment) reasons.push('PAYMENT_DISCUSSION');
  if (input.customQuote) reasons.push('CUSTOM_QUOTE');
  if (input.specialDiscount) reasons.push('SPECIAL_DISCOUNT');
  if (input.complaint) reasons.push('COMPLAINT');
  if ((input.confidence ?? 1) < 0.65) reasons.push('LOW_CONFIDENCE');

  return {
    handoff: reasons.length > 0,
    mode: reasons.length > 0 ? 'HUMAN' as const : 'AUTO' as const,
    reasons,
  };
}

export function canAutoSend(input: {
  agentMode?: 'AUTO' | 'PAUSED' | 'HUMAN';
  agentsPaused?: boolean;
  shadowMode?: boolean;
}) {
  if (input.agentMode === 'HUMAN') return { allowed: false, delivery: 'BLOCK' as const, reason: 'HUMAN_TAKEOVER' };
  if (input.agentMode === 'PAUSED' || input.agentsPaused) return { allowed: false, delivery: 'BLOCK' as const, reason: 'AGENTS_PAUSED' };
  if (input.shadowMode) return { allowed: false, delivery: 'REVIEW' as const, reason: 'SHADOW_MODE' };
  return { allowed: true, delivery: 'SEND' as const, reason: 'AUTO_ALLOWED' };
}
