\set ON_ERROR_STOP on

create temp table sales_next_action_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as message_count;

insert into public.leads(
  id,organization_id,business_id,status,opportunity_score,intent_score,updated_at
) values
  (
    '20000000-0000-0000-0000-000000000c91',
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    'REPLIED',
    75,
    20,
    now()-interval '10 days'
  ),
  (
    '20000000-0000-0000-0000-000000000c92',
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c02',
    'QUALIFIED',
    80,
    10,
    now()-interval '10 days'
  );

insert into public.followup_jobs(
  organization_id,lead_id,sequence,scheduled_at,status,channel
) values (
  '00000000-0000-0000-0000-000000000c01',
  '20000000-0000-0000-0000-000000000c91',
  91,
  now()-interval '8 days',
  'PENDING',
  'EMAIL'
);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $next_action_deal_fixture$
declare
  v_pipeline uuid;
  v_stage uuid;
begin
  select id into v_pipeline
  from public.crm_pipelines
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and name='Forecast Pipeline V2';

  select id into v_stage
  from public.crm_pipeline_stages
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and pipeline_id=v_pipeline
    and position=1;

  if v_pipeline is null or v_stage is null then
    raise exception 'SALES-NEXT-ACTION Deal/Pipeline fixture is missing';
  end if;

  insert into public.crm_deals(
    id,organization_id,business_id,lead_id,pipeline_id,stage_id,
    title,amount,currency,expected_close_at,owner_user_id,
    source_type,source_id,request_key,creator_type,created_by_user_id
  ) values (
    '60000000-0000-0000-0000-000000000c92',
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c02',
    '20000000-0000-0000-0000-000000000c92',
    v_pipeline,
    v_stage,
    'Next Action stale Deal fixture',
    2000,
    'OMR',
    now()+interval '30 days',
    '00000000-0000-0000-0000-00000000c001',
    'MANUAL',
    null,
    'fixture-next-action-deal',
    'USER',
    '00000000-0000-0000-0000-00000000c001'
  );
end;
$next_action_deal_fixture$;

