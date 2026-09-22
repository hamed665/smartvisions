-- Smart Visions AI Business OS 2027
-- Phase 3 / CRM Identity Foundation
--
-- Additive and backward compatible:
-- - keeps public.businesses as the canonical CRM Account/Company;
-- - keeps public.leads as the canonical lead/opportunity foundation;
-- - adds tenant-scoped normalized identities and evidence links;
-- - does not remove or rewrite legacy Business contact fields;
-- - adds no provider side effect.

create unique index if not exists businesses_organization_id_id_unique
  on public.businesses(organization_id, id);

create table if not exists public.crm_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  identity_type text not null
    check (identity_type in ('EMAIL','PHONE','WHATSAPP','INSTAGRAM')),
  normalized_value text not null
    check (length(trim(normalized_value)) between 1 and 512),
  display_value text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','RETIRED')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, identity_type, normalized_value)
);

create table if not exists public.crm_identity_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  identity_id uuid not null,
  business_id uuid not null,
  source_type text not null
    check (source_type in (
      'BUSINESS_FIELD',
      'EMAIL_INBOUND',
      'WHATSAPP_INBOUND',
      'MANUAL',
      'IMPORT'
    )),
  source_ref text not null default ''
    check (length(source_ref) <= 512),
  evidence_strength text not null default 'OBSERVED'
    check (evidence_strength in ('OBSERVED','VERIFIED')),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','CONFLICTED','RETIRED')),
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, identity_id, business_id, source_type, source_ref),
  foreign key (organization_id, identity_id)
    references public.crm_identities(organization_id, id)
    on delete restrict,
  foreign key (organization_id, business_id)
    references public.businesses(organization_id, id)
    on delete cascade
);

create index if not exists crm_identity_links_identity_resolution_idx
  on public.crm_identity_links(organization_id, identity_id, status, business_id);

create index if not exists crm_identity_links_business_idx
  on public.crm_identity_links(organization_id, business_id, status);

-- Tenant ownership is immutable after creation.
drop trigger if exists crm_identities_tenant_ownership_guard on public.crm_identities;
create trigger crm_identities_tenant_ownership_guard
before update of organization_id on public.crm_identities
for each row execute function public.enforce_tenant_ownership_immutable();

drop trigger if exists crm_identity_links_tenant_ownership_guard on public.crm_identity_links;
create trigger crm_identity_links_tenant_ownership_guard
before update of organization_id on public.crm_identity_links
for each row execute function public.enforce_tenant_ownership_immutable();

-- ---------------------------------------------------------------------------
-- Backfill current Business contact-point evidence.
-- This is evidence migration, not Person creation.
-- Audit triggers are installed only after backfill to avoid fabricating
-- historical mutation events.
-- ---------------------------------------------------------------------------

with candidates as (
  select organization_id, id as business_id,
         'EMAIL'::text as identity_type,
         lower(trim(email)) as normalized_value,
         trim(email) as display_value,
         'businesses.email'::text as source_ref
  from public.businesses
  where nullif(trim(email), '') is not null
    and position('@' in email) > 1

  union all

  select organization_id, id,
         'PHONE',
         regexp_replace(phone, '\\D', '', 'g'),
         trim(phone),
         'businesses.phone'
  from public.businesses
  where nullif(trim(phone), '') is not null
    and length(regexp_replace(phone, '\\D', '', 'g')) >= 8

  union all

  select organization_id, id,
         'PHONE',
         regexp_replace(international_phone, '\\D', '', 'g'),
         trim(international_phone),
         'businesses.international_phone'
  from public.businesses
  where nullif(trim(international_phone), '') is not null
    and length(regexp_replace(international_phone, '\\D', '', 'g')) >= 8

  union all

  select organization_id, id,
         'WHATSAPP',
         regexp_replace(whatsapp, '\\D', '', 'g'),
         trim(whatsapp),
         'businesses.whatsapp'
  from public.businesses
  where nullif(trim(whatsapp), '') is not null
    and length(regexp_replace(whatsapp, '\\D', '', 'g')) >= 8

  union all

  select organization_id, id,
         'INSTAGRAM',
         lower(
           regexp_replace(
             split_part(
               regexp_replace(
                 regexp_replace(
                   trim(instagram),
                   '^https?://(www\\.)?instagram\\.com/',
                   '',
                   'i'
                 ),
                 '[?#].*$',
                 ''
               ),
               '/',
               1
             ),
             '^@',
             ''
           )
         ),
         trim(instagram),
         'businesses.instagram'
  from public.businesses
  where nullif(trim(instagram), '') is not null
),
valid_candidates as (
  select *
  from candidates
  where nullif(trim(normalized_value), '') is not null
    and length(normalized_value) <= 512
)
insert into public.crm_identities(
  organization_id,
  identity_type,
  normalized_value,
  display_value
)
select
  organization_id,
  identity_type,
  normalized_value,
  max(display_value)
