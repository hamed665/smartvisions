import { updateCostGuardSettings } from '@/app/cost-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { evaluateBudgetMode } from '@/lib/reliability/cost-guard';

export const dynamic = 'force-dynamic';

type UsageRow = { provider: string; cost_usd: number | string | null; input_tokens: number | null; output_tokens: number | null; units: number | string | null };

export default async function CostUsagePage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const [{ data: settings }, { data: usage }] = await Promise.all([
    supabase.from('cost_guard_settings').select('*').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('usage_events').select('provider,cost_usd,input_tokens,output_tokens,units').eq('organization_id', organizationId).gte('created_at', start.toISOString()),
  ]);

  const rows = (usage ?? []) as UsageRow[];
  const providerSpend: Record<string, number> = {};
  let monthSpend = 0;
  let totalTokens = 0;
  for (const row of rows) {
    const cost = Number(row.cost_usd ?? 0);
    monthSpend += cost;
    const provider = String(row.provider || 'OTHER').toUpperCase();
    providerSpend[provider] = (providerSpend[provider] ?? 0) + cost;
    totalTokens += Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0);
  }

  const defaults = {
    monthly_total_budget_usd: 25, openai_budget_usd: 10, google_places_budget_usd: 5, email_budget_usd: 4, whatsapp_budget_usd: 3, reserve_budget_usd: 3,
    daily_new_leads: 50, daily_website_audits: 15, daily_deep_ai_runs: 10, max_ai_runs_per_lead: 20, max_voice_seconds: 180, max_auto_retries: 1,
    warning_pct: 70, throttle_pct: 85, critical_pct: 95, hard_stop_pct: 100, audit_cache_days: 30, model_routing_enabled: true, low_cost_model: null, high_reasoning_model: null,
  };
  const s = { ...defaults, ...(settings ?? {}) };
  const { percentUsed, mode } = evaluateBudgetMode(monthSpend, s);
  const editable = role === 'OWNER';

  return <div>
    <div className="headerRow"><div><h1>Cost & Usage</h1><p className="muted">Live budget guard, provider allocations, daily quotas and AI efficiency controls.</p></div><span className={`status ${mode === 'HARD_STOP' || mode === 'CRITICAL' ? 'dangerStatus' : ''}`}>{mode}</span></div>

    <section className="grid">
      <div className="card"><span className="muted">Month spend</span><div className="value">${monthSpend.toFixed(2)}</div><span className="muted smallText">{percentUsed.toFixed(1)}% of ${Number(s.monthly_total_budget_usd).toFixed(2)}</span></div>
      <div className="card"><span className="muted">OpenAI</span><div className="value">${(providerSpend.OPENAI ?? 0).toFixed(2)}</div><span className="muted smallText">Cap ${Number(s.openai_budget_usd).toFixed(2)}</span></div>
      <div className="card"><span className="muted">Google Places</span><div className="value">${(providerSpend.GOOGLE_PLACES ?? 0).toFixed(2)}</div><span className="muted smallText">Cap ${Number(s.google_places_budget_usd).toFixed(2)}</span></div>
      <div className="card"><span className="muted">AI tokens</span><div className="value">{totalTokens.toLocaleString()}</div><span className="muted smallText">metered this month</span></div>
    </section>

    <section className="panel">
      <h2>Editable guardrails</h2>
      <p className="muted">Changes apply at runtime. Large increases require explicit confirmation. Values can be raised or lowered later without a redeploy.</p>
      <form action={updateCostGuardSettings} className="settingsGrid">
        <label>Total monthly budget USD<input type="number" min="0" step="0.01" name="monthly_total_budget_usd" defaultValue={s.monthly_total_budget_usd} disabled={!editable}/></label>
        <label>OpenAI budget USD<input type="number" min="0" step="0.01" name="openai_budget_usd" defaultValue={s.openai_budget_usd} disabled={!editable}/></label>
        <label>Google Places budget USD<input type="number" min="0" step="0.01" name="google_places_budget_usd" defaultValue={s.google_places_budget_usd} disabled={!editable}/></label>
        <label>Email budget USD<input type="number" min="0" step="0.01" name="email_budget_usd" defaultValue={s.email_budget_usd} disabled={!editable}/></label>
        <label>WhatsApp budget USD<input type="number" min="0" step="0.01" name="whatsapp_budget_usd" defaultValue={s.whatsapp_budget_usd} disabled={!editable}/></label>
        <label>Reserve budget USD<input type="number" min="0" step="0.01" name="reserve_budget_usd" defaultValue={s.reserve_budget_usd} disabled={!editable}/></label>

        <label>Daily new leads<input type="number" min="0" name="daily_new_leads" defaultValue={s.daily_new_leads} disabled={!editable}/></label>
        <label>Daily website audits<input type="number" min="0" name="daily_website_audits" defaultValue={s.daily_website_audits} disabled={!editable}/></label>
        <label>Daily deep AI runs<input type="number" min="0" name="daily_deep_ai_runs" defaultValue={s.daily_deep_ai_runs} disabled={!editable}/></label>
        <label>Max AI runs / lead<input type="number" min="0" name="max_ai_runs_per_lead" defaultValue={s.max_ai_runs_per_lead} disabled={!editable}/></label>
        <label>Max voice seconds<input type="number" min="0" name="max_voice_seconds" defaultValue={s.max_voice_seconds} disabled={!editable}/></label>
        <label>Max automatic retries<input type="number" min="0" max="5" name="max_auto_retries" defaultValue={s.max_auto_retries} disabled={!editable}/></label>

        <label>Warning %<input type="number" min="1" max="100" name="warning_pct" defaultValue={s.warning_pct} disabled={!editable}/></label>
        <label>Throttle %<input type="number" min="1" max="100" name="throttle_pct" defaultValue={s.throttle_pct} disabled={!editable}/></label>
        <label>Critical %<input type="number" min="1" max="100" name="critical_pct" defaultValue={s.critical_pct} disabled={!editable}/></label>
        <label>Hard stop %<input type="number" min="1" max="100" name="hard_stop_pct" defaultValue={s.hard_stop_pct} disabled={!editable}/></label>
        <label>Website audit cache days<input type="number" min="0" name="audit_cache_days" defaultValue={s.audit_cache_days} disabled={!editable}/></label>

        <label className="toggleLabel"><input type="checkbox" name="model_routing_enabled" defaultChecked={s.model_routing_enabled} disabled={!editable}/> Use cost-aware model routing</label>
        <label>Low-cost model override<input name="low_cost_model" placeholder="Leave blank to use agent defaults" defaultValue={s.low_cost_model ?? ''} disabled={!editable}/></label>
        <label>High-reasoning model override<input name="high_reasoning_model" placeholder="Leave blank to use agent defaults" defaultValue={s.high_reasoning_model ?? ''} disabled={!editable}/></label>
        <label className="toggleLabel"><input type="checkbox" name="confirm_large_change" disabled={!editable}/> Confirm unusually large budget/quota increase</label>
        <button disabled={!editable}>Save cost guard</button>
      </form>
    </section>

    <section className="panel">
      <h2>Automatic behavior</h2>
      <div className="settingsList">
        <div className="settingsRow"><strong>Warning</strong><span>{s.warning_pct}%</span><span className="muted">Alert only; normal operations continue.</span></div>
        <div className="settingsRow"><strong>Throttle</strong><span>{s.throttle_pct}%</span><span className="muted">Low-priority paid operations stop.</span></div>
        <div className="settingsRow"><strong>Critical</strong><span>{s.critical_pct}%</span><span className="muted">Only high-value and critical operations continue.</span></div>
        <div className="settingsRow"><strong>Hard stop</strong><span>{s.hard_stop_pct}%</span><span className="muted">New paid API operations are blocked.</span></div>
      </div>
    </section>
  </div>;
}
