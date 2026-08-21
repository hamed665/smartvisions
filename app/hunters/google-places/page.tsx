import Link from 'next/link';
import { runGooglePlacesControlledSample } from '@/app/hunter-actions';
import { qualifyGooglePlacesPriorityBatch } from '@/app/hunter-batch-actions';
import { buildAcquisitionCostPlan } from '@/lib/hunters/business/acquisition-cost';
import { classifyWebsiteUri } from '@/lib/hunters/business/selective-enrichment';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

const formatMuscat = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Muscat', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';

type DiscoveryRow = { source_id: string | null; raw_payload: unknown; discovered_at: string };
type BusinessRow = {
  id: string; name: string; google_place_id: string | null; official_website: string | null; phone: string | null; international_phone: string | null;
  whatsapp: string | null; google_maps_uri: string | null; category: string | null; google_business_status: string | null; google_rating: number | null;
  google_user_rating_count: number | null; formatted_address: string | null;
};
type LeadRow = { id: string; business_id: string | null; status: string; opportunity_score: number | null };
type MarketRow = { country_code: string; currency: string; enabled: boolean };

export default async function GooglePlacesControlledPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization(true);
  const [{ data: integration }, { data: usage }, { data: discoveries }, { data: costGuard }, { data: businesses }, { data: leads }, { data: markets }] = await Promise.all([
    supabase.from('integration_connections').select('status,enabled,last_checked_at,last_error').eq('organization_id', organizationId).eq('provider', 'GOOGLE_PLACES').eq('channel', 'DISCOVERY').maybeSingle(),
    supabase.from('usage_events').select('operation,cost_usd,units,metadata,created_at').eq('organization_id', organizationId).eq('provider', 'GOOGLE_PLACES').order('created_at', { ascending: false }).limit(12),
    supabase.from('discovery_records').select('source_id,raw_payload,discovered_at').eq('organization_id', organizationId).eq('source_type', 'google_places').order('discovered_at', { ascending: false }).limit(40),
    supabase.from('cost_guard_settings').select('google_places_budget_usd,daily_new_leads').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('businesses').select('id,name,google_place_id,official_website,phone,international_phone,whatsapp,google_maps_uri,category,google_business_status,google_rating,google_user_rating_count,formatted_address').eq('organization_id', organizationId).not('google_place_id', 'is', null).limit(100),
    supabase.from('leads').select('id,business_id,status,opportunity_score').eq('organization_id', organizationId).not('business_id', 'is', null).limit(200),
    supabase.from('market_settings').select('country_code,currency,enabled').eq('organization_id', organizationId).eq('enabled', true).order('country_code'),
  ]);

  const enabledMarkets = ((markets ?? []) as MarketRow[]).filter((market) => market.enabled);
  const credentialPresent = Boolean(process.env.GOOGLE_PLACES_API_KEY);
  const storedStatus = String(integration?.status ?? 'NOT_CONFIGURED');
  const effectiveStatus = !credentialPresent ? 'NOT_CONFIGURED' : storedStatus === 'NOT_CONFIGURED' ? 'READY' : storedStatus;
  const providerConnected = effectiveStatus === 'CONNECTED' && integration?.enabled === true;
  const canRun = role === 'OWNER' && credentialPresent && Number(costGuard?.google_places_budget_usd ?? 0) > 0 && enabledMarkets.length > 0;
  const canEnrich = canRun && providerConnected;

  const businessByPlaceId = new Map(((businesses ?? []) as BusinessRow[]).filter((row) => row.google_place_id).map((row) => [String(row.google_place_id), row]));
  const leadByBusinessId = new Map(((leads ?? []) as LeadRow[]).filter((row) => row.business_id).map((row) => [String(row.business_id), row]));
  const discoveryRows = (discoveries ?? []) as DiscoveryRow[];
  const waitingRows = discoveryRows.filter((row) => {
    const raw = row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload as Record<string, unknown> : {};
    return Boolean(row.source_id) && !raw.enrichedAt;
  });
  const unqualifiedCount = waitingRows.length;
  const defaultBatchCandidates = waitingRows.slice(0, 3);
  const cachedDefaultCandidates = defaultBatchCandidates.filter((row) => businessByPlaceId.has(String(row.source_id ?? ''))).length;
  const defaultCostPlan = buildAcquisitionCostPlan({ requestedCandidates: defaultBatchCandidates.length, cachedCandidates: cachedDefaultCandidates });

  const priorityBusinesses = ((businesses ?? []) as BusinessRow[])
    .filter((business) => String(business.google_business_status ?? '').toUpperCase() === 'OPERATIONAL' && classifyWebsiteUri(business.official_website) !== 'STANDALONE')
    .map((business) => ({ business, lead: leadByBusinessId.get(String(business.id)) }))
    .sort((a, b) => Number(b.lead?.opportunity_score ?? 0) - Number(a.lead?.opportunity_score ?? 0) || Number(b.business.google_user_rating_count ?? 0) - Number(a.business.google_user_rating_count ?? 0));

  return <div>
    <div className="headerRow"><div><h1>Google Places Growth Hunter</h1><p className="muted">Discover enabled markets cheaply, qualify only useful candidates, then route each operational business to website, local-content or remote AI-content opportunities. Review text and AI stay deferred until they can change a sales decision.</p></div><Link className="textLink" href="/hunters">← Hunters</Link></div>

    <section className="grid">
      <div className="card"><span className="muted">Provider health</span><div className="value">{effectiveStatus}</div></div>
      <div className="card"><span className="muted">Contact-ready no-site leads</span><div className="value">{priorityBusinesses.length}</div></div>
      <div className="card"><span className="muted">Candidates awaiting qualification</span><div className="value">{unqualifiedCount}</div></div>
      <div className="card"><span className="muted">Enabled markets</span><div className="value">{enabledMarkets.length}</div></div>
    </section>

    <section className="panel">
      <div className="headerRow"><div><h2>Priority queue: active + no standalone website</h2><p className="muted">A WhatsApp, Instagram, Facebook, directory or link-in-bio URL does not count as a real website. These remain high-value website opportunities while the Growth Router separately preserves content opportunities for businesses that already have sites.</p></div><span className="pill">OUTREACH DISABLED</span></div>
      <div className="settingsList">
        {priorityBusinesses.length === 0 ? <p className="muted">No qualified contact-ready no-website businesses yet.</p> : priorityBusinesses.map(({ business, lead }) => {
          const websiteClass = classifyWebsiteUri(business.official_website);
          return <div className="settingsRow" key={business.id}>
            <div><strong>{business.name}</strong><div className="muted">{business.category ?? 'category pending'} · {business.google_rating ?? '—'}/5 · {business.google_user_rating_count ?? 0} Google ratings</div><div className="muted">{business.formatted_address ?? 'address pending'} · {business.international_phone ?? business.phone ?? 'phone not returned'}</div><div className="muted">Website: {websiteClass === 'NONE' ? 'none' : 'contact/social/directory link only'}</div></div>
            <div><strong>Opportunity {lead?.opportunity_score ?? '—'}</strong>{business.whatsapp ? <div><a className="textLink" href={business.whatsapp} target="_blank" rel="noreferrer">WhatsApp candidate ↗</a><div className="muted">Generated locally from phone unless Google supplied a WhatsApp URL; not auto-verified.</div></div> : null}{business.google_maps_uri ? <div><a className="textLink" href={business.google_maps_uri} target="_blank" rel="noreferrer">Open Maps ↗</a></div> : null}{lead ? <div><Link className="textLink" href={`/leads/${lead.id}`}>Open lead →</Link></div> : <div className="muted">Lead pending</div>}</div>
          </div>;
        })}
      </div>
    </section>

    <section className="panel"><h2>1. Discover candidate IDs</h2><p className="muted">Discovery asks for places.id only. No phone, rating, review, website or contact data is bought at this stage. Country choices come from enabled market settings rather than hardcoded hunter logic.</p><div className="healthList"><span>Enabled markets <strong>{enabledMarkets.map((market) => market.country_code).join(' · ') || 'none'}</strong></span><span>Discovery field mask <strong>places.id only</strong></span><span>Routing target <strong>GROWTH OPPORTUNITY</strong></span><span>Daily discovery quota <strong>{Number(costGuard?.daily_new_leads ?? 0)}</strong></span></div><form action={runGooglePlacesControlledSample} className="settingsList"><div className="settingsRow"><label>Country<select name="countryCode" defaultValue={enabledMarkets.some((market) => market.country_code === 'OM') ? 'OM' : enabledMarkets[0]?.country_code}>{enabledMarkets.map((market) => <option key={market.country_code} value={market.country_code}>{market.country_code} · {market.currency}</option>)}</select></label><label>City<input name="city" defaultValue="Muscat" maxLength={80} required /></label><label>Industry<input name="industry" defaultValue="dental clinic" maxLength={100} required /></label><label>Max IDs<input name="limit" type="number" min="1" max="3" defaultValue="3" required /></label><button disabled={!canRun}>Discover candidate IDs</button></div></form>{!credentialPresent ? <p className="muted">Add GOOGLE_PLACES_API_KEY before running discovery.</p> : null}{enabledMarkets.length === 0 ? <p className="muted">Enable at least one market before discovery.</p> : null}{Number(costGuard?.google_places_budget_usd ?? 0) <= 0 ? <p className="muted">Google Places is blocked because provider budget is zero.</p> : null}{integration?.last_checked_at ? <p className="muted">Last checked {formatMuscat(integration.last_checked_at)} Oman time.</p> : null}{integration?.last_error ? <p className="muted">Last error: {integration.last_error}</p> : null}</section>

    <section className="panel"><div className="headerRow"><div><h2>2. Find contact-ready opportunities automatically</h2><p className="muted">One Enterprise-tier qualification call gets the data that matters for sales: active status, standalone-site check, name, phone, location/Maps plus useful same-tier rating/hours. Reviews stay off. Each result is routed through the zero-cost personalization and Growth engines.</p></div><span className="pill">HARD CAP: 5 CHECKS</span></div><div className="healthList"><span>Max provider calls/run <strong>5</strong></span><span>Qualification reserve/check <strong>$0.02</strong></span><span>Worst-case reserve/run <strong>$0.10</strong></span><span>Current default dry-run <strong>{defaultCostPlan.paidQualifications} paid call(s) · ${defaultCostPlan.worstCaseReserveUsd.toFixed(2)} reserve</strong></span><span>Cache savings in default batch <strong>${defaultCostPlan.cacheSavingsUsd.toFixed(2)}</strong></span><span>WhatsApp-link generation <strong>$0 / LOCAL</strong></span><span>Reviews during hunting <strong>OFF</strong></span><span>Outreach <strong>DISABLED</strong></span></div><form action={qualifyGooglePlacesPriorityBatch} className="settingsList"><div className="settingsRow"><label>Maximum candidates to check<input name="maxChecks" type="number" min="1" max="5" defaultValue="3" required /></label><label>Stop after no-site priorities found<input name="targetLeads" type="number" min="1" max="3" defaultValue="1" required /></label><button disabled={!canEnrich || unqualifiedCount < 1}>Qualify growth opportunities</button></div></form><p className="muted">{unqualifiedCount} candidate ID(s) currently waiting. Cached candidates cost zero extra Google requests. Dry-run estimates are conservative reserves, not a promise of final provider billing.</p>{!providerConnected ? <p className="muted">Batch qualification is blocked until Google Places is CONNECTED.</p> : null}</section>

    <section className="panel"><div className="headerRow"><div><h2>3. Candidate evidence</h2><p className="muted">Evidence only. Unknown social quality stays unknown. No manual full-review fetch exists here.</p></div><span className="pill">COST-FIRST</span></div><div className="settingsList">{discoveryRows.length === 0 ? <p className="muted">No discovery records yet.</p> : discoveryRows.map((row) => {
      const placeId = String(row.source_id ?? ''); const business = businessByPlaceId.get(placeId); const lead = business ? leadByBusinessId.get(String(business.id)) : undefined; const raw = row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload as Record<string, unknown> : {}; const websiteClass = business ? classifyWebsiteUri(business.official_website) : 'NONE'; const qualified = raw.priorityQualified === true || Boolean(business && String(business.google_business_status ?? '').toUpperCase() === 'OPERATIONAL' && websiteClass !== 'STANDALONE'); const rejectedReason = String(raw.qualificationReason ?? ''); const tier = String(raw.qualificationTier ?? ''); const market = String(raw.countryCode ?? '—'); const nextAction = String(raw.cheapestNextAction ?? 'pending');
      return <div className="settingsRow" key={placeId}><div><strong>{business?.name ?? placeId}</strong><div className="muted">{market} · {placeId} · discovered {formatMuscat(row.discovered_at)} Oman time</div>{business ? <div className="muted">{business.google_business_status ?? 'status pending'} · {websiteClass === 'STANDALONE' ? 'HAS STANDALONE WEBSITE' : websiteClass === 'CONTACT_ONLY' ? 'CONTACT/SOCIAL/DIRECTORY LINK ONLY' : 'NO WEBSITE'} · {business.international_phone ?? business.phone ? 'phone found' : 'phone not returned'}</div> : <div className="muted">ID only. Waiting for cost-guarded batch qualification.</div>}{business?.whatsapp ? <div><a className="textLink" href={business.whatsapp} target="_blank" rel="noreferrer">WhatsApp candidate ↗</a></div> : null}{tier ? <div className="muted">Qualification tier: {tier}</div> : null}{nextAction !== 'pending' ? <div className="muted">Cheapest next action: {nextAction}</div> : null}{qualified ? <div><strong>✓ WEBSITE PRIORITY: operational + no standalone website</strong></div> : rejectedReason ? <div className="muted">Website lane: {rejectedReason}; Growth Router may still keep a content opportunity.</div> : null}</div><div>{lead ? <Link className="textLink" href={`/leads/${lead.id}`}>Lead {lead.status} →</Link> : business ? <Link className="textLink" href="/hunters/growth-opportunities">Growth evidence →</Link> : <span className="muted">Awaiting batch</span>}</div></div>;
    })}</div></section>

    <section className="panel"><h2>Recent Google Places usage</h2><div className="settingsList">{(usage ?? []).length === 0 ? <p className="muted">No Google Places usage recorded yet.</p> : (usage ?? []).map((row, index) => <div className="settingsRow" key={`${row.created_at}-${index}`}><strong>{row.operation}</strong><span>${Number(row.cost_usd ?? 0).toFixed(6)}</span><span className="muted">{Number(row.units ?? 0)} request · {formatMuscat(row.created_at)} Oman time</span></div>)}</div></section>
  </div>;
}
