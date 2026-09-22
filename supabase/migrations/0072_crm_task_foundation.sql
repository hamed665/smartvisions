-- Smart Visions AI Business OS 2027
-- Phase 3 / CRM Task Foundation
--
-- Activity remains immutable evidence in the existing Customer 360 Timeline.
-- This migration adds only actionable human work. It does not clone follow-up,
-- handoff, reply, approval, operator or provider event stores.

create unique index if not exists leads_organization_id_id_business_id_unique
  on public.leads(organization_id, id, business_id);

create unique index if not exists sales_conversations_organization_id_id_lead_id_unique
  on public.sales_conversations(organization_id, id, lead_id);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid,
  lead_id uuid,
  conversation_id uuid,

  task_type text not null default 'GENERAL'
    check (task_type in (
      'GENERAL','CALL','EMAIL','WHATSAPP','MEETING','REVIEW','FOLLOW_UP','OTHER'
    )),
  title text not null
    check (length(trim(title)) between 1 and 240),
  description text
    check (description is null or length(description) <= 8000),

  status text not null default 'OPEN'
    check (status in ('OPEN','IN_PROGRESS','BLOCKED','DONE','CANCELED')),
  priority text not null default 'NORMAL'
    check (priority in ('LOW','NORMAL','HIGH','URGENT')),

  assignee_user_id uuid,
  due_at timestamptz,
  blocked_reason text
    check (blocked_reason is null or length(blocked_reason) <= 2000),
  completion_note text
    check (completion_note is null or length(completion_note) <= 4000),

  source_type text not null default 'MANUAL'
    check (source_type in (
      'MANUAL','FOLLOWUP_JOB','HANDOFF_EVENT','REPLY_EVENT',
      'OPERATOR_BRIEF','APPROVAL_REQUEST','OTHER'
    )),
  source_id text,
  request_key text not null
    check (length(trim(request_key)) between 1 and 200),

  creator_type text not null default 'USER'
    check (creator_type in ('USER','SYSTEM')),
  created_by_user_id uuid,
  completed_by_user_id uuid,
  canceled_by_user_id uuid,

  completed_at timestamptz,
  canceled_at timestamptz,
  version integer not null default 1 check (version >= 1),

  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),
  unique (organization_id, request_key),

  check (
    (creator_type = 'USER' and created_by_user_id is not null)
    or (creator_type = 'SYSTEM' and created_by_user_id is null)
  ),
  check (conversation_id is null or lead_id is not null),
  check (lead_id is null or business_id is not null),
  check (
    (source_type = 'MANUAL' and source_id is null)
    or (source_type <> 'MANUAL' and nullif(trim(source_id), '') is not null)
  ),

  foreign key (organization_id, business_id)
    references public.businesses(organization_id, id)
    on delete restrict,
  foreign key (organization_id, lead_id, business_id)
    references public.leads(organization_id, id, business_id)
    on delete restrict,
  foreign key (organization_id, conversation_id, lead_id)
    references public.sales_conversations(organization_id, id, lead_id)
    on delete restrict,
  foreign key (organization_id, assignee_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  foreign key (organization_id, completed_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  foreign key (organization_id, canceled_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create unique index if not exists crm_tasks_source_once_idx
  on public.crm_tasks(organization_id, source_type, source_id)
  where source_type <> 'MANUAL' and source_id is not null;

create index if not exists crm_tasks_org_status_due_idx
  on public.crm_tasks(organization_id, status, due_at);

create index if not exists crm_tasks_org_assignee_status_due_idx
  on public.crm_tasks(organization_id, assignee_user_id, status, due_at);

create index if not exists crm_tasks_org_business_status_idx
  on public.crm_tasks(organization_id, business_id, status)
  where business_id is not null;

create index if not exists crm_tasks_org_lead_status_idx
  on public.crm_tasks(organization_id, lead_id, status)
  where lead_id is not null;

create index if not exists crm_tasks_org_conversation_idx
  on public.crm_tasks(organization_id, conversation_id)
  where conversation_id is not null;

create or replace function public.crm_task_can_manage(
  p_organization_id uuid,
  p_assignee_user_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $task_manage$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and (
        m.role in ('OWNER','ADMIN','SALES_MANAGER')
        or (
          m.role = 'SALES_AGENT'
          and p_assignee_user_id = auth.uid()
        )
      )
  );
$task_manage$;

create or replace function public.guard_crm_task_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $task_guard$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.status <> 'OPEN' then
      raise exception 'CRM task must be created in OPEN state';
    end if;

    if new.creator_type = 'USER' then
      if v_actor is null or new.created_by_user_id is distinct from v_actor then
        raise exception 'CRM task USER creator must match auth.uid()';
      end if;
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
  then
    raise exception 'CRM task CRM scope is immutable';
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
    'task_type', new.task_type,
    'status', new.status,
    'priority', new.priority,
    'assignee_user_id', new.assignee_user_id,
    'due_at', new.due_at,
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

drop trigger if exists crm_tasks_guard_mutation on public.crm_tasks;
create trigger crm_tasks_guard_mutation
before insert or update on public.crm_tasks
for each row execute function public.guard_crm_task_mutation();

drop trigger if exists crm_tasks_audit_mutation on public.crm_tasks;
create trigger crm_tasks_audit_mutation
after insert or update on public.crm_tasks
for each row execute function public.audit_crm_task_mutation();

alter table public.crm_tasks enable row level security;

drop policy if exists crm_tasks_member_read on public.crm_tasks;
create policy crm_tasks_member_read
on public.crm_tasks
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists crm_tasks_manager_insert on public.crm_tasks;
create policy crm_tasks_manager_insert
on public.crm_tasks
for insert
to authenticated
with check (
  creator_type = 'USER'
  and created_by_user_id = (select auth.uid())
  and source_type = 'MANUAL'
  and source_id is null
  and public.crm_task_can_manage(organization_id, assignee_user_id)
);

drop policy if exists crm_tasks_manager_update on public.crm_tasks;
create policy crm_tasks_manager_update
on public.crm_tasks
for update
to authenticated
using (public.crm_task_can_manage(organization_id, assignee_user_id))
with check (public.crm_task_can_manage(organization_id, assignee_user_id));

create or replace function public.get_crm_tasks(
  p_organization_id uuid,
  p_business_id uuid default null,
  p_lead_id uuid default null,
  p_assignee_user_id uuid default null,
  p_status text default null,
  p_include_closed boolean default false,
  p_limit integer default 50,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns setof public.crm_tasks
language sql
stable
security invoker
set search_path = public, pg_catalog
as $task_query$
  select t.*
  from public.crm_tasks t
  where t.organization_id = p_organization_id
    and (p_business_id is null or t.business_id = p_business_id)
    and (p_lead_id is null or t.lead_id = p_lead_id)
    and (p_assignee_user_id is null or t.assignee_user_id = p_assignee_user_id)
    and (p_status is null or t.status = p_status)
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
$task_query$;

revoke all on public.crm_tasks from public, anon, authenticated, service_role;
grant select, insert, update on public.crm_tasks to authenticated;

revoke all on function public.get_crm_tasks(
  uuid, uuid, uuid, uuid, text, boolean, integer, timestamptz, uuid
) from public, anon, service_role;
grant execute on function public.get_crm_tasks(
  uuid, uuid, uuid, uuid, text, boolean, integer, timestamptz, uuid
) to authenticated;

revoke all on function public.crm_task_can_manage(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.crm_task_can_manage(uuid, uuid)
  to authenticated;

revoke all on function public.guard_crm_task_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.audit_crm_task_mutation()
  from public, anon, authenticated, service_role;
