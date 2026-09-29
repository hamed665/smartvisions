\set ON_ERROR_STOP on

create temp table automation_runtime_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.usage_events) as usage_count,
  (select count(*) from public.followup_jobs) as followup_count;

create temp table automation_runtime_results(
  label text primary key,
  rule_id uuid,
  run_id uuid
);
grant select,insert,update on automation_runtime_side_effect_baseline,automation_runtime_results to service_role;

-- The compact CI lineage does not fully reconstruct the legacy service-role
-- table grants that are already present in Production. AUTO-RUNTIME MARK_HOT
-- uses the existing governed Sales Scoring authority and needs the same
-- service-role Lead mutation authority that Production already has.
grant select,insert,update on public.leads to service_role;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $authenticated_runtime_boundary$
begin
  if has_table_privilege('authenticated','public.automation_runs','INSERT')
     or has_table_privilege('authenticated','public.automation_runs','UPDATE')
     or has_table_privilege('authenticated','public.automation_run_actions','INSERT')
     or has_table_privilege('authenticated','public.automation_run_actions','UPDATE')
  then
    raise exception 'Authenticated browser can mutate Automation runtime state';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.enqueue_automation_runtime_event(uuid,text,text,text,uuid,jsonb,timestamptz)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.claim_automation_runtime_actions(text,integer,integer)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.pause_automation_rule_from_runtime(uuid,uuid,text)',
       'EXECUTE'
     )
  then
    raise exception 'Trusted Automation runtime command is browser executable';
  end if;
end;
$authenticated_runtime_boundary$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $runtime_registry_and_config_contract$
begin
  if (select count(*) from public.tool_action_registry where availability='AVAILABLE')<>6 then
    raise exception 'AUTO-RUNTIME did not close all six current action contracts';
  end if;

  if not exists(
    select 1 from public.automation_trigger_catalog
    where trigger_key='SEGMENT_MEMBER_ENTERED'
      and availability='DEPENDENCY_PENDING'
      and required_work_package='AUTO-RUNTIME'
  ) then
    raise exception 'SEGMENT_MEMBER_ENTERED was falsely promoted without a producer';
  end if;

  begin
    perform public.validate_automation_runtime_action_configs(
      '[{"key":"MARK_HOT","config":{}}]'::jsonb
    );
    raise exception 'MARK_HOT without minimumScore was accepted';
  exception when others then
    if sqlerrm not like 'MARK_HOT requires numeric minimumScore%' then raise; end if;
  end;

  begin
    perform public.validate_automation_runtime_action_configs(
      '[{"key":"SEND_FOLLOWUP","config":{"body":"hello"}}]'::jsonb
    );
    raise exception 'SEND_FOLLOWUP without sendContext was accepted';
  exception when others then
    if sqlerrm not like 'SEND_FOLLOWUP runtime config requires body and canonical sendContext%' then raise; end if;
  end;
end;
$runtime_registry_and_config_contract$;

do $create_publish_enable_preview_runtime$
declare
  v_rule uuid;
  v_version integer;
  v_enabled boolean;
  v_state text;
  v_result jsonb;
  v_run uuid;
begin
  select resolved_rule_id into v_rule
  from public.create_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Runtime preview smoke',
    'HOT_LEAD',
    '[]'::jsonb,
    '[{"key":"GENERATE_PREVIEW","config":{}}]'::jsonb,
    91,
    '{"runtimeSmoke":true}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    'automation-runtime-preview-draft'
  );

  select published_version into v_version
  from public.publish_automation_rule(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule,1
  );
  if v_version<>1 then raise exception 'Runtime preview publish failed'; end if;

  select resolved_enabled,resolved_execution_state into v_enabled,v_state
  from public.set_automation_rule_enabled(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule,true
  );
  if not v_enabled or v_state<>'READY' then raise exception 'Runtime preview rule did not become READY'; end if;

  v_result:=public.enqueue_automation_runtime_event(
    '00000000-0000-0000-0000-000000000c01',
    'HOT_LEAD','runtime-smoke.preview.1','LEAD',
    '00000000-0000-0000-0000-00000000c150',
    '{"source":"CONTROLLED_TEST"}'::jsonb,now()
  );
  if coalesce((v_result->>'enqueuedRuns')::integer,0)<>1 then
    raise exception 'Runtime preview event did not enqueue exactly one run';
  end if;

  v_result:=public.enqueue_automation_runtime_event(
    '00000000-0000-0000-0000-000000000c01',
    'HOT_LEAD','runtime-smoke.preview.1','LEAD',
    '00000000-0000-0000-0000-00000000c150',
    '{"source":"CONTROLLED_TEST"}'::jsonb,now()
  );
  if coalesce((v_result->>'replayedRuns')::integer,0)<1 then
    raise exception 'Runtime event idempotency replay was not detected';
  end if;

  select id into v_run
  from public.automation_runs
  where automation_rule_id=v_rule
    and source_event_key='runtime-smoke.preview.1';

  insert into automation_runtime_results values('preview',v_rule,v_run);
