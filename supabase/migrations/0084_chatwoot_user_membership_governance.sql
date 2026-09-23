-- 0084: governed Chatwoot User + Account membership persistence.
-- External Chatwoot HTTP remains outside the database. ARCHIVED transitions stay
-- intentionally unavailable here until reverse-role reconciliation receipts exist.

-- Global Chatwoot User mappings have no organization_id. This narrow helper is
-- read-only and lets RLS prove that the authenticated actor is OWNER of at least
-- one Organization that also contains the target Smart user.
create or replace function private.chatwoot_user_mapping_manage_allowed(
  p_smart_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members actor
    join public.organization_members target
      on target.organization_id = actor.organization_id
    where actor.user_id = auth.uid()
      and actor.role = 'OWNER'
      and target.user_id = p_smart_user_id
  );
$$;

create or replace function private.chatwoot_user_mapping_has_live_memberships(
  p_mapping_id uuid,
  p_smart_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.chatwoot_user_mapping_manage_allowed(p_smart_user_id) then
    raise exception 'Chatwoot User mapping visibility not permitted';
  end if;

  if not exists (
    select 1
    from public.chatwoot_user_mappings um
    where um.id = p_mapping_id
      and um.smart_user_id = p_smart_user_id
  ) then
    raise exception 'Chatwoot User mapping not found for Smart user';
  end if;

  return exists (
    select 1
    from public.chatwoot_account_memberships cm
    where cm.chatwoot_user_mapping_id = p_mapping_id
      and cm.smart_user_id = p_smart_user_id
      and cm.status in ('PROVISIONING','ACTIVE','DEGRADED')
  );
end;
$$;

revoke all on function private.chatwoot_user_mapping_manage_allowed(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.chatwoot_user_mapping_manage_allowed(uuid)
  to authenticated;

revoke all on function private.chatwoot_user_mapping_has_live_memberships(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.chatwoot_user_mapping_has_live_memberships(uuid,uuid)
  to authenticated;

-- All authenticated access to Slice B User/Account membership rows is scoped to
-- one transaction-local governed command. service_role becomes read-only.
drop policy if exists chatwoot_user_mappings_governed_read
  on public.chatwoot_user_mappings;
create policy chatwoot_user_mappings_governed_read
  on public.chatwoot_user_mappings
  for select
  to authenticated
  using (
    coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') = '1'
    and private.chatwoot_user_mapping_manage_allowed(smart_user_id)
  );

drop policy if exists chatwoot_user_mappings_governed_insert
  on public.chatwoot_user_mappings;
create policy chatwoot_user_mappings_governed_insert
  on public.chatwoot_user_mappings
  for insert
  to authenticated
  with check (
    coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') = '1'
    and private.chatwoot_user_mapping_manage_allowed(smart_user_id)
  );

drop policy if exists chatwoot_user_mappings_governed_update
  on public.chatwoot_user_mappings;
create policy chatwoot_user_mappings_governed_update
  on public.chatwoot_user_mappings
  for update
  to authenticated
  using (
    coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') = '1'
    and private.chatwoot_user_mapping_manage_allowed(smart_user_id)
  )
  with check (
    coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') = '1'
    and private.chatwoot_user_mapping_manage_allowed(smart_user_id)
  );

drop policy if exists chatwoot_account_memberships_governed_read
  on public.chatwoot_account_memberships;
create policy chatwoot_account_memberships_governed_read
  on public.chatwoot_account_memberships
  for select
  to authenticated
  using (
    coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') = '1'
    and private.chatwoot_business_wide_role(
      organization_id,
      tenant_business_id,
      smart_user_id
    ) is not null
  );

drop policy if exists chatwoot_account_memberships_governed_insert
  on public.chatwoot_account_memberships;
create policy chatwoot_account_memberships_governed_insert
  on public.chatwoot_account_memberships
  for insert
  to authenticated
  with check (
    coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') = '1'
    and private.chatwoot_business_wide_role(
      organization_id,
      tenant_business_id,
      smart_user_id
    ) is not null
  );

drop policy if exists chatwoot_account_memberships_governed_update
  on public.chatwoot_account_memberships;
create policy chatwoot_account_memberships_governed_update
  on public.chatwoot_account_memberships
  for update
  to authenticated
  using (
    coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') = '1'
    and private.chatwoot_business_wide_role(
      organization_id,
      tenant_business_id,
      smart_user_id
    ) is not null
  )
  with check (
    coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') = '1'
    and private.chatwoot_business_wide_role(
      organization_id,
      tenant_business_id,
      smart_user_id
    ) is not null
  );

drop trigger if exists chatwoot_user_mappings_00_command_guard
  on public.chatwoot_user_mappings;
create trigger chatwoot_user_mappings_00_command_guard
before insert or update or delete
on public.chatwoot_user_mappings
for each row execute function public.enforce_chatwoot_bridge_command_path();

drop trigger if exists chatwoot_account_memberships_00_command_guard
  on public.chatwoot_account_memberships;
create trigger chatwoot_account_memberships_00_command_guard
before insert or update or delete
on public.chatwoot_account_memberships
for each row execute function public.enforce_chatwoot_bridge_command_path();

-- Replace the Slice B membership contract so declared effective_smart_role is
-- never mutation authority. Canonical Smart Core role is recomputed through 0083.
create or replace function public.enforce_chatwoot_account_membership_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, private, pg_catalog
as $$
declare
  v_user_mapping public.chatwoot_user_mappings%rowtype;
  v_account_mapping public.chatwoot_account_mappings%rowtype;
  v_canonical_role text;
  v_expected_chatwoot_role text;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.tenant_business_id is distinct from old.tenant_business_id
       or new.smart_user_id is distinct from old.smart_user_id
       or new.chatwoot_user_mapping_id is distinct from old.chatwoot_user_mapping_id
       or new.chatwoot_account_mapping_id is distinct from old.chatwoot_account_mapping_id
       or new.created_by_user_id is distinct from old.created_by_user_id
    then
      raise exception 'Chatwoot Account membership scope is immutable';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'Chatwoot Account membership version must increment by exactly one';
    end if;

    if new.last_request_key = old.last_request_key then
      raise exception 'Chatwoot Account membership update requires a new request key';
    end if;

    if old.chatwoot_account_user_id is not null
       and new.chatwoot_account_user_id is distinct from old.chatwoot_account_user_id
    then
      raise exception 'Chatwoot AccountUser ID is immutable once adopted';
    end if;

    if old.status = 'ARCHIVED' then
      raise exception 'ARCHIVED Chatwoot Account membership is terminal';
    end if;

    if old.status = 'ACTIVE'
       and new.status not in ('ACTIVE','DEGRADED','ARCHIVED')
    then
      raise exception 'invalid Chatwoot Account membership transition';
    elsif old.status = 'DEGRADED'
       and new.status not in ('DEGRADED','ACTIVE','ARCHIVED')
    then
      raise exception 'invalid Chatwoot Account membership transition';
    elsif old.status = 'PROVISIONING'
       and new.status not in ('PROVISIONING','ACTIVE','DEGRADED','ARCHIVED')
    then
      raise exception 'invalid Chatwoot Account membership transition';
    end if;

    if new.status = 'ACTIVE'
       and (
         old.status <> 'ACTIVE'
         or new.effective_smart_role is distinct from old.effective_smart_role
         or new.chatwoot_role is distinct from old.chatwoot_role
       )
       and new.last_verified_at is not distinct from old.last_verified_at
    then
      raise exception 'Chatwoot Account membership change requires fresh verification evidence';
    end if;
  elsif new.version <> 1 or new.status <> 'PROVISIONING' then
    raise exception 'new Chatwoot Account membership must start PROVISIONING at version 1';
  end if;

  select * into v_user_mapping
  from public.chatwoot_user_mappings
  where id = new.chatwoot_user_mapping_id;

  if not found or v_user_mapping.smart_user_id <> new.smart_user_id then
    raise exception 'Chatwoot User mapping does not match Smart user';
  end if;

  select * into v_account_mapping
  from public.chatwoot_account_mappings
  where organization_id = new.organization_id
    and id = new.chatwoot_account_mapping_id;

  if not found
     or v_account_mapping.tenant_business_id <> new.tenant_business_id
  then
    raise exception 'Chatwoot Account mapping does not match tenant Business';
  end if;

  if new.status <> 'ARCHIVED' then
    v_canonical_role := private.chatwoot_business_wide_role(
      new.organization_id,
      new.tenant_business_id,
      new.smart_user_id
    );

    if v_canonical_role = 'VIEWER' then
      raise exception 'VIEWER cannot have a live Chatwoot Account membership';
    end if;

    v_expected_chatwoot_role := case
      when v_canonical_role = 'OWNER' then 'administrator'
      else 'agent'
    end;

    if new.effective_smart_role <> v_canonical_role then
      raise exception 'Chatwoot Account membership role must match canonical Smart Core role';
    end if;

    if new.chatwoot_role <> v_expected_chatwoot_role then
      raise exception 'Chatwoot Account membership role projection is not canonical';
    end if;
  end if;

  if new.status <> 'ARCHIVED' then
    if v_user_mapping.status <> 'ACTIVE' then
      raise exception 'live Account membership requires ACTIVE Chatwoot User mapping';
    end if;
    if v_account_mapping.status <> 'ACTIVE' then
      raise exception 'live Account membership requires ACTIVE Chatwoot Account mapping';
    end if;
  end if;

  if new.status = 'ACTIVE' then
    if new.chatwoot_account_user_id is null or new.last_verified_at is null then
      raise exception 'ACTIVE Account membership requires verified external AccountUser';
    end if;
    new.last_error_code := null;
  elsif new.status = 'DEGRADED' and new.last_error_code is null then
    raise exception 'DEGRADED Account membership requires bounded error code';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- The global User mapping must not be weakened while any Organization still has
-- a live Account membership pointing at it.
create or replace function public.enforce_chatwoot_user_mapping_archive_dependencies()
returns trigger
language plpgsql
security invoker
set search_path = private, pg_catalog
as $$
begin
  if old.status = 'ACTIVE'
     and new.status in ('DEGRADED','ARCHIVED')
     and private.chatwoot_user_mapping_has_live_memberships(
       old.id,
       old.smart_user_id
     )
  then
    raise exception 'live Chatwoot Account memberships require ACTIVE User mapping';
  end if;
  return new;
end;
$$;

create or replace function public.create_chatwoot_user_mapping(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_smart_user_id uuid,
  p_request_key text
)
returns public.chatwoot_user_mappings
language plpgsql
security invoker
set search_path = public, auth, private, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_canonical_role text;
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_payload_hash text;
  v_claim record;
  v_existing public.chatwoot_user_mappings%rowtype;
  v_created public.chatwoot_user_mappings%rowtype;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot User mapping mutation not permitted';
  end if;

  if length(v_request_key) not between 1 and 200 then
    raise exception 'request key must contain 1..200 characters';
  end if;

  v_canonical_role := private.chatwoot_business_wide_role(
    p_organization_id,
    p_tenant_business_id,
    p_smart_user_id
  );

  if v_canonical_role = 'VIEWER' then
    raise exception 'VIEWER does not require a Chatwoot User mapping';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'smartUserId', p_smart_user_id
  )::text, 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('chatwoot:user:' || p_smart_user_id::text)
  );
  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_existing
    from public.chatwoot_user_mappings
   where smart_user_id = p_smart_user_id
     and status in ('PROVISIONING','ACTIVE','DEGRADED','ARCHIVED')
   order by case status
     when 'ACTIVE' then 1
     when 'PROVISIONING' then 2
     when 'DEGRADED' then 3
     else 4
   end
   limit 1;

  if found then
    if v_existing.status = 'ARCHIVED' then
      raise exception 'ARCHIVED Chatwoot User mapping is terminal';
    end if;

    select *
      into v_claim
      from public.claim_chatwoot_bridge_command(
        p_organization_id,
        v_request_key,
        'CREATE_USER_MAPPING',
        'CHATWOOT_USER_MAPPING',
        v_existing.id,
        1,
        v_payload_hash
      );

    if v_claim.is_new then
      insert into public.audit_logs(
        organization_id,
        actor_type,
        actor_id,
        action,
        entity_type,
        entity_id,
        before_data,
        after_data
      ) values (
        p_organization_id,
        'USER',
        v_actor::text,
        'CHATWOOT_USER_MAPPING_ADOPTED',
        'chatwoot_user_mappings',
        v_existing.id::text,
        null,
        jsonb_build_object(
          'smart_user_id', v_existing.smart_user_id,
          'status', v_existing.status,
          'version', v_existing.version,
          'chatwoot_user_id', v_existing.chatwoot_user_id,
          'tenant_business_id', p_tenant_business_id
        )
      );
    end if;

    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_existing;
  end if;

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'CREATE_USER_MAPPING',
      'CHATWOOT_USER_MAPPING',
      null,
      1,
      v_payload_hash
    );

  if not v_claim.is_new then
    select *
      into v_existing
      from public.chatwoot_user_mappings
     where id = v_claim.entity_id;

    if not found then
      raise exception 'Chatwoot User mapping create claim has no mapping row';
    end if;

    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_existing;
  end if;

  insert into public.chatwoot_user_mappings(
    id,
    smart_user_id,
    status,
    version,
    last_request_key,
    created_by_user_id,
    updated_by_user_id
  ) values (
    v_claim.entity_id,
    p_smart_user_id,
    'PROVISIONING',
    1,
    v_request_key,
    v_actor,
    v_actor
  )
  returning * into v_created;

  insert into public.audit_logs(
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    p_organization_id,
    'USER',
    v_actor::text,
    'CHATWOOT_USER_MAPPING_CREATED',
    'chatwoot_user_mappings',
    v_created.id::text,
    null,
    jsonb_build_object(
      'smart_user_id', v_created.smart_user_id,
      'status', v_created.status,
      'version', v_created.version,
      'tenant_business_id', p_tenant_business_id
    )
  );

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_created;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

