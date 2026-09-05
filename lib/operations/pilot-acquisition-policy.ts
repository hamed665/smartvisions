export type PilotAcquisitionPolicyInput = {
  status?: string | null;
  countryCode?: string | null;
  config?: Record<string, unknown> | null;
  shadowMode: boolean;
  globalKillSwitch: boolean;
  agentsPaused: boolean;
  qualificationCount: number;
  now?: Date;
};

export type PilotAcquisitionPolicyResult = {
  allowed: boolean;
  terminal: boolean;
  reason:
    | 'ALLOWED'
    | 'CAMPAIGN_NOT_RUNNING'
    | 'OMAN_ONLY'
    | 'PILOT_FLAG_REQUIRED'
    | 'AUTO_ACQUISITION_DISABLED'
    | 'SHADOW_ONLY_REQUIRED'
    | 'MANUAL_REVIEW_REQUIRED'
    | 'OUTREACH_MUST_REMAIN_DISABLED'
    | 'SHADOW_MODE_REQUIRED'
    | 'GLOBAL_KILL_SWITCH'
    | 'AGENTS_PAUSED'
    | 'PILOT_WINDOW_INVALID'
    | 'PILOT_WINDOW_NOT_STARTED'
    | 'PILOT_WINDOW_EXPIRED'
    | 'QUALIFICATION_CAP_REACHED'
    | 'COOLDOWN';
  maxPaidQualifications: number;
  cooldownMinutes: number;
  windowEndsAt: string | null;
};

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function validDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function evaluatePilotAcquisitionPolicy(input: PilotAcquisitionPolicyInput): PilotAcquisitionPolicyResult {
  const config = input.config ?? {};
  const now = input.now ?? new Date();
  const maxPaidQualifications = boundedInteger(config.maxPaidQualifications, 3, 1, 3);
  const cooldownMinutes = boundedInteger(config.autoAcquisitionCooldownMinutes, 10, 2, 60);
  const start = validDate(config.pilotWindowStartedAt);
  const end = validDate(config.pilotWindowEndsAt);
  const result = (
    allowed: boolean,
    reason: PilotAcquisitionPolicyResult['reason'],
    terminal = false,
  ): PilotAcquisitionPolicyResult => ({
    allowed,
    terminal,
    reason,
    maxPaidQualifications,
    cooldownMinutes,
    windowEndsAt: end?.toISOString() ?? null,
  });

  if (String(input.status ?? '').toUpperCase() !== 'RUNNING') return result(false, 'CAMPAIGN_NOT_RUNNING');
  if (String(input.countryCode ?? '').toUpperCase() !== 'OM') return result(false, 'OMAN_ONLY');
  if (config.pilot !== true) return result(false, 'PILOT_FLAG_REQUIRED');
  if (config.autoAcquisitionEnabled !== true) return result(false, 'AUTO_ACQUISITION_DISABLED');
  if (config.shadowOnly !== true) return result(false, 'SHADOW_ONLY_REQUIRED');
  if (config.manualReviewOnly !== true) return result(false, 'MANUAL_REVIEW_REQUIRED');
  if (config.outreachEnabled !== false) return result(false, 'OUTREACH_MUST_REMAIN_DISABLED');
  if (!input.shadowMode) return result(false, 'SHADOW_MODE_REQUIRED');
  if (input.globalKillSwitch) return result(false, 'GLOBAL_KILL_SWITCH');
  if (input.agentsPaused) return result(false, 'AGENTS_PAUSED');
  if (!start || !end || end.getTime() <= start.getTime()) return result(false, 'PILOT_WINDOW_INVALID', true);
  if (now.getTime() < start.getTime()) return result(false, 'PILOT_WINDOW_NOT_STARTED');
  if (now.getTime() >= end.getTime()) return result(false, 'PILOT_WINDOW_EXPIRED', true);
  if (Math.max(0, input.qualificationCount) >= maxPaidQualifications) return result(false, 'QUALIFICATION_CAP_REACHED', true);

  const lastRun = validDate(config.lastAutoAcquisitionAt);
  if (lastRun && now.getTime() - lastRun.getTime() < cooldownMinutes * 60_000) return result(false, 'COOLDOWN');
  return result(true, 'ALLOWED');
}
