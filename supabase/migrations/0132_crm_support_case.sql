-- 0132: CRM Support Case authority.
--
-- This is the first canonical Support Case store. It links to existing CRM truth:
-- businesses (Account), crm_people (Person) and sales_conversations (Conversation).
-- It does not invent Order/Payment authorities that do not exist yet.
-- SLA policy is owned by Smart Core. Case mutations are service-bound, audited,
-- optimistic-versioned and tenant-scoped. Authenticated operators receive read-only
-- Data API access through RLS plus explicit read RPCs.

create table if not exists public.crm_support_sla_policies (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  priority text not null,
  first_response_minutes integer not null,
  resolution_minutes integer not null,
  escalation_minutes integer,
  status text not null default 'ACTIVE',
  version integer not null default 1,
  last_request_key text not null,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name, priority),
  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id) on delete restrict,
  foreign key (organization_id, updated_by_user_id)
    references public.organization_members(organization_id, user_id) on delete restrict,
  check (length(trim(name)) between 1 and 120),
  check (priority in ('LOW','NORMAL','HIGH','URGENT','CRITICAL')),
  check (first_response_minutes between 1 and 43200),
  check (resolution_minutes between 1 and 43200),
  check (resolution_minutes >= first_response_minutes),
  check (
    escalation_minutes is null
    or (
      escalation_minutes between first_response_minutes and resolution_minutes
    )
  ),
  check (status in ('ACTIVE','RETIRED')),
  check (version >= 1),
  check (length(last_request_key) between 1 and 200)
);

create unique index if not exists crm_support_sla_one_active_priority_idx
  on public.crm_support_sla_policies(organization_id, priority)
  where status='ACTIVE';

create index if not exists crm_support_sla_created_by_fk_idx
  on public.crm_support_sla_policies(created_by_user_id);

create index if not exists crm_support_sla_updated_by_fk_idx
  on public.crm_support_sla_policies(updated_by_user_id);

create table if not exists public.crm_support_cases (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete restrict,
  person_id uuid,
  conversation_id uuid references public.sales_conversations(id) on delete restrict,
  subject text not null,
  description text,
  status text not null default 'OPEN',
  priority text not null default 'NORMAL',
  assignee_user_id uuid,
  sla_policy_id uuid,
  first_response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_responded_at timestamptz,
  escalation_level smallint not null default 0,
  escalated_at timestamptz,
  resolution_summary text,
  resolved_at timestamptz,
  resolved_by_user_id uuid,
  closed_at timestamptz,
  closed_by_user_id uuid,
  csat_score smallint,
  csat_comment text,
  csat_source_ref text,
  source_type text not null default 'MANUAL',
  source_ref text,
  request_key text not null,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_key),
  foreign key (organization_id, person_id)
    references public.crm_people(organization_id, id) on delete restrict,
  foreign key (organization_id, assignee_user_id)
    references public.organization_members(organization_id, user_id) on delete restrict,
  foreign key (organization_id, sla_policy_id)
    references public.crm_support_sla_policies(organization_id, id) on delete restrict,
  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id) on delete restrict,
  foreign key (organization_id, updated_by_user_id)
    references public.organization_members(organization_id, user_id) on delete restrict,
  foreign key (organization_id, resolved_by_user_id)
    references public.organization_members(organization_id, user_id) on delete restrict,
  foreign key (organization_id, closed_by_user_id)
    references public.organization_members(organization_id, user_id) on delete restrict,
  check (length(trim(subject)) between 1 and 240),
  check (description is null or length(description) <= 8000),
  check (status in ('OPEN','PENDING_CUSTOMER','PENDING_INTERNAL','RESOLVED','CLOSED')),
  check (priority in ('LOW','NORMAL','HIGH','URGENT','CRITICAL')),
  check (escalation_level between 0 and 3),
  check (
    (escalation_level=0 and escalated_at is null)
    or (escalation_level>0 and escalated_at is not null)
  ),
  check (
    (sla_policy_id is null and first_response_due_at is null and resolution_due_at is null)
    or
    (sla_policy_id is not null and first_response_due_at is not null and resolution_due_at is not null
      and resolution_due_at >= first_response_due_at)
  ),
  check (
    (status in ('RESOLVED','CLOSED')
      and resolved_at is not null
      and resolved_by_user_id is not null
      and nullif(trim(resolution_summary),'') is not null)
    or
    (status not in ('RESOLVED','CLOSED')
      and resolved_at is null
      and resolved_by_user_id is null
      and resolution_summary is null)
  ),
  check (
    (status='CLOSED' and closed_at is not null and closed_by_user_id is not null)
    or
    (status<>'CLOSED' and closed_at is null and closed_by_user_id is null)
  ),
  check (
    (csat_score is null and csat_comment is null and csat_source_ref is null)
    or
    (status in ('RESOLVED','CLOSED')
      and csat_score between 1 and 5
      and nullif(trim(csat_source_ref),'') is not null
      and length(trim(csat_source_ref)) <= 512
      and (csat_comment is null or length(csat_comment) <= 2000))
  ),
  check (source_type in ('MANUAL','CONVERSATION','WEBHOOK','IMPORT_VERIFIED')),
  check (source_ref is null or length(trim(source_ref)) between 1 and 512),
  check (length(request_key) between 1 and 200),
  check (version >= 1),
  check (jsonb_typeof(metadata)='object'),
  check (octet_length(metadata::text) <= 16384)
);

