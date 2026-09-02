import Link from 'next/link';
import { runDeterministicWebsiteAudit } from '@/app/audit-actions';
import {
  promoteHighPrecisionGrowthCandidates,
  recordGrowthSocialAssessment,
  routeCachedGrowthOpportunities,
} from '@/app/growth-opportunity-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

type NextAction = 'SKIP'|'CONTACT_READY'|'SOCIAL_CHECK'|'WEBSITE_EVIDENCE'|'EVIDENCE_READY'|'CATALOG_SETUP';
type BusinessView = {
  id:string; name:string; country_code:string; city:string|null; category:string|null; phone:string|null; international_phone:string|null;
  email:string|null; instagram:string|null; whatsapp:string|null; formatted_address:string|null; google_maps_uri:string|null; official_website:string|null;
};
type Opportunity = {
  id:string;
  sales_lane:'MUSCAT_LOCAL_GROWTH'|'OMAN_REMOTE_GROWTH'|'INTERNATIONAL_AI_GROWTH';
  service_region:string; website_class:string; website_score:number; local_content_score:number; ai_content_score:number; overall_sales_score:number;
  contactability_score:number; need_score:number; service_fit_score:number; revenue_potential_score:number; personalization_priority_score:number;
  content_check_status:string; social_check_eligible:boolean; cheapest_next_action:NextAction; next_action_reason:string|null; next_action_can_spend_money:boolean;
  prospect_tier:'A'|'B'|'C'|'SKIP'; qualification_score:number; qualification_confidence:number; primary_offer_family:string|null;
  primary_service_id:string|null; secondary_offer_family:string|null; secondary_service_id:string|null; should_contact:boolean; catalog_ready:boolean;
  qualification_reasons:unknown; evidence_gaps:unknown; digital_presence_evidence:unknown; recommended_services:string[]|null; offer_bundle:string[]|null;
  personalization_fingerprint:string[]|null; recommended_angle:string|null; businesses:null|BusinessView|BusinessView[];
};
type EvidenceView = {
  websiteEvidenceStatus?:string; socialEvidenceStatus?:string; socialQuality?:string; websiteAuditedAt?:string;
  socialAssessment?:{status?:string;quality?:string;source?:string;assessedAt?:string};
  websiteAudit?:{hasBooking?:boolean;hasWhatsapp?:boolean;mobileQuality?:string;seoQuality?:string;ctaQuality?:string;hasArabic?:boolean;brokenLinks?:number};
};

const laneTitle=(lane:Opportunity['sales_lane'])=>lane==='MUSCAT_LOCAL_GROWTH'?'Muscat Local Growth':lane==='OMAN_REMOTE_GROWTH'?'Oman Remote Growth':'International AI Growth';
const actionLabel=(action:NextAction)=>action==='CONTACT_READY'?'Tier A · contact-ready':action==='SOCIAL_CHECK'?'Verify Instagram/content quality':action==='WEBSITE_EVIDENCE'?'Run/reuse website audit':action==='EVIDENCE_READY'?'Owner review':action==='CATALOG_SETUP'?'Configure service catalog':'Skip/defer';
const list=(value:unknown)=>Array.isArray(value)?value.map(String):[];

