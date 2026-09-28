-- 0131: CRM Activity + Task v2 over the existing canonical crm_tasks authority.
--
-- Scope:
-- - keep crm_tasks as the only actionable human-work store;
-- - keep crm_customer_timeline / audit_logs / deal history as activity evidence;
-- - add Deal linkage and evidence-backed reminder semantics;
-- - expose bounded due/overdue/reminder reads and task activity history;
-- - do not invent Booking/Order/Support Case links before those authorities exist;
-- - do not introduce a second activity/event store.
--
-- Recurrence is intentionally not materialized here. Production has zero real CRM
-- Tasks at this checkpoint, so no recurring-work use case has evidence yet.

alter table public.crm_tasks
  add column if not exists deal_id uuid,
  add column if not exists reminder_at timestamptz,
  add column if not exists reminder_acknowledged_at timestamptz;

do $crm_task_v2_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_tasks_deal_fk'
      and conrelid = 'public.crm_tasks'::regclass
  ) then
    alter table public.crm_tasks
      add constraint crm_tasks_deal_fk
      foreign key (organization_id, deal_id)
      references public.crm_deals(organization_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_tasks_deal_requires_business_check'
      and conrelid = 'public.crm_tasks'::regclass
  ) then
    alter table public.crm_tasks
      add constraint crm_tasks_deal_requires_business_check
      check (deal_id is null or business_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_tasks_reminder_contract_check'
      and conrelid = 'public.crm_tasks'::regclass
  ) then
    alter table public.crm_tasks
      add constraint crm_tasks_reminder_contract_check
      check (
        reminder_acknowledged_at is null
        or reminder_at is not null
      );
  end if;
end;
$crm_task_v2_constraints$;

create index if not exists crm_tasks_org_deal_status_idx
  on public.crm_tasks(organization_id, deal_id, status, updated_at desc)
  where deal_id is not null;

create index if not exists crm_tasks_org_person_status_due_idx
  on public.crm_tasks(organization_id, person_id, status, due_at)
  where person_id is not null;

create index if not exists crm_tasks_org_reminder_due_idx
  on public.crm_tasks(organization_id, reminder_at, status)
  where reminder_at is not null
    and reminder_acknowledged_at is null
    and status not in ('DONE','CANCELED');

create or replace function public.guard_crm_task_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $task_guard$
declare
  v_actor uuid := auth.uid();
  v_deal_business uuid;
  v_deal_lead uuid;
