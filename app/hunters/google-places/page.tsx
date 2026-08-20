import Link from 'next/link';
import { runGooglePlacesControlledSample } from '@/app/hunter-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

export default async function GooglePlacesControlledPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization(true);
  const [{ data: integration }, { data: usage }, { data: discoveries }, { data: costGuard }] = await Promise.all([
    supabase
      .from('integration_connections')
      .select('status,enabled,last_checked_at,last_error')
      .eq('organization_id', organizationId)
      .eq('provider', 'GOOGLE_PLACES')
      .eq('channel', 'DISCOVERY')
      .maybeSingle(),
    supabase
      .from('usage_events')
      .select('operation,cost_usd,units,metadata,created_at')
      .eq('organization_id', organizationId)
      .eq('provider', 'GOOGLE_PLACES')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('discovery_records')
      .select('source_id,raw_payload,discovered_at')
      .eq('organization_id', organizationId)
      .eq('source_type', 'google_places')
      .order('discovered_at', { ascending: false })
      .limit(5),
    supabase
      .from('cost_guard_settings')
      .select('google_places_budget_usd,daily_new_leads')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ]);

  const credentialPresent = Boolean(process.env.GOOGLE_PLACES_API_KEY);
  const storedStatus = String(integration?.status ?? 'NOT_CONFIGURED');
  const effectiveStatus = !credentialPresent ? 'NOT_CONFIGURED' : storedStatus === 'NOT_CONFIGURED' ? 'READY' : storedStatus;
  const canRun = role === 'OWNER' && credentialPresent && Number(costGuard?.google_places_budget_usd ?? 0) > 0;

  return <div>
    <div className="headerRow">
      <div>
        <h1>Google Places Controlled Discovery</h1>
        <p className="muted">Owner-only production gate for Business Hunter. It discovers Place IDs only, persists provenance, meters usage and never contacts a lead.</p>
      </div>
      <Link className="textLink" href="/hunters">← Hunters</Link>
    </div>

    <section className="grid">
      <div className="card"><span className="muted">Provider health</span><div className="value">{effectiveStatus}</div></div>
      <div className="card"><span className="muted">Google Places budget</span><div className="value">${Number(costGuard?.google_places_budget_usd ?? 0).toFixed(2)}</div></div>
      <div className="card"><span className="muted">Daily new-lead quota</span><div className="value">{Number(costGuard?.daily_new_leads ?? 0)}</div></div>
      <div className="card"><span className="muted">Credential</span><div className="value">{credentialPresent ? 'PRESENT' : 'MISSING'}</div></div>
    </section>

    <section className="panel">
      <h2>Dry-run preview</h2>
      <p className="muted">Nothing is sent while you review this form. The production action is hard-limited to Oman and at most 3 results for this first gate.</p>
      <div className="healthList">
        <span>Country <strong>OM</strong></span>
        <span>Google field mask <strong>places.id only</strong></span>
        <span>SKU <strong>Text Search Essentials (IDs Only)</strong></span>
        <span>Outreach <strong>DISABLED</strong></span>
      </div>
      <form action={runGooglePlacesControlledSample} className="settingsList">
        <div className="settingsRow">
          <label>City<input name="city" defaultValue="Muscat" maxLength={80} required /></label>
          <label>Industry<input name="industry" defaultValue="dental clinic" maxLength={100} required /></label>
          <label>Max results<input name="limit" type="number" min="1" max="3" defaultValue="3" required /></label>
          <button disabled={!canRun}>Run controlled Oman sample</button>
        </div>
      </form>
      {!credentialPresent ? <p className="muted">Add GOOGLE_PLACES_API_KEY to the server environment before running the sample.</p> : null}
      {Number(costGuard?.google_places_budget_usd ?? 0) <= 0 ? <p className="muted">Google Places is blocked because its provider budget is zero.</p> : null}
      {integration?.last_checked_at ? <p className="muted">Last checked {new Date(integration.last_checked_at).toLocaleString()}.</p> : null}
      {integration?.last_error ? <p className="muted">Last error: {integration.last_error}</p> : null}
    </section>

    <section className="panel">
      <h2>Recent Google Places usage</h2>
      <div className="settingsList">
        {(usage ?? []).length === 0 ? <p className="muted">No Google Places usage recorded yet.</p> : (usage ?? []).map((row, index) => <div className="settingsRow" key={`${row.created_at}-${index}`}>
          <strong>{row.operation}</strong>
          <span>${Number(row.cost_usd ?? 0).toFixed(6)}</span>
          <span className="muted">{Number(row.units ?? 0)} request · {new Date(row.created_at).toLocaleString()}</span>
        </div>)}
      </div>
    </section>

    <section className="panel">
      <h2>Recent persisted Place IDs</h2>
      <div className="settingsList">
        {(discoveries ?? []).length === 0 ? <p className="muted">No Google Places discovery records yet.</p> : (discoveries ?? []).map((row) => <div className="settingsRow" key={row.source_id}>
          <strong>{row.source_id}</strong>
          <span className="muted">{new Date(row.discovered_at).toLocaleString()}</span>
        </div>)}
      </div>
    </section>
  </div>;
}
