'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const text=(f:FormData,k:string)=>String(f.get(k)??'').trim();
const required=(f:FormData,k:string)=>{const v=text(f,k);if(!v)throw new Error(`${k} is required`);return v};
const number=(f:FormData,k:string,fallback=0)=>{const raw=text(f,k);if(!raw)return fallback;const v=Number(raw);if(!Number.isFinite(v))throw new Error(`${k} must be numeric`);return v};
const bool=(f:FormData,k:string)=>f.get(k)==='on';
const now=()=>new Date().toISOString();
const integerList=(f:FormData,k:string,min:number,max:number)=>{const raw=text(f,k);if(!raw)return[];const values=raw.split(',').map(v=>Number(v.trim()));if(values.some(v=>!Number.isInteger(v)||v<min||v>max))throw new Error(`${k} contains an invalid value`);return Array.from(new Set(values))};

async function owner(){return getCurrentOrganization(true)}
async function audit(ctx:Awaited<ReturnType<typeof owner>>,action:string,entityType:string,entityId:string|undefined,afterData:unknown){
  const {error}=await ctx.supabase.from('audit_logs').insert({organization_id:ctx.organizationId,actor_type:'USER',actor_id:ctx.userId,action,entity_type:entityType,entity_id:entityId??null,after_data:afterData??null});
  if(error)throw new Error(`Audit log failed: ${error.message}`);
}

export async function updateSystemControls(f:FormData){const ctx=await owner();const payload={global_kill_switch:bool(f,'global_kill_switch'),email_paused:bool(f,'email_paused'),whatsapp_ai_paused:bool(f,'whatsapp_ai_paused'),telegram_ai_paused:bool(f,'telegram_ai_paused'),agents_paused:bool(f,'agents_paused'),shadow_mode:bool(f,'shadow_mode'),updated_at:now()};const{error}=await ctx.supabase.from('system_controls').upsert({organization_id:ctx.organizationId,...payload},{onConflict:'organization_id'});if(error)throw error;await audit(ctx,'UPDATE_RUNTIME_CONTROLS','system_controls',ctx.organizationId,payload);revalidatePath('/system');revalidatePath('/')}

export async function createCampaign(f:FormData){const ctx=await owner();const payload={organization_id:ctx.organizationId,name:required(f,'name'),hunter_type:required(f,'hunter_type'),country_code:text(f,'country_code').toUpperCase()||null,city:text(f,'city')||null,industry:text(f,'industry')||null,target_count:Math.max(1,Math.round(number(f,'target_count',25))),status:'DRAFT',config:{}};const{data,error}=await ctx.supabase.from('campaigns').insert(payload).select('id').single();if(error)throw error;await audit(ctx,'CREATE_CAMPAIGN','campaign',data.id,payload);revalidatePath('/campaigns');revalidatePath('/hunters')}

export async function updateCampaign(f:FormData){const ctx=await owner();const id=required(f,'id');const allowed=['DRAFT','RUNNING','PAUSED','COMPLETED','FAILED'];const status=required(f,'status').toUpperCase();if(!allowed.includes(status))throw new Error('invalid campaign status');const payload={status,target_count:Math.max(1,Math.round(number(f,'target_count',25))),updated_at:now()};const{error}=await ctx.supabase.from('campaigns').update(payload).eq('organization_id',ctx.organizationId).eq('id',id);if(error)throw error;await audit(ctx,'UPDATE_CAMPAIGN','campaign',id,payload);revalidatePath('/campaigns');revalidatePath('/hunters')}

export async function updateOutreachPolicy(f:FormData){const ctx=await owner();const id=required(f,'id');const business_days=integerList(f,'business_days',0,6);const followup_delays_days=integerList(f,'followup_delays_days',1,90);const max_followups=Math.max(0,Math.round(number(f,'max_followups')));if(business_days.length===0)throw new Error('At least one business day is required');if(followup_delays_days.length<max_followups)throw new Error('Follow-up delays must cover every configured follow-up');const payload={enabled:bool(f,'enabled'),send_window_start:required(f,'send_window_start'),send_window_end:required(f,'send_window_end'),business_days,max_emails_per_day:Math.max(0,Math.round(number(f,'max_emails_per_day'))),max_emails_per_mailbox:Math.max(0,Math.round(number(f,'max_emails_per_mailbox'))),max_followups,followup_delays_days,manual_review_required:bool(f,'manual_review_required'),updated_at:now()};const{error}=await ctx.supabase.from('outreach_policies').update(payload).eq('organization_id',ctx.organizationId).eq('id',id);if(error)throw error;await audit(ctx,'UPDATE_OUTREACH_POLICY','outreach_policy',id,payload);revalidatePath('/outreach')}

