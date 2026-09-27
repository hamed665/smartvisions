-- SECTION IDENTITY_CRM / CRM-PERSON-CONTACT
-- Governed canonical Person/Contact foundation.
-- Reuses crm_identities as identity truth and businesses as Company/Account truth.
-- Deliberately performs no Production backfill: a Business/provider display name is not Person evidence.

create table if not exists public.crm_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_from_identity_id uuid not null,
  display_name text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','MERGED','RETIRED')),
  merged_into_person_id uuid,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint crm_people_display_name_check
    check (display_name is null or (length(trim(display_name)) between 1 and 200)),
  constraint crm_people_merge_state_check
    check (
      (status = 'MERGED' and merged_into_person_id is not null)
      or (status <> 'MERGED' and merged_into_person_id is null)
    ),
  constraint crm_people_not_self_merged_check
    check (merged_into_person_id is null or merged_into_person_id <> id),
  constraint crm_people_created_identity_fk
    foreign key (organization_id, created_from_identity_id)
    references public.crm_identities(organization_id, id)
    on delete restrict,
  constraint crm_people_created_by_member_fk
    foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  constraint crm_people_updated_by_member_fk
    foreign key (organization_id, updated_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

alter table public.crm_people
  drop constraint if exists crm_people_merged_into_fk;
alter table public.crm_people
  add constraint crm_people_merged_into_fk
  foreign key (organization_id, merged_into_person_id)
  references public.crm_people(organization_id, id)
  on delete restrict;

create table if not exists public.crm_person_identity_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null,
  identity_id uuid not null,
  verification_method text not null
    check (verification_method in ('MANUAL_CONFIRMED','PROVIDER_AUTHENTICATED','IMPORT_VERIFIED')),
  source_ref text not null
    check (length(trim(source_ref)) between 1 and 512),
  evidence jsonb not null
    check (jsonb_typeof(evidence) = 'object' and evidence <> '{}'::jsonb),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','CONFLICTED','RETIRED')),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, person_id, identity_id, verification_method, source_ref),
  constraint crm_person_identity_links_person_fk
    foreign key (organization_id, person_id)
    references public.crm_people(organization_id, id)
    on delete cascade,
  constraint crm_person_identity_links_identity_fk
    foreign key (organization_id, identity_id)
    references public.crm_identities(organization_id, id)
    on delete restrict,
  constraint crm_person_identity_links_created_by_member_fk
    foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  constraint crm_person_identity_links_updated_by_member_fk
    foreign key (organization_id, updated_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create table if not exists public.crm_person_business_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null,
  business_id uuid not null,
  relationship_type text not null
    check (relationship_type in ('CONTACT','OWNER','EMPLOYEE','DECISION_MAKER','BILLING_CONTACT','OTHER')),
  job_title text,
  verification_method text not null
    check (verification_method in ('MANUAL_CONFIRMED','PROVIDER_AUTHENTICATED','IMPORT_VERIFIED')),
  source_ref text not null
    check (length(trim(source_ref)) between 1 and 512),
  evidence jsonb not null
    check (jsonb_typeof(evidence) = 'object' and evidence <> '{}'::jsonb),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','RETIRED')),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, person_id, business_id, relationship_type, source_ref),
  constraint crm_person_business_relationships_job_title_check
    check (job_title is null or (length(trim(job_title)) between 1 and 200)),
  constraint crm_person_business_relationships_person_fk
    foreign key (organization_id, person_id)
    references public.crm_people(organization_id, id)
    on delete cascade,
  constraint crm_person_business_relationships_business_fk
    foreign key (organization_id, business_id)
    references public.businesses(organization_id, id)
    on delete cascade,
  constraint crm_person_business_relationships_created_by_member_fk
    foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  constraint crm_person_business_relationships_updated_by_member_fk
    foreign key (organization_id, updated_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create index if not exists crm_people_created_identity_idx
  on public.crm_people(organization_id, created_from_identity_id);
create index if not exists crm_people_merged_into_idx
  on public.crm_people(organization_id, merged_into_person_id)
  where merged_into_person_id is not null;
create index if not exists crm_people_created_by_idx
  on public.crm_people(organization_id, created_by_user_id);
create index if not exists crm_people_updated_by_idx
  on public.crm_people(organization_id, updated_by_user_id);
create index if not exists crm_people_active_updated_idx
  on public.crm_people(organization_id, updated_at desc, id)
  where status = 'ACTIVE';

create index if not exists crm_person_identity_links_identity_idx
  on public.crm_person_identity_links(organization_id, identity_id, status, person_id);
create index if not exists crm_person_identity_links_person_idx
  on public.crm_person_identity_links(organization_id, person_id, status);
create index if not exists crm_person_identity_links_created_by_idx
  on public.crm_person_identity_links(organization_id, created_by_user_id);
create index if not exists crm_person_identity_links_updated_by_idx
  on public.crm_person_identity_links(organization_id, updated_by_user_id);

create index if not exists crm_person_business_relationships_business_idx
  on public.crm_person_business_relationships(organization_id, business_id, status, person_id);
create index if not exists crm_person_business_relationships_person_idx
  on public.crm_person_business_relationships(organization_id, person_id, status);
create index if not exists crm_person_business_relationships_created_by_idx
  on public.crm_person_business_relationships(organization_id, created_by_user_id);
create index if not exists crm_person_business_relationships_updated_by_idx
  on public.crm_person_business_relationships(organization_id, updated_by_user_id);

create or replace function public.guard_crm_person_tenant_ownership()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $crm_person_guard$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable for CRM Person records';
  end if;
  if tg_table_name = 'crm_people'
     and new.created_from_identity_id is distinct from old.created_from_identity_id then
    raise exception 'created_from_identity_id is immutable for CRM Person records';
  end if;
  return new;
end;
$crm_person_guard$;

drop trigger if exists crm_people_tenant_guard on public.crm_people;
create trigger crm_people_tenant_guard
before update on public.crm_people
for each row execute function public.guard_crm_person_tenant_ownership();

drop trigger if exists crm_person_identity_links_tenant_guard on public.crm_person_identity_links;
create trigger crm_person_identity_links_tenant_guard
before update on public.crm_person_identity_links
for each row execute function public.guard_crm_person_tenant_ownership();

drop trigger if exists crm_person_business_relationships_tenant_guard on public.crm_person_business_relationships;
create trigger crm_person_business_relationships_tenant_guard
before update on public.crm_person_business_relationships
for each row execute function public.guard_crm_person_tenant_ownership();

create or replace function public.create_or_resolve_crm_person_from_verified_identity(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_identity_id uuid,
  p_display_name text,
  p_verification_method text,
  p_source_ref text,
  p_evidence jsonb,
  p_business_id uuid,
  p_relationship_type text,
  p_job_title text,
  p_relationship_verification_method text,
  p_relationship_source_ref text,
  p_relationship_evidence jsonb
)
returns table (
  resolved_person_id uuid,
  created boolean,
  resolved_relationship_id uuid
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $crm_person_create$
declare
  v_actor_role text;
  v_identity_status text;
  v_person_count integer;
  v_has_conflict boolean;
  v_person_id uuid;
  v_created boolean := false;
  v_relationship_id uuid;
begin
  select m.role
    into v_actor_role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = p_actor_user_id;

  if v_actor_role is null
     or v_actor_role not in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT') then
    raise exception 'CRM Person mutation requires an authorized Organization member';
  end if;

  select i.status
    into v_identity_status
  from public.crm_identities i
  where i.organization_id = p_organization_id
    and i.id = p_identity_id;

  if v_identity_status is null or v_identity_status <> 'ACTIVE' then
    raise exception 'CRM Person requires an active canonical identity in the same Organization';
  end if;

  if p_verification_method not in ('MANUAL_CONFIRMED','PROVIDER_AUTHENTICATED','IMPORT_VERIFIED') then
    raise exception 'CRM Person verification method is invalid';
  end if;
  if nullif(trim(p_source_ref), '') is null or length(trim(p_source_ref)) > 512 then
    raise exception 'CRM Person verification source reference is required';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or p_evidence = '{}'::jsonb then
    raise exception 'CRM Person requires non-empty verified identity evidence';
  end if;
  if p_display_name is not null
     and (nullif(trim(p_display_name), '') is null or length(trim(p_display_name)) > 200) then
    raise exception 'CRM Person display name is invalid';
  end if;

  select count(distinct l.person_id)::integer,
         coalesce(bool_or(l.status = 'CONFLICTED' or p.status <> 'ACTIVE'), false)
    into v_person_count, v_has_conflict
  from public.crm_person_identity_links l
  join public.crm_people p
    on p.organization_id = l.organization_id
   and p.id = l.person_id
  where l.organization_id = p_organization_id
    and l.identity_id = p_identity_id
    and l.status <> 'RETIRED';

  if v_person_count > 1 or v_has_conflict then
    raise exception 'CRM Person identity is ambiguous and requires manual resolution';
  end if;

  if v_person_count = 1 then
    select l.person_id
      into v_person_id
    from public.crm_person_identity_links l
    join public.crm_people p
      on p.organization_id = l.organization_id
     and p.id = l.person_id
    where l.organization_id = p_organization_id
      and l.identity_id = p_identity_id
      and l.status = 'ACTIVE'
      and p.status = 'ACTIVE'
    order by l.first_seen_at, l.id
    limit 1;

    if v_person_id is null then
      raise exception 'CRM Person identity is not resolvable to an active Person';
    end if;

    update public.crm_people
       set display_name = case
             when display_name is null and p_display_name is not null
             then trim(p_display_name)
             else display_name
           end,
           updated_by_user_id = p_actor_user_id,
           last_seen_at = now(),
           updated_at = now()
     where organization_id = p_organization_id
       and id = v_person_id;
  else
    insert into public.crm_people(
      organization_id,
      created_from_identity_id,
      display_name,
      status,
      created_by_user_id,
      updated_by_user_id
    ) values (
      p_organization_id,
      p_identity_id,
      nullif(trim(p_display_name), ''),
      'ACTIVE',
      p_actor_user_id,
      p_actor_user_id
    )
    returning id into v_person_id;
    v_created := true;
  end if;

  insert into public.crm_person_identity_links(
    organization_id,
    person_id,
    identity_id,
    verification_method,
    source_ref,
    evidence,
    status,
    created_by_user_id,
    updated_by_user_id,
    last_seen_at,
    updated_at
  ) values (
    p_organization_id,
    v_person_id,
    p_identity_id,
    p_verification_method,
    trim(p_source_ref),
    p_evidence,
    'ACTIVE',
    p_actor_user_id,
    p_actor_user_id,
    now(),
    now()
  )
  on conflict (organization_id, person_id, identity_id, verification_method, source_ref)
  do update set
    evidence = public.crm_person_identity_links.evidence || excluded.evidence,
    status = 'ACTIVE',
    updated_by_user_id = excluded.updated_by_user_id,
    last_seen_at = now(),
    updated_at = now();

  if p_business_id is null then
    if p_relationship_type is not null
       or p_job_title is not null
       or p_relationship_verification_method is not null
       or p_relationship_source_ref is not null
       or p_relationship_evidence is not null then
      raise exception 'CRM Person business relationship fields require business_id';
    end if;
  else
    if not exists (
      select 1
      from public.businesses b
      where b.organization_id = p_organization_id
        and b.id = p_business_id
    ) then
      raise exception 'CRM Person Business is not in the same Organization';
    end if;

    if p_relationship_type not in ('CONTACT','OWNER','EMPLOYEE','DECISION_MAKER','BILLING_CONTACT','OTHER') then
      raise exception 'CRM Person relationship type is invalid';
    end if;
    if p_job_title is not null
       and (nullif(trim(p_job_title), '') is null or length(trim(p_job_title)) > 200) then
      raise exception 'CRM Person relationship job title is invalid';
    end if;
    if p_relationship_verification_method not in ('MANUAL_CONFIRMED','PROVIDER_AUTHENTICATED','IMPORT_VERIFIED') then
      raise exception 'CRM Person relationship verification method is invalid';
    end if;
    if nullif(trim(p_relationship_source_ref), '') is null
       or length(trim(p_relationship_source_ref)) > 512 then
      raise exception 'CRM Person relationship source reference is required';
    end if;
    if p_relationship_evidence is null
       or jsonb_typeof(p_relationship_evidence) <> 'object'
       or p_relationship_evidence = '{}'::jsonb then
      raise exception 'CRM Person relationship requires non-empty evidence';
    end if;

    insert into public.crm_person_business_relationships(
      organization_id,
      person_id,
      business_id,
      relationship_type,
      job_title,
      verification_method,
      source_ref,
      evidence,
      status,
      created_by_user_id,
      updated_by_user_id,
      last_seen_at,
      updated_at
    ) values (
      p_organization_id,
      v_person_id,
      p_business_id,
      p_relationship_type,
      nullif(trim(p_job_title), ''),
      p_relationship_verification_method,
      trim(p_relationship_source_ref),
      p_relationship_evidence,
      'ACTIVE',
      p_actor_user_id,
      p_actor_user_id,
      now(),
      now()
    )
    on conflict (organization_id, person_id, business_id, relationship_type, source_ref)
    do update set
      job_title = coalesce(excluded.job_title, public.crm_person_business_relationships.job_title),
      verification_method = excluded.verification_method,
      evidence = public.crm_person_business_relationships.evidence || excluded.evidence,
      status = 'ACTIVE',
      updated_by_user_id = excluded.updated_by_user_id,
      last_seen_at = now(),
      updated_at = now()
    returning id into v_relationship_id;
  end if;

  return query
  select v_person_id, v_created, v_relationship_id;
end;
$crm_person_create$;

create or replace function public.audit_crm_person_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $crm_person_audit$
declare
  v_before jsonb;
  v_after jsonb;
  v_row jsonb;
  v_before_summary jsonb;
  v_after_summary jsonb;
  v_org_id uuid;
  v_actor_id text;
  v_action text;
begin
  v_before := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_after := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  v_row := coalesce(v_after, v_before);
  v_org_id := nullif(v_row ->> 'organization_id', '')::uuid;
  v_actor_id := coalesce(v_after ->> 'updated_by_user_id', v_after ->> 'created_by_user_id',
                         v_before ->> 'updated_by_user_id', v_before ->> 'created_by_user_id');

  if tg_table_name = 'crm_people' then
    v_action := 'CRM_PERSON_' || tg_op;
    v_before_summary := case when v_before is null then null else jsonb_build_object(
      'created_from_identity_id', v_before ->> 'created_from_identity_id',
      'status', v_before ->> 'status',
      'merged_into_person_id', v_before ->> 'merged_into_person_id',
      'has_display_name', coalesce(v_before ->> 'display_name', '') <> ''
    ) end;
    v_after_summary := case when v_after is null then null else jsonb_build_object(
      'created_from_identity_id', v_after ->> 'created_from_identity_id',
      'status', v_after ->> 'status',
      'merged_into_person_id', v_after ->> 'merged_into_person_id',
      'has_display_name', coalesce(v_after ->> 'display_name', '') <> ''
    ) end;
  elsif tg_table_name = 'crm_person_identity_links' then
    v_action := 'CRM_PERSON_IDENTITY_LINK_' || tg_op;
    v_before_summary := case when v_before is null then null else jsonb_build_object(
      'person_id', v_before ->> 'person_id',
      'identity_id', v_before ->> 'identity_id',
      'verification_method', v_before ->> 'verification_method',
      'status', v_before ->> 'status'
    ) end;
    v_after_summary := case when v_after is null then null else jsonb_build_object(
      'person_id', v_after ->> 'person_id',
      'identity_id', v_after ->> 'identity_id',
      'verification_method', v_after ->> 'verification_method',
      'status', v_after ->> 'status'
    ) end;
  else
    v_action := 'CRM_PERSON_BUSINESS_RELATIONSHIP_' || tg_op;
    v_before_summary := case when v_before is null then null else jsonb_build_object(
      'person_id', v_before ->> 'person_id',
      'business_id', v_before ->> 'business_id',
      'relationship_type', v_before ->> 'relationship_type',
      'verification_method', v_before ->> 'verification_method',
      'status', v_before ->> 'status'
    ) end;
    v_after_summary := case when v_after is null then null else jsonb_build_object(
      'person_id', v_after ->> 'person_id',
      'business_id', v_after ->> 'business_id',
      'relationship_type', v_after ->> 'relationship_type',
      'verification_method', v_after ->> 'verification_method',
      'status', v_after ->> 'status'
    ) end;
  end if;

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
    v_org_id,
    'USER',
    v_actor_id,
    v_action,
    tg_table_name,
    v_row ->> 'id',
    v_before_summary,
    v_after_summary,
    'dbtx:' || txid_current()::text
  );

  return new;
end;
$crm_person_audit$;

drop trigger if exists crm_people_audit_mutation on public.crm_people;
create trigger crm_people_audit_mutation
after insert or update on public.crm_people
for each row execute function public.audit_crm_person_mutation();

drop trigger if exists crm_person_identity_links_audit_mutation on public.crm_person_identity_links;
create trigger crm_person_identity_links_audit_mutation
after insert or update on public.crm_person_identity_links
for each row execute function public.audit_crm_person_mutation();

drop trigger if exists crm_person_business_relationships_audit_mutation on public.crm_person_business_relationships;
create trigger crm_person_business_relationships_audit_mutation
after insert or update on public.crm_person_business_relationships
for each row execute function public.audit_crm_person_mutation();

alter table public.crm_people enable row level security;
alter table public.crm_person_identity_links enable row level security;
alter table public.crm_person_business_relationships enable row level security;

drop policy if exists crm_people_member_read on public.crm_people;
create policy crm_people_member_read
on public.crm_people
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists crm_person_identity_links_member_read on public.crm_person_identity_links;
create policy crm_person_identity_links_member_read
on public.crm_person_identity_links
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists crm_person_business_relationships_member_read on public.crm_person_business_relationships;
create policy crm_person_business_relationships_member_read
on public.crm_person_business_relationships
for select
to authenticated
using (public.is_org_member(organization_id));

revoke all on public.crm_people from anon, authenticated, service_role;
revoke all on public.crm_person_identity_links from anon, authenticated, service_role;
revoke all on public.crm_person_business_relationships from anon, authenticated, service_role;

grant select on public.crm_people to authenticated;
grant select on public.crm_person_identity_links to authenticated;
grant select on public.crm_person_business_relationships to authenticated;

grant select, insert, update on public.crm_people to service_role;
grant select, insert, update on public.crm_person_identity_links to service_role;
grant select, insert, update on public.crm_person_business_relationships to service_role;

revoke all on function public.create_or_resolve_crm_person_from_verified_identity(
  uuid, uuid, uuid, text, text, text, jsonb, uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_or_resolve_crm_person_from_verified_identity(
  uuid, uuid, uuid, text, text, text, jsonb, uuid, text, text, text, text, jsonb
) to service_role;

revoke all on function public.guard_crm_person_tenant_ownership()
  from public, anon, authenticated;
revoke all on function public.audit_crm_person_mutation()
  from public, anon, authenticated;

comment on table public.crm_people is
  'Canonical Organization-scoped Person/Contact entities. Creation requires a verified canonical crm_identity; no display-name-only creation or migration backfill.';
comment on table public.crm_person_identity_links is
  'Verified evidence linking canonical crm_identities to People. Identity ambiguity must fail closed; no fuzzy person merge.';
comment on table public.crm_person_business_relationships is
  'Evidence-backed Person-to-existing-businesses Company/Account relationships. Does not create a second Account model.';
