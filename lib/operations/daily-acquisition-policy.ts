import { isSupportedMarketCode } from '@/lib/outreach/market-profile';

export type DailyAcquisitionPolicyInput = {
  status?: string | null;
  countryCode?: string | null;
  config?: Record<string, unknown> | null;
  shadowMode: boolean;
  globalKillSwitch: boolean;
  agentsPaused: boolean;
  emailPaused: boolean;
};

export function evaluateDailyAcquisitionPolicy(input: DailyAcquisitionPolicyInput) {
  const config = input.config ?? {};
  const marketCode = String(input.countryCode ?? '').trim().toUpperCase();
  const block = (reason: string) => ({ allowed: false as const, reason, marketCode });
  if (String(input.status ?? '').toUpperCase() !== 'RUNNING') return block('CAMPAIGN_NOT_RUNNING');
  if (!isSupportedMarketCode(marketCode)) return block('MARKET_NOT_SUPPORTED');
  if (config.dailyOutreachTarget !== true) return block('DAILY_TARGET_REQUIRED');
  if (config.autoAcquisitionEnabled !== true) return block('AUTO_ACQUISITION_DISABLED');
  if (String(config.outreachMode ?? '').toUpperCase() !== 'CONTROLLED') return block('OUTREACH_MODE_NOT_CONTROLLED');
  if (config.shadowModeRequired !== true || !input.shadowMode) return block('SHADOW_MODE_REQUIRED');
  if (config.outreachEnabled !== true) return block('OUTREACH_NOT_AUTHORIZED');
  if (config.automatedSendingEnabled !== true) return block('AUTO_SEND_NOT_AUTHORIZED');
  if (config.automationAuthorization !== 'OWNER_REQUESTED_FULL_AUTOMATION') return block('OWNER_AUTHORIZATION_MISSING');
  if (input.globalKillSwitch) return block('GLOBAL_KILL_SWITCH');
  if (input.agentsPaused) return block('AGENTS_PAUSED');
  if (input.emailPaused) return block('EMAIL_PAUSED');
  return { allowed: true as const, reason: 'ALLOWED', marketCode };
}
