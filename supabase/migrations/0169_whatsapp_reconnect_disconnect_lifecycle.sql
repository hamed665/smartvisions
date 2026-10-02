-- 0169: WhatsApp customer onboarding Slice 8 — reconnect/revoke/disconnect lifecycle.
-- Extends the canonical communication_channel_bindings authority only.
-- A logical binding stays stable during disconnect/reconnect; provider actions fail closed
-- through existing routing/credential authorities. No second connection state machine,
-- secret store, provider stack, queue, CRM or Chatwoot plane is introduced.

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

  -- A reconnect rotates the credential on the same logical binding. It may not
  -- silently retarget that binding to another WABA or phone number.
  if v_current.provider is not null and v_current.provider <> 'META' then
    raise exception 'Meta WhatsApp reconnect provider identity changed';
  end if;
  if v_current.provider_account_id is not null
     and v_current.provider_account_id <> v_waba
  then
    raise exception 'Meta WhatsApp reconnect WABA identity changed';
  end if;
  if v_current.provider_destination_id is not null
     and v_current.provider_destination_id <> v_phone
  then
    raise exception 'Meta WhatsApp reconnect phone identity changed';
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

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  update public.communication_channel_bindings
     set provider = 'META',
         provider_account_id = v_waba,
         provider_destination_id = v_phone,
         provider_destination_label = v_display,
         provider_secret_ref = v_secret_id,
         version = version + 1,
         last_request_key = v_request_key,
         last_verified_at = null,
         last_error_code = null,
         updated_by_user_id = p_actor_user_id,
         updated_at = statement_timestamp()
   where organization_id = p_organization_id
     and id = p_binding_id
     and version = p_expected_version
  returning * into v_updated;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);

  if not found then
    raise exception 'Meta WhatsApp binding trusted completion lost optimistic lock';
  end if;

  return v_updated;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

-- Operationally disconnected/revoked bindings remain the same logical ACTIVE
-- binding so reconnect can rotate credentials without manufacturing a new identity.
-- These incident codes make both inbound destination resolution and outbound
-- credential resolution fail closed.
create or replace function public.resolve_meta_whatsapp_destination(
  p_phone_number_id text,
  p_waba_id text default null
)
returns table(
  organization_id uuid,
  tenant_business_id uuid,
  branch_id uuid,
  binding_id uuid,
  integration_connection_id uuid,
  phone_number_id text,
  waba_id text
)
language plpgsql
security definer
set search_path = public, vault, pg_catalog
as $$
declare
  v_phone text := trim(coalesce(p_phone_number_id, ''));
  v_waba text := nullif(trim(coalesce(p_waba_id, '')), '');
begin
  if length(v_phone) not between 1 and 200
     or (v_waba is not null and length(v_waba) > 200)
  then
    raise exception 'invalid Meta WhatsApp destination';
  end if;

  return query
  select b.organization_id,
         b.tenant_business_id,
         b.branch_id,
         b.id,
         b.integration_connection_id,
         b.provider_destination_id,
         b.provider_account_id
    from public.communication_channel_bindings b
    join public.integration_connections ic
      on ic.id = b.integration_connection_id
     and ic.organization_id = b.organization_id
   where b.status = 'ACTIVE'
     and b.channel = 'WHATSAPP'
     and b.provider = 'META'
     and b.provider_destination_id = v_phone
     and (v_waba is null or b.provider_account_id = v_waba)
     and coalesce(b.last_error_code, '') not in (
       'MANUAL_DISCONNECTED',
       'META_CREDENTIAL_INVALID_OR_REVOKED',
       'META_CREDENTIAL_HEALTH_UNCONFIRMED',
       'META_PROVIDER_SUBSCRIPTION_MISSING'
     )
     and ic.enabled = true
     and ic.status = 'CONNECTED'
     and ic.provider = 'META'
     and ic.channel = 'WHATSAPP'
   limit 1;