create index if not exists crm_support_cases_org_status_updated_idx
  on public.crm_support_cases(organization_id, status, updated_at desc, id);

create index if not exists crm_support_cases_org_priority_updated_idx
  on public.crm_support_cases(organization_id, priority, updated_at desc, id);

create index if not exists crm_support_cases_org_assignee_status_idx
  on public.crm_support_cases(organization_id, assignee_user_id, status, updated_at desc)
  where assignee_user_id is not null;

create index if not exists crm_support_cases_org_business_idx
  on public.crm_support_cases(organization_id, business_id, updated_at desc)
  where business_id is not null;

create index if not exists crm_support_cases_org_person_idx
  on public.crm_support_cases(organization_id, person_id, updated_at desc)
  where person_id is not null;

create index if not exists crm_support_cases_org_conversation_idx
  on public.crm_support_cases(organization_id, conversation_id, updated_at desc)
  where conversation_id is not null;

create index if not exists crm_support_cases_org_sla_due_idx
  on public.crm_support_cases(organization_id, resolution_due_at, status)
  where resolution_due_at is not null and status not in ('RESOLVED','CLOSED');

create index if not exists crm_support_cases_created_by_fk_idx
  on public.crm_support_cases(created_by_user_id);

create index if not exists crm_support_cases_updated_by_fk_idx
  on public.crm_support_cases(updated_by_user_id);

create index if not exists crm_support_cases_resolved_by_fk_idx
  on public.crm_support_cases(resolved_by_user_id)
  where resolved_by_user_id is not null;

create index if not exists crm_support_cases_closed_by_fk_idx
  on public.crm_support_cases(closed_by_user_id)
  where closed_by_user_id is not null;

alter table public.crm_support_sla_policies enable row level security;
alter table public.crm_support_cases enable row level security;

drop policy if exists crm_support_sla_member_read on public.crm_support_sla_policies;
create policy crm_support_sla_member_read
  on public.crm_support_sla_policies
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists crm_support_cases_member_read on public.crm_support_cases;
create policy crm_support_cases_member_read
  on public.crm_support_cases
  for select
  to authenticated
  using (public.is_org_member(organization_id));

revoke all on table public.crm_support_sla_policies from anon, authenticated, service_role;
revoke all on table public.crm_support_cases from anon, authenticated, service_role;
grant select on table public.crm_support_sla_policies to authenticated;
grant select on table public.crm_support_cases to authenticated;
grant select, insert, update, delete on table public.crm_support_sla_policies to service_role;
grant select, insert, update, delete on table public.crm_support_cases to service_role;

