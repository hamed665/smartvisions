'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';

const text = (f: FormData, key: string) => String(f.get(key) ?? '').trim();
const num = (f: FormData, key: string, fallback = 0) => {
  const raw = text(f, key);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${key} must be numeric`);
  return value;
};
const integer = (f: FormData, key: string, fallback = 0) => Math.max(0, Math.round(num(f, key, fallback)));
const checked = (f: FormData, key: string) => f.get(key) === 'on';

export async function updateCostGuardSettings(f: FormData) {
  const ctx = await getCurrentOrganization(true);
  const { data: current, error: currentError } = await ctx.supabase
    .from('cost_guard_settings')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (currentError) throw currentError;

  const warning = integer(f, 'warning_pct', 70);
  const throttle = integer(f, 'throttle_pct', 85);
  const critical = integer(f, 'critical_pct', 95);
  const hardStop = integer(f, 'hard_stop_pct', 100);
  if (!(warning < throttle && throttle < critical && critical <= hardStop && hardStop <= 100)) {
    throw new Error('Thresholds must be ordered: warning < throttle < critical <= hard stop <= 100');
  }

  const payload = {
    organization_id: ctx.organizationId,
    monthly_total_budget_usd: Math.max(0, num(f, 'monthly_total_budget_usd', 25)),
    openai_budget_usd: Math.max(0, num(f, 'openai_budget_usd', 10)),
    google_places_budget_usd: Math.max(0, num(f, 'google_places_budget_usd', 5)),
    email_budget_usd: Math.max(0, num(f, 'email_budget_usd', 4)),
    whatsapp_budget_usd: Math.max(0, num(f, 'whatsapp_budget_usd', 3)),
    reserve_budget_usd: Math.max(0, num(f, 'reserve_budget_usd', 3)),
    daily_new_leads: integer(f, 'daily_new_leads', 50),
    daily_website_audits: integer(f, 'daily_website_audits', 15),
    daily_deep_ai_runs: integer(f, 'daily_deep_ai_runs', 10),
    max_ai_runs_per_lead: integer(f, 'max_ai_runs_per_lead', 20),
    max_voice_seconds: integer(f, 'max_voice_seconds', 180),
    max_auto_retries: Math.min(5, integer(f, 'max_auto_retries', 1)),
    warning_pct: warning,
    throttle_pct: throttle,
    critical_pct: critical,
    hard_stop_pct: hardStop,
    audit_cache_days: integer(f, 'audit_cache_days', 30),
    model_routing_enabled: checked(f, 'model_routing_enabled'),
    low_cost_model: text(f, 'low_cost_model') || null,
    high_reasoning_model: text(f, 'high_reasoning_model') || null,
    updated_at: new Date().toISOString(),
  };

  const previousBudget = Number(current?.monthly_total_budget_usd ?? 25);
  const previousDailyLeads = Number(current?.daily_new_leads ?? 50);
  const unusuallyLargeIncrease =
    (payload.monthly_total_budget_usd > Math.max(previousBudget * 3, previousBudget + 50)) ||
    (payload.daily_new_leads > Math.max(previousDailyLeads * 5, previousDailyLeads + 250));
  if (unusuallyLargeIncrease && !checked(f, 'confirm_large_change')) {
    throw new Error('This is an unusually large increase. Check the confirmation box and save again.');
  }

  const providerBudgetTotal = payload.openai_budget_usd + payload.google_places_budget_usd + payload.email_budget_usd + payload.whatsapp_budget_usd + payload.reserve_budget_usd;
  if (providerBudgetTotal > payload.monthly_total_budget_usd * 1.25 && payload.monthly_total_budget_usd > 0) {
    throw new Error('Provider budgets are too far above the total monthly budget. Adjust the allocation first.');
  }

  const { error } = await ctx.supabase
    .from('cost_guard_settings')
    .upsert(payload, { onConflict: 'organization_id' });
  if (error) throw error;

  await ctx.supabase.from('audit_logs').insert({
    organization_id: ctx.organizationId,
    actor_type: 'USER',
    actor_id: ctx.userId,
    action: 'UPDATE_COST_GUARD',
    entity_type: 'cost_guard_settings',
    entity_id: ctx.organizationId,
    before_data: current ?? null,
    after_data: payload,
  });

  revalidatePath('/cost-usage');
  revalidatePath('/system');
  revalidatePath('/');
}
