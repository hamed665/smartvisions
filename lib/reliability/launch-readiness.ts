import { evaluateBudgetMode, type CostGuardSettings } from './cost-guard';

export type IntegrationHealth = {
  provider: string;
  channel: string;
  enabled: boolean;
  status: string;
  last_checked_at?: string | null;
  last_error?: string | null;
};

export type LaunchGateState = 'PASS' | 'PENDING' | 'BLOCKED';

export type LaunchGate = {
  key: string;
  label: string;
  state: LaunchGateState;
  detail: string;
};

export type LaunchReadinessInput = {
  controls?: {
    global_kill_switch?: boolean | null;
    shadow_mode?: boolean | null;
    email_paused?: boolean | null;
    whatsapp_ai_paused?: boolean | null;
    agents_paused?: boolean | null;
  } | null;
  costGuard?: Partial<CostGuardSettings> | null;
  monthSpendUsd?: number;
  integrations?: IntegrationHealth[] | null;
  manualReviewMarkets?: number;
  enabledOutreachMarkets?: number;
};

function findIntegration(rows: IntegrationHealth[], provider: string, channel: string) {
  return rows.find((row) => row.provider === provider && row.channel === channel);
}

function isConnected(row?: IntegrationHealth) {
  return Boolean(row?.enabled && row.status === 'CONNECTED');
}

export function buildLaunchReadiness(input: LaunchReadinessInput) {
  const controls = input.controls ?? {};
  const integrations = input.integrations ?? [];
  const gates: LaunchGate[] = [];

  gates.push({
    key: 'runtime_safety',
    label: 'Runtime safety controls',
    state: controls.global_kill_switch ? 'BLOCKED' : 'PASS',
    detail: controls.global_kill_switch
      ? 'Global kill switch is active. Production automation cannot launch.'
      : 'Global kill switch is available and currently off.',
  });

  gates.push({
    key: 'shadow_mode',
    label: 'Shadow-mode protection',
    state: controls.shadow_mode ? 'PASS' : 'PENDING',
    detail: controls.shadow_mode
      ? 'Autonomous outbound is still shadowed while launch verification is in progress.'
      : 'Shadow Mode is off. Keep this intentional and only after controlled live-provider verification.',
  });

  const cost = input.costGuard;
  if (!cost || !Number.isFinite(Number(cost.monthly_total_budget_usd))) {
    gates.push({ key: 'cost_guard', label: 'Cost Guard', state: 'BLOCKED', detail: 'Canonical Cost Guard settings are missing.' });
  } else {
    const budget = Number(cost.monthly_total_budget_usd ?? 0);
    const thresholds = [cost.warning_pct, cost.throttle_pct, cost.critical_pct, cost.hard_stop_pct].map((v) => Number(v ?? 0));
    const ordered = thresholds.every((value, index) => index === 0 || value >= thresholds[index - 1]);
    const { mode } = evaluateBudgetMode(Number(input.monthSpendUsd ?? 0), cost as CostGuardSettings);
    gates.push({
      key: 'cost_guard',
      label: 'Cost Guard',
      state: budget > 0 && ordered && mode !== 'HARD_STOP' ? 'PASS' : 'BLOCKED',
      detail: budget <= 0
        ? 'Monthly budget must be greater than zero before paid operations can launch.'
        : !ordered
          ? 'Budget thresholds are not ordered warning ≤ throttle ≤ critical ≤ hard stop.'
          : `Canonical monthly budget is $${budget.toFixed(2)} and current mode is ${mode}.`,
    });
  }

  const google = findIntegration(integrations, 'GOOGLE_PLACES', 'DISCOVERY');
  const openai = findIntegration(integrations, 'OPENAI', 'AI');
  gates.push({
    key: 'core_providers',
    label: 'Core qualification providers',
    state: isConnected(google) && isConnected(openai) ? 'PASS' : 'BLOCKED',
    detail: `Google Places ${isConnected(google) ? 'CONNECTED' : 'not connected'} · OpenAI ${isConnected(openai) ? 'CONNECTED' : 'not connected'}.`,
  });

  const email = findIntegration(integrations, 'EMAIL_PROVIDER', 'EMAIL');
  const whatsapp = findIntegration(integrations, 'META', 'WHATSAPP');
  const outboundReady = isConnected(email) && isConnected(whatsapp);
  gates.push({
    key: 'outbound_providers',
    label: 'Live outbound providers',
    state: outboundReady ? 'PASS' : 'PENDING',
    detail: outboundReady
      ? 'Email and WhatsApp are production verified.'
      : `Live outbound remains fail-closed: Email ${email?.status ?? 'missing'} · WhatsApp ${whatsapp?.status ?? 'missing'}.`,
  });

  const enabledMarkets = Number(input.enabledOutreachMarkets ?? 0);
  const manualMarkets = Number(input.manualReviewMarkets ?? 0);
  gates.push({
    key: 'approval_boundaries',
    label: 'Human approval boundaries',
    state: enabledMarkets > 0 && manualMarkets === enabledMarkets ? 'PASS' : enabledMarkets === 0 ? 'PENDING' : 'BLOCKED',
    detail: enabledMarkets === 0
      ? 'No outreach markets are enabled.'
      : `${manualMarkets}/${enabledMarkets} enabled outreach markets currently require manual review.`,
  });

  const blocked = gates.some((gate) => gate.state === 'BLOCKED');
  const pending = gates.some((gate) => gate.state === 'PENDING');
  const codeReady = !blocked;
  const liveAutomationReady = codeReady && !pending && outboundReady && !controls.shadow_mode;

  return { gates, codeReady, liveAutomationReady };
}
