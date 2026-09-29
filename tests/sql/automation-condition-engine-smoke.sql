\set ON_ERROR_STOP on

-- Controlled test fixture lives only in the disposable PostgreSQL CI database.
insert into public.leads(
  id,organization_id,business_id,recommended_offer
) values (
  '00000000-0000-0000-0000-00000000c150',
  '00000000-0000-0000-0000-000000000c01',
  '10000000-0000-0000-0000-000000000c01',
  'workflow-private-marker'
)
on conflict (id) do nothing;

create temp table automation_condition_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as message_count,
  (select count(*) from public.usage_events) as usage_count,
  (select count(*) from public.followup_jobs) as followup_count;

grant select on automation_condition_side_effect_baseline to service_role;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $browser_condition_catalog_read_only$
begin
  if not exists(
    select 1 from public.automation_condition_fact_catalog
    where fact_key='LEAD.STATUS'
      and subject_type='LEAD'
      and data_type='TEXT'
  ) then
    raise exception 'Authenticated condition catalog read failed';
  end if;

  if has_table_privilege('authenticated','public.automation_condition_fact_catalog','INSERT')
     or has_table_privilege('authenticated','public.automation_condition_fact_catalog','UPDATE')
     or has_table_privilege('authenticated','public.automation_condition_fact_catalog','DELETE')
     or has_table_privilege('authenticated','public.automation_condition_fact_catalog','TRUNCATE')
  then
    raise exception 'Authenticated browser can mutate condition fact catalog';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.evaluate_automation_conditions(uuid,text,uuid,jsonb)',
       'EXECUTE'
     )
  then
    raise exception 'Trusted condition evaluator is browser executable';
  end if;
end;
$browser_condition_catalog_read_only$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $typed_validation_and_bounds$
declare
  v_leaves integer;
begin
  select public.validate_automation_conditions(
    '[
      {"kind":"GROUP","op":"AND","children":[
        {"kind":"PREDICATE","fact":"LEAD.OPPORTUNITY_SCORE","operator":"GTE","value":0},
        {"kind":"PREDICATE","fact":"LEAD.INTENT_SCORE","operator":"GTE","value":0}
      ]},
      {"kind":"PREDICATE","fact":"LEAD.RECOMMENDED_OFFER","operator":"EQ","value":"workflow-private-marker"}
    ]'::jsonb
  ) into v_leaves;

  if v_leaves<>3 then
    raise exception 'Typed condition leaf count is incorrect: %',v_leaves;
  end if;

  begin
    perform public.validate_automation_conditions(
      '[{"kind":"PREDICATE","fact":"LEAD.__SQL__","operator":"EQ","value":"x"}]'::jsonb
    );
    raise exception 'Unknown condition fact was accepted';
  exception when others then
    if sqlerrm not like 'Automation condition fact is not cataloged:%' then raise; end if;
  end;

  begin
    perform public.validate_automation_conditions(
      '[{"kind":"PREDICATE","fact":"LEAD.STATUS","operator":"GT","value":"NEW"}]'::jsonb
    );
    raise exception 'Wrong typed operator was accepted';
  exception when others then
    if sqlerrm not like 'Automation condition operator % is not allowed for %' then raise; end if;
  end;

  begin
    perform public.validate_automation_conditions(
      '[
        {"kind":"PREDICATE","fact":"LEAD.OPPORTUNITY_SCORE","operator":"GTE","value":0},
        {"kind":"PREDICATE","fact":"DEAL.STATE","operator":"EQ","value":"OPEN"}
      ]'::jsonb
    );
    raise exception 'Cross-subject condition set was accepted';
  exception when others then
    if sqlerrm not like 'Automation conditions must target one canonical subject type%' then raise; end if;
  end;
end;
$typed_validation_and_bounds$;

do $deterministic_tenant_bound_evaluation$
declare
  v_match boolean;
  v_leaves integer;
