\set ON_ERROR_STOP on

create temp table automation_action_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as message_count,
  (select count(*) from public.usage_events) as usage_count,
  (select count(*) from public.followup_jobs) as followup_count;

grant select on automation_action_side_effect_baseline to service_role;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $authenticated_registry_boundary$
begin
  if (select count(*) from public.tool_action_registry)<>6 then
    raise exception 'Authenticated Tool/Action registry read did not return six contracts';
  end if;

  if has_table_privilege('authenticated','public.tool_action_registry','INSERT')
     or has_table_privilege('authenticated','public.tool_action_registry','UPDATE')
     or has_table_privilege('authenticated','public.tool_action_registry','DELETE')
     or has_table_privilege('authenticated','public.tool_action_registry','TRUNCATE')
  then
    raise exception 'Authenticated browser can mutate Tool/Action registry';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.validate_automation_actions(uuid,jsonb,boolean)',
       'EXECUTE'
     )
  then
    raise exception 'Trusted action validator is browser executable';
  end if;
end;
$authenticated_registry_boundary$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $registry_shape_and_contracts$
declare
  v_available integer;
  v_pending integer;
begin
  select count(*) filter(where availability='AVAILABLE'),
         count(*) filter(where availability='DEPENDENCY_PENDING')
    into v_available,v_pending
  from public.tool_action_registry;

  if v_available<>2 or v_pending<>4 then
    raise exception 'Unexpected action availability split: available %, pending %',
      v_available,v_pending;
  end if;

  if exists(
    select 1 from public.tool_action_registry
    where jsonb_typeof(input_schema)<>'object'
       or input_schema->>'type'<>'object'
       or jsonb_typeof(output_schema)<>'object'
       or output_schema->>'type'<>'object'
       or nullif(permission_key,'') is null
       or nullif(idempotency_key_contract,'') is null
       or idempotency_required is distinct from true
       or nullif(verifier_key,'') is null
       or jsonb_typeof(audit_contract)<>'object'
  ) then
    raise exception 'Tool/Action registry contains an incomplete required contract';
  end if;

  if not exists(
    select 1 from public.tool_action_registry
    where action_key='SEND_FOLLOWUP'
      and authority_key='APPROVED_SEND_POLICY'
      and approval_requirement='REQUIRED'
      and approval_policy_key='OUTBOUND_SEND'
      and side_effect_class='EXTERNAL_PROVIDER'
      and cost_class='PROVIDER_METERED'
      and required_work_packages @> array['AUTO-RUNTIME']::text[]
  ) then
    raise exception 'SEND_FOLLOWUP provider/runtime contract is incomplete';
  end if;

  if not exists(
    select 1 from public.tool_action_registry
    where action_key='MARK_HOT'
      and authority_key='SALES_SCORING_GOVERNANCE'
      and availability='DEPENDENCY_PENDING'
  ) then
    raise exception 'MARK_HOT is not bound to Sales Scoring governance';
  end if;

  if has_table_privilege('service_role','public.tool_action_registry','INSERT')
     or has_table_privilege('service_role','public.tool_action_registry','UPDATE')
     or has_table_privilege('service_role','public.tool_action_registry','DELETE')
     or has_table_privilege('service_role','public.tool_action_registry','TRUNCATE')
  then
    raise exception 'Service role can mutate system-owned Tool/Action registry';
  end if;
end;
$registry_shape_and_contracts$;

do $unknown_action_draft_fails_closed$
begin
  begin
    perform * from public.create_automation_rule_draft(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      'Unknown action draft',
      'HOT_LEAD',
      '[]'::jsonb,
      '[{"key":"ALIEN_ACTION","config":{}}]'::jsonb,
      50,
      '{}'::jsonb,
      '00000000-0000-0000-0000-00000000c001',
      'automation-action-registry-unknown'
    );
    raise exception 'Unknown action draft was accepted';
  exception when others then
    if sqlerrm not like 'Automation action is not cataloged:%' then
      raise;
    end if;
  end;
end;
$unknown_action_draft_fails_closed$;