export async function createMessageTemplate(f:FormData){const ctx=await owner();const payload={organization_id:ctx.organizationId,name:required(f,'name'),channel:required(f,'channel').toUpperCase(),purpose:required(f,'purpose').toUpperCase(),country_code:text(f,'country_code').toUpperCase()||null,language:required(f,'language'),subject:text(f,'subject')||null,body:required(f,'body'),enabled:true,is_default:bool(f,'is_default'),config:{}};const{data,error}=await ctx.supabase.from('message_templates').insert(payload).select('id').single();if(error)throw error;await audit(ctx,'CREATE_MESSAGE_TEMPLATE','message_template',data.id,{...payload,body:'[stored]'});revalidatePath('/messages')}

export async function updateMessageTemplate(f:FormData){const ctx=await owner();const id=required(f,'id');const payload={name:required(f,'name'),subject:text(f,'subject')||null,body:required(f,'body'),enabled:bool(f,'enabled'),is_default:bool(f,'is_default'),updated_at:now()};const{error}=await ctx.supabase.from('message_templates').update(payload).eq('organization_id',ctx.organizationId).eq('id',id);if(error)throw error;await audit(ctx,'UPDATE_MESSAGE_TEMPLATE','message_template',id,{...payload,body:'[stored]'});revalidatePath('/messages')}

function automationJsonArray(f:FormData,key:string,fallback:unknown[]=[]){
  const raw=text(f,key);
  if(!raw)return fallback;
  const parsed=JSON.parse(raw);
  if(!Array.isArray(parsed))throw new Error(`${key} must be a JSON array`);
  return parsed;
}
function automationJsonObject(f:FormData,key:string){
  const raw=text(f,key);
  if(!raw)return {};
  const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error(`${key} must be a JSON object`);
  return parsed as Record<string,unknown>;
}
const automationPriority=(f:FormData)=>Math.min(100,Math.max(0,Math.round(number(f,'priority',50))));
const automationService=()=>createSupabaseServiceClient();

export async function createAutomationRule(f:FormData){
  const ctx=await owner();
  const actionKey=required(f,'action_key').toUpperCase();
  const conditions=automationJsonArray(f,'conditions_json',[]);
  const actions=automationJsonArray(f,'actions_json',[{key:actionKey,config:{}}]);
  const requestKey=text(f,'request_key')||`automation-create:${crypto.randomUUID()}`;
  const {error}=await automationService().rpc('create_automation_rule_draft',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_name:required(f,'name'),
    p_trigger_key:required(f,'trigger_key').toUpperCase(),
    p_conditions:conditions,
    p_actions:actions,
    p_priority:automationPriority(f),
    p_config:automationJsonObject(f,'config_json'),
    p_owner_user_id:text(f,'owner_user_id')||ctx.userId,
    p_request_key:requestKey,
  });
  if(error)throw new Error(error.message);
  revalidatePath('/automations');
}

export async function updateAutomationRule(f:FormData){
  const ctx=await owner();
  const id=required(f,'id');
  const service=automationService();
  const {data:rule,error:readError}=await service.from('automation_rules')
    .select('id,name,owner_user_id,trigger_key,conditions,actions,priority,config,draft_revision,enabled')
    .eq('organization_id',ctx.organizationId).eq('id',id).single();
  if(readError||!rule)throw new Error(readError?.message||'Automation rule was not found');

  const nextPriority=automationPriority(f);
  if(nextPriority!==rule.priority){
    const {error}=await service.rpc('update_automation_rule_draft',{
      p_organization_id:ctx.organizationId,
      p_actor_user_id:ctx.userId,
      p_rule_id:id,
      p_expected_draft_revision:rule.draft_revision,
      p_name:rule.name,
      p_trigger_key:rule.trigger_key,
      p_conditions:rule.conditions,
      p_actions:rule.actions,
      p_priority:nextPriority,
      p_config:rule.config,
      p_owner_user_id:rule.owner_user_id||ctx.userId,
    });
    if(error)throw new Error(error.message);
  }

  const enabledRaw=text(f,'enabled').toLowerCase();
  const nextEnabled=['on','true','1','yes'].includes(enabledRaw);
  if(nextEnabled!==rule.enabled){
    const {error}=await service.rpc('set_automation_rule_enabled',{
      p_organization_id:ctx.organizationId,
      p_actor_user_id:ctx.userId,
      p_rule_id:id,
      p_enabled:nextEnabled,
    });
    if(error)throw new Error(error.message);
  }
  revalidatePath('/automations');
}

