export type HandoffInput = {
  intentScore?: number;
  asksHuman?: boolean;
  asksMeeting?: boolean;
  asksPayment?: boolean;
  asksContract?: boolean;
  asksAvailability?: boolean;
  customQuote?: boolean;
  specialDiscount?: boolean;
  complaint?: boolean;
  confidence?: number;
};

export function hasPaymentExecutionIntent(message: string) {
  const text = message.trim();
  if (!text) return false;

  return [
    /\b(how (?:do|can|should|would) i pay|where (?:do|can|should) i pay|ready to pay|want to pay|pay (?:now|today|the invoice|the deposit)|make (?:a )?payment|payment (?:link|method|methods|terms|option|options|details)|send (?:me )?(?:an? )?invoice|invoice me|bank (?:account|details)|card payment|checkout|deposit)\b/i,
    /\b(?:send|sign|accept|execute) (?:me )?(?:the )?(?:contract|agreement)\b/i,
    /\b(?:contract|agreement) (?:to sign|for signature)\b/i,
    /(?:كيف|وين|أين)\s*(?:أدفع|ادفع)|(?:أريد|ابي|أبغى)\s*(?:أدفع|ادفع)|رابط\s*الدفع|(?:أرسل|ارسل)\s*(?:لي\s*)?فاتورة|فاتورة\s*(?:الدفع)?|عربون|حساب\s*بنكي|بيانات\s*البنك|(?:أرسل|ارسل)\s*(?:لي\s*)?(?:العقد|الاتفاقية)|(?:أوقع|اوقع)\s*(?:العقد|الاتفاقية)/i,
    /(?:چطور|چجوری|کجا)\s*(?:پرداخت|واریز)\s*(?:کنم)?|می[‌\s-]?(?:خوام|خواهم)\s*(?:پرداخت|واریز)\s*(?:کنم)?|لینک\s*پرداخت|فاکتور\s*(?:رو|را)?\s*(?:بفرست|ارسال)|بیعانه|شماره\s*حساب|اطلاعات\s*بانکی|قرارداد\s*(?:رو|را)?\s*(?:بفرست|ارسال)|(?:امضا|امضاء)\s*(?:کردن|کنم|قرارداد)/i,
  ].some((pattern) => pattern.test(text));
}

export function evaluateHandoff(input: HandoffInput) {
  const reasons: string[] = [];

  if ((input.intentScore ?? 0) >= 70) reasons.push('HIGH_INTENT');
  if (input.asksHuman) reasons.push('ASKED_FOR_HUMAN');
  if (input.asksMeeting) reasons.push('MEETING_REQUEST');
  if (input.asksPayment) reasons.push('PAYMENT_DISCUSSION');
  if (input.asksContract) reasons.push('CONTRACT_CONFIRMATION');
  if (input.asksAvailability) reasons.push('AVAILABILITY_CONFIRMATION');
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
