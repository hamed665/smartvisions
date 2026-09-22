-- Smart Visions AI Business OS 2027
-- Customer 360 Foundation
--
-- Additive CRM normalization only:
-- - keeps public.businesses as the canonical company/prospect entity;
-- - keeps public.leads as the canonical lead/opportunity entity;
-- - adds person Contacts and deterministic contact identities;
-- - adds an optional lead -> contact link;
-- - hardens tenant consistency without moving existing CRM ownership;
-- - audits Customer 360 mutations without copying raw identity PII into audit_logs.

-- ---------------------------------------------------------------------------
-- Existing CRM tenant-consistency prerequisites.
-- ---------------------------------------------------------------------------

create unique index if not exists businesses_org_id_uidx
  on public.businesses(organization_id, id);

create unique index if not exists leads_org_id_uidx
  on public.leads(organization_id, id);

do $tenant_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_org_business_tenant_fk'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_org_business_tenant_fk
      foreign key (organization_id, business_id)
      references public.businesses(organization_id, id)
      on delete cascade;
  end if;
end;
$tenant_fk$;

-- Organization ownership is already a universal Business OS invariant. Reuse
-- the Phase 1 guard instead of creating a second tenant-ownership mechanism.
drop trigger if exists businesses_tenant_ownership_guard on public.businesses;
create trigger businesses_tenant_ownership_guard
before update of organization_id on public.businesses
for each row execute function public.enforce_tenant_ownership_immutable();

drop trigger if exists leads_tenant_ownership_guard on public.leads;
create trigger leads_tenant_ownership_guard
before update of organization_id on public.leads
for each row execute function public.enforce_tenant_ownership_immutable();

-- ---------------------------------------------------------------------------
-- Contact identity normalization.
-- ---------------------------------------------------------------------------

create or replace function public.normalize_crm_identity_value(
  p_identity_type text,
  p_value text
)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = pg_catalog
as $identity_normalize$
declare
  v_type text := upper(btrim(p_identity_type));
  v_value text := btrim(p_value);
begin
  if v_type = 'EMAIL' then
    return lower(v_value);
  end if;

  if v_type in ('PHONE', 'WHATSAPP') then
    return regexp_replace(v_value, '[^0-9]+', '', 'g');
  end if;

  raise exception 'unsupported CRM identity type: %', p_identity_type;
end;
$identity_normalize$;

revoke all on function public.normalize_crm_identity_value(text, text)
  from public, anon;
grant execute on function public.normalize_crm_identity_value(text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Canonical person/customer profile.
-- ---------------------------------------------------------------------------

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid,
  display_name text,
  given_name text,
  family_name text,
  preferred_locale text,
  timezone text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','ARCHIVED','MERGED')),
  merged_into_contact_id uuid,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, business_id)
    references public.businesses(organization_id, id)
    on delete restrict,
  foreign key (organization_id, merged_into_contact_id)
    references public.crm_contacts(organization_id, id)
    on delete restrict,
  check (
    (
      status = 'MERGED'
      and merged_into_contact_id is not null
      and merged_into_contact_id <> id
    )
    or
    (
      status in ('ACTIVE','ARCHIVED')
      and merged_into_contact_id is null
    )
  )
);

create index if not exists crm_contacts_org_status_idx
  on public.crm_contacts(organization_id, status, updated_at desc);

create index if not exists crm_contacts_org_business_idx
  on public.crm_contacts(organization_id, business_id, updated_at desc)
  where business_id is not null;

create index if not exists crm_contacts_merged_target_idx
  on public.crm_contacts(organization_id, merged_into_contact_id)
  where merged_into_contact_id is not null;

drop trigger if exists crm_contacts_tenant_ownership_guard on public.crm_contacts;
create trigger crm_contacts_tenant_ownership_guard
before update of organization_id on public.crm_contacts
for each row execute function public.enforce_tenant_ownership_immutable();

create or replace function public.enforce_crm_contact_state()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $contact_state$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'MERGED' then
      raise exception 'MERGED contact is terminal and immutable';
    end if;

    if new.status is distinct from old.status then
      if old.status = 'ACTIVE' and new.status in ('ARCHIVED','MERGED') then
        null;
      elsif old.status = 'ARCHIVED' and new.status in ('ACTIVE','MERGED') then
        null;
      else
        raise exception 'invalid CRM contact state transition: % -> %', old.status, new.status;
      end if;
    end if;
  end if;

  if new.status = 'MERGED' then
    if new.merged_into_contact_id is null or new.merged_into_contact_id = new.id then
      raise exception 'MERGED contact requires a different merge target';
    end if;

    if not exists (
      select 1
      from public.crm_contacts target
      where target.organization_id = new.organization_id
        and target.id = new.merged_into_contact_id
        and target.status = 'ACTIVE'
    ) then
      raise exception 'CRM contact merge target must be ACTIVE in the same organization';
    end if;
  elsif new.merged_into_contact_id is not null then
    raise exception 'non-MERGED contact cannot have a merge target';
  end if;

  new.updated_at := now();
  return new;