do $next_action_direct_fabrication_guard$
begin
  begin
    insert into public.crm_tasks(
      organization_id,business_id,lead_id,task_type,title,status,priority,
      assignee_user_id,due_at,reminder_at,source_type,source_id,
      request_key,creator_type,created_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c01',
      '20000000-0000-0000-0000-000000000c91',
      'FOLLOW_UP',
      'Fabricated next action',
      'OPEN',
      'NORMAL',
      '00000000-0000-0000-0000-00000000c001',
      now()+interval '1 day',
      now()+interval '20 hours',
      'NEXT_ACTION',
      'LEAD:20000000-0000-0000-0000-000000000c91:STALE',
      'fixture-next-action-direct-fabrication',
      'USER',
      '00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Browser fabricated NEXT_ACTION Task directly';
  exception when others then
    if sqlerrm not like 'NEXT_ACTION CRM task must be accepted through governed candidate materialization%' then
      raise;
    end if;
  end;
end;
$next_action_direct_fabrication_guard$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set session_replication_role=replica;
update public.crm_deals
set updated_at=now()-interval '10 days'
where id='60000000-0000-0000-0000-000000000c92';
set session_replication_role=origin;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $next_action_derived_queue$
begin
  if not exists (
    select 1
    from public.get_crm_next_actions(
      '00000000-0000-0000-0000-000000000c01',
      72,
      null,
      200
    )
    where candidate_kind='LEAD_STALE'
      and source_entity_id='20000000-0000-0000-0000-000000000c91'
      and suggested_task_type='FOLLOW_UP'
      and accepted=false
  ) then
    raise exception 'SALES-NEXT-ACTION stale Lead was not derived';
  end if;

  if not exists (
    select 1
    from public.get_crm_next_actions(
      '00000000-0000-0000-0000-000000000c01',
      72,
      null,
      200
    )
    where candidate_kind='DEAL_STALE'
      and source_entity_id='60000000-0000-0000-0000-000000000c92'
      and assignee_user_id='00000000-0000-0000-0000-00000000c001'
      and accepted=false
  ) then
    raise exception 'SALES-NEXT-ACTION stale Deal was not derived';
  end if;

  if exists (
    select 1
    from public.get_crm_next_actions(
      '00000000-0000-0000-0000-000000000c01',
      72,
      null,
      200
    )
    where candidate_kind='LEAD_STALE'
      and source_entity_id='20000000-0000-0000-0000-000000000c92'
  ) then
    raise exception 'Lead candidate was not superseded by its OPEN Deal';
  end if;

  if not exists (
    select 1 from public.followup_jobs
    where lead_id='20000000-0000-0000-0000-000000000c91'
      and status='PENDING'
  ) then
    raise exception 'Legacy followup fixture missing';
  end if;
end;
$next_action_derived_queue$;

do $next_action_accept_replay$
declare
  v_first uuid;
  v_second uuid;
  v_replayed boolean;
begin
  select resolved_task_id,replayed
    into v_first,v_replayed
  from public.accept_crm_next_action_candidate(
    '00000000-0000-0000-0000-000000000c01',
    'LEAD_STALE',
    '20000000-0000-0000-0000-000000000c91',
    '00000000-0000-0000-0000-00000000c001',
    null,
    null,
    'fixture-next-action-lead-accept',
    72
  );

  if v_first is null or v_replayed then
    raise exception 'First next-action acceptance did not create a Task';
  end if;

  select resolved_task_id,replayed
    into v_second,v_replayed
  from public.accept_crm_next_action_candidate(
    '00000000-0000-0000-0000-000000000c01',
    'LEAD_STALE',
    '20000000-0000-0000-0000-000000000c91',
    '00000000-0000-0000-0000-00000000c001',
    null,
    null,
    'fixture-next-action-lead-accept',
    72
  );

  if v_second is distinct from v_first or not v_replayed then
    raise exception 'Next-action acceptance replay failed';
  end if;

  if not exists (
    select 1 from public.crm_tasks
    where id=v_first
      and source_type='NEXT_ACTION'
      and source_id='LEAD:20000000-0000-0000-0000-000000000c91:STALE'
      and task_type='FOLLOW_UP'
      and status='OPEN'
      and assignee_user_id='00000000-0000-0000-0000-00000000c001'
      and metadata->>'reasonCode'='LEAD_STALE'
  ) then
    raise exception 'Accepted stale Lead did not materialize into canonical CRM Task';
  end if;

  if exists (
    select 1
    from public.get_crm_next_actions(
      '00000000-0000-0000-0000-000000000c01',
      72,
      null,
      200
    )
    where candidate_kind='LEAD_STALE'
      and source_entity_id='20000000-0000-0000-0000-000000000c91'
  ) then
    raise exception 'Accepted stale Lead remained as a duplicate derived candidate';
  end if;

  if not exists (
    select 1
    from public.get_crm_next_actions(
      '00000000-0000-0000-0000-000000000c01',
      72,
      null,
      200
    )
    where task_id=v_first
      and accepted=true
      and source_entity_type='TASK'
  ) then
    raise exception 'Accepted next action did not become canonical Task queue item';
  end if;

  begin
    perform public.accept_crm_next_action_candidate(
      '00000000-0000-0000-0000-000000000c01',
      'DEAL_STALE',
      '60000000-0000-0000-0000-000000000c92',
      '00000000-0000-0000-0000-00000000c001',
      null,
      null,
      'fixture-next-action-lead-accept',
      72
    );
    raise exception 'Semantic request-key conflict was accepted';
  exception when others then
    if sqlerrm not like 'next action request key was reused with different semantics%' then
      raise;
    end if;
  end;
end;
$next_action_accept_replay$;

do $next_action_accept_deal$
declare
  v_task uuid;
  v_replayed boolean;
begin
  select resolved_task_id,replayed
    into v_task,v_replayed
  from public.accept_crm_next_action_candidate(
    '00000000-0000-0000-0000-000000000c01',
    'DEAL_STALE',
    '60000000-0000-0000-0000-000000000c92',
    null,
    null,
    null,
    'fixture-next-action-deal-accept',
    72
  );

  if v_task is null or v_replayed then
    raise exception 'Stale Deal acceptance failed';
  end if;

  if not exists (
    select 1 from public.crm_tasks
    where id=v_task
      and deal_id='60000000-0000-0000-0000-000000000c92'
      and source_type='NEXT_ACTION'
      and task_type='FOLLOW_UP'
      and priority='HIGH'
      and assignee_user_id='00000000-0000-0000-0000-00000000c001'
  ) then
    raise exception 'Stale Deal acceptance did not preserve human Deal ownership';
  end if;
end;
$next_action_accept_deal$;

do $next_action_browser_model_guard$
declare
  v_task uuid;
begin
  select id into v_task
  from public.crm_tasks
  where request_key='fixture-next-action-lead-accept';

  begin
    update public.crm_tasks
    set next_action_model_suggestion='{"action":"CALL","confidence":0.5,"model":"fake","modelVersion":"fake"}'::jsonb,
        next_action_model_suggested_at=now(),
        next_action_model_suggested_by_user_id='00000000-0000-0000-0000-00000000c001'
    where id=v_task;
    raise exception 'Browser mutated next-action model suggestion directly';
  exception when others then
    if sqlerrm not like 'CRM task model suggestion requires trusted service boundary%' then
      raise;
    end if;
  end;
end;
$next_action_browser_model_guard$;

reset role;
select set_config('request.jwt.claim.sub','',false);

create temp table sales_next_action_task_baseline as
select
  id,status,assignee_user_id,due_at,reminder_at,version
from public.crm_tasks
where request_key='fixture-next-action-lead-accept';

set role service_role;

do $next_action_service_direct_guard$
declare
  v_task uuid;
begin
  select id into v_task
  from public.crm_tasks
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and next_action_model_suggestion is null
  limit 1;

  begin
    update public.crm_tasks
    set next_action_model_suggestion='{"action":"CALL","confidence":0.5,"model":"fake","modelVersion":"fake"}'::jsonb,
        next_action_model_suggested_at=now(),
        next_action_model_suggested_by_user_id='00000000-0000-0000-0000-00000000c001'
    where id=v_task;
    raise exception 'service_role mutated model suggestion without governed RPC';
  exception when others then
    if sqlerrm not like 'CRM task model suggestion requires trusted service boundary%' then
      raise;
    end if;
  end;
end;
$next_action_service_direct_guard$;

do $next_action_model_suggestion$
declare
  v_task uuid;
begin
  select id into v_task
  from public.crm_tasks
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and source_type='NEXT_ACTION'
    and source_id='LEAD:20000000-0000-0000-0000-000000000c91:STALE';

  perform public.record_crm_task_next_action_model_suggestion(
    '00000000-0000-0000-0000-000000000c01',
    v_task,
    '00000000-0000-0000-0000-00000000c001',
    '{
      "action":"CALL",
      "rationale":"private-model-rationale-must-not-enter-audit",
      "confidence":0.82,
      "model":"fixture-model",
      "modelVersion":"fixture-v1"
    }'::jsonb
  );
