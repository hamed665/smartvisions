import Link from 'next/link';
import { runDeterministicWebsiteAudit } from '@/app/audit-actions';
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
  personalization_priority_score: number;
  content_check_status: string;
  social_check_eligible: boolean;
  cheapest_next_action: 'SKIP'|'CONTACT_READY'|'SOCIAL_CHECK'|'WEBSITE_EVIDENCE'|'EVIDENCE_READY';
  next_action_reason: string | null;
  next_action_can_spend_money: boolean;
  digital_presence_evidence: unknown;
  recommended_services: string[] | null;
  offer_bundle: string[] | null;
  personalization_fingerprint: string[] | null;
  recommended_angle: string | null;
  message_hooks: unknown;
  routing_reasons: unknown;
  businesses: null | { id:string; name:string; country_code:string; city:string|null; phone:string|null; whatsapp:string|null; formatted_address:string|null; google_maps_uri:string|null; official_website:string|null } | Array<{ id:string; name:string; country_code:string; city:string|null; phone:string|null; whatsapp:string|null; formatted_address:string|null; google_maps_uri:string|null; official_website:string|null }>;
};

type EvidenceView = { websiteEvidenceStatus?:string; socialEvidenceStatus?:string; socialQuality?:string; websiteAuditedAt?:string; websiteAudit?:{hasBooking?:boolean;hasWhatsapp?:boolean;mobileQuality?:string;seoQuality?:string;ctaQuality?:string} };
const laneTitle=(lane:Opportunity['sales_lane'])=>lane==='MUSCAT_LOCAL_GROWTH'?'Muscat Local Growth':lane==='OMAN_REMOTE_GROWTH'?'Oman Remote Growth':'International AI Growth';
const actionLabel=(action:Opportunity['cheapest_next_action'])=>action==='CONTACT_READY'?'Contact-ready now':action==='SOCIAL_CHECK'?'Controlled social check':action==='WEBSITE_EVIDENCE'?'Free deterministic website evidence':action==='EVIDENCE_READY'?'Evidence ready':'Skip/defer';

