-- Smart Visions AI Business OS 2027
-- SALES-NEXT-ACTION
--
-- Extends canonical CRM Task authority with a derived sales-action queue.
-- No second Task/reminder/ownership/automation/send queue is created.
-- Acceptance of a derived candidate is always an explicit human action that
-- materializes into public.crm_tasks. This migration seeds no Production rows.

alter table public.crm_tasks
  add column if not exists next_action_model_suggestion jsonb,
  add column if not exists next_action_model_suggested_at timestamptz,
  add column if not exists next_action_model_suggested_by_user_id uuid;

alter table public.crm_tasks
  drop constraint if exists crm_tasks_source_type_check;

alter table public.crm_tasks
  add constraint crm_tasks_source_type_check
  check (
    source_type in (
      'MANUAL',
      'NEXT_ACTION',
      'FOLLOWUP_JOB',
      'HANDOFF_EVENT',
      'REPLY_EVENT',
      'OPERATOR_BRIEF',
      'APPROVAL_REQUEST',
      'OTHER'
    )
  );

alter table public.crm_tasks
  add constraint crm_tasks_next_action_model_suggestion_check
  check (
    (
      next_action_model_suggestion is null
      and next_action_model_suggested_at is null
      and next_action_model_suggested_by_user_id is null
    )
    or (
      next_action_model_suggestion is not null
      and next_action_model_suggested_at is not null
      and next_action_model_suggested_by_user_id is not null
      and jsonb_typeof(next_action_model_suggestion)='object'
      and octet_length(next_action_model_suggestion::text) <= 8192
    )
  ),
  add constraint crm_tasks_next_action_model_actor_fk
    foreign key (organization_id,next_action_model_suggested_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict;

create index if not exists crm_tasks_next_action_model_actor_fk_idx
  on public.crm_tasks(organization_id,next_action_model_suggested_by_user_id)
  where next_action_model_suggested_by_user_id is not null;

drop index if exists public.crm_tasks_source_once_idx;
create unique index crm_tasks_source_once_idx
  on public.crm_tasks(organization_id,source_type,source_id)
  where source_type not in ('MANUAL','NEXT_ACTION')
    and source_id is not null;

drop policy if exists crm_tasks_manager_insert on public.crm_tasks;
create policy crm_tasks_manager_insert
on public.crm_tasks
for insert
to authenticated
with check (
  creator_type='USER'
  and created_by_user_id=(select auth.uid())
  and (
    (source_type='MANUAL' and source_id is null)
    or (
      source_type='NEXT_ACTION'
      and nullif(trim(source_id),'') is not null
    )
  )
  and public.crm_task_can_manage(organization_id,assignee_user_id)
);

create or replace function public.guard_crm_next_action_task_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,auth,pg_catalog
as $next_action_task_guard$
declare
  v_accept_marker text:=coalesce(current_setting('app.crm_next_action_accept',true),'');
  v_model_marker text:=coalesce(current_setting('app.crm_next_action_model_mutation',true),'');
begin
  if tg_op='INSERT' then
    if new.source_type='NEXT_ACTION' and v_accept_marker<>'1' then
      raise exception 'NEXT_ACTION CRM task must be accepted through governed candidate materialization';
    end if;

    if new.next_action_model_suggestion is not null
       or new.next_action_model_suggested_at is not null
       or new.next_action_model_suggested_by_user_id is not null
    then
      raise exception 'CRM task model suggestion cannot be supplied at creation';
    end if;
    return new;
  end if;

  if new.next_action_model_suggestion is distinct from old.next_action_model_suggestion
     or new.next_action_model_suggested_at is distinct from old.next_action_model_suggested_at
     or new.next_action_model_suggested_by_user_id is distinct from old.next_action_model_suggested_by_user_id
  then
    if current_user<>'service_role' or v_model_marker<>'1' then
      raise exception 'CRM task model suggestion requires trusted service boundary';
    end if;
  end if;

  return new;
end;
$next_action_task_guard$;

drop trigger if exists crm_tasks_next_action_guard on public.crm_tasks;
create trigger crm_tasks_next_action_guard
before insert or update on public.crm_tasks
for each row execute function public.guard_crm_next_action_task_mutation();

create or replace function public.get_crm_next_actions(
  p_organization_id uuid,
  p_stale_hours integer default 72,
  p_assignee_user_id uuid default null,
  p_limit integer default 100
)
returns table(
  candidate_key text,
  candidate_kind text,
  source_entity_type text,
  source_entity_id uuid,
  task_id uuid,
  business_id uuid,
  lead_id uuid,
  deal_id uuid,
  suggested_task_type text,
  title text,
  reason_code text,
  priority text,
  priority_score integer,
  assignee_user_id uuid,
  recommended_due_at timestamptz,
  recommended_reminder_at timestamptz,
  last_activity_at timestamptz,
  source_status text,
  accepted boolean,
  model_suggestion jsonb,
  model_suggested_at timestamptz
)
language plpgsql
stable
security invoker
set search_path=public,auth,pg_catalog
as $next_action_queue$
begin
  if p_stale_hours<1 or p_stale_hours>720 then
    raise exception 'stale hours must be between 1 and 720';
  end if;
  if p_limit<1 or p_limit>200 then
    raise exception 'next action limit must be between 1 and 200';
  end if;

  return query
  with task_queue as (
    select
      'TASK:'||t.id::text as candidate_key,
      case
        when t.reminder_at is not null
          and t.reminder_at<=now()
          and t.reminder_acknowledged_at is null
        then 'TASK_REMINDER_DUE'
        when t.due_at is not null and t.due_at<now() then 'TASK_OVERDUE'
        when t.status='BLOCKED' then 'TASK_BLOCKED'
        else 'TASK_OPEN'
      end as candidate_kind,
      'TASK'::text as source_entity_type,
      t.id as source_entity_id,
      t.id as task_id,
      t.business_id,
      t.lead_id,
      t.deal_id,
      t.task_type as suggested_task_type,
      t.title,
      case
        when t.reminder_at is not null
          and t.reminder_at<=now()
          and t.reminder_acknowledged_at is null
        then 'REMINDER_DUE'
        when t.due_at is not null and t.due_at<now() then 'TASK_OVERDUE'
        when t.status='BLOCKED' then 'TASK_BLOCKED'
        else 'OPEN_TASK'
      end as reason_code,
      t.priority,
      case
        when t.reminder_at is not null
          and t.reminder_at<=now()
          and t.reminder_acknowledged_at is null
        then 100
        when t.due_at is not null and t.due_at<now() then
          case t.priority when 'URGENT' then 99 when 'HIGH' then 97 when 'NORMAL' then 95 else 93 end
        when t.priority='URGENT' then 92
        when t.priority='HIGH' then 88
        when t.status='BLOCKED' then 75
        else 65
      end as priority_score,
      t.assignee_user_id,
      t.due_at as recommended_due_at,
      t.reminder_at as recommended_reminder_at,
      t.updated_at as last_activity_at,
      t.status as source_status,
      true as accepted,
      t.next_action_model_suggestion as model_suggestion,
      t.next_action_model_suggested_at as model_suggested_at
    from public.crm_tasks t
    where t.organization_id=p_organization_id
      and t.status not in ('DONE','CANCELED')
      and (p_assignee_user_id is null or t.assignee_user_id=p_assignee_user_id)
  ),
  lead_activity as (
    select
      l.id,
      l.business_id,
      l.status,
      greatest(
        l.updated_at,
        coalesce((
          select max(greatest(sc.updated_at,coalesce(sc.last_message_at,sc.updated_at)))
          from public.sales_conversations sc
          where sc.organization_id=l.organization_id
            and sc.lead_id=l.id
        ),l.updated_at),
        coalesce((
          select max(t2.updated_at)
          from public.crm_tasks t2
          where t2.organization_id=l.organization_id
            and t2.lead_id=l.id
        ),l.updated_at)
      ) as last_activity_at
    from public.leads l
    where l.organization_id=p_organization_id
      and l.status not in ('WON','LOST','DO_NOT_CONTACT')
      and not exists (
        select 1
        from public.crm_deals d
        where d.organization_id=l.organization_id
          and d.lead_id=l.id
          and d.state='OPEN'
      )
      and not exists (
        select 1
        from public.crm_tasks t
        where t.organization_id=l.organization_id
          and t.lead_id=l.id
          and t.status not in ('DONE','CANCELED')
      )
  ),
  lead_queue as (
    select
      'LEAD:'||la.id::text||':STALE' as candidate_key,
      'LEAD_STALE'::text as candidate_kind,
      'LEAD'::text as source_entity_type,
      la.id as source_entity_id,
      null::uuid as task_id,
      la.business_id,
      la.id as lead_id,
      null::uuid as deal_id,
      case
        when la.status in ('CONTACTED','REPLIED','INTERESTED','HOT','HUMAN')
        then 'FOLLOW_UP'
        else 'REVIEW'
      end as suggested_task_type,
      case
        when la.status in ('CONTACTED','REPLIED','INTERESTED','HOT','HUMAN')
        then 'Follow up stale Lead'
        else 'Review stale Lead'
      end as title,
      'LEAD_STALE'::text as reason_code,
      case
        when la.status in ('HOT','HUMAN','REPLIED','INTERESTED') then 'HIGH'
        else 'NORMAL'
      end as priority,
      case
        when la.status in ('HOT','HUMAN') then 84
        when la.status in ('REPLIED','INTERESTED') then 80
        when la.status in ('READY_TO_CONTACT','QUALIFIED','CONTACTED') then 72
        else 60
      end as priority_score,
      null::uuid as assignee_user_id,
      now()+case
        when la.status in ('HOT','HUMAN','REPLIED','INTERESTED') then interval '8 hours'
        else interval '24 hours'
      end as recommended_due_at,
      now()+case
        when la.status in ('HOT','HUMAN','REPLIED','INTERESTED') then interval '6 hours'
        else interval '20 hours'
      end as recommended_reminder_at,
      la.last_activity_at,
      la.status as source_status,
      false as accepted,
      null::jsonb as model_suggestion,
      null::timestamptz as model_suggested_at
    from lead_activity la
    where la.last_activity_at<now()-make_interval(hours=>p_stale_hours)
      and p_assignee_user_id is null
  ),
  deal_activity as (
    select
      d.id,
      d.business_id,
      d.lead_id,
      d.owner_user_id,
      d.state,
      d.expected_close_at,
      greatest(
        d.updated_at,
        coalesce((
          select max(t2.updated_at)
          from public.crm_tasks t2
          where t2.organization_id=d.organization_id
            and t2.deal_id=d.id
        ),d.updated_at)
      ) as last_activity_at
    from public.crm_deals d
    where d.organization_id=p_organization_id
      and d.state='OPEN'
      and (p_assignee_user_id is null or d.owner_user_id=p_assignee_user_id)
      and not exists (
        select 1
        from public.crm_tasks t
        where t.organization_id=d.organization_id
          and t.deal_id=d.id
          and t.status not in ('DONE','CANCELED')
      )
  ),
  deal_queue as (
    select
      'DEAL:'||da.id::text||':'||
        case when da.expected_close_at is not null and da.expected_close_at<now()
          then 'CLOSE_OVERDUE' else 'STALE' end as candidate_key,
      case when da.expected_close_at is not null and da.expected_close_at<now()
        then 'DEAL_CLOSE_OVERDUE' else 'DEAL_STALE' end as candidate_kind,
      'DEAL'::text as source_entity_type,
      da.id as source_entity_id,
      null::uuid as task_id,
      da.business_id,
      da.lead_id,
      da.id as deal_id,
      case when da.expected_close_at is not null and da.expected_close_at<now()
        then 'REVIEW' else 'FOLLOW_UP' end as suggested_task_type,
      case when da.expected_close_at is not null and da.expected_close_at<now()
        then 'Review overdue Deal close'
        else 'Follow up stale Deal'
      end as title,
      case when da.expected_close_at is not null and da.expected_close_at<now()
        then 'DEAL_CLOSE_OVERDUE' else 'DEAL_STALE' end as reason_code,
      'HIGH'::text as priority,
      case when da.expected_close_at is not null and da.expected_close_at<now()
        then 94 else 82 end as priority_score,
      da.owner_user_id as assignee_user_id,
      now()+case when da.expected_close_at is not null and da.expected_close_at<now()
        then interval '4 hours' else interval '12 hours' end as recommended_due_at,
      now()+case when da.expected_close_at is not null and da.expected_close_at<now()
        then interval '2 hours' else interval '10 hours' end as recommended_reminder_at,
      da.last_activity_at,
      da.state as source_status,
      false as accepted,
      null::jsonb as model_suggestion,
      null::timestamptz as model_suggested_at
    from deal_activity da
    where (
      da.expected_close_at is not null and da.expected_close_at<now()
    ) or (
      da.last_activity_at<now()-make_interval(hours=>p_stale_hours)
    )
  ),
  combined as (
    select * from task_queue
    union all
    select * from lead_queue
    union all
    select * from deal_queue
  )
  select
    q.candidate_key,
    q.candidate_kind,
    q.source_entity_type,
    q.source_entity_id,
    q.task_id,
    q.business_id,
    q.lead_id,
    q.deal_id,
    q.suggested_task_type,
    q.title,
    q.reason_code,
    q.priority,
    q.priority_score,
    q.assignee_user_id,
    q.recommended_due_at,
    q.recommended_reminder_at,
    q.last_activity_at,
    q.source_status,
    q.accepted,
    q.model_suggestion,
    q.model_suggested_at
  from combined q
  order by q.priority_score desc,q.last_activity_at asc,q.candidate_key
  limit p_limit;
end;
$next_action_queue$;

create or replace function public.accept_crm_next_action_candidate(
  p_organization_id uuid,
  p_candidate_kind text,
  p_entity_id uuid,
  p_assignee_user_id uuid default null,
  p_due_at timestamptz default null,
  p_reminder_at timestamptz default null,
  p_request_key text default null,
  p_stale_hours integer default 72
)
returns table(
  resolved_task_id uuid,
  replayed boolean
)
language plpgsql
security invoker
set search_path=public,auth,pg_catalog
as $accept_next_action$
declare
  v_actor uuid:=auth.uid();
  v_business_id uuid;
  v_lead_id uuid;
  v_deal_id uuid;
  v_assignee uuid;
  v_source_id text;
  v_title text;
  v_task_type text;
  v_priority text;
  v_reason_code text;
  v_status text;
  v_expected_close timestamptz;
  v_last_activity timestamptz;
  v_due timestamptz;
  v_reminder timestamptz;
  v_existing record;
  v_task_id uuid;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if p_candidate_kind not in ('LEAD_STALE','DEAL_STALE','DEAL_CLOSE_OVERDUE') then
    raise exception 'unsupported next action candidate kind';
  end if;
  if p_stale_hours<1 or p_stale_hours>720 then
    raise exception 'stale hours must be between 1 and 720';
  end if;
  if nullif(trim(p_request_key),'') is null or length(trim(p_request_key))>200 then
    raise exception 'invalid next action request key';
  end if;

  v_source_id:=case
    when p_candidate_kind='LEAD_STALE'
      then 'LEAD:'||p_entity_id::text||':STALE'
    when p_candidate_kind='DEAL_CLOSE_OVERDUE'
      then 'DEAL:'||p_entity_id::text||':CLOSE_OVERDUE'
    else 'DEAL:'||p_entity_id::text||':STALE'
  end;

  select
    t.id,t.source_type,t.source_id
  into v_existing
  from public.crm_tasks t
  where t.organization_id=p_organization_id
    and t.request_key=trim(p_request_key);

  if found then
    if v_existing.source_type='NEXT_ACTION'
       and v_existing.source_id=v_source_id
    then
      return query select v_existing.id,true;
      return;
    end if;
    raise exception 'next action request key was reused with different semantics';
  end if;

  if p_candidate_kind='LEAD_STALE' then
    select
      l.business_id,
      l.id,
      l.status,
      greatest(
        l.updated_at,
        coalesce((
          select max(greatest(sc.updated_at,coalesce(sc.last_message_at,sc.updated_at)))
          from public.sales_conversations sc
          where sc.organization_id=l.organization_id
            and sc.lead_id=l.id
        ),l.updated_at),
        coalesce((
          select max(t2.updated_at)
          from public.crm_tasks t2
          where t2.organization_id=l.organization_id
            and t2.lead_id=l.id
        ),l.updated_at)
      )
    into v_business_id,v_lead_id,v_status,v_last_activity
    from public.leads l
    where l.organization_id=p_organization_id
      and l.id=p_entity_id
      and l.status not in ('WON','LOST','DO_NOT_CONTACT');

    if not found then
      raise exception 'Lead next action candidate not found';
    end if;
    if exists (
      select 1 from public.crm_deals d
      where d.organization_id=p_organization_id
        and d.lead_id=v_lead_id
        and d.state='OPEN'
    ) then
      raise exception 'Lead next action is superseded by an OPEN Deal';
    end if;
    if exists (
      select 1 from public.crm_tasks t
      where t.organization_id=p_organization_id
        and t.lead_id=v_lead_id
        and t.status not in ('DONE','CANCELED')
    ) then
      raise exception 'Lead already has an active CRM task';
    end if;
    if v_last_activity>=now()-make_interval(hours=>p_stale_hours) then
      raise exception 'Lead is not stale under the requested policy window';
    end if;

    v_assignee:=coalesce(p_assignee_user_id,v_actor);
    v_deal_id:=null;
    v_source_id:='LEAD:'||v_lead_id::text||':STALE';
    v_reason_code:='LEAD_STALE';
    v_task_type:=case
      when v_status in ('CONTACTED','REPLIED','INTERESTED','HOT','HUMAN')
      then 'FOLLOW_UP' else 'REVIEW' end;
    v_title:=case
      when v_task_type='FOLLOW_UP' then 'Follow up stale Lead'
      else 'Review stale Lead' end;
    v_priority:=case
      when v_status in ('HOT','HUMAN','REPLIED','INTERESTED') then 'HIGH'
      else 'NORMAL' end;
    v_due:=coalesce(
      p_due_at,
      now()+case when v_priority='HIGH' then interval '8 hours' else interval '24 hours' end
    );
  else
    select
      d.business_id,
      d.lead_id,
      d.id,
      d.owner_user_id,
      d.state,
      d.expected_close_at,
      greatest(
        d.updated_at,
        coalesce((
          select max(t2.updated_at)
          from public.crm_tasks t2
          where t2.organization_id=d.organization_id
            and t2.deal_id=d.id
        ),d.updated_at)
      )
    into
      v_business_id,v_lead_id,v_deal_id,v_assignee,
      v_status,v_expected_close,v_last_activity
    from public.crm_deals d
    where d.organization_id=p_organization_id
      and d.id=p_entity_id
      and d.state='OPEN';

    if not found then
      raise exception 'Deal next action candidate not found';
    end if;
    if exists (
      select 1 from public.crm_tasks t
      where t.organization_id=p_organization_id
        and t.deal_id=v_deal_id
        and t.status not in ('DONE','CANCELED')
    ) then
      raise exception 'Deal already has an active CRM task';
    end if;

    if p_candidate_kind='DEAL_CLOSE_OVERDUE' then
      if v_expected_close is null or v_expected_close>=now() then
        raise exception 'Deal expected close is not overdue';
      end if;
      v_reason_code:='DEAL_CLOSE_OVERDUE';
      v_task_type:='REVIEW';
      v_title:='Review overdue Deal close';
      v_due:=coalesce(p_due_at,now()+interval '4 hours');
    else
      if v_expected_close is not null and v_expected_close<now() then
        raise exception 'Deal stale candidate is superseded by overdue close candidate';
      end if;
      if v_last_activity>=now()-make_interval(hours=>p_stale_hours) then
        raise exception 'Deal is not stale under the requested policy window';
      end if;
      v_reason_code:='DEAL_STALE';
      v_task_type:='FOLLOW_UP';
      v_title:='Follow up stale Deal';
      v_due:=coalesce(p_due_at,now()+interval '12 hours');
    end if;

    v_assignee:=coalesce(p_assignee_user_id,v_assignee);
    v_source_id:='DEAL:'||v_deal_id::text||':'||
      case when v_reason_code='DEAL_CLOSE_OVERDUE' then 'CLOSE_OVERDUE' else 'STALE' end;
    v_priority:='HIGH';
  end if;

  if not public.crm_task_can_manage(p_organization_id,v_assignee) then
    raise exception 'next action Task assignment is not permitted';
  end if;

  if v_due<=now()-interval '1 minute' then
    raise exception 'next action due time cannot be in the past';
  end if;

  v_reminder:=coalesce(
    p_reminder_at,
    greatest(now(),v_due-interval '1 hour')
  );
  if v_reminder>v_due then
    raise exception 'next action reminder cannot be after due time';
  end if;

  perform set_config('app.crm_next_action_accept','1',true);

  insert into public.crm_tasks(
    organization_id,
    business_id,
    lead_id,
    deal_id,
    task_type,
    title,
    status,
    priority,
    assignee_user_id,
    due_at,
    reminder_at,
    source_type,
    source_id,
    request_key,
    creator_type,
    created_by_user_id,
    metadata
  ) values (
    p_organization_id,
    v_business_id,
    v_lead_id,
    v_deal_id,
    v_task_type,
    v_title,
    'OPEN',
    v_priority,
    v_assignee,
    v_due,
    v_reminder,
    'NEXT_ACTION',
    v_source_id,
    trim(p_request_key),
    'USER',
    v_actor,
    jsonb_build_object(
      'nextActionPolicyVersion','sales-next-action-v1',
      'reasonCode',v_reason_code,
      'staleHours',p_stale_hours,
      'lastActivityAt',v_last_activity
    )
  )
  returning id into v_task_id;

  perform set_config('app.crm_next_action_accept','',true);

  return query select v_task_id,false;
end;
$accept_next_action$;

create or replace function public.record_crm_task_next_action_model_suggestion(
  p_organization_id uuid,
  p_task_id uuid,
  p_actor_user_id uuid,
  p_suggestion jsonb
)
returns table(
  resolved_task_id uuid,
  cleared boolean
)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $record_next_action_model$
declare
  v_role text;
  v_assignee uuid;
  v_status text;
  v_key text;
  v_action text;
  v_confidence numeric;
begin
  select m.role into v_role
  from public.organization_members m
  where m.organization_id=p_organization_id
    and m.user_id=p_actor_user_id;

  if v_role is null or v_role not in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT') then
    raise exception 'next action model suggestion actor is not permitted';
  end if;

  select t.assignee_user_id,t.status
    into v_assignee,v_status
  from public.crm_tasks t
  where t.organization_id=p_organization_id
    and t.id=p_task_id;

  if not found then
    raise exception 'CRM task not found';
  end if;
  if v_status in ('DONE','CANCELED') then
    raise exception 'terminal CRM task cannot receive a next action model suggestion';
  end if;
  if v_role='SALES_AGENT' and v_assignee is distinct from p_actor_user_id then
    raise exception 'Sales Agent can request model suggestion only for own CRM task';
  end if;

  if p_suggestion is not null then
    if jsonb_typeof(p_suggestion)<>'object'
       or octet_length(p_suggestion::text)>8192
       or jsonb_typeof(p_suggestion->'action')<>'string'
       or nullif(trim(p_suggestion->>'action'),'') is null
       or p_suggestion->>'action' not in (
         'CALL','EMAIL','WHATSAPP','MEETING','REVIEW','FOLLOW_UP','OTHER'
       )
       or jsonb_typeof(p_suggestion->'model')<>'string'
       or nullif(trim(p_suggestion->>'model'),'') is null
       or length(trim(p_suggestion->>'model'))>120
       or jsonb_typeof(p_suggestion->'modelVersion')<>'string'
       or nullif(trim(p_suggestion->>'modelVersion'),'') is null
       or length(trim(p_suggestion->>'modelVersion'))>120
       or not (p_suggestion ? 'confidence')
       or jsonb_typeof(p_suggestion->'confidence')<>'number'
    then
      raise exception 'invalid next action model suggestion contract';
    end if;

    begin
      v_confidence:=(p_suggestion->>'confidence')::numeric;
    exception when others then
      raise exception 'next action model suggestion confidence must be numeric';
    end;

    if v_confidence<0 or v_confidence>1 then
      raise exception 'next action model suggestion confidence must be between 0 and 1';
    end if;
    if p_suggestion ? 'rationale'
       and (
         jsonb_typeof(p_suggestion->'rationale')<>'string'
         or length(p_suggestion->>'rationale')>1200
       )
    then
      raise exception 'next action model suggestion rationale is invalid';
    end if;

    for v_key in select jsonb_object_keys(p_suggestion)
    loop
      if v_key not in ('action','rationale','confidence','model','modelVersion') then
        raise exception 'next action model suggestion contains unsupported field';
      end if;
    end loop;
  end if;

  perform set_config('app.crm_next_action_model_mutation','1',true);

  update public.crm_tasks
  set
    next_action_model_suggestion=p_suggestion,
    next_action_model_suggested_at=case when p_suggestion is null then null else now() end,
    next_action_model_suggested_by_user_id=case when p_suggestion is null then null else p_actor_user_id end
  where organization_id=p_organization_id
    and id=p_task_id;

  perform set_config('app.crm_next_action_model_mutation','',true);

  return query select p_task_id,p_suggestion is null;
end;
$record_next_action_model$;

create or replace function public.audit_crm_next_action_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,auth,pg_catalog
as $next_action_audit$
declare
  v_action text;
  v_after jsonb;
begin
  if tg_op='INSERT' and new.source_type='NEXT_ACTION' then
    v_action:='CRM_NEXT_ACTION_ACCEPTED';
    v_after:=jsonb_strip_nulls(jsonb_build_object(
      'sourceId',new.source_id,
      'reasonCode',new.metadata->>'reasonCode',
      'taskType',new.task_type,
      'priority',new.priority,
      'assigneeUserId',new.assignee_user_id,
      'dueAt',new.due_at,
      'reminderAt',new.reminder_at,
      'version',new.version
    ));
  elsif tg_op='UPDATE'
     and (
       new.next_action_model_suggestion is distinct from old.next_action_model_suggestion
       or new.next_action_model_suggested_at is distinct from old.next_action_model_suggested_at
       or new.next_action_model_suggested_by_user_id is distinct from old.next_action_model_suggested_by_user_id
     )
  then
    v_action:=case
      when new.next_action_model_suggestion is null
      then 'CRM_NEXT_ACTION_MODEL_SUGGESTION_CLEARED'
      else 'CRM_NEXT_ACTION_MODEL_SUGGESTED'
    end;
    v_after:=jsonb_strip_nulls(jsonb_build_object(
      'action',new.next_action_model_suggestion->>'action',
      'confidence',new.next_action_model_suggestion->>'confidence',
      'model',new.next_action_model_suggestion->>'model',
      'modelVersion',new.next_action_model_suggestion->>'modelVersion',
      'suggestedByUserId',new.next_action_model_suggested_by_user_id,
      'version',new.version
    ));
  else
    return new;
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,
    entity_type,entity_id,before_data,after_data,correlation_id
  ) values (
    new.organization_id,
    case when auth.uid() is null then 'SYSTEM' else 'USER' end,
    coalesce(auth.uid()::text,new.next_action_model_suggested_by_user_id::text,current_user),
    v_action,
    'crm_tasks',
    new.id::text,
    null,
    v_after,
    'dbtx:'||txid_current()::text
  );

  return new;