export async function saveAutomationRuleDraft(f:FormData){
  const ctx=await owner();
  const id=required(f,'id');
  const actions=automationJsonArray(f,'actions_json');
  if(actions.length===0)throw new Error('actions_json must contain at least one action');
  const {error}=await automationService().rpc('update_automation_rule_draft',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_rule_id:id,
    p_expected_draft_revision:Math.max(1,Math.round(number(f,'draft_revision',1))),
    p_name:required(f,'name'),
    p_trigger_key:required(f,'trigger_key').toUpperCase(),
    p_conditions:automationJsonArray(f,'conditions_json',[]),
    p_actions:actions,
    p_priority:automationPriority(f),
    p_config:automationJsonObject(f,'config_json'),
    p_owner_user_id:text(f,'owner_user_id')||ctx.userId,
  });
  if(error)throw new Error(error.message);
  revalidatePath('/automations');
}

export async function publishAutomationRule(f:FormData){
  const ctx=await owner();
  const {error}=await automationService().rpc('publish_automation_rule',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_rule_id:required(f,'id'),
    p_expected_draft_revision:Math.max(1,Math.round(number(f,'draft_revision',1))),
  });
  if(error)throw new Error(error.message);
  revalidatePath('/automations');
}

export async function setAutomationRuleEnabled(f:FormData){
  const ctx=await owner();
  const enabled=required(f,'enabled')==='true';
  const {error}=await automationService().rpc('set_automation_rule_enabled',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_rule_id:required(f,'id'),
    p_enabled:enabled,
  });
  if(error)throw new Error(error.message);
  revalidatePath('/automations');
}

export async function updateIntegration(f:FormData){const ctx=await owner();const id=required(f,'id');const payload={enabled:bool(f,'enabled'),account_label:text(f,'account_label')||null,updated_at:now()};const{error}=await ctx.supabase.from('integration_connections').update(payload).eq('organization_id',ctx.organizationId).eq('id',id);if(error)throw error;await audit(ctx,'UPDATE_INTEGRATION','integration',id,payload);revalidatePath('/integrations')}

export async function updateOrganizationSettings(f:FormData){const ctx=await owner();const payload={organization_id:ctx.organizationId,brand_name:required(f,'brand_name'),operator_language:required(f,'operator_language'),default_customer_language:required(f,'default_customer_language'),notification_email:text(f,'notification_email')||null,updated_at:now()};const{error}=await ctx.supabase.from('organization_settings').upsert(payload,{onConflict:'organization_id'});if(error)throw error;await audit(ctx,'UPDATE_ORGANIZATION_SETTINGS','organization_settings',ctx.organizationId,payload);revalidatePath('/settings')}

export async function createKnowledge(f:FormData){const ctx=await owner();const key=required(f,'knowledge_key');const content=required(f,'content');const{data,error}=await ctx.supabase.rpc('publish_knowledge_version',{p_organization_id:ctx.organizationId,p_knowledge_key:key,p_payload:{text:content}});if(error)throw error;const published=Array.isArray(data)?data[0]:data;if(!published?.id||!published?.version)throw new Error('Knowledge publisher returned no version');revalidatePath('/knowledge')}

export async function createPromptVersion(f:FormData){const ctx=await owner();const agent=required(f,'agent_name');const promptText=required(f,'prompt_text');const{data,error}=await ctx.supabase.rpc('stage_prompt_version',{p_organization_id:ctx.organizationId,p_agent_name:agent,p_prompt_text:promptText});if(error)throw error;const published=Array.isArray(data)?data[0]:data;if(!published?.id||!published?.version)throw new Error('Prompt staging returned no version');revalidatePath('/agents')}

export async function updateLead(f:FormData){const ctx=await owner();const id=required(f,'id');const statuses=['NEW','AUDITED','QUALIFIED','READY_TO_CONTACT','CONTACTED','REPLIED','INTERESTED','HOT','HUMAN','WON','LOST','DO_NOT_CONTACT'];const modes=['AUTO','PAUSED','HUMAN'];const status=required(f,'status');const agent_mode=required(f,'agent_mode');if(!statuses.includes(status)||!modes.includes(agent_mode))throw new Error('invalid lead state');const payload={status,agent_mode,recommended_offer:text(f,'recommended_offer')||null,updated_at:now()};const{error}=await ctx.supabase.from('leads').update(payload).eq('organization_id',ctx.organizationId).eq('id',id);if(error)throw error;await audit(ctx,'UPDATE_LEAD','lead',id,payload);revalidatePath('/leads');revalidatePath('/hot-leads')}

export async function addSuppression(f:FormData){const ctx=await owner();const email=text(f,'email')||null,phone=text(f,'phone')||null,domain=text(f,'domain')||null;if(!email&&!phone&&!domain)throw new Error('email, phone or domain required');const payload={organization_id:ctx.organizationId,email,phone,domain,reason:text(f,'reason')||'MANUAL',source:'CONTROL_CENTER'};const{data,error}=await ctx.supabase.from('suppression_list').insert(payload).select('id').single();if(error)throw error;await audit(ctx,'ADD_SUPPRESSION','suppression',data.id,payload);revalidatePath('/suppression')}

