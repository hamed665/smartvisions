\set ON_ERROR_STOP on

reset role;
set role service_role;

do $reporting_registry_contract$
declare
  v public.tool_action_registry%rowtype;
begin
  select * into v
  from public.tool_action_registry
  where action_key='DELIVER_DATA_EXPORT';

  if not found then
    raise exception 'DATA-REPORTING requires DELIVER_DATA_EXPORT';
  end if;
  if v.availability<>'AVAILABLE'
     or cardinality(v.required_work_packages)<>0
     or v.contract_version<2
     or v.metadata->>'scheduleAuthority'<>'SCHEDULE_DUE'
     or v.metadata->>'scheduleProducer'<>'DATA_REPORTING_RECONCILER'
     or coalesce((v.metadata->>'anomalyAlerts')::boolean,false)<>true
  then
    raise exception 'DATA-REPORTING action registry contract is incomplete';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.validate_automation_reporting_schedule(text,jsonb)',
       'EXECUTE'
     )
  then
    raise exception 'Authenticated browser can execute trusted reporting schedule validator';
  end if;
end;
$reporting_registry_contract$;

do $reporting_schedule_validator$
begin
  perform public.validate_automation_reporting_schedule(
    'SCHEDULE_DUE',
    '{"reportSchedule":{"cadence":"DAILY","timezone":"Asia/Muscat","time":"08:00"}}'::jsonb
  );
  perform public.validate_automation_reporting_schedule(
    'SCHEDULE_DUE',
    '{"reportSchedule":{"cadence":"WEEKLY","timezone":"Asia/Muscat","time":"09:30","weekday":1}}'::jsonb
  );
  perform public.validate_automation_reporting_schedule(
    'SCHEDULE_DUE',
    '{"reportSchedule":{"cadence":"MONTHLY","timezone":"Europe/London","time":"07:15","dayOfMonth":28}}'::jsonb
  );
  perform public.validate_automation_reporting_schedule(
    'SCHEDULE_DUE',
    '{"reportSchedule":{"cadence":"CUSTOM","timezone":"America/New_York","time":"18:00","weekdays":[1,3,5]}}'::jsonb
  );

  begin
    perform public.validate_automation_reporting_schedule(
      'SCHEDULE_DUE',
      '{"reportSchedule":{"cadence":"DAILY","timezone":"Mars/Olympus","time":"08:00"}}'::jsonb
    );
    raise exception 'Invalid reporting timezone was accepted';
  exception when others then
    if sqlerrm not like 'Reporting timezone is not a valid IANA timezone%' then raise; end if;
  end;

  begin
    perform public.validate_automation_reporting_schedule(
      'SCHEDULE_DUE',
      '{"reportSchedule":{"cadence":"WEEKLY","timezone":"Asia/Muscat","time":"08:00","weekday":8}}'::jsonb
    );
    raise exception 'Invalid reporting weekday was accepted';
  exception when others then
    if sqlerrm not like 'WEEKLY reportSchedule weekday must be 1..7%' then raise; end if;
  end;

  begin
    perform public.validate_automation_reporting_schedule(
      'SCHEDULE_DUE',
      '{"reportSchedule":{"cadence":"MONTHLY","timezone":"Asia/Muscat","time":"08:00","dayOfMonth":31}}'::jsonb
    );
    raise exception 'Invalid monthly reporting day was accepted';
  exception when others then
    if sqlerrm not like 'MONTHLY reportSchedule dayOfMonth must be 1..28%' then raise; end if;
  end;

  begin
    perform public.validate_automation_reporting_schedule(
      'SCHEDULE_DUE',
      '{"reportSchedule":{"cadence":"CUSTOM","timezone":"Asia/Muscat","time":"08:00","weekdays":[1,1]}}'::jsonb
    );
    raise exception 'Duplicate custom reporting weekdays were accepted';
  exception when others then
    if sqlerrm not like 'CUSTOM reportSchedule weekdays must be unique%' then raise; end if;
  end;

  -- Non-schedule workflows keep their existing config semantics.
  perform public.validate_automation_reporting_schedule(
    'HOT_LEAD',
    '{"anything":"unchanged"}'::jsonb
  );
end;
$reporting_schedule_validator$;

do $reporting_action_config_validator$
begin
  perform public.validate_automation_runtime_action_configs(
    '[{"key":"DELIVER_DATA_EXPORT","config":{"format":"PDF","days":30,"language":"AUTO","summaryMode":"EXECUTIVE","includeAnomalies":true}}]'::jsonb
  );

  begin
    perform public.validate_automation_runtime_action_configs(
      '[{"key":"DELIVER_DATA_EXPORT","config":{"format":"SQL","days":30}}]'::jsonb
    );
    raise exception 'Invalid report export format was accepted';
  exception when others then
    if sqlerrm not like 'DELIVER_DATA_EXPORT reporting config is invalid%' then raise; end if;
  end;

  begin
    perform public.validate_automation_runtime_action_configs(
      '[{"key":"DELIVER_DATA_EXPORT","config":{"format":"PDF","days":30,"language":"KLINGON"}}]'::jsonb
    );
    raise exception 'Invalid report language was accepted';
  exception when others then
    if sqlerrm not like 'DELIVER_DATA_EXPORT reporting config is invalid%' then raise; end if;
  end;