create or replace function public.crm_support_actor_role(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns text
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  select m.role
  from public.organization_members m
  where m.organization_id=p_organization_id
    and m.user_id=p_actor_user_id
  limit 1
$$;

create or replace function public.guard_crm_support_case_scope()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $guard$
declare
  v_conversation_org uuid;
  v_conversation_person uuid;
  v_conversation_lead uuid;
  v_conversation_business uuid;
  v_policy_priority text;
  v_policy_status text;
  v_person_status text;
begin
  if new.business_id is not null and not exists (
    select 1 from public.businesses b
    where b.id=new.business_id and b.organization_id=new.organization_id
  ) then
    raise exception 'CRM Support Case Business was not found in the Organization';
  end if;

  if new.person_id is not null then
    select p.status into v_person_status
    from public.crm_people p
    where p.organization_id=new.organization_id and p.id=new.person_id;
    if v_person_status is null or v_person_status<>'ACTIVE' then
      raise exception 'CRM Support Case requires an active Person in the Organization';
    end if;
  end if;

  if new.conversation_id is not null then
    select c.organization_id,c.person_id,c.lead_id
      into v_conversation_org,v_conversation_person,v_conversation_lead
    from public.sales_conversations c
    where c.id=new.conversation_id;

    if v_conversation_org is null or v_conversation_org<>new.organization_id then
      raise exception 'CRM Support Case Conversation was not found in the Organization';
    end if;

    if new.person_id is not null
       and v_conversation_person is not null
       and new.person_id<>v_conversation_person then
      raise exception 'CRM Support Case Conversation/Person lineage mismatch';
    end if;

    if v_conversation_lead is not null then
      select l.business_id into v_conversation_business
      from public.leads l
      where l.organization_id=new.organization_id and l.id=v_conversation_lead;
      if new.business_id is not null
         and v_conversation_business is not null
         and new.business_id<>v_conversation_business then
        raise exception 'CRM Support Case Conversation/Business lineage mismatch';
      end if;
    end if;
  end if;

  if new.assignee_user_id is not null and not exists (
    select 1 from public.organization_members m
    where m.organization_id=new.organization_id
      and m.user_id=new.assignee_user_id
      and m.role in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT')
  ) then
    raise exception 'CRM Support Case assignee must be an assignable Organization member';
  end if;

  if new.sla_policy_id is not null then
    select p.priority,p.status into v_policy_priority,v_policy_status
    from public.crm_support_sla_policies p
    where p.organization_id=new.organization_id and p.id=new.sla_policy_id;
    if v_policy_status is null then
      raise exception 'CRM Support Case SLA policy was not found in the Organization';
    end if;
    if v_policy_status<>'ACTIVE' then
      raise exception 'CRM Support Case requires an active SLA policy';
    end if;
    if v_policy_priority<>new.priority then
      raise exception 'CRM Support Case SLA policy must match Case priority';
    end if;
  end if;

  if tg_op='UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.business_id is distinct from old.business_id
       or new.person_id is distinct from old.person_id
       or new.conversation_id is distinct from old.conversation_id
       or new.source_type is distinct from old.source_type
       or new.source_ref is distinct from old.source_ref
       or new.request_key is distinct from old.request_key
       or new.created_by_user_id is distinct from old.created_by_user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'CRM Support Case identity/context is immutable';
    end if;
    if new.version<>old.version+1 then
      raise exception 'CRM Support Case version must increment exactly once';
    end if;
  end if;

  return new;
end;
$guard$;

drop trigger if exists crm_support_case_scope_guard on public.crm_support_cases;
create trigger crm_support_case_scope_guard
before insert or update on public.crm_support_cases
for each row execute function public.guard_crm_support_case_scope();

create or replace function public.upsert_crm_support_sla_policy_manual(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_policy_id uuid,
  p_name text,
  p_priority text,
  p_first_response_minutes integer,
  p_resolution_minutes integer,
  p_escalation_minutes integer,
  p_status text,
  p_expected_version integer,
  p_request_key text
)
returns table (
  resolved_policy_id uuid,
  resolved_version integer,
  replayed boolean
)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $fn$
declare
  v_role text;
  v_existing public.crm_support_sla_policies%rowtype;
begin
  if current_user<>'service_role' then
    raise exception 'CRM Support SLA mutation requires the trusted server boundary';
  end if;
  v_role:=public.crm_support_actor_role(p_organization_id,p_actor_user_id);
  if v_role is null or v_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'CRM Support SLA mutation requires OWNER, ADMIN or SALES_MANAGER';
  end if;
  if p_policy_id is null
     or nullif(trim(p_name),'') is null
     or length(trim(p_name))>120
     or p_priority not in ('LOW','NORMAL','HIGH','URGENT','CRITICAL')
     or p_first_response_minutes not between 1 and 43200
     or p_resolution_minutes not between p_first_response_minutes and 43200
     or (p_escalation_minutes is not null and p_escalation_minutes not between p_first_response_minutes and p_resolution_minutes)
     or p_status not in ('ACTIVE','RETIRED')
     or p_expected_version<0
     or nullif(trim(p_request_key),'') is null
     or length(trim(p_request_key))>200 then
    raise exception 'Invalid CRM Support SLA payload';
  end if;

  select * into v_existing
  from public.crm_support_sla_policies
  where organization_id=p_organization_id and id=p_policy_id
  for update;

  if found then
    if v_existing.last_request_key=p_request_key then
      return query select v_existing.id,v_existing.version,true;
      return;
    end if;
    if v_existing.version<>p_expected_version then
      raise exception 'CRM Support SLA version conflict';
    end if;

    update public.crm_support_sla_policies
      set name=trim(p_name),
          priority=p_priority,
          first_response_minutes=p_first_response_minutes,
          resolution_minutes=p_resolution_minutes,
          escalation_minutes=p_escalation_minutes,
          status=p_status,
          version=version+1,
          last_request_key=trim(p_request_key),
          updated_by_user_id=p_actor_user_id,
          updated_at=now()
    where organization_id=p_organization_id and id=p_policy_id
    returning id,version into resolved_policy_id,resolved_version;

    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,correlation_id
    ) values (
      p_organization_id,'USER',p_actor_user_id::text,'CRM_SUPPORT_SLA_UPDATED',
      'crm_support_sla_policies',p_policy_id::text,
      jsonb_build_object('priority',v_existing.priority,'status',v_existing.status,'version',v_existing.version),
      jsonb_build_object('priority',p_priority,'status',p_status,'version',resolved_version),
      'dbtx:'||txid_current()::text
    );
    replayed:=false;
    return next;
    return;
  end if;

  if p_expected_version<>0 then
    raise exception 'CRM Support SLA create requires expected version 0';
  end if;

  insert into public.crm_support_sla_policies(
    id,organization_id,name,priority,first_response_minutes,resolution_minutes,
    escalation_minutes,status,version,last_request_key,created_by_user_id,updated_by_user_id
  ) values (
    p_policy_id,p_organization_id,trim(p_name),p_priority,p_first_response_minutes,
    p_resolution_minutes,p_escalation_minutes,p_status,1,trim(p_request_key),
    p_actor_user_id,p_actor_user_id
  )
  returning id,version into resolved_policy_id,resolved_version;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'CRM_SUPPORT_SLA_CREATED',
    'crm_support_sla_policies',p_policy_id::text,
    jsonb_build_object('priority',p_priority,'status',p_status,'version',1),
    'dbtx:'||txid_current()::text
  );
  replayed:=false;
  return next;
