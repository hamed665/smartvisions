import { describe, expect, it } from 'vitest';
import { buildIndustryPerformance } from '../lib/reports/industry-performance';

function lead(id:string,businessId:string,status='CONTACTED',offer='business_website'){return{id,business_id:businessId,status,recommended_offer:offer};}
const sent=(leadId:string,status='SENT')=>({lead_id:leadId,direction:'OUTBOUND',status,sent_at:'2026-09-02T00:00:00.000Z'});
const inbound=(leadId:string,receivedAt='2026-09-02T01:00:00.000Z')=>({lead_id:leadId,direction:'INBOUND',status:'RECEIVED',sent_at:null,received_at:receivedAt});

describe('industry performance learning',()=>{
  it('does not let a one-contact lucky industry outrank an actionable sample',()=>{
    const businesses=[
      ...Array.from({length:10},(_,i)=>({id:`d${i}`,name:`Dental ${i}`,category:'dental clinic',google_primary_type_display_name:null})),
      {id:'s1',name:'Salon One',category:'hair salon',google_primary_type_display_name:null},
    ];
    const leads=[...Array.from({length:10},(_,i)=>lead(`ld${i}`,`d${i}`)),lead('ls1','s1')];
    const messages=[...leads.map(x=>sent(x.id)),...['ld0','ld1','ld2','ld3','ls1'].map(inbound)];
    const replies=[
      ...[0,1,2,3].map(i=>({lead_id:`ld${i}`,category:'positive',hot:i<2,signals:{positive:true}})),
      {lead_id:'ls1',category:'positive',hot:true,signals:{positive:true}},
    ];
    const rows=buildIndustryPerformance({leads,businesses,messages,replies});
    expect(rows[0].industry).toBe('DENTAL');
    expect(rows[0].sampleStatus).toBe('ACTIONABLE');
    const salon=rows.find(x=>x.industry==='SALON');
    expect(salon?.positiveRate).toBe(100);
    expect(salon?.sampleStatus).toBe('INSUFFICIENT');
  });

  it('separates explicit positive replies from broader commercial engagement',()=>{
    const businesses=[{id:'b1',name:'Cafe One',category:'cafe',google_primary_type_display_name:null},{id:'b2',name:'Cafe Two',category:'cafe',google_primary_type_display_name:null},{id:'b3',name:'Cafe Three',category:'cafe',google_primary_type_display_name:null}];
    const leads=[lead('l1','b1'),lead('l2','b2'),lead('l3','b3')];
    const messages=[...leads.map(x=>sent(x.id)),inbound('l1'),inbound('l2')];
    const replies=[{lead_id:'l1',category:'price',hot:false,signals:{askedPrice:true}},{lead_id:'l2',category:'positive',hot:false,signals:{positive:true}}];
    const [row]=buildIndustryPerformance({leads,businesses,messages,replies});
    expect(row.industry).toBe('RESTAURANT');
    expect(row.replied).toBe(2);
    expect(row.engaged).toBe(2);
    expect(row.positive).toBe(1);
    expect(row.sampleStatus).toBe('LEARNING');
  });

  it('counts durable inbound as a reply even when reply_events has not classified it',()=>{
    const businesses=[{id:'b1',name:'Clinic One',category:'medical clinic',google_primary_type_display_name:null}];
    const leads=[lead('l1','b1')];
    const messages=[sent('l1'),inbound('l1')];
    const [row]=buildIndustryPerformance({leads,businesses,messages,replies:[]});
    expect(row.contacted).toBe(1);
    expect(row.replied).toBe(1);
    expect(row.replyRate).toBe(100);
    expect(row.positive).toBe(0);
    expect(row.engaged).toBe(0);
  });

  it('does not treat inbound that predates outbound contact as a campaign reply',()=>{
    const businesses=[{id:'b1',name:'Clinic One',category:'medical clinic',google_primary_type_display_name:null}];
    const leads=[lead('l1','b1')];
    const messages=[inbound('l1','2026-09-01T23:00:00.000Z'),sent('l1')];
    const [row]=buildIndustryPerformance({leads,businesses,messages,replies:[]});
    expect(row.contacted).toBe(1);
    expect(row.replied).toBe(0);
    expect(row.replyRate).toBe(0);
  });

  it('does not let a classifier row manufacture reply existence without inbound evidence',()=>{
    const businesses=[{id:'b1',name:'Clinic One',category:'medical clinic',google_primary_type_display_name:null}];
    const leads=[lead('l1','b1')];
    const messages=[sent('l1')];
    const replies=[{lead_id:'l1',category:'positive',hot:true,signals:{positive:true}}];
    const [row]=buildIndustryPerformance({leads,businesses,messages,replies});
    expect(row.replied).toBe(0);
    expect(row.replyRate).toBe(0);
    expect(row.positive).toBe(1);
  });

  it('penalizes unsubscribe/DNC rather than treating raw reply count as success',()=>{
    const businesses=Array.from({length:10},(_,i)=>({id:`b${i}`,name:`Clinic ${i}`,category:'medical clinic',google_primary_type_display_name:null}));
    const leads=businesses.map((b,i)=>lead(`l${i}`,b.id,i===9?'DO_NOT_CONTACT':'CONTACTED'));
    const messages=[...leads.map(x=>sent(x.id)),inbound('l0'),inbound('l9')];
    const replies=[{lead_id:'l0',category:'positive',hot:false,signals:{positive:true}},{lead_id:'l9',category:'unsubscribe',hot:false,signals:{unsubscribe:true}}];
    const [row]=buildIndustryPerformance({leads,businesses,messages,replies});
    expect(row.dnc).toBe(1);
    expect(row.performanceScore).toBeLessThan(30);
  });

  it('uses sent_at and excludes uncontacted outcomes from the outbound cohort',()=>{
    const businesses=[{id:'b1',name:'Dental One',category:'dental clinic',google_primary_type_display_name:null},{id:'b2',name:'Dental Two',category:'dental clinic',google_primary_type_display_name:null},{id:'b3',name:'Dental Three',category:'dental clinic',google_primary_type_display_name:null}];
    const leads=[lead('l1','b1'),lead('l2','b2'),lead('l3','b3','WON')];
    const messages=[sent('l1','DELIVERED'),sent('l2','READ'),{lead_id:'l3',direction:'OUTBOUND',status:'PROCESSING',sent_at:null},inbound('l1'),inbound('l2'),inbound('l3')];
    const replies=[
      {lead_id:'l1',category:'positive',hot:false,signals:{positive:true}},
      {lead_id:'l2',category:'price',hot:false,signals:{askedPrice:true}},
      {lead_id:'l3',category:'positive',hot:true,signals:{positive:true}},
    ];
    const [row]=buildIndustryPerformance({leads,businesses,messages,replies});
    expect(row.contacted).toBe(2);
    expect(row.replied).toBe(2);
    expect(row.positive).toBe(1);
    expect(row.hot).toBe(0);
    expect(row.won).toBe(0);
    expect(row.replyRate).toBe(100);
    expect(row.positiveRate).toBe(50);
    expect(row.sampleStatus).toBe('INSUFFICIENT');
  });
});
