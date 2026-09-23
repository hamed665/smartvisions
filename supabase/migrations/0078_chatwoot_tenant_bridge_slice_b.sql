-- Smart Visions AI Business OS 2027
-- SECTION COMMUNICATION / COMM-TENANT-BRIDGE / Slice B
--
-- Scope:
-- - Chatwoot User projection
-- - tenant-Business AccountUser membership projection
-- - API Inbox projection
-- - Team projection
-- - server-only mapping tables
-- - no live Chatwoot HTTP calls
-- - no provider credential storage
-- - no provider send
-- - no Contact/Conversation projection

alter table public.chatwoot_bridge_command_claims
  drop constraint if exists chatwoot_bridge_command_claims_command_type_check;

alter table public.chatwoot_bridge_command_claims
  add constraint chatwoot_bridge_command_claims_command_type_check
  check (command_type in (
    'CREATE_CHANNEL_BINDING',
    'SET_CHANNEL_BINDING_LIFECYCLE',
    'CREATE_ACCOUNT_MAPPING',
    'SET_ACCOUNT_MAPPING_STATE',
    'CREATE_USER_MAPPING',
    'SET_USER_MAPPING_STATE',
    'CREATE_ACCOUNT_MEMBERSHIP',
    'SET_ACCOUNT_MEMBERSHIP_STATE',
    'CREATE_INBOX_MAPPING',
    'SET_INBOX_MAPPING_STATE',
    'CREATE_TEAM_MAPPING',
    'SET_TEAM_MAPPING_STATE'
  ));

alter table public.chatwoot_bridge_command_claims
  drop constraint if exists chatwoot_bridge_command_claims_entity_type_check;

alter table public.chatwoot_bridge_command_claims
  add constraint chatwoot_bridge_command_claims_entity_type_check
  check (entity_type in (
    'COMMUNICATION_CHANNEL_BINDING',
    'CHATWOOT_ACCOUNT_MAPPING',
    'CHATWOOT_USER_MAPPING',
    'CHATWOOT_ACCOUNT_MEMBERSHIP',
    'CHATWOOT_INBOX_MAPPING',
    'CHATWOOT_TEAM_MAPPING'
  ));

create table if not exists public.chatwoot_user_mappings (
  id uuid primary key default gen_random_uuid(),
  smart_user_id uuid not null references auth.users(id) on delete restrict,
  chatwoot_user_id integer check (chatwoot_user_id is null or chatwoot_user_id > 0),
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
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chatwoot_user_mappings_one_live_per_smart_user
  on public.chatwoot_user_mappings(smart_user_id)
  where status in ('PROVISIONING','ACTIVE','DEGRADED');

create unique index if not exists chatwoot_user_mappings_external_user_unique
  on public.chatwoot_user_mappings(chatwoot_user_id)
  where chatwoot_user_id is not null
    and status in ('PROVISIONING','ACTIVE','DEGRADED');

create table if not exists public.chatwoot_account_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  smart_user_id uuid not null references auth.users(id) on delete restrict,
  chatwoot_user_mapping_id uuid not null references public.chatwoot_user_mappings(id) on delete restrict,
  chatwoot_account_mapping_id uuid not null,
  chatwoot_account_user_id bigint check (
    chatwoot_account_user_id is null or chatwoot_account_user_id > 0
  ),
  effective_smart_role text not null check (
    effective_smart_role in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT')
  ),
  chatwoot_role text not null check (chatwoot_role in ('administrator','agent')),
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
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),

  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict,
  foreign key (organization_id, chatwoot_account_mapping_id)
    references public.chatwoot_account_mappings(organization_id, id)
    on delete restrict
);

create unique index if not exists chatwoot_account_memberships_one_live_per_user_business
  on public.chatwoot_account_memberships(
    organization_id, tenant_business_id, smart_user_id
  )
  where status in ('PROVISIONING','ACTIVE','DEGRADED');

