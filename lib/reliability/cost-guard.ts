import { createClient } from '@supabase/supabase-js';

export type CostGuardSettings = {
  organization_id: string;
  monthly_total_budget_usd: number;
  openai_budget_usd: number;
  google_places_budget_usd: number;
  email_budget_usd: number;
  whatsapp_budget_usd: number;
  reserve_budget_usd: number;
  daily_new_leads: number;
  daily_website_audits: number;
  daily_deep_ai_runs: number;
  max_ai_runs_per_lead: number;
  max_voice_seconds: number;
  max_auto_retries: number;
  warning_pct: number;
  throttle_pct: number;
  critical_pct: number;
  hard_stop_pct: number;
  audit_cache_days: number;
  model_routing_enabled: boolean;
  low_cost_model: string | null;
  high_reasoning_model: string | null;
};

export type BudgetMode = 'NORMAL' | 'WARNING' | 'THROTTLED' | 'CRITICAL' | 'HARD_STOP';

export type CostGuardState = {
  settings: CostGuardSettings;
  monthSpendUsd: number;
  providerSpendUsd: Record<string, number>;
  percentUsed: number;
  mode: BudgetMode;
};

export function evaluateBudgetMode(spendUsd: number, settings: Pick<CostGuardSettings,'monthly_total_budget_usd'|'warning_pct'|'throttle_pct'|'critical_pct'|'hard_stop_pct'>): { percentUsed: number; mode: BudgetMode } {
  const budget = Math.max(0, Number(settings.monthly_total_budget_usd));
  if (budget === 0) return { percentUsed: spendUsd > 0 ? 100 : 0, mode: spendUsd > 0 ? 'HARD_STOP' : 'NORMAL' };
  const percentUsed = (Math.max(0, spendUsd) / budget) * 100;
  if (percentUsed >= settings.hard_stop_pct) return { percentUsed, mode: 'HARD_STOP' };
  if (percentUsed >= settings.critical_pct) return { percentUsed, mode: 'CRITICAL' };
  if (percentUsed >= settings.throttle_pct) return { percentUsed, mode: 'THROTTLED' };
  if (percentUsed >= settings.warning_pct) return { percentUsed, mode: 'WARNING' };
  return { percentUsed, mode: 'NORMAL' };
}

export function shouldAllowPaidOperation(mode: BudgetMode, priority: 'LOW'|'NORMAL'|'HIGH'|'CRITICAL'): boolean {
  if (mode === 'HARD_STOP') return false;
  if (mode === 'CRITICAL') return priority === 'CRITICAL' || priority === 'HIGH';
  if (mode === 'THROTTLED') return priority !== 'LOW';
  return true;
}

export function assertPaidOperationAllowed(state: CostGuardState | null, priority: 'LOW'|'NORMAL'|'HIGH'|'CRITICAL' = 'NORMAL') {
  if (!state) throw new Error('Cost guard state is unavailable; paid operation blocked');
  if (!shouldAllowPaidOperation(state.mode, priority)) {
    throw new Error(`Paid operation blocked by cost guard (${state.mode})`);
  }
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serverKey) throw new Error('Server Supabase secret is not configured; paid operation blocked');
  return createClient(url, serverKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getCostGuardState(organizationId?: string): Promise<CostGuardState | null> {
  if (!organizationId) throw new Error('organizationId is required for paid operations');
  const supabase = serviceClient();

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0,0,0,0);

  const [{ data: settingsData, error: settingsError }, { data: usageData, error: usageError }] = await Promise.all([
    supabase.from('cost_guard_settings').select('*').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('usage_events').select('provider,cost_usd').eq('organization_id', organizationId).gte('created_at', start.toISOString()),
  ]);
  if (settingsError) throw new Error(`cost guard settings unavailable: ${settingsError.message}`);
  if (usageError) throw new Error(`usage totals unavailable: ${usageError.message}`);
  if (!settingsData) throw new Error('Cost guard settings are missing; paid operation blocked');

  const providerSpendUsd: Record<string, number> = {};
  let monthSpendUsd = 0;
  for (const event of usageData ?? []) {
    const cost = Number(event.cost_usd ?? 0);
    monthSpendUsd += cost;
    const provider = String(event.provider ?? 'OTHER').toUpperCase();
    providerSpendUsd[provider] = (providerSpendUsd[provider] ?? 0) + cost;
  }
  const settings = settingsData as CostGuardSettings;
  const { percentUsed, mode } = evaluateBudgetMode(monthSpendUsd, settings);
  return { settings, monthSpendUsd, providerSpendUsd, percentUsed, mode };
}

export async function recordUsage(input: {
  organizationId: string;
  provider: string;
  operation: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  units?: number;
  leadId?: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = serviceClient();
  const { error } = await supabase.from('usage_events').insert({
    organization_id: input.organizationId,
    provider: input.provider.toUpperCase(),
    operation: input.operation,
    cost_usd: Math.max(0, input.costUsd ?? 0),
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
    units: input.units ?? null,
    lead_id: input.leadId ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error(`usage event insert failed: ${error.message}`);
}
