-- Smart Visions AI Business OS 2027
-- SECTION COMMUNICATION / COMM-TENANT-BRIDGE / Slice A
--
-- Boundaries:
-- - canonical tenant/channel binding + Chatwoot Account mapping only
-- - no live Chatwoot HTTP call
-- - no Contact/Conversation projection
-- - no provider credential storage
-- - no provider send
-- - no destructive DELETE lifecycle
-- - public.businesses remains Growth/Hunter CRM Company/Account, not tenant Business

create table if not exists public.communication_channel_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  branch_id uuid references public.branches(id) on delete restrict,
  integration_connection_id uuid not null references public.integration_connections(id) on delete restrict,
  channel text not null check (channel in ('EMAIL','WHATSAPP')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  version integer not null default 1 check (version >= 1),
  last_request_key text not null check (length(trim(last_request_key)) between 1 and 200),
  last_verified_at timestamptz,
  last_error_code text check (
    last_error_code is null
    or (
      length(last_error_code) between 1 and 120
      and last_error_code = upper(last_error_code)
      and last_error_code ~ '^[A-Z0-9_:.-]+$'
    )
  ),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),
  unique (organization_id, last_request_key),

  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict,
  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  foreign key (organization_id, updated_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create unique index if not exists communication_channel_bindings_one_active_per_connection
  on public.communication_channel_bindings(integration_connection_id)
  where status = 'ACTIVE';

create index if not exists communication_channel_bindings_business_status_idx
  on public.communication_channel_bindings(
    organization_id, tenant_business_id, status, updated_at desc, id desc
  );

create index if not exists communication_channel_bindings_branch_idx
  on public.communication_channel_bindings(organization_id, branch_id)
  where branch_id is not null;

create index if not exists communication_channel_bindings_created_by_fk_idx
  on public.communication_channel_bindings(organization_id, created_by_user_id);

create index if not exists communication_channel_bindings_updated_by_fk_idx
  on public.communication_channel_bindings(organization_id, updated_by_user_id);

create table if not exists public.chatwoot_account_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  chatwoot_account_id integer check (chatwoot_account_id is null or chatwoot_account_id > 0),
  status text not null default 'PROVISIONING'
    check (status in ('PROVISIONING','ACTIVE','DEGRADED','ARCHIVED')),
  version integer not null default 1 check (version >= 1),
  last_request_key text not null check (length(trim(last_request_key)) between 1 and 200),
  last_verified_at timestamptz,
  last_error_code text check (
    last_error_code is null
    or (
      length(last_error_code) between 1 and 120
      and last_error_code = upper(last_error_code)
      and last_error_code ~ '^[A-Z0-9_:.-]+$'
    )
  ),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),
  unique (organization_id, last_request_key),

  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict,
  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  foreign key (organization_id, updated_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create unique index if not exists chatwoot_account_mappings_one_live_per_business
  on public.chatwoot_account_mappings(organization_id, tenant_business_id)
  where status in ('PROVISIONING','ACTIVE','DEGRADED');

create unique index if not exists chatwoot_account_mappings_external_account_unique
  on public.chatwoot_account_mappings(chatwoot_account_id)
  where chatwoot_account_id is not null
    and status in ('PROVISIONING','ACTIVE','DEGRADED');

create index if not exists chatwoot_account_mappings_business_status_idx
  on public.chatwoot_account_mappings(
    organization_id, tenant_business_id, status, updated_at desc, id desc
  );

create index if not exists chatwoot_account_mappings_created_by_fk_idx
  on public.chatwoot_account_mappings(organization_id, created_by_user_id);

create index if not exists chatwoot_account_mappings_updated_by_fk_idx
  on public.chatwoot_account_mappings(organization_id, updated_by_user_id);

create table if not exists public.chatwoot_bridge_command_claims (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_key text not null check (length(trim(request_key)) between 1 and 200),
  command_type text not null check (command_type in (
    'CREATE_CHANNEL_BINDING',
    'SET_CHANNEL_BINDING_LIFECYCLE',
    'CREATE_ACCOUNT_MAPPING',
    'SET_ACCOUNT_MAPPING_STATE'
  )),
  entity_type text not null check (entity_type in (
    'COMMUNICATION_CHANNEL_BINDING',
    'CHATWOOT_ACCOUNT_MAPPING'
  )),
  entity_id uuid not null,
  applied_version integer not null check (applied_version >= 1),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),

  primary key (organization_id, request_key),

  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create index if not exists chatwoot_bridge_command_claims_entity_idx
  on public.chatwoot_bridge_command_claims(
    organization_id, entity_type, entity_id, created_at desc
  );

create or replace function public.chatwoot_bridge_can_read(
  p_organization_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('OWNER','ADMIN')
  );
$$;

create or replace function public.chatwoot_bridge_can_manage(
  p_organization_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role = 'OWNER'
  );
$$;

create or replace function public.enforce_chatwoot_bridge_command_path()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Chatwoot bridge rows use lifecycle state; DELETE is not permitted';
  end if;

  if coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') <> '1' then
    raise exception 'Chatwoot bridge mutations must use the governed command RPC';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_chatwoot_bridge_claim_insert()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Chatwoot bridge command claims are immutable';
  end if;

  if coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') <> '1' then
    raise exception 'Chatwoot bridge command claim requires governed command context';
  end if;

  return new;
end;
$$;

create or replace function public.claim_chatwoot_bridge_command(
  p_organization_id uuid,
  p_request_key text,
  p_command_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_applied_version integer,
  p_payload_hash text
)
returns table(
  is_new boolean,
  entity_id uuid,
  applied_version integer
)
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_existing public.chatwoot_bridge_command_claims%rowtype;
  v_entity_id uuid := coalesce(p_entity_id, gen_random_uuid());
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_command_type text := upper(trim(coalesce(p_command_type, '')));
  v_entity_type text := upper(trim(coalesce(p_entity_type, '')));
  v_payload_hash text := lower(trim(coalesce(p_payload_hash, '')));
begin
  if auth.uid() is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot bridge mutation not permitted';
  end if;

  if coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') <> '1' then
    raise exception 'Chatwoot bridge command claim requires governed command context';
  end if;

  if length(v_request_key) not between 1 and 200
     or v_command_type not in (
       'CREATE_CHANNEL_BINDING',
       'SET_CHANNEL_BINDING_LIFECYCLE',
       'CREATE_ACCOUNT_MAPPING',
       'SET_ACCOUNT_MAPPING_STATE'
     )
     or v_entity_type not in (
       'COMMUNICATION_CHANNEL_BINDING',
       'CHATWOOT_ACCOUNT_MAPPING'
     )
     or p_applied_version is null
     or p_applied_version < 1
     or v_payload_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid Chatwoot bridge command claim';
  end if;

  begin
    insert into public.chatwoot_bridge_command_claims(
      organization_id,
      request_key,
      command_type,
      entity_type,
      entity_id,
      applied_version,
      payload_hash,
      created_by_user_id
    ) values (
      p_organization_id,
      v_request_key,
      v_command_type,
      v_entity_type,
      v_entity_id,
      p_applied_version,
      v_payload_hash,
      auth.uid()
    );

    return query select true, v_entity_id, p_applied_version;
    return;
  exception
    when unique_violation then
      select *
        into v_existing
        from public.chatwoot_bridge_command_claims
       where organization_id = p_organization_id
         and request_key = v_request_key;

      if not found then
        raise;
      end if;

      if v_existing.command_type <> v_command_type
         or v_existing.entity_type <> v_entity_type
         or v_existing.payload_hash <> v_payload_hash
         or (p_entity_id is not null and v_existing.entity_id <> p_entity_id)
      then
        raise exception 'request key already used with different Chatwoot bridge payload';
      end if;

      return query
      select false, v_existing.entity_id, v_existing.applied_version;
      return;
  end;
end;
$$;

create or replace function public.enforce_communication_channel_binding_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_business_status text;
  v_branch_business_id uuid;
  v_branch_org_id uuid;
  v_branch_status text;
  v_connection_org_id uuid;
  v_connection_channel text;
  v_connection_enabled boolean;
  v_connection_status text;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.tenant_business_id is distinct from old.tenant_business_id
       or new.branch_id is distinct from old.branch_id
       or new.integration_connection_id is distinct from old.integration_connection_id
       or new.channel is distinct from old.channel
       or new.created_by_user_id is distinct from old.created_by_user_id
    then
      raise exception 'communication channel binding scope is immutable';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'communication channel binding version must increment by exactly one';
    end if;

    if new.last_request_key = old.last_request_key then
      raise exception 'communication channel binding update requires a new request key';
    end if;
  elsif new.version <> 1 then
    raise exception 'communication channel binding initial version must be 1';
  end if;

  select b.status
    into v_business_status
    from public.tenant_businesses b
   where b.organization_id = new.organization_id
     and b.id = new.tenant_business_id;

  if not found then
    raise exception 'tenant Business not found for communication binding';
  end if;

  if new.branch_id is not null then
    select br.organization_id, br.tenant_business_id, br.status
      into v_branch_org_id, v_branch_business_id, v_branch_status
      from public.branches br
     where br.id = new.branch_id;

    if not found
       or v_branch_org_id <> new.organization_id
       or v_branch_business_id <> new.tenant_business_id
    then
      raise exception 'communication binding Branch does not match tenant Business';
    end if;
  end if;

  select ic.organization_id, ic.channel, ic.enabled, ic.status
    into v_connection_org_id, v_connection_channel, v_connection_enabled, v_connection_status
    from public.integration_connections ic
   where ic.id = new.integration_connection_id;

  if not found
     or v_connection_org_id <> new.organization_id
     or v_connection_channel <> new.channel
  then
    raise exception 'integration connection does not match communication binding';
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'ACTIVE'
     and new.status = 'ARCHIVED'
     and exists (
       select 1
       from public.chatwoot_account_mappings cam
       where cam.organization_id = new.organization_id
         and cam.tenant_business_id = new.tenant_business_id
         and cam.status in ('PROVISIONING','ACTIVE','DEGRADED')
     )
     and not exists (
       select 1
       from public.communication_channel_bindings sibling
       where sibling.organization_id = new.organization_id
         and sibling.tenant_business_id = new.tenant_business_id
         and sibling.status = 'ACTIVE'
         and sibling.id <> old.id
     )
  then
    raise exception 'archive live Chatwoot Account mapping before last communication binding';
  end if;

  if new.status = 'ACTIVE' then
    if v_business_status <> 'ACTIVE' then
      raise exception 'ACTIVE communication binding requires ACTIVE tenant Business';
    end if;
    if new.branch_id is not null and v_branch_status <> 'ACTIVE' then
      raise exception 'ACTIVE communication binding requires ACTIVE Branch';
    end if;
    if not v_connection_enabled or v_connection_status <> 'CONNECTED' then
      raise exception 'ACTIVE communication binding requires CONNECTED enabled integration';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.enforce_chatwoot_account_mapping_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_business_status text;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.tenant_business_id is distinct from old.tenant_business_id
       or new.created_by_user_id is distinct from old.created_by_user_id
    then
      raise exception 'Chatwoot Account mapping tenant scope is immutable';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'Chatwoot Account mapping version must increment by exactly one';
    end if;

    if new.last_request_key = old.last_request_key then
      raise exception 'Chatwoot Account mapping update requires a new request key';
    end if;

    if old.chatwoot_account_id is not null
       and new.chatwoot_account_id is distinct from old.chatwoot_account_id
    then
      raise exception 'Chatwoot Account ID is immutable once adopted';
    end if;

    if old.status = 'ARCHIVED' then
      raise exception 'ARCHIVED Chatwoot Account mapping is terminal';
    end if;

    if old.status = 'PROVISIONING'
       and new.status not in ('PROVISIONING','ACTIVE','DEGRADED','ARCHIVED')
    then
      raise exception 'invalid Chatwoot Account mapping transition';
    elsif old.status = 'ACTIVE'
       and new.status not in ('ACTIVE','DEGRADED','ARCHIVED')
    then
      raise exception 'invalid Chatwoot Account mapping transition';
    elsif old.status = 'DEGRADED'
       and new.status not in ('DEGRADED','ACTIVE','ARCHIVED')
    then
      raise exception 'invalid Chatwoot Account mapping transition';
    end if;
  elsif new.version <> 1 or new.status <> 'PROVISIONING' then
    raise exception 'new Chatwoot Account mapping must start PROVISIONING at version 1';
  end if;

  select b.status
    into v_business_status
    from public.tenant_businesses b
   where b.organization_id = new.organization_id
     and b.id = new.tenant_business_id;

  if not found then
    raise exception 'tenant Business not found for Chatwoot Account mapping';
  end if;

  if new.status <> 'ARCHIVED' and v_business_status <> 'ACTIVE' then
    raise exception 'live Chatwoot Account mapping requires ACTIVE tenant Business';
  end if;

  if new.status <> 'ARCHIVED'
     and not exists (
       select 1
       from public.communication_channel_bindings cb
       where cb.organization_id = new.organization_id
         and cb.tenant_business_id = new.tenant_business_id
         and cb.status = 'ACTIVE'
     )
  then
    raise exception 'live Chatwoot Account mapping requires an ACTIVE communication binding';
  end if;

  if new.status = 'ACTIVE' and new.chatwoot_account_id is null then
    raise exception 'ACTIVE Chatwoot Account mapping requires external Account ID';
  end if;

  if new.status = 'DEGRADED' and new.last_error_code is null then
    raise exception 'DEGRADED Chatwoot Account mapping requires bounded error code';
  end if;

  if new.status = 'ACTIVE' then
    new.last_error_code := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.enforce_tenant_business_chatwoot_bridge_archive()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if old.status = 'ACTIVE' and new.status = 'ARCHIVED' then
    if exists (
      select 1
      from public.communication_channel_bindings cb
      where cb.organization_id = old.organization_id
        and cb.tenant_business_id = old.id
        and cb.status = 'ACTIVE'
    ) or exists (
      select 1
      from public.chatwoot_account_mappings cam
      where cam.organization_id = old.organization_id
        and cam.tenant_business_id = old.id
        and cam.status in ('PROVISIONING','ACTIVE','DEGRADED')
    ) then
      raise exception 'archive Chatwoot bridge resources before tenant Business';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_branch_chatwoot_bridge_archive()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if old.status = 'ACTIVE' and new.status = 'ARCHIVED'
     and exists (
       select 1
       from public.communication_channel_bindings cb
       where cb.organization_id = old.organization_id
         and cb.branch_id = old.id
         and cb.status = 'ACTIVE'
     )
  then
    raise exception 'archive communication binding before Branch';
  end if;
  return new;
end;
$$;

create or replace function public.audit_chatwoot_bridge_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_action text;
  v_tenant_business_id uuid;
  v_branch_id uuid;
begin
  if tg_table_name = 'communication_channel_bindings' then
    v_tenant_business_id := new.tenant_business_id;
    v_branch_id := new.branch_id;
    v_before := case when tg_op = 'UPDATE' then jsonb_build_object(
      'status', old.status,
      'version', old.version,
      'channel', old.channel,
      'integration_connection_id', old.integration_connection_id
    ) else null end;
    v_after := jsonb_build_object(
      'status', new.status,
      'version', new.version,
      'channel', new.channel,
      'integration_connection_id', new.integration_connection_id,
      'last_verified_at', new.last_verified_at,
      'last_error_code', new.last_error_code
    );
    v_action := case
      when tg_op = 'INSERT' then 'COMMUNICATION_CHANNEL_BINDING_CREATED'
      when old.status <> new.status and new.status = 'ARCHIVED'
        then 'COMMUNICATION_CHANNEL_BINDING_ARCHIVED'
      when old.status <> new.status and new.status = 'ACTIVE'
        then 'COMMUNICATION_CHANNEL_BINDING_REACTIVATED'
      else 'COMMUNICATION_CHANNEL_BINDING_UPDATED'
    end;
  else
    v_tenant_business_id := new.tenant_business_id;
    v_branch_id := null;
    v_before := case when tg_op = 'UPDATE' then jsonb_build_object(
      'status', old.status,
      'version', old.version,
      'chatwoot_account_id', old.chatwoot_account_id
    ) else null end;
    v_after := jsonb_build_object(
      'status', new.status,
      'version', new.version,
      'chatwoot_account_id', new.chatwoot_account_id,
      'last_verified_at', new.last_verified_at,
      'last_error_code', new.last_error_code
    );
    v_action := case
      when tg_op = 'INSERT' then 'CHATWOOT_ACCOUNT_MAPPING_CREATED'
      when old.status <> new.status and new.status = 'ACTIVE'
        then 'CHATWOOT_ACCOUNT_MAPPING_ACTIVATED'
      when old.status <> new.status and new.status = 'DEGRADED'
        then 'CHATWOOT_ACCOUNT_MAPPING_DEGRADED'
      when old.status <> new.status and new.status = 'ARCHIVED'
        then 'CHATWOOT_ACCOUNT_MAPPING_ARCHIVED'
      else 'CHATWOOT_ACCOUNT_MAPPING_UPDATED'
    end;
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
    tenant_business_id,
    branch_id,
    correlation_id
  ) values (
    new.organization_id,
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    coalesce(v_actor::text, current_user),
    v_action,
    tg_table_name,
    new.id::text,
    v_before,
    v_after,
    v_tenant_business_id,
    v_branch_id,
    'dbtx:' || txid_current()::text
  );

  return new;