end;
$next_action_model_suggestion$;

reset role;

do $next_action_model_advisory_only$
begin
  if not exists (
    select 1
    from public.crm_tasks t
    join sales_next_action_task_baseline b on b.id=t.id
    where t.next_action_model_suggestion->>'action'='CALL'
      and t.next_action_model_suggestion->>'model'='fixture-model'
      and t.status=b.status
      and t.assignee_user_id is not distinct from b.assignee_user_id
      and t.due_at is not distinct from b.due_at
      and t.reminder_at is not distinct from b.reminder_at
      and t.version=b.version+1
  ) then
    raise exception 'Model suggestion changed canonical Task ownership/lifecycle or was not persisted';
  end if;

  if exists (
    select 1 from public.audit_logs
    where entity_type='crm_tasks'
      and (
        coalesce(before_data::text,'') ilike '%private-model-rationale-must-not-enter-audit%'
        or coalesce(after_data::text,'') ilike '%private-model-rationale-must-not-enter-audit%'
      )
  ) then
    raise exception 'Next-action model rationale leaked into audit evidence';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where action='CRM_NEXT_ACTION_MODEL_SUGGESTED'
      and after_data->>'action'='CALL'
      and after_data->>'model'='fixture-model'
  ) then
    raise exception 'Bounded next-action model audit evidence missing';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where action='CRM_NEXT_ACTION_ACCEPTED'
      and after_data->>'reasonCode' in ('LEAD_STALE','DEAL_STALE')
  ) then
    raise exception 'Next-action human acceptance audit evidence missing';
  end if;
end;
$next_action_model_advisory_only$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c002',false);

do $next_action_cross_tenant$
begin
  if exists (
    select 1
    from public.get_crm_next_actions(
      '00000000-0000-0000-0000-000000000c01',
      72,
      null,
      200
    )
  ) then
    raise exception 'SALES-NEXT-ACTION queue leaked another Organization';
  end if;
end;
$next_action_cross_tenant$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $next_action_security_contract$
begin
  if (
    select bool_or(p.prosecdef)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'get_crm_next_actions',
        'accept_crm_next_action_candidate',
        'record_crm_task_next_action_model_suggestion',
        'guard_crm_next_action_task_mutation',
        'audit_crm_next_action_mutation'
      )
  ) then
    raise exception 'SALES-NEXT-ACTION function unexpectedly uses SECURITY DEFINER';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_crm_next_actions(uuid,integer,uuid,integer)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.accept_crm_next_action_candidate(uuid,text,uuid,uuid,timestamptz,timestamptz,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated next-action function grants missing';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.record_crm_task_next_action_model_suggestion(uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.record_crm_task_next_action_model_suggestion(uuid,uuid,uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Next-action model suggestion trust boundary is incorrect';
  end if;
end;
$next_action_security_contract$;

do $next_action_no_send_side_effect$
begin
  if (select count(*) from public.outreach_messages)
       <>(select outreach_count from sales_next_action_side_effect_baseline)
     or (select count(*) from public.conversation_messages)
       <>(select message_count from sales_next_action_side_effect_baseline)
  then
    raise exception 'SALES-NEXT-ACTION caused outbound/conversation side effects';
  end if;
end;
$next_action_no_send_side_effect$;