end;
$fn$;

create or replace function public.create_crm_support_case_manual(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_case_id uuid,
  p_business_id uuid,
  p_person_id uuid,
  p_conversation_id uuid,
  p_subject text,
  p_description text,
  p_priority text,
  p_assignee_user_id uuid,
  p_sla_policy_id uuid,
  p_source_type text,
  p_source_ref text,
  p_request_key text,
  p_metadata jsonb
)
returns table (
  resolved_case_id uuid,
  resolved_version integer,
  replayed boolean
)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $fn$
declare
  v_role text;
  v_existing public.crm_support_cases%rowtype;
  v_policy public.crm_support_sla_policies%rowtype;
  v_now timestamptz:=now();
begin
  if current_user<>'service_role' then
    raise exception 'CRM Support Case creation requires the trusted server boundary';
  end if;
  v_role:=public.crm_support_actor_role(p_organization_id,p_actor_user_id);
  if v_role is null or v_role='VIEWER' then
    raise exception 'CRM Support Case creation requires an authorized Organization member';
  end if;

  if p_case_id is null
     or nullif(trim(p_subject),'') is null
     or length(trim(p_subject))>240
     or (p_description is not null and length(p_description)>8000)
     or p_priority not in ('LOW','NORMAL','HIGH','URGENT','CRITICAL')
     or p_source_type not in ('MANUAL','CONVERSATION','WEBHOOK','IMPORT_VERIFIED')
     or (p_source_ref is not null and (nullif(trim(p_source_ref),'') is null or length(trim(p_source_ref))>512))
     or nullif(trim(p_request_key),'') is null
     or length(trim(p_request_key))>200
     or p_metadata is null
     or jsonb_typeof(p_metadata)<>'object'
     or octet_length(p_metadata::text)>16384 then
    raise exception 'Invalid CRM Support Case payload';
  end if;

  select * into v_existing
  from public.crm_support_cases
  where organization_id=p_organization_id and request_key=trim(p_request_key)
  for update;

  if found then
    if v_existing.id<>p_case_id
       or v_existing.business_id is distinct from p_business_id
       or v_existing.person_id is distinct from p_person_id
       or v_existing.conversation_id is distinct from p_conversation_id
       or v_existing.subject<>trim(p_subject)
       or v_existing.description is distinct from p_description
       or v_existing.priority<>p_priority then
      raise exception 'CRM Support Case request key conflict';
    end if;
    return query select v_existing.id,v_existing.version,true;
    return;
  end if;

  if p_sla_policy_id is not null then
    select * into v_policy
    from public.crm_support_sla_policies
    where organization_id=p_organization_id and id=p_sla_policy_id and status='ACTIVE';
  else
    select * into v_policy
    from public.crm_support_sla_policies
    where organization_id=p_organization_id and priority=p_priority and status='ACTIVE'
    limit 1;
  end if;

  if p_sla_policy_id is not null and v_policy.id is null then
    raise exception 'CRM Support Case SLA policy was not found or active';
  end if;
  if v_policy.id is not null and v_policy.priority<>p_priority then
    raise exception 'CRM Support Case SLA policy must match Case priority';
  end if;

  insert into public.crm_support_cases(
    id,organization_id,business_id,person_id,conversation_id,subject,description,
    status,priority,assignee_user_id,sla_policy_id,first_response_due_at,resolution_due_at,
    source_type,source_ref,request_key,created_by_user_id,updated_by_user_id,
    version,metadata,created_at,updated_at
  ) values (
    p_case_id,p_organization_id,p_business_id,p_person_id,p_conversation_id,trim(p_subject),p_description,
    'OPEN',p_priority,p_assignee_user_id,v_policy.id,
    case when v_policy.id is null then null else v_now+make_interval(mins=>v_policy.first_response_minutes) end,
    case when v_policy.id is null then null else v_now+make_interval(mins=>v_policy.resolution_minutes) end,
    p_source_type,case when p_source_ref is null then null else trim(p_source_ref) end,
    trim(p_request_key),p_actor_user_id,p_actor_user_id,1,p_metadata,v_now,v_now
  )
  returning id,version into resolved_case_id,resolved_version;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'CRM_SUPPORT_CASE_CREATED',
    'crm_support_cases',p_case_id::text,
    jsonb_build_object(
      'priority',p_priority,
      'has_business',p_business_id is not null,
      'has_person',p_person_id is not null,
      'has_conversation',p_conversation_id is not null,
      'has_sla',v_policy.id is not null,
      'has_description',p_description is not null
    ),
    'dbtx:'||txid_current()::text
  );
  replayed:=false;
  return next;