end;
$contact_state$;

drop trigger if exists crm_contacts_state_guard on public.crm_contacts;
create trigger crm_contacts_state_guard
before insert or update on public.crm_contacts
for each row execute function public.enforce_crm_contact_state();

-- ---------------------------------------------------------------------------
-- Identity resolution evidence.
-- ---------------------------------------------------------------------------

create table if not exists public.crm_contact_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null,
  identity_type text not null
    check (identity_type in ('EMAIL','PHONE','WHATSAPP')),
  raw_value text not null check (length(btrim(raw_value)) > 0),
  normalized_value text generated always as (
    public.normalize_crm_identity_value(identity_type, raw_value)
  ) stored,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','RETIRED')),
  is_primary boolean not null default false,
  verified_at timestamptz,
  source_type text not null default 'MANUAL'
    check (length(btrim(source_type)) > 0),
  source_id text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, contact_id)
    references public.crm_contacts(organization_id, id)
    on delete restrict,
  check (length(normalized_value) > 0),
  check (status = 'ACTIVE' or is_primary = false)
);

create unique index if not exists crm_contact_identities_active_value_uidx
  on public.crm_contact_identities(
    organization_id,
    identity_type,
    normalized_value
  )
  where status = 'ACTIVE';

create unique index if not exists crm_contact_identities_primary_uidx
  on public.crm_contact_identities(
    organization_id,
    contact_id,
    identity_type
  )
  where status = 'ACTIVE' and is_primary;

create index if not exists crm_contact_identities_contact_idx
  on public.crm_contact_identities(
    organization_id,
    contact_id,
    status,
    created_at desc
  );

drop trigger if exists crm_contact_identities_tenant_ownership_guard
  on public.crm_contact_identities;
create trigger crm_contact_identities_tenant_ownership_guard
before update of organization_id on public.crm_contact_identities
for each row execute function public.enforce_tenant_ownership_immutable();

create or replace function public.enforce_crm_contact_identity_state()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $identity_state$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
      or new.contact_id is distinct from old.contact_id
      or new.identity_type is distinct from old.identity_type
      or new.raw_value is distinct from old.raw_value
      or new.source_type is distinct from old.source_type
      or new.source_id is distinct from old.source_id
    then
      raise exception 'CRM contact identity evidence is immutable; retire and replace it';
    end if;

    if old.status = 'RETIRED' and new.status <> 'RETIRED' then
      raise exception 'RETIRED CRM identity is terminal';
    end if;

    if old.status = 'ACTIVE' and new.status not in ('ACTIVE','RETIRED') then
      raise exception 'invalid CRM identity state transition';
    end if;
  end if;

  if new.status = 'RETIRED' and new.is_primary then
    raise exception 'RETIRED CRM identity cannot remain primary';
  end if;

  new.updated_at := now();
  return new;
end;
$identity_state$;

drop trigger if exists crm_contact_identities_state_guard
  on public.crm_contact_identities;
create trigger crm_contact_identities_state_guard
before insert or update on public.crm_contact_identities
for each row execute function public.enforce_crm_contact_identity_state();

-- ---------------------------------------------------------------------------
-- Extend the canonical Lead instead of creating a second opportunity record.
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists contact_id uuid;

do $lead_contact_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_org_contact_tenant_fk'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_org_contact_tenant_fk
      foreign key (organization_id, contact_id)
      references public.crm_contacts(organization_id, id)
      on delete restrict;
  end if;
end;
$lead_contact_fk$;

create index if not exists leads_org_contact_idx
  on public.leads(organization_id, contact_id, updated_at desc)
  where contact_id is not null;

-- ---------------------------------------------------------------------------
-- CRM write authorization for new Customer 360 entities.
-- Legacy CRM policies are intentionally not silently rewritten in this slice.
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_crm(p_organization_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $crm_auth$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT')
  );
$crm_auth$;

revoke all on function public.can_manage_crm(uuid)
  from public, anon;
grant execute on function public.can_manage_crm(uuid)
  to authenticated, service_role;

alter table public.crm_contacts enable row level security;
alter table public.crm_contact_identities enable row level security;

drop policy if exists crm_contacts_member_read on public.crm_contacts;
create policy crm_contacts_member_read
  on public.crm_contacts
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists crm_contacts_member_insert on public.crm_contacts;
create policy crm_contacts_member_insert
  on public.crm_contacts
  for insert
  to authenticated
  with check (public.can_manage_crm(organization_id));

drop policy if exists crm_contacts_member_update on public.crm_contacts;
create policy crm_contacts_member_update
  on public.crm_contacts
  for update
  to authenticated
  using (public.can_manage_crm(organization_id))
  with check (public.can_manage_crm(organization_id));

drop policy if exists crm_contact_identities_member_read on public.crm_contact_identities;
create policy crm_contact_identities_member_read
  on public.crm_contact_identities
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists crm_contact_identities_member_insert on public.crm_contact_identities;
create policy crm_contact_identities_member_insert
  on public.crm_contact_identities
  for insert
  to authenticated
  with check (public.can_manage_crm(organization_id));