end;
$$;

drop trigger if exists tenant_businesses_chatwoot_bridge_archive_guard
  on public.tenant_businesses;
create trigger tenant_businesses_chatwoot_bridge_archive_guard
before update of status on public.tenant_businesses
for each row execute function public.enforce_tenant_business_chatwoot_bridge_archive();

drop trigger if exists branches_chatwoot_bridge_archive_guard
  on public.branches;
create trigger branches_chatwoot_bridge_archive_guard
before update of status on public.branches
for each row execute function public.enforce_branch_chatwoot_bridge_archive();

drop trigger if exists chatwoot_bridge_command_claims_insert_guard
  on public.chatwoot_bridge_command_claims;
create trigger chatwoot_bridge_command_claims_insert_guard
before insert or update or delete on public.chatwoot_bridge_command_claims
for each row execute function public.enforce_chatwoot_bridge_claim_insert();

drop trigger if exists communication_channel_bindings_command_guard
  on public.communication_channel_bindings;
create trigger communication_channel_bindings_command_guard
before insert or update or delete on public.communication_channel_bindings
for each row execute function public.enforce_chatwoot_bridge_command_path();

drop trigger if exists communication_channel_bindings_contract_guard
  on public.communication_channel_bindings;
create trigger communication_channel_bindings_contract_guard
before insert or update on public.communication_channel_bindings
for each row execute function public.enforce_communication_channel_binding_contract();