end;
$fn$;

create or replace function public.assign_crm_support_case_manual(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_case_id uuid,
  p_assignee_user_id uuid,
  p_expected_version integer,
  p_reason text
)
returns table (resolved_case_id uuid,resolved_version integer,replayed boolean)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $fn$
declare
  v_role text;
  v_case public.crm_support_cases%rowtype;
begin
  if current_user<>'service_role' then raise exception 'CRM Support Case assignment requires the trusted server boundary'; end if;
  v_role:=public.crm_support_actor_role(p_organization_id,p_actor_user_id);
  if v_role is null or v_role='VIEWER' then raise exception 'CRM Support Case assignment requires an authorized Organization member'; end if;
  if nullif(trim(p_reason),'') is null or length(trim(p_reason))>500 then raise exception 'CRM Support Case assignment reason is required'; end if;
  if p_assignee_user_id is not null and not exists (
    select 1 from public.organization_members
    where organization_id=p_organization_id and user_id=p_assignee_user_id
      and role in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT')
  ) then raise exception 'CRM Support Case assignee must be an assignable Organization member'; end if;

  select * into v_case from public.crm_support_cases
  where organization_id=p_organization_id and id=p_case_id for update;
  if not found then raise exception 'CRM Support Case was not found in the Organization'; end if;
  if v_case.assignee_user_id is not distinct from p_assignee_user_id then
    return query select v_case.id,v_case.version,true; return;
  end if;
  if v_case.version<>p_expected_version then raise exception 'CRM Support Case version conflict'; end if;

  update public.crm_support_cases
    set assignee_user_id=p_assignee_user_id,updated_by_user_id=p_actor_user_id,
        version=version+1,updated_at=now()
  where id=p_case_id and organization_id=p_organization_id
  returning id,version into resolved_case_id,resolved_version;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'CRM_SUPPORT_CASE_ASSIGNED','crm_support_cases',p_case_id::text,
    jsonb_build_object('assignee_user_id',v_case.assignee_user_id),
    jsonb_build_object('assignee_user_id',p_assignee_user_id,'reason_present',true),
    'dbtx:'||txid_current()::text
  );
  replayed:=false; return next;
end;
$fn$;

create or replace function public.mark_crm_support_first_response_manual(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_case_id uuid,
  p_expected_version integer,
  p_reason text
)
returns table (resolved_case_id uuid,resolved_version integer,replayed boolean)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $fn$
declare v_role text; v_case public.crm_support_cases%rowtype;
begin
  if current_user<>'service_role' then raise exception 'CRM Support first response requires the trusted server boundary'; end if;
  v_role:=public.crm_support_actor_role(p_organization_id,p_actor_user_id);
  if v_role is null or v_role='VIEWER' then raise exception 'CRM Support first response requires an authorized Organization member'; end if;
  if nullif(trim(p_reason),'') is null or length(trim(p_reason))>500 then raise exception 'CRM Support first response reason is required'; end if;
  select * into v_case from public.crm_support_cases
    where organization_id=p_organization_id and id=p_case_id for update;
  if not found then raise exception 'CRM Support Case was not found in the Organization'; end if;
  if v_case.first_responded_at is not null then return query select v_case.id,v_case.version,true; return; end if;
  if v_case.status in ('RESOLVED','CLOSED') then raise exception 'Resolved CRM Support Case cannot receive first response'; end if;
  if v_case.version<>p_expected_version then raise exception 'CRM Support Case version conflict'; end if;
  update public.crm_support_cases
    set first_responded_at=now(),updated_by_user_id=p_actor_user_id,version=version+1,updated_at=now()
  where organization_id=p_organization_id and id=p_case_id
  returning id,version into resolved_case_id,resolved_version;
  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'CRM_SUPPORT_FIRST_RESPONSE_MARKED',
    'crm_support_cases',p_case_id::text,jsonb_build_object('reason_present',true),
    'dbtx:'||txid_current()::text
  );
  replayed:=false; return next;
