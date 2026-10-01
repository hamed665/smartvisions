-- 0166: WhatsApp customer onboarding Slice 3 — mobile wizard trusted remote completion.
-- Extends the existing setup-attempt/session authority only. No second IAM,
-- connection, invitation, provider, Vault, CRM, message, queue or Chatwoot authority.

alter table public.communication_channel_setup_attempts
  add column completion_actor_type text,
  add column completion_actor_ref text;

update public.communication_channel_setup_attempts
   set completion_actor_type = 'OWNER',
       completion_actor_ref = completed_by_user_id::text
 where status = 'COMPLETED'
   and completed_by_user_id is not null
   and completion_actor_type is null;

alter table public.communication_channel_setup_attempts
  add constraint comm_setup_attempts_completion_actor_type_check
    check (
      completion_actor_type is null
      or completion_actor_type in ('OWNER','REMOTE_SETUP')
    ),
  add constraint comm_setup_attempts_completion_actor_ref_check
    check (
      completion_actor_ref is null
      or length(btrim(completion_actor_ref)) between 1 and 200
    );

alter table public.communication_channel_setup_attempts
  drop constraint communication_channel_setup_attempts_completion_pair_check;

alter table public.communication_channel_setup_attempts
  add constraint communication_channel_setup_attempts_completion_pair_check
  check (
    (
      status = 'COMPLETED'
      and completed_at is not null
      and completed_by_user_id is not null
      and (
        (
          completion_actor_type = 'OWNER'
          and completion_actor_ref = completed_by_user_id::text
        )
        or
        (
          completion_actor_type = 'REMOTE_SETUP'
          and completion_actor_ref = 'WHATSAPP_SETUP'
          and completed_by_user_id = started_by_user_id
          and remote_setup_invitation_redeemed_at is not null
        )
      )
    )
    or
    (
      status <> 'COMPLETED'
      and completed_at is null
      and completion_actor_type is null
      and completion_actor_ref is null
    )
  );

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

  if v_attempt.connection_mode = 'BUSINESS_APP_COEXISTENCE' then
    raise exception 'official WhatsApp Business App coexistence completion is not enabled yet';
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
         completion_actor_type = 'OWNER',
         completion_actor_ref = p_actor_user_id::text,
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
      'completion_actor_type', 'OWNER',
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

drop function if exists public.get_meta_whatsapp_remote_setup_context(text);

