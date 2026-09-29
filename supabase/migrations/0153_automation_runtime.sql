-- 0153: AUTO-RUNTIME
-- Durable execution over canonical automation_rules + immutable published versions.
-- Cloudflare Cron remains the scheduler. automation_run_actions is the durable
-- action outbox/DLQ state, not a second action gateway/provider-send authority.
-- followup_jobs and agent_runs remain their existing domain-specific authorities.

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_rule_id uuid not null references public.automation_rules(id) on delete restrict,
  automation_rule_version_id uuid not null references public.automation_rule_versions(id) on delete restrict,
  rule_version integer not null check (rule_version >= 1),
  owner_user_id uuid not null,
  trigger_key text not null references public.automation_trigger_catalog(trigger_key) on delete restrict,
  source_event_key text not null,
  subject_type text,
  subject_id uuid,
  trigger_payload jsonb not null default '{}'::jsonb,
  priority integer not null default 50 check (priority between 0 and 100),
  status text not null default 'QUEUED' check (status in (
    'QUEUED','RUNNING','WAITING_ACTION','COMPLETED','FAILED',
    'DEAD_LETTER','CANCELLED'
  )),
  scheduled_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  result_payload jsonb not null default '{}'::jsonb,
  compensation_state text not null default 'NONE' check (
    compensation_state in ('NONE','REQUIRED','RESOLVED','FAILED')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint automation_runs_owner_fk
    foreign key (organization_id,owner_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict,
  constraint automation_runs_rule_version_fk
    foreign key (automation_rule_id,rule_version)
    references public.automation_rule_versions(automation_rule_id,version)
    on delete restrict,
  constraint automation_runs_source_event_key_check
    check (
      length(source_event_key) between 1 and 240
      and source_event_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  constraint automation_runs_subject_type_check
    check (
      subject_type is null
      or subject_type in (
        'LEAD','DEAL','TASK','ACCOUNT','CONVERSATION','SEGMENT_SNAPSHOT','CASE'
      )
    ),
  constraint automation_runs_subject_pair_check
    check (
      (subject_type is null and subject_id is null)
      or (subject_type is not null and subject_id is not null)
    ),
  constraint automation_runs_trigger_payload_check
    check (
      jsonb_typeof(trigger_payload)='object'
      and octet_length(trigger_payload::text) <= 32768
    ),
  constraint automation_runs_result_payload_check
    check (
      jsonb_typeof(result_payload)='object'
      and octet_length(result_payload::text) <= 32768
    ),
  constraint automation_runs_deadline_check
    check (deadline_at >= scheduled_at),
  constraint automation_runs_terminal_time_check
    check (
      (status in ('COMPLETED','FAILED','DEAD_LETTER','CANCELLED') and completed_at is not null)
      or
      (status not in ('COMPLETED','FAILED','DEAD_LETTER','CANCELLED'))
    )
);

comment on table public.automation_runs is
  'Canonical durable execution instances of immutable published automation_rule_versions. This is runtime state only, not workflow-definition authority or a second workflow engine.';

create unique index automation_runs_event_idempotency_uidx
  on public.automation_runs(
    organization_id,automation_rule_id,rule_version,source_event_key
  );

create unique index automation_runs_org_id_id_uidx
  on public.automation_runs(organization_id,id);

create index automation_runs_due_idx
  on public.automation_runs(organization_id,status,scheduled_at,priority desc);

create index automation_runs_rule_idx
  on public.automation_runs(
    organization_id,automation_rule_id,rule_version,created_at desc
  );

create table public.automation_run_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_run_id uuid not null,
  action_index integer not null check (action_index between 1 and 20),
  action_key text not null references public.tool_action_registry(action_key) on delete restrict,
  action_config jsonb not null default '{}'::jsonb,
  scope_type text not null,
  side_effect_class text not null,
  cost_class text not null,
  approval_requirement text not null,
  approval_policy_key text,
  verifier_key text not null,
  idempotency_key text not null,
  retry_policy text not null check (
    retry_policy in ('BOUNDED_IDEMPOTENT','NO_AUTOMATIC_RETRY','RECONCILIATION_ONLY')
  ),
  max_attempts integer not null check (max_attempts between 1 and 10),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  timeout_seconds integer not null check (timeout_seconds between 5 and 86400),
  status text not null default 'PENDING' check (status in (
    'PENDING','CLAIMED','RETRY_WAIT','WAITING_APPROVAL','WAITING_RELEASE',
    'VERIFYING','SUCCEEDED','FAILED','DEAD_LETTER','CANCELLED'
  )),
  next_attempt_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  timeout_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  provider_accepted boolean not null default false,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  verification_payload jsonb not null default '{}'::jsonb,
  last_error text,
  compensation_status text not null default 'NOT_REQUIRED' check (
    compensation_status in ('NOT_REQUIRED','REQUIRED','RESOLVED','FAILED')
  ),
  compensation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint automation_run_actions_run_fk
    foreign key (organization_id,automation_run_id)
    references public.automation_runs(organization_id,id)
    on delete cascade,
  constraint automation_run_actions_unique_position
    unique (automation_run_id,action_index),
  constraint automation_run_actions_idempotency_unique
    unique (organization_id,idempotency_key),
  constraint automation_run_actions_action_config_check
    check (
      jsonb_typeof(action_config)='object'
      and octet_length(action_config::text) <= 16384
    ),
  constraint automation_run_actions_payloads_check
    check (
      jsonb_typeof(input_payload)='object'
      and jsonb_typeof(output_payload)='object'
      and jsonb_typeof(verification_payload)='object'
      and octet_length(input_payload::text) <= 32768
      and octet_length(output_payload::text) <= 32768
      and octet_length(verification_payload::text) <= 32768
    ),
  constraint automation_run_actions_lease_pair_check
    check (
      (lease_owner is null and lease_expires_at is null)
      or (lease_owner is not null and lease_expires_at is not null)
    ),
  constraint automation_run_actions_idempotency_key_check
    check (
      length(idempotency_key) between 8 and 240
      and idempotency_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  constraint automation_run_actions_error_check
    check (last_error is null or length(last_error) <= 2000),
  constraint automation_run_actions_compensation_note_check
    check (compensation_note is null or length(compensation_note) <= 2000)
);

comment on table public.automation_run_actions is
  'Durable ordered action outbox for automation_runs. DEAD_LETTER rows are the canonical runtime DLQ; this table does not replace domain/provider send authorities.';

create index automation_run_actions_claim_idx
  on public.automation_run_actions(
    organization_id,status,next_attempt_at,created_at
  )
  where status in ('PENDING','RETRY_WAIT');

create index automation_run_actions_waiting_idx
  on public.automation_run_actions(
    organization_id,status,updated_at
  )
  where status in ('WAITING_APPROVAL','WAITING_RELEASE','VERIFYING');

create index automation_run_actions_lease_idx
  on public.automation_run_actions(lease_expires_at)
  where status='CLAIMED';

create index automation_run_actions_dlq_idx
  on public.automation_run_actions(
    organization_id,created_at desc
  )
  where status='DEAD_LETTER';

alter table public.automation_runs enable row level security;
alter table public.automation_run_actions enable row level security;

create policy automation_runs_org_member_read
on public.automation_runs
for select
to authenticated
using (public.is_org_member(organization_id));

create policy automation_run_actions_org_member_read
on public.automation_run_actions
for select
to authenticated
using (public.is_org_member(organization_id));

revoke all on table public.automation_runs
  from public,anon,authenticated,service_role;
revoke all on table public.automation_run_actions
  from public,anon,authenticated,service_role;

grant select on table public.automation_runs,public.automation_run_actions
  to authenticated,service_role;
grant insert,update on table public.automation_runs,public.automation_run_actions
  to service_role;

create or replace function public.guard_automation_runtime_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if current_user<>'service_role'
     or coalesce(current_setting('app.automation_runtime_mutation',true),'')<>'allowed'
  then
    raise exception 'Automation runtime state requires the governed runtime boundary';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger automation_runs_mutation_guard
before insert or update or delete on public.automation_runs
for each row execute function public.guard_automation_runtime_mutation();

create trigger automation_run_actions_mutation_guard
before insert or update or delete on public.automation_run_actions
for each row execute function public.guard_automation_runtime_mutation();

create or replace function public.validate_automation_runtime_action_scopes(
  p_trigger_key text,
  p_actions jsonb
)
returns integer
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_expected text;
  v_item jsonb;
  v_scope text;
  v_key text;
  v_count integer:=0;
begin
  if p_trigger_key is null or p_actions is null or jsonb_typeof(p_actions)<>'array' then
    raise exception 'Automation runtime scope validation payload is invalid';
  end if;

  v_expected:=public.automation_trigger_expected_condition_subject(p_trigger_key);

  for v_item in select value from jsonb_array_elements(p_actions) x(value)
  loop
    v_key:=v_item->>'key';
    select scope_type into v_scope
    from public.tool_action_registry
    where action_key=v_key;

    if v_scope is null then
      raise exception 'Automation runtime action is not cataloged: %',v_key;
    end if;

    if v_scope<>'AUTOMATION_RULE'
       and v_expected is not null
       and v_scope<>v_expected
    then
      raise exception 'Automation runtime action scope mismatch: action % expects %, trigger % resolves %',
        v_key,v_scope,p_trigger_key,v_expected;
    end if;
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;

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
      if jsonb_typeof(v_config->'minimumScore')<>'number' then
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
    end if;

    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.enforce_automation_published_runtime_scope()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  perform public.validate_automation_runtime_action_scopes(
    new.trigger_key,new.actions
  );
  perform public.validate_automation_runtime_action_configs(new.actions);
  return new;
end;
$$;

create trigger automation_rule_versions_runtime_scope_guard
before insert on public.automation_rule_versions
for each row execute function public.enforce_automation_published_runtime_scope();

create or replace function public.enforce_automation_enable_runtime_scope()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_trigger text;
  v_actions jsonb;
begin
  if new.enabled
     and (tg_op='INSERT' or old.enabled is distinct from true)
     and new.latest_published_version>0
  then
    select v.trigger_key,v.actions
      into v_trigger,v_actions
    from public.automation_rule_versions v
    where v.automation_rule_id=new.id
      and v.version=new.latest_published_version;

    if v_actions is null then
      raise exception 'Automation latest published runtime snapshot is missing';
    end if;

    perform public.validate_automation_runtime_action_scopes(
      v_trigger,v_actions
    );
    perform public.validate_automation_runtime_action_configs(v_actions);
  end if;
  return new;
end;
$$;

create trigger automation_rules_enable_runtime_scope_guard
before insert or update of enabled on public.automation_rules
for each row execute function public.enforce_automation_enable_runtime_scope();

create or replace function public.automation_runtime_refresh_run(
  p_run_id uuid
)
returns text
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_status text;
  v_total integer;
  v_succeeded integer;
  v_claimed integer;
  v_dead integer;
  v_cancelled integer;
begin
  select
    count(*)::integer,
    count(*) filter(where status='SUCCEEDED')::integer,
    count(*) filter(where status='CLAIMED')::integer,
    count(*) filter(where status='DEAD_LETTER')::integer,
    count(*) filter(where status='CANCELLED')::integer
  into v_total,v_succeeded,v_claimed,v_dead,v_cancelled
  from public.automation_run_actions
  where automation_run_id=p_run_id;

  v_status:=case
    when v_total=0 then 'FAILED'
    when v_dead>0 then 'DEAD_LETTER'
    when v_succeeded=v_total then 'COMPLETED'
    when v_cancelled>0 and v_succeeded+v_cancelled=v_total then 'CANCELLED'
    when v_claimed>0 then 'RUNNING'
    else 'WAITING_ACTION'
  end;

  update public.automation_runs
  set
    status=v_status,
    completed_at=case
      when v_status in ('COMPLETED','FAILED','DEAD_LETTER','CANCELLED')
        then coalesce(completed_at,now())
      else null
    end,
    updated_at=now()
  where id=p_run_id;

  return v_status;
end;
$$;

create or replace function public.automation_runtime_require_compensation(
  p_run_id uuid,
  p_failed_action_index integer,
  p_reason text
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_count integer;
begin
  update public.automation_run_actions
  set
    compensation_status='REQUIRED',
    compensation_note=left(coalesce(p_reason,'DOWNSTREAM_ACTION_FAILED'),2000),
    updated_at=now()
  where automation_run_id=p_run_id
    and action_index<p_failed_action_index
    and status='SUCCEEDED'
    and compensation_status='NOT_REQUIRED'
    and side_effect_class in ('INTERNAL_STATE','CONTROL_PLANE','EXTERNAL_PROVIDER');

  get diagnostics v_count=row_count;

  if v_count>0 then
    update public.automation_runs
    set compensation_state='REQUIRED',updated_at=now()
    where id=p_run_id;
  end if;
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

create or replace function public.claim_automation_runtime_actions(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns setof public.automation_run_actions
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
begin
  if current_user<>'service_role'
     or p_worker_id !~ '^[A-Za-z0-9._:-]{3,160}$'
     or p_limit not between 1 and 50
     or p_lease_seconds not between 15 and 600
  then
    raise exception 'Automation runtime claim payload is invalid';
  end if;

  perform set_config('app.automation_runtime_mutation','allowed',true);

  return query
  with candidates as (
    select a.id
    from public.automation_run_actions a
    join public.automation_runs run on run.id=a.automation_run_id
    join public.automation_rules rule on rule.id=run.automation_rule_id
    join public.system_controls controls on controls.organization_id=run.organization_id
    where a.status in ('PENDING','RETRY_WAIT')
      and a.next_attempt_at<=now()
      and run.status not in ('COMPLETED','FAILED','DEAD_LETTER','CANCELLED')
      and run.scheduled_at<=now()
      and run.deadline_at>now()
      and rule.enabled=true
      and rule.execution_state='READY'
      and controls.global_kill_switch=false
      and controls.agents_paused=false
      and not exists(
        select 1
        from public.automation_run_actions prior
        where prior.automation_run_id=a.automation_run_id
          and prior.action_index<a.action_index
          and prior.status<>'SUCCEEDED'
      )
    order by run.priority desc,a.next_attempt_at,a.created_at,a.id
    for update of a skip locked
    limit p_limit
  ),
  claimed as (
    update public.automation_run_actions a
    set
      status='CLAIMED',
      attempt_count=a.attempt_count+1,
      lease_owner=p_worker_id,
      lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
      timeout_at=now()+make_interval(secs=>a.timeout_seconds),
      started_at=coalesce(a.started_at,now()),
      updated_at=now()
    from candidates c
    where a.id=c.id
    returning a.*
  ),
  touched as (
    update public.automation_runs r
    set
      status='RUNNING',
      started_at=coalesce(r.started_at,now()),
      updated_at=now()
    where r.id in(select automation_run_id from claimed)
    returning r.id
  )
  select c.* from claimed c;

  perform set_config('app.automation_runtime_mutation','0',true);
exception
  when others then
    perform set_config('app.automation_runtime_mutation','0',true);
    raise;
end;
$$;

create or replace function public.complete_automation_runtime_action(
  p_action_id uuid,
  p_worker_id text,
  p_outcome text,
  p_output_payload jsonb default '{}'::jsonb,
  p_verification_payload jsonb default '{}'::jsonb,
  p_error text default null,
  p_provider_accepted boolean default false,
  p_retry_after_seconds integer default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_action public.automation_run_actions%rowtype;
  v_outcome text:=upper(trim(coalesce(p_outcome,'')));
  v_delay integer;
  v_run_status text;
  v_comp integer:=0;
begin
  if current_user<>'service_role'
     or p_action_id is null
     or p_worker_id is null
     or p_output_payload is null
     or jsonb_typeof(p_output_payload)<>'object'
     or octet_length(p_output_payload::text)>32768
     or p_verification_payload is null
     or jsonb_typeof(p_verification_payload)<>'object'
     or octet_length(p_verification_payload::text)>32768
     or (p_error is not null and length(p_error)>2000)
     or v_outcome not in (
       'SUCCEEDED','WAITING_APPROVAL','WAITING_RELEASE',
       'RECONCILIATION_REQUIRED','RETRY','FAILED','CANCELLED'
     )
  then
    raise exception 'Automation runtime completion payload is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_action_id::text,0));
  select * into v_action
  from public.automation_run_actions
  where id=p_action_id
  for update;
  if not found then raise exception 'Automation runtime action was not found'; end if;

  if v_action.status='SUCCEEDED' and v_outcome='SUCCEEDED' then
    return jsonb_build_object(
      'actionId',v_action.id,'status',v_action.status,
      'runId',v_action.automation_run_id,'replayed',true
    );
  end if;

  if v_action.status<>'CLAIMED'
     or v_action.lease_owner is distinct from p_worker_id
  then
    raise exception 'Automation runtime action claim is not owned by this worker';
  end if;

  if v_outcome='SUCCEEDED'
     and coalesce((p_verification_payload->>'verified')::boolean,false) is distinct from true
  then
    raise exception 'Automation runtime success requires verified outcome evidence';
  end if;
  if p_provider_accepted and v_action.side_effect_class<>'EXTERNAL_PROVIDER' then
    raise exception 'Provider acceptance is valid only for external-provider actions';
  end if;

  perform set_config('app.automation_runtime_mutation','allowed',true);

  if v_outcome='SUCCEEDED' then
    update public.automation_run_actions
    set
      status='SUCCEEDED',
      output_payload=p_output_payload,
      verification_payload=p_verification_payload,
      provider_accepted=p_provider_accepted,
      lease_owner=null,
      lease_expires_at=null,
      timeout_at=null,
      completed_at=now(),
      last_error=null,
      updated_at=now()
    where id=v_action.id;

  elsif v_outcome in ('WAITING_APPROVAL','WAITING_RELEASE') then
    if nullif(p_output_payload->>'messageId','') is null then
      raise exception 'Automation runtime approval wait requires durable messageId';
    end if;
    update public.automation_run_actions
    set
      status=v_outcome,
      output_payload=p_output_payload,
      verification_payload=p_verification_payload,
      lease_owner=null,
      lease_expires_at=null,
      timeout_at=null,
      next_attempt_at=now(),
      last_error=left(coalesce(p_error,''),2000),
      updated_at=now()
    where id=v_action.id;

  elsif v_outcome='RECONCILIATION_REQUIRED' then
    if not p_provider_accepted then
      raise exception 'Reconciliation-only state requires provider acceptance evidence';
    end if;
    update public.automation_run_actions
    set
      status='VERIFYING',
      retry_policy='RECONCILIATION_ONLY',
      provider_accepted=true,
      output_payload=p_output_payload,
      verification_payload=p_verification_payload,
      lease_owner=null,
      lease_expires_at=null,
      timeout_at=now()+interval '24 hours',
      next_attempt_at=now()+interval '1 minute',
      last_error=left(coalesce(p_error,'PROVIDER_ACCEPTED_RECONCILIATION_REQUIRED'),2000),
      updated_at=now()
    where id=v_action.id;

  elsif v_outcome='RETRY' then
    if v_action.retry_policy<>'BOUNDED_IDEMPOTENT'
       or p_provider_accepted
       or v_action.attempt_count>=v_action.max_attempts
    then
      update public.automation_run_actions
      set
        status='DEAD_LETTER',
        provider_accepted=p_provider_accepted,
        output_payload=p_output_payload,
        verification_payload=p_verification_payload,
        lease_owner=null,
        lease_expires_at=null,
        timeout_at=null,
        completed_at=now(),
        last_error=left(coalesce(p_error,'AUTOMATION_RETRY_EXHAUSTED_OR_FORBIDDEN'),2000),
        updated_at=now()
      where id=v_action.id;
      v_comp:=public.automation_runtime_require_compensation(
        v_action.automation_run_id,v_action.action_index,
        coalesce(p_error,'AUTOMATION_ACTION_DEAD_LETTER')
      );
    else
      v_delay:=coalesce(
        p_retry_after_seconds,
        least(900,30*(2^greatest(v_action.attempt_count-1,0))::integer)
      );
      v_delay:=least(3600,greatest(0,v_delay));
      update public.automation_run_actions
      set
        status='RETRY_WAIT',
        output_payload=p_output_payload,
        verification_payload=p_verification_payload,
        lease_owner=null,
        lease_expires_at=null,
        timeout_at=null,
        next_attempt_at=now()+make_interval(secs=>v_delay),
        last_error=left(coalesce(p_error,'AUTOMATION_RETRY_REQUESTED'),2000),
        updated_at=now()
      where id=v_action.id;
    end if;

  elsif v_outcome='FAILED' then
    update public.automation_run_actions
    set
      status='DEAD_LETTER',
      provider_accepted=p_provider_accepted,
      output_payload=p_output_payload,
      verification_payload=p_verification_payload,
      lease_owner=null,
      lease_expires_at=null,
      timeout_at=null,
      completed_at=now(),
      last_error=left(coalesce(p_error,'AUTOMATION_ACTION_FAILED'),2000),
      updated_at=now()
    where id=v_action.id;
    v_comp:=public.automation_runtime_require_compensation(
      v_action.automation_run_id,v_action.action_index,
      coalesce(p_error,'AUTOMATION_ACTION_FAILED')
    );

  elsif v_outcome='CANCELLED' then
    update public.automation_run_actions
    set
      status='CANCELLED',
      output_payload=p_output_payload,
      verification_payload=p_verification_payload,
      lease_owner=null,
      lease_expires_at=null,
      timeout_at=null,
      completed_at=now(),
      last_error=left(coalesce(p_error,'AUTOMATION_ACTION_CANCELLED'),2000),
      updated_at=now()
    where id=v_action.id;
  end if;

  v_run_status:=public.automation_runtime_refresh_run(v_action.automation_run_id);

  if v_run_status in ('DEAD_LETTER','FAILED') then
    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,
      after_data,correlation_id
    ) values (
      v_action.organization_id,'SYSTEM','automation_runtime',
      'AUTOMATION_RUN_DEAD_LETTER','automation_run',
      v_action.automation_run_id::text,
      jsonb_build_object(
        'failedActionId',v_action.id,
        'actionKey',v_action.action_key,
        'attemptCount',v_action.attempt_count,
        'compensationRequired',v_comp
      ),
      'automation-dlq:'||v_action.automation_run_id::text
    )
    on conflict do nothing;
  elsif v_run_status='COMPLETED' then
    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,
      after_data,correlation_id
    ) values (
      v_action.organization_id,'SYSTEM','automation_runtime',
      'AUTOMATION_RUN_COMPLETED','automation_run',
      v_action.automation_run_id::text,
      jsonb_build_object('completedAt',now()),
      'automation-complete:'||v_action.automation_run_id::text
    )
    on conflict do nothing;
  end if;

  perform set_config('app.automation_runtime_mutation','0',true);

  return jsonb_build_object(
    'actionId',v_action.id,
    'runId',v_action.automation_run_id,
    'status',(select status from public.automation_run_actions where id=v_action.id),
    'runStatus',v_run_status,
    'compensationRequired',v_comp,
    'replayed',false
  );
exception
  when others then
    perform set_config('app.automation_runtime_mutation','0',true);
    raise;
end;
$$;

create or replace function public.reconcile_automation_runtime_approval_deadlines(
  p_limit integer default 100
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $runtime_approval$
declare
  v_org record;
  v_expired integer:=0;
  v_escalated integer:=0;
  v_org_expired integer:=0;
  v_org_escalated integer:=0;
  v_remaining integer:=p_limit;
  v_organizations integer:=0;
begin
  if current_user<>'service_role'
     or p_limit not between 1 and 500
  then
    raise exception 'Automation runtime approval reconciliation is not permitted';
  end if;

  for v_org in
    select
      m.organization_id,
      min(
        least(
          coalesce(m.approval_expires_at,'infinity'::timestamptz),
          coalesce(m.approval_escalates_at,'infinity'::timestamptz)
        )
      ) as due_at
    from public.conversation_messages m
    where m.requires_approval=true
      and m.status in ('APPROVAL_REQUIRED','READY')
      and (
        m.approval_expires_at<=now()
        or (
          m.approval_escalates_at<=now()
          and m.approval_escalated_at is null
        )
      )
    group by m.organization_id
    order by due_at,m.organization_id
    limit least(p_limit,100)
  loop
    exit when v_remaining<=0;

    select r.expired_count,r.escalated_count
      into v_org_expired,v_org_escalated
    from public.reconcile_due_message_approvals(
      v_org.organization_id,
      least(v_remaining,100)
    ) r;

    v_org_expired:=coalesce(v_org_expired,0);
    v_org_escalated:=coalesce(v_org_escalated,0);
    v_expired:=v_expired+v_org_expired;
    v_escalated:=v_escalated+v_org_escalated;
    v_remaining:=greatest(0,v_remaining-v_org_expired-v_org_escalated);
    v_organizations:=v_organizations+1;
  end loop;

  return jsonb_build_object(
    'organizations',v_organizations,
    'expired',v_expired,
    'escalated',v_escalated
  );
end;
$runtime_approval$;

create or replace function public.reconcile_automation_runtime_waiting(
  p_limit integer default 100
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_row record;
  v_message public.conversation_messages%rowtype;
  v_shadow boolean;
  v_succeeded integer:=0;
  v_ready integer:=0;
  v_waiting_release integer:=0;
  v_cancelled integer:=0;
begin
  if current_user<>'service_role' or p_limit not between 1 and 500 then
    raise exception 'Automation runtime waiting reconciliation is not permitted';
  end if;

  perform set_config('app.automation_runtime_mutation','allowed',true);

  -- Cancel not-yet-started work after a workflow is disabled. A PAUSE_AUTOMATION
  -- action may therefore safely stop later actions in the same run.
  update public.automation_run_actions a
  set
    status='CANCELLED',
    completed_at=now(),
    last_error='AUTOMATION_RULE_DISABLED',
    lease_owner=null,
    lease_expires_at=null,
    timeout_at=null,
    updated_at=now()
  from public.automation_runs run
  join public.automation_rules rule on rule.id=run.automation_rule_id
  where a.automation_run_id=run.id
    and rule.enabled=false
    and a.status in ('PENDING','RETRY_WAIT','WAITING_APPROVAL','WAITING_RELEASE')
    and not exists(
      select 1 from public.automation_run_actions claimed
      where claimed.automation_run_id=run.id and claimed.status='CLAIMED'
    );

  for v_row in
    select a.*,run.organization_id as run_org
    from public.automation_run_actions a
    join public.automation_runs run on run.id=a.automation_run_id
    where a.status in ('WAITING_APPROVAL','WAITING_RELEASE','VERIFYING')
      and nullif(a.output_payload->>'messageId','') is not null
    order by a.updated_at,a.id
    limit p_limit
    for update of a skip locked
  loop
    select * into v_message
    from public.conversation_messages m
    where m.organization_id=v_row.organization_id
      and m.id=(v_row.output_payload->>'messageId')::uuid;

    if not found then
      update public.automation_run_actions
      set
        status='DEAD_LETTER',
        completed_at=now(),
        last_error='AUTOMATION_APPROVAL_MESSAGE_MISSING',
        updated_at=now()
      where id=v_row.id;
      perform public.automation_runtime_require_compensation(
        v_row.automation_run_id,v_row.action_index,'AUTOMATION_APPROVAL_MESSAGE_MISSING'
      );
      perform public.automation_runtime_refresh_run(v_row.automation_run_id);
      continue;
    end if;

    if v_message.status='SENT' then
      update public.automation_run_actions
      set
        status='SUCCEEDED',
        provider_accepted=(v_message.provider_message_id is not null),
        verification_payload=jsonb_build_object(
          'verified',true,
          'verifier',verifier_key,
          'messageId',v_message.id,
          'messageStatus',v_message.status,
          'providerMessageId',v_message.provider_message_id
        ),
        completed_at=now(),
        timeout_at=null,
        last_error=null,
        updated_at=now()
      where id=v_row.id;
      v_succeeded:=v_succeeded+1;
      perform public.automation_runtime_refresh_run(v_row.automation_run_id);
      continue;
    end if;

    if v_message.status='BLOCKED'
       and v_message.approval_decision in ('REJECTED','EXPIRED')
    then
      update public.automation_run_actions
      set
        status='CANCELLED',
        completed_at=now(),
        last_error='AUTOMATION_APPROVAL_'||v_message.approval_decision,
        updated_at=now()
      where id=v_row.id;
      v_cancelled:=v_cancelled+1;
      perform public.automation_runtime_refresh_run(v_row.automation_run_id);
      continue;
    end if;

    if v_row.status in ('WAITING_APPROVAL','WAITING_RELEASE')
       and v_message.status='APPROVED'
       and v_message.requires_approval=false
    then
      select shadow_mode into v_shadow
      from public.system_controls
      where organization_id=v_row.organization_id;

      if coalesce(v_shadow,true) then
        update public.automation_run_actions
        set status='WAITING_RELEASE',next_attempt_at=now()+interval '5 minutes',updated_at=now()
        where id=v_row.id;
        v_waiting_release:=v_waiting_release+1;
      else
        update public.automation_run_actions
        set status='PENDING',next_attempt_at=now(),updated_at=now()
        where id=v_row.id;

        -- Approval/Shadow waiting time is not charged against the active
        -- execution deadline. Restore the workflow's original runtime budget
        -- when the durable external wait releases.
        update public.automation_runs
        set
          deadline_at=now()+greatest(
            deadline_at-scheduled_at,
            interval '60 seconds'
          ),
          updated_at=now()
        where id=v_row.automation_run_id;

        v_ready:=v_ready+1;
      end if;
    end if;
  end loop;

  -- Refresh runs affected by the disabled-rule cancellation above.
  for v_row in
    select distinct run.id
    from public.automation_runs run
    join public.automation_rules rule on rule.id=run.automation_rule_id
    where rule.enabled=false
      and run.status not in ('COMPLETED','FAILED','DEAD_LETTER','CANCELLED')
  loop
    perform public.automation_runtime_refresh_run(v_row.id);
  end loop;

  perform set_config('app.automation_runtime_mutation','0',true);

  return jsonb_build_object(
    'succeeded',v_succeeded,
    'ready',v_ready,
    'waitingRelease',v_waiting_release,
    'cancelled',v_cancelled
  );
exception
  when others then
    perform set_config('app.automation_runtime_mutation','0',true);
    raise;
end;
$$;

create or replace function public.reap_automation_runtime_timeouts(
  p_limit integer default 100,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_action public.automation_run_actions%rowtype;
  v_retried integer:=0;
  v_verifying integer:=0;
  v_dead integer:=0;
  v_runs_dead integer:=0;
begin
  if current_user<>'service_role'
     or p_limit not between 1 and 500
     or p_as_of is null
  then
    raise exception 'Automation runtime timeout reap is not permitted';
  end if;

  perform set_config('app.automation_runtime_mutation','allowed',true);

  for v_action in
    select a.*
    from public.automation_run_actions a
    where a.status='CLAIMED'
      and (
        a.lease_expires_at<=p_as_of
        or a.timeout_at<=p_as_of
      )
    order by least(a.lease_expires_at,a.timeout_at),a.id
    limit p_limit
    for update skip locked
  loop
    if v_action.side_effect_class='EXTERNAL_PROVIDER' then
      update public.automation_run_actions
      set
        status='VERIFYING',
        retry_policy='RECONCILIATION_ONLY',
        lease_owner=null,
        lease_expires_at=null,
        timeout_at=p_as_of+interval '24 hours',
        next_attempt_at=p_as_of+interval '1 minute',
        last_error='AUTOMATION_EXTERNAL_SIDE_EFFECT_AMBIGUOUS_AFTER_LEASE_TIMEOUT',
        updated_at=p_as_of
      where id=v_action.id;
      v_verifying:=v_verifying+1;
    elsif v_action.retry_policy='BOUNDED_IDEMPOTENT'
       and v_action.attempt_count<v_action.max_attempts
    then
      update public.automation_run_actions
      set
        status='RETRY_WAIT',
        lease_owner=null,
        lease_expires_at=null,
        timeout_at=null,
        next_attempt_at=p_as_of+interval '30 seconds',
        last_error='AUTOMATION_ACTION_LEASE_TIMEOUT_RETRY',
        updated_at=p_as_of
      where id=v_action.id;
      v_retried:=v_retried+1;
    else
      update public.automation_run_actions
      set
        status='DEAD_LETTER',
        lease_owner=null,
        lease_expires_at=null,
        timeout_at=null,
        completed_at=p_as_of,
        last_error='AUTOMATION_ACTION_LEASE_TIMEOUT_DEAD_LETTER',
        updated_at=p_as_of
      where id=v_action.id;
      perform public.automation_runtime_require_compensation(
        v_action.automation_run_id,v_action.action_index,
        'AUTOMATION_ACTION_LEASE_TIMEOUT_DEAD_LETTER'
      );
      perform public.automation_runtime_refresh_run(v_action.automation_run_id);
      v_dead:=v_dead+1;
    end if;
  end loop;

  for v_action in
    select a.*
    from public.automation_run_actions a
    where a.status='VERIFYING'
      and a.timeout_at<=p_as_of
    order by a.timeout_at,a.id
    limit p_limit
    for update skip locked
  loop
    update public.automation_run_actions
    set
      status='DEAD_LETTER',
      completed_at=p_as_of,
      last_error='AUTOMATION_RECONCILIATION_TIMEOUT',
      updated_at=p_as_of
    where id=v_action.id;
    perform public.automation_runtime_require_compensation(
      v_action.automation_run_id,v_action.action_index,
      'AUTOMATION_RECONCILIATION_TIMEOUT'
    );
    perform public.automation_runtime_refresh_run(v_action.automation_run_id);
    v_dead:=v_dead+1;
  end loop;

  for v_action in
    select a.*
    from public.automation_run_actions a
    join public.automation_runs run on run.id=a.automation_run_id
    where run.status not in ('COMPLETED','FAILED','DEAD_LETTER','CANCELLED')
      and run.deadline_at<=p_as_of
      and a.status not in ('SUCCEEDED','DEAD_LETTER','CANCELLED')
      and not exists(
        select 1
        from public.automation_run_actions waiting
        where waiting.automation_run_id=run.id
          and waiting.status in ('WAITING_APPROVAL','WAITING_RELEASE','VERIFYING')
      )
    order by run.deadline_at,a.action_index
    limit p_limit
    for update of a skip locked
  loop
    update public.automation_run_actions
    set
      status='DEAD_LETTER',
      lease_owner=null,
      lease_expires_at=null,
      timeout_at=null,
      completed_at=p_as_of,
      last_error='AUTOMATION_RUN_DEADLINE_EXCEEDED',
      updated_at=p_as_of
    where id=v_action.id;
    perform public.automation_runtime_require_compensation(
      v_action.automation_run_id,v_action.action_index,
      'AUTOMATION_RUN_DEADLINE_EXCEEDED'
    );
    perform public.automation_runtime_refresh_run(v_action.automation_run_id);
    v_runs_dead:=v_runs_dead+1;
  end loop;

  perform set_config('app.automation_runtime_mutation','0',true);

  return jsonb_build_object(
    'retried',v_retried,
    'verifying',v_verifying,
    'deadLetteredActions',v_dead,
    'deadlineActions',v_runs_dead
  );
exception
  when others then
    perform set_config('app.automation_runtime_mutation','0',true);
    raise;
end;
$$;

create or replace function public.resolve_automation_runtime_compensation(
  p_action_id uuid,
  p_resolution text,
  p_note text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_action public.automation_run_actions%rowtype;
  v_resolution text:=upper(trim(coalesce(p_resolution,'')));
  v_remaining integer;
begin
  if current_user<>'service_role'
     or v_resolution not in ('RESOLVED','FAILED')
     or length(trim(coalesce(p_note,''))) not between 3 and 2000
  then
    raise exception 'Automation runtime compensation resolution is invalid';
  end if;

  select * into v_action
  from public.automation_run_actions
  where id=p_action_id
  for update;
  if not found or v_action.compensation_status<>'REQUIRED' then
    raise exception 'Automation runtime compensation is not awaiting resolution';
  end if;

  perform set_config('app.automation_runtime_mutation','allowed',true);

  update public.automation_run_actions
  set
    compensation_status=v_resolution,
    compensation_note=trim(p_note),
    updated_at=now()
  where id=p_action_id;

  select count(*)::integer into v_remaining
  from public.automation_run_actions
  where automation_run_id=v_action.automation_run_id
    and compensation_status in ('REQUIRED','FAILED');

  update public.automation_runs
  set
    compensation_state=case
      when v_resolution='FAILED' then 'FAILED'
      when v_remaining=0 then 'RESOLVED'
      else 'REQUIRED'
    end,
    updated_at=now()
  where id=v_action.automation_run_id;

  perform set_config('app.automation_runtime_mutation','0',true);

  return jsonb_build_object(
    'actionId',p_action_id,
    'runId',v_action.automation_run_id,
    'resolution',v_resolution,
    'remaining',v_remaining
  );
exception
  when others then
    perform set_config('app.automation_runtime_mutation','0',true);
    raise;
end;
$$;

alter table public.operator_briefs
  add column if not exists request_key text;

alter table public.operator_briefs
  add constraint operator_briefs_request_key_check
  check (
    request_key is null
    or (
      length(request_key) between 8 and 240
      and request_key ~ '^[A-Za-z0-9._:-]+$'
    )
  );

create unique index operator_briefs_runtime_request_uidx
  on public.operator_briefs(organization_id,request_key)
  where request_key is not null;

create or replace function public.create_automation_operator_brief(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_message_id uuid,
  p_request_key text,
  p_brief_type text,
  p_title text,
  p_summary text,
  p_details jsonb,
  p_requires_action boolean
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_brief public.operator_briefs%rowtype;
  v_request_key text:=trim(coalesce(p_request_key,''));
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_conversation_id is null
     or v_request_key !~ '^[A-Za-z0-9._:-]{8,240}$'
     or upper(trim(coalesce(p_brief_type,''))) not in (
       'INBOUND','OUTBOUND_PREVIEW','HOT_LEAD','HANDOFF','DAILY_REPORT'
     )
     or length(trim(coalesce(p_title,''))) not between 1 and 240
     or length(trim(coalesce(p_summary,''))) not between 1 and 4000
     or p_details is null
     or jsonb_typeof(p_details)<>'object'
     or octet_length(p_details::text)>16384
  then
    raise exception 'Automation operator brief payload is invalid';
  end if;

  if not exists(
    select 1 from public.sales_conversations c
    where c.organization_id=p_organization_id and c.id=p_conversation_id
  ) then
    raise exception 'Automation operator brief conversation was not found';
  end if;

  if p_message_id is not null and not exists(
    select 1 from public.conversation_messages m
    where m.organization_id=p_organization_id
      and m.id=p_message_id
      and m.conversation_id=p_conversation_id
  ) then
    raise exception 'Automation operator brief message linkage is invalid';
  end if;

  select * into v_brief
  from public.operator_briefs b
  where b.organization_id=p_organization_id
    and b.request_key=v_request_key;
  if found then
    return jsonb_build_object(
      'briefId',v_brief.id,'replayed',true,'verified',true
    );
  end if;

  insert into public.operator_briefs(
    organization_id,conversation_id,message_id,brief_type,language,
    title,summary,details,requires_action,request_key
  ) values (
    p_organization_id,p_conversation_id,p_message_id,
    upper(trim(p_brief_type)),'fa',
    trim(p_title),trim(p_summary),p_details,
    coalesce(p_requires_action,false),v_request_key
  )
  returning * into v_brief;

  return jsonb_build_object(
    'briefId',v_brief.id,'replayed',false,'verified',true
  );
end;
$$;

create unique index audit_logs_automation_mark_hot_request_uidx
  on public.audit_logs(organization_id,entity_id,correlation_id)
  where entity_type='lead'
    and action='CRM_LEAD_MARKED_HOT_BY_AUTOMATION'
    and correlation_id is not null;

create or replace function public.mark_crm_lead_hot_from_automation(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_minimum_score integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_role text;
  v_effective integer;
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_hash text;
  v_after jsonb;
begin
  if current_user<>'service_role'
     or p_minimum_score not between 50 and 100
     or v_request_key !~ '^[A-Za-z0-9._:-]{8,200}$'
  then
    raise exception 'Automation MARK_HOT payload is invalid';
  end if;

  v_role:=public.crm_assert_lead_scoring_actor(
    p_organization_id,p_actor_user_id
  );
  v_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    p_minimum_score::text
  ));

  select a.after_data into v_after
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.entity_type='lead'
    and a.entity_id=p_lead_id::text
    and a.action='CRM_LEAD_MARKED_HOT_BY_AUTOMATION'
    and a.correlation_id=v_request_key
  order by a.created_at desc,a.id desc
  limit 1;

  if v_after is not null then
    if coalesce(v_after->>'requestHash','')<>v_hash then
      raise exception 'Automation MARK_HOT request key conflict';
    end if;
    return (v_after-'requestHash')||jsonb_build_object('replayed',true);
  end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'Automation MARK_HOT Lead was not found'; end if;
  if v_lead.status::text in ('DO_NOT_CONTACT','WON','LOST') then
    raise exception 'Automation MARK_HOT cannot mutate terminal Lead';
  end if;

  v_effective:=public.crm_lead_effective_opportunity_score(
    v_lead.opportunity_score,v_lead.manual_score_override,
    v_lead.manual_score_override_expires_at,now()
  );
  if v_effective<p_minimum_score then
    raise exception 'Automation MARK_HOT requires governed effective score >= %',p_minimum_score;
  end if;

  update public.leads
  set status='HOT',updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_after:=jsonb_build_object(
    'leadId',v_lead.id,
    'status',v_lead.status,
    'effectiveScore',v_effective,
    'minimumScore',p_minimum_score,
    'scoringRevision',v_lead.scoring_revision,
    'actorRole',v_role,
    'requestHash',v_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id
  ) values (
    p_organization_id,'SYSTEM',
    'automation_runtime:'||p_actor_user_id::text,
    'CRM_LEAD_MARKED_HOT_BY_AUTOMATION','lead',p_lead_id::text,
    v_after,v_request_key
  );

  return v_after-'requestHash';
end;
$$;

create or replace function public.create_automation_approval_message(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_lead_id uuid,
  p_channel text,
  p_body text,
  p_send_context jsonb,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_channel text:=upper(trim(coalesce(p_channel,'')));
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_provider_id text;
  v_message public.conversation_messages%rowtype;
  v_conversation public.sales_conversations%rowtype;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_conversation_id is null
     or p_lead_id is null
     or v_channel not in (
       'EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','TELEGRAM'
     )
     or length(trim(coalesce(p_body,''))) not between 1 and 10000
     or p_send_context is null
     or jsonb_typeof(p_send_context)<>'object'
     or octet_length(p_send_context::text)>16384
     or nullif(trim(p_send_context->>'to'),'') is null
     or nullif(trim(p_send_context->>'market_code'),'') is null
     or v_request_key !~ '^[A-Za-z0-9._:-]{8,200}$'
  then
    raise exception 'Automation approval message payload is invalid';
  end if;

  if v_channel='EMAIL'
     and (
       nullif(trim(p_send_context->>'subject'),'') is null
       or nullif(trim(p_send_context->>'mailbox_id'),'') is null
     )
  then
    raise exception 'Automation email approval requires subject and mailbox_id';
  end if;

  select * into v_conversation
  from public.sales_conversations c
  where c.organization_id=p_organization_id
    and c.id=p_conversation_id
    and c.lead_id=p_lead_id;
  if not found then
    raise exception 'Automation approval conversation linkage is invalid';
  end if;
  if v_conversation.channel<>v_channel then
    raise exception 'Automation approval channel does not match conversation';
  end if;

  v_provider_id:='automation:'||md5(v_request_key);

  select * into v_message
  from public.conversation_messages m
  where m.organization_id=p_organization_id
    and m.channel=v_channel
    and m.provider_message_id=v_provider_id
  order by m.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'messageId',v_message.id,
      'status',v_message.status,
      'requiresApproval',v_message.requires_approval,
      'replayed',true
    );
  end if;

  insert into public.conversation_messages(
    organization_id,conversation_id,lead_id,provider_message_id,
    channel,direction,media_type,original_text,requires_approval,
    approval_reason,status,metadata
  ) values (
    p_organization_id,p_conversation_id,p_lead_id,v_provider_id,
    v_channel,'OUTBOUND','TEXT',trim(p_body),true,
    'AUTOMATION_RUNTIME_REVIEW','APPROVAL_REQUIRED',
    jsonb_build_object(
      'source','AUTOMATION_RUNTIME',
      'idempotency_key',v_request_key,
      'send_context',p_send_context
    )
  )
  returning * into v_message;

  return jsonb_build_object(
    'messageId',v_message.id,
    'status',v_message.status,
    'requiresApproval',v_message.requires_approval,
    'replayed',false
  );
end;
$$;

create unique index audit_logs_automation_runtime_pause_request_uidx
  on public.audit_logs(organization_id,entity_id,correlation_id)
  where entity_type='automation_rule'
    and action='AUTOMATION_RULE_PAUSED_BY_RUNTIME'
    and correlation_id is not null;

create or replace function public.pause_automation_rule_from_runtime(
  p_organization_id uuid,
  p_rule_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_hash text;
  v_after jsonb;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_rule_id is null
     or v_request_key !~ '^[A-Za-z0-9._:-]{8,200}$'
  then
    raise exception 'Automation runtime pause payload is invalid';
  end if;

  v_hash:=md5(concat_ws('|',
    p_organization_id::text,p_rule_id::text,'PAUSE'
  ));

  select a.after_data into v_after
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.entity_type='automation_rule'
    and a.entity_id=p_rule_id::text
    and a.action='AUTOMATION_RULE_PAUSED_BY_RUNTIME'
    and a.correlation_id=v_request_key
  order by a.created_at desc,a.id desc
  limit 1;

  if v_after is not null then
    if coalesce(v_after->>'requestHash','')<>v_hash then
      raise exception 'Automation runtime pause request key conflict';
    end if;
    return (v_after-'requestHash')||jsonb_build_object('replayed',true);
  end if;

  select * into v_rule
  from public.automation_rules r
  where r.organization_id=p_organization_id
    and r.id=p_rule_id
  for update;

  if not found then
    raise exception 'Automation runtime pause rule was not found';
  end if;

  update public.automation_rules
  set
    enabled=false,
    execution_state='DISABLED',
    updated_at=now()
  where organization_id=p_organization_id
    and id=p_rule_id
  returning * into v_rule;

  v_after:=jsonb_build_object(
    'ruleId',v_rule.id,
    'enabled',v_rule.enabled,
    'executionState',v_rule.execution_state,
    'requestHash',v_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id
  ) values (
    p_organization_id,'SYSTEM','automation_runtime',
    'AUTOMATION_RULE_PAUSED_BY_RUNTIME','automation_rule',p_rule_id::text,
    v_after,v_request_key
  );

  return v_after-'requestHash';
end;
$$;

-- AUTO-RUNTIME supplies the missing durable command/execution boundary for
-- these already-cataloged actions. Provider sends still route through the
-- existing approved-send authority; no new provider authority is introduced.
update public.tool_action_registry
set
  availability='AVAILABLE',
  required_work_packages='{}'::text[],
  description=case action_key
    when 'CREATE_OPERATOR_BRIEF' then
      'Create an idempotent operator brief through canonical operator_briefs storage under durable Automation runtime.'
    when 'PAUSE_AUTOMATION' then
      'Pause the canonical automation rule through a SYSTEM-actor governed command in durable Automation runtime.'
    when 'MARK_HOT' then
      'Apply HOT lifecycle only when governed Sales Scoring evidence meets the configured threshold; direct Lead status writes remain forbidden to runtime adapters.'
    when 'SEND_FOLLOWUP' then
      'Create a governed approval artifact and, only after approval and safety release, dispatch through the canonical approved-send authority with reconciliation-only handling after provider acceptance.'
    else description
  end
where action_key in (
  'CREATE_OPERATOR_BRIEF','PAUSE_AUTOMATION','MARK_HOT','SEND_FOLLOWUP'
)
  and availability='DEPENDENCY_PENDING'
  and required_work_packages @> array['AUTO-RUNTIME']::text[];

-- SEGMENT_MEMBER_ENTERED remains dependency-pending. AUTO-RUNTIME provides
-- durable event ingestion, but this Work Package does not invent a Segment
-- membership producer that does not yet exist in the canonical snapshot plane.

revoke all on function public.guard_automation_runtime_mutation()
  from public,anon,authenticated,service_role;
revoke all on function public.validate_automation_runtime_action_scopes(text,jsonb)
  from public,anon,authenticated;
revoke all on function public.validate_automation_runtime_action_configs(jsonb)
  from public,anon,authenticated;
revoke all on function public.enforce_automation_published_runtime_scope()
  from public,anon,authenticated,service_role;
revoke all on function public.enforce_automation_enable_runtime_scope()
  from public,anon,authenticated,service_role;
revoke all on function public.automation_runtime_refresh_run(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.automation_runtime_require_compensation(uuid,integer,text)
  from public,anon,authenticated,service_role;

revoke all on function public.enqueue_automation_runtime_event(
  uuid,text,text,text,uuid,jsonb,timestamptz
) from public,anon,authenticated;
revoke all on function public.claim_automation_runtime_actions(text,integer,integer)
  from public,anon,authenticated;
revoke all on function public.complete_automation_runtime_action(
  uuid,text,text,jsonb,jsonb,text,boolean,integer
) from public,anon,authenticated;
revoke all on function public.reconcile_automation_runtime_approval_deadlines(integer)
  from public,anon,authenticated;
revoke all on function public.reconcile_automation_runtime_waiting(integer)
  from public,anon,authenticated;
revoke all on function public.reap_automation_runtime_timeouts(integer,timestamptz)
  from public,anon,authenticated;
revoke all on function public.resolve_automation_runtime_compensation(uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.create_automation_operator_brief(
  uuid,uuid,uuid,text,text,text,text,jsonb,boolean
) from public,anon,authenticated;
revoke all on function public.mark_crm_lead_hot_from_automation(
  uuid,uuid,uuid,integer,text
) from public,anon,authenticated;
revoke all on function public.create_automation_approval_message(
  uuid,uuid,uuid,text,text,jsonb,text
) from public,anon,authenticated;
revoke all on function public.pause_automation_rule_from_runtime(
  uuid,uuid,text
) from public,anon,authenticated;

grant execute on function public.validate_automation_runtime_action_scopes(text,jsonb)
  to service_role;
grant execute on function public.validate_automation_runtime_action_configs(jsonb)
  to service_role;
grant execute on function public.enqueue_automation_runtime_event(
  uuid,text,text,text,uuid,jsonb,timestamptz
) to service_role;
grant execute on function public.claim_automation_runtime_actions(text,integer,integer)
  to service_role;
grant execute on function public.complete_automation_runtime_action(
  uuid,text,text,jsonb,jsonb,text,boolean,integer
) to service_role;
grant execute on function public.reconcile_automation_runtime_approval_deadlines(integer)
  to service_role;
grant execute on function public.reconcile_automation_runtime_waiting(integer)
  to service_role;
grant execute on function public.reap_automation_runtime_timeouts(integer,timestamptz)
  to service_role;
grant execute on function public.resolve_automation_runtime_compensation(uuid,text,text)
  to service_role;
grant execute on function public.create_automation_operator_brief(
  uuid,uuid,uuid,text,text,text,text,jsonb,boolean
) to service_role;
grant execute on function public.mark_crm_lead_hot_from_automation(
  uuid,uuid,uuid,integer,text
) to service_role;
grant execute on function public.create_automation_approval_message(
  uuid,uuid,uuid,text,text,jsonb,text
) to service_role;
grant execute on function public.pause_automation_rule_from_runtime(
  uuid,uuid,text
) to service_role;
