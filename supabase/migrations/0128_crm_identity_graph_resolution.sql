-- 0128: Governed CRM identity graph resolution.
-- Extends the canonical crm_identities / crm_identity_links / crm_people model.
-- No second identity store, fuzzy auto-merge, or display-name-based Person creation.

create or replace function public.list_crm_identity_resolution_candidates(
  p_organization_id uuid,
  p_limit integer
)
returns table (
  identity_id uuid,
  identity_type text,
  display_value text,
  identity_status text,
  business_count integer,
  person_count integer,
  verified_business_links integer,
  observed_business_links integer,
  verified_person_links integer,
  conflict_state text,
  confidence_state text,
  evidence_methods text[]
)
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $crm_identity_candidates$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'CRM identity candidate limit must be between 1 and 100';
  end if;

  if not public.is_org_member(p_organization_id, (select auth.uid())) then
    raise exception 'CRM identity candidate read requires Organization membership';
  end if;

  return query
  with business_evidence as (
    select
      l.organization_id,
      l.identity_id,
      count(distinct l.business_id) filter (where l.status <> 'RETIRED')::integer as business_count,
      count(*) filter (where l.status <> 'RETIRED' and l.evidence_strength = 'VERIFIED')::integer as verified_business_links,
      count(*) filter (where l.status <> 'RETIRED' and l.evidence_strength = 'OBSERVED')::integer as observed_business_links,
      coalesce(bool_or(l.status = 'CONFLICTED'), false) as has_business_conflict
    from public.crm_identity_links l
    where l.organization_id = p_organization_id
    group by l.organization_id, l.identity_id
  ),
  person_evidence as (
    select
      l.organization_id,
      l.identity_id,
      count(distinct l.person_id) filter (where l.status <> 'RETIRED')::integer as person_count,
      count(*) filter (
        where l.status <> 'RETIRED'
          and l.verification_method in ('MANUAL_CONFIRMED','PROVIDER_AUTHENTICATED','IMPORT_VERIFIED')
      )::integer as verified_person_links,
      coalesce(bool_or(l.status = 'CONFLICTED' or p.status <> 'ACTIVE'), false) as has_person_conflict,
      coalesce(
        array_agg(distinct l.verification_method order by l.verification_method)
          filter (where l.status <> 'RETIRED'),
        array[]::text[]
      ) as evidence_methods
    from public.crm_person_identity_links l
    join public.crm_people p
      on p.organization_id = l.organization_id
     and p.id = l.person_id
    where l.organization_id = p_organization_id
    group by l.organization_id, l.identity_id
  )
  select
    i.id,
    i.identity_type,
    i.display_value,
    i.status,
    coalesce(b.business_count, 0),
    coalesce(p.person_count, 0),
    coalesce(b.verified_business_links, 0),
    coalesce(b.observed_business_links, 0),
    coalesce(p.verified_person_links, 0),
    case
      when (
        coalesce(p.person_count, 0) > 1
        or coalesce(p.has_person_conflict, false)
      ) and (
        coalesce(b.business_count, 0) > 1
        or coalesce(b.has_business_conflict, false)
      ) then 'PERSON_AND_BUSINESS_CONFLICT'
      when coalesce(p.person_count, 0) > 1
        or coalesce(p.has_person_conflict, false) then 'PERSON_CONFLICT'
      when coalesce(b.business_count, 0) > 1
        or coalesce(b.has_business_conflict, false) then 'BUSINESS_CONFLICT'
      else 'CONSISTENT'
    end as conflict_state,
    case
      when coalesce(p.verified_person_links, 0) > 0
        or coalesce(b.verified_business_links, 0) > 0 then 'VERIFIED'
      when coalesce(b.observed_business_links, 0) > 0 then 'OBSERVED'
      else 'UNKNOWN'
    end as confidence_state,
    coalesce(p.evidence_methods, array[]::text[])
  from public.crm_identities i
  left join business_evidence b
    on b.organization_id = i.organization_id
   and b.identity_id = i.id
  left join person_evidence p
    on p.organization_id = i.organization_id
   and p.identity_id = i.id
  where i.organization_id = p_organization_id
    and i.status = 'ACTIVE'
    and (
      coalesce(p.person_count, 0) > 1
      or coalesce(p.has_person_conflict, false)
      or coalesce(b.business_count, 0) > 1
      or coalesce(b.has_business_conflict, false)
    )
  order by
    greatest(coalesce(p.person_count, 0), coalesce(b.business_count, 0)) desc,
    i.created_at,
    i.id
  limit p_limit;