create function public.get_meta_whatsapp_remote_setup_context(
  p_session_token_hash text
)
returns table(
  attempt_id uuid,
  attempt_version integer,
  attempt_status text,
  organization_id uuid,
  tenant_business_id uuid,
  branch_id uuid,
  binding_id uuid,
  binding_version integer,
  current_binding_version integer,
  connection_mode text,
  purpose text,
  session_expires_at timestamptz,
  provider_account_id text,
  provider_destination_id text,
  provider_destination_label text
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_hash text := lower(btrim(coalesce(p_session_token_hash, '')));
  v_now timestamptz := statement_timestamp();
begin
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid WhatsApp remote setup session';
  end if;

  return query
  select
    a.id,
    a.version,
    a.status,
    a.organization_id,
    a.tenant_business_id,
    a.branch_id,
    a.communication_channel_binding_id,
    a.binding_version,
    b.version,
    a.connection_mode,
    a.purpose,
    a.remote_setup_session_expires_at,
    a.provider_account_id,
    a.provider_destination_id,
    a.provider_destination_label
  from public.communication_channel_setup_attempts a
  join public.communication_channel_bindings b
    on b.organization_id = a.organization_id
   and b.id = a.communication_channel_binding_id
  join public.tenant_businesses tb
    on tb.organization_id = a.organization_id
   and tb.id = a.tenant_business_id
  join public.integration_connections ic
    on ic.organization_id = a.organization_id
   and ic.id = b.integration_connection_id
  where a.remote_setup_session_token_hash = v_hash
    and a.status in ('AUTHORIZED','COMPLETED')
    and a.remote_setup_revoked_at is null
    and a.expires_at > v_now
    and a.remote_setup_session_expires_at is not null
    and a.remote_setup_session_expires_at > v_now
    and b.status = 'ACTIVE'
    and b.channel = 'WHATSAPP'
    and b.tenant_business_id = a.tenant_business_id
    and b.branch_id is not distinct from a.branch_id
    and tb.status = 'ACTIVE'
    and ic.provider = 'META'
    and ic.channel = 'WHATSAPP'
    and ic.enabled = true
    and (
      (a.status = 'AUTHORIZED' and b.version = a.binding_version)
      or
      (
        a.status = 'COMPLETED'
        and b.version = a.binding_version + 1
        and b.provider = 'META'
        and b.provider_account_id = a.provider_account_id
        and b.provider_destination_id = a.provider_destination_id
      )
    )
  limit 1;
end;
$$;

create or replace function public.complete_meta_whatsapp_remote_setup_attempt(
  p_attempt_id uuid,
  p_binding_id uuid,
  p_expected_binding_version integer,
  p_session_token_hash text,
  p_waba_id text,
  p_phone_number_id text,
  p_display_phone_number text,
  p_access_token text,
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
  v_hash text := lower(btrim(coalesce(p_session_token_hash, '')));
  v_waba text := btrim(coalesce(p_waba_id, ''));
  v_phone text := btrim(coalesce(p_phone_number_id, ''));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_now timestamptz := statement_timestamp();
begin
  if p_attempt_id is null
     or p_binding_id is null
     or p_expected_binding_version is null
     or p_expected_binding_version < 1
     or v_hash !~ '^[0-9a-f]{64}$'
     or length(v_waba) not between 1 and 200
     or length(v_phone) not between 1 and 200
     or length(btrim(coalesce(p_access_token, ''))) < 20
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid remote Meta WhatsApp completion request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_binding_id::text, 0));

  select a.*
    into v_attempt
    from public.communication_channel_setup_attempts a
   where a.id = p_attempt_id
     and a.communication_channel_binding_id = p_binding_id
     and a.remote_setup_session_token_hash = v_hash;

  if not found then
    raise exception 'remote Meta WhatsApp setup session not found';
  end if;

  if v_attempt.status = 'COMPLETED' then
    select b.*
      into v_binding
      from public.communication_channel_bindings b
     where b.organization_id = v_attempt.organization_id
       and b.id = p_binding_id;

    if found
       and v_attempt.remote_setup_revoked_at is null
       and v_attempt.remote_setup_session_expires_at > v_now
       and v_binding.provider = 'META'
       and v_binding.provider_account_id = v_waba
       and v_binding.provider_destination_id = v_phone
    then
      return v_binding;
    end if;

    raise exception 'completed remote Meta WhatsApp setup no longer matches binding';
  end if;

  if v_attempt.status <> 'AUTHORIZED'
     or v_attempt.expires_at <= v_now
     or v_attempt.binding_version <> p_expected_binding_version
     or v_attempt.remote_setup_revoked_at is not null
     or v_attempt.remote_setup_session_expires_at is null
     or v_attempt.remote_setup_session_expires_at <= v_now
  then
    raise exception 'remote Meta WhatsApp setup session is stale, expired or revoked';
  end if;

  if v_attempt.connection_mode = 'BUSINESS_APP_COEXISTENCE' then
    raise exception 'official WhatsApp Business App coexistence completion is not enabled yet';
  end if;

  select b.*
    into v_binding
    from public.communication_channel_bindings b
   where b.organization_id = v_attempt.organization_id
     and b.id = p_binding_id;

  if not found
     or v_binding.status <> 'ACTIVE'
     or v_binding.channel <> 'WHATSAPP'
     or v_binding.version <> p_expected_binding_version
     or v_binding.tenant_business_id <> v_attempt.tenant_business_id
     or v_binding.branch_id is distinct from v_attempt.branch_id
  then
    raise exception 'canonical Meta WhatsApp binding changed during remote setup';
  end if;

  select *
    into v_updated
    from private.apply_meta_whatsapp_binding_credential_internal(
      v_attempt.organization_id,
      p_binding_id,
      p_expected_binding_version,
      v_waba,
      v_phone,
      p_display_phone_number,
      p_access_token,
      v_attempt.started_by_user_id,
      v_request_key
    );

  update public.communication_channel_setup_attempts
     set status = 'COMPLETED',
         provider_account_id = v_waba,
         provider_destination_id = v_phone,
         provider_destination_label = nullif(btrim(coalesce(p_display_phone_number, '')), ''),
         completed_by_user_id = started_by_user_id,
         completion_actor_type = 'REMOTE_SETUP',
         completion_actor_ref = 'WHATSAPP_SETUP',
         completed_at = v_now,
         last_request_key = v_request_key,
         version = version + 1,
         updated_at = v_now
   where id = p_attempt_id
     and status = 'AUTHORIZED'
     and version = v_attempt.version
  returning * into v_attempt;

  if not found then
    raise exception 'remote Meta WhatsApp setup completion lost optimistic state';
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
    v_attempt.organization_id,
    'SYSTEM',
    'whatsapp_setup_capability',
    'META_WHATSAPP_REMOTE_SETUP_COMPLETED',
    'communication_channel_setup_attempt',
    p_attempt_id::text,
    jsonb_build_object(
      'capability', 'WHATSAPP_SETUP',
      'sponsored_by_user_id', v_attempt.started_by_user_id,
      'completion_actor_type', 'REMOTE_SETUP',
      'binding_id', p_binding_id,
      'binding_version_before', p_expected_binding_version,
      'binding_version_after', v_updated.version,
      'connection_mode', v_attempt.connection_mode,
      'purpose', v_attempt.purpose,
      'waba_id', v_waba,
      'phone_number_id', v_phone,
      'display_phone_number', nullif(btrim(coalesce(p_display_phone_number, '')), ''),
      'credential_storage', 'SUPABASE_VAULT'
    ),
    v_attempt.tenant_business_id,
    v_attempt.branch_id
  );

  return v_updated;
end;
$$;

revoke all on function public.get_meta_whatsapp_remote_setup_context(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_meta_whatsapp_remote_setup_context(text)
  to service_role;

revoke all on function public.complete_meta_whatsapp_remote_setup_attempt(
  uuid,uuid,integer,text,text,text,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.complete_meta_whatsapp_remote_setup_attempt(
  uuid,uuid,integer,text,text,text,text,text,text
) to service_role;
