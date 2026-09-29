import { AutomationBuilder } from '@/components/automations/AutomationBuilder';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic='force-dynamic';

export default async function AutomationsPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();

  const [
    rulesResult,
    catalogResult,
    conditionFactsResult,
    actionRegistryResult,
    versionsResult,
    runsResult,
  ]=await Promise.all([
    supabase.from('automation_rules')
      .select('id,name,owner_user_id,trigger_key,action_key,conditions,actions,enabled,priority,config,publication_state,draft_revision,published_revision,latest_published_version,execution_state,last_published_at,created_at,updated_at')
      .eq('organization_id',organizationId)
      .order('priority',{ascending:false}),
    supabase.from('automation_trigger_catalog')
      .select('trigger_key,family,source_kind,event_name,availability,description')
      .order('family',{ascending:true})
      .order('trigger_key',{ascending:true}),
    supabase.from('automation_condition_fact_catalog')
      .select('fact_key,subject_type,data_type,operators,nullable,description')
      .order('subject_type',{ascending:true})
      .order('fact_key',{ascending:true}),
    supabase.from('tool_action_registry')
      .select('action_key,tool_key,scope_type,cost_class,side_effect_class,approval_requirement,availability,description')
      .order('tool_key',{ascending:true})
      .order('action_key',{ascending:true}),
    supabase.from('automation_rule_versions')
      .select('id,automation_rule_id,version,draft_revision,name,trigger_key,conditions,actions,priority,config,published_at')
      .eq('organization_id',organizationId)
      .order('published_at',{ascending:false})
      .limit(200),
    supabase.from('automation_runs')
      .select('id,automation_rule_id,rule_version,trigger_key,source_event_key,subject_type,subject_id,status,scheduled_at,started_at,completed_at,last_error,compensation_state,created_at')
      .eq('organization_id',organizationId)
      .order('created_at',{ascending:false})
      .limit(100),
  ]);

  for(const result of [
    rulesResult,
    catalogResult,
    conditionFactsResult,
    actionRegistryResult,
    versionsResult,
    runsResult,
  ]){
    if(result.error)throw new Error(result.error.message);
  }

  const runs=runsResult.data??[];
  const runIds=runs.map(run=>run.id);
  const runActionsResult=runIds.length
    ? await supabase.from('automation_run_actions')
        .select('id,automation_run_id,action_index,action_key,status,attempt_count,max_attempts,last_error,compensation_status,created_at,updated_at')
        .eq('organization_id',organizationId)
        .in('automation_run_id',runIds)
        .order('created_at',{ascending:false})
        .limit(500)
    : {data:[],error:null};

  if(runActionsResult.error)throw new Error(runActionsResult.error.message);

  return <AutomationBuilder
    editable={role==='OWNER'}
    rules={rulesResult.data??[]}
    triggers={catalogResult.data??[]}
    facts={conditionFactsResult.data??[]}
    actions={actionRegistryResult.data??[]}
    versions={versionsResult.data??[]}
    runs={runs}
    runActions={runActionsResult.data??[]}
  />;
}
