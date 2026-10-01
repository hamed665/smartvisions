-- 0163: WhatsApp customer onboarding Slice 1
-- Extends the canonical communication_channel_bindings authority with bounded
-- setup-attempt child state and a trusted server-only completion boundary.
-- No second WhatsApp connection, IAM, Vault, message or health authority.

create table public.communication_channel_setup_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  branch_id uuid,
  communication_channel_binding_id uuid not null,
  channel text not null check (channel = 'WHATSAPP'),
  provider text not null check (provider = 'META'),
  connection_mode text not null check (
    connection_mode in (
      'BUSINESS_APP_COEXISTENCE',
      'API_NEW_NUMBER',
      'EXISTING_API_RECONNECT'
    )
  ),
  purpose text not null check (purpose in ('CONNECT','RECONNECT')),
  status text not null check (
    status in (
      'STARTED','AUTHORIZED','COMPLETED',
      'FAILED','EXPIRED','SUPERSEDED'
    )
  ),
  binding_version integer not null check (binding_version >= 1),
  provider_account_id text check (
    provider_account_id is null
    or length(btrim(provider_account_id)) between 1 and 200
  ),
  provider_destination_id text check (
    provider_destination_id is null
    or length(btrim(provider_destination_id)) between 1 and 200
  ),
  provider_destination_label text check (
    provider_destination_label is null
    or length(btrim(provider_destination_label)) between 1 and 200
  ),
  failure_code text check (
    failure_code is null
    or (
      length(btrim(failure_code)) between 1 and 120
      and failure_code = upper(failure_code)
      and failure_code ~ '^[A-Z0-9_-]+$'
    )
  ),
  started_by_user_id uuid not null,
  completed_by_user_id uuid,
  request_key text not null check (length(btrim(request_key)) between 1 and 200),
  last_request_key text not null check (length(btrim(last_request_key)) between 1 and 200),
  version integer not null default 1 check (version >= 1),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint communication_channel_setup_attempts_org_request_unique
    unique (organization_id, request_key),
  constraint communication_channel_setup_attempts_org_id_unique
    unique (organization_id, id),
  constraint communication_channel_setup_attempts_binding_fk
    foreign key (organization_id, communication_channel_binding_id)
    references public.communication_channel_bindings(organization_id, id)
    on delete cascade,
  constraint communication_channel_setup_attempts_business_fk
    foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict,
  constraint communication_channel_setup_attempts_branch_fk
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id)
    on delete restrict,
  constraint communication_channel_setup_attempts_started_by_fk
    foreign key (organization_id, started_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  constraint communication_channel_setup_attempts_completed_by_fk
    foreign key (organization_id, completed_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  constraint communication_channel_setup_attempts_expiry_check
    check (expires_at > started_at),
  constraint communication_channel_setup_attempts_completion_pair_check
    check (
      (status = 'COMPLETED' and completed_at is not null and completed_by_user_id is not null)
      or
      (status <> 'COMPLETED' and completed_at is null)
    )
);

create index communication_channel_setup_attempts_binding_status_idx
  on public.communication_channel_setup_attempts(
    organization_id,
    communication_channel_binding_id,
    status,
    created_at desc
  );

create index communication_channel_setup_attempts_expiry_idx
  on public.communication_channel_setup_attempts(expires_at)
  where status in ('STARTED','AUTHORIZED');

alter table public.communication_channel_setup_attempts enable row level security;

revoke all on table public.communication_channel_setup_attempts
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.communication_channel_setup_attempts
  to service_role;

create or replace function public.start_meta_whatsapp_setup_attempt(
  p_organization_id uuid,
  p_binding_id uuid,
  p_expected_binding_version integer,
  p_connection_mode text,
  p_purpose text,
  p_actor_user_id uuid,
  p_request_key text
)
returns public.communication_channel_setup_attempts
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_binding public.communication_channel_bindings%rowtype;
  v_business_status text;
  v_integration record;
  v_existing public.communication_channel_setup_attempts%rowtype;
  v_created public.communication_channel_setup_attempts%rowtype;
  v_mode text := upper(btrim(coalesce(p_connection_mode, '')));
  v_purpose text := upper(btrim(coalesce(p_purpose, '')));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_now timestamptz := statement_timestamp();
begin
  if p_organization_id is null
     or p_binding_id is null
     or p_actor_user_id is null
     or p_expected_binding_version is null
     or p_expected_binding_version < 1
     or length(v_request_key) not between 1 and 200
     or v_mode not in (
       'BUSINESS_APP_COEXISTENCE',
       'API_NEW_NUMBER',
       'EXISTING_API_RECONNECT'
     )
     or v_purpose not in ('CONNECT','RECONNECT')
  then
    raise exception 'invalid Meta WhatsApp setup attempt request';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.role = 'OWNER'
  ) then
    raise exception 'Organization OWNER required for Meta WhatsApp setup';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_binding_id::text, 0));

  select b.*
    into v_binding
    from public.communication_channel_bindings b
   where b.organization_id = p_organization_id
     and b.id = p_binding_id;

  if not found
     or v_binding.channel <> 'WHATSAPP'
     or v_binding.status <> 'ACTIVE'
     or v_binding.version <> p_expected_binding_version
  then
    raise exception 'Meta WhatsApp binding is not eligible for setup';
  end if;

  select tb.status
    into v_business_status
    from public.tenant_businesses tb
   where tb.organization_id = p_organization_id
     and tb.id = v_binding.tenant_business_id;

  select ic.provider, ic.channel, ic.enabled, ic.status
    into v_integration
    from public.integration_connections ic
   where ic.organization_id = p_organization_id
     and ic.id = v_binding.integration_connection_id;

  if v_business_status is distinct from 'ACTIVE'
     or v_integration.provider is distinct from 'META'
     or v_integration.channel is distinct from 'WHATSAPP'
     or v_integration.enabled is distinct from true
  then
    raise exception 'canonical Meta WhatsApp setup scope is not active';
  end if;

  if v_mode = 'EXISTING_API_RECONNECT' and (
    v_binding.provider is distinct from 'META'
    or v_binding.provider_destination_id is null
  ) then
    raise exception 'existing API reconnect requires an existing Meta destination';
  end if;

  if v_purpose = 'RECONNECT' and v_mode <> 'EXISTING_API_RECONNECT' then
    raise exception 'reconnect purpose requires EXISTING_API_RECONNECT mode';
  end if;

  select a.*
    into v_existing
    from public.communication_channel_setup_attempts a
   where a.organization_id = p_organization_id
     and a.request_key = v_request_key;

  if found then
    if v_existing.communication_channel_binding_id <> p_binding_id
       or v_existing.binding_version <> p_expected_binding_version
       or v_existing.connection_mode <> v_mode
       or v_existing.purpose <> v_purpose
       or v_existing.started_by_user_id <> p_actor_user_id
    then
      raise exception 'Meta WhatsApp setup request key already used with different payload';
    end if;
    return v_existing;
  end if;

  update public.communication_channel_setup_attempts
     set status = 'EXPIRED',
         version = version + 1,
         last_request_key = v_request_key,
         updated_at = v_now
   where organization_id = p_organization_id
     and communication_channel_binding_id = p_binding_id
     and status in ('STARTED','AUTHORIZED')
     and expires_at <= v_now;

  update public.communication_channel_setup_attempts
     set status = 'SUPERSEDED',
         version = version + 1,
         last_request_key = v_request_key,
         updated_at = v_now
   where organization_id = p_organization_id
     and communication_channel_binding_id = p_binding_id
     and status in ('STARTED','AUTHORIZED')
     and expires_at > v_now;

  insert into public.communication_channel_setup_attempts(
    organization_id,
    tenant_business_id,
    branch_id,
    communication_channel_binding_id,
    channel,
    provider,
    connection_mode,
    purpose,
    status,
    binding_version,
    started_by_user_id,
    request_key,
    last_request_key,
    started_at,
    expires_at
  ) values (
    p_organization_id,
    v_binding.tenant_business_id,
    v_binding.branch_id,
    p_binding_id,
    'WHATSAPP',
    'META',
    v_mode,
    v_purpose,
    'STARTED',
    p_expected_binding_version,
    p_actor_user_id,
    v_request_key,
    v_request_key,
    v_now,
    v_now + interval '30 minutes'
  )
  returning * into v_created;

  insert into public.audit_logs(
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data,
    tenant_business_id,
    branch_id
  ) values (
    p_organization_id,
    'USER',
    p_actor_user_id::text,
    'META_WHATSAPP_SETUP_ATTEMPT_STARTED',
    'communication_channel_setup_attempt',
    v_created.id::text,
    jsonb_build_object(
      'binding_id', p_binding_id,
      'binding_version', p_expected_binding_version,
      'connection_mode', v_mode,
      'purpose', v_purpose,
      'expires_at', v_created.expires_at
    ),
    v_binding.tenant_business_id,
    v_binding.branch_id
  );

  return v_created;
