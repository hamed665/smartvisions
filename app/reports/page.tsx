import { getCurrentOrganization } from '@/lib/supabase/org';
import { buildIndustryPerformance } from '@/lib/reports/industry-performance';

export const dynamic='force-dynamic';

export default async function ReportsPage(){
  const {supabase,organizationId}=await getCurrentOrganization();
  const [
    {data:leads,error:leadError},
    {data:businesses,error:businessError},
    {data:messages,error:messageError},
    {data:replies,error:replyError},
    {data:previews},
    {data:previewEvents},
    {data:variants},
    {data:runs},
  ]=await Promise.all([
    supabase.from('leads').select('id,business_id,status,recommended_offer').eq('organization_id',organizationId),
    supabase.from('businesses').select('id,name,category,google_primary_type_display_name').eq('organization_id',organizationId),
    supabase.from('outreach_messages').select('lead_id,status,direction,channel,sent_at').eq('organization_id',organizationId),
    supabase.from('reply_events').select('lead_id,category,hot,signals').eq('organization_id',organizationId),
    supabase.from('previews').select('status,quality_score').eq('organization_id',organizationId),
    supabase.from('preview_events').select('event_type').eq('organization_id',organizationId),
    supabase.from('message_variants').select('variant_key,sent_count,reply_count,positive_count,hot_count,won_count').eq('organization_id',organizationId),
    supabase.from('agent_runs').select('status').eq('organization_id',organizationId),
  ]);
  const firstError=[leadError,businessError,messageError,replyError].find(Boolean);if(firstError)throw firstError;
  const l=leads??[],m=messages??[],r=replies??[],p=previews??[],pe=previewEvents??[],v=variants??[],ar=runs??[];
  const contactedLeadIds=new Set(m.filter(x=>x.direction==='OUTBOUND'&&Boolean(x.sent_at)&&x.lead_id).map(x=>String(x.lead_id)));
  const repliedLeadIds=new Set(r.filter(x=>x.lead_id).map(x=>String(x.lead_id)));
  const hotLeadIds=new Set(r.filter(x=>x.lead_id&&x.hot===true).map(x=>String(x.lead_id)));
  const won=l.filter(x=>x.status==='WON').length;
  const sent=m.filter(x=>x.direction==='OUTBOUND'&&Boolean(x.sent_at)).length;
  const industry=buildIndustryPerformance({
    leads:l.map(x=>({id:String(x.id),business_id:x.business_id?String(x.business_id):null,status:String(x.status),recommended_offer:x.recommended_offer?String(x.recommended_offer):null})),
    businesses:(businesses??[]).map(x=>({id:String(x.id),name:String(x.name),category:x.category?String(x.category):null,google_primary_type_display_name:x.google_primary_type_display_name?String(x.google_primary_type_display_name):null})),
    messages:m.map(x=>({lead_id:x.lead_id?String(x.lead_id):null,direction:String(x.direction),status:String(x.status),sent_at:x.sent_at?String(x.sent_at):null})),
    replies:r.map(x=>({lead_id:x.lead_id?String(x.lead_id):null,category:String(x.category),hot:Boolean(x.hot),signals:x.signals})),
  });
  const actionable=industry.filter(x=>x.sampleStatus==='ACTIONABLE');
  const best=actionable[0]??null;
  const metrics:[string,string|number][]=[
    ['New Leads',l.filter(x=>x.status==='NEW').length],
    ['Qualified',l.filter(x=>['QUALIFIED','READY_TO_CONTACT'].includes(String(x.status))).length],
    ['Contacted prospects',contactedLeadIds.size],
    ['Replied prospects',repliedLeadIds.size],
    ['HOT prospects',hotLeadIds.size],
    ['Won',won],
    ['Sent messages',sent],
    ['Reply Rate',contactedLeadIds.size?`${Math.round(repliedLeadIds.size/contactedLeadIds.size*100)}%`:'—'],
    ['HOT / Contacted',contactedLeadIds.size?`${Math.round(hotLeadIds.size/contactedLeadIds.size*100)}%`:'—'],
    ['Previews',p.length],
    ['Preview Views',pe.filter(x=>x.event_type==='VIEWED').length],
    ['Agent Runs',ar.length],
    ['Agent Failures',ar.filter(x=>x.status==='FAILED').length],
  ];

  return <div>
    <div className="headerRow"><div><h1>Reports</h1><p className="muted">Live funnel plus sample-aware industry learning, so higher volume follows evidence rather than one lucky reply.</p></div><span className="status">Production data</span></div>
    <div className="grid">{metrics.map(([label,value])=><div className="card" key={label}><div className="muted">{label}</div><div className="value">{value}</div></div>)}</div>

    <section className="panel">
      <div className="headerRow"><div><h2>Industry response efficiency</h2><p className="muted">Rates use distinct contacted prospects, not message count. Contacted is derived from durable sent_at evidence, so later delivery/read status changes cannot corrupt the denominator.</p></div><span className="pill">{best?`Best actionable: ${best.industry}`:'Learning phase'}</span></div>
      {industry.length?<div className="tableWrap"><table className="dataTable"><thead><tr><th>Industry</th><th>Sample</th><th>Contacted</th><th>Reply %</th><th>Positive %</th><th>Engaged %</th><th>HOT %</th><th>Won %</th><th>Score</th><th>Top offer</th></tr></thead><tbody>{industry.map(row=><tr key={row.industry}><td>{row.industry}</td><td>{row.sampleStatus}</td><td>{row.contacted}</td><td>{row.replyRate}%</td><td>{row.positiveRate}%</td><td>{row.engagedRate}%</td><td>{row.hotRate}%</td><td>{row.winRate}%</td><td>{row.performanceScore}</td><td>{row.topOffer??'—'}</td></tr>)}</tbody></table></div>:<p className="muted">No contacted prospects yet. Industry ranking starts only after real outreach/replies exist.</p>}
      <div className="healthList"><span>INSUFFICIENT <strong>1–2 contacted prospects; never scale from this.</strong></span><span>LEARNING <strong>3–9; useful direction, still cautious.</strong></span><span>ACTIONABLE <strong>10+; eligible to influence future industry allocation.</strong></span></div>
    </section>

    <section className="twoCol">
      <div className="panel"><h2>Message variants</h2>{v.length?<div className="tableWrap"><table className="dataTable"><thead><tr><th>Variant</th><th>Sent</th><th>Replies</th><th>Positive</th><th>HOT</th><th>Won</th></tr></thead><tbody>{v.map(x=><tr key={x.variant_key}><td>{x.variant_key}</td><td>{x.sent_count}</td><td>{x.reply_count}</td><td>{x.positive_count}</td><td>{x.hot_count}</td><td>{x.won_count}</td></tr>)}</tbody></table></div>:<p className="muted">No experiment data yet.</p>}</div>
      <div className="panel"><h2>Preview quality</h2><div className="healthList"><span>Generated <strong>{p.length}</strong></span><span>Passed 80+ <strong>{p.filter(x=>(x.quality_score??0)>=80).length}</strong></span><span>Blocked / low quality <strong>{p.filter(x=>(x.quality_score??0)<80).length}</strong></span><span>Viewed <strong>{pe.filter(x=>x.event_type==='VIEWED').length}</strong></span></div></div>
    </section>
  </div>;
}
