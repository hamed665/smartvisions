import { DateTime } from 'luxon';

export type SchedulePolicyEnv = {
  DEPLOYMENT_ENV?: string;
};

export const MUSCAT_AGENT_WINDOW = {
  timezone: 'Asia/Muscat',
  start: '09:00',
  end: '19:00',
} as const;

export function isInsideMuscatAgentWindow(scheduledTime?: number) {
  const local = DateTime.fromMillis(scheduledTime ?? Date.now(), { zone: 'utc' }).setZone(MUSCAT_AGENT_WINDOW.timezone);
  if (!local.isValid) return false;
  const minutes = local.hour * 60 + local.minute;
  return minutes >= 9 * 60 && minutes < 19 * 60;
}

export function shouldRunScheduledOperations(env: SchedulePolicyEnv, scheduledTime?: number) {
  const production = String(env.DEPLOYMENT_ENV ?? '').trim().toLowerCase() === 'production';
  return production && isInsideMuscatAgentWindow(scheduledTime);
}
