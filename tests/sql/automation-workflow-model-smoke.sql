\set ON_ERROR_STOP on

create temp table automation_workflow_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as message_count,
  (select count(*) from public.usage_events) as usage_count,
  (select count(*) from public.followup_jobs) as followup_count;

grant select on automation_workflow_side_effect_baseline to service_role;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $browser_direct_mutation_is_closed$
begin
  if has_table_privilege('authenticated','public.automation_rules','INSERT')
     or has_table_privilege('authenticated','public.automation_rules','UPDATE')
     or has_table_privilege('authenticated','public.automation_rules','DELETE')
     or has_table_privilege('authenticated','public.automation_rules','TRUNCATE')
  then
    raise exception 'Authenticated retained direct automation mutation privilege';
  end if;

  begin
    insert into public.automation_rules(
      organization_id,name,trigger_key,action_key,conditions,actions,priority,config
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      'Browser fabricated workflow','HOT_LEAD','GENERATE_PREVIEW',
      '[]'::jsonb,'[{"key":"GENERATE_PREVIEW","config":{}}]'::jsonb,50,'{}'::jsonb
    );
    raise exception 'Authenticated browser inserted an automation rule directly';
  exception when insufficient_privilege then null;
  end;
end;
$browser_direct_mutation_is_closed$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

create temp table automation_workflow_results(
  rule_id uuid primary key
);
grant select,insert,update on automation_workflow_results to service_role,authenticated;

do $create_and_replay_draft$
declare
  v_rule uuid;
  v_revision integer;
  v_replayed boolean;
  v_rule_2 uuid;
  v_revision_2 integer;
begin
  select resolved_rule_id,resolved_draft_revision,replayed
    into v_rule,v_revision,v_replayed
  from public.create_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Controlled workflow model',
    'HOT_LEAD',
    '[{"kind":"PREDICATE","fact":"LEAD.STATUS","operator":"EQ","value":"HOT"},{"kind":"PREDICATE","fact":"LEAD.RECOMMENDED_OFFER","operator":"EQ","value":"workflow-private-marker"}]'::jsonb,
    '[{"key":"GENERATE_PREVIEW","config":{}},{"key":"MARK_HOT","config":{"minimumScore":80}}]'::jsonb,
    60,
    '{"mode":"CONTROLLED"}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    'automation-workflow-model-create'
  );

  if v_rule is null or v_revision<>1 or v_replayed then
    raise exception 'Automation draft create failed';
  end if;

  select resolved_rule_id,resolved_draft_revision,replayed
    into v_rule_2,v_revision_2,v_replayed
  from public.create_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Controlled workflow model',
    'HOT_LEAD',
    '[{"kind":"PREDICATE","fact":"LEAD.STATUS","operator":"EQ","value":"HOT"},{"kind":"PREDICATE","fact":"LEAD.RECOMMENDED_OFFER","operator":"EQ","value":"workflow-private-marker"}]'::jsonb,
    '[{"key":"GENERATE_PREVIEW","config":{}},{"key":"MARK_HOT","config":{"minimumScore":80}}]'::jsonb,
    60,
    '{"mode":"CONTROLLED"}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    'automation-workflow-model-create'
  );

  if v_rule_2 is distinct from v_rule or v_revision_2<>1 or not v_replayed then
    raise exception 'Automation creation replay failed';
  end if;

  insert into automation_workflow_results(rule_id) values(v_rule);

  if not exists(
    select 1 from public.automation_rules
    where id=v_rule
      and publication_state='DRAFT'
      and draft_revision=1
      and latest_published_version=0
      and execution_state='NOT_READY'
      and enabled=false
      and owner_user_id='00000000-0000-0000-0000-00000000c001'
      and action_key='GENERATE_PREVIEW'
      and jsonb_array_length(actions)=2
  ) then
    raise exception 'Initial automation draft state is incorrect';
  end if;

  begin
    perform * from public.set_automation_rule_enabled(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      v_rule,
      true
    );
    raise exception 'Unpublished automation was enabled';
  exception when others then
    if sqlerrm not like 'Automation cannot be enabled before a published version exists%' then
      raise;
    end if;
  end;