create unique index if not exists chatwoot_account_memberships_external_unique
  on public.chatwoot_account_memberships(chatwoot_account_user_id)
  where chatwoot_account_user_id is not null
    and status in ('PROVISIONING','ACTIVE','DEGRADED');

create index if not exists chatwoot_account_memberships_account_fk_idx
  on public.chatwoot_account_memberships(organization_id, chatwoot_account_mapping_id);

create index if not exists chatwoot_account_memberships_user_map_idx
  on public.chatwoot_account_memberships(chatwoot_user_mapping_id);

create table if not exists public.chatwoot_inbox_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  branch_id uuid references public.branches(id) on delete restrict,
  communication_channel_binding_id uuid not null,
  chatwoot_account_mapping_id uuid not null,
  chatwoot_inbox_id integer check (chatwoot_inbox_id is null or chatwoot_inbox_id > 0),
  chatwoot_channel_identifier text check (
    chatwoot_channel_identifier is null
    or length(chatwoot_channel_identifier) between 1 and 128
  ),
  channel_type text not null default 'Channel::Api'
    check (channel_type = 'Channel::Api'),
  webhook_secret_ref text check (
    webhook_secret_ref is null
    or length(trim(webhook_secret_ref)) between 1 and 240
  ),
  hmac_token_ref text check (
    hmac_token_ref is null
    or length(trim(hmac_token_ref)) between 1 and 240
  ),
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
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),

  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict,
  foreign key (organization_id, communication_channel_binding_id)
    references public.communication_channel_bindings(organization_id, id)
    on delete restrict,
  foreign key (organization_id, chatwoot_account_mapping_id)
    references public.chatwoot_account_mappings(organization_id, id)
    on delete restrict
);

create unique index if not exists chatwoot_inbox_mappings_one_live_per_channel_binding
  on public.chatwoot_inbox_mappings(organization_id, communication_channel_binding_id)
  where status in ('PROVISIONING','ACTIVE','DEGRADED');

create unique index if not exists chatwoot_inbox_mappings_external_unique
  on public.chatwoot_inbox_mappings(chatwoot_inbox_id)
  where chatwoot_inbox_id is not null
    and status in ('PROVISIONING','ACTIVE','DEGRADED');

create index if not exists chatwoot_inbox_mappings_account_idx
  on public.chatwoot_inbox_mappings(organization_id, chatwoot_account_mapping_id);

create index if not exists chatwoot_inbox_mappings_branch_idx
  on public.chatwoot_inbox_mappings(organization_id, branch_id)
  where branch_id is not null;

create table if not exists public.chatwoot_team_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  smart_team_id uuid not null references public.teams(id) on delete restrict,
  chatwoot_account_mapping_id uuid not null,
  chatwoot_team_id bigint check (chatwoot_team_id is null or chatwoot_team_id > 0),
  projected_name text not null check (length(trim(projected_name)) between 1 and 255),
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
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),

  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict,
  foreign key (organization_id, chatwoot_account_mapping_id)
    references public.chatwoot_account_mappings(organization_id, id)
    on delete restrict
);

create unique index if not exists chatwoot_team_mappings_one_live_per_smart_team
  on public.chatwoot_team_mappings(organization_id, smart_team_id)
  where status in ('PROVISIONING','ACTIVE','DEGRADED');

create unique index if not exists chatwoot_team_mappings_external_unique
  on public.chatwoot_team_mappings(chatwoot_team_id)
  where chatwoot_team_id is not null
    and status in ('PROVISIONING','ACTIVE','DEGRADED');

create index if not exists chatwoot_team_mappings_account_idx
  on public.chatwoot_team_mappings(organization_id, chatwoot_account_mapping_id);

