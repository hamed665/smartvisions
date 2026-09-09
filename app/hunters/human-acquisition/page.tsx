import { getCurrentOrganization } from '@/lib/supabase/org';
import {
  humanAcquisitionBusiness,
  humanAcquisitionReason,
  humanAcquisitionTier,
  isGccHumanAcquisitionCandidate,
  type HumanAcquisitionOpportunity,
} from '@/lib/hunters/business/human-acquisition';

export const dynamic = 'force-dynamic';

function phoneDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function safeInstagram(value: unknown) {
  const raw = String(value ?? '').trim();
  return /^https:\/\/(?:www\.)?instagram\.com\//i.test(raw) ? raw : null;
}

export default async function HumanAcquisitionPage() {
  const { supabase, organizationId } = await getCurrentOrganization();
  const { data, error } = await supabase
    .from('growth_opportunities')
    .select('id,business_id,priority_score,prospect_tier,should_contact,recommended_acquisition_route,acquisition_routing_reason,primary_service_id,company_size,revenue_potential_band,businesses(name,country_code,city,instagram,whatsapp,phone,international_phone,email,google_maps_uri)')
    .eq('organization_id', organizationId)
    .in('recommended_acquisition_route', ['GCC_HUMAN_IG_WA', 'HYBRID_EMAIL_HUMAN_GCC'])
    .order('priority_score', { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) throw new Error(`Human acquisition queue unavailable: ${error.message}`);

  const rows = ((data ?? []) as unknown as Array<HumanAcquisitionOpportunity & {
    id: string;
    acquisition_routing_reason?: string | null;
    businesses?: HumanAcquisitionOpportunity['businesses'] & { name?: string; city?: string; google_maps_uri?: string };
  }>).filter(isGccHumanAcquisitionCandidate);

  return <main className="pageStack">
    <section className="panel">
      <div className="conversationTopline">
        <div>
          <p className="eyebrow">GCC Acquisition</p>
          <h1>Human Acquisition Queue</h1>
        </div>
        <span className="humanBadge">HUMAN FIRST TOUCH</span>
      </div>
      <p className="muted">Derived from canonical growth opportunities. No second CRM or queue table exists. Public WhatsApp/Instagram availability is reachability, not consent. Open the conversation manually; automation may continue only after customer inbound or verified permission.</p>
      <div className="grid">
        <div className="card"><span className="muted">Candidates</span><div className="value">{rows.length}</div></div>
        <div className="card"><span className="muted">A+</span><div className="value">{rows.filter(row => humanAcquisitionTier(row.priority_score) === 'A+').length}</div></div>
        <div className="card"><span className="muted">A</span><div className="value">{rows.filter(row => humanAcquisitionTier(row.priority_score) === 'A').length}</div></div>
      </div>
    </section>

    <section className="panel">
      {rows.length === 0 ? <p className="muted">No current GCC human-acquisition candidates. Run cached growth routing after discovery/evidence refresh.</p> : null}
      <div className="conversationList">
        {rows.map(row => {
          const business = humanAcquisitionBusiness(row) as (ReturnType<typeof humanAcquisitionBusiness> & { name?: string; city?: string; google_maps_uri?: string }) | null;
          const instagram = safeInstagram(business?.instagram);
          const phone = phoneDigits(business?.whatsapp || business?.international_phone || business?.phone);
          return <article className="conversationCard" key={row.id}>
            <div className="conversationTopline">
              <div>
                <strong>{business?.name || 'Unnamed business'}</strong>
                <p className="muted">{String(business?.country_code ?? '')} · {business?.city || 'City unknown'} · {row.company_size || 'SIZE UNKNOWN'} · {row.revenue_potential_band || 'REVENUE UNKNOWN'}</p>
              </div>
              <span className="humanBadge">{humanAcquisitionTier(row.priority_score)} · {Number(row.priority_score ?? 0)}</span>
            </div>
            <p><strong>Primary offer:</strong> {row.primary_service_id || 'Owner review required'}</p>
            <p className="muted">{row.acquisition_routing_reason || humanAcquisitionReason(row)}</p>
            <div className="buttonRow">
              {instagram ? <a className="secondaryButton" href={instagram} target="_blank" rel="noreferrer">Open Instagram</a> : null}
              {phone.length >= 8 ? <a className="secondaryButton" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">Open WhatsApp manually</a> : null}
              {business?.google_maps_uri ? <a className="secondaryButton" href={business.google_maps_uri} target="_blank" rel="noreferrer">Open Maps</a> : null}
            </div>
          </article>;
        })}
      </div>
    </section>
  </main>;
}