export async function updatePortfolioItem(f:FormData){const ctx=await owner();const id=required(f,'id');const payload={title:required(f,'title'),summary:text(f,'summary')||null,public_url:text(f,'public_url')||null,approved:bool(f,'approved'),updated_at:now()};const{error}=await ctx.supabase.from('portfolio_items').update(payload).eq('organization_id',ctx.organizationId).eq('id',id);if(error)throw error;await audit(ctx,'UPDATE_PORTFOLIO_ITEM','portfolio_item',id,payload);revalidatePath('/portfolio')}

export async function updatePreviewTemplate(f:FormData){const ctx=await owner();const id=required(f,'id');const payload={name:required(f,'name'),active:bool(f,'active'),quality_tier:required(f,'quality_tier'),updated_at:now()};const{error}=await ctx.supabase.from('preview_templates').update(payload).eq('organization_id',ctx.organizationId).eq('id',id);if(error)throw error;await audit(ctx,'UPDATE_PREVIEW_TEMPLATE','preview_template',id,payload);revalidatePath('/preview-studio')}

const approvalService=()=>createSupabaseServiceClient();

export async function approveMessage(f:FormData){
  const ctx=await getCurrentOrganization();
  const id=required(f,'id');
  const {error}=await approvalService().rpc('decide_message_approval',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_message_id:id,
    p_decision:'APPROVE',
    p_reason:null,
    p_request_key:text(f,'request_key')||`approval:approve:${id}:${crypto.randomUUID()}`,
  });
  if(error)throw new Error(error.message);
  revalidatePath('/approvals');
  revalidatePath('/conversations');
}

export async function rejectMessage(f:FormData){
  const ctx=await getCurrentOrganization();
  const id=required(f,'id');
  const reason=required(f,'reason');
  const {error}=await approvalService().rpc('decide_message_approval',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_message_id:id,
    p_decision:'REJECT',
    p_reason:reason,
    p_request_key:text(f,'request_key')||`approval:reject:${id}:${crypto.randomUUID()}`,
  });
  if(error)throw new Error(error.message);
  revalidatePath('/approvals');
  revalidatePath('/conversations');
}

export async function delegateMessageApproval(f:FormData){
  const ctx=await getCurrentOrganization();
  const id=required(f,'id');
  const {error}=await approvalService().rpc('delegate_message_approval',{
    p_organization_id:ctx.organizationId,
    p_actor_user_id:ctx.userId,
    p_message_id:id,
    p_delegate_to_user_id:required(f,'delegate_user_id'),
    p_request_key:text(f,'request_key')||`approval:delegate:${id}:${crypto.randomUUID()}`,
  });
  if(error)throw new Error(error.message);
  revalidatePath('/approvals');
}

export async function reconcileApprovalDeadlines(){
  const ctx=await owner();
  const {error}=await approvalService().rpc('reconcile_due_message_approvals',{
    p_organization_id:ctx.organizationId,
    p_limit:100,
  });
  if(error)throw new Error(error.message);
  revalidatePath('/approvals');
  revalidatePath('/conversations');
}

export async function updateConversation(f:FormData){const ctx=await owner();const id=required(f,'id');const stages=['NEW','ACTIVE','CLOSING','WAITING_CUSTOMER','UNANSWERED','HOT','NEEDS_HUMAN','FOLLOW_UP_DUE','WON','LOST','DO_NOT_CONTACT','SPAM','PAUSED'];const stage=required(f,'stage');if(!stages.includes(stage))throw new Error('invalid conversation stage');const requires_human=bool(f,'requires_human');const payload={stage,requires_human,awaiting_party:requires_human?'HUMAN':stage==='WAITING_CUSTOMER'?'CUSTOMER':'NONE',priority:Math.min(100,Math.max(0,Math.round(number(f,'priority',50)))),updated_at:now()};const{error}=await ctx.supabase.from('sales_conversations').update(payload).eq('organization_id',ctx.organizationId).eq('id',id);if(error)throw error;await audit(ctx,'UPDATE_CONVERSATION','sales_conversation',id,payload);revalidatePath('/conversations');revalidatePath(`/conversations/${id}`)}

export async function releaseHumanTakeover(f:FormData){const ctx=await owner();const id=required(f,'id');const{data,error}=await ctx.supabase.rpc('release_human_takeover',{p_organization_id:ctx.organizationId,p_conversation_id:id});if(error)throw error;const result=data&&typeof data==='object'&&!Array.isArray(data)?data as Record<string,unknown>:{};if(result.released!==true&&result.reason!=='ALREADY_AUTOMATED')throw new Error('Human takeover release was not confirmed');revalidatePath('/leads');revalidatePath('/hot-leads');revalidatePath('/conversations');revalidatePath(`/conversations/${id}`)}