end;
$next_action_audit$;

drop trigger if exists crm_tasks_next_action_audit on public.crm_tasks;
create trigger crm_tasks_next_action_audit
after insert or update on public.crm_tasks
for each row execute function public.audit_crm_next_action_mutation();

revoke all on function public.guard_crm_next_action_task_mutation()
  from public,anon,authenticated,service_role;
revoke all on function public.audit_crm_next_action_mutation()
  from public,anon,authenticated,service_role;

revoke all on function public.get_crm_next_actions(uuid,integer,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_crm_next_actions(uuid,integer,uuid,integer)
  to authenticated;

revoke all on function public.accept_crm_next_action_candidate(
  uuid,text,uuid,uuid,timestamptz,timestamptz,text,integer
) from public,anon,authenticated,service_role;
grant execute on function public.accept_crm_next_action_candidate(
  uuid,text,uuid,uuid,timestamptz,timestamptz,text,integer
) to authenticated;

revoke all on function public.record_crm_task_next_action_model_suggestion(
  uuid,uuid,uuid,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.record_crm_task_next_action_model_suggestion(
  uuid,uuid,uuid,jsonb
) to service_role;

grant select(
  id,
  organization_id,
  status,
  assignee_user_id,
  next_action_model_suggestion,
  next_action_model_suggested_at,
  next_action_model_suggested_by_user_id
) on public.crm_tasks to service_role;

grant update(
  next_action_model_suggestion,
  next_action_model_suggested_at,
  next_action_model_suggested_by_user_id,
  updated_at
) on public.crm_tasks to service_role;

comment on function public.get_crm_next_actions(uuid,integer,uuid,integer) is
  'Derived human action queue over canonical Tasks, Leads, Deals and Conversation activity. Read-only; no send or workflow side effect.';
comment on function public.accept_crm_next_action_candidate(
  uuid,text,uuid,uuid,timestamptz,timestamptz,text,integer
) is
  'Explicit human acceptance of a stale Lead/Deal candidate into canonical crm_tasks. Never sends a customer message.';
comment on column public.crm_tasks.next_action_model_suggestion is
  'Advisory-only model suggestion for an existing CRM Task. It never mutates task status, owner, due time or provider send state.';
