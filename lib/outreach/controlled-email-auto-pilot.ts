import { isSupportedMarketCode } from './market-profile';

type ControlledEmailAutoPilotInput = {
  messageStatus?: string | null;
  requiresApproval: boolean;
  channel?: string | null;
  metadataSource?: unknown;
  providerMessageId?: string | null;
  idempotencyKey?: string | null;
  marketCode?: string | null;
  messageLeadId?: string | null;
  conversationLeadId?: string | null;
  conversationChannel?: string | null;
  campaignStatus?: string | null;
  campaignCountryCode?: string | null;
  campaignConfig?: unknown;
  currentMarketDateKey?: string;
  currentOmanDateKey?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export const CONTROLLED_EMAIL_AUTOMATION_AUTHORIZATION = 'OWNER_REQUESTED_FULL_AUTOMATION' as const;
export const CONTROLLED_OMAN_AUTOMATION_AUTHORIZATION = CONTROLLED_EMAIL_AUTOMATION_AUTHORIZATION;
export const CONTROLLED_EMAIL_QUEUE_MAX_AGE_DAYS = 7;

export function verifyControlledEmailAutoPilot(input: ControlledEmailAutoPilotInput) {
  if (String(input.channel ?? '').toUpperCase() !== 'EMAIL') return { verified: false as const, reason: 'CHANNEL_NOT_EMAIL' as const };
  const messageStatus = String(input.messageStatus ?? '').toUpperCase();
  if (!['APPROVAL_REQUIRED', 'APPROVED'].includes(messageStatus)) return { verified: false as const, reason: 'MESSAGE_STATE_NOT_AUTOPILOT_ELIGIBLE' as const };
  if (messageStatus === 'APPROVAL_REQUIRED' && !input.requiresApproval) return { verified: false as const, reason: 'PREAPPROVAL_STATE_INVALID' as const };
  if (messageStatus === 'APPROVED' && input.requiresApproval) return { verified: false as const, reason: 'APPROVAL_STILL_REQUIRED' as const };
  if (input.metadataSource !== 'SHADOW_MODE') return { verified: false as const, reason: 'SOURCE_NOT_SHADOW_MODE' as const };
  const idempotencyKey = String(input.idempotencyKey ?? '').trim();
  if (!idempotencyKey.startsWith('growth-first-touch:')) return { verified: false as const, reason: 'NOT_GROWTH_FIRST_TOUCH' as const };
  if (String(input.providerMessageId ?? '') !== `shadow:${idempotencyKey}`) return { verified: false as const, reason: 'SHADOW_ID_MISMATCH' as const };

  const marketCode = String(input.marketCode ?? '').trim().toUpperCase();
  if (!isSupportedMarketCode(marketCode)) return { verified: false as const, reason: 'MARKET_NOT_SUPPORTED' as const };
  if (!input.messageLeadId || input.messageLeadId !== input.conversationLeadId) return { verified: false as const, reason: 'LEAD_LINKAGE_MISMATCH' as const };
  if (String(input.conversationChannel ?? '').toUpperCase() !== 'EMAIL') return { verified: false as const, reason: 'CONVERSATION_CHANNEL_MISMATCH' as const };
  if (String(input.campaignStatus ?? '').toUpperCase() !== 'RUNNING') return { verified: false as const, reason: 'CAMPAIGN_NOT_RUNNING' as const };
  if (String(input.campaignCountryCode ?? '').toUpperCase() !== marketCode) return { verified: false as const, reason: 'CAMPAIGN_MARKET_MISMATCH' as const };

  const config = record(input.campaignConfig);
  if (String(config.marketCode ?? '').toUpperCase() !== marketCode) return { verified: false as const, reason: 'CONFIG_MARKET_MISMATCH' as const };
  const currentDateKey = input.currentMarketDateKey ?? input.currentOmanDateKey ?? '';
  if (String(config.targetDate ?? '') !== currentDateKey) return { verified: false as const, reason: 'STALE_DAILY_TARGET' as const };
  if (String(config.outreachMode ?? '').toUpperCase() !== 'CONTROLLED') return { verified: false as const, reason: 'OUTREACH_MODE_NOT_CONTROLLED' as const };
  if (config.dailyOutreachTarget !== true) return { verified: false as const, reason: 'DAILY_TARGET_REQUIRED' as const };
  if (config.shadowModeRequired !== true) return { verified: false as const, reason: 'SHADOW_MODE_REQUIRED' as const };
  if (config.outreachEnabled !== true) return { verified: false as const, reason: 'OUTREACH_NOT_AUTHORIZED' as const };
  if (config.autoApprovalEnabled !== true) return { verified: false as const, reason: 'AUTO_APPROVAL_NOT_AUTHORIZED' as const };
  if (config.automatedSendingEnabled !== true) return { verified: false as const, reason: 'AUTO_SEND_NOT_AUTHORIZED' as const };
  if (config.manualReviewOnly !== false) return { verified: false as const, reason: 'MANUAL_REVIEW_ONLY' as const };
  if (config.automationAuthorization !== CONTROLLED_EMAIL_AUTOMATION_AUTHORIZATION) return { verified: false as const, reason: 'CAMPAIGN_OWNER_AUTHORIZATION_MISSING' as const };
  return { verified: true as const, reason: 'CONTROLLED_MULTI_MARKET_EMAIL_AUTOPILOT_VERIFIED' as const };
}

export function controlledEmailQueueStartIso(now = new Date(), maxAgeDays = CONTROLLED_EMAIL_QUEUE_MAX_AGE_DAYS) {
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) throw new Error('maxAgeDays must be positive');
  return new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
}

export function mailboxWarmupAllowsAutomaticSend(status?: string | null) {
  return ['READY', 'WARMED', 'COMPLETED', 'ACTIVE'].includes(String(status ?? '').trim().toUpperCase());
}