drop trigger if exists communication_channel_bindings_audit
  on public.communication_channel_bindings;
create trigger communication_channel_bindings_audit
after insert or update on public.communication_channel_bindings
for each row execute function public.audit_chatwoot_bridge_mutation();

drop trigger if exists chatwoot_account_mappings_command_guard
  on public.chatwoot_account_mappings;
create trigger chatwoot_account_mappings_command_guard
before insert or update or delete on public.chatwoot_account_mappings
for each row execute function public.enforce_chatwoot_bridge_command_path();

drop trigger if exists chatwoot_account_mappings_contract_guard
  on public.chatwoot_account_mappings;
create trigger chatwoot_account_mappings_contract_guard
before insert or update on public.chatwoot_account_mappings
for each row execute function public.enforce_chatwoot_account_mapping_contract();

drop trigger if exists chatwoot_account_mappings_audit
  on public.chatwoot_account_mappings;
create trigger chatwoot_account_mappings_audit
after insert or update on public.chatwoot_account_mappings
for each row execute function public.audit_chatwoot_bridge_mutation();

create or replace function public.create_communication_channel_binding(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_integration_connection_id uuid,
  p_channel text,
  p_request_key text
)
returns public.communication_channel_bindings
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_created public.communication_channel_bindings%rowtype;
  v_existing public.communication_channel_bindings%rowtype;
  v_claim record;
  v_actor uuid := auth.uid();
  v_channel text := upper(trim(coalesce(p_channel, '')));
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_payload_hash text;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot bridge mutation not permitted';
  end if;

  if length(v_request_key) not between 1 and 200 then
    raise exception 'request key must contain 1..200 characters';
  end if;

  if v_channel not in ('EMAIL','WHATSAPP') then
    raise exception 'unsupported communication channel';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'branchId', p_branch_id,
    'integrationConnectionId', p_integration_connection_id,
    'channel', v_channel
  )::text, 'sha256'), 'hex');

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'CREATE_CHANNEL_BINDING',
      'COMMUNICATION_CHANNEL_BINDING',
      null,
      1,
      v_payload_hash
    );

  if not v_claim.is_new then
    select *
      into v_existing
      from public.communication_channel_bindings
     where organization_id = p_organization_id
       and id = v_claim.entity_id;

    if not found then
      raise exception 'Chatwoot bridge command claim has no binding row';
    end if;

    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_existing;
  end if;

  insert into public.communication_channel_bindings(
    id,
    organization_id,
    tenant_business_id,
    branch_id,
    integration_connection_id,
    channel,
    status,
    version,
    last_request_key,
    last_verified_at,
    created_by_user_id,
    updated_by_user_id
  ) values (
    v_claim.entity_id,
    p_organization_id,
    p_tenant_business_id,
    p_branch_id,
    p_integration_connection_id,
    v_channel,
    'ACTIVE',
    1,
    v_request_key,
    now(),
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

create or replace function public.set_communication_channel_binding_lifecycle(
  p_organization_id uuid,
  p_binding_id uuid,
  p_expected_version integer,
  p_status text,
  p_request_key text
)
returns public.communication_channel_bindings
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_current public.communication_channel_bindings%rowtype;
  v_updated public.communication_channel_bindings%rowtype;
  v_claim record;
  v_actor uuid := auth.uid();
  v_status text := upper(trim(coalesce(p_status, '')));
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_payload_hash text;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot bridge mutation not permitted';
  end if;

  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'expected version must be positive';
  end if;

  if v_status not in ('ACTIVE','ARCHIVED') then
    raise exception 'invalid communication binding lifecycle';
  end if;

  if length(v_request_key) not between 1 and 200 then
    raise exception 'request key must contain 1..200 characters';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'bindingId', p_binding_id,
    'expectedVersion', p_expected_version,
    'status', v_status
  )::text, 'sha256'), 'hex');

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'SET_CHANNEL_BINDING_LIFECYCLE',
      'COMMUNICATION_CHANNEL_BINDING',
      p_binding_id,
      p_expected_version + 1,
      v_payload_hash
    );

  if not v_claim.is_new then
    select *
      into v_current
      from public.communication_channel_bindings
     where organization_id = p_organization_id
       and id = p_binding_id;

    if not found then
      raise exception 'communication binding not found';
    end if;

    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_current;
  end if;

  select *
    into v_current
    from public.communication_channel_bindings
   where organization_id = p_organization_id
     and id = p_binding_id
   for update;

  if not found then
    raise exception 'communication binding not found';
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'communication binding version conflict; current version is %', v_current.version;
  end if;

  update public.communication_channel_bindings
     set status = v_status,
         version = version + 1,
         last_request_key = v_request_key,
         updated_by_user_id = v_actor,
         last_verified_at = case when v_status = 'ACTIVE' then now() else last_verified_at end,
         last_error_code = case when v_status = 'ACTIVE' then null else last_error_code end
   where organization_id = p_organization_id
     and id = p_binding_id
  returning * into v_updated;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_updated;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

