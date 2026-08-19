export interface MailboxMetrics {
  enabled: boolean;
  dailyLimit: number;
  sentToday: number;
  bounceRate: number;
  complaintRate: number;
  providerHealthy: boolean;
}

export function evaluateMailboxHealth(metrics: MailboxMetrics) {
  const blocks: string[] = [];
  const warnings: string[] = [];

  if (!metrics.enabled) blocks.push('MAILBOX_DISABLED');
  if (!metrics.providerHealthy) blocks.push('PROVIDER_UNHEALTHY');
  if (metrics.sentToday >= metrics.dailyLimit) blocks.push('DAILY_LIMIT_REACHED');
  if (metrics.bounceRate > 0.05) blocks.push('BOUNCE_RATE_TOO_HIGH');
  else if (metrics.bounceRate > 0.03) warnings.push('BOUNCE_RATE_ELEVATED');
  if (metrics.complaintRate > 0.002) blocks.push('COMPLAINT_RATE_TOO_HIGH');

  return {
    allowed: blocks.length === 0,
    blocks,
    warnings,
  };
}