end;
$create_publish_enable_preview_runtime$;

do $direct_runtime_mutation_is_blocked$
declare
  v_run uuid;
begin
  select run_id into v_run from automation_runtime_results where label='preview';
  begin
    update public.automation_runs set priority=1 where id=v_run;
    raise exception 'Service role bypassed governed runtime mutation boundary';
  exception when others then
    if sqlerrm not like 'Automation runtime state requires the governed runtime boundary%' then
      raise;
    end if;
  end;
end;
$direct_runtime_mutation_is_blocked$;

do $claim_requires_verified_success_and_completes_run$
declare
  v_run uuid;
  v_action uuid;
  v_result jsonb;
begin
  select run_id into v_run from automation_runtime_results where label='preview';

  select id into v_action
  from public.claim_automation_runtime_actions('runtime-smoke-worker-a',10,120)
  where automation_run_id=v_run;

  if v_action is null then raise exception 'Runtime action was not claimed'; end if;

  begin
    perform public.complete_automation_runtime_action(
      v_action,'runtime-smoke-worker-a','SUCCEEDED',
      '{"previewId":"controlled"}'::jsonb,
      '{"verified":false}'::jsonb,null,false,null
    );
    raise exception 'Runtime accepted unverified success';
  exception when others then
    if sqlerrm not like 'Automation runtime success requires verified outcome evidence%' then raise; end if;
  end;

  v_result:=public.complete_automation_runtime_action(
    v_action,'runtime-smoke-worker-a','SUCCEEDED',
    '{"previewId":"controlled"}'::jsonb,
    '{"verified":true,"source":"CONTROLLED_TEST"}'::jsonb,
    null,false,null
  );

  if not exists(
    select 1 from public.automation_runs
    where id=v_run and status='COMPLETED' and completed_at is not null
  ) then
    raise exception 'Verified runtime action did not complete its run';
  end if;
end;
$claim_requires_verified_success_and_completes_run$;

do $runtime_kill_switch_blocks_claim$
declare
  v_rule uuid;
  v_run uuid;
  v_action uuid;
begin
  select rule_id into v_rule
  from automation_runtime_results
  where label='preview';

  update public.system_controls
  set global_kill_switch=true
  where organization_id='00000000-0000-0000-0000-000000000c01';

  perform public.enqueue_automation_runtime_event(
    '00000000-0000-0000-0000-000000000c01',
    'HOT_LEAD','runtime-smoke.kill-switch.1','LEAD',
    '00000000-0000-0000-0000-00000000c150','{}'::jsonb,now()
  );

  select id into v_run
  from public.automation_runs
  where automation_rule_id=v_rule
    and source_event_key='runtime-smoke.kill-switch.1';

  select id into v_action
  from public.claim_automation_runtime_actions('runtime-smoke-worker-kill',10,120)
  where automation_run_id=v_run;

  if v_action is not null then
    raise exception 'Global Kill Switch did not block Automation runtime claim';
  end if;

  update public.system_controls
  set global_kill_switch=false
  where organization_id='00000000-0000-0000-0000-000000000c01';

  select id into v_action
  from public.claim_automation_runtime_actions('runtime-smoke-worker-resume',10,120)
  where automation_run_id=v_run;

  if v_action is null then
    raise exception 'Automation runtime did not resume after Kill Switch release';
  end if;

  perform public.complete_automation_runtime_action(
    v_action,'runtime-smoke-worker-resume','CANCELLED',
    '{}'::jsonb,'{"verified":false}'::jsonb,
    'CONTROLLED_TEST_CLEANUP',false,null
  );
end;
$runtime_kill_switch_blocks_claim$;