create or replace function public.create_chatwoot_account_mapping(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_request_key text
)
returns public.chatwoot_account_mappings
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_created public.chatwoot_account_mappings%rowtype;
  v_existing public.chatwoot_account_mappings%rowtype;
  v_claim record;
  v_actor uuid := auth.uid();
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_payload_hash text;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot bridge mutation not permitted';
  end if;

  if length(v_request_key) not between 1 and 200 then
    raise exception 'request key must contain 1..200 characters';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id
  )::text, 'sha256'), 'hex');

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'CREATE_ACCOUNT_MAPPING',
      'CHATWOOT_ACCOUNT_MAPPING',
      null,
      1,
      v_payload_hash
    );

  if not v_claim.is_new then
    select *
      into v_existing
      from public.chatwoot_account_mappings
     where organization_id = p_organization_id
       and id = v_claim.entity_id;

    if not found then
      raise exception 'Chatwoot bridge command claim has no Account mapping row';
    end if;

    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_existing;
  end if;

  if not exists (
    select 1
    from public.communication_channel_bindings cb
    where cb.organization_id = p_organization_id
      and cb.tenant_business_id = p_tenant_business_id
      and cb.status = 'ACTIVE'
  ) then
    raise exception 'Chatwoot Account mapping requires ACTIVE communication binding';
  end if;

  insert into public.chatwoot_account_mappings(
    id,
    organization_id,
    tenant_business_id,
    status,
    version,
    last_request_key,
    created_by_user_id,
    updated_by_user_id
  ) values (
    v_claim.entity_id,
    p_organization_id,
    p_tenant_business_id,
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

create or replace function public.set_chatwoot_account_mapping_state(
  p_organization_id uuid,
  p_mapping_id uuid,
  p_expected_version integer,
  p_status text,
  p_chatwoot_account_id integer,
  p_last_error_code text,
  p_request_key text
)
returns public.chatwoot_account_mappings
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_current public.chatwoot_account_mappings%rowtype;
  v_updated public.chatwoot_account_mappings%rowtype;
  v_claim record;
  v_actor uuid := auth.uid();
  v_status text := upper(trim(coalesce(p_status, '')));
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_error_code text := nullif(upper(trim(coalesce(p_last_error_code, ''))), '');
  v_account_id integer;
  v_payload_hash text;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot bridge mutation not permitted';
  end if;

  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'expected version must be positive';
  end if;

  if v_status not in ('PROVISIONING','ACTIVE','DEGRADED','ARCHIVED') then
    raise exception 'invalid Chatwoot Account mapping state';
  end if;

  if p_chatwoot_account_id is not null and p_chatwoot_account_id <= 0 then
    raise exception 'Chatwoot Account ID must be positive';
  end if;

  if v_error_code is not null
     and (length(v_error_code) > 120 or v_error_code !~ '^[A-Z0-9_:.-]+$')
  then
    raise exception 'last error code is invalid';
  end if;

  if length(v_request_key) not between 1 and 200 then
    raise exception 'request key must contain 1..200 characters';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'mappingId', p_mapping_id,
    'expectedVersion', p_expected_version,
    'status', v_status,
    'chatwootAccountId', p_chatwoot_account_id,
    'lastErrorCode', v_error_code
  )::text, 'sha256'), 'hex');

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'SET_ACCOUNT_MAPPING_STATE',
      'CHATWOOT_ACCOUNT_MAPPING',
      p_mapping_id,
      p_expected_version + 1,
      v_payload_hash
    );

  if not v_claim.is_new then
    select *
      into v_current
      from public.chatwoot_account_mappings
     where organization_id = p_organization_id
       and id = p_mapping_id;

    if not found then
      raise exception 'Chatwoot Account mapping not found';
    end if;

    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_current;
  end if;

  select *
    into v_current
    from public.chatwoot_account_mappings
   where organization_id = p_organization_id
     and id = p_mapping_id
   for update;

  if not found then
    raise exception 'Chatwoot Account mapping not found';
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'Chatwoot Account mapping version conflict; current version is %', v_current.version;
  end if;

  if v_current.chatwoot_account_id is not null
     and p_chatwoot_account_id is not null
     and v_current.chatwoot_account_id <> p_chatwoot_account_id
  then
    raise exception 'Chatwoot Account ID cannot be replaced in-place';
  end if;

  v_account_id := coalesce(v_current.chatwoot_account_id, p_chatwoot_account_id);

  if v_status = 'ACTIVE' and v_account_id is null then
    raise exception 'ACTIVE Chatwoot Account mapping requires external Account ID';
  end if;

  if v_status = 'DEGRADED' and v_error_code is null then
    raise exception 'DEGRADED Chatwoot Account mapping requires error code';
  end if;

  update public.chatwoot_account_mappings
     set chatwoot_account_id = v_account_id,
         status = v_status,
         version = version + 1,
         last_request_key = v_request_key,
         last_verified_at = case when v_status = 'ACTIVE' then now() else last_verified_at end,
         last_error_code = case when v_status = 'ACTIVE' then null else v_error_code end,
         updated_by_user_id = v_actor
   where organization_id = p_organization_id
     and id = p_mapping_id
  returning * into v_updated;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_updated;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