end;
$reporting_action_config_validator$;

begin;

do $targeted_reporting_enqueue$
declare
  v_rule_a uuid;
  v_rule_b uuid;
  v_version integer;
  v_result jsonb;
  v_count_a integer;
  v_count_b integer;
begin
  select resolved_rule_id into v_rule_a
  from public.create_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Reporting schedule smoke A',
    'SCHEDULE_DUE',
    '[]'::jsonb,
    '[{"key":"DELIVER_DATA_EXPORT","config":{"format":"PDF","days":30,"language":"AUTO","summaryMode":"EXECUTIVE","includeAnomalies":true}}]'::jsonb,
    70,
    '{"reportSchedule":{"cadence":"DAILY","timezone":"Asia/Muscat","time":"08:00"}}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    'data-reporting-smoke-a'
  );

  select published_version into v_version
  from public.publish_automation_rule(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule_a,1
  );
  if v_version<>1 then raise exception 'Reporting rule A publish failed'; end if;

  perform * from public.set_automation_rule_enabled(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule_a,true
  );

  select resolved_rule_id into v_rule_b
  from public.create_automation_rule_draft(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Reporting schedule smoke B',
    'SCHEDULE_DUE',
    '[]'::jsonb,
    '[{"key":"DELIVER_DATA_EXPORT","config":{"format":"CSV","days":7,"language":"EN","summaryMode":"STANDARD","includeAnomalies":false}}]'::jsonb,
    60,
    '{"reportSchedule":{"cadence":"WEEKLY","timezone":"Asia/Muscat","time":"09:00","weekday":1}}'::jsonb,
    '00000000-0000-0000-0000-00000000c001',
    'data-reporting-smoke-b'
  );

  select published_version into v_version
  from public.publish_automation_rule(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule_b,1
  );
  if v_version<>1 then raise exception 'Reporting rule B publish failed'; end if;

  perform * from public.set_automation_rule_enabled(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_rule_b,true
  );

  v_result:=public.enqueue_automation_runtime_event(
    '00000000-0000-0000-0000-000000000c01',
    'SCHEDULE_DUE',
    'report.schedule.smoke.target-a',
    null,null,
    jsonb_build_object(
      'automationRuleId',v_rule_a::text,
      'producer','DATA_REPORTING_RECONCILER'
    ),
    now()
  );

  if coalesce((v_result->>'matchedRules')::integer,0)<>1
     or coalesce((v_result->>'enqueuedRuns')::integer,0)<>1
     or coalesce((v_result->>'replayedRuns')::integer,0)<>0
  then
    raise exception 'Targeted reporting event did not enqueue exactly one rule: %',v_result;
  end if;

  select count(*) filter(where automation_rule_id=v_rule_a),
         count(*) filter(where automation_rule_id=v_rule_b)
    into v_count_a,v_count_b
  from public.automation_runs
  where source_event_key='report.schedule.smoke.target-a';

  if v_count_a<>1 or v_count_b<>0 then
    raise exception 'Targeted reporting event leaked across schedule rules: A %, B %',v_count_a,v_count_b;
  end if;

  v_result:=public.enqueue_automation_runtime_event(
    '00000000-0000-0000-0000-000000000c01',
    'SCHEDULE_DUE',
    'report.schedule.smoke.target-a',
    null,null,
    jsonb_build_object('automationRuleId',v_rule_a::text),
    now()
  );
  if coalesce((v_result->>'replayedRuns')::integer,0)<>1 then
    raise exception 'Targeted reporting schedule idempotency replay was not detected: %',v_result;
  end if;

  begin
    perform public.enqueue_automation_runtime_event(
      '00000000-0000-0000-0000-000000000c01',
      'HOT_LEAD',
      'report.schedule.smoke.invalid-target',
      'LEAD',
      '00000000-0000-0000-0000-00000000c150',
      jsonb_build_object('automationRuleId',v_rule_a::text),
      now()
    );
    raise exception 'Non-schedule trigger accepted automationRuleId targeting';
  exception when others then
    if sqlerrm not like 'Automation runtime event payload is invalid%' then raise; end if;
  end;
end;
$targeted_reporting_enqueue$;

rollback;

do $no_parallel_reporting_authority$
begin
  if exists(
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind in ('r','p','m')
      and c.relname in (
        'report_schedules','report_queue','report_jobs','report_facts',
        'reporting_schedules','reporting_queue','reporting_jobs','reporting_facts'
      )
  ) then
    raise exception 'DATA-REPORTING created a forbidden parallel scheduler/report truth relation';
  end if;
end;
$no_parallel_reporting_authority$;
