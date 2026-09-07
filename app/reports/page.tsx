import { getCurrentOrganization } from '@/lib/supabase/org';
import { buildCatalogConversionAttribution } from '@/lib/reports/catalog-conversion';
import { buildIndustryPerformance } from '@/lib/reports/industry-performance';
import { buildSalesEfficiencySummary } from '@/lib/reports/sales-efficiency';

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
    {data:whatsappEvents,error:whatsappEventError},
    {data:handoffs,error:handoffError},
  ]=await Promise.all([
    supabase.from('leads').select('id,business_id,status,recommended_offer').eq('organization_id',organizationId),
    supabase.from('businesses').select('id,name,category,google_primary_type_display_name').eq('organization_id',organizationId),
    supabase.from('outreach_messages').select('id,lead_id,status,direction,channel,sent_at,received_at,created_at,metadata').eq('organization_id',organizationId),
    supabase.from('reply_events').select('lead_id,category,hot,signals').eq('organization_id',organizationId),
    supabase.from('previews').select('status,quality_score').eq('organization_id',organizationId),
    supabase.from('preview_events').select('event_type').eq('organization_id',organizationId),
    supabase.from('message_variants').select('variant_key,sent_count,reply_count,positive_count,hot_count,won_count').eq('organization_id',organizationId),
    supabase.from('agent_runs').select('status,result_payload').eq('organization_id',organizationId),
    supabase.from('whatsapp_events').select('provider_message_id,lead_id,conversation_id,direction,event_type,payload,created_at').eq('organization_id',organizationId),
    supabase.from('handoff_events').select('lead_id,conversation_id,to_mode,created_at').eq('organization_id',organizationId),
  ]);
  const firstError=[leadError,businessError,messageError,replyError,whatsappEventError,handoffError].find(Boolean);if(firstError)throw firstError;
  const l=leads??[],m=messages??[],r=replies??[],p=previews??[],pe=previewEvents??[],v=variants??[],ar=runs??[];
  const firstOutboundAt=new Map<string,number>();
  for(const message of m){
    if(message.direction!=='OUTBOUND'||!message.sent_at||!message.lead_id)continue;
    const at=Date.parse(String(message.sent_at));if(!Number.isFinite(at))continue;
    const leadId=String(message.lead_id);const current=firstOutboundAt.get(leadId);
    if(current==null||at<current)firstOutboundAt.set(leadId,at);
  }
  const contactedLeadIds=new Set(firstOutboundAt.keys());
  const repliedLeadIds=new Set(m.filter(message=>{
    if(message.direction!=='INBOUND'||!message.received_at||!message.lead_id)return false;
    const received=Date.parse(String(message.received_at));const firstSent=firstOutboundAt.get(String(message.lead_id));
    return Number.isFinite(received)&&firstSent!=null&&received>=firstSent;
  }).map(message=>String(message.lead_id)));
  const hotLeadIds=new Set(r.filter(x=>x.lead_id&&repliedLeadIds.has(String(x.lead_id))&&x.hot===true).map(x=>String(x.lead_id)));
  const won=l.filter(x=>x.status==='WON').length;
  const sent=m.filter(x=>x.direction==='OUTBOUND'&&Boolean(x.sent_at)).length;
  const industry=buildIndustryPerformance({
    leads:l.map(x=>({id:String(x.id),business_id:x.business_id?String(x.business_id):null,status:String(x.status),recommended_offer:x.recommended_offer?String(x.recommended_offer):null})),
    businesses:(businesses??[]).map(x=>({id:String(x.id),name:String(x.name),category:x.category?String(x.category):null,google_primary_type_display_name:x.google_primary_type_display_name?String(x.google_primary_type_display_name):null})),
    messages:m.map(x=>({lead_id:x.lead_id?String(x.lead_id):null,direction:String(x.direction),status:String(x.status),sent_at:x.sent_at?String(x.sent_at):null,received_at:x.received_at?String(x.received_at):null})),
    replies:r.map(x=>({lead_id:x.lead_id?String(x.lead_id):null,category:String(x.category),hot:Boolean(x.hot),signals:x.signals})),
  });
  const catalog=buildCatalogConversionAttribution({
    whatsappEvents:(whatsappEvents??[]).map(x=>({
      provider_message_id:x.provider_message_id?String(x.provider_message_id):null,
      lead_id:x.lead_id?String(x.lead_id):null,
      conversation_id:x.conversation_id?String(x.conversation_id):null,
      direction:x.direction?String(x.direction):null,
      event_type:x.event_type?String(x.event_type):null,
      payload:x.payload,
      created_at:x.created_at?String(x.created_at):null,
    })),
    inboundMessages:m.map(x=>({
      id:x.id?String(x.id):null,
      lead_id:x.lead_id?String(x.lead_id):null,
      channel:x.channel?String(x.channel):null,
      direction:x.direction?String(x.direction):null,
      status:x.status?String(x.status):null,
      received_at:x.received_at?String(x.received_at):null,
      created_at:x.created_at?String(x.created_at):null,
      metadata:x.metadata,
    })),
    handoffEvents:(handoffs??[]).map(x=>({
      lead_id:x.lead_id?String(x.lead_id):null,
      conversation_id:x.conversation_id?String(x.conversation_id):null,
      to_mode:x.to_mode?String(x.to_mode):null,
      created_at:x.created_at?String(x.created_at):null,
    })),
    leads:l.map(x=>({id:String(x.id),status:String(x.status)})),
  });
  const salesEfficiency=buildSalesEfficiencySummary(ar.map(run=>({
    status:run.status?String(run.status):null,
    result_payload:run.result_payload,
  })));
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
    ['Catalog sends',catalog.sent],
    ['Catalog replies',catalog.replied],
    ['Measured sales drafts',salesEfficiency.evaluatedDrafts],
    ['Previews',p.length],
    ['Preview Views',pe.filter(x=>x.event_type==='VIEWED').length],
    ['Agent Runs',ar.length],
    ['Agent Failures',ar.filter(x=>x.status==='FAILED').length],
  ];

  return <div>
    <div className="headerRow"><div><h1>Reports</h1><p className="muted">Live funnel plus evidence-based catalog, response-discipline and industry learning. Historical data is never retroactively scored just to make a chart look experienced.</p></div><span className="status">Production data</span></div>
    <div className="grid">{metrics.map(([label,value])=><div className="card" key={label}><div className="muted">{label}</div><div className="value">{value}</div></div>)}</div>

    <section className="panel">
      <div className="headerRow"><div><h2>WhatsApp catalog conversion</h2><p className="muted">Provider-confirmed Product Send → Delivered / Read → first customer reply or Human handoff. Replies and handoffs attach only to the latest prior product in the same conversation.</p></div><span className="pill">{catalog.sent?`${catalog.sent} product sends`:'No product sends'}</span></div>
      <div className="healthList"><span>Sent <strong>{catalog.sent}</strong></span><span>Delivered <strong>{catalog.delivered}</strong></span><span>Read <strong>{catalog.read}</strong></span><span>Replied <strong>{catalog.replied}</strong></span><span>Human handoff <strong>{catalog.handoff}</strong></span><span>Current WON + catalog send <strong>{catalog.won}</strong></span></div>
      <div className="tableWrap"><table className="dataTable"><thead><tr><th>Catalog product</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Replied</th><th>Reply %</th><th>Human</th><th>Won*</th></tr></thead><tbody>{catalog.rows.map(row=><tr key={row.contentId}><td><strong>{row.contentId}</strong><br/><span className="muted">{row.label}</span></td><td>{row.sent}</td><td>{row.delivered}</td><td>{row.read}</td><td>{row.replied}</td><td>{row.replyRate==null?'—':`${row.replyRate}%`}</td><td>{row.handoff}</td><td>{row.won}</td></tr>)}</tbody></table></div>
      <p className="muted">No fake click metric is shown because the current Meta webhook evidence does not provide a reliable product-view/click event. *Won means the Lead is currently WON and also has a catalog send. Without a timestamped win ledger, this is deliberately not presented as causal or click-to-win attribution.</p>
    </section>

    <section className="panel">
      <div className="headerRow"><div><h2>Sales response efficiency</h2><p className="muted">Measures reply discipline from explicit `salesEfficiency` evidence stored on new Agent runs. Historical runs without this trace are ignored, not guessed. These are quality/efficiency indicators, not proof of higher conversion.</p></div><span className="pill">{salesEfficiency.evaluatedDrafts?`${salesEfficiency.evaluatedDrafts} measured drafts`:'Awaiting measured drafts'}</span></div>
      <div className="healthList">
        <span>Policy pass <strong>{salesEfficiency.policyPassRate==null?'—':`${salesEfficiency.policyPassRate}%`} ({salesEfficiency.policyPassedDrafts}/{salesEfficiency.evaluatedDrafts})</strong></span>
        <span>Average words <strong>{salesEfficiency.averageWords??'—'}</strong></span>
        <span>Average primary questions <strong>{salesEfficiency.averageQuestions??'—'}</strong></span>
        <span>Direct price answered <strong>{salesEfficiency.directPriceAnswered}/{salesEfficiency.directPriceRequired}</strong></span>
        <span>Ready-to-start signals <strong>{salesEfficiency.readyToStartSignals}</strong></span>
        <span>Avoidable qualification blocked <strong>{salesEfficiency.avoidableQualificationBlocks}</strong></span>
        <span>Reply word-limit blocked <strong>{salesEfficiency.marketWordLimitBlocks}</strong></span>
        <span>Canonical price misses blocked <strong>{salesEfficiency.canonicalPriceMissBlocks}</strong></span>
      </div>
      <p className="muted">The goal is fewer unnecessary turns: answer known facts directly, ask at most one necessary question, and hand explicit start/payment/contract/meeting intent to a Human instead of extending the sales script.</p>
    </section>

    <section className="panel">
      <div className="headerRow"><div><h2>Industry response efficiency</h2><p className="muted">Contacted and replied use durable provider message timestamps. Positive/HOT classification receives credit only when a real inbound reply exists.</p></div><span className="pill">{best?`Best actionable: ${best.industry}`:'Learning phase'}</span></div>
      {industry.length?<div className="tableWrap"><table className="dataTable"><thead><tr><th>Industry</th><th>Sample</th><th>Contacted</th><th>Reply %</th><th>Positive %</th><th>Engaged %</th><th>HOT %</th><th>Won %</th><th>Score</th><th>Top offer</th></tr></thead><tbody>{industry.map(row=><tr key={row.industry}><td>{row.industry}</td><td>{row.sampleStatus}</td><td>{row.contacted}</td><td>{row.replyRate}%</td><td>{row.positiveRate}%</td><td>{row.engagedRate}%</td><td>{row.hotRate}%</td><td>{row.winRate}%</td><td>{row.performanceScore}</td><td>{row.topOffer??'—'}</td></tr>)}</tbody></table></div>:<p className="muted">No contacted prospects yet. Industry ranking starts only after real outreach/replies exist.</p>}
      <div className="healthList"><span>INSUFFICIENT <strong>1–2 contacted prospects; never scale from this.</strong></span><span>LEARNING <strong>3–9; useful direction, still cautious.</strong></span><span>ACTIONABLE <strong>10+; eligible to influence future industry allocation.</strong></span></div>
    </section>

    <section className="twoCol">
      <div className="panel"><h2>Message variants</h2>{v.length?<div className="tableWrap"><table className="dataTable"><thead><tr><th>Variant</th><th>Sent</th><th>Replies</th><th>Positive</th><th>HOT</th><th>Won</th></tr></thead><tbody>{v.map(x=><tr key={x.variant_key}><td>{x.variant_key}</td><td>{x.sent_count}</td><td>{x.reply_count}</td><td>{x.positive_count}</td><td>{x.hot_count}</td><td>{x.won_count}</td></tr>)}</tbody></table></div>:<p className="muted">No experiment data yet.</p>}</div>
      <div className="panel"><h2>Preview quality</h2><div className="healthList"><span>Generated <strong>{p.length}</strong></span><span>Passed 80+ <strong>{p.filter(x=>(x.quality_score??0)>=80).length}</strong></span><span>Blocked / low quality <strong>{p.filter(x=>(x.quality_score??0)<80).length}</strong></span><span>Viewed <strong>{pe.filter(x=>x.event_type==='VIEWED').length}</strong></span></div></div>
    </section>
  </div>;
}
