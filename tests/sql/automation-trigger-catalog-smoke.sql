\set ON_ERROR_STOP on

create temp table automation_trigger_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as message_count,
  (select count(*) from public.usage_events) as usage_count,
  (select count(*) from public.followup_jobs) as followup_count;

grant select on automation_trigger_side_effect_baseline to service_role;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $authenticated_catalog_boundary$
begin
  if not exists(
    select 1 from public.automation_trigger_catalog
    where trigger_key='MESSAGE_RECEIVED'
      and family='MESSAGE'
      and availability='AVAILABLE'
  ) then
    raise exception 'Authenticated trigger catalog read failed';
  end if;

  begin
    update public.automation_trigger_catalog
       set description='browser mutation'
     where trigger_key='MESSAGE_RECEIVED';
    raise exception 'Authenticated browser mutated the trigger catalog';
  exception when insufficient_privilege then null;
  end;
end;
$authenticated_catalog_boundary$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $catalog_shape_and_service_boundary$
declare
  v_family_count integer;
begin
  select count(distinct family) into v_family_count
  from public.automation_trigger_catalog;

  if v_family_count <> 15 then
    raise exception 'Trigger catalog does not cover all 15 required families: %',v_family_count;
  end if;

  if (
    select count(*)
    from public.automation_trigger_catalog
    where trigger_key in ('BOOKING_CREATED','BOOKING_CONFIRMED','BOOKING_CANCELLED')
      and availability='AVAILABLE'
      and required_work_package is null
  ) <> 3 then
    raise exception 'Booking trigger promotion contract is incomplete';
  end if;

  if not exists(
    select 1 from public.automation_trigger_catalog
    where trigger_key='SEGMENT_MEMBER_ENTERED'
      and availability='DEPENDENCY_PENDING'
      and required_work_package is not null
  ) then
    raise exception 'Unresolved dependency-pending trigger contract is missing';
  end if;

  if has_table_privilege('service_role','public.automation_trigger_catalog','INSERT')
     or has_table_privilege('service_role','public.automation_trigger_catalog','UPDATE')
     or has_table_privilege('service_role','public.automation_trigger_catalog','DELETE')
     or has_table_privilege('service_role','public.automation_trigger_catalog','TRUNCATE')
  then
    raise exception 'Service role can mutate system-owned trigger catalog directly';
  end if;
end;
$catalog_shape_and_service_boundary$;

do $unknown_trigger_draft_fails_closed$
begin
  begin
    perform * from public.create_automation_rule_draft(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      'Unknown trigger draft',
      'ALIEN_TRIGGER',
      '[]'::jsonb,
      '[{"key":"PAUSE_AUTOMATION","config":{}}]'::jsonb,
      50,
      '{}'::jsonb,
      '00000000-0000-0000-0000-00000000c001',
      'automation-trigger-catalog-unknown'
    );
    raise exception 'Unknown trigger draft was accepted';
  exception when others then
    if sqlerrm not like 'Automation trigger is not cataloged:%' then
      raise;
    end if;
  end;
end;
$unknown_trigger_draft_fails_closed$;

create temp table automation_trigger_results(
  available_rule_id uuid,
  pending_rule_id uuid
);
grant select,insert,update on automation_trigger_results to service_role;

do $known_drafts_and_publish_gate$
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
    'Message received workflow',
    'MESSAGE_RECEIVED',
    '[]'::jsonb,
    '[{"key":"PAUSE_AUTOMATION","config":{}}]'::jsonb,
    55,
    '{}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    'automation-trigger-catalog-available'
  );

  select published_version into v_version
  from public.publish_automation_rule(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_available,1
  );
  if v_version<>1 then
    raise exception 'AVAILABLE trigger did not publish';
  end if;

  select resolved_enabled,resolved_execution_state
    into v_enabled,v_state
  from public.set_automation_rule_enabled(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_available,true
  );
  if not v_enabled or v_state<>'READY' then
    raise exception 'AVAILABLE published trigger did not become enableable';
  end if;

  select resolved_rule_id into v_pending
  from public.create_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Future segment workflow',
    'SEGMENT_MEMBER_ENTERED',
    '[]'::jsonb,
    '[{"key":"PAUSE_AUTOMATION","config":{}}]'::jsonb,
    45,
    '{}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    'automation-trigger-catalog-pending'
  );

  begin
    perform * from public.publish_automation_rule(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      v_pending,1
    );
    raise exception 'DEPENDENCY_PENDING trigger was published';
  exception when others then
    if sqlerrm not like 'Automation trigger is not publishable: SEGMENT_MEMBER_ENTERED (DEPENDENCY_PENDING)%' then
      raise;
    end if;
  end;

  insert into automation_trigger_results values(v_available,v_pending);
end;
$known_drafts_and_publish_gate$;

reset role;

do $trigger_catalog_security_and_side_effects$
declare
  v_base automation_trigger_side_effect_baseline%rowtype;
begin
  if not (
    select c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='automation_trigger_catalog'
  ) then
    raise exception 'Trigger catalog RLS is not enabled';
  end if;

  if exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'enforce_automation_rule_trigger_catalog',
        'enforce_automation_published_trigger_catalog',
        'enforce_automation_enable_trigger_catalog'
      )
      and p.prosecdef
  ) then
    raise exception 'Trigger catalog guard unexpectedly uses SECURITY DEFINER';
  end if;

  select * into v_base from automation_trigger_side_effect_baseline;
  if (select count(*) from public.outreach_messages)<>v_base.outreach_count
     or (select count(*) from public.conversation_messages)<>v_base.message_count
     or (select count(*) from public.usage_events)<>v_base.usage_count
     or (select count(*) from public.followup_jobs)<>v_base.followup_count
  then
    raise exception 'AUTO-TRIGGER-CATALOG caused runtime/provider side effects';
  end if;
end;
$trigger_catalog_security_and_side_effects$;