end;
$fn$;

create or replace function public.transition_crm_support_case_manual(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_case_id uuid,
  p_status text,
  p_expected_version integer,
  p_reason text,
  p_resolution_summary text
)
returns table (resolved_case_id uuid,resolved_version integer,resolved_status text,replayed boolean)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $fn$
declare v_role text; v_case public.crm_support_cases%rowtype; v_now timestamptz:=now();
begin
  if current_user<>'service_role' then raise exception 'CRM Support Case transition requires the trusted server boundary'; end if;
  v_role:=public.crm_support_actor_role(p_organization_id,p_actor_user_id);
  if v_role is null or v_role='VIEWER' then raise exception 'CRM Support Case transition requires an authorized Organization member'; end if;
  if p_status not in ('OPEN','PENDING_CUSTOMER','PENDING_INTERNAL','RESOLVED','CLOSED')
     or nullif(trim(p_reason),'') is null or length(trim(p_reason))>500
     or (p_resolution_summary is not null and length(p_resolution_summary)>4000) then
    raise exception 'Invalid CRM Support Case transition payload';
  end if;
  select * into v_case from public.crm_support_cases
    where organization_id=p_organization_id and id=p_case_id for update;
  if not found then raise exception 'CRM Support Case was not found in the Organization'; end if;
  if v_case.status=p_status then return query select v_case.id,v_case.version,v_case.status,true; return; end if;
  if v_case.version<>p_expected_version then raise exception 'CRM Support Case version conflict'; end if;

  if p_status='CLOSED' and v_case.status<>'RESOLVED' then
    raise exception 'CRM Support Case must be RESOLVED before CLOSED';
  end if;
  if p_status='RESOLVED' and nullif(trim(p_resolution_summary),'') is null then
    raise exception 'CRM Support Case resolution summary is required';
  end if;
  if v_case.status='CLOSED' and p_status<>'OPEN' then
    raise exception 'CLOSED CRM Support Case may only reopen to OPEN';
  end if;

  update public.crm_support_cases
  set status=p_status,
      resolution_summary=case
        when p_status='RESOLVED' then trim(p_resolution_summary)
        when p_status='CLOSED' then resolution_summary
        else null end,
      resolved_at=case
        when p_status='RESOLVED' then v_now
        when p_status='CLOSED' then resolved_at
        else null end,
      resolved_by_user_id=case
        when p_status='RESOLVED' then p_actor_user_id
        when p_status='CLOSED' then resolved_by_user_id
        else null end,
      closed_at=case when p_status='CLOSED' then v_now else null end,
      closed_by_user_id=case when p_status='CLOSED' then p_actor_user_id else null end,
      csat_score=case when p_status in ('OPEN','PENDING_CUSTOMER','PENDING_INTERNAL') then null else csat_score end,
      csat_comment=case when p_status in ('OPEN','PENDING_CUSTOMER','PENDING_INTERNAL') then null else csat_comment end,
      csat_source_ref=case when p_status in ('OPEN','PENDING_CUSTOMER','PENDING_INTERNAL') then null else csat_source_ref end,
      updated_by_user_id=p_actor_user_id,
      version=version+1,
      updated_at=v_now
  where organization_id=p_organization_id and id=p_case_id
  returning id,version,status into resolved_case_id,resolved_version,resolved_status;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'CRM_SUPPORT_CASE_STATUS_CHANGED',
    'crm_support_cases',p_case_id::text,
    jsonb_build_object('status',v_case.status,'version',v_case.version),
    jsonb_build_object('status',p_status,'version',resolved_version,'reason_present',true,'has_resolution_summary',p_resolution_summary is not null),
    'dbtx:'||txid_current()::text
  );
  replayed:=false; return next;
end;
$fn$;

