import Link from 'next/link';
import {
  enrichGooglePlaceCandidate,
  runGooglePlacesControlledSample,
} from '@/app/hunter-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

type DiscoveryRow = {
  source_id: string | null;
  raw_payload: unknown;
  discovered_at: string;
};

type BusinessRow = {
  id: string;
  name: string;
  google_place_id: string | null;
  official_website: string | null;
  phone: string | null;
  category: string | null;
};

type LeadRow = {
  id: string;
  business_id: string | null;
  status: string;
};

export default async function GooglePlacesControlledPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization(true);
  const [
    { data: integration },
    { data: usage },
    { data: discoveries },
    { data: costGuard },
    { data: businesses },
    { data: leads },
  ] = await Promise.all([
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
      .limit(8),
    supabase
      .from('discovery_records')
      .select('source_id,raw_payload,discovered_at')
      .eq('organization_id', organizationId)
      .eq('source_type', 'google_places')
      .order('discovered_at', { ascending: false })
      .limit(20),
    supabase
      .from('cost_guard_settings')
      .select('google_places_budget_usd,daily_new_leads')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('businesses')
      .select('id,name,google_place_id,official_website,phone,category')
      .eq('organization_id', organizationId)
      .not('google_place_id', 'is', null)
      .limit(50),
    supabase
      .from('leads')
      .select('id,business_id,status')
      .eq('organization_id', organizationId)
      .not('business_id', 'is', null)
      .limit(100),
  ]);

  const credentialPresent = Boolean(process.env.GOOGLE_PLACES_API_KEY);
  const storedStatus = String(integration?.status ?? 'NOT_CONFIGURED');
  const effectiveStatus = !credentialPresent ? 'NOT_CONFIGURED' : storedStatus === 'NOT_CONFIGURED' ? 'READY' : storedStatus;
  const providerConnected = effectiveStatus === 'CONNECTED' && integration?.enabled === true;
  const canRun = role === 'OWNER' && credentialPresent && Number(costGuard?.google_places_budget_usd ?? 0) > 0;
  const canEnrich = canRun && providerConnected;

  const businessByPlaceId = new Map(
    ((businesses ?? []) as BusinessRow[])
      .filter((row) => row.google_place_id)
      .map((row) => [String(row.google_place_id), row]),
  );
  const leadByBusinessId = new Map(
    ((leads ?? []) as LeadRow[])
      .filter((row) => row.business_id)
      .map((row) => [String(row.business_id), row]),
  );

  return <div>
    <div className="headerRow">
      <div>
        <h1>Google Places Controlled Discovery</h1>
        <p className="muted">Owner-only production gate for Business Hunter. Discovery stores Place IDs first; selective enrichment is one candidate at a time and never triggers outreach.</p>
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
      <h2>Discovery dry-run preview</h2>
      <p className="muted">The first gate remains hard-limited to Oman and at most 3 IDs. Use it only when you intentionally need new discovery candidates.</p>
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
      {!credentialPresent ? <p className="muted">Add GOOGLE_PLACES_API_KEY to the server environment before running discovery.</p> : null}
      {Number(costGuard?.google_places_budget_usd ?? 0) <= 0 ? <p className="muted">Google Places is blocked because its provider budget is zero.</p> : null}
      {integration?.last_checked_at ? <p className="muted">Last checked {new Date(integration.last_checked_at).toLocaleString()}.</p> : null}
      {integration?.last_error ? <p className="muted">Last error: {integration.last_error}</p> : null}
    </section>

    <section className="panel">
      <div className="headerRow">
        <div>
          <h2>Selective candidate enrichment</h2>
          <p className="muted">Place Details is a paid-capable operation. Each unenriched candidate is fetched only after Cost Guard preflight. Existing businesses are reused without another Google request.</p>
        </div>
        <span className="pill">Outreach disabled</span>
      </div>
      <div className="settingsList">
        {((discoveries ?? []) as DiscoveryRow[]).length === 0 ? <p className="muted">No Google Places discovery records yet.</p> : ((discoveries ?? []) as DiscoveryRow[]).map((row) => {
          const placeId = String(row.source_id ?? '');
          const business = businessByPlaceId.get(placeId);
          const lead = business ? leadByBusinessId.get(String(business.id)) : undefined;
          return <div className="settingsRow" key={placeId}>
            <div>
              <strong>{business?.name ?? placeId}</strong>
              <div className="muted">{placeId} · discovered {new Date(row.discovered_at).toLocaleString()}</div>
              {business ? <div className="muted">
                {business.category ?? 'category pending'} · {business.official_website ? 'website found' : 'no website returned'} · {business.phone ? 'phone found' : 'phone not returned'}
              </div> : <div className="muted">ID only. No paid Place Details lookup has been persisted for this candidate.</div>}
            </div>
            <div>
              {lead ? <Link className="textLink" href="/leads">Lead {lead.status}</Link> : business ? <span className="muted">Business exists · lead pending</span> : <form action={enrichGooglePlaceCandidate}>
                <input type="hidden" name="placeId" value={placeId} />
                <button disabled={!canEnrich}>Enrich one candidate</button>
              </form>}
            </div>
          </div>;
        })}
      </div>
      {!providerConnected ? <p className="muted">Selective enrichment is blocked until Google Places is CONNECTED.</p> : null}
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
  </div>;
}