end;
$$;

create or replace function public.resolve_meta_whatsapp_credential(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid default null
)
returns table(
  binding_id uuid,
  integration_connection_id uuid,
  phone_number_id text,
  waba_id text,
  access_token text
)
language plpgsql
security definer
set search_path = public, vault, pg_catalog
as $$
declare
  v_binding public.communication_channel_bindings%rowtype;
  v_secret text;
begin
  if p_organization_id is null or p_tenant_business_id is null then
    raise exception 'Meta WhatsApp tenant credential scope is required';
  end if;

  select b.*
    into v_binding
    from public.communication_channel_bindings b
    join public.integration_connections ic
      on ic.id = b.integration_connection_id
     and ic.organization_id = b.organization_id
   where b.organization_id = p_organization_id
     and b.tenant_business_id = p_tenant_business_id
     and b.status = 'ACTIVE'
     and b.channel = 'WHATSAPP'
     and b.provider = 'META'
     and b.provider_destination_id is not null
     and b.provider_secret_ref is not null
     and coalesce(b.last_error_code, '') not in (
       'MANUAL_DISCONNECTED',
       'META_CREDENTIAL_INVALID_OR_REVOKED',
       'META_CREDENTIAL_HEALTH_UNCONFIRMED',
       'META_PROVIDER_SUBSCRIPTION_MISSING'
     )
     and ic.enabled = true
     and ic.status = 'CONNECTED'
     and ic.provider = 'META'
     and ic.channel = 'WHATSAPP'
     and (
       (p_branch_id is not null and b.branch_id = p_branch_id)
       or (p_branch_id is null and b.branch_id is null)
     )
   order by b.updated_at desc, b.id desc
   limit 2;

  if not found then
    raise exception 'Meta WhatsApp tenant credential is not configured';
  end if;

  if exists (
    select 1
      from public.communication_channel_bindings sibling
      join public.integration_connections sic
        on sic.id = sibling.integration_connection_id
       and sic.organization_id = sibling.organization_id
     where sibling.organization_id = p_organization_id
       and sibling.tenant_business_id = p_tenant_business_id
       and sibling.status = 'ACTIVE'
       and sibling.channel = 'WHATSAPP'
       and sibling.provider = 'META'
       and sibling.provider_destination_id is not null
       and sibling.provider_secret_ref is not null
       and coalesce(sibling.last_error_code, '') not in (
         'MANUAL_DISCONNECTED',
         'META_CREDENTIAL_INVALID_OR_REVOKED',
         'META_CREDENTIAL_HEALTH_UNCONFIRMED',
         'META_PROVIDER_SUBSCRIPTION_MISSING'
       )
       and sic.enabled = true
       and sic.status = 'CONNECTED'
       and sic.provider = 'META'
       and sic.channel = 'WHATSAPP'
       and (
         (p_branch_id is not null and sibling.branch_id = p_branch_id)
         or (p_branch_id is null and sibling.branch_id is null)
       )
       and sibling.id <> v_binding.id
  ) then
    raise exception 'Meta WhatsApp tenant credential is ambiguous';
  end if;

  select ds.decrypted_secret
    into v_secret
    from vault.decrypted_secrets ds
   where ds.id = v_binding.provider_secret_ref;

  if v_secret is null or length(trim(v_secret)) < 20 then
    raise exception 'Meta WhatsApp tenant credential secret is unavailable';
  end if;

  return query
  select v_binding.id,
         v_binding.integration_connection_id,
         v_binding.provider_destination_id,
         v_binding.provider_account_id,
         v_secret;
end;
$$;