create or replace function public.enforce_chatwoot_user_mapping_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
begin
  if tg_op = 'UPDATE' then
    if new.smart_user_id is distinct from old.smart_user_id
       or new.created_by_user_id is distinct from old.created_by_user_id
    then
      raise exception 'Chatwoot User mapping identity is immutable';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'Chatwoot User mapping version must increment by exactly one';
    end if;

    if new.last_request_key = old.last_request_key then
      raise exception 'Chatwoot User mapping update requires a new request key';
    end if;

    if old.chatwoot_user_id is not null
       and new.chatwoot_user_id is distinct from old.chatwoot_user_id
    then
      raise exception 'Chatwoot User ID is immutable once adopted';
    end if;

    if old.status = 'ARCHIVED' then
      raise exception 'ARCHIVED Chatwoot User mapping is terminal';
    end if;
  elsif new.version <> 1 or new.status <> 'PROVISIONING' then
    raise exception 'new Chatwoot User mapping must start PROVISIONING at version 1';
  end if;

  if new.status = 'ACTIVE' then
    if new.chatwoot_user_id is null or new.last_verified_at is null then
      raise exception 'ACTIVE Chatwoot User mapping requires verified external User';
    end if;
    new.last_error_code := null;
  elsif new.status = 'DEGRADED' and new.last_error_code is null then
    raise exception 'DEGRADED Chatwoot User mapping requires bounded error code';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.enforce_chatwoot_account_membership_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_mapping public.chatwoot_user_mappings%rowtype;
  v_account_mapping public.chatwoot_account_mappings%rowtype;
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

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = new.organization_id
      and m.user_id = new.smart_user_id
  ) then
    raise exception 'Smart user is not an Organization member';
  end if;

  if new.effective_smart_role = 'OWNER' and new.chatwoot_role <> 'administrator' then
    raise exception 'OWNER must project to Chatwoot administrator';
  elsif new.effective_smart_role in ('ADMIN','SALES_MANAGER','SALES_AGENT')
        and new.chatwoot_role <> 'agent'
  then
    raise exception 'non-OWNER Smart role must project to Chatwoot agent';
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