end;
$crm_identity_candidates$;

create or replace function public.merge_crm_people_manual(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_source_person_id uuid,
  p_target_person_id uuid,
  p_reason text,
  p_evidence jsonb
)
returns table (
  resolved_person_id uuid,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $crm_people_merge$
declare
  v_actor_role text;
  v_source_status text;
  v_source_merged_into uuid;
  v_target_status text;
begin
  if p_source_person_id = p_target_person_id then
    raise exception 'CRM Person merge requires two distinct People';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) > 500 then
    raise exception 'CRM Person merge reason is required';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or p_evidence = '{}'::jsonb then
    raise exception 'CRM Person merge requires non-empty evidence';
  end if;

  select m.role
    into v_actor_role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = p_actor_user_id;

  if v_actor_role is null
     or v_actor_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'CRM Person merge requires an authorized resolution role';
  end if;

  -- Lock both rows in deterministic UUID order so competing merges cannot deadlock
  -- or create divergent lineage.
  perform 1
  from public.crm_people p
  where p.organization_id = p_organization_id
    and p.id in (p_source_person_id, p_target_person_id)
  order by p.id
  for update;

  select p.status, p.merged_into_person_id
    into v_source_status, v_source_merged_into
  from public.crm_people p
  where p.organization_id = p_organization_id
    and p.id = p_source_person_id;

  select p.status
    into v_target_status
  from public.crm_people p
  where p.organization_id = p_organization_id
    and p.id = p_target_person_id;

  if v_source_status is null or v_target_status is null then
    raise exception 'CRM Person merge requires People in the same Organization';
  end if;

  if v_source_status = 'MERGED' and v_source_merged_into = p_target_person_id then
    return query select p_target_person_id, true;
    return;
  end if;

  if v_source_status <> 'ACTIVE' or v_target_status <> 'ACTIVE' then
    raise exception 'CRM Person merge requires two active People';
  end if;

  if exists (
    select 1
    from public.crm_person_identity_links source_link
    join public.crm_person_identity_links other_link
      on other_link.organization_id = source_link.organization_id
     and other_link.identity_id = source_link.identity_id
     and other_link.person_id not in (p_source_person_id, p_target_person_id)
     and other_link.status <> 'RETIRED'
    join public.crm_people other_person
      on other_person.organization_id = other_link.organization_id
     and other_person.id = other_link.person_id
     and other_person.status = 'ACTIVE'
    where source_link.organization_id = p_organization_id
      and source_link.person_id = p_source_person_id
      and source_link.status <> 'RETIRED'
  ) then
    raise exception 'CRM Person merge has an unresolved third-Person identity conflict';
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
    first_seen_at,
    last_seen_at,
    created_at,
    updated_at
  )
  select
    l.organization_id,
    p_target_person_id,
    l.identity_id,
    l.verification_method,
    l.source_ref,
    l.evidence || jsonb_build_object(
      'manual_merge_from_person_id', p_source_person_id::text,
      'manual_merge_reason', trim(p_reason)
    ) || p_evidence,
    'ACTIVE',
    l.created_by_user_id,
    p_actor_user_id,
    l.first_seen_at,
    now(),
    l.created_at,
    now()
  from public.crm_person_identity_links l
  where l.organization_id = p_organization_id
    and l.person_id = p_source_person_id
    and l.status <> 'RETIRED'
  on conflict (organization_id, person_id, identity_id, verification_method, source_ref)
  do update set
    evidence = public.crm_person_identity_links.evidence || excluded.evidence,
    status = 'ACTIVE',
    updated_by_user_id = excluded.updated_by_user_id,
    last_seen_at = now(),
    updated_at = now();

  update public.crm_person_identity_links
     set status = 'RETIRED',
         updated_by_user_id = p_actor_user_id,
         updated_at = now()
   where organization_id = p_organization_id
     and person_id = p_source_person_id
     and status <> 'RETIRED';

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
    first_seen_at,
    last_seen_at,
    created_at,
    updated_at
  )
  select
    r.organization_id,
    p_target_person_id,
    r.business_id,
    r.relationship_type,
    r.job_title,
    r.verification_method,
    r.source_ref,
    r.evidence || jsonb_build_object(
      'manual_merge_from_person_id', p_source_person_id::text,
      'manual_merge_reason', trim(p_reason)
    ) || p_evidence,
    'ACTIVE',
    r.created_by_user_id,
    p_actor_user_id,
    r.first_seen_at,
    now(),
    r.created_at,
    now()
  from public.crm_person_business_relationships r
  where r.organization_id = p_organization_id
    and r.person_id = p_source_person_id
    and r.status = 'ACTIVE'
  on conflict (organization_id, person_id, business_id, relationship_type, source_ref)
  do update set
    job_title = coalesce(
      public.crm_person_business_relationships.job_title,
      excluded.job_title
    ),
    verification_method = excluded.verification_method,
    evidence = public.crm_person_business_relationships.evidence || excluded.evidence,
    status = 'ACTIVE',
    updated_by_user_id = excluded.updated_by_user_id,
    last_seen_at = now(),
    updated_at = now();

  update public.crm_person_business_relationships
     set status = 'RETIRED',
         updated_by_user_id = p_actor_user_id,
         updated_at = now()
   where organization_id = p_organization_id
     and person_id = p_source_person_id
     and status = 'ACTIVE';

  update public.crm_people target
     set display_name = coalesce(target.display_name, source.display_name),
         last_seen_at = greatest(target.last_seen_at, source.last_seen_at),
         updated_by_user_id = p_actor_user_id,
         updated_at = now()
  from public.crm_people source
  where target.organization_id = p_organization_id
    and target.id = p_target_person_id
    and source.organization_id = p_organization_id
    and source.id = p_source_person_id;

  update public.crm_people
     set status = 'MERGED',
         merged_into_person_id = p_target_person_id,
         updated_by_user_id = p_actor_user_id,
         updated_at = now()
   where organization_id = p_organization_id
     and id = p_source_person_id;

  return query select p_target_person_id, false;
