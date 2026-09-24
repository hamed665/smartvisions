-- 0089: governed Chatwoot Team projection + server reconciliation receipts.

create table if not exists public.chatwoot_team_reconciliation_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  team_mapping_id uuid not null,
  mapping_version integer not null check (mapping_version >= 1),
  smart_team_id uuid not null,
  chatwoot_account_mapping_id uuid not null,
  observed_chatwoot_team_id bigint not null check (observed_chatwoot_team_id > 0),
  observed_name text not null check (length(trim(observed_name)) between 1 and 255),
  observed_description text not null check (length(observed_description) between 1 and 500),
  request_key text not null check (length(trim(request_key)) between 1 and 200),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),

  unique (organization_id, request_key),

  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict,
  foreign key (organization_id, team_mapping_id)
    references public.chatwoot_team_mappings(organization_id, id)
    on delete restrict,
  foreign key (organization_id, chatwoot_account_mapping_id)
    references public.chatwoot_account_mappings(organization_id, id)
    on delete restrict,
  foreign key (smart_team_id)
    references public.teams(id)
    on delete restrict,
  check (expires_at > observed_at)
);

create index if not exists chatwoot_team_reconciliation_receipts_mapping_idx
  on public.chatwoot_team_reconciliation_receipts(
    organization_id, team_mapping_id, mapping_version, observed_at desc
  );

alter table public.chatwoot_team_reconciliation_receipts enable row level security;

create or replace function public.enforce_chatwoot_team_receipt_immutable()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Chatwoot Team reconciliation receipts are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists chatwoot_team_receipts_immutable
  on public.chatwoot_team_reconciliation_receipts;
create trigger chatwoot_team_receipts_immutable
before insert or update or delete
on public.chatwoot_team_reconciliation_receipts
for each row execute function public.enforce_chatwoot_team_receipt_immutable();

drop policy if exists chatwoot_team_mappings_governed_read
  on public.chatwoot_team_mappings;
create policy chatwoot_team_mappings_governed_read
  on public.chatwoot_team_mappings
  for select
  to authenticated
  using (
    coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') = '1'
    and public.chatwoot_bridge_can_manage(organization_id)
  );

drop policy if exists chatwoot_team_mappings_governed_insert
  on public.chatwoot_team_mappings;
create policy chatwoot_team_mappings_governed_insert
  on public.chatwoot_team_mappings
  for insert
  to authenticated
  with check (
    coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') = '1'
    and public.chatwoot_bridge_can_manage(organization_id)
  );

drop policy if exists chatwoot_team_mappings_governed_update
  on public.chatwoot_team_mappings;
create policy chatwoot_team_mappings_governed_update
  on public.chatwoot_team_mappings
  for update
  to authenticated
  using (
    coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') = '1'
    and public.chatwoot_bridge_can_manage(organization_id)
  )
  with check (
    coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') = '1'
    and public.chatwoot_bridge_can_manage(organization_id)
  );

drop trigger if exists chatwoot_team_mappings_00_command_guard
  on public.chatwoot_team_mappings;
create trigger chatwoot_team_mappings_00_command_guard
before insert or update or delete
on public.chatwoot_team_mappings
for each row execute function public.enforce_chatwoot_bridge_command_path();

