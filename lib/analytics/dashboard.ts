[Reading 430 lines from start (total: 430 lines, 0 remaining)]

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { listCurrentMetricDefinitions, type MetricDefinition } from '@/lib/analytics/metrics';
import { readAnalyticsWarehouse } from '@/lib/analytics/warehouse';

export type DashboardScopeLevel='ORGANIZATION'|'BUSINESS'|'BRANCH';

export type DashboardScope={
  level:DashboardScopeLevel;
  organizationId:string;
  tenantBusinessId:string|null;
  branchId:string|null;
  label:string;
};

export type DashboardScopeOption={
  id:string;
  label:string;
  tenantBusinessId?:string|null;
  status?:string|null;
};

export type DashboardHistoricalMetric={
  key:string;
  label:string;
  value:number|null;
  unit:string;
  valuesByUnit:Record<string,number>;
  available:boolean;
  reason:string|null;
  source:'WAREHOUSE';
  definitionVersion:number;
};

export type DashboardLiveGauge={
  key:string;
  label:string;
  value:number|null;
  available:boolean;
  reason:string|null;
  source:'LIVE_CANONICAL_STATE';
};

export type DashboardUnavailableMetric={
  key:string;
  label:string;
  available:false;
  reason:string;
  source:'UNAVAILABLE';
};

export type DashboardDailyActivity={
  day:string;
  communication:number;
  commerce:number;
  booking:number;
  ai:number;
};

export type DashboardSnapshot={
  schemaVersion:1;
  generatedAt:string;
  window:{days:number;startAt:string;endAt:string};
  scope:DashboardScope;
  scopeOptions:{
    businesses:DashboardScopeOption[];
    branches:DashboardScopeOption[];
  };
  freshness:{
    warehouseLastCompleteThrough:string|null;
    warehouseLastSourceEventAt:string|null;
    warehouseLagSeconds:number|null;
    warehouseFactCount:number;
    historyTruncated:boolean;
  };
  historical:DashboardHistoricalMetric[];
  live:DashboardLiveGauge[];
  unavailable:DashboardUnavailableMetric[];
  daily:DashboardDailyActivity[];
  notes:string[];
};

type AnyQuery={
  eq:(column:string,value:unknown)=>AnyQuery;
  in:(column:string,values:unknown[])=>AnyQuery;
  not:(column:string,operator:string,value:unknown)=>AnyQuery;
  gte:(column:string,value:unknown)=>AnyQuery;
  then:PromiseLike<{count:number|null;error:{message:string}|null}>['then'];
};

function boundedDays(value:number|undefined){
  const days=Math.trunc(Number(value??30));
  return [7,30,90].includes(days)?days:30;
}

function finite(value:unknown){
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(typeof value==='string'&&value.trim()){
    const parsed=Number(value);
    if(Number.isFinite(parsed))return parsed;
  }
  return null;
}

function eventName(definition:MetricDefinition){
  const raw=definition.definition?.eventName;
  return typeof raw==='string'&&raw.trim()?raw.trim():null;
}

function supportsScope(definition:MetricDefinition,scope:DashboardScopeLevel){
  return definition.supported_scopes.includes(scope);
}

function round(value:number,places=4){
  const scale=10**places;
  return Math.round(value*scale)/scale;
}

async function exactCount(
  db:SupabaseClient,
  table:string,
  organizationId:string,
  options?:{
    select?:string;
    configure?:(query:AnyQuery)=>AnyQuery;
  },
){
  let query=db
    .from(table)
    .select(options?.select??'id',{count:'exact',head:true})
    .eq('organization_id',organizationId) as unknown as AnyQuery;
  if(options?.configure)query=options.configure(query);
  const result=await query;
  if(result.error)throw new Error(`${table} count failed: ${result.error.message}`);
  return result.count??0;
}

async function liveGauge(key:string,label:string,task:Promise<number>):Promise<DashboardLiveGauge>{
  try{
    return {key,label,value:await task,available:true,reason:null,source:'LIVE_CANONICAL_STATE'};
  }catch(error){
    return {
      key,label,value:null,available:false,
      reason:error instanceof Error?error.message:'Live canonical-state read failed',
      source:'LIVE_CANONICAL_STATE',
    };
  }
}

function unavailable(key:string,label:string,reason:string):DashboardUnavailableMetric{
  return {key,label,available:false,reason,source:'UNAVAILABLE'};
}

function scopeReason(scope:DashboardScope){
  return `Live source is Organization-scoped and cannot be narrowed safely to ${scope.level}. No broader number is substituted.`;
}

