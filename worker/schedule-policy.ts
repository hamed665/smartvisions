export type SchedulePolicyEnv = {
  DEPLOYMENT_ENV?: string;
};

export function shouldRunScheduledOperations(env: SchedulePolicyEnv) {
  return String(env.DEPLOYMENT_ENV ?? '').trim().toLowerCase() === 'production';
}