end;
$$;

create or replace function private.apply_meta_whatsapp_binding_credential_internal(
  p_organization_id uuid,
  p_binding_id uuid,
  p_expected_version integer,
  p_waba_id text,
  p_phone_number_id text,
  p_display_phone_number text,
  p_access_token text,
  p_actor_user_id uuid,
  p_request_key text
)
returns public.communication_channel_bindings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.communication_channel_bindings%rowtype;
  v_updated public.communication_channel_bindings%rowtype;
  v_waba text := btrim(coalesce(p_waba_id, ''));
  v_phone text := btrim(coalesce(p_phone_number_id, ''));
  v_display text := nullif(btrim(coalesce(p_display_phone_number, '')), '');
  v_token text := btrim(coalesce(p_access_token, ''));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_secret_id uuid;
  v_secret_name text;
begin
  if p_expected_version is null or p_expected_version < 1
     or length(v_waba) not between 1 and 200
     or length(v_phone) not between 1 and 200
     or length(v_token) < 20
     or length(v_request_key) not between 1 and 200
     or (v_display is not null and length(v_display) > 200)
  then
    raise exception 'invalid Meta WhatsApp trusted completion payload';
  end if;

  select b.*
    into v_current
    from public.communication_channel_bindings b
   where b.organization_id = p_organization_id
     and b.id = p_binding_id
   for update;

  if not found
     or v_current.channel <> 'WHATSAPP'
     or v_current.status <> 'ACTIVE'
     or v_current.version <> p_expected_version
  then
    raise exception 'Meta WhatsApp binding changed before trusted completion';
  end if;

  if exists (
    select 1
    from public.communication_channel_bindings sibling
    where sibling.status = 'ACTIVE'
      and sibling.channel = 'WHATSAPP'
      and sibling.provider = 'META'
      and sibling.provider_destination_id = v_phone
      and sibling.id <> v_current.id
  ) then
    raise exception 'Meta WhatsApp destination is already bound';
  end if;

  v_secret_name := 'meta_whatsapp_binding_' || replace(v_current.id::text, '-', '');

  if v_current.provider_secret_ref is not null then
    perform vault.update_secret(
      v_current.provider_secret_ref,
      v_token,
      null,
      'Smart Visions tenant-bound Meta WhatsApp access token',
      null
    );
    v_secret_id := v_current.provider_secret_ref;
  else
    select s.id
      into v_secret_id
      from vault.secrets s
     where s.name = v_secret_name
     limit 1;

    if v_secret_id is null then
      v_secret_id := vault.create_secret(
        v_token,
        v_secret_name,
        'Smart Visions tenant-bound Meta WhatsApp access token',
        null
      );
    else
      perform vault.update_secret(
        v_secret_id,
        v_token,
        null,
        'Smart Visions tenant-bound Meta WhatsApp access token',
        null
      );
    end if;
  end if;

  update public.communication_channel_bindings
     set provider = 'META',
         provider_account_id = v_waba,
         provider_destination_id = v_phone,
         provider_destination_label = v_display,
         provider_secret_ref = v_secret_id,
         version = version + 1,
         last_request_key = v_request_key,
         updated_by_user_id = p_actor_user_id
   where organization_id = p_organization_id
     and id = p_binding_id
     and version = p_expected_version
  returning * into v_updated;

  if not found then
    raise exception 'Meta WhatsApp binding trusted completion lost optimistic lock';
  end if;

  return v_updated;
