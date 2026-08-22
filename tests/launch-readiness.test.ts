import { describe, expect, it } from 'vitest';
import { buildLaunchReadiness } from '@/lib/reliability/launch-readiness';

const costGuard = {
  monthly_total_budget_usd: 25,
  warning_pct: 70,
  throttle_pct: 85,
  critical_pct: 95,
  hard_stop_pct: 100,
};

const coreIntegrations = [
  { provider: 'GOOGLE_PLACES', channel: 'DISCOVERY', enabled: true, status: 'CONNECTED' },
  { provider: 'OPENAI', channel: 'AI', enabled: true, status: 'CONNECTED' },
  { provider: 'EMAIL_PROVIDER', channel: 'EMAIL', enabled: false, status: 'NOT_CONFIGURED' },
  { provider: 'META', channel: 'WHATSAPP', enabled: false, status: 'NOT_CONFIGURED' },
];

describe('launch readiness', () => {
  it('treats deliberately fail-closed outbound as pending while the code path remains ready', () => {
    const result = buildLaunchReadiness({
      controls: { global_kill_switch: false, shadow_mode: true },
      costGuard,
      monthSpendUsd: 0.5,
      integrations: coreIntegrations,
      enabledOutreachMarkets: 6,
      manualReviewMarkets: 6,
    });

    expect(result.codeReady).toBe(true);
    expect(result.liveAutomationReady).toBe(false);
    expect(result.gates.find((gate) => gate.key === 'outbound_providers')?.state).toBe('PENDING');
  });

  it('blocks launch when the kill switch is active or Cost Guard thresholds are invalid', () => {
    const result = buildLaunchReadiness({
      controls: { global_kill_switch: true, shadow_mode: true },
      costGuard: { ...costGuard, throttle_pct: 60 },
      integrations: coreIntegrations,
      enabledOutreachMarkets: 6,
      manualReviewMarkets: 6,
    });

    expect(result.codeReady).toBe(false);
    expect(result.gates.find((gate) => gate.key === 'runtime_safety')?.state).toBe('BLOCKED');
    expect(result.gates.find((gate) => gate.key === 'cost_guard')?.state).toBe('BLOCKED');
  });
});
