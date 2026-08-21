import Link from 'next/link';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

type Opportunity = {
  id: string;
  sales_lane: 'MUSCAT_LOCAL_GROWTH' | 'OMAN_REMOTE_GROWTH' | 'INTERNATIONAL_AI_GROWTH';
  service_region: string;
  website_class: string;
  website_score: number;
  local_content_score: number;
  ai_content_score: number;
  overall_sales_score: number;
  content_check_status: string;
  recommended_services: string[] | null;
  routing_reasons: unknown;
  businesses: null | {
    id: string;
    name: string;
    country_code: string;
    city: string | null;
    phone: string | null;
    whatsapp: string | null;
    formatted_address: string | null;
    google_maps_uri: string | null;
    official_website: string | null;
  } | Array<{
    id: string;
    name: string;
    country_code: string;
    city: string | null;
    phone: string | null;
    whatsapp: string | null;
    formatted_address: string | null;
    google_maps_uri: string | null;
    official_website: string | null;
  }>;
};

const laneTitle = (lane: Opportunity['sales_lane']) => lane === 'MUSCAT_LOCAL_GROWTH'
  ? 'Muscat Local Growth'
  : lane === 'OMAN_REMOTE_GROWTH'
    ? 'Oman Remote Growth'
    : 'International AI Growth';

export default async function GrowthOpportunitiesPage() {
  const { supabase, organizationId } = await getCurrentOrganization();
  const { data, error } = await supabase
    .from('growth_opportunities')
    .select('id,sales_lane,service_region,website_class,website_score,local_content_score,ai_content_score,overall_sales_score,content_check_status,recommended_services,routing_reasons,businesses(id,name,country_code,city,phone,whatsapp,formatted_address,google_maps_uri,official_website)')
    .eq('organization_id', organizationId)
    .order('overall_sales_score', { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as Opportunity[];
  const lanes: Opportunity['sales_lane'][] = ['MUSCAT_LOCAL_GROWTH','OMAN_REMOTE_GROWTH','INTERNATIONAL_AI_GROWTH'];
  const pendingSocial = rows.filter((row) => row.content_check_status === 'PENDING_SOCIAL_CHECK').length;
  const websiteHigh = rows.filter((row) => row.website_score >= 70).length;

  return <div>
    <div className="headerRow">
      <div><h1>Growth Opportunity Router</h1><p className="muted">Routes each operational business to the cheapest useful sales path. No social API, LLM, review fetch or outreach is triggered here.</p></div>
      <Link className="textLink" href="/hunters">← Hunters</Link>
    </div>

    <section className="grid">
      <div className="card"><span className="muted">Routed businesses</span><div className="value">{rows.length}</div></div>
      <div className="card"><span className="muted">Website opportunities</span><div className="value">{websiteHigh}</div></div>
      <div className="card"><span className="muted">Awaiting social check</span><div className="value">{pendingSocial}</div></div>
      <div className="card"><span className="muted">Automatic outreach</span><div className="value">OFF</div></div>
    </section>

    <section className="panel">
      <h2>Routing rules</h2>
      <div className="healthList">
        <span>Muscat <strong>Website + on-site filming/content + AI assist</strong></span>
        <span>Oman outside Muscat <strong>Website + remote AI content</strong></span>
        <span>International <strong>Website + AI content/creative production</strong></span>
        <span>Social quality <strong>Pending separate cost-controlled check</strong></span>
      </div>
    </section>

    {lanes.map((lane) => {
      const items = rows.filter((row) => row.sales_lane === lane);
      return <section className="panel" key={lane}>
        <div className="headerRow"><div><h2>{laneTitle(lane)}</h2><p className="muted">{items.length} routed business(es), ordered by overall sales score.</p></div><span className="pill">{lane}</span></div>
        <div className="settingsList">
          {items.length === 0 ? <p className="muted">No businesses routed here yet.</p> : items.map((row) => {
            const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
            return <div className="settingsRow" key={row.id}>
              <div>
                <strong>{business?.name ?? 'Business'}</strong>
                <div className="muted">{business?.city ?? 'city pending'} · {row.website_class} website · social check {row.content_check_status}</div>
                <div className="muted">{business?.phone ?? 'phone pending'} · {business?.formatted_address ?? 'address pending'}</div>
                <div className="muted">Offer: {(row.recommended_services ?? []).join(' + ') || 'review required'}</div>
                <div>{business?.whatsapp ? <a className="textLink" href={business.whatsapp} target="_blank" rel="noreferrer">WhatsApp candidate ↗</a> : null}{business?.google_maps_uri ? <> · <a className="textLink" href={business.google_maps_uri} target="_blank" rel="noreferrer">Maps ↗</a></> : null}</div>
              </div>
              <div><strong>Overall {row.overall_sales_score}</strong><div className="muted">Web {row.website_score} · Local content {row.local_content_score} · AI content {row.ai_content_score}</div></div>
            </div>;
          })}
        </div>
      </section>;
    })}
  </div>;
}
