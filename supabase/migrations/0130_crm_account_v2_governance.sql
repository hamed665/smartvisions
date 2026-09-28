-- 0130: CRM Account v2 governance over the existing canonical public.businesses authority.
--
-- public.businesses remains the external/prospect/customer Company/Account truth.
-- tenant_businesses / branches remain the tenant's own operating hierarchy and are
-- intentionally not reused as customer Accounts.
--
-- This migration adds only governed CRM Account context: external hierarchy,
-- account ownership and B2B lifecycle. Existing 19 Production Businesses are not
-- reclassified, linked or assigned by migration; they remain UNCLASSIFIED until
-- evidence-backed operator action exists.

alter table public.businesses
  add column if not exists parent_business_id uuid,
  add column if not exists hierarchy_relation text,
  add column if not exists hierarchy_source_ref text,
  add column if not exists hierarchy_evidence jsonb,
  add column if not exists hierarchy_linked_by_user_id uuid,
  add column if not exists hierarchy_linked_at timestamptz,
  add column if not exists account_owner_user_id uuid,
  add column if not exists account_owner_updated_by_user_id uuid,
  add column if not exists account_owner_updated_at timestamptz,
  add column if not exists account_lifecycle text not null default 'UNCLASSIFIED',
  add column if not exists account_lifecycle_source_ref text,
  add column if not exists account_lifecycle_evidence jsonb,
  add column if not exists account_lifecycle_updated_by_user_id uuid,
  add column if not exists account_lifecycle_updated_at timestamptz;

