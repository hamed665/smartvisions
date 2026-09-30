-- 0162: FIELD-SERVICE
-- Extends canonical crm_tasks + Booking/Branch/Organization-member authorities
-- with field-service-only child state. No second Task engine, Booking engine,
-- staff directory, location truth, scheduler, notification engine or inventory truth.

alter table public.crm_tasks
  drop constraint if exists crm_tasks_task_type_check;

alter table public.crm_tasks
  add constraint crm_tasks_task_type_check check (
    task_type in (
      'GENERAL','CALL','EMAIL','WHATSAPP','MEETING','REVIEW',
      'FOLLOW_UP','FIELD_SERVICE','OTHER'
    )
  );

create table public.field_service_work_orders (
  task_id uuid primary key,
  organization_id uuid not null,
  booking_id uuid,
  support_case_id uuid,
  branch_id uuid,
  location_source text not null check (
    location_source in (
      'BOOKING_BRANCH','BUSINESS_ADDRESS',
      'CUSTOMER_CONFIRMED','MANUAL_CONFIRMED','REMOTE'
    )
  ),
  location_reference text,
  location_snapshot jsonb not null default '{}'::jsonb check (
    jsonb_typeof(location_snapshot)='object'
    and octet_length(location_snapshot::text)<=16384
  ),
  requires_customer_signoff boolean not null default true,
  completion_summary text check (
    completion_summary is null or length(btrim(completion_summary)) between 1 and 4000
  ),
  version integer not null default 1 check (version>=1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint field_service_work_orders_org_task_unique unique (organization_id,task_id),
  constraint field_service_work_orders_task_fk
    foreign key (organization_id,task_id)
    references public.crm_tasks(organization_id,id)
    on delete cascade,
  constraint field_service_work_orders_booking_fk
    foreign key (organization_id,booking_id)
    references public.bookings(organization_id,id)
    on delete restrict,
  constraint field_service_work_orders_branch_fk
    foreign key (organization_id,branch_id)
    references public.branches(organization_id,id)
    on delete restrict,
  constraint field_service_work_orders_support_case_fk
    foreign key (support_case_id)
    references public.crm_support_cases(id)
    on delete restrict,
  constraint field_service_work_orders_location_reference_check
    check (location_reference is null or length(btrim(location_reference)) between 1 and 512)
);

create index field_service_work_orders_booking_idx
  on public.field_service_work_orders(organization_id,booking_id)
  where booking_id is not null;
create index field_service_work_orders_branch_idx
  on public.field_service_work_orders(organization_id,branch_id)
  where branch_id is not null;
create index field_service_work_orders_support_case_idx
  on public.field_service_work_orders(support_case_id)
  where support_case_id is not null;

create table public.field_service_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  position integer not null check (position between 1 and 200),
  label text not null check (length(btrim(label)) between 1 and 500),
  required boolean not null default true,
  completed_at timestamptz,
  completed_by_user_id uuid,
  completion_note text check (
    completion_note is null or length(btrim(completion_note)) between 1 and 2000
  ),
  version integer not null default 1 check (version>=1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint field_service_checklist_task_position_unique
    unique (organization_id,task_id,position),
  constraint field_service_checklist_task_fk
    foreign key (organization_id,task_id)
    references public.field_service_work_orders(organization_id,task_id)
    on delete cascade,
  constraint field_service_checklist_completed_by_fk
    foreign key (organization_id,completed_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict,
  constraint field_service_checklist_completion_pair_check
    check (
      (completed_at is null and completed_by_user_id is null)
      or
      (completed_at is not null and completed_by_user_id is not null)
    )
);

create index field_service_checklist_completed_by_idx
  on public.field_service_checklist_items(organization_id,completed_by_user_id)
  where completed_by_user_id is not null;

create table public.field_service_material_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  material_name text not null check (length(btrim(material_name)) between 1 and 240),
  quantity numeric(18,4) not null check (quantity>0 and quantity<=1000000000),
  unit text not null check (length(btrim(unit)) between 1 and 40),
  source_reference text check (
    source_reference is null or length(btrim(source_reference)) between 1 and 512
  ),
  note text check (note is null or length(btrim(note)) between 1 and 2000),
  inventory_effect text not null default 'NONE' check (inventory_effect='NONE'),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),

  constraint field_service_material_task_fk
    foreign key (organization_id,task_id)
    references public.field_service_work_orders(organization_id,task_id)
    on delete cascade,
  constraint field_service_material_created_by_fk
    foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict
);