function historyMetric(
  definition:MetricDefinition,
  scope:DashboardScope,
  facts:Array<{
    event_name:string;
    numeric_value:number|string|null;
    numeric_unit:string|null;
  }>,
):DashboardHistoricalMetric{
  if(!supportsScope(definition,scope.level)){
    return {
      key:definition.metric_key,
      label:definition.display_name,
      value:null,
      unit:definition.unit,
      valuesByUnit:{},
      available:false,
      reason:`Metric definition v${definition.version} does not support ${scope.level} scope.`,
      source:'WAREHOUSE',
      definitionVersion:definition.version,
    };
  }

  const name=eventName(definition);
  if(!name){
    return {
      key:definition.metric_key,label:definition.display_name,value:null,unit:definition.unit,
      valuesByUnit:{},available:false,reason:'Metric definition has no governed warehouse eventName.',
      source:'WAREHOUSE',definitionVersion:definition.version,
    };
  }

  const matches=facts.filter((fact)=>fact.event_name===name);
  if(definition.aggregation==='COUNT'){
    return {
      key:definition.metric_key,label:definition.display_name,value:matches.length,unit:definition.unit,
      valuesByUnit:{},available:true,reason:null,source:'WAREHOUSE',definitionVersion:definition.version,
    };
  }

  if(definition.aggregation==='SUM'){
    const grouped:Record<string,number>={};
    let total=0;
    for(const fact of matches){
      const amount=finite(fact.numeric_value);
      if(amount==null)continue;
      const unit=String(fact.numeric_unit??definition.unit??'VALUE');
      grouped[unit]=round((grouped[unit]??0)+amount);
      total+=amount;
    }
    const units=Object.keys(grouped);
    const crossCurrency=definition.unit==='MONEY'&&units.length>1;
    return {
      key:definition.metric_key,
      label:definition.display_name,
      value:crossCurrency?null:round(total),
      unit:definition.unit,
      valuesByUnit:grouped,
      available:true,
      reason:crossCurrency?'Multiple currencies are kept separate; no cross-currency total is manufactured.':null,
      source:'WAREHOUSE',
      definitionVersion:definition.version,
    };
  }

  return {
    key:definition.metric_key,label:definition.display_name,value:null,unit:definition.unit,
    valuesByUnit:{},available:false,reason:`${definition.aggregation} dashboard aggregation is not implemented for this package.`,
    source:'WAREHOUSE',definitionVersion:definition.version,
  };
}

function dailyActivity(
  facts:Array<{event_name:string;occurred_at:string}>,
  startAt:Date,
  endAt:Date,
){
  const map=new Map<string,DashboardDailyActivity>();
  for(let cursor=new Date(startAt);cursor<endAt;cursor=new Date(cursor.getTime()+86400000)){
    const day=cursor.toISOString().slice(0,10);
    map.set(day,{day,communication:0,commerce:0,booking:0,ai:0});
  }
  for(const fact of facts){
    const day=String(fact.occurred_at).slice(0,10);
    const row=map.get(day);
    if(!row)continue;
    if(fact.event_name.startsWith('communication.'))row.communication+=1;
    else if(fact.event_name.startsWith('booking.'))row.booking+=1;
    else if(fact.event_name.startsWith('ai.'))row.ai+=1;
    else if(
      fact.event_name.startsWith('quote.')
      ||fact.event_name.startsWith('order.')
      ||fact.event_name.startsWith('invoice.')
      ||fact.event_name.startsWith('payment.')
    )row.commerce+=1;
  }
  return [...map.values()].slice(-14);
}