do $ordered_actions_dlq_and_compensation$
declare
  v_rule uuid;
  v_run uuid;
  v_first uuid;
  v_second uuid;
begin
  select resolved_rule_id into v_rule
  from public.create_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Runtime compensation smoke','HOT_LEAD','[]'::jsonb,
    '[{"key":"GENERATE_PREVIEW","config":{}},{"key":"MARK_HOT","config":{"minimumScore":80}}]'::jsonb,
    92,'{"runtimeSmoke":true}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    'automation-runtime-compensation-draft'
  );
  perform * from public.publish_automation_rule(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',v_rule,1
  );
  perform * from public.set_automation_rule_enabled(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',v_rule,true
  );

  perform public.enqueue_automation_runtime_event(
    '00000000-0000-0000-0000-000000000c01',
    'HOT_LEAD','runtime-smoke.compensation.1','LEAD',
    '00000000-0000-0000-0000-00000000c150','{}'::jsonb,now()
  );
  select id into v_run from public.automation_runs
  where automation_rule_id=v_rule and source_event_key='runtime-smoke.compensation.1';

  select id into v_first
  from public.claim_automation_runtime_actions('runtime-smoke-worker-b',10,120)
  where automation_run_id=v_run and action_index=1;

  if v_first is null then raise exception 'First ordered runtime action was not claimable'; end if;
  if exists(
    select 1 from public.automation_run_actions
    where automation_run_id=v_run and action_index=2 and status='CLAIMED'
  ) then
    raise exception 'Second runtime action bypassed ordered execution';
  end if;

  perform public.complete_automation_runtime_action(
    v_first,'runtime-smoke-worker-b','SUCCEEDED','{}'::jsonb,
    '{"verified":true}'::jsonb,null,false,null
  );

  select id into v_second
  from public.claim_automation_runtime_actions('runtime-smoke-worker-c',10,120)
  where automation_run_id=v_run and action_index=2;
  if v_second is null then raise exception 'Second ordered runtime action was not released'; end if;

  perform public.complete_automation_runtime_action(
    v_second,'runtime-smoke-worker-c','FAILED','{}'::jsonb,
    '{"verified":false}'::jsonb,'CONTROLLED_DOWNSTREAM_FAILURE',false,null
  );

  if not exists(
    select 1 from public.automation_run_actions
    where id=v_first and compensation_status='REQUIRED'
  ) or not exists(
    select 1 from public.automation_runs
    where id=v_run and status='DEAD_LETTER' and compensation_state='REQUIRED'
  ) then
    raise exception 'DLQ failure did not require compensation for prior side effect';
  end if;
end;
$ordered_actions_dlq_and_compensation$;

do $system_pause_command_is_idempotent$
declare
  v_rule uuid;
  v_result jsonb;
begin
  select resolved_rule_id into v_rule
  from public.create_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Runtime pause smoke','HOT_LEAD','[]'::jsonb,
    '[{"key":"PAUSE_AUTOMATION","config":{}}]'::jsonb,
    90,'{}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    'automation-runtime-pause-draft'
  );
  perform * from public.publish_automation_rule(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',v_rule,1
  );
  perform * from public.set_automation_rule_enabled(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',v_rule,true
  );

  v_result:=public.pause_automation_rule_from_runtime(
    '00000000-0000-0000-0000-000000000c01',
    v_rule,'runtime-smoke.pause.1'
  );
  if (v_result->>'executionState')<>'DISABLED'
     or coalesce((v_result->>'enabled')::boolean,true)
  then
    raise exception 'Runtime system pause command failed';
  end if;

  v_result:=public.pause_automation_rule_from_runtime(
    '00000000-0000-0000-0000-000000000c01',
    v_rule,'runtime-smoke.pause.1'
  );
  if coalesce((v_result->>'replayed')::boolean,false) is distinct from true then
    raise exception 'Runtime pause replay failed';
  end if;

  if not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and entity_type='automation_rule'
      and entity_id=v_rule::text
      and action='AUTOMATION_RULE_PAUSED_BY_RUNTIME'
      and actor_type='SYSTEM'
      and actor_id='automation_runtime'
  ) then
    raise exception 'Runtime pause SYSTEM audit evidence is missing';
  end if;
end;
$system_pause_command_is_idempotent$;

do $governed_mark_hot_command$
declare
  v_revision integer;
  v_score jsonb;
  v_hot jsonb;