end;
$$;

create or replace function public.complete_meta_whatsapp_setup_attempt(
  p_organization_id uuid,
  p_attempt_id uuid,
  p_binding_id uuid,
  p_expected_binding_version integer,
  p_waba_id text,
  p_phone_number_id text,
  p_display_phone_number text,
  p_access_token text,
  p_actor_user_id uuid,
  p_request_key text
)
returns public.communication_channel_bindings
language plpgsql
security invoker
set search_path = public, private, pg_catalog
as $$
declare
  v_attempt public.communication_channel_setup_attempts%rowtype;
  v_binding public.communication_channel_bindings%rowtype;
  v_updated public.communication_channel_bindings%rowtype;
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_now timestamptz := statement_timestamp();
begin
  if p_organization_id is null
     or p_attempt_id is null
     or p_binding_id is null
     or p_actor_user_id is null
     or p_expected_binding_version is null
     or p_expected_binding_version < 1
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Meta WhatsApp setup completion request';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.role = 'OWNER'
  ) then
    raise exception 'Organization OWNER required for Meta WhatsApp setup completion';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_binding_id::text, 0));

  select a.*
    into v_attempt
    from public.communication_channel_setup_attempts a
   where a.organization_id = p_organization_id
     and a.id = p_attempt_id
     and a.communication_channel_binding_id = p_binding_id;

  if not found then
    raise exception 'Meta WhatsApp setup attempt not found';
  end if;

  if v_attempt.status = 'COMPLETED' then
    select b.*
      into v_binding
      from public.communication_channel_bindings b
     where b.organization_id = p_organization_id
       and b.id = p_binding_id;

    if found
       and v_binding.provider = 'META'
       and v_binding.provider_account_id = btrim(coalesce(p_waba_id, ''))
       and v_binding.provider_destination_id = btrim(coalesce(p_phone_number_id, ''))
    then
      return v_binding;
    end if;

    raise exception 'completed Meta WhatsApp setup attempt no longer matches binding';
  end if;

  if v_attempt.status <> 'STARTED'
     or v_attempt.expires_at <= v_now
     or v_attempt.binding_version <> p_expected_binding_version
  then
    raise exception 'Meta WhatsApp setup attempt is stale or not completable';
  end if;

  select b.*
    into v_binding
    from public.communication_channel_bindings b
   where b.organization_id = p_organization_id
     and b.id = p_binding_id;

  if not found
     or v_binding.status <> 'ACTIVE'
     or v_binding.channel <> 'WHATSAPP'
     or v_binding.version <> p_expected_binding_version
     or v_binding.tenant_business_id <> v_attempt.tenant_business_id
     or v_binding.branch_id is distinct from v_attempt.branch_id
  then
    raise exception 'canonical Meta WhatsApp binding changed during setup';
  end if;

  select *
    into v_updated
    from private.apply_meta_whatsapp_binding_credential_internal(
      p_organization_id,
      p_binding_id,
      p_expected_binding_version,
      p_waba_id,
      p_phone_number_id,
      p_display_phone_number,
      p_access_token,
      p_actor_user_id,
      v_request_key
    );

  update public.communication_channel_setup_attempts
     set status = 'COMPLETED',
         provider_account_id = btrim(p_waba_id),
         provider_destination_id = btrim(p_phone_number_id),
         provider_destination_label = nullif(btrim(coalesce(p_display_phone_number, '')), ''),
         completed_by_user_id = p_actor_user_id,
         completed_at = v_now,
         last_request_key = v_request_key,
         version = version + 1,
         updated_at = v_now
   where organization_id = p_organization_id
     and id = p_attempt_id
     and status = 'STARTED'
  returning * into v_attempt;

  if not found then
    raise exception 'Meta WhatsApp setup attempt completion lost optimistic state';
  end if;

  insert into public.audit_logs(
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data,
    tenant_business_id,
    branch_id
  ) values (
    p_organization_id,
    'USER',
    p_actor_user_id::text,
    'META_WHATSAPP_SETUP_ATTEMPT_COMPLETED',
    'communication_channel_setup_attempt',
    p_attempt_id::text,
    jsonb_build_object(
      'binding_id', p_binding_id,
      'binding_version_before', p_expected_binding_version,
      'binding_version_after', v_updated.version,
      'connection_mode', v_attempt.connection_mode,
      'purpose', v_attempt.purpose,
      'waba_id', btrim(p_waba_id),
      'phone_number_id', btrim(p_phone_number_id),
      'display_phone_number', nullif(btrim(coalesce(p_display_phone_number, '')), ''),
      'credential_storage', 'SUPABASE_VAULT'
    ),
    v_attempt.tenant_business_id,
    v_attempt.branch_id
  );

  return v_updated;
end;
$$;

-- The legacy owner-callable function is no longer an authorized credential boundary.
revoke all on function public.configure_meta_whatsapp_binding(
  uuid,uuid,integer,text,text,text,text,text
) from public, anon, authenticated, service_role;

revoke all on function public.start_meta_whatsapp_setup_attempt(
  uuid,uuid,integer,text,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.start_meta_whatsapp_setup_attempt(
  uuid,uuid,integer,text,text,uuid,text
) to service_role;

revoke all on function private.apply_meta_whatsapp_binding_credential_internal(
  uuid,uuid,integer,text,text,text,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function private.apply_meta_whatsapp_binding_credential_internal(
  uuid,uuid,integer,text,text,text,text,uuid,text
) to service_role;

revoke all on function public.complete_meta_whatsapp_setup_attempt(
  uuid,uuid,uuid,integer,text,text,text,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.complete_meta_whatsapp_setup_attempt(
  uuid,uuid,uuid,integer,text,text,text,text,uuid,text
) to service_role;
