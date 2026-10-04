import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type MetricScope='ORGANIZATION'|'BUSINESS'|'BRANCH';

export type MetricDefinition={
  metric_key:string;
  version:number;
  display_name:string;
  description:string;
  owner_domain:string;
  metric_kind:'COUNT'|'SUM'|'RATE'|'GAUGE';
  unit:'COUNT'|'PERCENT'|'USD'|'MONEY';
  aggregation:'COUNT'|'SUM'|'RATE'|'LATEST';
  source_mode:'EVENT_FEED'|'CANONICAL_STATE'|'DERIVED';
  supported_scopes:MetricScope[];
  supported_dimensions:string[];
  freshness_sla_seconds:number;
  definition:Record<string,unknown>;
};

export type AnalyticsEvent={
  organization_id:string;
  tenant_business_id:string|null;
  branch_id:string|null;
  event_id:string;
  event_name:string;
  event_version:number;
  source_table:string;
  source_event_type:string;
  evidence_class:string;
  entity_type:string;
  entity_id:string|null;
  lead_id:string|null;
  conversation_id:string|null;
  occurred_at:string;
  numeric_value:number|string|null;
  numeric_unit:string|null;
  dimensions:Record<string,unknown>;
};

export type AnalyticsEventReadInput={
  organizationId:string;
  startAt:string|Date;
  endAt:string|Date;
  eventNames?:string[];
  tenantBusinessId?:string|null;
  branchId?:string|null;
  limit?:number;
};

function iso(value:string|Date,label:string){
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error(`${label} must be a valid date-time`);
  return date.toISOString();
}

function normalizeEventNames(values:string[]|undefined){
  if(values==null)return null;
  const names=[...new Set(values.map((value)=>String(value).trim()).filter(Boolean))];
  if(names.length>64)throw new Error('Analytics event filter is limited to 64 event names');
  if(names.some((name)=>name.length>180))throw new Error('Analytics event name is too long');
  return names.length?names:null;
}

export function normalizeAnalyticsEventRead(input:AnalyticsEventReadInput){
  const startAt=iso(input.startAt,'startAt');
  const endAt=iso(input.endAt,'endAt');
  const startMs=Date.parse(startAt);
  const endMs=Date.parse(endAt);
  if(endMs<=startMs)throw new Error('Analytics event window is invalid');
  if(endMs-startMs>31*24*60*60*1000)throw new Error('Analytics event window exceeds 31 days');
  const limit=Math.min(5000,Math.max(1,Math.trunc(Number(input.limit??1000)||1000)));
  return {
    p_organization_id:String(input.organizationId),
    p_start_at:startAt,
    p_end_at:endAt,
    p_event_names:normalizeEventNames(input.eventNames),
    p_tenant_business_id:input.tenantBusinessId?String(input.tenantBusinessId):null,
    p_branch_id:input.branchId?String(input.branchId):null,
    p_limit:limit,
  };
}

export async function listCurrentMetricDefinitions(supabase:SupabaseClient){
  const {data,error}=await supabase
    .from('metric_registry_current_v1')
    .select('metric_key,version,display_name,description,owner_domain,metric_kind,unit,aggregation,source_mode,supported_scopes,supported_dimensions,freshness_sla_seconds,definition')
    .order('metric_key',{ascending:true});
  if(error)throw new Error(`Metrics Registry read failed: ${error.message}`);
  return (data??[]) as MetricDefinition[];
}

export async function readAnalyticsEvents(
  supabase:SupabaseClient,
  input:AnalyticsEventReadInput,
){
  const args=normalizeAnalyticsEventRead(input);
  const {data,error}=await supabase.rpc('read_analytics_event_feed_v1',args);
  if(error)throw new Error(`Analytics event feed read failed: ${error.message}`);
  return (data??[]) as AnalyticsEvent[];
}