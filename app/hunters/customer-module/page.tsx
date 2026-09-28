import Link from 'next/link';

import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

type HunterSummary = {
  hunter_campaign_count: number;
  running_hunter_campaign_count: number;
  configured_target_total: number;
  discovered_prospect_count: number;
  enriched_business_count: number;
  promoted_lead_count: number;
  qualified_prospect_count: number;
  suppressed_prospect_count: number;
  usage_period_start: string;
  hunter_usage_units: number | string;
  hunter_provider_cost_usd: number | string;
  observed_won_deal_count: number;
  observed_won_amounts: Record<string, number | string>;
  hunter_entitlements: Array<{ source?: string; featureKey?: string; value?: unknown; effectiveAt?: string }>;
  hunter_entitlement_status: string;
};

type HunterProspect = {
  discovery_id: string;
  campaign_name: string | null;
  source_type: string;
  source_id: string | null;
  business_name: string | null;
  business_country: string | null;
  business_city: string | null;
  lead_status: string | null;
  prospect_tier: string | null;
  qualification_score: number | null;
  priority_score: number | null;
  recommended_acquisition_route: string | null;
  lifecycle_state: string;
  compliance_state: string;
  provider_usage_units: number | string;
  provider_cost_usd: number | string;
  observed_won_deal_count: number;
  observed_won_amounts: Record<string, number | string>;
  roi_evidence_state: string;
};

type HunterCampaign = {
  id: string;
  name: string;
  status: string;
  country_code: string | null;
  city: string | null;
  industry: string | null;
  target_count: number | null;
};

function money(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(4) : '0.0000';
}

function amounts(value: Record<string, number | string> | null | undefined) {
  const entries = Object.entries(value ?? {});
  return entries.length
    ? entries.map(([currency, amount]) => String(amount) + ' ' + currency).join(' · ')
    : 'No won Deal evidence';
}