begin
  select matched,leaf_count
    into v_match,v_leaves
  from public.evaluate_automation_conditions(
    '00000000-0000-0000-0000-000000000c01',
    'LEAD',
    '00000000-0000-0000-0000-00000000c150',
    '[
      {"kind":"GROUP","op":"AND","children":[
        {"kind":"PREDICATE","fact":"LEAD.OPPORTUNITY_SCORE","operator":"GTE","value":0},
        {"kind":"PREDICATE","fact":"LEAD.INTENT_SCORE","operator":"GTE","value":0}
      ]},
      {"kind":"PREDICATE","fact":"LEAD.RECOMMENDED_OFFER","operator":"EQ","value":"workflow-private-marker"}
    ]'::jsonb
  );

  if not v_match or v_leaves<>3 then
    raise exception 'Expected true condition evaluation failed';
  end if;

  select matched into v_match
  from public.evaluate_automation_conditions(
    '00000000-0000-0000-0000-000000000c01',
    'LEAD',
    '00000000-0000-0000-0000-00000000c150',
    '[{"kind":"PREDICATE","fact":"LEAD.OPPORTUNITY_SCORE","operator":"GT","value":10}]'::jsonb
  );
  if v_match then
    raise exception 'Expected false condition evaluation returned true';
  end if;

  begin
    perform * from public.evaluate_automation_conditions(
      '00000000-0000-0000-0000-000000000c02',
      'LEAD',
      '00000000-0000-0000-0000-00000000c150',
      '[{"kind":"PREDICATE","fact":"LEAD.OPPORTUNITY_SCORE","operator":"GTE","value":0}]'::jsonb
    );
    raise exception 'Cross-Organization subject lookup succeeded';
  exception when others then
    if sqlerrm not like 'Automation condition subject was not found in Organization%' then raise; end if;
  end;
end;
$deterministic_tenant_bound_evaluation$;

do $workflow_definition_condition_integration$
declare
  v_rule uuid;
begin
  select resolved_rule_id into v_rule
  from public.create_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Typed Lead condition workflow',
    'HOT_LEAD',
    '[{"kind":"PREDICATE","fact":"LEAD.OPPORTUNITY_SCORE","operator":"GTE","value":0}]'::jsonb,
    '[{"key":"CREATE_OPERATOR_BRIEF","config":{}}]'::jsonb,
    50,
    '{}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    'automation-condition-engine-valid'
  );

  if v_rule is null then
    raise exception 'Valid typed workflow draft was not created';
  end if;

  begin
    perform * from public.create_automation_rule_draft(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      'Mismatched message condition workflow',
      'MESSAGE_RECEIVED',
      '[{"kind":"PREDICATE","fact":"LEAD.OPPORTUNITY_SCORE","operator":"GTE","value":0}]'::jsonb,
      '[{"key":"CREATE_OPERATOR_BRIEF","config":{}}]'::jsonb,
      50,
      '{}'::jsonb,
      '00000000-0000-0000-0000-00000000c001',
      'automation-condition-engine-mismatch'
    );
    raise exception 'Trigger/condition subject mismatch was accepted';
  exception when others then
    if sqlerrm not like 'Automation condition subject % does not match trigger subject %' then raise; end if;
  end;
end;
$workflow_definition_condition_integration$;

reset role;

do $condition_engine_security_and_side_effects$
declare
  v_base automation_condition_side_effect_baseline%rowtype;
begin
  if exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'validate_automation_condition_node',
        'validate_automation_conditions',
        'automation_condition_subject_facts',
        'automation_condition_predicate_matches',
        'automation_condition_node_matches',
        'evaluate_automation_conditions'
      )
      and p.prosecdef
  ) then
    raise exception 'Condition engine unexpectedly uses SECURITY DEFINER';
  end if;

  if has_table_privilege('service_role','public.crm_tasks','SELECT') then
    raise exception 'Condition engine widened crm_tasks to table-wide service-role SELECT';
  end if;

  if not has_column_privilege('service_role','public.crm_tasks','status','SELECT')
     or not has_column_privilege('service_role','public.crm_tasks','due_at','SELECT')
     or not has_column_privilege('service_role','public.crm_tasks','assignee_user_id','SELECT')
  then
    raise exception 'Condition engine lacks required existing scoped crm_tasks read grants';
  end if;

  select * into v_base from automation_condition_side_effect_baseline;
  if (select count(*) from public.outreach_messages)<>v_base.outreach_count
     or (select count(*) from public.conversation_messages)<>v_base.message_count
     or (select count(*) from public.usage_events)<>v_base.usage_count
     or (select count(*) from public.followup_jobs)<>v_base.followup_count
  then
    raise exception 'AUTO-CONDITION-ENGINE caused runtime/provider side effects';
  end if;
end;
$condition_engine_security_and_side_effects$;