end;
$create_and_replay_draft$;

do $edit_publish_enable_and_keep_published_snapshot$
declare
  v_rule uuid;
  v_revision integer;
  v_version integer;
  v_replayed boolean;
  v_state text;
  v_enabled boolean;
begin
  select rule_id into v_rule from automation_workflow_results limit 1;

  select resolved_draft_revision,replayed
    into v_revision,v_replayed
  from public.update_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule,1,
    'Controlled workflow model',
    'HOT_LEAD',
    '[{"kind":"PREDICATE","fact":"LEAD.STATUS","operator":"EQ","value":"HOT"},{"kind":"PREDICATE","fact":"LEAD.RECOMMENDED_OFFER","operator":"EQ","value":"workflow-private-marker"}]'::jsonb,
    '[{"key":"GENERATE_PREVIEW","config":{}},{"key":"MARK_HOT","config":{"minimumScore":80}}]'::jsonb,
    70,
    '{"mode":"CONTROLLED"}'::jsonb,
    '00000000-0000-0000-0000-00000000c001'
  );
  if v_revision<>2 or v_replayed then
    raise exception 'Automation draft revision did not advance to r2';
  end if;

  select published_version,replayed into v_version,v_replayed
  from public.publish_automation_rule(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule,2
  );
  if v_version<>1 or v_replayed then
    raise exception 'Automation publish v1 failed';
  end if;

  select published_version,replayed into v_version,v_replayed
  from public.publish_automation_rule(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule,2
  );
  if v_version<>1 or not v_replayed then
    raise exception 'Automation publish replay failed';
  end if;

  select resolved_enabled,resolved_execution_state
    into v_enabled,v_state
  from public.set_automation_rule_enabled(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule,true
  );
  if not v_enabled or v_state<>'READY' then
    raise exception 'Published automation did not become READY';
  end if;

  if not exists(
    select 1 from public.automation_rule_versions
    where automation_rule_id=v_rule
      and version=1
      and draft_revision=2
      and priority=70
      and published_by_user_id='00000000-0000-0000-0000-00000000c001'
  ) then
    raise exception 'Immutable automation v1 snapshot is missing';
  end if;

  select resolved_draft_revision,replayed
    into v_revision,v_replayed
  from public.update_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule,2,
    'Controlled workflow model r3',
    'HOT_LEAD',
    '[{"kind":"PREDICATE","fact":"LEAD.STATUS","operator":"EQ","value":"HOT"},{"kind":"PREDICATE","fact":"LEAD.RECOMMENDED_OFFER","operator":"EQ","value":"workflow-private-marker"}]'::jsonb,
    '[{"key":"GENERATE_PREVIEW","config":{}},{"key":"MARK_HOT","config":{"minimumScore":80}}]'::jsonb,
    75,
    '{"mode":"CONTROLLED"}'::jsonb,
    '00000000-0000-0000-0000-00000000c001'
  );
  if v_revision<>3 or v_replayed then
    raise exception 'Automation unpublished r3 draft failed';
  end if;

  if not exists(
    select 1 from public.automation_rules
    where id=v_rule
      and publication_state='DRAFT'
      and draft_revision=3
      and published_revision=2
      and latest_published_version=1
      and execution_state='READY'
      and enabled=true
  ) then
    raise exception 'Unpublished draft incorrectly replaced published execution eligibility';
  end if;

  if not exists(
    select 1 from public.automation_rule_versions
    where automation_rule_id=v_rule
      and version=1
      and name='Controlled workflow model'
      and priority=70
  ) then
    raise exception 'Published v1 mutated after draft edit';
  end if;
end;
$edit_publish_enable_and_keep_published_snapshot$;

reset role;

do $published_version_trigger_is_immutable$
declare
  v_rule uuid;
begin
  select rule_id into v_rule from automation_workflow_results limit 1;
  begin
    update public.automation_rule_versions
       set priority=1
     where automation_rule_id=v_rule and version=1;
    raise exception 'Published automation version was mutable';
  exception when others then
    if sqlerrm not like 'Published automation versions are immutable%' then raise; end if;
  end;