begin
  select scoring_revision into v_revision
  from public.leads
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and id='00000000-0000-0000-0000-00000000c150';

  if v_revision is null then raise exception 'Controlled runtime Lead fixture is missing'; end if;

  v_score:=public.record_crm_lead_deterministic_score(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c150',
    85,80,75,70,
    '["controlled runtime score"]'::jsonb,
    'CRM_DETERMINISTIC_V1','runtime-smoke-v1',
    '{"source":"CONTROLLED_TEST"}'::jsonb,
    v_revision,'runtime-smoke-score-1'
  );

  v_hot:=public.mark_crm_lead_hot_from_automation(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c150',
    80,'runtime-smoke-mark-hot-1'
  );
  if v_hot->>'status'<>'HOT' or (v_hot->>'effectiveScore')::integer<80 then
    raise exception 'Runtime MARK_HOT did not respect governed scoring evidence';
  end if;

  v_hot:=public.mark_crm_lead_hot_from_automation(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c150',
    80,'runtime-smoke-mark-hot-1'
  );
  if coalesce((v_hot->>'replayed')::boolean,false) is distinct from true then
    raise exception 'Runtime MARK_HOT replay failed';
  end if;
end;
$governed_mark_hot_command$;

do $approval_waits_for_shadow_release$
declare
  v_rule uuid;
  v_run uuid;
  v_action uuid;
  v_message jsonb;
  v_message_id uuid;
  v_reconcile jsonb;
begin
  select resolved_rule_id into v_rule
  from public.create_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Runtime send smoke','MESSAGE_RECEIVED','[]'::jsonb,
    '[{"key":"SEND_FOLLOWUP","config":{"body":"Controlled runtime follow-up","sendContext":{"to":"+96890000000","market_code":"OM"}}}]'::jsonb,
    89,'{}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    'automation-runtime-send-draft'
  );
  perform * from public.publish_automation_rule(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',v_rule,1
  );
  perform * from public.set_automation_rule_enabled(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',v_rule,true
  );

  perform public.enqueue_automation_runtime_event(
    '00000000-0000-0000-0000-000000000c01',
    'MESSAGE_RECEIVED','runtime-smoke.send.1','CONVERSATION',
    '00000000-0000-0000-0000-00000000c160','{}'::jsonb,now()
  );
  select id into v_run from public.automation_runs
  where automation_rule_id=v_rule and source_event_key='runtime-smoke.send.1';

  select id into v_action
  from public.claim_automation_runtime_actions('runtime-smoke-worker-send',10,120)
  where automation_run_id=v_run;
  if v_action is null then raise exception 'Runtime SEND_FOLLOWUP was not claimable'; end if;

  v_message:=public.create_automation_approval_message(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c160',
    '00000000-0000-0000-0000-00000000c150',
    'WHATSAPP','Controlled runtime follow-up',
    '{"to":"+96890000000","market_code":"OM"}'::jsonb,
    'runtime-smoke-send-artifact-1'
  );
  v_message_id:=(v_message->>'messageId')::uuid;

  perform public.complete_automation_runtime_action(
    v_action,'runtime-smoke-worker-send','WAITING_APPROVAL',
    jsonb_build_object('messageId',v_message_id),
    '{"verified":true,"artifactPersisted":true}'::jsonb,
    null,false,null
  );

  perform public.decide_message_approval(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_message_id,'APPROVE',null,'runtime-smoke-send-approve-1'
  );

  v_reconcile:=public.reconcile_automation_runtime_waiting(100);

  if not exists(
    select 1 from public.automation_run_actions
    where id=v_action
      and status='WAITING_RELEASE'
      and output_payload->>'messageId'=v_message_id::text
  ) then
    raise exception 'Approved SEND_FOLLOWUP did not remain blocked behind Shadow release';
  end if;

  if exists(
    select 1 from public.conversation_messages
    where id=v_message_id
      and status='SENT'
  ) then
    raise exception 'Runtime smoke caused a provider send under Shadow Mode';
  end if;

  -- Waiting for human approval / Shadow release is an external durable wait,
  -- not active execution time. It must not be DLQ'd by the short run budget.
  perform public.reap_automation_runtime_timeouts(
    100,
    now()+interval '2 hours'
  );
  if not exists(
    select 1 from public.automation_run_actions
    where id=v_action and status='WAITING_RELEASE'
  ) then
    raise exception 'Shadow wait was incorrectly dead-lettered by runtime deadline';
  end if;

  update public.system_controls
  set shadow_mode=false
  where organization_id='00000000-0000-0000-0000-000000000c01';

  perform public.reconcile_automation_runtime_waiting(100);

  if not exists(
    select 1
    from public.automation_run_actions a
    join public.automation_runs r on r.id=a.automation_run_id
    where a.id=v_action
      and a.status='PENDING'
      and r.deadline_at>now()
  ) then
    raise exception 'Released approval did not restore active runtime deadline budget';
  end if;

  update public.system_controls
  set shadow_mode=true
  where organization_id='00000000-0000-0000-0000-000000000c01';

  perform public.pause_automation_rule_from_runtime(
    '00000000-0000-0000-0000-000000000c01',
    v_rule,'runtime-smoke-send-cleanup-1'
  );
  perform public.reconcile_automation_runtime_waiting(100);