export default async function GrowthOpportunitiesPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const {data,error}=await supabase.from('growth_opportunities').select('id,sales_lane,service_region,website_class,website_score,local_content_score,ai_content_score,overall_sales_score,contactability_score,need_score,service_fit_score,revenue_potential_score,personalization_priority_score,content_check_status,social_check_eligible,cheapest_next_action,next_action_reason,next_action_can_spend_money,digital_presence_evidence,recommended_services,offer_bundle,personalization_fingerprint,recommended_angle,message_hooks,routing_reasons,businesses(id,name,country_code,city,phone,whatsapp,formatted_address,google_maps_uri,official_website)').eq('organization_id',organizationId).order('personalization_priority_score',{ascending:false}).limit(200);
  if(error)throw error;
  const rows=(data??[]) as Opportunity[];
  const lanes:Opportunity['sales_lane'][]=['MUSCAT_LOCAL_GROWTH','OMAN_REMOTE_GROWTH','INTERNATIONAL_AI_GROWTH'];
  const contactReady=rows.filter(row=>row.cheapest_next_action==='CONTACT_READY').length;
  const paidEvidence=rows.filter(row=>row.next_action_can_spend_money).length;
  const evidenceReady=rows.filter(row=>row.cheapest_next_action==='EVIDENCE_READY').length;

  return <div>
    <div className="headerRow"><div><h1>Growth Opportunity Router</h1><p className="muted">Ranks businesses with reusable local evidence first, then shows the cheapest useful next action before any paid enrichment or AI call.</p></div><Link className="textLink" href="/hunters">← Hunters</Link></div>
    <section className="grid"><div className="card"><span className="muted">Routed businesses</span><div className="value">{rows.length}</div></div><div className="card"><span className="muted">Contact-ready now</span><div className="value">{contactReady}</div></div><div className="card"><span className="muted">Evidence ready</span><div className="value">{evidenceReady}</div></div><div className="card"><span className="muted">Paid evidence candidates</span><div className="value">{paidEvidence}</div></div></section>

    <section className="panel"><div className="headerRow"><div><h2>Zero-cost cached routing</h2><p className="muted">Re-route cached businesses, reuse fresh website audits, rebuild priority and message context, and decide whether the next useful action costs money. This action itself calls no provider.</p></div><form action={routeCachedGrowthOpportunities}><button disabled={role!=='OWNER'}>Route cached businesses</button></form></div></section>

    <section className="panel"><h2>Cost-aware personalization rules</h2><div className="healthList"><span>Priority score <strong>contactability + need + service fit + revenue potential</strong></span><span>No-site + contact-ready <strong>contact without buying more evidence</strong></span><span>Standalone site <strong>free deterministic audit before paid social checks</strong></span><span>Fresh audit <strong>reused inside cache TTL; no repeat crawl</strong></span><span>Unknown evidence <strong>stays unknown; no invented weakness</strong></span><span>AI personalization <strong>deferred to sales stage, not acquisition</strong></span></div></section>

    {lanes.map(lane=>{const items=rows.filter(row=>row.sales_lane===lane);return <section className="panel" key={lane}><div className="headerRow"><div><h2>{laneTitle(lane)}</h2><p className="muted">{items.length} routed business(es), ordered by zero-cost personalization priority.</p></div><span className="pill">{lane}</span></div><div className="settingsList">{items.length===0?<p className="muted">No businesses routed here yet.</p>:items.map(row=>{const business=Array.isArray(row.businesses)?row.businesses[0]:row.businesses;const evidence=(row.digital_presence_evidence&&typeof row.digital_presence_evidence==='object'?row.digital_presence_evidence:{}) as EvidenceView;return <div className="settingsRow" key={row.id}><div><strong>{business?.name??'Business'}</strong><div className="muted">{business?.country_code??'market pending'} · {business?.city??'city pending'} · {row.website_class} website · priority {row.personalization_priority_score}</div><div className="muted">{business?.phone??'phone pending'} · {business?.formatted_address??'address pending'}</div><div className="muted">Bundle: {(row.offer_bundle??row.recommended_services??[]).join(' + ')||'review required'}</div><div className="muted">Angle: {row.recommended_angle??'generic growth review'}</div><div className="muted">Evidence: website {evidence.websiteEvidenceStatus??'UNKNOWN'} · social {evidence.socialEvidenceStatus??'UNKNOWN'} · social quality {evidence.socialQuality??'UNKNOWN'}</div>{evidence.websiteAudit?<div className="muted">Website facts: SEO {evidence.websiteAudit.seoQuality??'UNKNOWN'} · CTA {evidence.websiteAudit.ctaQuality??'UNKNOWN'} · mobile {evidence.websiteAudit.mobileQuality??'UNKNOWN'} · booking {evidence.websiteAudit.hasBooking?'yes':'no'} · WhatsApp {evidence.websiteAudit.hasWhatsapp?'yes':'no'}</div>:null}<div className="muted">Next: {actionLabel(row.cheapest_next_action)} {row.next_action_can_spend_money?'· may spend after Cost Guard':'· $0 provider spend'}</div><div className="muted">Why: {row.next_action_reason??'No next-action reason recorded'}</div><div className="muted">Fingerprint: {(row.personalization_fingerprint??[]).join(' · ')||'pending'}</div><div>{business?.whatsapp?<a className="textLink" href={business.whatsapp} target="_blank" rel="noreferrer">WhatsApp candidate ↗</a>:null}{business?.google_maps_uri?<> · <a className="textLink" href={business.google_maps_uri} target="_blank" rel="noreferrer">Maps ↗</a></>:null}{business?.official_website?<> · <a className="textLink" href={business.official_website} target="_blank" rel="noreferrer">Website ↗</a></>:null}</div></div><div><strong>Priority {row.personalization_priority_score}</strong><div className="muted">Contact {row.contactability_score} · Need {row.need_score}</div><div className="muted">Fit {row.service_fit_score} · Revenue {row.revenue_potential_score}</div><div className="muted">Web {row.website_score} · Local {row.local_content_score} · AI {row.ai_content_score}</div>{row.cheapest_next_action==='WEBSITE_EVIDENCE'&&business?.id?<form action={runDeterministicWebsiteAudit}><input type="hidden" name="businessId" value={business.id}/><button disabled={role!=='OWNER'}>Run free website evidence</button></form>:null}</div></div>;})}</div></section>;})}
  </div>;
}