create index field_service_material_created_by_idx
  on public.field_service_material_usage(organization_id,created_by_user_id);

create table public.field_service_evidence (
  id uuid primary key,
  organization_id uuid not null,
  task_id uuid not null,
  evidence_type text not null check (evidence_type in ('PHOTO','DOCUMENT','SIGNATURE')),
  storage_bucket text not null default 'field-service-evidence' check (
    storage_bucket='field-service-evidence'
  ),
  object_path text not null check (length(btrim(object_path)) between 8 and 1024),
  filename text not null check (length(btrim(filename)) between 1 and 255),
  content_type text not null check (length(btrim(content_type)) between 3 and 160),
  size_bytes bigint not null check (size_bytes between 1 and 15728640),
  caption text check (caption is null or length(btrim(caption)) between 1 and 1000),
  uploaded_by_user_id uuid not null,
  created_at timestamptz not null default now(),

  constraint field_service_evidence_org_id_unique unique (organization_id,id),
  constraint field_service_evidence_object_unique unique (organization_id,object_path),
  constraint field_service_evidence_task_fk
    foreign key (organization_id,task_id)
    references public.field_service_work_orders(organization_id,task_id)
    on delete cascade,
  constraint field_service_evidence_uploaded_by_fk
    foreign key (organization_id,uploaded_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict
);

create index field_service_evidence_task_idx
  on public.field_service_evidence(organization_id,task_id,created_at desc);
create index field_service_evidence_uploaded_by_idx
  on public.field_service_evidence(organization_id,uploaded_by_user_id);

create table public.field_service_signoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  signer_name text not null check (length(btrim(signer_name)) between 1 and 240),
  signoff_method text not null check (signoff_method in ('TYPED_NAME','SIGNATURE_EVIDENCE')),
  evidence_id uuid,
  acceptance_text text not null check (length(btrim(acceptance_text)) between 10 and 1000),
  recorded_by_user_id uuid not null,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint field_service_signoffs_task_unique unique (organization_id,task_id),
  constraint field_service_signoffs_task_fk
    foreign key (organization_id,task_id)
    references public.field_service_work_orders(organization_id,task_id)
    on delete cascade,
  constraint field_service_signoffs_evidence_fk
    foreign key (organization_id,evidence_id)
    references public.field_service_evidence(organization_id,id)
    on delete restrict,
  constraint field_service_signoffs_recorded_by_fk
    foreign key (organization_id,recorded_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict,
  constraint field_service_signoffs_method_evidence_check check (
    (signoff_method='TYPED_NAME')
    or
    (signoff_method='SIGNATURE_EVIDENCE' and evidence_id is not null)
  )
);

create index field_service_signoffs_evidence_idx
  on public.field_service_signoffs(organization_id,evidence_id)
  where evidence_id is not null;
create index field_service_signoffs_recorded_by_idx
  on public.field_service_signoffs(organization_id,recorded_by_user_id);

comment on table public.field_service_work_orders is
  'Field Service child state of canonical crm_tasks. Task status/assignee/due time remain authoritative; Booking remains schedule authority when linked.';
comment on table public.field_service_material_usage is
  'Operational material-consumption evidence only. inventory_effect is intentionally NONE until INVENTORY-FULFILLMENT owns stock truth.';
comment on table public.field_service_evidence is
  'Authorization metadata for private field-service files. Object bytes live in private Supabase Storage and are never public URLs.';

create or replace function public.field_service_task_can_manage(
  p_organization_id uuid,
  p_task_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path=public,auth,pg_catalog
as $$
  select exists(
    select 1
    from public.crm_tasks t
    where t.organization_id=p_organization_id
      and t.id=p_task_id
      and t.task_type='FIELD_SERVICE'
      and public.crm_task_can_manage(p_organization_id,t.assignee_user_id)
  );
$$;

create or replace function public.guard_field_service_work_order()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_task public.crm_tasks%rowtype;
  v_booking public.bookings%rowtype;
begin
  select * into v_task
  from public.crm_tasks
  where organization_id=new.organization_id and id=new.task_id;

  if not found or v_task.task_type<>'FIELD_SERVICE' then
    raise exception 'Field Service work order requires canonical FIELD_SERVICE task';
  end if;

  if tg_op='UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.task_id is distinct from old.task_id
    then raise exception 'Field Service work order identity is immutable'; end if;
    new.version:=old.version+1;
    new.updated_at:=now();
  else
    new.version:=1;
    new.created_at:=coalesce(new.created_at,now());
    new.updated_at:=coalesce(new.updated_at,now());
  end if;

  if new.booking_id is not null then
    select * into v_booking
    from public.bookings
    where organization_id=new.organization_id and id=new.booking_id;
    if not found then raise exception 'Field Service Booking was not found in Organization'; end if;
    if v_task.person_id is not null and v_booking.person_id<>v_task.person_id then
      raise exception 'Field Service Booking must resolve to Task Person';
    end if;
    if v_booking.status in ('CANCELED','NO_SHOW') then
      raise exception 'Canceled/no-show Booking cannot schedule Field Service work';
    end if;
  end if;

  if new.support_case_id is not null
     and not exists(
       select 1 from public.crm_support_cases c
       where c.organization_id=new.organization_id and c.id=new.support_case_id
     )
  then raise exception 'Field Service Support Case was not found in Organization'; end if;

  if new.branch_id is not null
     and not exists(
       select 1 from public.branches b
       where b.organization_id=new.organization_id
         and b.id=new.branch_id
         and b.status='ACTIVE'
     )
  then raise exception 'Field Service Branch is missing or inactive'; end if;

  if new.location_source='BOOKING_BRANCH' then
    if new.booking_id is null or new.branch_id is null then
      raise exception 'BOOKING_BRANCH location requires Booking and Branch';
    end if;
  elsif new.location_source='BUSINESS_ADDRESS' then
    if v_task.business_id is null then
      raise exception 'BUSINESS_ADDRESS requires canonical Task Business';
    end if;
  elsif new.location_source in ('CUSTOMER_CONFIRMED','MANUAL_CONFIRMED') then
    if nullif(btrim(coalesce(new.location_snapshot->>'formattedAddress','')),'') is null then
      raise exception 'Confirmed Field Service location requires formattedAddress evidence';
    end if;
  elsif new.location_source='REMOTE' then
    if new.branch_id is not null then
      raise exception 'REMOTE Field Service work cannot own a Branch location';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_field_service_checklist_item()
returns trigger
language plpgsql
security invoker
set search_path=public,auth,pg_catalog
as $$
begin
  if tg_op='UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.task_id is distinct from old.task_id
       or new.position is distinct from old.position
    then raise exception 'Field Service checklist identity is immutable'; end if;
    new.version:=old.version+1;
    new.updated_at:=now();
  else
    new.version:=1;
  end if;

  if new.completed_at is not null then
    if new.completed_by_user_id is distinct from auth.uid() then
      raise exception 'Field Service checklist completion actor must match current user';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_field_service_task_completion()
returns trigger
language plpgsql
stable
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_work public.field_service_work_orders%rowtype;
begin
  if old.task_type='FIELD_SERVICE' and new.task_type<>'FIELD_SERVICE' then
    raise exception 'FIELD_SERVICE task type is immutable';
  end if;

  if old.task_type='FIELD_SERVICE' and old.status='DONE' and new.status<>'DONE' then
    raise exception 'Completed Field Service work order is terminal';
  end if;

  if new.task_type<>'FIELD_SERVICE'
     or new.status is distinct from 'DONE'
     or old.status='DONE'
  then return new; end if;

  select * into v_work
  from public.field_service_work_orders
  where organization_id=new.organization_id and task_id=new.id;

  if not found then raise exception 'Field Service work order details are missing'; end if;
  if new.assignee_user_id is null then raise exception 'Field Service completion requires assigned technician'; end if;
  if nullif(btrim(coalesce(v_work.completion_summary,'')),'') is null then
    raise exception 'Field Service completion summary is required';
  end if;

  if exists(
    select 1 from public.field_service_checklist_items c
    where c.organization_id=new.organization_id
      and c.task_id=new.id
      and c.required=true
      and c.completed_at is null
  ) then raise exception 'Required Field Service checklist is incomplete'; end if;

  if not exists(
    select 1 from public.field_service_evidence e
    where e.organization_id=new.organization_id
      and e.task_id=new.id
      and e.evidence_type in ('PHOTO','DOCUMENT','SIGNATURE')
  ) then raise exception 'Field Service completion evidence is required'; end if;

  if v_work.requires_customer_signoff
     and not exists(
       select 1 from public.field_service_signoffs s
       where s.organization_id=new.organization_id and s.task_id=new.id
     )
  then raise exception 'Field Service customer sign-off is required'; end if;

  if v_work.booking_id is not null
     and not exists(
       select 1 from public.bookings b
       where b.organization_id=new.organization_id
         and b.id=v_work.booking_id
         and b.status in ('CONFIRMED','RESCHEDULED','COMPLETED')
     )
  then raise exception 'Field Service linked Booking is not in completable state'; end if;

  return new;
end;
$$;

create or replace function public.audit_field_service_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,auth,pg_catalog
as $$
declare
  v_new jsonb:=to_jsonb(new);
  v_old jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else null end;
  v_task_id text:=coalesce(v_new->>'task_id',v_new->>'id');
  v_actor uuid:=auth.uid();
begin
  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    (v_new->>'organization_id')::uuid,
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    coalesce(v_actor::text,current_user),
    'FIELD_SERVICE_'||upper(tg_table_name)||'_'||tg_op,
    'field_service',
    v_task_id,
    case when v_old is null then null else jsonb_strip_nulls(jsonb_build_object(
      'taskId',v_old->>'task_id','version',v_old->>'version',
      'completedAt',v_old->>'completed_at','evidenceType',v_old->>'evidence_type'
    )) end,
    jsonb_strip_nulls(jsonb_build_object(
      'taskId',v_new->>'task_id','version',v_new->>'version',
      'completedAt',v_new->>'completed_at','evidenceType',v_new->>'evidence_type',
      'signoffMethod',v_new->>'signoff_method','position',v_new->>'position'
    )),
    'dbtx:'||txid_current()::text
  );
  return new;
end;
$$;

drop trigger if exists field_service_work_order_guard on public.field_service_work_orders;
create trigger field_service_work_order_guard
before insert or update on public.field_service_work_orders
for each row execute function public.guard_field_service_work_order();

drop trigger if exists field_service_checklist_guard on public.field_service_checklist_items;
create trigger field_service_checklist_guard
before insert or update on public.field_service_checklist_items
for each row execute function public.guard_field_service_checklist_item();

drop trigger if exists crm_tasks_field_service_completion_guard on public.crm_tasks;
create trigger crm_tasks_field_service_completion_guard
before update on public.crm_tasks
for each row execute function public.guard_field_service_task_completion();

create trigger field_service_work_order_audit
after insert or update on public.field_service_work_orders
for each row execute function public.audit_field_service_mutation();
create trigger field_service_checklist_audit
after insert or update on public.field_service_checklist_items
for each row execute function public.audit_field_service_mutation();
create trigger field_service_material_audit
after insert on public.field_service_material_usage
for each row execute function public.audit_field_service_mutation();
create trigger field_service_evidence_audit
after insert on public.field_service_evidence
for each row execute function public.audit_field_service_mutation();
create trigger field_service_signoff_audit
after insert on public.field_service_signoffs
for each row execute function public.audit_field_service_mutation();

alter table public.field_service_work_orders enable row level security;
alter table public.field_service_checklist_items enable row level security;
alter table public.field_service_material_usage enable row level security;
alter table public.field_service_evidence enable row level security;
alter table public.field_service_signoffs enable row level security;

create policy field_service_work_orders_member_read
on public.field_service_work_orders for select to authenticated
using (public.is_org_member(organization_id));
create policy field_service_work_orders_manager_insert
on public.field_service_work_orders for insert to authenticated
with check (public.field_service_task_can_manage(organization_id,task_id));
create policy field_service_work_orders_manager_update
on public.field_service_work_orders for update to authenticated
using (public.field_service_task_can_manage(organization_id,task_id))
with check (public.field_service_task_can_manage(organization_id,task_id));

create policy field_service_checklist_member_read
on public.field_service_checklist_items for select to authenticated
using (public.is_org_member(organization_id));
create policy field_service_checklist_manager_insert
on public.field_service_checklist_items for insert to authenticated
with check (public.field_service_task_can_manage(organization_id,task_id));
create policy field_service_checklist_manager_update
on public.field_service_checklist_items for update to authenticated
using (public.field_service_task_can_manage(organization_id,task_id))
with check (public.field_service_task_can_manage(organization_id,task_id));

create policy field_service_material_member_read
on public.field_service_material_usage for select to authenticated
using (public.is_org_member(organization_id));
create policy field_service_material_manager_insert
on public.field_service_material_usage for insert to authenticated
with check (
  public.field_service_task_can_manage(organization_id,task_id)
  and created_by_user_id=(select auth.uid())
);

create policy field_service_evidence_member_read
on public.field_service_evidence for select to authenticated
using (public.is_org_member(organization_id));
create policy field_service_evidence_manager_insert
on public.field_service_evidence for insert to authenticated
with check (
  public.field_service_task_can_manage(organization_id,task_id)
  and uploaded_by_user_id=(select auth.uid())
);

create policy field_service_signoff_member_read
on public.field_service_signoffs for select to authenticated
using (public.is_org_member(organization_id));
create policy field_service_signoff_manager_insert
on public.field_service_signoffs for insert to authenticated
with check (
  public.field_service_task_can_manage(organization_id,task_id)
  and recorded_by_user_id=(select auth.uid())
);

revoke all on table
  public.field_service_work_orders,
  public.field_service_checklist_items,
  public.field_service_material_usage,
  public.field_service_evidence,
  public.field_service_signoffs
from public,anon,authenticated,service_role;

grant select,insert,update on public.field_service_work_orders
  to authenticated;
grant select,insert,update on public.field_service_checklist_items
  to authenticated;
grant select,insert on public.field_service_material_usage
  to authenticated;
grant select,insert on public.field_service_evidence
  to authenticated;
grant select,insert on public.field_service_signoffs
  to authenticated;

revoke all on function public.field_service_task_can_manage(uuid,uuid)
  from public,anon,service_role;
grant execute on function public.field_service_task_can_manage(uuid,uuid)
  to authenticated;

revoke all on function public.guard_field_service_work_order()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_field_service_checklist_item()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_field_service_task_completion()
  from public,anon,authenticated,service_role;
revoke all on function public.audit_field_service_mutation()
  from public,anon,authenticated,service_role;

-- Private evidence storage. CI uses plain PostgreSQL without the Supabase
-- storage schema, so bucket creation is conditional while Production creates
-- or reconciles the private bucket deterministically.
do $field_service_storage$
begin
  if to_regclass('storage.buckets') is not null then
    execute $sql$
      insert into storage.buckets(
        id,name,public,file_size_limit,allowed_mime_types
      ) values (
        'field-service-evidence',
        'field-service-evidence',
        false,
        15728640,
        array[
          'image/jpeg','image/png','image/webp','image/heic',
          'application/pdf'
        ]::text[]
      )
      on conflict (id) do update set
        name=excluded.name,
        public=false,
        file_size_limit=excluded.file_size_limit,
        allowed_mime_types=excluded.allowed_mime_types
    $sql$;
  end if;
end;
$field_service_storage$;