create or replace function public.enforce_chatwoot_inbox_mapping_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_binding public.communication_channel_bindings%rowtype;
  v_account_mapping public.chatwoot_account_mappings%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.tenant_business_id is distinct from old.tenant_business_id
       or new.branch_id is distinct from old.branch_id
       or new.communication_channel_binding_id is distinct from old.communication_channel_binding_id
       or new.chatwoot_account_mapping_id is distinct from old.chatwoot_account_mapping_id
       or new.channel_type is distinct from old.channel_type
       or new.created_by_user_id is distinct from old.created_by_user_id
    then
      raise exception 'Chatwoot Inbox mapping scope is immutable';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'Chatwoot Inbox mapping version must increment by exactly one';
    end if;

    if new.last_request_key = old.last_request_key then
      raise exception 'Chatwoot Inbox mapping update requires a new request key';
    end if;

    if old.chatwoot_inbox_id is not null
       and new.chatwoot_inbox_id is distinct from old.chatwoot_inbox_id
    then
      raise exception 'Chatwoot Inbox ID is immutable once adopted';
    end if;

    if old.chatwoot_channel_identifier is not null
       and new.chatwoot_channel_identifier is distinct from old.chatwoot_channel_identifier
    then
      raise exception 'Chatwoot API channel identifier is immutable once adopted';
    end if;

    if old.status = 'ARCHIVED' then
      raise exception 'ARCHIVED Chatwoot Inbox mapping is terminal';
    end if;
  elsif new.version <> 1 or new.status <> 'PROVISIONING' then
    raise exception 'new Chatwoot Inbox mapping must start PROVISIONING at version 1';
  end if;

  select * into v_binding
  from public.communication_channel_bindings
  where organization_id = new.organization_id
    and id = new.communication_channel_binding_id;

  if not found
     or v_binding.tenant_business_id <> new.tenant_business_id
     or v_binding.branch_id is distinct from new.branch_id
  then
    raise exception 'communication binding does not match Chatwoot Inbox scope';
  end if;

  select * into v_account_mapping
  from public.chatwoot_account_mappings
  where organization_id = new.organization_id
    and id = new.chatwoot_account_mapping_id;

  if not found
     or v_account_mapping.tenant_business_id <> new.tenant_business_id
  then
    raise exception 'Chatwoot Account mapping does not match Inbox tenant Business';
  end if;

  if new.status <> 'ARCHIVED' then
    if v_binding.status <> 'ACTIVE' then
      raise exception 'live Chatwoot Inbox mapping requires ACTIVE communication binding';
    end if;
    if v_account_mapping.status <> 'ACTIVE' then
      raise exception 'live Chatwoot Inbox mapping requires ACTIVE Account mapping';
    end if;
  end if;

  if new.status = 'ACTIVE' then
    if new.chatwoot_inbox_id is null
       or new.chatwoot_channel_identifier is null
       or new.webhook_secret_ref is null
       or new.hmac_token_ref is null
       or new.last_verified_at is null
    then
      raise exception 'ACTIVE Chatwoot Inbox mapping requires verified API Inbox and secret references';
    end if;
    new.last_error_code := null;
  elsif new.status = 'DEGRADED' and new.last_error_code is null then
    raise exception 'DEGRADED Chatwoot Inbox mapping requires bounded error code';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.enforce_chatwoot_team_mapping_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_account_mapping public.chatwoot_account_mappings%rowtype;
  v_team_org uuid;
  v_team_business uuid;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.tenant_business_id is distinct from old.tenant_business_id
       or new.smart_team_id is distinct from old.smart_team_id
       or new.chatwoot_account_mapping_id is distinct from old.chatwoot_account_mapping_id
       or new.created_by_user_id is distinct from old.created_by_user_id
    then
      raise exception 'Chatwoot Team mapping scope is immutable';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'Chatwoot Team mapping version must increment by exactly one';
    end if;

    if new.last_request_key = old.last_request_key then
      raise exception 'Chatwoot Team mapping update requires a new request key';
    end if;

    if old.chatwoot_team_id is not null
       and new.chatwoot_team_id is distinct from old.chatwoot_team_id
    then
      raise exception 'Chatwoot Team ID is immutable once adopted';
    end if;

    if old.status = 'ARCHIVED' then
      raise exception 'ARCHIVED Chatwoot Team mapping is terminal';
    end if;
  elsif new.version <> 1 or new.status <> 'PROVISIONING' then
    raise exception 'new Chatwoot Team mapping must start PROVISIONING at version 1';
  end if;

  select t.organization_id, br.tenant_business_id
    into v_team_org, v_team_business
  from public.teams t
  join public.departments d
    on d.organization_id = t.organization_id
   and d.id = t.department_id
  join public.branches br
    on br.organization_id = d.organization_id
   and br.id = d.branch_id
  where t.id = new.smart_team_id;

  if not found
     or v_team_org <> new.organization_id
     or v_team_business <> new.tenant_business_id
  then
    raise exception 'Smart Team lineage does not match tenant Business';
  end if;

  select * into v_account_mapping
  from public.chatwoot_account_mappings
  where organization_id = new.organization_id
    and id = new.chatwoot_account_mapping_id;

  if not found
     or v_account_mapping.tenant_business_id <> new.tenant_business_id
  then
    raise exception 'Chatwoot Account mapping does not match Team tenant Business';
  end if;

  if new.status <> 'ARCHIVED'
     and v_account_mapping.status <> 'ACTIVE'
  then
    raise exception 'live Chatwoot Team mapping requires ACTIVE Account mapping';
  end if;

  if new.status = 'ACTIVE' then
    if new.chatwoot_team_id is null or new.last_verified_at is null then
      raise exception 'ACTIVE Chatwoot Team mapping requires verified external Team';
    end if;
    new.last_error_code := null;
  elsif new.status = 'DEGRADED' and new.last_error_code is null then
    raise exception 'DEGRADED Chatwoot Team mapping requires bounded error code';
  end if;

  new.projected_name := trim(new.projected_name);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.audit_chatwoot_slice_b_mapping_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_action text;
  v_org uuid;
  v_business uuid;