export async function loadDataDashboard(input:{
  supabase:SupabaseClient;
  organizationId:string;
  days?:number;
  requestedTenantBusinessId?:string|null;
  requestedBranchId?:string|null;
}):Promise<DashboardSnapshot>{
  const db=input.supabase;
  const organizationId=String(input.organizationId);
  const days=boundedDays(input.days);
  const now=new Date();
  const startAt=new Date(now.getTime()-days*86400000);

  const [{data:businessRows,error:businessError},{data:branchRows,error:branchError}]=await Promise.all([
    db.from('tenant_businesses')
      .select('id,name,status')
      .eq('organization_id',organizationId)
      .order('name',{ascending:true})
      .limit(200),
    db.from('branches')
      .select('id,name,status,tenant_business_id')
      .eq('organization_id',organizationId)
      .order('name',{ascending:true})
      .limit(500),
  ]);
  if(businessError)throw new Error(`Dashboard business scope read failed: ${businessError.message}`);
  if(branchError)throw new Error(`Dashboard branch scope read failed: ${branchError.message}`);

  const businesses=(businessRows??[]).map((row)=>({
    id:String(row.id),label:String(row.name??row.id),status:row.status?String(row.status):null,
  }));
  const branches=(branchRows??[]).map((row)=>({
    id:String(row.id),label:String(row.name??row.id),
    tenantBusinessId:row.tenant_business_id?String(row.tenant_business_id):null,
    status:row.status?String(row.status):null,
  }));

  let tenantBusinessId=input.requestedTenantBusinessId?String(input.requestedTenantBusinessId):null;
  const branchId=input.requestedBranchId?String(input.requestedBranchId):null;
  if(tenantBusinessId&&!businesses.some((row)=>row.id===tenantBusinessId)){
    throw new Error('Requested Business scope is not available to this user.');
  }
  if(branchId){
    const branch=branches.find((row)=>row.id===branchId);
    if(!branch)throw new Error('Requested Branch scope is not available to this user.');
    if(tenantBusinessId&&branch.tenantBusinessId!==tenantBusinessId){
      throw new Error('Requested Branch does not belong to the selected Business.');
    }
    tenantBusinessId=tenantBusinessId??branch.tenantBusinessId??null;
  }

  const scope:DashboardScope=branchId
    ?{
      level:'BRANCH',organizationId,tenantBusinessId,branchId,
      label:branches.find((row)=>row.id===branchId)?.label??'Branch',
    }
    :tenantBusinessId
      ?{
        level:'BUSINESS',organizationId,tenantBusinessId,branchId:null,
        label:businesses.find((row)=>row.id===tenantBusinessId)?.label??'Business',
      }
      :{level:'ORGANIZATION',organizationId,tenantBusinessId:null,branchId:null,label:'Organization'};

  const service=createSupabaseServiceClient();
  const definitions=await listCurrentMetricDefinitions(service);
  const eligibleEventNames=[
    ...new Set(definitions.filter((definition)=>supportsScope(definition,scope.level)).map(eventName).filter((value):value is string=>Boolean(value))),
  ];

  const [facts,{data:health,error:healthError}]=await Promise.all([
    readAnalyticsWarehouse(service,{
      organizationId,
      startAt,
      endAt:now,
      eventNames:eligibleEventNames,
      tenantBusinessId:scope.tenantBusinessId,
      branchId:scope.branchId,
      limit:10000,
    }),
    service.from('analytics_warehouse_health_v1')
      .select('fact_count,last_complete_through,last_source_event_at,freshness_lag_seconds')
      .eq('organization_id',organizationId)
      .maybeSingle(),
  ]);
  if(healthError)throw new Error(`Dashboard warehouse health read failed: ${healthError.message}`);

  const historical=definitions.map((definition)=>historyMetric(definition,scope,facts));
  const orgOnly=scope.level==='ORGANIZATION';

  const commerceScope=(query:AnyQuery)=>{
    if(scope.tenantBusinessId)query=query.eq('tenant_business_id',scope.tenantBusinessId);
    if(scope.branchId)query=query.eq('branch_id',scope.branchId);
    return query;
  };
  const bookingScope=(query:AnyQuery)=>{
    if(scope.branchId)return query.eq('branch_id',scope.branchId);
    if(scope.tenantBusinessId){
      const ids=branches.filter((row)=>row.tenantBusinessId===scope.tenantBusinessId).map((row)=>row.id);
      return ids.length?query.in('branch_id',ids):query.in('branch_id',['00000000-0000-0000-0000-000000000000']);
    }
    return query;
  };

  const liveTasks:Promise<DashboardLiveGauge>[]=[];
  const add=(key:string,label:string,task:Promise<number>)=>liveTasks.push(liveGauge(key,label,task));

  if(orgOnly){
    add('leads.total','Leads',exactCount(db,'leads',organizationId));
    add('leads.qualified','Qualified leads',exactCount(db,'leads',organizationId,{configure:(q)=>q.in('status',['QUALIFIED','READY_TO_CONTACT'])}));
    add('leads.won','Won leads',exactCount(db,'leads',organizationId,{configure:(q)=>q.eq('status','WON')}));
    add('customers.total','Customers / people',exactCount(db,'crm_people',organizationId));
    add('conversations.total','Sales conversations',exactCount(db,'sales_conversations',organizationId));
    add('pipeline.open','Open deals',exactCount(db,'crm_deals',organizationId,{configure:(q)=>q.eq('state','OPEN')}));
    add('pipeline.won','Won deals',exactCount(db,'crm_deals',organizationId,{configure:(q)=>q.eq('state','WON')}));
    add('staff.members','Team members',exactCount(db,'organization_members',organizationId,{select:'user_id'}));
    add('tasks.open','Open tasks',Promise.all([
      exactCount(db,'crm_tasks',organizationId),
      exactCount(db,'crm_tasks',organizationId,{configure:(q)=>q.eq('status','DONE')}),
      exactCount(db,'crm_tasks',organizationId,{configure:(q)=>q.eq('status','CANCELED')}),
    ]).then(([total,done,canceled])=>Math.max(0,total-done-canceled)));
    add('campaigns.total','Marketing campaigns',exactCount(db,'campaigns',organizationId,{configure:(q)=>q.eq('campaign_kind','MARKETING')}));
    add('workflows.enabled','Enabled workflows',exactCount(db,'automation_rules',organizationId,{configure:(q)=>q.eq('enabled',true)}));
    add('ai.runs.30d','AI agent runs · selected window',exactCount(db,'agent_runs',organizationId,{configure:(q)=>q.gte('created_at',startAt.toISOString())}));
    add('ai.failures.30d','AI agent failures · selected window',exactCount(db,'agent_runs',organizationId,{configure:(q)=>q.gte('created_at',startAt.toISOString()).eq('status','FAILED')}));
  }

  add('bookings.total','Bookings',exactCount(db,'bookings',organizationId,{configure:bookingScope}));
  add('bookings.confirmed.live','Confirmed bookings · live',exactCount(db,'bookings',organizationId,{configure:(q)=>bookingScope(q).eq('status','CONFIRMED')}));
  add('quotes.total','Quotes',exactCount(db,'quotes',organizationId,{configure:commerceScope}));
  add('orders.total','Orders',exactCount(db,'orders',organizationId,{configure:commerceScope}));
  add('invoices.total','Invoices',exactCount(db,'invoices',organizationId,{configure:commerceScope}));
  add('payments.total','Payment intents',exactCount(db,'payment_intents',organizationId,{configure:commerceScope}));

  const live=await Promise.all(liveTasks);
  if(!orgOnly){
    const reason=scopeReason(scope);
    for(const [key,label] of [
      ['leads.total','Leads'],['customers.total','Customers / people'],['conversations.total','Sales conversations'],
      ['pipeline.open','Open deals'],['staff.members','Team members'],['tasks.open','Open tasks'],
      ['campaigns.total','Marketing campaigns'],['workflows.enabled','Enabled workflows'],['ai.runs.30d','AI agent runs · 30d'],
    ])live.push({key,label,value:null,available:false,reason,source:'LIVE_CANONICAL_STATE'});
  }

  return {
    schemaVersion:1,
    generatedAt:now.toISOString(),
    window:{days,startAt:startAt.toISOString(),endAt:now.toISOString()},
    scope,
    scopeOptions:{businesses,branches},
    freshness:{
      warehouseLastCompleteThrough:health?.last_complete_through?String(health.last_complete_through):null,
      warehouseLastSourceEventAt:health?.last_source_event_at?String(health.last_source_event_at):null,
      warehouseLagSeconds:finite(health?.freshness_lag_seconds),
      warehouseFactCount:finite(health?.fact_count)??0,
      historyTruncated:facts.length>=10000,
    },
    historical,
    live,
    unavailable:[
      unavailable('response_time','Response time','No governed response-time metric exists in the current Metrics Registry yet. The dashboard does not derive one from ad hoc message scans.'),
      unavailable('retention','Retention','No canonical retention/churn event definition exists yet. Zero would be misleading, so this remains unavailable.'),
    ],
    daily:dailyActivity(facts,startAt,now),
    notes:[
      'Historical metrics come from the versioned Metrics Registry and rebuildable Analytics Warehouse.',
      'LIVE gauges are bounded canonical current-state counts, not historical trends and not causal attribution.',
      'Unsupported lower-level scope never falls back to a broader Organization number.',
      facts.length>=10000?'Historical event read reached the 10,000-row safety cap; narrow the time window before treating totals as complete.':'Historical warehouse read is within the bounded row cap.',
    ],
  };
}

[executed on device: vps-eae2ade9 (4241b720-b387-477b-bb4f-5ea2a25fa2a6)]