begin
  if new.deal_id is not null then
    select d.business_id, d.lead_id
      into v_deal_business, v_deal_lead
    from public.crm_deals d
    where d.organization_id = new.organization_id
      and d.id = new.deal_id;

    if v_deal_business is null then
      raise exception 'CRM task Deal was not found in the Organization';
    end if;
    if new.business_id is distinct from v_deal_business then
      raise exception 'CRM task Deal must match task Business';
    end if;
    if new.lead_id is not null
       and new.lead_id is distinct from v_deal_lead
    then
      raise exception 'CRM task Deal/Lead lineage mismatch';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'OPEN' then
      raise exception 'CRM task must be created in OPEN state';
    end if;

    if new.creator_type = 'USER' then
      if v_actor is null or new.created_by_user_id is distinct from v_actor then
        raise exception 'CRM task USER creator must match auth.uid()';
      end if;
    end if;

    if new.reminder_at is null then
      new.reminder_acknowledged_at := null;
    elsif new.reminder_acknowledged_at is not null then
      raise exception 'CRM task reminder cannot be acknowledged at creation';
    end if;

    new.version := 1;
    new.updated_at := coalesce(new.updated_at, now());
    new.completed_at := null;
    new.completed_by_user_id := null;
    new.canceled_at := null;
    new.canceled_by_user_id := null;
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable for CRM task';
  end if;
  if new.created_by_user_id is distinct from old.created_by_user_id
     or new.creator_type is distinct from old.creator_type
  then
    raise exception 'CRM task creator is immutable';
  end if;
  if new.source_type is distinct from old.source_type
     or new.source_id is distinct from old.source_id
  then
    raise exception 'CRM task source is immutable';
  end if;
  if new.request_key is distinct from old.request_key then
    raise exception 'CRM task request_key is immutable';
  end if;
  if new.business_id is distinct from old.business_id
     or new.lead_id is distinct from old.lead_id
     or new.conversation_id is distinct from old.conversation_id
     or new.deal_id is distinct from old.deal_id
  then
    raise exception 'CRM task CRM scope is immutable';
  end if;

  if new.reminder_at is distinct from old.reminder_at then
    if old.status in ('DONE','CANCELED') then
      raise exception 'Terminal CRM task reminder is immutable';
    end if;
    new.reminder_acknowledged_at := null;
  elsif new.reminder_at is null then
    new.reminder_acknowledged_at := null;
  elsif new.reminder_acknowledged_at is distinct from old.reminder_acknowledged_at then
    if old.status in ('DONE','CANCELED') then
      raise exception 'Terminal CRM task reminder acknowledgement is immutable';
    end if;
    if old.reminder_acknowledged_at is not null
       and new.reminder_acknowledged_at is null
    then
      raise exception 'Acknowledged CRM task reminder must be rescheduled to reopen';
    end if;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'OPEN'
       and new.status not in ('IN_PROGRESS','BLOCKED','DONE','CANCELED')
    then
      raise exception 'invalid CRM task transition % -> %', old.status, new.status;
    elsif old.status = 'IN_PROGRESS'
       and new.status not in ('OPEN','BLOCKED','DONE','CANCELED')
    then
      raise exception 'invalid CRM task transition % -> %', old.status, new.status;
    elsif old.status = 'BLOCKED'
       and new.status not in ('OPEN','IN_PROGRESS','DONE','CANCELED')
    then
      raise exception 'invalid CRM task transition % -> %', old.status, new.status;
    elsif old.status = 'DONE'
       and new.status <> 'OPEN'
    then
      raise exception 'invalid CRM task transition % -> %', old.status, new.status;
    elsif old.status = 'CANCELED' then
      raise exception 'CANCELED CRM task is terminal';
    end if;
  end if;

  if new.status = 'DONE' then
    if old.status = 'DONE' then
      new.completed_at := old.completed_at;
      new.completed_by_user_id := old.completed_by_user_id;
    else
      new.completed_at := now();
      new.completed_by_user_id := v_actor;
    end if;
    new.canceled_at := null;
    new.canceled_by_user_id := null;
  else
    new.completed_at := null;
    new.completed_by_user_id := null;
  end if;

  if new.status = 'CANCELED' then
    if old.status = 'CANCELED' then
      new.canceled_at := old.canceled_at;
      new.canceled_by_user_id := old.canceled_by_user_id;
    else
      new.canceled_at := now();
      new.canceled_by_user_id := v_actor;
    end if;
    new.completed_at := null;
    new.completed_by_user_id := null;
  else
    new.canceled_at := null;
    new.canceled_by_user_id := null;
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$task_guard$;

