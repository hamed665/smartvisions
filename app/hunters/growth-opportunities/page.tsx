import Link from 'next/link';
import { routeCachedGrowthOpportunities } from '@/app/growth-opportunity-actions';
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
  contactability_score: number;
  need_score: number;
  service_fit_score: number;
  revenue_potential_score: number;
  content_check_status: string;
  social_check_eligible: boolean;
  recommended_services: string[] | null;
  offer_bundle: string[] | null;
  personalization_fingerprint: string[] | null;
  recommended_angle: string | null;
  message_hooks: unknown;
  routing_reasons: unknown;
  businesses: null | { id:string; name:string; country_code:string; city:string|null; phone:string|null; whatsapp:string|null; formatted_address:string|null; google_maps_uri:string|null; official_website:string|null } | Array<{ id:string; name:string; country_code:string; city:string|null; phone:string|null; whatsapp:string|null; formatted_address:string|null; google_maps_uri:string|null; official_website:string|null }>;
};

const laneTitle=(lane:Opportunity['sales_lane'])=>lane==='MUSCAT_LOCAL_GROWTH'?'Muscat Local Growth':lane==='OMAN_REMOTE_GROWTH'?'Oman Remote Growth':'International AI Growth';

export default async function GrowthOpportunitiesPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const {data,error}=await supabase.from('growth_opportunities').select('id,sales_lane,service_region,website_class,website_score,local_content_score,ai_content_score,overall_sales_score,contactability_score,need_score,service_fit_score,revenue_potential_score,content_check_status,social_check_eligible,recommended_services,offer_bundle,personalization_fingerprint,recommended_angle,message_hooks,routing_reasons,businesses(id,name,country_code,city,phone,whatsapp,formatted_address,google_maps_uri,official_website)').eq('organization_id',organizationId).order('overall_sales_score',{ascending:false}).limit(200);
  if(error)throw error;
  const rows=(data??[]) as Opportunity[];
  const lanes:Opportunity['sales_lane'][]=['MUSCAT_LOCAL_GROWTH','OMAN_REMOTE_GROWTH','INTERNATIONAL_AI_GROWTH'];
  const pendingSocial=rows.filter(row=>row.content_check_status==='PENDING_SOCIAL_CHECK').length;
  const websiteHigh=rows.filter(row=>row.website_score>=70).length;

  return <div>
    <div className="headerRow"><div><h1>Growth Opportunity Router</h1><p className="muted">Routes each operational business to the cheapest useful sales path and builds a deterministic personalization fingerprint before any AI call.</p></div><Link className="textLink" href="/hunters">← Hunters</Link></div>
    <section className="grid"><div className="card"><span className="muted">Routed businesses</span><div className="value">{rows.length}</div></div><div className="card"><span className="muted">Website opportunities</span><div className="value">{websiteHigh}</div></div><div className="card"><span className="muted">Eligible social checks</span><div className="value">{pendingSocial}</div></div><div className="card"><span className="muted">Personalization API cost</span><div className="value">$0</div></div></section>

    <section className="panel"><div className="headerRow"><div><h2>Zero-cost cached routing</h2><p className="muted">Re-route cached businesses, rebuild fit/contact/need/revenue scores and message context without Google, OpenAI or social-provider calls.</p></div><form action={routeCachedGrowthOpportunities}><button disabled={role!=='OWNER'}>Route cached businesses</button></form></div></section>

    <section className="panel"><h2>Personalization rules</h2><div className="healthList"><span>Business fingerprint <strong>industry + market + city + route + website + contact readiness</strong></span><span>Offer selection <strong>deterministic bundle before AI</strong></span><span>Social checking <strong>only contactable, service-fit candidates are queued</strong></span><span>Unknown evidence <strong>stays unknown; no invented social weakness</strong></span><span>Muscat <strong>on-site filming/content advantage included automatically</strong></span></div></section>

    {lanes.map(lane=>{const items=rows.filter(row=>row.sales_lane===lane);return <section className="panel" key={lane}><div className="headerRow"><div><h2>{laneTitle(lane)}</h2><p className="muted">{items.length} routed business(es), ordered by overall sales score.</p></div><span className="pill">{lane}</span></div><div className="settingsList">{items.length===0?<p className="muted">No businesses routed here yet.</p>:items.map(row=>{const business=Array.isArray(row.businesses)?row.businesses[0]:row.businesses;return <div className="settingsRow" key={row.id}><div><strong>{business?.name??'Business'}</strong><div className="muted">{business?.city??'city pending'} · {row.website_class} website · social {row.social_check_eligible?'eligible':'deferred'}</div><div className="muted">{business?.phone??'phone pending'} · {business?.formatted_address??'address pending'}</div><div className="muted">Bundle: {(row.offer_bundle??row.recommended_services??[]).join(' + ')||'review required'}</div><div className="muted">Angle: {row.recommended_angle??'generic growth review'}</div><div className="muted">Fingerprint: {(row.personalization_fingerprint??[]).join(' · ')||'pending'}</div><div>{business?.whatsapp?<a className="textLink" href={business.whatsapp} target="_blank" rel="noreferrer">WhatsApp candidate ↗</a>:null}{business?.google_maps_uri?<> · <a className="textLink" href={business.google_maps_uri} target="_blank" rel="noreferrer">Maps ↗</a></>:null}</div></div><div><strong>Overall {row.overall_sales_score}</strong><div className="muted">Contact {row.contactability_score} · Need {row.need_score}</div><div className="muted">Fit {row.service_fit_score} · Revenue {row.revenue_potential_score}</div><div className="muted">Web {row.website_score} · Local {row.local_content_score} · AI {row.ai_content_score}</div></div></div>;})}</div></section>;})}
  </div>;
}
