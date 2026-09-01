import { updateCostGuardSettings } from '@/app/cost-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { evaluateBudgetMode } from '@/lib/reliability/cost-guard';
import { buildUsageAnalytics, type UsageAnalyticsRow } from '@/lib/reliability/usage-analytics';

export const dynamic = 'force-dynamic';

export default async function CostUsagePage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const start = new Date();start.setUTCDate(1);start.setUTCHours(0,0,0,0);
  const [{ data: settings }, { data: usage }, {data: leads}, {data: campaigns}] = await Promise.all([
    supabase.from('cost_guard_settings').select('*').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('usage_events').select('provider,operation,cost_usd,input_tokens,output_tokens,units,lead_id,metadata,created_at').eq('organization_id', organizationId).gte('created_at', start.toISOString()).order('created_at',{ascending:true}),
    supabase.from('leads').select('id,status').eq('organization_id',organizationId),
    supabase.from('campaigns').select('id,name').eq('organization_id',organizationId),
  ]);

  const defaults = {
    monthly_total_budget_usd: 25, openai_budget_usd: 10, google_places_budget_usd: 5, email_budget_usd: 4, whatsapp_budget_usd: 3, reserve_budget_usd: 3,
    daily_new_leads: 50, daily_website_audits: 15, daily_deep_ai_runs: 10, max_ai_runs_per_lead: 20, max_voice_seconds: 180, max_auto_retries: 1,
    warning_pct: 70, throttle_pct: 85, critical_pct: 95, hard_stop_pct: 100, audit_cache_days: 30, model_routing_enabled: true, low_cost_model: null, high_reasoning_model: null,
  };
  const s = { ...defaults, ...(settings ?? {}) };
  const rows=(usage??[]) as UsageAnalyticsRow[];
  const analytics=buildUsageAnalytics(rows,(leads??[]).map(l=>({id:String(l.id),status:String(l.status)})),s);
  const totalTokens=(usage??[]).reduce((sum,row)=>sum+Number(row.input_tokens??0)+Number(row.output_tokens??0),0);
  const { percentUsed, mode } = evaluateBudgetMode(analytics.totalSpend, s);
  const editable = role === 'OWNER';
  const campaignNames=new Map((campaigns??[]).map(c=>[String(c.id),String(c.name)]));
  const topEntries=(record:Record<string,number>,limit=8)=>Object.entries(record).sort((a,b)=>b[1]-a[1]).slice(0,limit);
  const pendingProviders=topEntries(analytics.costQuality.pendingByProvider);

  return <div>
    <div className="headerRow"><div><h1>Cost & Usage</h1><p className="muted">Canonical budget guard, provider/operation attribution, outcome cost and anomaly visibility.</p></div><span className={`status ${mode === 'HARD_STOP' || mode === 'CRITICAL' ? 'dangerStatus' : ''}`}>{mode}</span></div>

    {(analytics.anomalies.spendSpike||analytics.anomalies.noOutcomeSpend)?<section className="panel dangerPanel"><h2>Cost anomaly warning</h2>{analytics.anomalies.spendSpike?<p className="muted">Today recorded spend ${analytics.anomalies.todaySpend.toFixed(2)} is above the configured spend-pace tolerance derived from your monthly budget and warning/hard-stop thresholds.</p>:null}{analytics.anomalies.noOutcomeSpend?<p className="muted">Recorded paid usage exists this month but no lead has reached a qualified state yet. Review acquisition quality before increasing spend.</p>:null}</section>:null}

    <section className="grid">
      <div className="card"><span className="muted">Recorded spend</span><div className="value">${analytics.totalSpend.toFixed(2)}</div><span className="muted smallText">{percentUsed.toFixed(1)}% of ${Number(s.monthly_total_budget_usd).toFixed(2)} guardrail</span></div>
      <div className="card"><span className="muted">Cost / Qualified</span><div className="value">{analytics.costPer.qualified===null?'—':`$${analytics.costPer.qualified.toFixed(2)}`}</div><span className="muted smallText">{analytics.counts.qualified} qualified+</span></div>
      <div className="card"><span className="muted">Cost / Reply</span><div className="value">{analytics.costPer.replied===null?'—':`$${analytics.costPer.replied.toFixed(2)}`}</div><span className="muted smallText">{analytics.counts.replied} replied+</span></div>
      <div className="card"><span className="muted">Cost / Won</span><div className="value">{analytics.costPer.won===null?'—':`$${analytics.costPer.won.toFixed(2)}`}</div><span className="muted smallText">{analytics.counts.won} won</span></div>
      <div className="card"><span className="muted">AI tokens</span><div className="value">{totalTokens.toLocaleString()}</div><span className="muted smallText">metered this month</span></div>
    </section>

    <section className="panel">
      <h2>Cost data quality</h2>
      <p className="muted">Recorded spend is the Cost Guard source of truth, but not every provider charge is immediately final. Pending events stay visibly pending instead of being presented as a fake $0 bill.</p>
      <div className="settingsList">
        <div className="settingsRow"><strong>Reconciled / token-metered</strong><span>{analytics.costQuality.reconciledEvents} events</span></div>
        <div className="settingsRow"><strong>Conservative reserves</strong><span>{analytics.costQuality.conservativeEvents} events · ${analytics.costQuality.conservativeSpend.toFixed(4)}</span></div>
        <div className="settingsRow"><strong>Pending provider reconciliation</strong><span>{analytics.costQuality.pendingEvents} events · {analytics.costQuality.pendingUnits} units</span></div>
        <div className="settingsRow"><strong>Legacy / unclassified</strong><span>{analytics.costQuality.unclassifiedEvents} events</span></div>
      </div>
      {pendingProviders.length?<div className="settingsList">{pendingProviders.map(([provider,count])=><div className="settingsRow" key={provider}><strong>{provider}</strong><span>{count} pending events</span></div>)}</div>:<p className="muted">No current provider event is waiting for pricing reconciliation.</p>}
    </section>

    <section className="twoCol"><div className="panel"><h2>Spend by provider</h2><div className="settingsList">{topEntries(analytics.providerSpend).map(([key,value])=><div className="settingsRow" key={key}><strong>{key}</strong><span>${value.toFixed(4)}</span></div>)}</div></div><div className="panel"><h2>Spend by operation</h2><div className="settingsList">{topEntries(analytics.operationSpend).map(([key,value])=><div className="settingsRow" key={key}><strong>{key}</strong><span>${value.toFixed(4)}</span></div>)}</div></div></section>
    <section className="twoCol"><div className="panel"><h2>Daily spend</h2><div className="settingsList">{topEntries(analytics.daySpend,31).sort((a,b)=>a[0].localeCompare(b[0])).map(([key,value])=><div className="settingsRow" key={key}><strong>{key}</strong><span>${value.toFixed(4)}</span></div>)}</div></div><div className="panel"><h2>Campaign attribution</h2>{Object.keys(analytics.campaignSpend).length?<div className="settingsList">{topEntries(analytics.campaignSpend).map(([key,value])=><div className="settingsRow" key={key}><strong>{campaignNames.get(key)??key}</strong><span>${value.toFixed(4)}</span></div>)}</div>:<p className="muted">No usage event has campaign attribution yet.</p>}</div></section>

    <section className="panel">
      <h2>Editable guardrails</h2><p className="muted">This is the single canonical budget source. Changes apply at runtime and do not require a redeploy.</p>
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
        <label className="toggleLabel"><input type="checkbox" name="confirm_large_change" disabled={!editable}/> Confirm unusually large budget/quota increase</label><button disabled={!editable}>Save cost guard</button>
      </form>
    </section>
  </div>;
}