create or replace function public.disconnect_meta_whatsapp_binding(
  p_organization_id uuid,
  p_binding_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_request_key text
)
returns public.communication_channel_bindings
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_binding public.communication_channel_bindings%rowtype;
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_now timestamptz := statement_timestamp();
begin
  if p_organization_id is null
     or p_binding_id is null
     or p_actor_user_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Meta WhatsApp disconnect request';
  end if;

  if not exists (
    select 1
      from public.organization_members m
     where m.organization_id = p_organization_id
       and m.user_id = p_actor_user_id
       and m.role = 'OWNER'
  ) then
    raise exception 'Organization OWNER required for Meta WhatsApp disconnect';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_binding_id::text, 0));

  select b.*
    into v_binding
    from public.communication_channel_bindings b
   where b.organization_id = p_organization_id
     and b.id = p_binding_id
   for update;

  if not found
     or v_binding.status <> 'ACTIVE'
     or v_binding.channel <> 'WHATSAPP'
     or v_binding.provider is distinct from 'META'
     or v_binding.provider_destination_id is null
  then
    raise exception 'Meta WhatsApp binding is not disconnectable';
  end if;

  if v_binding.last_error_code = 'MANUAL_DISCONNECTED' then
    return v_binding;
  end if;

  if v_binding.version <> p_expected_version then
    raise exception 'Meta WhatsApp binding changed before disconnect';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  update public.communication_channel_bindings
     set last_verified_at = null,
         last_error_code = 'MANUAL_DISCONNECTED',
         last_request_key = v_request_key,
         version = version + 1,
         updated_by_user_id = p_actor_user_id,
         updated_at = v_now
   where organization_id = p_organization_id
     and id = p_binding_id
     and version = p_expected_version
  returning * into v_binding;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);

  if not found then
    raise exception 'Meta WhatsApp disconnect lost optimistic state';
  end if;

  update public.communication_channel_setup_attempts
     set status = 'SUPERSEDED',
         remote_setup_revoked_at = coalesce(remote_setup_revoked_at, v_now),
         last_request_key = v_request_key,
         version = version + 1,
         updated_at = v_now
   where organization_id = p_organization_id
     and communication_channel_binding_id = p_binding_id
     and status in ('STARTED','AUTHORIZED');

  update public.unified_inbox_conversation_projections
     set lifecycle_status = 'DEGRADED',
         last_request_key = v_request_key,
         version = version + 1,
         updated_at = v_now
   where organization_id = p_organization_id
     and communication_channel_binding_id = p_binding_id
     and lifecycle_status = 'ACTIVE';

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id,
    after_data, tenant_business_id, branch_id
  ) values (
    p_organization_id,
    'USER',
    p_actor_user_id::text,
    'META_WHATSAPP_BINDING_DISCONNECTED',
    'communication_channel_binding',
    p_binding_id::text,
    jsonb_build_object(
      'binding_id', p_binding_id,
      'binding_version', v_binding.version,
      'provider', 'META',
      'waba_id', v_binding.provider_account_id,
      'phone_number_id', v_binding.provider_destination_id,
      'provider_actions_blocked', true,
      'mobile_whatsapp_account_changed', false
    ),
    v_binding.tenant_business_id,
    v_binding.branch_id
  );

  return v_binding;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

create or replace function public.mark_meta_whatsapp_binding_health(
  p_organization_id uuid,
  p_binding_id uuid,
  p_expected_version integer,
  p_health_state text,
  p_actor_user_id uuid,
  p_request_key text
)
returns public.communication_channel_bindings
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_binding public.communication_channel_bindings%rowtype;
  v_state text := upper(btrim(coalesce(p_health_state, '')));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_now timestamptz := statement_timestamp();
  v_error text;