end;
$crm_people_merge$;

create or replace function public.split_crm_person_identity_manual(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_source_person_id uuid,
  p_identity_id uuid,
  p_new_person_id uuid,
  p_display_name text,
  p_reason text,
  p_evidence jsonb
)
returns table (
  resolved_person_id uuid,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $crm_person_split$
declare
  v_actor_role text;
  v_identity_status text;
  v_source_status text;
  v_existing_status text;
  v_existing_created_identity uuid;
  v_split_source_ref text := 'manual-split:' || p_new_person_id::text;
begin
  if p_new_person_id = p_source_person_id then
    raise exception 'CRM Person split requires a distinct new Person id';
  end if;
  if p_display_name is not null
     and (nullif(trim(p_display_name), '') is null or length(trim(p_display_name)) > 200) then
    raise exception 'CRM Person split display name is invalid';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) > 500 then
    raise exception 'CRM Person split reason is required';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or p_evidence = '{}'::jsonb then
    raise exception 'CRM Person split requires non-empty evidence';
  end if;

  select m.role
    into v_actor_role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = p_actor_user_id;

  if v_actor_role is null
     or v_actor_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'CRM Person split requires an authorized resolution role';
  end if;

  -- Match Person creation lock order: canonical identity first.
  select i.status
    into v_identity_status
  from public.crm_identities i
  where i.organization_id = p_organization_id
    and i.id = p_identity_id
  for update;

  if v_identity_status is null or v_identity_status <> 'ACTIVE' then
    raise exception 'CRM Person split requires an active canonical identity';
  end if;

  perform 1
  from public.crm_people p
  where p.organization_id = p_organization_id
    and p.id in (p_source_person_id, p_new_person_id)
  order by p.id
  for update;

  select p.status
    into v_source_status
  from public.crm_people p
  where p.organization_id = p_organization_id
    and p.id = p_source_person_id;

  if v_source_status is null or v_source_status <> 'ACTIVE' then
    raise exception 'CRM Person split requires an active source Person';
  end if;

  select p.status, p.created_from_identity_id
    into v_existing_status, v_existing_created_identity
  from public.crm_people p
  where p.organization_id = p_organization_id
    and p.id = p_new_person_id;

  if v_existing_status is not null then
    if v_existing_status = 'ACTIVE'
       and v_existing_created_identity = p_identity_id
       and exists (
         select 1
         from public.crm_person_identity_links l
         where l.organization_id = p_organization_id
           and l.person_id = p_new_person_id
           and l.identity_id = p_identity_id
           and l.verification_method = 'MANUAL_CONFIRMED'
           and l.source_ref = v_split_source_ref
           and l.status = 'ACTIVE'
       ) then
      return query select p_new_person_id, true;
      return;
    end if;
    raise exception 'CRM Person split new Person id is already in use';
  end if;

  if not exists (
    select 1
    from public.crm_person_identity_links l
    where l.organization_id = p_organization_id
      and l.person_id = p_source_person_id
      and l.identity_id = p_identity_id
      and l.status = 'ACTIVE'
  ) then
    raise exception 'CRM Person split identity is not actively linked to the source Person';
  end if;

  if exists (
    select 1
    from public.crm_person_identity_links l
    join public.crm_people p
      on p.organization_id = l.organization_id
     and p.id = l.person_id
    where l.organization_id = p_organization_id
      and l.identity_id = p_identity_id
      and l.person_id <> p_source_person_id
      and l.status <> 'RETIRED'
      and p.status = 'ACTIVE'
  ) then
    raise exception 'CRM Person split identity already has another active Person conflict';
  end if;

  insert into public.crm_people(
    id,
    organization_id,
    created_from_identity_id,
    display_name,
    status,
    created_by_user_id,
    updated_by_user_id
  ) values (
    p_new_person_id,
    p_organization_id,
    p_identity_id,
    nullif(trim(p_display_name), ''),
    'ACTIVE',
    p_actor_user_id,
    p_actor_user_id
  );

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
    first_seen_at,
    last_seen_at,
    created_at,
    updated_at
  )
  select
    l.organization_id,
    p_new_person_id,
    l.identity_id,
    l.verification_method,
    l.source_ref,
    l.evidence || jsonb_build_object(
      'manual_split_from_person_id', p_source_person_id::text,
      'manual_split_reason', trim(p_reason)
    ) || p_evidence,
    'ACTIVE',
    l.created_by_user_id,
    p_actor_user_id,
    l.first_seen_at,
    now(),
    l.created_at,
    now()
  from public.crm_person_identity_links l
  where l.organization_id = p_organization_id
    and l.person_id = p_source_person_id
    and l.identity_id = p_identity_id
    and l.status <> 'RETIRED'
  on conflict (organization_id, person_id, identity_id, verification_method, source_ref)
  do update set
    evidence = public.crm_person_identity_links.evidence || excluded.evidence,
    status = 'ACTIVE',
    updated_by_user_id = excluded.updated_by_user_id,
    last_seen_at = now(),
    updated_at = now();

  insert into public.crm_person_identity_links(
    organization_id,
    person_id,
    identity_id,
    verification_method,
    source_ref,
    evidence,
    status,
    created_by_user_id,
    updated_by_user_id
  ) values (
    p_organization_id,
    p_new_person_id,
    p_identity_id,
    'MANUAL_CONFIRMED',
    v_split_source_ref,
    p_evidence || jsonb_build_object(
      'manual_split_from_person_id', p_source_person_id::text,
      'manual_split_reason', trim(p_reason)
    ),
    'ACTIVE',
    p_actor_user_id,
    p_actor_user_id
  )
  on conflict (organization_id, person_id, identity_id, verification_method, source_ref)
  do update set
    evidence = public.crm_person_identity_links.evidence || excluded.evidence,
    status = 'ACTIVE',
    updated_by_user_id = excluded.updated_by_user_id,
    last_seen_at = now(),
    updated_at = now();

  update public.crm_person_identity_links
     set status = 'RETIRED',
         updated_by_user_id = p_actor_user_id,
         updated_at = now()
   where organization_id = p_organization_id
     and person_id = p_source_person_id
     and identity_id = p_identity_id
     and status <> 'RETIRED';

  return query select p_new_person_id, false;
end;
$crm_person_split$;

revoke all on function public.list_crm_identity_resolution_candidates(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_crm_identity_resolution_candidates(uuid, integer)
  to authenticated;

revoke all on function public.merge_crm_people_manual(uuid, uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.merge_crm_people_manual(uuid, uuid, uuid, uuid, text, jsonb)
  to service_role;

revoke all on function public.split_crm_person_identity_manual(uuid, uuid, uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.split_crm_person_identity_manual(uuid, uuid, uuid, uuid, uuid, text, text, jsonb)
  to service_role;

comment on function public.list_crm_identity_resolution_candidates(uuid, integer) is
  'Bounded RLS-governed identity conflict/candidate read model derived from canonical CRM identity evidence.';
comment on function public.merge_crm_people_manual(uuid, uuid, uuid, uuid, text, jsonb) is
  'Service-only manual Person merge over canonical identity and account relationship evidence; state-idempotent and audit-triggered.';
comment on function public.split_crm_person_identity_manual(uuid, uuid, uuid, uuid, uuid, text, text, jsonb) is
  'Service-only manual Person identity split using a caller-stable new Person UUID for deterministic retry semantics.';