create or replace function public.create_chatwoot_team_mapping(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_smart_team_id uuid,
  p_chatwoot_account_mapping_id uuid,
  p_request_key text
)
returns public.chatwoot_team_mappings
language plpgsql
security invoker
set search_path = public, auth, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_team_name text;
  v_projected_name text;
  v_payload_hash text;
  v_claim record;
  v_existing public.chatwoot_team_mappings%rowtype;
  v_created public.chatwoot_team_mappings%rowtype;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot Team mapping mutation not permitted';
  end if;

  if length(v_request_key) not between 1 and 200 then
    raise exception 'request key must contain 1..200 characters';
  end if;

  select regexp_replace(regexp_replace(trim(t.name), '[[:cntrl:]]', '', 'g'), '[[:space:]]+', ' ', 'g')
    into v_team_name
    from public.teams t
    join public.departments d
      on d.organization_id = t.organization_id
     and d.id = t.department_id
    join public.branches br
      on br.organization_id = d.organization_id
     and br.id = d.branch_id
    join public.tenant_businesses b
      on b.organization_id = br.organization_id
     and b.id = br.tenant_business_id
   where t.organization_id = p_organization_id
     and t.id = p_smart_team_id
     and br.tenant_business_id = p_tenant_business_id
     and t.status = 'ACTIVE'
     and d.status = 'ACTIVE'
     and br.status = 'ACTIVE'
     and b.status = 'ACTIVE';

  if not found or length(v_team_name) < 1 then
    raise exception 'ACTIVE Smart Team lineage required for Chatwoot projection';
  end if;

  if not exists (
    select 1
      from public.chatwoot_account_mappings a
     where a.organization_id = p_organization_id
       and a.id = p_chatwoot_account_mapping_id
       and a.tenant_business_id = p_tenant_business_id
       and a.status = 'ACTIVE'
  ) then
    raise exception 'ACTIVE Chatwoot Account mapping required for Team projection';
  end if;

  v_projected_name :=
    lower(left(v_team_name, 220)) ||
    ' [' || substr(replace(p_smart_team_id::text, '-', ''), 1, 8) || ']';

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'smartTeamId', p_smart_team_id,
    'chatwootAccountMappingId', p_chatwoot_account_mapping_id,
    'projectedName', v_projected_name
  )::text, 'sha256'), 'hex');

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'CREATE_TEAM_MAPPING',
      'CHATWOOT_TEAM_MAPPING',
      null,
      1,
      v_payload_hash
    );

  if not v_claim.is_new then
    select *
      into v_existing
      from public.chatwoot_team_mappings
     where organization_id = p_organization_id
       and id = v_claim.entity_id;

    if not found then
      raise exception 'Chatwoot Team create claim has no mapping row';
    end if;

    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_existing;
  end if;

  insert into public.chatwoot_team_mappings(
    id,
    organization_id,
    tenant_business_id,
    smart_team_id,
    chatwoot_account_mapping_id,
    projected_name,
    status,
    version,
    last_request_key,
    created_by_user_id,
    updated_by_user_id
  ) values (
    v_claim.entity_id,
    p_organization_id,
    p_tenant_business_id,
    p_smart_team_id,
    p_chatwoot_account_mapping_id,
    v_projected_name,
    'PROVISIONING',
    1,
    v_request_key,
    v_actor,
    v_actor
  )
  returning * into v_created;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_created;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

create or replace function public.record_chatwoot_team_reconciliation(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_team_mapping_id uuid,
  p_expected_mapping_version integer,
  p_observed_chatwoot_team_id bigint,
  p_observed_name text,
  p_observed_description text,
  p_request_key text
)
returns public.chatwoot_team_reconciliation_receipts
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
declare
  v_name text := lower(trim(coalesce(p_observed_name, '')));
  v_description text := trim(coalesce(p_observed_description, ''));
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_mapping public.chatwoot_team_mappings%rowtype;
  v_expected_description text;
  v_payload_hash text;
  v_existing public.chatwoot_team_reconciliation_receipts%rowtype;
  v_created public.chatwoot_team_reconciliation_receipts%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if p_expected_mapping_version is null
     or p_expected_mapping_version < 1
     or p_observed_chatwoot_team_id is null
     or p_observed_chatwoot_team_id <= 0
     or length(v_name) not between 1 and 255
     or length(v_description) not between 1 and 500
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Chatwoot Team reconciliation payload';
  end if;

  select *
    into v_mapping
    from public.chatwoot_team_mappings
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_team_mapping_id;

  if not found
     or v_mapping.version <> p_expected_mapping_version
     or v_mapping.status = 'ARCHIVED'
  then
    raise exception 'Chatwoot Team mapping version/state changed before receipt';
  end if;

  if not exists (
    select 1
      from public.chatwoot_account_mappings a
     where a.organization_id = p_organization_id
       and a.id = v_mapping.chatwoot_account_mapping_id
       and a.tenant_business_id = p_tenant_business_id
       and a.status = 'ACTIVE'
  ) then
    raise exception 'ACTIVE Chatwoot Account mapping required for Team receipt';
  end if;

  v_expected_description :=
    'smartvisions:team:' || v_mapping.smart_team_id::text ||
    ';business:' || p_tenant_business_id::text ||
    ';v=1';

  if v_name <> lower(trim(v_mapping.projected_name))
     or v_description <> v_expected_description
  then
    raise exception 'Chatwoot Team projection marker mismatch';
  end if;

  if v_mapping.chatwoot_team_id is not null
     and v_mapping.chatwoot_team_id <> p_observed_chatwoot_team_id
  then
    raise exception 'Chatwoot Team identity drift detected by receipt';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'teamMappingId', p_team_mapping_id,
    'mappingVersion', p_expected_mapping_version,
    'smartTeamId', v_mapping.smart_team_id,
    'chatwootAccountMappingId', v_mapping.chatwoot_account_mapping_id,
    'observedChatwootTeamId', p_observed_chatwoot_team_id::text,
    'observedName', v_name,
    'observedDescription', v_description
  )::text, 'sha256'), 'hex');

  select *
    into v_existing
    from public.chatwoot_team_reconciliation_receipts r
   where r.organization_id = p_organization_id
     and r.request_key = v_request_key;

  if found then
    if v_existing.payload_hash <> v_payload_hash then
      raise exception 'Team reconciliation request key already used with different payload';
    end if;
    return v_existing;
  end if;

  insert into public.chatwoot_team_reconciliation_receipts(
    organization_id,
    tenant_business_id,
    team_mapping_id,
    mapping_version,
    smart_team_id,
    chatwoot_account_mapping_id,
    observed_chatwoot_team_id,
    observed_name,
    observed_description,
    request_key,
    payload_hash,
    observed_at,
    expires_at
  ) values (
    p_organization_id,
    p_tenant_business_id,
    p_team_mapping_id,
    p_expected_mapping_version,
    v_mapping.smart_team_id,
    v_mapping.chatwoot_account_mapping_id,
    p_observed_chatwoot_team_id,
    v_name,
    v_description,
    v_request_key,
    v_payload_hash,
    v_now,
    v_now + interval '5 minutes'
  )
  returning * into v_created;

  return v_created;