alter table public.chatwoot_bridge_command_claims enable row level security;
alter table public.communication_channel_bindings enable row level security;
alter table public.chatwoot_account_mappings enable row level security;

create policy chatwoot_bridge_command_claims_admin_read
  on public.chatwoot_bridge_command_claims
  for select to authenticated
  using (public.chatwoot_bridge_can_read(organization_id));

create policy chatwoot_bridge_command_claims_owner_insert
  on public.chatwoot_bridge_command_claims
  for insert to authenticated
  with check (public.chatwoot_bridge_can_manage(organization_id));

create policy communication_channel_bindings_admin_read
  on public.communication_channel_bindings
  for select to authenticated
  using (public.chatwoot_bridge_can_read(organization_id));

create policy communication_channel_bindings_owner_insert
  on public.communication_channel_bindings
  for insert to authenticated
  with check (public.chatwoot_bridge_can_manage(organization_id));

create policy communication_channel_bindings_owner_update
  on public.communication_channel_bindings
  for update to authenticated
  using (public.chatwoot_bridge_can_manage(organization_id))
  with check (public.chatwoot_bridge_can_manage(organization_id));

create policy chatwoot_account_mappings_admin_read
  on public.chatwoot_account_mappings
  for select to authenticated
  using (public.chatwoot_bridge_can_read(organization_id));