export default async function HunterCustomerModulePage() {
  const { supabase, organizationId } = await getCurrentOrganization();
  const [summaryResult, prospectsResult, campaignsResult] = await Promise.all([
    supabase.rpc('get_hunter_customer_summary', { p_organization_id: organizationId }),
    supabase.rpc('get_hunter_customer_prospects', { p_organization_id: organizationId, p_limit: 200 }),
    supabase
      .from('campaigns')
      .select('id,name,status,country_code,city,industry,target_count')
      .eq('organization_id', organizationId)
      .eq('campaign_kind', 'HUNTER')
      .order('updated_at', { ascending: false }),
  ]);

  const summary = ((summaryResult.data ?? [])[0] ?? null) as HunterSummary | null;
  const prospects = (prospectsResult.data ?? []) as HunterProspect[];
  const campaigns = (campaignsResult.data ?? []) as HunterCampaign[];

  return (
    <div>
      <div className="headerRow">
        <div>
          <h1>Hunter Customer Module</h1>
          <p className="muted">
            Target, discover, enrich, qualify and promote prospects using the existing Hunter and canonical CRM.
            Discovery and contactability are evidence, never send consent.
          </p>
        </div>
        <div>
          <Link className="textLink" href="/campaigns">Targeting & campaigns →</Link>
          {' · '}
          <Link className="textLink" href="/hunters/google-places">Discovery →</Link>
        </div>
      </div>

      {summaryResult.error || prospectsResult.error ? (
        <section className="panel">
          <strong>Hunter customer read model is not available on this database revision yet.</strong>
          <p className="muted">Existing Hunter workflows remain unchanged and no fallback send path is enabled.</p>
        </section>
      ) : null}

      <section className="grid">
        <div className="card"><span className="muted">Discovered</span><div className="value">{summary?.discovered_prospect_count ?? 0}</div></div>
        <div className="card"><span className="muted">Enriched</span><div className="value">{summary?.enriched_business_count ?? 0}</div></div>
        <div className="card"><span className="muted">CRM promoted</span><div className="value">{summary?.promoted_lead_count ?? 0}</div></div>
        <div className="card"><span className="muted">Qualified</span><div className="value">{summary?.qualified_prospect_count ?? 0}</div></div>
        <div className="card"><span className="muted">Usage units this month</span><div className="value">{Number(summary?.hunter_usage_units ?? 0)}</div></div>
        <div className="card"><span className="muted">Provider cost this month</span><div className="value">USD {money(summary?.hunter_provider_cost_usd)}</div></div>
      </section>

      <section className="twoCol">
        <article className="panel">
          <h2>Credits & entitlement</h2>
          <p className="muted">
            Commercial Hunter entitlement comes only from the canonical subscription / entitlement authority.
            Provider usage and raw cost come only from usage_events. This module does not invent a separate balance.
          </p>
          <div className="healthList">
            <span>Status <strong>{summary?.hunter_entitlement_status ?? 'UNCONFIGURED'}</strong></span>
            <span>Configured entries <strong>{summary?.hunter_entitlements?.length ?? 0}</strong></span>
          </div>
          {(summary?.hunter_entitlements ?? []).map((entry, index) => (
            <p className="muted smallText" key={(entry.featureKey ?? 'hunter') + '-' + String(index)}>
              {entry.featureKey ?? 'Hunter entitlement'} · {entry.source ?? 'unknown source'} · {JSON.stringify(entry.value ?? {})}
            </p>
          ))}
        </article>

        <article className="panel">
          <h2>Compliance & ROI evidence</h2>
          <p className="muted">
            {summary?.suppressed_prospect_count ?? 0} prospect(s) match canonical suppression evidence.
            Every non-suppressed prospect still requires the normal channel policy / permission / send gate before outreach.
          </p>
          <div className="healthList">
            <span>Observed WON Deals <strong>{summary?.observed_won_deal_count ?? 0}</strong></span>
            <span>Observed Deal amounts <strong>{amounts(summary?.observed_won_amounts)}</strong></span>
          </div>
          <p className="muted smallText">
            WON Deal linkage is observational acquisition evidence. It does not claim Hunter caused the Deal and it is not collected revenue.
          </p>
        </article>
      </section>

      <section className="panel">
        <div className="headerRow">
          <div>
            <h2>Targeting</h2>
            <p className="muted">Canonical Hunter Campaigns remain the targeting authority. Configure them there instead of creating a second target store.</p>
          </div>
          <Link className="textLink" href="/campaigns">Configure targeting →</Link>
        </div>
        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>Campaign</th><th>Status</th><th>Market</th><th>Industry</th><th>Target</th></tr></thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td>{campaign.name}</td>
                  <td>{campaign.status}</td>
                  <td>{[campaign.country_code, campaign.city].filter(Boolean).join(' · ') || 'Unspecified'}</td>
                  <td>{campaign.industry ?? 'Unspecified'}</td>
                  <td>{campaign.target_count ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="headerRow">
          <div>
            <h2>Prospect lifecycle</h2>
            <p className="muted">
              Prospect rows remain acquisition evidence until the existing governed promotion path creates a canonical CRM Lead.
            </p>
          </div>
          <div>
            <Link className="textLink" href="/hunters/growth-opportunities">Qualification & promotion →</Link>
            {' · '}
            <Link className="textLink" href="/suppression">Suppression →</Link>
          </div>
        </div>
        <div className="tableWrap">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Prospect</th><th>Lifecycle</th><th>Qualification</th><th>Route</th>
                <th>Compliance</th><th>Provider usage</th><th>ROI evidence</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((row) => (
                <tr key={row.discovery_id}>
                  <td>
                    <strong>{row.business_name ?? row.source_id ?? row.discovery_id}</strong>
                    <div className="muted smallText">
                      {row.source_type} · {[row.business_country, row.business_city].filter(Boolean).join(' · ') || 'location unknown'}
                    </div>
                    {row.campaign_name ? <div className="muted smallText">Campaign: {row.campaign_name}</div> : null}
                  </td>
                  <td>{row.lifecycle_state}{row.lead_status ? ' · ' + row.lead_status : ''}</td>
                  <td>
                    {row.prospect_tier ?? '—'}
                    {row.qualification_score == null ? '' : ' · ' + String(row.qualification_score)}
                    {row.priority_score == null ? '' : ' · priority ' + String(row.priority_score)}
                  </td>
                  <td>{row.recommended_acquisition_route ?? 'REVIEW'}</td>
                  <td>
                    <strong>{row.compliance_state}</strong>
                    <div className="muted smallText">Contactability ≠ permission</div>
                  </td>
                  <td>{Number(row.provider_usage_units ?? 0)} units · USD {money(row.provider_cost_usd)}</td>
                  <td>
                    {row.roi_evidence_state}
                    <div className="muted smallText">
                      {row.observed_won_deal_count} won · {amounts(row.observed_won_amounts)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Safety boundary</h2>
        <p className="muted">
          This module is read-only composition. It cannot send a message, bypass Shadow Mode, manufacture opt-in,
          charge a credit, or promote a prospect by itself. Existing Hunter actions, Cost Guard, CRM promotion,
          suppression and canonical send gates remain authoritative.
        </p>
        <p>
          <Link className="textLink" href="/cost-usage">Cost & usage →</Link>
          {' · '}
          <Link className="textLink" href="/leads">CRM Leads →</Link>
        </p>
      </section>
    </div>
  );
}