begin
  if tg_table_name = 'chatwoot_user_mappings' then
    v_org := null;
    v_business := null;
    v_before := case when tg_op='UPDATE' then jsonb_build_object(
      'status',old.status,
      'version',old.version,
      'chatwoot_user_id',old.chatwoot_user_id
    ) else null end;
    v_after := jsonb_build_object(
      'status',new.status,
      'version',new.version,
      'chatwoot_user_id',new.chatwoot_user_id,
      'last_verified_at',new.last_verified_at,
      'last_error_code',new.last_error_code
    );
    v_action := 'CHATWOOT_USER_MAPPING_' || case
      when tg_op='INSERT' then 'CREATED'
      when new.status='ACTIVE' and old.status is distinct from new.status then 'ACTIVATED'
      when new.status='DEGRADED' and old.status is distinct from new.status then 'DEGRADED'
      when new.status='ARCHIVED' and old.status is distinct from new.status then 'ARCHIVED'
      else 'UPDATED'
    end;
  elsif tg_table_name = 'chatwoot_account_memberships' then
    v_org := new.organization_id;
    v_business := new.tenant_business_id;
    v_before := case when tg_op='UPDATE' then jsonb_build_object(
      'status',old.status,
      'version',old.version,
      'chatwoot_account_user_id',old.chatwoot_account_user_id,
      'effective_smart_role',old.effective_smart_role,
      'chatwoot_role',old.chatwoot_role
    ) else null end;
    v_after := jsonb_build_object(
      'status',new.status,
      'version',new.version,
      'chatwoot_account_user_id',new.chatwoot_account_user_id,
      'effective_smart_role',new.effective_smart_role,
      'chatwoot_role',new.chatwoot_role,
      'last_verified_at',new.last_verified_at,
      'last_error_code',new.last_error_code
    );
    v_action := 'CHATWOOT_ACCOUNT_MEMBERSHIP_' || case
      when tg_op='INSERT' then 'CREATED'
      when new.status='ACTIVE' and old.status is distinct from new.status then 'ACTIVATED'
      when new.status='DEGRADED' and old.status is distinct from new.status then 'DEGRADED'
      when new.status='ARCHIVED' and old.status is distinct from new.status then 'ARCHIVED'
      else 'UPDATED'
    end;
  elsif tg_table_name = 'chatwoot_inbox_mappings' then
    v_org := new.organization_id;
    v_business := new.tenant_business_id;
    v_before := case when tg_op='UPDATE' then jsonb_build_object(
      'status',old.status,
      'version',old.version,
      'chatwoot_inbox_id',old.chatwoot_inbox_id
    ) else null end;
    v_after := jsonb_build_object(
      'status',new.status,
      'version',new.version,
      'chatwoot_inbox_id',new.chatwoot_inbox_id,
      'chatwoot_channel_identifier',new.chatwoot_channel_identifier,
      'last_verified_at',new.last_verified_at,
      'last_error_code',new.last_error_code
    );
    v_action := 'CHATWOOT_INBOX_MAPPING_' || case
      when tg_op='INSERT' then 'CREATED'
      when new.status='ACTIVE' and old.status is distinct from new.status then 'ACTIVATED'
      when new.status='DEGRADED' and old.status is distinct from new.status then 'DEGRADED'
      when new.status='ARCHIVED' and old.status is distinct from new.status then 'ARCHIVED'
      else 'UPDATED'
    end;
  else
    v_org := new.organization_id;
    v_business := new.tenant_business_id;
    v_before := case when tg_op='UPDATE' then jsonb_build_object(
      'status',old.status,
      'version',old.version,
      'chatwoot_team_id',old.chatwoot_team_id,
      'projected_name',old.projected_name
    ) else null end;
    v_after := jsonb_build_object(
      'status',new.status,
      'version',new.version,
      'chatwoot_team_id',new.chatwoot_team_id,
      'projected_name',new.projected_name,
      'last_verified_at',new.last_verified_at,
      'last_error_code',new.last_error_code
    );
    v_action := 'CHATWOOT_TEAM_MAPPING_' || case
      when tg_op='INSERT' then 'CREATED'
      when new.status='ACTIVE' and old.status is distinct from new.status then 'ACTIVATED'
      when new.status='DEGRADED' and old.status is distinct from new.status then 'DEGRADED'
      when new.status='ARCHIVED' and old.status is distinct from new.status then 'ARCHIVED'
      else 'UPDATED'
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
    correlation_id
  ) values (
    v_org,
    case when auth.uid() is null then 'SYSTEM' else 'USER' end,
    coalesce(auth.uid()::text, current_user),
    v_action,
    tg_table_name,
    new.id::text,
    v_before,
    v_after,
    v_business,
    'dbtx:' || txid_current()::text
  );

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
      select 1 from public.communication_channel_bindings cb
      where cb.organization_id=old.organization_id
        and cb.tenant_business_id=old.id
        and cb.status='ACTIVE'
    ) or exists (
      select 1 from public.chatwoot_account_mappings cam
      where cam.organization_id=old.organization_id
        and cam.tenant_business_id=old.id
        and cam.status in ('PROVISIONING','ACTIVE','DEGRADED')
    ) or exists (
      select 1 from public.chatwoot_account_memberships cm
      where cm.organization_id=old.organization_id
        and cm.tenant_business_id=old.id
        and cm.status in ('PROVISIONING','ACTIVE','DEGRADED')
    ) or exists (
      select 1 from public.chatwoot_inbox_mappings im
      where im.organization_id=old.organization_id
        and im.tenant_business_id=old.id
        and im.status in ('PROVISIONING','ACTIVE','DEGRADED')
    ) or exists (
      select 1 from public.chatwoot_team_mappings tm
      where tm.organization_id=old.organization_id
        and tm.tenant_business_id=old.id
        and tm.status in ('PROVISIONING','ACTIVE','DEGRADED')
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
  if old.status='ACTIVE' and new.status='ARCHIVED' then
    if exists (
      select 1 from public.communication_channel_bindings cb
      where cb.organization_id=old.organization_id
        and cb.branch_id=old.id
        and cb.status='ACTIVE'
    ) or exists (
      select 1 from public.chatwoot_inbox_mappings im
      where im.organization_id=old.organization_id
        and im.branch_id=old.id
        and im.status in ('PROVISIONING','ACTIVE','DEGRADED')
    ) or exists (
      select 1
      from public.chatwoot_team_mappings tm
      join public.teams t on t.id=tm.smart_team_id
      join public.departments d on d.id=t.department_id
      where tm.organization_id=old.organization_id
        and d.branch_id=old.id
        and tm.status in ('PROVISIONING','ACTIVE','DEGRADED')
    ) then
      raise exception 'archive Chatwoot Branch projections before Branch';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_department_chatwoot_bridge_archive()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if old.status='ACTIVE' and new.status='ARCHIVED'
     and exists (
       select 1
       from public.chatwoot_team_mappings tm
       join public.teams t on t.id=tm.smart_team_id
       where tm.organization_id=old.organization_id
         and t.department_id=old.id
         and tm.status in ('PROVISIONING','ACTIVE','DEGRADED')
     )
  then
    raise exception 'archive Chatwoot Team projections before Department';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_team_chatwoot_bridge_archive()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if old.status='ACTIVE' and new.status='ARCHIVED'
     and exists (
       select 1 from public.chatwoot_team_mappings tm
       where tm.organization_id=old.organization_id
         and tm.smart_team_id=old.id
         and tm.status in ('PROVISIONING','ACTIVE','DEGRADED')
     )
  then
    raise exception 'archive Chatwoot Team mapping before Smart Team';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_organization_member_chatwoot_remove()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if exists (
    select 1 from public.chatwoot_account_memberships cm
    where cm.organization_id=old.organization_id
      and cm.smart_user_id=old.user_id
      and cm.status in ('PROVISIONING','ACTIVE','DEGRADED')
  ) then
    raise exception 'archive Chatwoot Account membership before removing Organization member';
  end if;
  return old;
end;
$$;

drop trigger if exists chatwoot_user_mappings_contract_guard
  on public.chatwoot_user_mappings;
create trigger chatwoot_user_mappings_contract_guard
before insert or update on public.chatwoot_user_mappings
for each row execute function public.enforce_chatwoot_user_mapping_contract();

drop trigger if exists chatwoot_user_mappings_audit
  on public.chatwoot_user_mappings;
create trigger chatwoot_user_mappings_audit
after insert or update on public.chatwoot_user_mappings
for each row execute function public.audit_chatwoot_slice_b_mapping_mutation();

drop trigger if exists chatwoot_account_memberships_contract_guard
  on public.chatwoot_account_memberships;
create trigger chatwoot_account_memberships_contract_guard
before insert or update on public.chatwoot_account_memberships
for each row execute function public.enforce_chatwoot_account_membership_contract();

drop trigger if exists chatwoot_account_memberships_audit
  on public.chatwoot_account_memberships;
create trigger chatwoot_account_memberships_audit
after insert or update on public.chatwoot_account_memberships
for each row execute function public.audit_chatwoot_slice_b_mapping_mutation();

drop trigger if exists chatwoot_inbox_mappings_contract_guard
  on public.chatwoot_inbox_mappings;
create trigger chatwoot_inbox_mappings_contract_guard
before insert or update on public.chatwoot_inbox_mappings
for each row execute function public.enforce_chatwoot_inbox_mapping_contract();

drop trigger if exists chatwoot_inbox_mappings_audit
  on public.chatwoot_inbox_mappings;
create trigger chatwoot_inbox_mappings_audit
after insert or update on public.chatwoot_inbox_mappings
for each row execute function public.audit_chatwoot_slice_b_mapping_mutation();

drop trigger if exists chatwoot_team_mappings_contract_guard
  on public.chatwoot_team_mappings;
create trigger chatwoot_team_mappings_contract_guard
before insert or update on public.chatwoot_team_mappings
for each row execute function public.enforce_chatwoot_team_mapping_contract();

drop trigger if exists chatwoot_team_mappings_audit
  on public.chatwoot_team_mappings;
create trigger chatwoot_team_mappings_audit
after insert or update on public.chatwoot_team_mappings
for each row execute function public.audit_chatwoot_slice_b_mapping_mutation();

drop trigger if exists departments_chatwoot_bridge_archive_guard
  on public.departments;
create trigger departments_chatwoot_bridge_archive_guard
before update of status on public.departments
for each row execute function public.enforce_department_chatwoot_bridge_archive();

drop trigger if exists teams_chatwoot_bridge_archive_guard
  on public.teams;
create trigger teams_chatwoot_bridge_archive_guard
before update of status on public.teams
for each row execute function public.enforce_team_chatwoot_bridge_archive();

drop trigger if exists organization_members_chatwoot_remove_guard
  on public.organization_members;
create trigger organization_members_chatwoot_remove_guard
before delete on public.organization_members
for each row execute function public.enforce_organization_member_chatwoot_remove();

alter table public.chatwoot_user_mappings enable row level security;
alter table public.chatwoot_account_memberships enable row level security;
alter table public.chatwoot_inbox_mappings enable row level security;
alter table public.chatwoot_team_mappings enable row level security;

revoke all on table public.chatwoot_user_mappings,
  public.chatwoot_account_memberships,
  public.chatwoot_inbox_mappings,
  public.chatwoot_team_mappings
from anon, authenticated, service_role;

grant select, insert, update on table public.chatwoot_user_mappings,
  public.chatwoot_account_memberships,
  public.chatwoot_inbox_mappings,
  public.chatwoot_team_mappings
to service_role;

revoke all on function public.enforce_chatwoot_user_mapping_contract()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_chatwoot_account_membership_contract()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_chatwoot_inbox_mapping_contract()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_chatwoot_team_mapping_contract()
  from public, anon, authenticated, service_role;
revoke all on function public.audit_chatwoot_slice_b_mapping_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_department_chatwoot_bridge_archive()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_team_chatwoot_bridge_archive()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_organization_member_chatwoot_remove()
  from public, anon, authenticated, service_role;