end;
$$;

create or replace function private.chatwoot_team_receipt_evidence(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_team_mapping_id uuid,
  p_mapping_version integer,
  p_receipt_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_receipt public.chatwoot_team_reconciliation_receipts%rowtype;
begin
  if auth.uid() is null
     or not exists (
       select 1
       from public.organization_members owner_member
       where owner_member.organization_id = p_organization_id
         and owner_member.user_id = auth.uid()
         and owner_member.role = 'OWNER'
     )
  then
    raise exception 'current Organization OWNER required for Team reconciliation evidence';
  end if;

  select *
    into v_receipt
    from public.chatwoot_team_reconciliation_receipts r
   where r.id = p_receipt_id
     and r.organization_id = p_organization_id
     and r.tenant_business_id = p_tenant_business_id
     and r.team_mapping_id = p_team_mapping_id
     and r.mapping_version = p_mapping_version
     and r.expires_at >= now();

  if not found then
    raise exception 'fresh Chatwoot Team reconciliation receipt not found';
  end if;

  return jsonb_build_object(
    'observed_chatwoot_team_id', v_receipt.observed_chatwoot_team_id::text,
    'observed_name', v_receipt.observed_name,
    'observed_description', v_receipt.observed_description,
    'observed_at', v_receipt.observed_at
  );
end;
$$;

create or replace function public.activate_chatwoot_team_mapping_verified(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_team_mapping_id uuid,
  p_expected_version integer,
  p_receipt_id uuid,
  p_request_key text
)
returns public.chatwoot_team_mappings
language plpgsql
security invoker
set search_path = public, auth, private, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_current public.chatwoot_team_mappings%rowtype;
  v_updated public.chatwoot_team_mappings%rowtype;
  v_evidence jsonb;
  v_payload_hash text;
  v_claim record;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot Team mapping mutation not permitted';
  end if;

  if p_expected_version is null
     or p_expected_version < 1
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid verified Team activation payload';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_current
    from public.chatwoot_team_mappings
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_team_mapping_id
   for update;

  if not found then
    raise exception 'Chatwoot Team mapping not found';
  end if;

  v_evidence := private.chatwoot_team_receipt_evidence(
    p_organization_id,
    p_tenant_business_id,
    p_team_mapping_id,
    p_expected_version,
    p_receipt_id
  );

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'teamMappingId', p_team_mapping_id,
    'expectedVersion', p_expected_version,
    'receiptId', p_receipt_id,
    'chatwootTeamId', v_evidence->>'observed_chatwoot_team_id'
  )::text, 'sha256'), 'hex');

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'SET_TEAM_MAPPING_STATE',
      'CHATWOOT_TEAM_MAPPING',
      p_team_mapping_id,
      p_expected_version + 1,
      v_payload_hash
    );

  if not v_claim.is_new then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_current;
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'Chatwoot Team mapping version conflict; current version is %',
      v_current.version;
  end if;

  update public.chatwoot_team_mappings
     set chatwoot_team_id = (v_evidence->>'observed_chatwoot_team_id')::bigint,
         status = 'ACTIVE',
         version = version + 1,
         last_request_key = v_request_key,
         last_verified_at = (v_evidence->>'observed_at')::timestamptz,
         last_error_code = null,
         updated_by_user_id = v_actor
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_team_mapping_id
     and version = p_expected_version
  returning * into v_updated;

  if not found then
    raise exception 'Chatwoot Team mapping changed concurrently';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_updated;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

