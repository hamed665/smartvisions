import { classifyConversationStage, decideApproval, type ConversationSignals, type PersianOperatorBrief } from './intelligence';

export type AutomationInput = {
  signals: ConversationSignals;
  customerLanguage: string;
  originalMessage: string;
  persianTranslation: string;
  persianSummary: string;
  intent: string;
  sentiment?: string;
  proposedReply?: string;
  proposedReplyPersian?: string;
  shadowMode?: boolean;
  globalKillSwitch?: boolean;
};

export type AutomationResult = {
  delivery: 'SEND' | 'REVIEW' | 'HANDOFF' | 'BLOCK';
  stage: ReturnType<typeof classifyConversationStage>;
  operatorBrief: PersianOperatorBrief;
  reason: string;
};

export function decideConversationAutomation(input: AutomationInput): AutomationResult {
  const stage = classifyConversationStage(input.signals);
  const approval = decideApproval(input.signals);

  let delivery: AutomationResult['delivery'] = 'SEND';
  let reason = 'Low-risk response is inside autonomous authority.';

  if (input.globalKillSwitch) {
    delivery = 'BLOCK';
    reason = 'Global kill switch is active.';
  } else if (approval.handoff) {
    delivery = 'HANDOFF';
    reason = approval.reason || 'Human commercial decision required.';
  } else if (input.shadowMode || approval.requiresApproval) {
    delivery = 'REVIEW';
    reason = input.shadowMode ? 'Shadow mode requires review during launch.' : approval.reason || 'Review required.';
  }

  const action: PersianOperatorBrief['action'] =
    delivery === 'HANDOFF' ? 'HANDOFF' :
    delivery === 'REVIEW' ? 'HUMAN_REVIEW' :
    stage.stage === 'FOLLOW_UP_DUE' ? 'FOLLOW_UP' :
    stage.stage === 'WAITING_CUSTOMER' ? 'WAIT' : 'AUTO_REPLY';

  return {
    delivery,
    stage,
    reason,
    operatorBrief: {
      originalLanguage: input.customerLanguage,
      originalText: input.originalMessage,
      persianTranslation: input.persianTranslation,
      persianSummary: input.persianSummary,
      intent: input.intent,
      sentiment: input.sentiment,
      action,
      reason,
      outgoingOriginal: input.proposedReply,
      outgoingPersianTranslation: input.proposedReplyPersian,
    },
  };
}