create policy chatwoot_account_mappings_owner_insert
  on public.chatwoot_account_mappings
  for insert to authenticated
  with check (public.chatwoot_bridge_can_manage(organization_id));

create policy chatwoot_account_mappings_owner_update
  on public.chatwoot_account_mappings
  for update to authenticated
  using (public.chatwoot_bridge_can_manage(organization_id))
  with check (public.chatwoot_bridge_can_manage(organization_id));

revoke all on table public.chatwoot_bridge_command_claims,
  public.communication_channel_bindings,
  public.chatwoot_account_mappings
from anon, authenticated, service_role;

grant select, insert on table public.chatwoot_bridge_command_claims
to authenticated;

grant select, insert, update on table public.communication_channel_bindings,
  public.chatwoot_account_mappings
to authenticated;

grant select on table public.chatwoot_bridge_command_claims,
  public.communication_channel_bindings,
  public.chatwoot_account_mappings
to service_role;

revoke all on function public.chatwoot_bridge_can_read(uuid)
  from public, anon, authenticated;
revoke all on function public.chatwoot_bridge_can_manage(uuid)
  from public, anon, authenticated;
grant execute on function public.chatwoot_bridge_can_read(uuid)
  to authenticated;
grant execute on function public.chatwoot_bridge_can_manage(uuid)
  to authenticated;