drop policy if exists crm_contact_identities_member_update on public.crm_contact_identities;
create policy crm_contact_identities_member_update
  on public.crm_contact_identities
  for update
  to authenticated
  using (public.can_manage_crm(organization_id))
  with check (public.can_manage_crm(organization_id));

revoke all on public.crm_contacts, public.crm_contact_identities
  from anon, authenticated, service_role;

grant select, insert, update
  on public.crm_contacts, public.crm_contact_identities
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fail-closed identity resolution. Returns IDs/state only, never raw identity PII.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_crm_contact_identity(
  p_organization_id uuid,
  p_identity_type text,
  p_identity_value text
)
returns table(
  identity_id uuid,
  matched_contact_id uuid,
  canonical_contact_id uuid,
  matched_contact_status text
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $identity_resolve$
  select
    identity.id as identity_id,
    contact.id as matched_contact_id,
    case
      when contact.status = 'MERGED' then contact.merged_into_contact_id
      else contact.id
    end as canonical_contact_id,
    contact.status as matched_contact_status
  from public.crm_contact_identities identity
  join public.crm_contacts contact
    on contact.organization_id = identity.organization_id
   and contact.id = identity.contact_id
  where identity.organization_id = p_organization_id
    and identity.identity_type = upper(btrim(p_identity_type))
    and identity.normalized_value =
      public.normalize_crm_identity_value(p_identity_type, p_identity_value)
    and identity.status = 'ACTIVE'
  limit 1;
$identity_resolve$;

revoke all on function public.resolve_crm_contact_identity(uuid, text, text)
  from public, anon;
grant execute on function public.resolve_crm_contact_identity(uuid, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- PII-minimized audit. Raw/normalized identity values are never copied to audit.
-- ---------------------------------------------------------------------------

create or replace function public.audit_crm_customer_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $crm_audit$
declare
  v_row jsonb;
  v_org_id uuid;
  v_entity_id text;
  v_actor uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'INSERT' then
    v_row := to_jsonb(new);
  else
    v_row := coalesce(to_jsonb(new), to_jsonb(old));
  end if;

  v_org_id := nullif(v_row ->> 'organization_id', '')::uuid;
  v_entity_id := v_row ->> 'id';
  v_actor := auth.uid();

  if tg_table_name = 'crm_contacts' then
    if tg_op in ('UPDATE','DELETE') then
      v_before := jsonb_build_object(
        'business_id', old.business_id,
        'status', old.status,
        'merged_into_contact_id', old.merged_into_contact_id
      );
    end if;
    if tg_op in ('INSERT','UPDATE') then
      v_after := jsonb_build_object(
        'business_id', new.business_id,
        'status', new.status,
        'merged_into_contact_id', new.merged_into_contact_id
      );
    end if;
  elsif tg_table_name = 'crm_contact_identities' then
    if tg_op in ('UPDATE','DELETE') then
      v_before := jsonb_build_object(
        'contact_id', old.contact_id,
        'identity_type', old.identity_type,
        'status', old.status,
        'is_primary', old.is_primary,
        'verified', old.verified_at is not null,
        'source_type', old.source_type
      );
    end if;
    if tg_op in ('INSERT','UPDATE') then
      v_after := jsonb_build_object(
        'contact_id', new.contact_id,
        'identity_type', new.identity_type,
        'status', new.status,
        'is_primary', new.is_primary,
        'verified', new.verified_at is not null,
        'source_type', new.source_type
      );
    end if;
  elsif tg_table_name = 'leads' then
    v_before := jsonb_build_object('contact_id', old.contact_id);
    v_after := jsonb_build_object('contact_id', new.contact_id);
  else
    raise exception 'unsupported CRM audit table: %', tg_table_name;
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
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    coalesce(v_actor::text, current_user),
    'CRM_' || upper(tg_table_name) || '_' || tg_op,
    tg_table_name,
    v_entity_id,
    v_before,
    v_after,
    'dbtx:' || txid_current()::text
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$crm_audit$;

revoke all on function public.audit_crm_customer_mutation()
  from public, anon, authenticated;

drop trigger if exists crm_contacts_audit_mutation on public.crm_contacts;
create trigger crm_contacts_audit_mutation
after insert or update on public.crm_contacts
for each row execute function public.audit_crm_customer_mutation();

drop trigger if exists crm_contact_identities_audit_mutation
  on public.crm_contact_identities;
create trigger crm_contact_identities_audit_mutation
after insert or update on public.crm_contact_identities
for each row execute function public.audit_crm_customer_mutation();

drop trigger if exists leads_contact_audit_mutation on public.leads;
create trigger leads_contact_audit_mutation
after update of contact_id on public.leads
for each row
when (old.contact_id is distinct from new.contact_id)
execute function public.audit_crm_customer_mutation();