create or replace function public.set_chatwoot_user_mapping_state(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_smart_user_id uuid,
  p_mapping_id uuid,
  p_expected_version integer,
  p_status text,
  p_chatwoot_user_id integer,
  p_last_error_code text,
  p_request_key text
)
returns public.chatwoot_user_mappings
language plpgsql
security invoker
set search_path = public, auth, private, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_canonical_role text;
  v_status text := upper(trim(coalesce(p_status, '')));
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_error_code text := nullif(upper(trim(coalesce(p_last_error_code, ''))), '');
  v_payload_hash text;
  v_claim record;
  v_current public.chatwoot_user_mappings%rowtype;
  v_updated public.chatwoot_user_mappings%rowtype;
  v_user_id integer;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot User mapping mutation not permitted';
  end if;

  if p_expected_version is null or p_expected_version < 1
     or v_status not in ('PROVISIONING','ACTIVE','DEGRADED')
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Chatwoot User mapping state payload';
  end if;

  if p_chatwoot_user_id is not null and p_chatwoot_user_id <= 0 then
    raise exception 'Chatwoot User ID must be positive';
  end if;

  if v_error_code is not null
     and (length(v_error_code) > 120 or v_error_code !~ '^[A-Z0-9_:.-]+$')
  then
    raise exception 'last error code is invalid';
  end if;

  v_canonical_role := private.chatwoot_business_wide_role(
    p_organization_id,
    p_tenant_business_id,
    p_smart_user_id
  );

  if v_canonical_role = 'VIEWER' then
    raise exception 'VIEWER does not require a Chatwoot User mapping';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'smartUserId', p_smart_user_id,
    'mappingId', p_mapping_id,
    'expectedVersion', p_expected_version,
    'status', v_status,
    'chatwootUserId', p_chatwoot_user_id,
    'lastErrorCode', v_error_code
  )::text, 'sha256'), 'hex');

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'SET_USER_MAPPING_STATE',
      'CHATWOOT_USER_MAPPING',
      p_mapping_id,
      p_expected_version + 1,
      v_payload_hash
    );

  if not v_claim.is_new then
    select *
      into v_current
      from public.chatwoot_user_mappings
     where id = p_mapping_id
       and smart_user_id = p_smart_user_id;

    if not found then
      raise exception 'Chatwoot User mapping state replay has no mapping row';
    end if;

    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_current;
  end if;

  select *
    into v_current
    from public.chatwoot_user_mappings
   where id = p_mapping_id
     and smart_user_id = p_smart_user_id
   for update;

  if not found then
    raise exception 'Chatwoot User mapping not found';
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'Chatwoot User mapping version conflict; current version is %',
      v_current.version;
  end if;

  if v_current.status = 'ACTIVE'
     and v_status <> 'ACTIVE'
     and private.chatwoot_user_mapping_has_live_memberships(
       v_current.id,
       v_current.smart_user_id
     )
  then
    raise exception 'live Chatwoot Account memberships require ACTIVE User mapping';
  end if;

  if v_current.chatwoot_user_id is not null
     and p_chatwoot_user_id is not null
     and v_current.chatwoot_user_id <> p_chatwoot_user_id
  then
    raise exception 'Chatwoot User ID cannot be replaced in-place';
  end if;

  v_user_id := coalesce(v_current.chatwoot_user_id, p_chatwoot_user_id);

  if v_status = 'ACTIVE' and v_user_id is null then
    raise exception 'ACTIVE Chatwoot User mapping requires external User ID';
  end if;

  if v_status = 'DEGRADED' and v_error_code is null then
    raise exception 'DEGRADED Chatwoot User mapping requires error code';
  end if;

  update public.chatwoot_user_mappings
     set chatwoot_user_id = v_user_id,
         status = v_status,
         version = version + 1,
         last_request_key = v_request_key,
         last_verified_at = case when v_status = 'ACTIVE' then now() else last_verified_at end,
         last_error_code = case when v_status = 'ACTIVE' then null else v_error_code end,
         updated_by_user_id = v_actor
   where id = p_mapping_id
     and smart_user_id = p_smart_user_id
     and version = p_expected_version
  returning * into v_updated;

  if not found then
    raise exception 'Chatwoot User mapping changed concurrently';
  end if;

  insert into public.audit_logs(
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    p_organization_id,
    'USER',
    v_actor::text,
    'CHATWOOT_USER_MAPPING_STATE_CHANGED',
    'chatwoot_user_mappings',
    p_mapping_id::text,
    jsonb_build_object(
      'status', v_current.status,
      'version', v_current.version,
      'chatwoot_user_id', v_current.chatwoot_user_id
    ),
    jsonb_build_object(
      'status', v_updated.status,
      'version', v_updated.version,
      'chatwoot_user_id', v_updated.chatwoot_user_id,
      'last_verified_at', v_updated.last_verified_at,
      'last_error_code', v_updated.last_error_code,
      'tenant_business_id', p_tenant_business_id
    )
  );

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_updated;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