end;
$approval_waits_for_shadow_release$;

do $scheduled_approval_deadline_reconciliation$
declare
  v_message jsonb;
  v_message_id uuid;
  v_result jsonb;
begin
  v_message:=public.create_automation_approval_message(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c160',
    '00000000-0000-0000-0000-00000000c150',
    'WHATSAPP','Controlled runtime expiry',
    '{"to":"+96890000000","market_code":"OM"}'::jsonb,
    'runtime-smoke-approval-expiry-1'
  );
  v_message_id:=(v_message->>'messageId')::uuid;

  perform set_config('app.message_approval_mutation','allowed',true);
  update public.conversation_messages
  set
    approval_escalates_at=now()-interval '2 minutes',
    approval_expires_at=now()-interval '1 minute'
  where id=v_message_id;
  perform set_config('app.message_approval_mutation','0',true);

  v_result:=public.reconcile_automation_runtime_approval_deadlines(100);

  if coalesce((v_result->>'expired')::integer,0)<1 then
    raise exception 'AUTO-RUNTIME did not schedule due approval expiry reconciliation';
  end if;

  if not exists(
    select 1 from public.conversation_messages
    where id=v_message_id
      and status='BLOCKED'
      and approval_decision='EXPIRED'
      and requires_approval=false
  ) then
    raise exception 'Scheduled approval expiry did not fail closed';
  end if;
end;
$scheduled_approval_deadline_reconciliation$;

do $runtime_security_and_side_effects$
declare
  v_base automation_runtime_side_effect_baseline%rowtype;
begin
  if not (
    select relrowsecurity from pg_class
    where oid='public.automation_runs'::regclass
  ) or not (
    select relrowsecurity from pg_class
    where oid='public.automation_run_actions'::regclass
  ) then
    raise exception 'Automation runtime RLS is not enabled';
  end if;

  if exists(
    select 1
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'enqueue_automation_runtime_event',
        'claim_automation_runtime_actions',
        'complete_automation_runtime_action',
        'reconcile_automation_runtime_approval_deadlines',
        'reconcile_automation_runtime_waiting',
        'reap_automation_runtime_timeouts',
        'resolve_automation_runtime_compensation',
        'create_automation_operator_brief',
        'mark_crm_lead_hot_from_automation',
        'create_automation_approval_message',
        'pause_automation_rule_from_runtime'
      )
      and p.prosecdef
  ) then
    raise exception 'Automation runtime unexpectedly uses SECURITY DEFINER';
  end if;

  if not has_function_privilege(
       'service_role',
       'public.claim_automation_runtime_actions(text,integer,integer)','EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.complete_automation_runtime_action(uuid,text,text,jsonb,jsonb,text,boolean,integer)','EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.reconcile_automation_runtime_approval_deadlines(integer)','EXECUTE'
     )
  then
    raise exception 'Automation runtime service-role grants are incomplete';
  end if;

  select * into v_base from automation_runtime_side_effect_baseline;
  if (select count(*) from public.outreach_messages)<>v_base.outreach_count
     or (select count(*) from public.usage_events)<>v_base.usage_count
     or (select count(*) from public.followup_jobs)<>v_base.followup_count
  then
    raise exception 'AUTO-RUNTIME caused provider/outreach/follow-up side effects in controlled SQL acceptance';
  end if;
end;
$runtime_security_and_side_effects$;

reset role;