revoke all on function public.enforce_chatwoot_bridge_claim_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.claim_chatwoot_bridge_command(
  uuid, text, text, text, uuid, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.claim_chatwoot_bridge_command(
  uuid, text, text, text, uuid, integer, text
) to authenticated;

revoke all on function public.enforce_chatwoot_bridge_command_path()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_communication_channel_binding_contract()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_chatwoot_account_mapping_contract()
  from public, anon, authenticated, service_role;
revoke all on function public.audit_chatwoot_bridge_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_tenant_business_chatwoot_bridge_archive()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_branch_chatwoot_bridge_archive()
  from public, anon, authenticated, service_role;

revoke all on function public.create_communication_channel_binding(
  uuid, uuid, uuid, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_communication_channel_binding(
  uuid, uuid, uuid, uuid, text, text
) to authenticated;

revoke all on function public.set_communication_channel_binding_lifecycle(
  uuid, uuid, integer, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.set_communication_channel_binding_lifecycle(
  uuid, uuid, integer, text, text
) to authenticated;

revoke all on function public.create_chatwoot_account_mapping(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_chatwoot_account_mapping(
  uuid, uuid, text
) to authenticated;

revoke all on function public.set_chatwoot_account_mapping_state(
  uuid, uuid, integer, text, integer, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.set_chatwoot_account_mapping_state(
  uuid, uuid, integer, text, integer, text, text
) to authenticated;