create temp table automation_action_results(
  available_rule_id uuid,
  pending_rule_id uuid
);
grant select,insert,update on automation_action_results to service_role;

do $available_publish_and_pending_gate$
declare
  v_available uuid;
  v_pending uuid;
  v_version integer;
  v_enabled boolean;
  v_state text;
begin
  select resolved_rule_id into v_available
  from public.create_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Preview action workflow',
    'HOT_LEAD',
    '[]'::jsonb,
    '[{"key":"GENERATE_PREVIEW","config":{}}]'::jsonb,
    55,
    '{}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    'automation-action-registry-available'
  );

  select published_version into v_version
  from public.publish_automation_rule(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_available,1
  );
  if v_version<>1 then
    raise exception 'AVAILABLE action did not publish';
  end if;

  select resolved_enabled,resolved_execution_state
    into v_enabled,v_state
  from public.set_automation_rule_enabled(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_available,true
  );
  if not v_enabled or v_state<>'READY' then
    raise exception 'AVAILABLE published action did not become enableable';
  end if;

  select resolved_rule_id into v_pending
  from public.create_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Pending send workflow',
    'MESSAGE_RECEIVED',
    '[]'::jsonb,
    '[{"key":"SEND_FOLLOWUP","config":{}}]'::jsonb,
    45,
    '{}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    'automation-action-registry-pending'
  );

  begin
    perform * from public.publish_automation_rule(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      v_pending,1
    );
    raise exception 'DEPENDENCY_PENDING action was published';
  exception when others then
    if sqlerrm not like 'Automation action is not publishable: SEND_FOLLOWUP (DEPENDENCY_PENDING)%' then
      raise;
    end if;
  end;

  insert into automation_action_results values(v_available,v_pending);
end;
$available_publish_and_pending_gate$;

-- Enablement must re-check the current registry contract so a later deprecation
-- cannot silently reactivate an old published workflow.
do $disable_available_before_registry_change$
declare
  v_rule uuid;
begin
  select available_rule_id into v_rule from automation_action_results limit 1;
  perform * from public.set_automation_rule_enabled(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule,false
  );
end;
$disable_available_before_registry_change$;

reset role;
update public.tool_action_registry
set availability='DEPRECATED'
where action_key='GENERATE_PREVIEW';

set role service_role;
do $enable_revalidates_registry$
declare
  v_rule uuid;
begin
  select available_rule_id into v_rule from automation_action_results limit 1;
  begin
    perform * from public.set_automation_rule_enabled(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      v_rule,true
    );
    raise exception 'Deprecated published action was re-enabled';
  exception when others then
    if sqlerrm not like 'Automation action is not publishable: GENERATE_PREVIEW (DEPRECATED)%' then
      raise;
    end if;
  end;
end;
$enable_revalidates_registry$;

reset role;
update public.tool_action_registry
set availability='AVAILABLE'
where action_key='GENERATE_PREVIEW';

do $registry_security_and_side_effects$
declare
  v_base automation_action_side_effect_baseline%rowtype;
begin
  if not (
    select c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='tool_action_registry'
  ) then
    raise exception 'Tool/Action registry RLS is not enabled';
  end if;

  if exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'validate_automation_actions',
        'enforce_automation_rule_action_registry',
        'enforce_automation_published_action_registry',
        'enforce_automation_enable_action_registry'
      )
      and p.prosecdef
  ) then
    raise exception 'Tool/Action registry unexpectedly uses SECURITY DEFINER';
  end if;

  select * into v_base from automation_action_side_effect_baseline;
  if (select count(*) from public.outreach_messages)<>v_base.outreach_count
     or (select count(*) from public.conversation_messages)<>v_base.message_count
     or (select count(*) from public.usage_events)<>v_base.usage_count
     or (select count(*) from public.followup_jobs)<>v_base.followup_count
  then
    raise exception 'AUTO-TOOL-ACTION-REGISTRY caused runtime/provider side effects';
  end if;
end;
$registry_security_and_side_effects$;