export default async function GrowthOpportunitiesPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const {data,error}=await supabase.from('growth_opportunities').select('id,sales_lane,service_region,website_class,website_score,local_content_score,ai_content_score,overall_sales_score,contactability_score,need_score,service_fit_score,revenue_potential_score,personalization_priority_score,content_check_status,social_check_eligible,cheapest_next_action,next_action_reason,next_action_can_spend_money,prospect_tier,qualification_score,qualification_confidence,primary_offer_family,primary_service_id,secondary_offer_family,secondary_service_id,should_contact,catalog_ready,qualification_reasons,evidence_gaps,digital_presence_evidence,recommended_services,offer_bundle,personalization_fingerprint,recommended_angle,businesses(id,name,country_code,city,category,phone,international_phone,email,instagram,whatsapp,formatted_address,google_maps_uri,official_website)').eq('organization_id',organizationId).order('qualification_score',{ascending:false}).limit(200);
  if(error)throw error;
  const rows=(data??[]) as Opportunity[];
  const lanes:Opportunity['sales_lane'][]=['MUSCAT_LOCAL_GROWTH','OMAN_REMOTE_GROWTH','INTERNATIONAL_AI_GROWTH'];
  const tierA=rows.filter(row=>row.prospect_tier==='A').length;
  const contactReady=rows.filter(row=>row.should_contact).length;
  const evidenceNeeded=rows.filter(row=>['SOCIAL_CHECK','WEBSITE_EVIDENCE'].includes(row.cheapest_next_action)).length;
  const catalogBlocked=rows.filter(row=>row.cheapest_next_action==='CATALOG_SETUP').length;
  const editable=role==='OWNER';

  return <div>
    <div className="headerRow"><div><h1>High-Precision Growth Opportunities</h1><p className="muted">Fewer prospects, stronger evidence. A business is promoted only when a specific service need is verified, a direct contact path exists, and the canonical service is configured.</p></div><Link className="textLink" href="/hunters">← Hunters</Link></div>
    <section className="grid">
      <div className="card"><span className="muted">Routed businesses</span><div className="value">{rows.length}</div></div>
      <div className="card"><span className="muted">Tier A evidence</span><div className="value">{tierA}</div></div>
      <div className="card"><span className="muted">Contact-ready</span><div className="value">{contactReady}</div></div>
      <div className="card"><span className="muted">Need one evidence step</span><div className="value">{evidenceNeeded}</div></div>
      <div className="card"><span className="muted">Catalog blocked</span><div className="value">{catalogBlocked}</div></div>
    </section>

    <section className="panel">
      <div className="headerRow"><div><h2>Precision routing</h2><p className="muted">Reuses cached Google facts, website audits and verified social reviews. No provider or LLM call is made by this routing action.</p></div><form action={routeCachedGrowthOpportunities}><button disabled={!editable}>Re-score cached businesses</button></form></div>
      <div className="headerRow"><div><strong>Lead promotion is separate on purpose.</strong><p className="muted">Only Tier A + direct contact + configured canonical service is promoted. Creating a Lead still sends nothing to the customer.</p></div><form action={promoteHighPrecisionGrowthCandidates}><input type="hidden" name="limit" value="10"/><button disabled={!editable||contactReady===0}>Promote up to 10 Tier A</button></form></div>
    </section>

    <section className="panel"><h2>Hard qualification rules</h2><div className="healthList">
      <span>No standalone website <strong>strong website-design evidence</strong>, but only with direct contact.</span>
      <span>Standalone website <strong>no website/SEO pitch until deterministic audit evidence exists</strong>.</span>
      <span>Poor SEO audit <strong>SEO_GROWTH fit</strong>; no invented “new site” claim without site-age evidence.</span>
      <span>Muscat + known Instagram <strong>content/filming only after WEAK or INACTIVE is verified with a specific evidence note</strong>.</span>
      <span>Good Instagram <strong>content pitch suppressed</strong>.</span>
      <span>WhatsApp AI <strong>requires stronger evidence than merely having a phone number</strong>.</span>
      <span>Maximum pitch focus <strong>one primary + at most one evidence-backed secondary service</strong>.</span>
      <span>Tier B/C <strong>research/review only; no automatic Lead promotion</strong>.</span>
    </div></section>

    {lanes.map(lane=>{
      const items=rows.filter(row=>row.sales_lane===lane);
      return <section className="panel" key={lane}>
        <div className="headerRow"><div><h2>{laneTitle(lane)}</h2><p className="muted">{items.length} candidate(s), ordered by verified qualification score.</p></div><span className="pill">{lane}</span></div>
        <div className="settingsList">{items.length===0?<p className="muted">No candidates in this lane.</p>:items.map(row=>{
          const business=Array.isArray(row.businesses)?row.businesses[0]:row.businesses;
          const evidence=(row.digital_presence_evidence&&typeof row.digital_presence_evidence==='object'?row.digital_presence_evidence:{}) as EvidenceView;
          const gaps=list(row.evidence_gaps);
          const reasons=list(row.qualification_reasons);
          return <div className="settingsRow" key={row.id}>
            <div>
              <strong>{business?.name??'Business'} · Tier {row.prospect_tier}</strong>
              <div className="muted">{business?.country_code??'market pending'} · {business?.city??'city pending'} · {business?.category??'industry pending'} · qualification {row.qualification_score}/100 · confidence {row.qualification_confidence}/100</div>
              <div className="muted">Primary: {row.primary_offer_family??'none'} {row.primary_service_id?`→ ${row.primary_service_id}`:'· canonical service not ready'}</div>
              {row.secondary_offer_family?<div className="muted">Secondary: {row.secondary_offer_family}{row.secondary_service_id?` → ${row.secondary_service_id}`:''}</div>:null}
              <div className="muted">Website: {row.website_class} · audit {evidence.websiteEvidenceStatus??'UNKNOWN'} · SEO {evidence.websiteAudit?.seoQuality??'UNKNOWN'} · mobile {evidence.websiteAudit?.mobileQuality??'UNKNOWN'} · CTA {evidence.websiteAudit?.ctaQuality??'UNKNOWN'}</div>
              <div className="muted">Instagram: {business?.instagram?'known':'unknown'} · social quality {evidence.socialQuality??'UNKNOWN'}{evidence.socialAssessment?.source?` · ${evidence.socialAssessment.source}`:''}</div>
              <div className="muted">Next: {actionLabel(row.cheapest_next_action)} · {row.next_action_can_spend_money?'may spend after Cost Guard':'$0 at this step'}</div>
              <div className="muted">Why: {row.next_action_reason??'No next action reason'}</div>
              {reasons.length?<div className="muted">Evidence: {reasons.slice(0,4).join(' · ')}</div>:null}
              {gaps.length?<div className="muted">Missing: {gaps.join(' · ')}</div>:null}
              <div>{business?.whatsapp?<a className="textLink" href={business.whatsapp} target="_blank" rel="noreferrer">WhatsApp ↗</a>:null}{business?.instagram?<> · <a className="textLink" href={business.instagram} target="_blank" rel="noreferrer">Instagram ↗</a></>:null}{business?.google_maps_uri?<> · <a className="textLink" href={business.google_maps_uri} target="_blank" rel="noreferrer">Maps ↗</a></>:null}{business?.official_website?<> · <a className="textLink" href={business.official_website} target="_blank" rel="noreferrer">Website ↗</a></>:null}</div>
            </div>
            <div>
              <strong>{row.should_contact?'✅ Contact-ready':'⏸ Hold'}</strong>
              <div className="muted">Contact {row.contactability_score} · Need {row.need_score}</div>
              <div className="muted">Fit {row.service_fit_score} · Revenue {row.revenue_potential_score}</div>
              {row.cheapest_next_action==='WEBSITE_EVIDENCE'&&business?.id?<form action={runDeterministicWebsiteAudit}><input type="hidden" name="businessId" value={business.id}/><button disabled={!editable}>Run website evidence</button></form>:null}
              {row.cheapest_next_action==='SOCIAL_CHECK'&&business?.instagram?<form action={recordGrowthSocialAssessment} className="settingsCreate"><input type="hidden" name="opportunityId" value={row.id}/><label>Instagram review<select name="quality" defaultValue="WEAK"><option value="WEAK">Weak</option><option value="INACTIVE">Inactive</option><option value="GOOD">Good</option></select></label><label>Evidence note<input name="note" required minLength={8} maxLength={300} placeholder="Specific observation, e.g. no posts for 90 days"/></label><button disabled={!editable}>Record verified review</button></form>:null}
            </div>
          </div>;
        })}</div>
      </section>;
    })}
  </div>;
}