do $crm_account_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_crm_account_parent_fk'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_crm_account_parent_fk
      foreign key (organization_id, parent_business_id)
      references public.businesses(organization_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_crm_account_owner_fk'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_crm_account_owner_fk
      foreign key (organization_id, account_owner_user_id)
      references public.organization_members(organization_id, user_id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_crm_account_hierarchy_actor_fk'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_crm_account_hierarchy_actor_fk
      foreign key (hierarchy_linked_by_user_id)
      references auth.users(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_crm_account_owner_actor_fk'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_crm_account_owner_actor_fk
      foreign key (account_owner_updated_by_user_id)
      references auth.users(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_crm_account_lifecycle_actor_fk'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_crm_account_lifecycle_actor_fk
      foreign key (account_lifecycle_updated_by_user_id)
      references auth.users(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_crm_account_hierarchy_contract_check'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_crm_account_hierarchy_contract_check
      check (
        (
          parent_business_id is null
          and hierarchy_relation is null
          and hierarchy_source_ref is null
          and hierarchy_evidence is null
          and hierarchy_linked_by_user_id is null
          and hierarchy_linked_at is null
        )
        or
        (
          parent_business_id is not null
          and parent_business_id <> id
          and hierarchy_relation in ('BRANCH_OF','SUBSIDIARY_OF','DIVISION_OF')
          and nullif(trim(hierarchy_source_ref), '') is not null
          and length(trim(hierarchy_source_ref)) <= 512
          and hierarchy_evidence is not null
          and jsonb_typeof(hierarchy_evidence) = 'object'
          and hierarchy_evidence <> '{}'::jsonb
          and octet_length(hierarchy_evidence::text) <= 8192
          and hierarchy_linked_by_user_id is not null
          and hierarchy_linked_at is not null
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_crm_account_lifecycle_check'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_crm_account_lifecycle_check
      check (
        account_lifecycle in (
          'UNCLASSIFIED','PROSPECT','QUALIFIED','CUSTOMER',
          'FORMER_CUSTOMER','PARTNER','ARCHIVED'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'businesses_crm_account_lifecycle_evidence_check'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_crm_account_lifecycle_evidence_check
      check (
        (
          account_lifecycle = 'UNCLASSIFIED'
          and account_lifecycle_source_ref is null
          and account_lifecycle_evidence is null
          and account_lifecycle_updated_by_user_id is null
          and account_lifecycle_updated_at is null
        )
        or
        (
          account_lifecycle <> 'UNCLASSIFIED'
          and nullif(trim(account_lifecycle_source_ref), '') is not null
          and length(trim(account_lifecycle_source_ref)) <= 512
          and account_lifecycle_evidence is not null
          and jsonb_typeof(account_lifecycle_evidence) = 'object'
          and account_lifecycle_evidence <> '{}'::jsonb
          and octet_length(account_lifecycle_evidence::text) <= 8192
          and account_lifecycle_updated_by_user_id is not null
          and account_lifecycle_updated_at is not null
        )
      );
  end if;
end;
$crm_account_constraints$;

create index if not exists businesses_org_parent_account_idx
  on public.businesses(organization_id, parent_business_id, updated_at desc)
  where parent_business_id is not null;

create index if not exists businesses_org_account_owner_idx
  on public.businesses(organization_id, account_owner_user_id, updated_at desc)
  where account_owner_user_id is not null;

create index if not exists businesses_org_account_lifecycle_idx
  on public.businesses(organization_id, account_lifecycle, updated_at desc, id);

create index if not exists businesses_hierarchy_actor_fk_idx
  on public.businesses(hierarchy_linked_by_user_id)
  where hierarchy_linked_by_user_id is not null;

create index if not exists businesses_account_owner_actor_fk_idx
  on public.businesses(account_owner_updated_by_user_id)
  where account_owner_updated_by_user_id is not null;

create index if not exists businesses_account_lifecycle_actor_fk_idx
  on public.businesses(account_lifecycle_updated_by_user_id)
  where account_lifecycle_updated_by_user_id is not null;

-- New CRM Account columns are readable through the existing Business RLS boundary.
-- Direct browser mutation of the governed columns is blocked by the trigger below.
grant select (
  parent_business_id, hierarchy_relation, hierarchy_source_ref,
  hierarchy_linked_by_user_id, hierarchy_linked_at,
  account_owner_user_id, account_owner_updated_by_user_id, account_owner_updated_at,
  account_lifecycle, account_lifecycle_source_ref,
  account_lifecycle_updated_by_user_id, account_lifecycle_updated_at
) on public.businesses to authenticated;

grant select (
  id, organization_id, parent_business_id, hierarchy_relation,
  account_owner_user_id, account_lifecycle, updated_at
) on public.businesses to service_role;

grant update (
  parent_business_id, hierarchy_relation, hierarchy_source_ref, hierarchy_evidence,
  hierarchy_linked_by_user_id, hierarchy_linked_at,
  account_owner_user_id, account_owner_updated_by_user_id, account_owner_updated_at,
  account_lifecycle, account_lifecycle_source_ref, account_lifecycle_evidence,
  account_lifecycle_updated_by_user_id, account_lifecycle_updated_at, updated_at
) on public.businesses to service_role;

create or replace function public.guard_crm_account_governance()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $crm_account_guard$
begin
  if tg_op = 'INSERT' then
    if current_user <> 'service_role'
       and (
         new.parent_business_id is not null
         or new.hierarchy_relation is not null
         or new.hierarchy_source_ref is not null
         or new.hierarchy_evidence is not null
         or new.hierarchy_linked_by_user_id is not null
         or new.hierarchy_linked_at is not null
         or new.account_owner_user_id is not null
         or new.account_owner_updated_by_user_id is not null
         or new.account_owner_updated_at is not null
         or new.account_lifecycle <> 'UNCLASSIFIED'
         or new.account_lifecycle_source_ref is not null
         or new.account_lifecycle_evidence is not null
         or new.account_lifecycle_updated_by_user_id is not null
         or new.account_lifecycle_updated_at is not null
       ) then
      raise exception 'CRM Account governance requires the trusted server boundary';
    end if;
    return new;
  end if;

  if current_user <> 'service_role'
     and (
       new.parent_business_id is distinct from old.parent_business_id
       or new.hierarchy_relation is distinct from old.hierarchy_relation
       or new.hierarchy_source_ref is distinct from old.hierarchy_source_ref
       or new.hierarchy_evidence is distinct from old.hierarchy_evidence
       or new.hierarchy_linked_by_user_id is distinct from old.hierarchy_linked_by_user_id
       or new.hierarchy_linked_at is distinct from old.hierarchy_linked_at
       or new.account_owner_user_id is distinct from old.account_owner_user_id
       or new.account_owner_updated_by_user_id is distinct from old.account_owner_updated_by_user_id
       or new.account_owner_updated_at is distinct from old.account_owner_updated_at
       or new.account_lifecycle is distinct from old.account_lifecycle
       or new.account_lifecycle_source_ref is distinct from old.account_lifecycle_source_ref
       or new.account_lifecycle_evidence is distinct from old.account_lifecycle_evidence
       or new.account_lifecycle_updated_by_user_id is distinct from old.account_lifecycle_updated_by_user_id
       or new.account_lifecycle_updated_at is distinct from old.account_lifecycle_updated_at
     ) then
    raise exception 'CRM Account governance requires the trusted server boundary';
  end if;

  return new;
end;
$crm_account_guard$;

drop trigger if exists businesses_crm_account_governance_guard on public.businesses;
create trigger businesses_crm_account_governance_guard
before insert or update on public.businesses
for each row execute function public.guard_crm_account_governance();

create or replace function public.set_crm_account_owner_manual(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_business_id uuid,
  p_owner_user_id uuid,
  p_reason text,
  p_evidence jsonb
)
returns table (
  resolved_business_id uuid,
  resolved_owner_user_id uuid,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $crm_account_owner$
declare
  v_actor_role text;
  v_owner_role text;
  v_current_owner uuid;
begin
  if current_user <> 'service_role' then
    raise exception 'CRM Account owner mutation requires the trusted server boundary';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) > 500 then
    raise exception 'CRM Account owner mutation reason is required';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or p_evidence = '{}'::jsonb then
    raise exception 'CRM Account owner mutation requires non-empty evidence';
  end if;
  if octet_length(p_evidence::text) > 8192 then
    raise exception 'CRM Account owner evidence exceeds the bounded limit';
  end if;

  select role into v_actor_role
  from public.organization_members
  where organization_id = p_organization_id and user_id = p_actor_user_id;

  if v_actor_role is null or v_actor_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'CRM Account owner mutation requires an authorized CRM role';
  end if;

  if p_owner_user_id is not null then
    select role into v_owner_role
    from public.organization_members
    where organization_id = p_organization_id and user_id = p_owner_user_id;

    if v_owner_role is null or v_owner_role not in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT') then
      raise exception 'CRM Account owner must be an assignable Organization member';
    end if;
  end if;

  select account_owner_user_id
    into v_current_owner
  from public.businesses
  where organization_id = p_organization_id
    and id = p_business_id
  for update;

  if not found then
    raise exception 'CRM Account was not found in the Organization';
  end if;

  if v_current_owner is not distinct from p_owner_user_id then
    return query select p_business_id, p_owner_user_id, true;
    return;
  end if;

  update public.businesses
     set account_owner_user_id = p_owner_user_id,
         account_owner_updated_by_user_id = p_actor_user_id,
         account_owner_updated_at = now(),
         updated_at = now()
   where organization_id = p_organization_id
     and id = p_business_id;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data, correlation_id
  ) values (
    p_organization_id,
    'USER',
    p_actor_user_id::text,
    'CRM_ACCOUNT_OWNER_CHANGED',
    'businesses',
    p_business_id::text,
    jsonb_build_object('owner_user_id', v_current_owner),
    jsonb_build_object(
      'owner_user_id', p_owner_user_id,
      'reason_present', true,
      'evidence_present', true
    ),
    'dbtx:' || txid_current()::text
  );

  return query select p_business_id, p_owner_user_id, false;
end;
$crm_account_owner$;

create or replace function public.set_crm_account_lifecycle_manual(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_business_id uuid,
  p_lifecycle text,
  p_reason text,
  p_evidence jsonb
)
returns table (
  resolved_business_id uuid,
  resolved_lifecycle text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $crm_account_lifecycle$
declare
  v_actor_role text;
  v_current_lifecycle text;
  v_lifecycle text := upper(trim(coalesce(p_lifecycle, '')));
begin
  if current_user <> 'service_role' then
    raise exception 'CRM Account lifecycle mutation requires the trusted server boundary';
  end if;
  if v_lifecycle not in (
    'UNCLASSIFIED','PROSPECT','QUALIFIED','CUSTOMER',
    'FORMER_CUSTOMER','PARTNER','ARCHIVED'
  ) then
    raise exception 'CRM Account lifecycle is invalid';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) > 500 then
    raise exception 'CRM Account lifecycle mutation reason is required';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or p_evidence = '{}'::jsonb then
    raise exception 'CRM Account lifecycle mutation requires non-empty evidence';
  end if;
  if octet_length(p_evidence::text) > 8192 then
    raise exception 'CRM Account lifecycle evidence exceeds the bounded limit';
  end if;

  select role into v_actor_role
  from public.organization_members
  where organization_id = p_organization_id and user_id = p_actor_user_id;

  if v_actor_role is null or v_actor_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'CRM Account lifecycle mutation requires an authorized CRM role';
  end if;

  select account_lifecycle
    into v_current_lifecycle
  from public.businesses
  where organization_id = p_organization_id
    and id = p_business_id
  for update;

  if not found then
    raise exception 'CRM Account was not found in the Organization';
  end if;

  if v_current_lifecycle = v_lifecycle then
    return query select p_business_id, v_lifecycle, true;
    return;
  end if;

  update public.businesses
     set account_lifecycle = v_lifecycle,
         account_lifecycle_source_ref = case
           when v_lifecycle = 'UNCLASSIFIED' then null
           else 'manual-lifecycle:' || p_business_id::text
         end,
         account_lifecycle_evidence = case
           when v_lifecycle = 'UNCLASSIFIED' then null
           else p_evidence
         end,
         account_lifecycle_updated_by_user_id = case
           when v_lifecycle = 'UNCLASSIFIED' then null
           else p_actor_user_id
         end,
         account_lifecycle_updated_at = case
           when v_lifecycle = 'UNCLASSIFIED' then null
           else now()
         end,
         updated_at = now()
   where organization_id = p_organization_id
     and id = p_business_id;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data, correlation_id
  ) values (
    p_organization_id,
    'USER',
    p_actor_user_id::text,
    'CRM_ACCOUNT_LIFECYCLE_CHANGED',
    'businesses',
    p_business_id::text,
    jsonb_build_object('lifecycle', v_current_lifecycle),
    jsonb_build_object(
      'lifecycle', v_lifecycle,
      'reason_present', true,
      'evidence_present', true
    ),
    'dbtx:' || txid_current()::text
  );

  return query select p_business_id, v_lifecycle, false;
end;
$crm_account_lifecycle$;

create or replace function public.set_crm_account_parent_manual(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_business_id uuid,
  p_parent_business_id uuid,
  p_relation text,
  p_reason text,
  p_evidence jsonb
)
returns table (
  resolved_business_id uuid,
  resolved_parent_business_id uuid,
  resolved_relation text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $crm_account_parent$
declare
  v_actor_role text;
  v_current_parent uuid;
  v_current_relation text;
  v_relation text := upper(trim(coalesce(p_relation, '')));
begin
  if current_user <> 'service_role' then
    raise exception 'CRM Account hierarchy mutation requires the trusted server boundary';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) > 500 then
    raise exception 'CRM Account hierarchy mutation reason is required';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or p_evidence = '{}'::jsonb then
    raise exception 'CRM Account hierarchy mutation requires non-empty evidence';
  end if;
  if octet_length(p_evidence::text) > 8192 then
    raise exception 'CRM Account hierarchy evidence exceeds the bounded limit';
  end if;

  select role into v_actor_role
  from public.organization_members
  where organization_id = p_organization_id and user_id = p_actor_user_id;

  if v_actor_role is null or v_actor_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'CRM Account hierarchy mutation requires an authorized CRM role';
  end if;

  select parent_business_id, hierarchy_relation
    into v_current_parent, v_current_relation
  from public.businesses
  where organization_id = p_organization_id
    and id = p_business_id
  for update;

  if not found then
    raise exception 'CRM Account was not found in the Organization';
  end if;

  if p_parent_business_id is null then
    v_relation := null;
  else
    if p_parent_business_id = p_business_id then
      raise exception 'CRM Account hierarchy cannot parent an Account to itself';
    end if;
    if v_relation not in ('BRANCH_OF','SUBSIDIARY_OF','DIVISION_OF') then
      raise exception 'CRM Account hierarchy relation is invalid';
    end if;

    perform 1
    from public.businesses
    where organization_id = p_organization_id
      and id = p_parent_business_id
    for update;

    if not found then
      raise exception 'CRM Account parent was not found in the Organization';
    end if;

    if exists (
      with recursive ancestors as (
        select b.id, b.parent_business_id
        from public.businesses b
        where b.organization_id = p_organization_id
          and b.id = p_parent_business_id
        union all
        select b.id, b.parent_business_id
        from public.businesses b
        join ancestors a on a.parent_business_id = b.id
        where b.organization_id = p_organization_id
      )
      select 1 from ancestors where id = p_business_id
    ) then
      raise exception 'CRM Account hierarchy would create a cycle';
    end if;
  end if;

  if v_current_parent is not distinct from p_parent_business_id
     and v_current_relation is not distinct from v_relation then
    return query select p_business_id, p_parent_business_id, v_relation, true;
    return;
  end if;

  update public.businesses
     set parent_business_id = p_parent_business_id,
         hierarchy_relation = v_relation,
         hierarchy_source_ref = case
           when p_parent_business_id is null then null
           else 'manual-hierarchy:' || p_business_id::text
         end,
         hierarchy_evidence = case
           when p_parent_business_id is null then null
           else p_evidence
         end,
         hierarchy_linked_by_user_id = case
           when p_parent_business_id is null then null
           else p_actor_user_id
         end,
         hierarchy_linked_at = case
           when p_parent_business_id is null then null
           else now()
         end,
         updated_at = now()
   where organization_id = p_organization_id
     and id = p_business_id;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data, correlation_id
  ) values (
    p_organization_id,
    'USER',
    p_actor_user_id::text,
    'CRM_ACCOUNT_HIERARCHY_CHANGED',
    'businesses',
    p_business_id::text,
    jsonb_build_object(
      'parent_business_id', v_current_parent,
      'relation', v_current_relation
    ),
    jsonb_build_object(
      'parent_business_id', p_parent_business_id,
      'relation', v_relation,
      'reason_present', true,
      'evidence_present', true
    ),
    'dbtx:' || txid_current()::text
  );

  return query select p_business_id, p_parent_business_id, v_relation, false;
end;
$crm_account_parent$;

create or replace function public.get_crm_account_v2(
  p_organization_id uuid,
  p_business_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $crm_account_read$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_result jsonb;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'CRM Account read requires Organization membership';
  end if;

  if not exists (
    select 1 from public.businesses
    where organization_id = p_organization_id
      and id = p_business_id
  ) then
    raise exception 'CRM Account was not found in the Organization';
  end if;

  select jsonb_build_object(
    'account', (
      select jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'countryCode', b.country_code,
        -- These enrichment columns exist in current Production but are not part of
        -- the oldest supported Business bootstrap. Read them opportunistically
        -- from the row JSON so Account v2 remains backward-compatible.
        'city', to_jsonb(b) ->> 'city',
        'category', to_jsonb(b) ->> 'category',
        'officialWebsite', to_jsonb(b) ->> 'official_website',
        'formattedAddress', to_jsonb(b) ->> 'formatted_address',
        'lifecycle', b.account_lifecycle,
        'ownerUserId', b.account_owner_user_id,
        'parentBusinessId', b.parent_business_id,
        'hierarchyRelation', b.hierarchy_relation,
        'updatedAt', b.updated_at
      )
      from public.businesses b
      where b.organization_id = p_organization_id
        and b.id = p_business_id
    ),
    'owner', (
      select case when m.user_id is null then null else jsonb_build_object(
        'userId', m.user_id,
        'role', m.role
      ) end
      from public.businesses b
      left join public.organization_members m
        on m.organization_id = b.organization_id
       and m.user_id = b.account_owner_user_id
      where b.organization_id = p_organization_id
        and b.id = p_business_id
    ),
    'parent', (
      select case when p.id is null then null else jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'lifecycle', p.account_lifecycle
      ) end
      from public.businesses b
      left join public.businesses p
        on p.organization_id = b.organization_id
       and p.id = b.parent_business_id
      where b.organization_id = p_organization_id
        and b.id = p_business_id
    ),
    'children', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.updated_at desc, rows.id)
      from (
        select
          b.id,
          b.name,
          b.hierarchy_relation as "hierarchyRelation",
          b.account_lifecycle as lifecycle,
          b.updated_at
        from public.businesses b
        where b.organization_id = p_organization_id
          and b.parent_business_id = p_business_id
        order by b.updated_at desc, b.id
        limit v_limit
      ) rows
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.last_seen_at desc, rows.id)
      from (
        select
          r.id,
          r.person_id as "personId",
          p.display_name as "displayName",
          p.status as "personStatus",
          r.relationship_type as "relationshipType",
          r.job_title as "jobTitle",
          r.verification_method as "verificationMethod",
          r.last_seen_at
        from public.crm_person_business_relationships r
        join public.crm_people p
          on p.organization_id = r.organization_id
         and p.id = r.person_id
        where r.organization_id = p_organization_id
          and r.business_id = p_business_id
          and r.status = 'ACTIVE'
        order by r.last_seen_at desc, r.id
        limit v_limit
      ) rows
    ), '[]'::jsonb),
    'leads', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.updated_at desc, rows.id)
      from (
        select
          l.id, l.status, l.opportunity_score as "opportunityScore",
          l.intent_score as "intentScore", l.person_id as "personId", l.updated_at
        from public.leads l
        where l.organization_id = p_organization_id
          and l.business_id = p_business_id
        order by l.updated_at desc, l.id
        limit v_limit
      ) rows
    ), '[]'::jsonb),
    'deals', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.updated_at desc, rows.id)
      from (
        select
          d.id, d.title, d.state, d.amount, d.currency,
          d.owner_user_id as "ownerUserId",
          d.person_id as "personId",
          d.updated_at
        from public.crm_deals d
        where d.organization_id = p_organization_id
          and d.business_id = p_business_id
        order by d.updated_at desc, d.id
        limit v_limit
      ) rows
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.updated_at desc, rows.id)
      from (
        select
          t.id, t.title, t.status, t.priority,
          t.assignee_user_id as "assigneeUserId",
          t.person_id as "personId",
          t.due_at as "dueAt",
          t.updated_at
        from public.crm_tasks t
        where t.organization_id = p_organization_id
          and t.business_id = p_business_id
        order by t.updated_at desc, t.id
        limit v_limit
      ) rows
    ), '[]'::jsonb),
    'moduleStatus', jsonb_build_object(
      'companyAccount', 'IMPLEMENTED',
      'contacts', 'IMPLEMENTED',
      'accountHierarchy', 'IMPLEMENTED',
      'ownership', 'IMPLEMENTED',
      'branchBusinessRelationship', 'IMPLEMENTED_AS_EXTERNAL_ACCOUNT_HIERARCHY',
      'b2bLifecycle', 'IMPLEMENTED'
    )
  )
  into v_result;

  return v_result;
