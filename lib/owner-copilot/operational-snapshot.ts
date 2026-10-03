import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadFounderStatusV1 } from '@/lib/founder/server';

const LIMIT=8;
function fail(label:string,error:{message:string}|null){if(error)throw new Error(`Owner Copilot ${label} read failed: ${error.message}`);}
function rows<T>(result:{data:T[]|null;error:{message:string}|null},label:string){fail(label,result.error);return result.data??[];}

export async function loadOwnerCopilotOperationalSnapshot(input:{supabase:SupabaseClient;organizationId:string}) {
  const db=input.supabase, org=input.organizationId;
  const [founder,leads,businesses,people,deals,tasks,bookings,quotes,orders,invoices,payments,campaigns,automations,reports,members,taskWorkload,dealWorkload]=await Promise.all([
    loadFounderStatusV1({supabase:db,organizationId:org}),
    db.from('leads').select('id,status,opportunity_score,intent_score,agent_mode,recommended_offer,updated_at').eq('organization_id',org).order('updated_at',{ascending:false}).limit(LIMIT),
    db.from('businesses').select('id,name,country_code,city,category,updated_at').eq('organization_id',org).order('updated_at',{ascending:false}).limit(LIMIT),
    db.from('crm_people').select('id,display_name,status,last_seen_at').eq('organization_id',org).order('last_seen_at',{ascending:false}).limit(LIMIT),
    db.from('crm_deals').select('id,business_id,lead_id,stage_id,title,state,amount,currency,expected_close_at,owner_user_id,team_id,version,updated_at').eq('organization_id',org).order('updated_at',{ascending:false}).limit(LIMIT),
    db.from('crm_tasks').select('id,business_id,lead_id,deal_id,person_id,task_type,title,status,priority,assignee_user_id,due_at,is_overdue,version,updated_at').eq('organization_id',org).order('updated_at',{ascending:false}).limit(LIMIT),
    db.from('bookings').select('id,booking_reference,person_id,lead_id,service_id,branch_id,starts_at,ends_at,status,current_hold_id,version,updated_at').eq('organization_id',org).order('updated_at',{ascending:false}).limit(LIMIT),
    db.from('quotes').select('id,quote_number,status,current_version,version,owner_user_id,buyer_business_id,person_id,updated_at').eq('organization_id',org).order('updated_at',{ascending:false}).limit(LIMIT),
    db.from('orders').select('id,order_number,status,fulfillment_status,total,currency,quote_id,version,updated_at').eq('organization_id',org).order('updated_at',{ascending:false}).limit(LIMIT),
    db.from('invoices').select('id,invoice_number,order_id,status,settlement_status,total,paid_total,credited_total,balance_due,currency,due_date,version,updated_at').eq('organization_id',org).order('updated_at',{ascending:false}).limit(LIMIT),
    db.from('payment_intents').select('id,payment_number,invoice_id,status,provider,amount,captured_total,refunded_total,net_paid_total,currency,version,updated_at').eq('organization_id',org).order('updated_at',{ascending:false}).limit(LIMIT),
    db.from('campaigns').select('id,name,campaign_kind,status,approval_status,scheduled_start_at,scheduled_end_at,version,updated_at').eq('organization_id',org).eq('campaign_kind','MARKETING').order('updated_at',{ascending:false}).limit(LIMIT),
    db.from('automation_rules').select('id,name,trigger_key,action_key,enabled,priority,publication_state,execution_state,draft_revision,latest_published_version,updated_at').eq('organization_id',org).order('updated_at',{ascending:false}).limit(LIMIT),
    db.from('founder_board_reports').select('id,status,title,period_start,period_end,executive_summary,decisions_needed,risks,source_ref,version,updated_at').eq('organization_id',org).order('period_end',{ascending:false}).limit(LIMIT),
    db.from('organization_members').select('user_id,role').eq('organization_id',org).limit(100),
    db.from('crm_tasks').select('assignee_user_id,status,is_overdue').eq('organization_id',org).limit(1000),
    db.from('crm_deals').select('owner_user_id,state').eq('organization_id',org).limit(1000),
  ]);

  const memberRows=rows(members,'members') as Array<{user_id:string;role:string}>;
  const taskRows=rows(taskWorkload,'team tasks') as Array<{assignee_user_id:string|null;status:string;is_overdue:boolean}>;
  const dealRows=rows(dealWorkload,'team deals') as Array<{owner_user_id:string;state:string}>;
  const team=memberRows.map((member)=>({
    userId:member.user_id,
    role:member.role,
    openTasks:taskRows.filter((t)=>t.assignee_user_id===member.user_id&&!['DONE','CANCELED'].includes(t.status)).length,
    overdueTasks:taskRows.filter((t)=>t.assignee_user_id===member.user_id&&t.is_overdue&&!['DONE','CANCELED'].includes(t.status)).length,
    openDeals:dealRows.filter((d)=>d.owner_user_id===member.user_id&&d.state==='OPEN').length,
    wonDeals:dealRows.filter((d)=>d.owner_user_id===member.user_id&&d.state==='WON').length,
  }));

  return {
    generatedAt:new Date().toISOString(),
    note:'Bounded live operational read model. This is not a historical analytics warehouse and must not be treated as causal attribution.',
    status:founder,
    recent:{
      leads:rows(leads,'leads'),businesses:rows(businesses,'businesses'),people:rows(people,'people'),
      deals:rows(deals,'deals'),tasks:rows(tasks,'tasks'),bookings:rows(bookings,'bookings'),quotes:rows(quotes,'quotes'),
      orders:rows(orders,'orders'),invoices:rows(invoices,'invoices'),payments:rows(payments,'payments'),
      campaigns:rows(campaigns,'campaigns'),automations:rows(automations,'automations'),
      reports:rows(reports,'board reports'),
    },
    team,
    followUps:{
      open:taskRows.filter((t)=>!['DONE','CANCELED'].includes(t.status)).length,
      overdue:taskRows.filter((t)=>t.is_overdue&&!['DONE','CANCELED'].includes(t.status)).length,
    },
  };
}