create or replace function public.audit_crm_task_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $task_audit$
declare
  v_actor uuid := auth.uid();
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'CRM_TASK_CREATED';
    v_before := null;
  elsif new.status is distinct from old.status then
    v_action := 'CRM_TASK_STATUS_CHANGED';
    v_before := jsonb_strip_nulls(jsonb_build_object(
      'status', old.status,
      'priority', old.priority,
      'assignee_user_id', old.assignee_user_id,
      'due_at', old.due_at,
      'reminder_at', old.reminder_at,
      'reminder_acknowledged_at', old.reminder_acknowledged_at,
      'version', old.version
    ));
  elsif new.reminder_at is distinct from old.reminder_at
     or new.reminder_acknowledged_at is distinct from old.reminder_acknowledged_at
  then
    v_action := 'CRM_TASK_REMINDER_CHANGED';
    v_before := jsonb_strip_nulls(jsonb_build_object(
      'reminder_at', old.reminder_at,
      'reminder_acknowledged_at', old.reminder_acknowledged_at,
      'version', old.version
    ));
  else
    v_action := 'CRM_TASK_UPDATED';
    v_before := jsonb_strip_nulls(jsonb_build_object(
      'status', old.status,
      'priority', old.priority,
      'assignee_user_id', old.assignee_user_id,
      'due_at', old.due_at,
      'version', old.version
    ));
  end if;

  v_after := jsonb_strip_nulls(jsonb_build_object(
    'business_id', new.business_id,
    'lead_id', new.lead_id,
    'conversation_id', new.conversation_id,
    'deal_id', new.deal_id,
    'person_id', new.person_id,
    'task_type', new.task_type,
    'status', new.status,
    'priority', new.priority,
    'assignee_user_id', new.assignee_user_id,
    'due_at', new.due_at,
    'reminder_at', new.reminder_at,
    'reminder_acknowledged_at', new.reminder_acknowledged_at,
    'source_type', new.source_type,
    'source_id', new.source_id,
    'version', new.version
  ));

  insert into public.audit_logs(
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    correlation_id
  ) values (
    new.organization_id,
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    coalesce(v_actor::text, current_user),
    v_action,
    'crm_tasks',
    new.id::text,
    v_before,
    v_after,
    'dbtx:' || txid_current()::text
  );

  return new;
end;
$task_audit$;

create or replace view public.crm_tasks_v2
with (security_invoker = true)
as
select
  t.*,
  (
    t.status not in ('DONE','CANCELED')
    and t.due_at is not null
    and t.due_at < now()
  ) as is_overdue,
  (
    t.status not in ('DONE','CANCELED')
    and t.reminder_at is not null
    and t.reminder_acknowledged_at is null
    and t.reminder_at <= now()
  ) as reminder_due
from public.crm_tasks t;

comment on view public.crm_tasks_v2 is
  'Security-invoker Task v2 read model over canonical crm_tasks with derived overdue/reminder state.';

create or replace function public.get_crm_tasks_v2(
  p_organization_id uuid,
  p_business_id uuid default null,
  p_lead_id uuid default null,
  p_deal_id uuid default null,
  p_person_id uuid default null,
  p_assignee_user_id uuid default null,
  p_status text default null,
  p_overdue_only boolean default false,
  p_reminder_due_only boolean default false,
  p_include_closed boolean default false,
  p_limit integer default 50,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns setof public.crm_tasks_v2
language sql
stable
security invoker
set search_path = public, pg_catalog
as $task_v2_query$
  select t.*
  from public.crm_tasks_v2 t
  where t.organization_id = p_organization_id
    and (p_business_id is null or t.business_id = p_business_id)
    and (p_lead_id is null or t.lead_id = p_lead_id)
    and (p_deal_id is null or t.deal_id = p_deal_id)
    and (p_person_id is null or t.person_id = p_person_id)
    and (p_assignee_user_id is null or t.assignee_user_id = p_assignee_user_id)
    and (p_status is null or t.status = p_status)
    and (not p_overdue_only or t.is_overdue)
    and (not p_reminder_due_only or t.reminder_due)
    and (
      p_include_closed
      or t.status not in ('DONE','CANCELED')
    )
    and (
      p_before_updated_at is null
      or t.updated_at < p_before_updated_at
      or (
        t.updated_at = p_before_updated_at
        and p_before_id is not null
        and t.id < p_before_id
      )
    )
  order by t.updated_at desc, t.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 101);
$task_v2_query$;

create or replace view public.crm_task_activity_v2
with (security_invoker = true)
as
select
  'task_audit:' || a.id::text as activity_id,
  a.organization_id,
  t.business_id,
  t.lead_id,
  t.conversation_id,
  t.deal_id,
  t.person_id,
  t.id as task_id,
  a.action,
  a.actor_type,
  a.actor_id,
  a.before_data,
  a.after_data,
  a.created_at as occurred_at