end;
$crm_account_read$;

revoke all on function public.guard_crm_account_governance()
  from public, anon, authenticated, service_role;

revoke all on function public.set_crm_account_owner_manual(uuid, uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.set_crm_account_owner_manual(uuid, uuid, uuid, uuid, text, jsonb)
  to service_role;

revoke all on function public.set_crm_account_lifecycle_manual(uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.set_crm_account_lifecycle_manual(uuid, uuid, uuid, text, text, jsonb)
  to service_role;

revoke all on function public.set_crm_account_parent_manual(uuid, uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.set_crm_account_parent_manual(uuid, uuid, uuid, uuid, text, text, jsonb)
  to service_role;

revoke all on function public.get_crm_account_v2(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_crm_account_v2(uuid, uuid, integer)
  to authenticated;

comment on column public.businesses.account_lifecycle is
  'Governed CRM Account lifecycle. Existing rows default to UNCLASSIFIED; migration never infers customer state.';
comment on column public.businesses.parent_business_id is
  'External Account hierarchy only. Do not confuse with tenant_businesses/branches, which model the tenant operating hierarchy.';
comment on function public.get_crm_account_v2(uuid, uuid, integer) is
  'RLS-governed CRM Account read over canonical businesses, Person relationships, Leads, Deals and Tasks.';
