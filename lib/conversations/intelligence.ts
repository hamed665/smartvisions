export type ConversationStage =
  | 'NEW'
  | 'ACTIVE'
  | 'CLOSING'
  | 'WAITING_CUSTOMER'
  | 'UNANSWERED'
  | 'HOT'
  | 'NEEDS_HUMAN'
  | 'FOLLOW_UP_DUE'
  | 'WON'
  | 'LOST'
  | 'DO_NOT_CONTACT'
  | 'SPAM'
  | 'PAUSED';

export type ConversationSignals = {
  inboundPending: boolean;
  customerWaiting: boolean;
  lastInboundMinutesAgo?: number;
  lastOutboundMinutesAgo?: number;
  intentScore?: number;
  purchaseIntent?: boolean;
  closingIntent?: boolean;
  paymentIntent?: boolean;
  customQuoteRequested?: boolean;
  discountBeyondAutoLimit?: boolean;
  complaintOrLegalRisk?: boolean;
  confidence?: number;
  explicitOptOut?: boolean;
  won?: boolean;
  lost?: boolean;
  spam?: boolean;
  paused?: boolean;
};

export type ApprovalDecision = {
  requiresApproval: boolean;
  reason?: string;
  handoff: boolean;
};

export function classifyConversationStage(signals: ConversationSignals): { stage: ConversationStage; priority: number; reason: string } {
  if (signals.explicitOptOut) return { stage: 'DO_NOT_CONTACT', priority: 100, reason: 'Customer requested no further contact.' };
  if (signals.won) return { stage: 'WON', priority: 10, reason: 'Deal marked won.' };
  if (signals.lost) return { stage: 'LOST', priority: 10, reason: 'Lead marked lost or not interested.' };
  if (signals.spam) return { stage: 'SPAM', priority: 0, reason: 'Conversation classified as spam or low quality.' };
  if (signals.paused) return { stage: 'PAUSED', priority: 20, reason: 'Conversation is intentionally paused.' };
  if (signals.complaintOrLegalRisk) return { stage: 'NEEDS_HUMAN', priority: 100, reason: 'Complaint, legal, guarantee, or other high-risk issue.' };
  if (signals.customQuoteRequested || signals.discountBeyondAutoLimit) return { stage: 'NEEDS_HUMAN', priority: 95, reason: 'Commercial decision exceeds autonomous authority.' };
  if (signals.paymentIntent || signals.closingIntent) return { stage: 'CLOSING', priority: 95, reason: 'Customer is discussing payment, start date, invoice, contract, or final terms.' };
  if ((signals.intentScore ?? 0) >= 85 || signals.purchaseIntent) return { stage: 'HOT', priority: 90, reason: 'High purchase intent detected.' };
  if (signals.inboundPending) return { stage: 'UNANSWERED', priority: 88, reason: 'Customer message is waiting for a valid response.' };
  if (signals.customerWaiting) return { stage: 'WAITING_CUSTOMER', priority: 45, reason: 'We replied and are waiting for the customer.' };
  if ((signals.lastOutboundMinutesAgo ?? 0) >= 2880 && !signals.inboundPending) return { stage: 'FOLLOW_UP_DUE', priority: 70, reason: 'Follow-up window is due.' };
  if ((signals.lastInboundMinutesAgo ?? Number.POSITIVE_INFINITY) < 1440) return { stage: 'ACTIVE', priority: 60, reason: 'Conversation is active.' };
  return { stage: 'NEW', priority: 50, reason: 'New or insufficiently classified conversation.' };
}

export function decideApproval(signals: ConversationSignals): ApprovalDecision {
  if (signals.explicitOptOut) return { requiresApproval: false, handoff: false, reason: 'No reply except compliant opt-out acknowledgement if required.' };
  if (signals.complaintOrLegalRisk) return { requiresApproval: true, handoff: true, reason: 'High-risk complaint/legal/guarantee topic.' };
  if (signals.customQuoteRequested) return { requiresApproval: true, handoff: true, reason: 'Custom quote requires human commercial decision.' };
  if (signals.discountBeyondAutoLimit) return { requiresApproval: true, handoff: true, reason: 'Requested discount exceeds autonomous limit.' };
  if ((signals.confidence ?? 1) < 0.7) return { requiresApproval: true, handoff: false, reason: 'Agent confidence below safe auto-send threshold.' };
  return { requiresApproval: false, handoff: false };
}

export type LanguageContext = {
  detectedLanguage?: string;
  detectedDialect?: string;
  marketDialect?: string;
  confidence?: number;
};

export function chooseReplyLanguage(context: LanguageContext) {
  const language = context.detectedLanguage || 'en';
  const dialect = (context.confidence ?? 1) >= 0.75 ? context.detectedDialect : undefined;
  return {
    language,
    dialect: dialect || (language.startsWith('ar') ? context.marketDialect || 'gulf-neutral' : undefined),
    useNeutralArabic: language.startsWith('ar') && !dialect,
  };
}

export type PersianOperatorBrief = {
  originalLanguage: string;
  originalText: string;
  persianTranslation: string;
  persianSummary: string;
  intent: string;
  sentiment?: string;
  action: 'AUTO_REPLY' | 'WAIT' | 'FOLLOW_UP' | 'HUMAN_REVIEW' | 'HANDOFF';
  reason: string;
  outgoingOriginal?: string;
  outgoingPersianTranslation?: string;
};