create or replace function public.escalate_crm_support_case_manual(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_case_id uuid,
  p_expected_version integer,
  p_reason text
)
returns table (resolved_case_id uuid,resolved_version integer,escalation_level smallint,replayed boolean)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $fn$
declare v_role text; v_case public.crm_support_cases%rowtype;
begin
  if current_user<>'service_role' then raise exception 'CRM Support Case escalation requires the trusted server boundary'; end if;
  v_role:=public.crm_support_actor_role(p_organization_id,p_actor_user_id);
  if v_role is null or v_role='VIEWER' then raise exception 'CRM Support Case escalation requires an authorized Organization member'; end if;
  if nullif(trim(p_reason),'') is null or length(trim(p_reason))>500 then raise exception 'CRM Support Case escalation reason is required'; end if;
  select * into v_case from public.crm_support_cases
    where organization_id=p_organization_id and id=p_case_id for update;
  if not found then raise exception 'CRM Support Case was not found in the Organization'; end if;
  if v_case.status in ('RESOLVED','CLOSED') then raise exception 'Resolved CRM Support Case cannot be escalated'; end if;
  if v_case.escalation_level>=3 then raise exception 'CRM Support Case escalation limit reached'; end if;
  if v_case.version<>p_expected_version then raise exception 'CRM Support Case version conflict'; end if;
  update public.crm_support_cases
    set escalation_level=escalation_level+1,escalated_at=now(),
        updated_by_user_id=p_actor_user_id,version=version+1,updated_at=now()
  where organization_id=p_organization_id and id=p_case_id
  returning id,version,crm_support_cases.escalation_level
    into resolved_case_id,resolved_version,escalation_level;
  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'CRM_SUPPORT_CASE_ESCALATED',
    'crm_support_cases',p_case_id::text,
    jsonb_build_object('escalation_level',v_case.escalation_level),
    jsonb_build_object('escalation_level',escalation_level,'reason_present',true),
    'dbtx:'||txid_current()::text
  );
  replayed:=false; return next;
end;
$fn$;

create or replace function public.record_crm_support_csat_manual(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_case_id uuid,
  p_score smallint,
  p_comment text,
  p_source_ref text,
  p_expected_version integer
)
returns table (resolved_case_id uuid,resolved_version integer,replayed boolean)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $fn$
declare v_role text; v_case public.crm_support_cases%rowtype;
begin
  if current_user<>'service_role' then raise exception 'CRM Support CSAT mutation requires the trusted server boundary'; end if;
  v_role:=public.crm_support_actor_role(p_organization_id,p_actor_user_id);
  if v_role is null or v_role='VIEWER' then raise exception 'CRM Support CSAT mutation requires an authorized Organization member'; end if;
  if p_score not between 1 and 5
     or (p_comment is not null and length(p_comment)>2000)
     or nullif(trim(p_source_ref),'') is null
     or length(trim(p_source_ref))>512 then
    raise exception 'Invalid CRM Support CSAT payload';
  end if;
  select * into v_case from public.crm_support_cases
    where organization_id=p_organization_id and id=p_case_id for update;
  if not found then raise exception 'CRM Support Case was not found in the Organization'; end if;
  if v_case.status not in ('RESOLVED','CLOSED') then raise exception 'CRM Support CSAT requires a resolved Case'; end if;
  if v_case.csat_score=p_score
     and v_case.csat_comment is not distinct from p_comment
     and v_case.csat_source_ref=trim(p_source_ref) then
    return query select v_case.id,v_case.version,true; return;
  end if;
  if v_case.version<>p_expected_version then raise exception 'CRM Support Case version conflict'; end if;
  update public.crm_support_cases
    set csat_score=p_score,csat_comment=p_comment,csat_source_ref=trim(p_source_ref),
        updated_by_user_id=p_actor_user_id,version=version+1,updated_at=now()
  where organization_id=p_organization_id and id=p_case_id
  returning id,version into resolved_case_id,resolved_version;
  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'CRM_SUPPORT_CASE_CSAT_RECORDED',
    'crm_support_cases',p_case_id::text,
    jsonb_build_object('score',p_score,'has_comment',p_comment is not null,'source_present',true),
    'dbtx:'||txid_current()::text
  );
  replayed:=false; return next;
end;
$fn$;