begin
  if p_organization_id is null
     or p_binding_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_actor_user_id is null
     or v_state not in ('VERIFIED','CREDENTIAL_INVALID','UNCONFIRMED','SUBSCRIPTION_MISSING')
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Meta WhatsApp health request';
  end if;

  if not exists (
    select 1
      from public.organization_members m
     where m.organization_id = p_organization_id
       and m.user_id = p_actor_user_id
       and m.role = 'OWNER'
  ) then
    raise exception 'Organization OWNER required for Meta WhatsApp health update';
  end if;

  select b.*
    into v_binding
    from public.communication_channel_bindings b
   where b.organization_id = p_organization_id
     and b.id = p_binding_id
     and b.status = 'ACTIVE'
     and b.channel = 'WHATSAPP'
     and b.provider = 'META'
     and b.version = p_expected_version
   for update;

  if not found then
    raise exception 'Meta WhatsApp binding is not health-checkable';
  end if;

  if v_binding.last_error_code = 'MANUAL_DISCONNECTED' then
    raise exception 'Disconnected Meta WhatsApp binding requires reconnect';
  end if;

  v_error := case v_state
    when 'CREDENTIAL_INVALID' then 'META_CREDENTIAL_INVALID_OR_REVOKED'
    when 'UNCONFIRMED' then 'META_CREDENTIAL_HEALTH_UNCONFIRMED'
    when 'SUBSCRIPTION_MISSING' then 'META_PROVIDER_SUBSCRIPTION_MISSING'
    else null
  end;

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  update public.communication_channel_bindings
     set last_verified_at = case when v_state = 'VERIFIED' then v_now else null end,
         last_error_code = v_error,
         last_request_key = v_request_key,
         version = version + 1,
         updated_by_user_id = p_actor_user_id,
         updated_at = v_now
   where organization_id = p_organization_id
     and id = p_binding_id
     and version = p_expected_version
  returning * into v_binding;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);

  if not found then
    raise exception 'Meta WhatsApp health update lost optimistic state';
  end if;

  if v_state <> 'VERIFIED' then
    update public.unified_inbox_conversation_projections
       set lifecycle_status = 'DEGRADED',
           last_request_key = v_request_key,
           version = version + 1,
           updated_at = v_now
     where organization_id = p_organization_id
       and communication_channel_binding_id = p_binding_id
       and lifecycle_status = 'ACTIVE';
  end if;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id,
    after_data, tenant_business_id, branch_id
  ) values (
    p_organization_id,
    'USER',
    p_actor_user_id::text,
    case v_state
      when 'VERIFIED' then 'META_WHATSAPP_CREDENTIAL_HEALTH_VERIFIED'
      when 'CREDENTIAL_INVALID' then 'META_WHATSAPP_CREDENTIAL_INVALID_OR_REVOKED'
      when 'UNCONFIRMED' then 'META_WHATSAPP_CREDENTIAL_HEALTH_UNCONFIRMED'
      else 'META_WHATSAPP_PROVIDER_SUBSCRIPTION_MISSING'
    end,
    'communication_channel_binding',
    p_binding_id::text,
    jsonb_build_object(
      'binding_id', p_binding_id,
      'health_state', v_state,
      'provider_actions_blocked', v_state <> 'VERIFIED'
    ),
    v_binding.tenant_business_id,
    v_binding.branch_id
  );

  return v_binding;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

revoke all on function public.resolve_meta_whatsapp_destination(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_meta_whatsapp_destination(text,text)
  to service_role;

revoke all on function public.resolve_meta_whatsapp_credential(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_meta_whatsapp_credential(uuid,uuid,uuid)
  to service_role;

revoke all on function private.apply_meta_whatsapp_binding_credential_internal(
  uuid,uuid,integer,text,text,text,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function private.apply_meta_whatsapp_binding_credential_internal(
  uuid,uuid,integer,text,text,text,text,uuid,text
) to service_role;

revoke all on function public.disconnect_meta_whatsapp_binding(
  uuid,uuid,integer,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.disconnect_meta_whatsapp_binding(
  uuid,uuid,integer,uuid,text
) to service_role;

revoke all on function public.mark_meta_whatsapp_binding_health(
  uuid,uuid,integer,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.mark_meta_whatsapp_binding_health(
  uuid,uuid,integer,text,uuid,text
) to service_role;
