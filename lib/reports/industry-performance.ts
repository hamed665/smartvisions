import { inferIndustrySegment } from '@/lib/hunters/business/personalization';

type LeadRow = { id:string; business_id:string|null; status:string; recommended_offer:string|null };
type BusinessRow = { id:string; name:string; category:string|null; google_primary_type_display_name:string|null };
type MessageRow = { lead_id:string|null; direction:string; status:string; sent_at:string|null; received_at?:string|null };
type ReplyRow = { lead_id:string|null; category:string; hot:boolean|null; signals:unknown };

export type IndustryPerformance = {
  industry:string;
  contacted:number;
  replied:number;
  positive:number;
  engaged:number;
  hot:number;
  won:number;
  dnc:number;
  replyRate:number;
  positiveRate:number;
  engagedRate:number;
  hotRate:number;
  winRate:number;
  adjustedPositiveRate:number;
  performanceScore:number;
  sampleStatus:'INSUFFICIENT'|'LEARNING'|'ACTIONABLE';
  topOffer:string|null;
};

const pct=(part:number,total:number)=>total>0?Math.round(part/total*1000)/10:0;
const asRecord=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const ENGAGED=new Set(['positive','price','portfolio','timeline','meeting','payment']);

function industryKey(business:BusinessRow|undefined){
  if(!business)return'OTHER';
  const segment=inferIndustrySegment({name:business.name,category:business.category??undefined,primaryTypeDisplayName:business.google_primary_type_display_name??undefined});
  return segment==='GENERIC'?'OTHER':segment;
}

function validTime(value:string|null|undefined){
  const parsed=Date.parse(String(value??''));
  return Number.isFinite(parsed)?parsed:null;
}

export function buildIndustryPerformance(input:{leads:LeadRow[];businesses:BusinessRow[];messages:MessageRow[];replies:ReplyRow[]}):IndustryPerformance[]{
  const businessById=new Map(input.businesses.map(row=>[row.id,row]));
  const leadById=new Map(input.leads.map(row=>[row.id,row]));
  const firstOutboundAt=new Map<string,number>();
  for(const row of input.messages){
    if(row.direction!=='OUTBOUND'||!row.lead_id)continue;
    const at=validTime(row.sent_at);if(at==null)continue;
    const id=String(row.lead_id);const current=firstOutboundAt.get(id);
    if(current==null||at<current)firstOutboundAt.set(id,at);
  }
  const contacted=new Set(firstOutboundAt.keys());
  // Reply existence comes from durable inbound provider evidence after actual outbound contact.
  // reply_events remains useful for semantic classification, but a missing classifier row must
  // not erase a real reply.
  const durableReplies=input.messages.filter(row=>{
    if(row.direction!=='INBOUND'||!row.lead_id)return false;
    const received=validTime(row.received_at);const firstSent=firstOutboundAt.get(String(row.lead_id));
    return received!=null&&firstSent!=null&&received>=firstSent;
  }).map(row=>String(row.lead_id));
  const replied=new Set([
    ...durableReplies,
    ...input.replies.filter(row=>row.lead_id&&contacted.has(String(row.lead_id))).map(row=>String(row.lead_id)),
  ]);
  const positive=new Set(input.replies.filter(row=>{
    const signals=asRecord(row.signals);
    return row.lead_id&&(row.category==='positive'||signals.positive===true);
  }).map(row=>String(row.lead_id)));
  const engaged=new Set(input.replies.filter(row=>row.lead_id&&ENGAGED.has(row.category)).map(row=>String(row.lead_id)));
  const hot=new Set(input.replies.filter(row=>row.lead_id&&row.hot===true).map(row=>String(row.lead_id)));
  const dnc=new Set(input.replies.filter(row=>row.lead_id&&row.category==='unsubscribe').map(row=>String(row.lead_id)));
  const totalPositive=[...positive].filter(id=>contacted.has(id)).length;
  const totalContacted=contacted.size;
  const globalPositiveRate=totalContacted?totalPositive/totalContacted:0;
  const priorWeight=5;
  const buckets=new Map<string,Set<string>>();

  for(const lead of input.leads){
    const industry=industryKey(lead.business_id?businessById.get(lead.business_id):undefined);
    const leadIds=buckets.get(industry)??new Set<string>();
    leadIds.add(lead.id);
    buckets.set(industry,leadIds);
  }

  const rows:IndustryPerformance[]=[];
  for(const[industry,leadIds]of buckets){
    const contactedIds=[...leadIds].filter(id=>contacted.has(id));
    const c=contactedIds.length;
    if(c===0)continue;
    const r=contactedIds.filter(id=>replied.has(id)).length;
    const p=contactedIds.filter(id=>positive.has(id)).length;
    const e=contactedIds.filter(id=>engaged.has(id)).length;
    const h=contactedIds.filter(id=>hot.has(id)||['HOT','WON'].includes(leadById.get(id)?.status??'')).length;
    const w=contactedIds.filter(id=>leadById.get(id)?.status==='WON').length;
    const d=contactedIds.filter(id=>dnc.has(id)||leadById.get(id)?.status==='DO_NOT_CONTACT').length;
    const adjustedPositive=(p+globalPositiveRate*priorWeight)/(c+priorWeight);
    const score=Math.max(0,Math.min(100,Math.round(100*(adjustedPositive*0.45+(e/c)*0.25+(h/c)*0.18+(w/c)*0.12-(d/c)*0.20))));
    const offerCounts=new Map<string,number>();
    for(const id of contactedIds){
      const offer=leadById.get(id)?.recommended_offer;
      if(offer)offerCounts.set(offer,(offerCounts.get(offer)??0)+1);
    }
    const topOffer=[...offerCounts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]??null;
    rows.push({
      industry,contacted:c,replied:r,positive:p,engaged:e,hot:h,won:w,dnc:d,
      replyRate:pct(r,c),positiveRate:pct(p,c),engagedRate:pct(e,c),hotRate:pct(h,c),winRate:pct(w,c),
      adjustedPositiveRate:Math.round(adjustedPositive*1000)/10,performanceScore:score,
      sampleStatus:c>=10?'ACTIONABLE':c>=3?'LEARNING':'INSUFFICIENT',topOffer,
    });
  }
  return rows.sort((a,b)=>{
    const rank={ACTIONABLE:3,LEARNING:2,INSUFFICIENT:1};
    return rank[b.sampleStatus]-rank[a.sampleStatus]||b.performanceScore-a.performanceScore||b.contacted-a.contacted;
  });
}
