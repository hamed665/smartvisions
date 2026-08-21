import Link from 'next/link';
import { enrichGooglePlaceCandidate, runGooglePlacesControlledSample } from '@/app/hunter-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

const formatMuscat = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Muscat', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';

type DiscoveryRow = { source_id: string | null; raw_payload: unknown; discovered_at: string };
type BusinessRow = {
  id: string; name: string; google_place_id: string | null; official_website: string | null; phone: string | null; category: string | null;
  google_business_status: string | null; google_rating: number | null; google_user_rating_count: number | null; formatted_address: string | null;
};
type LeadRow = { id: string; business_id: string | null; status: string; opportunity_score: number | null };

export default async function GooglePlacesControlledPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization(true);
  const [
    { data: integration }, { data: usage }, { data: discoveries }, { data: costGuard }, { data: businesses }, { data: leads },
  ] = await Promise.all([
    supabase.from('integration_connections').select('status,enabled,last_checked_at,last_error').eq('organization_id', organizationId).eq('provider', 'GOOGLE_PLACES').eq('channel', 'DISCOVERY').maybeSingle(),
    supabase.from('usage_events').select('operation,cost_usd,units,metadata,created_at').eq('organization_id', organizationId).eq('provider', 'GOOGLE_PLACES').order('created_at', { ascending: false }).limit(12),
    supabase.from('discovery_records').select('source_id,raw_payload,discovered_at').eq('organization_id', organizationId).eq('source_type', 'google_places').order('discovered_at', { ascending: false }).limit(40),
    supabase.from('cost_guard_settings').select('google_places_budget_usd,daily_new_leads').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('businesses').select('id,name,google_place_id,official_website,phone,category,google_business_status,google_rating,google_user_rating_count,formatted_address').eq('organization_id', organizationId).not('google_place_id', 'is', null).limit(100),
    supabase.from('leads').select('id,business_id,status,opportunity_score').eq('organization_id', organizationId).not('business_id', 'is', null).limit(200),
  ]);

  const credentialPresent = Boolean(process.env.GOOGLE_PLACES_API_KEY);
  const storedStatus = String(integration?.status ?? 'NOT_CONFIGURED');
  const effectiveStatus = !credentialPresent ? 'NOT_CONFIGURED' : storedStatus === 'NOT_CONFIGURED' ? 'READY' : storedStatus;
  const providerConnected = effectiveStatus === 'CONNECTED' && integration?.enabled === true;
  const canRun = role === 'OWNER' && credentialPresent && Number(costGuard?.google_places_budget_usd ?? 0) > 0;
  const canEnrich = canRun && providerConnected;

  const businessByPlaceId = new Map(((businesses ?? []) as BusinessRow[]).filter((row) => row.google_place_id).map((row) => [String(row.google_place_id), row]));
  const leadByBusinessId = new Map(((leads ?? []) as LeadRow[]).filter((row) => row.business_id).map((row) => [String(row.business_id), row]));
  const priorityBusinesses = ((businesses ?? []) as BusinessRow[])
    .filter((b) => String(b.google_business_status ?? '').toUpperCase() === 'OPERATIONAL' && !String(b.official_website ?? '').trim())
    .map((b) => ({ business: b, lead: leadByBusinessId.get(String(b.id)) }))
    .sort((a, b) => Number(b.lead?.opportunity_score ?? 0) - Number(a.lead?.opportunity_score ?? 0) || Number(b.business.google_user_rating_count ?? 0) - Number(a.business.google_user_rating_count ?? 0));

  return <div>
    <div className="headerRow"><div><h1>Google Places No-Website Hunter</h1><p className="muted">Primary target: operational Oman businesses with no official website. Discovery stays cheap, qualification is selective, and only qualified no-website businesses become leads.</p></div><Link className="textLink" href="/hunters">← Hunters</Link></div>

    <section className="grid">
      <div className="card"><span className="muted">Provider health</span><div className="value">{effectiveStatus}</div></div>
      <div className="card"><span className="muted">No-website priority leads</span><div className="value">{priorityBusinesses.length}</div></div>
      <div className="card"><span className="muted">Google Places budget</span><div className="value">${Number(costGuard?.google_places_budget_usd ?? 0).toFixed(2)}</div></div>
      <div className="card"><span className="muted">Daily discovery quota</span><div className="value">{Number(costGuard?.daily_new_leads ?? 0)}</div></div>
    </section>

    <section className="panel">
      <div className="headerRow"><div><h2>Priority queue: active + no website</h2><p className="muted">These are the businesses we actually want for website-sales outreach. Businesses with a website are stored for evidence/deduplication but are not promoted into new leads.</p></div><span className="pill">OUTREACH DISABLED</span></div>
      <div className="settingsList">
        {priorityBusinesses.length === 0 ? <p className="muted">No qualified operational no-website businesses yet. Discover IDs, then qualify candidates one at a time.</p> : priorityBusinesses.map(({ business, lead }) => <div className="settingsRow" key={business.id}>
          <div><strong>{business.name}</strong><div className="muted">{business.category ?? 'category pending'} · {business.google_rating ?? '—'}/5 · {business.google_user_rating_count ?? 0} Google ratings</div><div className="muted">{business.formatted_address ?? 'address pending'} · {business.phone ? `phone ${business.phone}` : 'phone not returned'}</div></div>
          <div><strong>Opportunity {lead?.opportunity_score ?? '—'}</strong>{lead ? <div><Link className="textLink" href={`/leads/${lead.id}`}>Open lead →</Link></div> : <div className="muted">Lead pending</div>}</div>
        </div>)}
      </div>
    </section>

    <section className="panel">
      <h2>1. Discover candidate IDs</h2>
      <p className="muted">Google does not expose a direct “no website” search filter. So this first step fetches IDs only; the next controlled qualification checks whether each business is OPERATIONAL and has no official website.</p>
      <div className="healthList"><span>Country <strong>OM</strong></span><span>Discovery field mask <strong>places.id only</strong></span><span>Lead rule <strong>OPERATIONAL + NO WEBSITE</strong></span><span>Outreach <strong>DISABLED</strong></span></div>
      <form action={runGooglePlacesControlledSample} className="settingsList"><div className="settingsRow"><label>City<input name="city" defaultValue="Muscat" maxLength={80} required /></label><label>Industry<input name="industry" defaultValue="dental clinic" maxLength={100} required /></label><label>Max results<input name="limit" type="number" min="1" max="3" defaultValue="3" required /></label><button disabled={!canRun}>Discover candidate IDs</button></div></form>
      {!credentialPresent ? <p className="muted">Add GOOGLE_PLACES_API_KEY before running discovery.</p> : null}
      {Number(costGuard?.google_places_budget_usd ?? 0) <= 0 ? <p className="muted">Google Places is blocked because provider budget is zero.</p> : null}
      {integration?.last_checked_at ? <p className="muted">Last checked {formatMuscat(integration.last_checked_at)} Oman time.</p> : null}
      {integration?.last_error ? <p className="muted">Last error: {integration.last_error}</p> : null}
    </section>

    <section className="panel">
      <div className="headerRow"><div><h2>2. Qualify candidates</h2><p className="muted">A paid-capable Place Details lookup checks status + website + contact/reputation evidence. Only OPERATIONAL businesses with no website become new leads. Existing businesses are reused without another Google request.</p></div><span className="pill">Cost Guard enforced</span></div>
      <div className="settingsList">
        {((discoveries ?? []) as DiscoveryRow[]).length === 0 ? <p className="muted">No discovery records yet.</p> : ((discoveries ?? []) as DiscoveryRow[]).map((row) => {
          const placeId = String(row.source_id ?? '');
          const business = businessByPlaceId.get(placeId);
          const lead = business ? leadByBusinessId.get(String(business.id)) : undefined;
          const raw = row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload as Record<string, unknown> : {};
          const qualified = raw.priorityQualified === true || Boolean(business && String(business.google_business_status ?? '').toUpperCase() === 'OPERATIONAL' && !String(business.official_website ?? '').trim());
          const rejectedReason = String(raw.qualificationReason ?? '');
          return <div className="settingsRow" key={placeId}>
            <div><strong>{business?.name ?? placeId}</strong><div className="muted">{placeId} · discovered {formatMuscat(row.discovered_at)} Oman time</div>
              {business ? <div className="muted">{business.google_business_status ?? 'status pending'} · {business.official_website ? 'HAS WEBSITE → not priority' : 'NO WEBSITE'} · {business.phone ? 'phone found' : 'phone not returned'} · {business.google_user_rating_count ?? 0} ratings</div> : <div className="muted">ID only. Qualification has not yet used Place Details.</div>}
              {qualified ? <div><strong>✓ PRIORITY: operational + no website</strong></div> : rejectedReason ? <div className="muted">Not priority: {rejectedReason}</div> : null}
            </div>
            <div>{lead ? <Link className="textLink" href={`/leads/${lead.id}`}>Lead {lead.status} →</Link> : business ? <span className="muted">Stored for dedupe/evidence · no lead created</span> : <form action={enrichGooglePlaceCandidate}><input type="hidden" name="placeId" value={placeId} /><button disabled={!canEnrich}>Check website + activity</button></form>}</div>
          </div>;
        })}
      </div>
      {!providerConnected ? <p className="muted">Qualification is blocked until Google Places is CONNECTED.</p> : null}
    </section>

    <section className="panel"><h2>Recent Google Places usage</h2><div className="settingsList">{(usage ?? []).length === 0 ? <p className="muted">No Google Places usage recorded yet.</p> : (usage ?? []).map((row, index) => <div className="settingsRow" key={`${row.created_at}-${index}`}><strong>{row.operation}</strong><span>${Number(row.cost_usd ?? 0).toFixed(6)}</span><span className="muted">{Number(row.units ?? 0)} request · {formatMuscat(row.created_at)} Oman time</span></div>)}</div></section>
  </div>;
}