from public.audit_logs a
join public.crm_tasks t
  on t.organization_id = a.organization_id
 and t.id::text = a.entity_id
where a.entity_type = 'crm_tasks'
  and a.action in (
    'CRM_TASK_CREATED',
    'CRM_TASK_STATUS_CHANGED',
    'CRM_TASK_REMINDER_CHANGED',
    'CRM_TASK_UPDATED'
  );

comment on view public.crm_task_activity_v2 is
  'Immutable Task activity read model over canonical audit evidence; no second activity event store.';

create or replace function public.get_crm_task_activity_v2(
  p_organization_id uuid,
  p_task_id uuid,
  p_limit integer default 50,
  p_before_at timestamptz default null,
  p_before_activity_id text default null
)
returns setof public.crm_task_activity_v2
language sql
stable
security invoker
set search_path = public, pg_catalog
as $task_activity_query$
  select a.*
  from public.crm_task_activity_v2 a
  where a.organization_id = p_organization_id
    and a.task_id = p_task_id
    and (
      p_before_at is null
      or a.occurred_at < p_before_at
      or (
        a.occurred_at = p_before_at
        and p_before_activity_id is not null
        and a.activity_id < p_before_activity_id
      )
    )
  order by a.occurred_at desc, a.activity_id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 101);
$task_activity_query$;

create or replace function public.acknowledge_crm_task_reminder(
  p_organization_id uuid,
  p_task_id uuid
)
returns table (
  resolved_task_id uuid,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $task_reminder_ack$
declare
  v_assignee uuid;
  v_status text;
  v_reminder_at timestamptz;
  v_ack_at timestamptz;
begin
  select t.assignee_user_id, t.status, t.reminder_at, t.reminder_acknowledged_at
    into v_assignee, v_status, v_reminder_at, v_ack_at
  from public.crm_tasks t
  where t.organization_id = p_organization_id
    and t.id = p_task_id
  for update;

  if not found then
    raise exception 'CRM task was not found in the Organization';
  end if;

  if not public.crm_task_can_manage(p_organization_id, v_assignee) then
    raise exception 'CRM task reminder acknowledgement is not allowed';
  end if;

  if v_status in ('DONE','CANCELED') then
    raise exception 'Terminal CRM task reminder cannot be acknowledged';
  end if;

  if v_reminder_at is null then
    raise exception 'CRM task has no scheduled reminder';
  end if;

  if v_ack_at is not null then
    return query select p_task_id, true;
    return;
  end if;

  update public.crm_tasks
     set reminder_acknowledged_at = now()
   where organization_id = p_organization_id
     and id = p_task_id;

  return query select p_task_id, false;
end;
$task_reminder_ack$;

revoke all on public.crm_tasks_v2
  from public, anon, authenticated, service_role;
grant select on public.crm_tasks_v2 to authenticated;

revoke all on public.crm_task_activity_v2
  from public, anon, authenticated, service_role;
grant select on public.crm_task_activity_v2 to authenticated;

revoke all on function public.get_crm_tasks_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,text,boolean,boolean,boolean,integer,timestamptz,uuid
) from public, anon, authenticated, service_role;
grant execute on function public.get_crm_tasks_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,text,boolean,boolean,boolean,integer,timestamptz,uuid
) to authenticated;

revoke all on function public.get_crm_task_activity_v2(
  uuid,uuid,integer,timestamptz,text
) from public, anon, authenticated, service_role;
grant execute on function public.get_crm_task_activity_v2(
  uuid,uuid,integer,timestamptz,text
) to authenticated;

revoke all on function public.acknowledge_crm_task_reminder(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.acknowledge_crm_task_reminder(uuid,uuid)
  to authenticated;

comment on column public.crm_tasks.deal_id is
  'Optional canonical CRM Deal scope. Booking/Order/Support Case links are not fabricated before their authorities exist.';
comment on column public.crm_tasks.reminder_at is
  'Operator reminder schedule. Delivery/notification side effects remain owned by the canonical automation/notification runtime.';