create or replace function public.create_chatwoot_account_membership(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_smart_user_id uuid,
  p_chatwoot_user_mapping_id uuid,
  p_chatwoot_account_mapping_id uuid,
  p_request_key text
)
returns public.chatwoot_account_memberships
language plpgsql
security invoker
set search_path = public, auth, private, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_canonical_role text;
  v_chatwoot_role text;
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_payload_hash text;
  v_claim record;
  v_existing public.chatwoot_account_memberships%rowtype;
  v_created public.chatwoot_account_memberships%rowtype;
  v_user_mapping public.chatwoot_user_mappings%rowtype;
  v_account_mapping public.chatwoot_account_mappings%rowtype;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot Account membership mutation not permitted';
  end if;

  if length(v_request_key) not between 1 and 200 then
    raise exception 'request key must contain 1..200 characters';
  end if;

  v_canonical_role := private.chatwoot_business_wide_role(
    p_organization_id,
    p_tenant_business_id,
    p_smart_user_id
  );

  if v_canonical_role = 'VIEWER' then
    raise exception 'VIEWER cannot have a Chatwoot Account membership';
  end if;

  v_chatwoot_role := case
    when v_canonical_role = 'OWNER' then 'administrator'
    else 'agent'
  end;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'smartUserId', p_smart_user_id,
    'chatwootUserMappingId', p_chatwoot_user_mapping_id,
    'chatwootAccountMappingId', p_chatwoot_account_mapping_id,
    'effectiveSmartRole', v_canonical_role,
    'chatwootRole', v_chatwoot_role
  )::text, 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(
      'chatwoot:membership:' ||
      p_organization_id::text || ':' ||
      p_tenant_business_id::text || ':' ||
      p_smart_user_id::text
    )
  );
  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_user_mapping
    from public.chatwoot_user_mappings
   where id = p_chatwoot_user_mapping_id
     and smart_user_id = p_smart_user_id;

  if not found or v_user_mapping.status <> 'ACTIVE' then
    raise exception 'Chatwoot Account membership requires ACTIVE User mapping';
  end if;

  select *
    into v_account_mapping
    from public.chatwoot_account_mappings
   where organization_id = p_organization_id
     and id = p_chatwoot_account_mapping_id
     and tenant_business_id = p_tenant_business_id;

  if not found or v_account_mapping.status <> 'ACTIVE' then
    raise exception 'Chatwoot Account membership requires ACTIVE Account mapping';
  end if;

  select *
    into v_existing
    from public.chatwoot_account_memberships
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and smart_user_id = p_smart_user_id
     and status in ('PROVISIONING','ACTIVE','DEGRADED')
   limit 1;

  if found then
    if v_existing.chatwoot_user_mapping_id <> p_chatwoot_user_mapping_id
       or v_existing.chatwoot_account_mapping_id <> p_chatwoot_account_mapping_id
       or v_existing.effective_smart_role <> v_canonical_role
       or v_existing.chatwoot_role <> v_chatwoot_role
    then
      raise exception 'existing Chatwoot Account membership requires reconciliation';
    end if;

    select *
      into v_claim
      from public.claim_chatwoot_bridge_command(
        p_organization_id,
        v_request_key,
        'CREATE_ACCOUNT_MEMBERSHIP',
        'CHATWOOT_ACCOUNT_MEMBERSHIP',
        v_existing.id,
        1,
        v_payload_hash
      );

    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_existing;
  end if;

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'CREATE_ACCOUNT_MEMBERSHIP',
      'CHATWOOT_ACCOUNT_MEMBERSHIP',
      null,
      1,
      v_payload_hash
    );

  if not v_claim.is_new then
    select *
      into v_existing
      from public.chatwoot_account_memberships
     where organization_id = p_organization_id
       and id = v_claim.entity_id;

    if not found then
      raise exception 'Chatwoot Account membership create claim has no mapping row';
    end if;

    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_existing;
  end if;

  insert into public.chatwoot_account_memberships(
    id,
    organization_id,
    tenant_business_id,
    smart_user_id,
    chatwoot_user_mapping_id,
    chatwoot_account_mapping_id,
    effective_smart_role,
    chatwoot_role,
    status,
    version,
    last_request_key,
    created_by_user_id,
    updated_by_user_id
  ) values (
    v_claim.entity_id,
    p_organization_id,
    p_tenant_business_id,
    p_smart_user_id,
    p_chatwoot_user_mapping_id,
    p_chatwoot_account_mapping_id,
    v_canonical_role,
    v_chatwoot_role,
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

create or replace function public.set_chatwoot_account_membership_state(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_membership_id uuid,
  p_expected_version integer,
  p_status text,
  p_chatwoot_account_user_id bigint,
  p_verified_chatwoot_role text,
  p_last_error_code text,
  p_request_key text
)
returns public.chatwoot_account_memberships
language plpgsql
security invoker
set search_path = public, auth, private, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_status text := upper(trim(coalesce(p_status, '')));
  v_verified_role text := lower(trim(coalesce(p_verified_chatwoot_role, '')));
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_error_code text := nullif(upper(trim(coalesce(p_last_error_code, ''))), '');
  v_payload_hash text;
  v_claim record;
  v_current public.chatwoot_account_memberships%rowtype;
  v_updated public.chatwoot_account_memberships%rowtype;
  v_canonical_role text;
  v_chatwoot_role text;
  v_account_user_id bigint;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot Account membership mutation not permitted';
  end if;

  if p_expected_version is null or p_expected_version < 1
     or v_status not in ('PROVISIONING','ACTIVE','DEGRADED')
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Chatwoot Account membership state payload';
  end if;

  if p_chatwoot_account_user_id is not null and p_chatwoot_account_user_id <= 0 then
    raise exception 'Chatwoot AccountUser ID must be positive';
  end if;

  if v_verified_role <> ''
     and v_verified_role not in ('administrator','agent')
  then
    raise exception 'verified Chatwoot role is invalid';
  end if;

  if v_error_code is not null
     and (length(v_error_code) > 120 or v_error_code !~ '^[A-Z0-9_:.-]+$')
  then
    raise exception 'last error code is invalid';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_current
    from public.chatwoot_account_memberships
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_membership_id
   for update;

  if not found then
    raise exception 'Chatwoot Account membership not found';
  end if;

  v_canonical_role := private.chatwoot_business_wide_role(
    p_organization_id,
    p_tenant_business_id,
    v_current.smart_user_id
  );

  if v_canonical_role = 'VIEWER' then
    raise exception 'VIEWER cannot have a live Chatwoot Account membership';
  end if;

  v_chatwoot_role := case
    when v_canonical_role = 'OWNER' then 'administrator'
    else 'agent'
  end;

  if v_status = 'ACTIVE' and v_verified_role <> v_chatwoot_role then
    raise exception 'verified external Chatwoot role does not match canonical projection';
  end if;

  if v_current.chatwoot_account_user_id is not null
     and p_chatwoot_account_user_id is not null
     and v_current.chatwoot_account_user_id <> p_chatwoot_account_user_id
  then
    raise exception 'Chatwoot AccountUser ID cannot be replaced in-place';
  end if;

  v_account_user_id := coalesce(
    v_current.chatwoot_account_user_id,
    p_chatwoot_account_user_id
  );

  if v_status = 'ACTIVE' and v_account_user_id is null then
    raise exception 'ACTIVE Chatwoot Account membership requires external AccountUser ID';
  end if;

  if v_status = 'DEGRADED' and v_error_code is null then
    raise exception 'DEGRADED Chatwoot Account membership requires error code';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'membershipId', p_membership_id,
    'expectedVersion', p_expected_version,
    'status', v_status,
    'chatwootAccountUserId', p_chatwoot_account_user_id,
    'verifiedChatwootRole', nullif(v_verified_role, ''),
    'lastErrorCode', v_error_code,
    'effectiveSmartRole', v_canonical_role,
    'chatwootRole', v_chatwoot_role
  )::text, 'sha256'), 'hex');

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'SET_ACCOUNT_MEMBERSHIP_STATE',
      'CHATWOOT_ACCOUNT_MEMBERSHIP',
      p_membership_id,
      p_expected_version + 1,
      v_payload_hash
    );

  if not v_claim.is_new then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_current;
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'Chatwoot Account membership version conflict; current version is %',
      v_current.version;
  end if;

  update public.chatwoot_account_memberships
     set chatwoot_account_user_id = v_account_user_id,
         effective_smart_role = v_canonical_role,
         chatwoot_role = v_chatwoot_role,
         status = v_status,
         version = version + 1,
         last_request_key = v_request_key,
         last_verified_at = case when v_status = 'ACTIVE' then now() else last_verified_at end,
         last_error_code = case when v_status = 'ACTIVE' then null else v_error_code end,
         updated_by_user_id = v_actor
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_membership_id
     and version = p_expected_version
  returning * into v_updated;

  if not found then
    raise exception 'Chatwoot Account membership changed concurrently';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_updated;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