from valid_candidates
group by organization_id, identity_type, normalized_value
on conflict (organization_id, identity_type, normalized_value) do nothing;

with candidates as (
  select organization_id, id as business_id,
         'EMAIL'::text as identity_type,
         lower(trim(email)) as normalized_value,
         'businesses.email'::text as source_ref
  from public.businesses
  where nullif(trim(email), '') is not null
    and position('@' in email) > 1

  union all

  select organization_id, id,
         'PHONE',
         regexp_replace(phone, '\\D', '', 'g'),
         'businesses.phone'
  from public.businesses
  where nullif(trim(phone), '') is not null
    and length(regexp_replace(phone, '\\D', '', 'g')) >= 8

  union all

  select organization_id, id,
         'PHONE',
         regexp_replace(international_phone, '\\D', '', 'g'),
         'businesses.international_phone'
  from public.businesses
  where nullif(trim(international_phone), '') is not null
    and length(regexp_replace(international_phone, '\\D', '', 'g')) >= 8

  union all

  select organization_id, id,
         'WHATSAPP',
         regexp_replace(whatsapp, '\\D', '', 'g'),
         'businesses.whatsapp'
  from public.businesses
  where nullif(trim(whatsapp), '') is not null
    and length(regexp_replace(whatsapp, '\\D', '', 'g')) >= 8

  union all

  select organization_id, id,
         'INSTAGRAM',
         lower(
           regexp_replace(
             split_part(
               regexp_replace(
                 regexp_replace(
                   trim(instagram),
                   '^https?://(www\\.)?instagram\\.com/',
                   '',
                   'i'
                 ),
                 '[?#].*$',
                 ''
               ),
               '/',
               1
             ),
             '^@',
             ''
           )
         ),
         'businesses.instagram'
  from public.businesses
  where nullif(trim(instagram), '') is not null
),
valid_candidates as (
  select *
  from candidates
  where nullif(trim(normalized_value), '') is not null
    and length(normalized_value) <= 512
)
insert into public.crm_identity_links(
  organization_id,
  identity_id,
  business_id,
  source_type,
  source_ref,
  evidence_strength,
  status,
  evidence
)
select
  c.organization_id,
  i.id,
  c.business_id,
  'BUSINESS_FIELD',
  c.source_ref,
  'OBSERVED',
  'ACTIVE',
  jsonb_build_object('backfill', true)
from valid_candidates c
join public.crm_identities i
  on i.organization_id = c.organization_id
 and i.identity_type = c.identity_type
 and i.normalized_value = c.normalized_value
on conflict (organization_id, identity_id, business_id, source_type, source_ref)
do nothing;

with conflicts as (
  select organization_id, identity_id
  from public.crm_identity_links
  where status <> 'RETIRED'
  group by organization_id, identity_id
  having count(distinct business_id) > 1
)
update public.crm_identity_links l
set status = 'CONFLICTED',
    updated_at = now()
from conflicts c
where l.organization_id = c.organization_id
  and l.identity_id = c.identity_id
  and l.status <> 'RETIRED';

-- ---------------------------------------------------------------------------
-- Trusted evidence command.
-- Caller provides a normalized identity produced by the shared runtime
-- normalizer. The database validates vocabulary, tenancy and conflict state.
-- ---------------------------------------------------------------------------