create or replace function public.mark_chatwoot_team_mapping_degraded(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_team_mapping_id uuid,
  p_expected_version integer,
  p_last_error_code text,
  p_request_key text
)
returns public.chatwoot_team_mappings
language plpgsql
security invoker
set search_path = public, auth, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_error_code text := upper(trim(coalesce(p_last_error_code, '')));
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_current public.chatwoot_team_mappings%rowtype;
  v_updated public.chatwoot_team_mappings%rowtype;
  v_payload_hash text;
  v_claim record;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot Team mapping mutation not permitted';
  end if;

  if p_expected_version is null
     or p_expected_version < 1
     or length(v_error_code) not between 1 and 120
     or v_error_code !~ '^[A-Z0-9_:.-]+$'
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Team degraded payload';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_current
    from public.chatwoot_team_mappings
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_team_mapping_id
   for update;

  if not found then
    raise exception 'Chatwoot Team mapping not found';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'teamMappingId', p_team_mapping_id,
    'expectedVersion', p_expected_version,
    'status', 'DEGRADED',
    'lastErrorCode', v_error_code
  )::text, 'sha256'), 'hex');

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'SET_TEAM_MAPPING_STATE',
      'CHATWOOT_TEAM_MAPPING',
      p_team_mapping_id,
      p_expected_version + 1,
      v_payload_hash
    );

  if not v_claim.is_new then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_current;
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'Chatwoot Team mapping version conflict; current version is %',
      v_current.version;
  end if;

  update public.chatwoot_team_mappings
     set status = 'DEGRADED',
         version = version + 1,
         last_request_key = v_request_key,
         last_error_code = v_error_code,
         updated_by_user_id = v_actor
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_team_mapping_id
     and version = p_expected_version
  returning * into v_updated;

  if not found then
    raise exception 'Chatwoot Team mapping changed concurrently';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_updated;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

revoke all on table public.chatwoot_team_reconciliation_receipts
  from public, anon, authenticated, service_role;
grant select, insert on table public.chatwoot_team_reconciliation_receipts
  to service_role;

revoke all on table public.chatwoot_team_mappings
  from anon, authenticated, service_role;
grant select, insert, update on table public.chatwoot_team_mappings
  to authenticated;
grant select on table public.chatwoot_team_mappings
  to service_role;

revoke all on function public.enforce_chatwoot_team_receipt_immutable()
  from public, anon, authenticated, service_role;

revoke all on function public.create_chatwoot_team_mapping(
  uuid, uuid, uuid, uuid, text
) from public, anon, service_role;
grant execute on function public.create_chatwoot_team_mapping(
  uuid, uuid, uuid, uuid, text
) to authenticated;

revoke all on function public.record_chatwoot_team_reconciliation(
  uuid, uuid, uuid, integer, bigint, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_chatwoot_team_reconciliation(
  uuid, uuid, uuid, integer, bigint, text, text, text
) to service_role;

revoke all on function private.chatwoot_team_receipt_evidence(
  uuid, uuid, uuid, integer, uuid
) from public, anon, authenticated, service_role;
grant execute on function private.chatwoot_team_receipt_evidence(
  uuid, uuid, uuid, integer, uuid
) to authenticated;

revoke all on function public.activate_chatwoot_team_mapping_verified(
  uuid, uuid, uuid, integer, uuid, text
) from public, anon, service_role;
grant execute on function public.activate_chatwoot_team_mapping_verified(
  uuid, uuid, uuid, integer, uuid, text
) to authenticated;

revoke all on function public.mark_chatwoot_team_mapping_degraded(
  uuid, uuid, uuid, integer, text, text
) from public, anon, service_role;
grant execute on function public.mark_chatwoot_team_mapping_degraded(
  uuid, uuid, uuid, integer, text, text
) to authenticated;
