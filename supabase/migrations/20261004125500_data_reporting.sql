-- DATA-REPORTING
--
-- Completes the canonical reporting cadence producer over existing
-- automation_rules + immutable versions + Cloudflare Cron + AUTO-RUNTIME.
-- No second scheduler, queue, reporting warehouse, recipient store or
-- provider credential authority is created.

do $$
begin
  if not exists(
    select 1 from public.tool_action_registry
    where action_key='DELIVER_DATA_EXPORT'
  ) then
    raise exception 'DATA-REPORTING requires DELIVER_DATA_EXPORT from DATA-EXPORTS';
  end if;
end
$$;

update public.tool_action_registry
set
  contract_version=2,
  input_schema='{
    "type":"object",
    "properties":{
      "format":{"type":"string","enum":["CSV","JSON","XLSX","PDF"]},
      "days":{"type":"integer","enum":[7,30,90]},
      "language":{"type":"string","enum":["AUTO","EN","AR","FA"]},
      "summaryMode":{"type":"string","enum":["STANDARD","EXECUTIVE"]},
      "includeAnomalies":{"type":"boolean"}
    },
    "required":["format","days"],
    "additionalProperties":false
  }'::jsonb,
  availability='AVAILABLE',
  required_work_packages='{}'::text[],
  description='Generate a governed analytics report/export and deliver it to the canonical Organization notification email through the existing email provider. Recurring cadence is produced by DATA-REPORTING over SCHEDULE_DUE and AUTO-RUNTIME.',
  metadata=jsonb_build_object(
    'evidence',jsonb_build_array(
      'metric_registry_current_v1',
      'analytics_warehouse_facts',
      'automation_runs',
      'provider message receipt'
    ),
    'providerSend',true,
    'recipientAuthority','organization_settings.notification_email',
    'mailboxAuthority','organization_settings.config.notificationMailboxId',
    'scheduleAuthority','SCHEDULE_DUE',
    'scheduleProducer','DATA_REPORTING_RECONCILER',
    'supportedCadences',jsonb_build_array('DAILY','WEEKLY','MONTHLY','CUSTOM'),
    'supportedLanguages',jsonb_build_array('AUTO','EN','AR','FA'),
    'summaryModes',jsonb_build_array('STANDARD','EXECUTIVE'),
    'anomalyAlerts',true,
    'lowerScopeScheduledDelivery',false,
    'googleSheetsPublishing',false
  )
where action_key='DELIVER_DATA_EXPORT';