create or replace function public.record_crm_business_identity(
  p_organization_id uuid,
  p_business_id uuid,
  p_identity_type text,
  p_normalized_value text,
  p_display_value text,
  p_source_type text,
  p_source_ref text,
  p_evidence_strength text,
  p_evidence jsonb
)
returns table (
  identity_id uuid,
  business_id uuid,
  linked_business_count integer,
  ambiguous boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $crm_record$
declare
  v_identity_id uuid;
  v_identity_status text;
  v_linked_business_count integer;
begin
  if p_identity_type not in ('EMAIL','PHONE','WHATSAPP','INSTAGRAM') then
    raise exception 'invalid CRM identity type';
  end if;

  if nullif(trim(p_normalized_value), '') is null
     or length(trim(p_normalized_value)) > 512 then
    raise exception 'invalid normalized CRM identity value';
  end if;

  if p_source_type not in (
    'BUSINESS_FIELD',
    'EMAIL_INBOUND',
    'WHATSAPP_INBOUND',
    'MANUAL',
    'IMPORT'
  ) then
    raise exception 'invalid CRM identity source type';
  end if;

  if p_evidence_strength not in ('OBSERVED','VERIFIED') then
    raise exception 'invalid CRM identity evidence strength';
  end if;

  if length(coalesce(p_source_ref, '')) > 512 then
    raise exception 'CRM identity source reference is too long';
  end if;

  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'CRM identity evidence must be a JSON object';
  end if;

  if not exists (
    select 1
    from public.businesses b
    where b.id = p_business_id
      and b.organization_id = p_organization_id
  ) then
    raise exception 'CRM identity Business not found for organization';
  end if;

  insert into public.crm_identities(
    organization_id,
    identity_type,
    normalized_value,
    display_value,
    last_seen_at,
    updated_at
  ) values (
    p_organization_id,
    p_identity_type,
    trim(p_normalized_value),
    nullif(trim(p_display_value), ''),
    now(),
    now()
  )
  on conflict (organization_id, identity_type, normalized_value)
  do update set
    display_value = coalesce(public.crm_identities.display_value, excluded.display_value),
    last_seen_at = now(),
    updated_at = now()
  returning id, status
    into v_identity_id, v_identity_status;

  if v_identity_status <> 'ACTIVE' then
    raise exception 'CRM identity is retired';
  end if;

  insert into public.crm_identity_links(
    organization_id,
    identity_id,
    business_id,
    source_type,
    source_ref,
    evidence_strength,
    status,
    evidence,
    last_seen_at,
    updated_at
  ) values (
    p_organization_id,
    v_identity_id,
    p_business_id,
    p_source_type,
    coalesce(p_source_ref, ''),
    p_evidence_strength,
    'ACTIVE',
    p_evidence,
    now(),
    now()
  )
  on conflict (organization_id, identity_id, business_id, source_type, source_ref)
  do update set
    evidence_strength = case
      when public.crm_identity_links.evidence_strength = 'VERIFIED'
        or excluded.evidence_strength = 'VERIFIED'
      then 'VERIFIED'
      else 'OBSERVED'
    end,
    evidence = public.crm_identity_links.evidence || excluded.evidence,
    last_seen_at = now(),
    updated_at = now();

  select count(distinct l.business_id)::integer
    into v_linked_business_count
  from public.crm_identity_links l
  where l.organization_id = p_organization_id
    and l.identity_id = v_identity_id
    and l.status <> 'RETIRED';

  if v_linked_business_count > 1 then
    update public.crm_identity_links
       set status = 'CONFLICTED',
           updated_at = now()
     where organization_id = p_organization_id
       and identity_id = v_identity_id
       and status <> 'RETIRED';
  else
    update public.crm_identity_links
       set status = 'ACTIVE',
           updated_at = now()
     where organization_id = p_organization_id
       and identity_id = v_identity_id
       and status = 'CONFLICTED';
  end if;

  return query
  select
    v_identity_id,
    p_business_id,
    v_linked_business_count,
    v_linked_business_count > 1;
end;
$crm_record$;

-- ---------------------------------------------------------------------------
-- Audit CRM identity mutations without duplicating raw PII into audit_logs.
-- ---------------------------------------------------------------------------

create or replace function public.audit_crm_identity_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, extensions, pg_catalog
as $crm_audit$
declare
  v_before jsonb;
  v_after jsonb;
  v_row jsonb;
  v_before_summary jsonb;
  v_after_summary jsonb;
  v_org_id uuid;
  v_entity_id text;
  v_actor uuid;
  v_action text;
begin
  v_before := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_after := case when tg_op = 'INSERT' or tg_op = 'UPDATE' then to_jsonb(new) else null end;
  v_row := coalesce(v_after, v_before);
  v_org_id := nullif(v_row ->> 'organization_id', '')::uuid;
  v_entity_id := v_row ->> 'id';
  v_actor := auth.uid();

  if tg_table_name = 'crm_identities' then
    v_action := 'CRM_IDENTITY_' || tg_op;
    v_before_summary := case when v_before is null then null else jsonb_build_object(
      'identity_type', v_before ->> 'identity_type',
      'identity_fingerprint', encode(extensions.digest(coalesce(v_before ->> 'normalized_value', ''), 'sha256'), 'hex'),
      'status', v_before ->> 'status'
    ) end;
    v_after_summary := case when v_after is null then null else jsonb_build_object(
      'identity_type', v_after ->> 'identity_type',
      'identity_fingerprint', encode(extensions.digest(coalesce(v_after ->> 'normalized_value', ''), 'sha256'), 'hex'),
      'status', v_after ->> 'status'
    ) end;
  else
    v_action := 'CRM_IDENTITY_LINK_' || tg_op;
    v_before_summary := case when v_before is null then null else jsonb_build_object(
      'identity_id', v_before ->> 'identity_id',
      'business_id', v_before ->> 'business_id',
      'source_type', v_before ->> 'source_type',
      'evidence_strength', v_before ->> 'evidence_strength',
      'status', v_before ->> 'status'
    ) end;
    v_after_summary := case when v_after is null then null else jsonb_build_object(
      'identity_id', v_after ->> 'identity_id',
      'business_id', v_after ->> 'business_id',
      'source_type', v_after ->> 'source_type',
      'evidence_strength', v_after ->> 'evidence_strength',
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
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    coalesce(v_actor::text, current_user),
    v_action,
    tg_table_name,
    v_entity_id,
    v_before_summary,
    v_after_summary,
    'dbtx:' || txid_current()::text
  );

  return new;
end;
$crm_audit$;

drop trigger if exists crm_identities_audit_mutation on public.crm_identities;
create trigger crm_identities_audit_mutation
after insert or update on public.crm_identities
for each row execute function public.audit_crm_identity_mutation();

drop trigger if exists crm_identity_links_audit_mutation on public.crm_identity_links;
create trigger crm_identity_links_audit_mutation
after insert or update on public.crm_identity_links
for each row execute function public.audit_crm_identity_mutation();

-- ---------------------------------------------------------------------------
-- RLS and least privilege.
-- ---------------------------------------------------------------------------

alter table public.crm_identities enable row level security;
alter table public.crm_identity_links enable row level security;

drop policy if exists crm_identities_member_read on public.crm_identities;
create policy crm_identities_member_read
on public.crm_identities
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists crm_identity_links_member_read on public.crm_identity_links;
create policy crm_identity_links_member_read
on public.crm_identity_links
for select
to authenticated
using (public.is_org_member(organization_id));

revoke all on public.crm_identities from anon, authenticated, service_role;
revoke all on public.crm_identity_links from anon, authenticated, service_role;

grant select on public.crm_identities to authenticated;
grant select on public.crm_identity_links to authenticated;

grant select, insert, update on public.crm_identities to service_role;
grant select, insert, update on public.crm_identity_links to service_role;

revoke all on function public.record_crm_business_identity(
  uuid, uuid, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_crm_business_identity(
  uuid, uuid, text, text, text, text, text, text, jsonb
) to service_role;

revoke all on function public.audit_crm_identity_mutation()
  from public, anon, authenticated;