-- Remove the old server-only direct mutation grants from just the C3B User and
-- Account membership tables. Inbox/Team remain unchanged until their own writer.
revoke all on table public.chatwoot_user_mappings,
  public.chatwoot_account_memberships
from anon, authenticated, service_role;

grant select, insert, update on table public.chatwoot_user_mappings,
  public.chatwoot_account_memberships
to authenticated;

grant select on table public.chatwoot_user_mappings,
  public.chatwoot_account_memberships
to service_role;

revoke all on function public.create_chatwoot_user_mapping(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_chatwoot_user_mapping(
  uuid, uuid, uuid, text
) to authenticated;

revoke all on function public.set_chatwoot_user_mapping_state(
  uuid, uuid, uuid, uuid, integer, text, integer, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.set_chatwoot_user_mapping_state(
  uuid, uuid, uuid, uuid, integer, text, integer, text, text
) to authenticated;

revoke all on function public.create_chatwoot_account_membership(
  uuid, uuid, uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_chatwoot_account_membership(
  uuid, uuid, uuid, uuid, uuid, text
) to authenticated;

revoke all on function public.set_chatwoot_account_membership_state(
  uuid, uuid, uuid, integer, text, bigint, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.set_chatwoot_account_membership_state(
  uuid, uuid, uuid, integer, text, bigint, text, text, text
) to authenticated;