end;
$published_version_trigger_is_immutable$;

set role service_role;

do $publish_v2_and_disable$
declare
  v_rule uuid;
  v_version integer;
  v_state text;
  v_enabled boolean;
begin
  select rule_id into v_rule from automation_workflow_results limit 1;

  select published_version into v_version
  from public.publish_automation_rule(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule,3
  );
  if v_version<>2 then raise exception 'Automation publish v2 failed'; end if;

  select resolved_enabled,resolved_execution_state into v_enabled,v_state
  from public.set_automation_rule_enabled(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule,false
  );
  if v_enabled or v_state<>'DISABLED' then
    raise exception 'Automation disable state failed';
  end if;

  if not exists(
    select 1 from public.automation_rules
    where id=v_rule
      and publication_state='PUBLISHED'
      and draft_revision=3
      and published_revision=3
      and latest_published_version=2
      and execution_state='DISABLED'
      and enabled=false
  ) then
    raise exception 'Automation v2 root state is incorrect';
  end if;
end;
$publish_v2_and_disable$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $authenticated_read_and_function_boundary$
declare
  v_rule uuid;
begin
  select rule_id into v_rule from automation_workflow_results limit 1;

  if not exists(select 1 from public.automation_rules where id=v_rule)
     or not exists(select 1 from public.automation_rule_versions where automation_rule_id=v_rule and version=2)
  then
    raise exception 'Authenticated OWNER cannot read governed automation model';
  end if;

  begin
    update public.automation_rules set priority=10 where id=v_rule;
    raise exception 'Authenticated browser updated automation root directly';
  exception when insufficient_privilege then null;
  end;

  if has_function_privilege(
       'authenticated',
       'public.create_automation_rule_draft(uuid,uuid,text,text,jsonb,jsonb,integer,jsonb,uuid,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.update_automation_rule_draft(uuid,uuid,uuid,integer,text,text,jsonb,jsonb,integer,jsonb,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.publish_automation_rule(uuid,uuid,uuid,integer)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.set_automation_rule_enabled(uuid,uuid,uuid,boolean)',
       'EXECUTE'
     )
  then
    raise exception 'Trusted automation mutation RPC is browser-executable';
  end if;
end;
$authenticated_read_and_function_boundary$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $automation_security_and_side_effects$
declare
  v_base automation_workflow_side_effect_baseline%rowtype;
begin
  if not has_function_privilege(
       'service_role',
       'public.create_automation_rule_draft(uuid,uuid,text,text,jsonb,jsonb,integer,jsonb,uuid,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.publish_automation_rule(uuid,uuid,uuid,integer)',
       'EXECUTE'
     )
  then
    raise exception 'Automation service-role RPC grants are incomplete';
  end if;

  if exists(
    select 1
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and p.proname in (
         'create_automation_rule_draft','update_automation_rule_draft',
         'publish_automation_rule','set_automation_rule_enabled'
       )
       and p.prosecdef
  ) then
    raise exception 'Automation workflow mutation unexpectedly uses SECURITY DEFINER';
  end if;

  if not (
    select c.relrowsecurity from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='automation_rules'
  ) or not (
    select c.relrowsecurity from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='automation_rule_versions'
  ) then
    raise exception 'Automation workflow RLS is not enabled';
  end if;

  if exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and action like 'AUTOMATION_RULE_%'
      and (
        coalesce(before_data::text,'') ilike '%workflow-private-marker%'
        or coalesce(after_data::text,'') ilike '%workflow-private-marker%'
      )
  ) then
    raise exception 'Automation audit leaked raw condition content';
  end if;

  select * into v_base from automation_workflow_side_effect_baseline;
  if (select count(*) from public.outreach_messages)<>v_base.outreach_count
     or (select count(*) from public.conversation_messages)<>v_base.message_count
     or (select count(*) from public.usage_events)<>v_base.usage_count
     or (select count(*) from public.followup_jobs)<>v_base.followup_count
  then
    raise exception 'AUTO-WORKFLOW-MODEL caused runtime/provider side effects';
  end if;
end;
$automation_security_and_side_effects$;

reset role;