create or replace function public.get_crm_support_sla_policies(
  p_organization_id uuid,
  p_include_retired boolean default false
)
returns table (
  id uuid,
  name text,
  priority text,
  first_response_minutes integer,
  resolution_minutes integer,
  escalation_minutes integer,
  status text,
  version integer,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  select p.id,p.name,p.priority,p.first_response_minutes,p.resolution_minutes,
         p.escalation_minutes,p.status,p.version,p.updated_at
  from public.crm_support_sla_policies p
  where p.organization_id=p_organization_id
    and public.is_org_member(p.organization_id)
    and (p_include_retired or p.status='ACTIVE')
  order by p.priority,p.name,p.id
$$;

create or replace function public.get_crm_support_cases(
  p_organization_id uuid,
  p_status text default null,
  p_priority text default null,
  p_assignee_user_id uuid default null,
  p_include_closed boolean default false,
  p_limit integer default 50,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  business_id uuid,
  business_name text,
  person_id uuid,
  person_name text,
  conversation_id uuid,
  conversation_channel text,
  subject text,
  status text,
  priority text,
  assignee_user_id uuid,
  sla_policy_id uuid,
  sla_policy_name text,
  first_response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_responded_at timestamptz,
  first_response_breached boolean,
  resolution_breached boolean,
  escalation_level smallint,
  resolution_summary text,
  resolved_at timestamptz,
  closed_at timestamptz,
  csat_score smallint,
  version integer,
  updated_at timestamptz,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  select
    c.id,c.business_id,b.name,c.person_id,p.display_name,c.conversation_id,sc.channel,
    c.subject,c.status,c.priority,c.assignee_user_id,c.sla_policy_id,sp.name,
    c.first_response_due_at,c.resolution_due_at,c.first_responded_at,
    (c.first_responded_at is null and c.first_response_due_at is not null
      and c.first_response_due_at<now() and c.status not in ('RESOLVED','CLOSED')) as first_response_breached,
    (c.resolved_at is null and c.resolution_due_at is not null
      and c.resolution_due_at<now() and c.status not in ('RESOLVED','CLOSED')) as resolution_breached,
    c.escalation_level,c.resolution_summary,c.resolved_at,c.closed_at,c.csat_score,
    c.version,c.updated_at,c.created_at
  from public.crm_support_cases c
  left join public.businesses b on b.id=c.business_id and b.organization_id=c.organization_id
  left join public.crm_people p on p.id=c.person_id and p.organization_id=c.organization_id
  left join public.sales_conversations sc on sc.id=c.conversation_id and sc.organization_id=c.organization_id
  left join public.crm_support_sla_policies sp on sp.id=c.sla_policy_id and sp.organization_id=c.organization_id
  where c.organization_id=p_organization_id
    and public.is_org_member(c.organization_id)
    and (p_status is null or c.status=p_status)
    and (p_priority is null or c.priority=p_priority)
    and (p_assignee_user_id is null or c.assignee_user_id=p_assignee_user_id)
    and (p_include_closed or c.status<>'CLOSED')
    and (
      p_before_updated_at is null
      or (c.updated_at,c.id)<(p_before_updated_at,p_before_id)
    )
  order by c.updated_at desc,c.id desc
  limit least(greatest(coalesce(p_limit,50),1),100)
$$;

revoke all on function public.crm_support_actor_role(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.crm_support_actor_role(uuid,uuid)
  to service_role;
revoke all on function public.guard_crm_support_case_scope()
  from public,anon,authenticated,service_role;

revoke all on function public.upsert_crm_support_sla_policy_manual(uuid,uuid,uuid,text,text,integer,integer,integer,text,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.upsert_crm_support_sla_policy_manual(uuid,uuid,uuid,text,text,integer,integer,integer,text,integer,text)
  to service_role;

revoke all on function public.create_crm_support_case_manual(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,text,text,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.create_crm_support_case_manual(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,text,text,text,jsonb)
  to service_role;

revoke all on function public.assign_crm_support_case_manual(uuid,uuid,uuid,uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.assign_crm_support_case_manual(uuid,uuid,uuid,uuid,integer,text)
  to service_role;

revoke all on function public.mark_crm_support_first_response_manual(uuid,uuid,uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mark_crm_support_first_response_manual(uuid,uuid,uuid,integer,text)
  to service_role;

revoke all on function public.transition_crm_support_case_manual(uuid,uuid,uuid,text,integer,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.transition_crm_support_case_manual(uuid,uuid,uuid,text,integer,text,text)
  to service_role;

revoke all on function public.escalate_crm_support_case_manual(uuid,uuid,uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.escalate_crm_support_case_manual(uuid,uuid,uuid,integer,text)
  to service_role;

revoke all on function public.record_crm_support_csat_manual(uuid,uuid,uuid,smallint,text,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.record_crm_support_csat_manual(uuid,uuid,uuid,smallint,text,text,integer)
  to service_role;

revoke all on function public.get_crm_support_sla_policies(uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.get_crm_support_sla_policies(uuid,boolean)
  to authenticated;

revoke all on function public.get_crm_support_cases(uuid,text,text,uuid,boolean,integer,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_crm_support_cases(uuid,text,text,uuid,boolean,integer,timestamptz,uuid)
  to authenticated;

comment on table public.crm_support_cases is
  'Canonical Smart Core Support Case authority. Order/Payment links remain absent until those canonical modules exist.';
comment on table public.crm_support_sla_policies is
  'Smart Core owned SLA policy authority for CRM Support Cases.';