create or replace function public.validate_automation_reporting_schedule(
  p_trigger_key text,
  p_config jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_schedule jsonb;
  v_cadence text;
  v_timezone text;
  v_time text;
  v_hour integer;
  v_minute integer;
  v_weekday integer;
  v_day integer;
  v_count integer;
  v_distinct integer;
begin
  if upper(trim(coalesce(p_trigger_key,'')))<>'SCHEDULE_DUE' then
    return true;
  end if;

  if p_config is null or jsonb_typeof(p_config)<>'object' then
    raise exception 'Scheduled reporting requires workflow config object';
  end if;

  v_schedule:=p_config->'reportSchedule';
  if v_schedule is null
     or jsonb_typeof(v_schedule)<>'object'
     or (v_schedule - array['cadence','timezone','time','weekday','dayOfMonth','weekdays']::text[])<>'{}'::jsonb
  then
    raise exception 'SCHEDULE_DUE reporting requires a bounded reportSchedule object';
  end if;

  v_cadence:=upper(trim(coalesce(v_schedule->>'cadence','')));
  v_timezone:=trim(coalesce(v_schedule->>'timezone',''));
  v_time:=trim(coalesce(v_schedule->>'time',''));

  if v_cadence not in ('DAILY','WEEKLY','MONTHLY','CUSTOM') then
    raise exception 'Reporting cadence must be DAILY, WEEKLY, MONTHLY or CUSTOM';
  end if;
  if not exists(select 1 from pg_timezone_names where name=v_timezone) then
    raise exception 'Reporting timezone is not a valid IANA timezone';
  end if;
  if v_time !~ '^[0-9]{2}:[0-9]{2}$' then
    raise exception 'Reporting time must be HH:MM';
  end if;
  v_hour:=split_part(v_time,':',1)::integer;
  v_minute:=split_part(v_time,':',2)::integer;
  if v_hour not between 0 and 23 or v_minute not between 0 and 59 then
    raise exception 'Reporting time is outside 24-hour bounds';
  end if;

  if v_cadence='DAILY' then
    if v_schedule ? 'weekday' or v_schedule ? 'dayOfMonth' or v_schedule ? 'weekdays' then
      raise exception 'DAILY reportSchedule does not accept weekday/dayOfMonth/weekdays';
    end if;

  elsif v_cadence='WEEKLY' then
    if coalesce(jsonb_typeof(v_schedule->'weekday'),'null')<>'number'
       or v_schedule ? 'dayOfMonth'
       or v_schedule ? 'weekdays'
    then
      raise exception 'WEEKLY reportSchedule requires only weekday';
    end if;
    v_weekday:=(v_schedule->>'weekday')::integer;
    if v_weekday not between 1 and 7 then
      raise exception 'WEEKLY reportSchedule weekday must be 1..7';
    end if;

  elsif v_cadence='MONTHLY' then
    if coalesce(jsonb_typeof(v_schedule->'dayOfMonth'),'null')<>'number'
       or v_schedule ? 'weekday'
       or v_schedule ? 'weekdays'
    then
      raise exception 'MONTHLY reportSchedule requires only dayOfMonth';
    end if;
    v_day:=(v_schedule->>'dayOfMonth')::integer;
    if v_day not between 1 and 28 then
      raise exception 'MONTHLY reportSchedule dayOfMonth must be 1..28';
    end if;

  else
    if coalesce(jsonb_typeof(v_schedule->'weekdays'),'null')<>'array'
       or v_schedule ? 'weekday'
       or v_schedule ? 'dayOfMonth'
       or jsonb_array_length(v_schedule->'weekdays') not between 1 and 7
       or exists(
         select 1
         from jsonb_array_elements(v_schedule->'weekdays') x(value)
         where jsonb_typeof(x.value)<>'number'
            or (x.value#>>'{}')::integer not between 1 and 7
       )
    then
      raise exception 'CUSTOM reportSchedule requires weekdays[] with values 1..7';
    end if;
    select count(*),count(distinct (x.value#>>'{}')::integer)
      into v_count,v_distinct
    from jsonb_array_elements(v_schedule->'weekdays') x(value);
    if v_count<>v_distinct then
      raise exception 'CUSTOM reportSchedule weekdays must be unique';
    end if;
  end if;

  return true;
end;
$$;

create or replace function public.enforce_automation_published_reporting_schedule()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if new.trigger_key='SCHEDULE_DUE'
     and exists(
       select 1
       from jsonb_array_elements(new.actions) a(item)
       where a.item->>'key'='DELIVER_DATA_EXPORT'
     )
  then
    perform public.validate_automation_reporting_schedule(new.trigger_key,new.config);
  end if;
  return new;
end;
$$;

drop trigger if exists automation_rule_versions_reporting_schedule_guard
  on public.automation_rule_versions;
create trigger automation_rule_versions_reporting_schedule_guard
before insert on public.automation_rule_versions
for each row execute function public.enforce_automation_published_reporting_schedule();

create or replace function public.validate_automation_runtime_action_configs(
  p_actions jsonb
)
returns integer
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_item jsonb;
  v_key text;
  v_config jsonb;
  v_score numeric;
  v_count integer:=0;
begin
  if p_actions is null or jsonb_typeof(p_actions)<>'array' then
    raise exception 'Automation runtime action config payload is invalid';
  end if;

  for v_item in select value from jsonb_array_elements(p_actions) x(value)
  loop
    v_key:=v_item->>'key';
    v_config:=coalesce(v_item->'config','{}'::jsonb);
    if jsonb_typeof(v_config)<>'object' then
      raise exception 'Automation runtime action config must be an object: %',v_key;
    end if;

    if v_key='CREATE_OPERATOR_BRIEF' then
      if upper(trim(coalesce(v_config->>'briefType',''))) not in (
           'INBOUND','OUTBOUND_PREVIEW','HOT_LEAD','HANDOFF','DAILY_REPORT'
         )
         or length(trim(coalesce(v_config->>'title',''))) not between 1 and 240
         or length(trim(coalesce(v_config->>'summary',''))) not between 1 and 4000
         or (
           v_config ? 'details'
           and jsonb_typeof(v_config->'details')<>'object'
         )
      then
        raise exception 'CREATE_OPERATOR_BRIEF runtime config is invalid';
      end if;

    elsif v_key='MARK_HOT' then
      if coalesce(jsonb_typeof(v_config->'minimumScore'),'null')<>'number' then
        raise exception 'MARK_HOT requires numeric minimumScore';
      end if;
      v_score:=(v_config->>'minimumScore')::numeric;
      if v_score<>trunc(v_score) or v_score not between 50 and 100 then
        raise exception 'MARK_HOT minimumScore must be an integer between 50 and 100';
      end if;

    elsif v_key='SEND_FOLLOWUP' then
      if length(trim(coalesce(v_config->>'body',''))) not between 1 and 10000
         or jsonb_typeof(v_config->'sendContext')<>'object'
         or nullif(trim(v_config->'sendContext'->>'to'),'') is null
         or nullif(trim(v_config->'sendContext'->>'market_code'),'') is null
      then
        raise exception 'SEND_FOLLOWUP runtime config requires body and canonical sendContext';
      end if;

    elsif v_key='HANDOFF_HUMAN' then
      if v_config ? 'reasons' then
        if jsonb_typeof(v_config->'reasons')<>'array'
           or jsonb_array_length(v_config->'reasons')>20
           or exists(
             select 1
             from jsonb_array_elements(v_config->'reasons') r(value)
             where jsonb_typeof(r.value)<>'string'
                or length(trim(r.value#>>'{}')) not between 1 and 200
           )
        then
          raise exception 'HANDOFF_HUMAN reasons config is invalid';
        end if;
      end if;

    elsif v_key='PAUSE_AUTOMATION' then
      if v_config<>'{}'::jsonb then
        raise exception 'PAUSE_AUTOMATION does not accept runtime config';
      end if;

    elsif v_key='GENERATE_PREVIEW' then
      if (v_config ? 'explicitRequest' and jsonb_typeof(v_config->'explicitRequest')<>'boolean')
         or (
           v_config ? 'ownerApprovedHeavyGeneration'
           and jsonb_typeof(v_config->'ownerApprovedHeavyGeneration')<>'boolean'
         )
      then
        raise exception 'GENERATE_PREVIEW runtime config is invalid';
      end if;

    elsif v_key='DELIVER_DATA_EXPORT' then
      if (v_config - array['format','days','language','summaryMode','includeAnomalies']::text[])<>'{}'::jsonb
         or upper(trim(coalesce(v_config->>'format',''))) not in ('CSV','JSON','XLSX','PDF')
         or coalesce(jsonb_typeof(v_config->'days'),'null')<>'number'
         or (v_config->>'days')::integer not in (7,30,90)
         or upper(trim(coalesce(v_config->>'language','AUTO'))) not in ('AUTO','EN','AR','FA')
         or upper(trim(coalesce(v_config->>'summaryMode','STANDARD'))) not in ('STANDARD','EXECUTIVE')
         or (v_config ? 'includeAnomalies' and jsonb_typeof(v_config->'includeAnomalies')<>'boolean')
      then
        raise exception 'DELIVER_DATA_EXPORT reporting config is invalid';
      end if;
    end if;

    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.enqueue_automation_runtime_event(
  p_organization_id uuid,
  p_trigger_key text,
  p_source_event_key text,
  p_subject_type text,
  p_subject_id uuid,
  p_trigger_payload jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default now()
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_trigger public.automation_trigger_catalog%rowtype;
  v_expected_subject text;
  v_rule record;
  v_eval record;
  v_run_id uuid;
  v_matched integer:=0;
  v_enqueued integer:=0;
  v_replayed integer:=0;
  v_timeout_seconds integer;
begin
  if current_user<>'service_role' then
    raise exception 'Automation runtime enqueue requires trusted server boundary';
  end if;
  if p_organization_id is null
     or p_trigger_key is null
     or p_source_event_key !~ '^[A-Za-z0-9._:-]{1,240}$'
     or p_trigger_payload is null
     or jsonb_typeof(p_trigger_payload)<>'object'
     or octet_length(p_trigger_payload::text)>32768
     or p_scheduled_at is null
     or (
       p_trigger_payload ? 'automationRuleId'
       and (
         p_trigger_key<>'SCHEDULE_DUE'
         or coalesce(p_trigger_payload->>'automationRuleId','')
           !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       )
     )
  then
    raise exception 'Automation runtime event payload is invalid';
  end if;

  select * into v_trigger
  from public.automation_trigger_catalog
  where trigger_key=p_trigger_key;

  if not found then
    raise exception 'Automation runtime trigger is not cataloged: %',p_trigger_key;
  end if;
  if v_trigger.availability<>'AVAILABLE' then
    raise exception 'Automation runtime trigger is not available: % (%)',
      p_trigger_key,v_trigger.availability;
  end if;

  v_expected_subject:=public.automation_trigger_expected_condition_subject(p_trigger_key);
  if v_expected_subject is not null
     and (
       p_subject_type is distinct from v_expected_subject
       or p_subject_id is null
     )
  then
    raise exception 'Automation runtime trigger subject mismatch: % requires %',
      p_trigger_key,v_expected_subject;
  end if;
  if p_subject_type is null and p_subject_id is not null
     or p_subject_type is not null and p_subject_id is null
  then
    raise exception 'Automation runtime subject type/id must be supplied together';
  end if;

  perform set_config('app.automation_runtime_mutation','allowed',true);

  for v_rule in
    select
      r.id as rule_id,
      r.latest_published_version as version,
      v.id as version_id,
      v.owner_user_id,
      v.conditions,
      v.actions,
      v.priority,
      v.config
    from public.automation_rules r
    join public.automation_rule_versions v
      on v.automation_rule_id=r.id
     and v.version=r.latest_published_version
     and v.organization_id=r.organization_id
    where r.organization_id=p_organization_id
      and r.enabled=true
      and r.execution_state='READY'
      and r.latest_published_version>0
      and v.trigger_key=p_trigger_key
      and (
        not (p_trigger_payload ? 'automationRuleId')
        or r.id::text=p_trigger_payload->>'automationRuleId'
      )
    order by v.priority desc,r.id
  loop
    perform public.validate_automation_actions(
      p_organization_id,v_rule.actions,true
    );
    perform public.validate_automation_runtime_action_scopes(
      p_trigger_key,v_rule.actions
    );
    perform public.validate_automation_runtime_action_configs(v_rule.actions);

    if jsonb_array_length(v_rule.conditions)>0 then
      if p_subject_type is null or p_subject_id is null then
        raise exception 'Automation runtime conditions require a resolved subject';
      end if;
      select * into v_eval
      from public.evaluate_automation_conditions(
        p_organization_id,p_subject_type,p_subject_id,v_rule.conditions
      );
      if not coalesce(v_eval.matched,false) then
        continue;
      end if;
    end if;

    -- For source kinds without a fixed condition subject, the event must still
    -- provide a subject compatible with every non-control-plane action.
    if exists(
      select 1
      from jsonb_array_elements(v_rule.actions) a(item)
      join public.tool_action_registry t
        on t.action_key=a.item->>'key'
      where t.scope_type<>'AUTOMATION_RULE'
        and (
          p_subject_type is null
          or t.scope_type<>p_subject_type
        )
    ) then
      raise exception 'Automation runtime event subject is incompatible with published actions';
    end if;

    v_matched:=v_matched+1;
    v_timeout_seconds:=least(
      86400,
      greatest(
        60,
        case
          when jsonb_typeof(v_rule.config->'runtimeTimeoutSeconds')='number'
            then (v_rule.config->>'runtimeTimeoutSeconds')::integer
          else 900
        end
      )
    );

    v_run_id:=null;
    insert into public.automation_runs(
      organization_id,automation_rule_id,automation_rule_version_id,
      rule_version,owner_user_id,trigger_key,source_event_key,
      subject_type,subject_id,trigger_payload,priority,status,
      scheduled_at,deadline_at
    ) values (
      p_organization_id,v_rule.rule_id,v_rule.version_id,
      v_rule.version,v_rule.owner_user_id,p_trigger_key,p_source_event_key,
      p_subject_type,p_subject_id,p_trigger_payload,v_rule.priority,'QUEUED',
      p_scheduled_at,p_scheduled_at+make_interval(secs=>v_timeout_seconds)
    )
    on conflict(
      organization_id,automation_rule_id,rule_version,source_event_key
    ) do nothing
    returning id into v_run_id;

    if v_run_id is null then
      v_replayed:=v_replayed+1;
      continue;
    end if;

    insert into public.automation_run_actions(
      organization_id,automation_run_id,action_index,action_key,action_config,
      scope_type,side_effect_class,cost_class,approval_requirement,
      approval_policy_key,verifier_key,idempotency_key,retry_policy,
      max_attempts,timeout_seconds,status,next_attempt_at,input_payload
    )
    select
      p_organization_id,
      v_run_id,
      a.ordinality::integer,
      t.action_key,
      a.item->'config',
      t.scope_type,
      t.side_effect_class,
      t.cost_class,
      t.approval_requirement,
      t.approval_policy_key,
      t.verifier_key,
      'automation:'||v_run_id::text||':'||a.ordinality::text||':'||t.action_key,
      case
        when t.side_effect_class='EXTERNAL_PROVIDER'
          then 'NO_AUTOMATIC_RETRY'
        else 'BOUNDED_IDEMPOTENT'
      end,
      case
        when t.side_effect_class='EXTERNAL_PROVIDER' then 1
        when t.side_effect_class='CONTROL_PLANE' then 2
        else 3
      end,
      case
        when t.side_effect_class='EXTERNAL_PROVIDER' then 120
        when t.cost_class='INTERNAL_METERED' then 180
        else 60
      end,
      'PENDING',
      p_scheduled_at,
      jsonb_build_object(
        'triggerKey',p_trigger_key,
        'sourceEventKey',p_source_event_key,
        'subjectType',p_subject_type,
        'subjectId',p_subject_id,
        'triggerPayload',p_trigger_payload
      )
    from jsonb_array_elements(v_rule.actions) with ordinality a(item,ordinality)
    join public.tool_action_registry t
      on t.action_key=a.item->>'key'
    order by a.ordinality;

    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,
      after_data,correlation_id
    ) values (
      p_organization_id,'SYSTEM','automation_runtime',
      'AUTOMATION_RUN_ENQUEUED','automation_run',v_run_id::text,
      jsonb_build_object(
        'ruleId',v_rule.rule_id,
        'version',v_rule.version,
        'triggerKey',p_trigger_key,
        'subjectType',p_subject_type,
        'subjectId',p_subject_id
      ),
      'automation-run:'||v_run_id::text
    );

    v_enqueued:=v_enqueued+1;
  end loop;

  perform set_config('app.automation_runtime_mutation','0',true);

  return jsonb_build_object(
    'matchedRules',v_matched,
    'enqueuedRuns',v_enqueued,
    'replayedRuns',v_replayed
  );
exception
  when others then
    perform set_config('app.automation_runtime_mutation','0',true);
    raise;
end;
$$;

revoke all on function public.validate_automation_reporting_schedule(text,jsonb)
  from public,anon,authenticated;
grant execute on function public.validate_automation_reporting_schedule(text,jsonb)
  to service_role;

revoke all on function public.enforce_automation_published_reporting_schedule()
  from public,anon,authenticated,service_role;

revoke all on function public.validate_automation_runtime_action_configs(jsonb)
  from public,anon,authenticated;
grant execute on function public.validate_automation_runtime_action_configs(jsonb)
  to service_role;

revoke all on function public.enqueue_automation_runtime_event(
  uuid,text,text,text,uuid,jsonb,timestamptz
) from public,anon,authenticated;
grant execute on function public.enqueue_automation_runtime_event(
  uuid,text,text,text,uuid,jsonb,timestamptz
) to service_role;

comment on function public.validate_automation_reporting_schedule(text,jsonb) is
  'Validates bounded DAILY/WEEKLY/MONTHLY/CUSTOM reportSchedule config for the existing SCHEDULE_DUE automation authority.';
comment on function public.enqueue_automation_runtime_event(uuid,text,text,text,uuid,jsonb,timestamptz) is
  'Canonical Automation Runtime event enqueue. DATA-REPORTING may target exactly one SCHEDULE_DUE rule through trusted automationRuleId trigger evidence; other trigger families cannot use targeted mode.';
