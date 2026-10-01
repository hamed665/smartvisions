-- 0165: WhatsApp customer onboarding Slice 2 — secure remote setup invitation.
-- Extends communication_channel_setup_attempts with a bounded WHATSAPP_SETUP
-- capability. No second IAM, user directory, channel binding, secret store,
-- provider stack, message store, CRM, or Chatwoot authority is introduced.

alter table public.communication_channel_setup_attempts
  add column remote_setup_invitation_token_hash text,
  add column remote_setup_invitation_created_at timestamptz,
  add column remote_setup_invitation_expires_at timestamptz,
  add column remote_setup_invitation_redeemed_at timestamptz,
  add column remote_setup_session_token_hash text,
  add column remote_setup_session_expires_at timestamptz,
  add column remote_setup_revoked_at timestamptz;

alter table public.communication_channel_setup_attempts
  add constraint communication_channel_setup_attempts_remote_invite_hash_check
    check (
      remote_setup_invitation_token_hash is null
      or remote_setup_invitation_token_hash ~ '^[0-9a-f]{64}$'
    ),
  add constraint communication_channel_setup_attempts_remote_session_hash_check
    check (
      remote_setup_session_token_hash is null
      or remote_setup_session_token_hash ~ '^[0-9a-f]{64}$'
    ),
  add constraint communication_channel_setup_attempts_remote_invite_window_check
    check (
      (
        remote_setup_invitation_token_hash is null
        and remote_setup_invitation_created_at is null
        and remote_setup_invitation_expires_at is null
      )
      or
      (
        remote_setup_invitation_token_hash is not null
        and remote_setup_invitation_created_at is not null
        and remote_setup_invitation_expires_at is not null
        and remote_setup_invitation_expires_at > remote_setup_invitation_created_at
        and remote_setup_invitation_expires_at <= expires_at
      )
    ),
  add constraint communication_channel_setup_attempts_remote_session_window_check
    check (
      (
        remote_setup_session_token_hash is null
        and remote_setup_session_expires_at is null
      )
      or
      (
        remote_setup_session_token_hash is not null
        and remote_setup_session_expires_at is not null
        and remote_setup_invitation_redeemed_at is not null
        and remote_setup_session_expires_at > remote_setup_invitation_redeemed_at
        and remote_setup_session_expires_at <= expires_at
      )
    );

create unique index communication_channel_setup_attempts_remote_invite_hash_uidx
  on public.communication_channel_setup_attempts(remote_setup_invitation_token_hash)
  where remote_setup_invitation_token_hash is not null;

create unique index communication_channel_setup_attempts_remote_session_hash_uidx
  on public.communication_channel_setup_attempts(remote_setup_session_token_hash)
  where remote_setup_session_token_hash is not null;

create or replace function public.issue_meta_whatsapp_remote_setup_invite(
  p_organization_id uuid,
  p_attempt_id uuid,
  p_binding_id uuid,
  p_expected_attempt_version integer,
  p_invitation_token_hash text,
  p_actor_user_id uuid,
  p_request_key text
)
returns public.communication_channel_setup_attempts
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_attempt public.communication_channel_setup_attempts%rowtype;
  v_binding public.communication_channel_bindings%rowtype;
  v_business_status text;
  v_integration record;
  v_hash text := lower(btrim(coalesce(p_invitation_token_hash, '')));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_now timestamptz := statement_timestamp();
begin
  if p_organization_id is null
     or p_attempt_id is null
     or p_binding_id is null
     or p_actor_user_id is null
     or p_expected_attempt_version is null
     or p_expected_attempt_version < 1
     or v_hash !~ '^[0-9a-f]{64}$'
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid WhatsApp remote setup invitation request';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.role = 'OWNER'
  ) then
    raise exception 'Organization OWNER required for WhatsApp remote setup invitation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_binding_id::text, 0));

  select a.*
    into v_attempt
    from public.communication_channel_setup_attempts a
   where a.organization_id = p_organization_id
     and a.id = p_attempt_id
     and a.communication_channel_binding_id = p_binding_id
   for update;

  if not found
     or v_attempt.status not in ('STARTED','AUTHORIZED')
     or v_attempt.expires_at <= v_now
     or v_attempt.version <> p_expected_attempt_version
  then
    raise exception 'WhatsApp remote setup attempt is stale or not inviteable';
  end if;

  select b.*
    into v_binding
    from public.communication_channel_bindings b
   where b.organization_id = p_organization_id
     and b.id = p_binding_id;

  if not found
     or v_binding.status <> 'ACTIVE'
     or v_binding.channel <> 'WHATSAPP'
     or v_binding.version <> v_attempt.binding_version
     or v_binding.tenant_business_id <> v_attempt.tenant_business_id
     or v_binding.branch_id is distinct from v_attempt.branch_id
  then
    raise exception 'canonical WhatsApp binding changed before invitation';
  end if;

  select tb.status
    into v_business_status
    from public.tenant_businesses tb
   where tb.organization_id = p_organization_id
     and tb.id = v_attempt.tenant_business_id;

  select ic.provider, ic.channel, ic.enabled
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

  update public.communication_channel_setup_attempts
     set status = 'STARTED',
         remote_setup_invitation_token_hash = v_hash,
         remote_setup_invitation_created_at = v_now,
         remote_setup_invitation_expires_at = least(expires_at, v_now + interval '30 minutes'),
         remote_setup_invitation_redeemed_at = null,
         remote_setup_session_token_hash = null,
         remote_setup_session_expires_at = null,
         remote_setup_revoked_at = null,
         last_request_key = v_request_key,
         version = version + 1,
         updated_at = v_now
   where organization_id = p_organization_id
     and id = p_attempt_id
     and version = p_expected_attempt_version
  returning * into v_attempt;

  if not found then
    raise exception 'WhatsApp remote setup invitation lost optimistic state';
  end if;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id,
    after_data, tenant_business_id, branch_id
  ) values (
    p_organization_id,
    'USER',
    p_actor_user_id::text,
    'META_WHATSAPP_REMOTE_SETUP_INVITE_ISSUED',
    'communication_channel_setup_attempt',
    p_attempt_id::text,
    jsonb_build_object(
      'capability', 'WHATSAPP_SETUP',
      'binding_id', p_binding_id,
      'binding_version', v_attempt.binding_version,
      'connection_mode', v_attempt.connection_mode,
      'purpose', v_attempt.purpose,
      'expires_at', v_attempt.remote_setup_invitation_expires_at
    ),
    v_attempt.tenant_business_id,
    v_attempt.branch_id
  );

  return v_attempt;
end;
$$;

create or replace function public.redeem_meta_whatsapp_remote_setup_invite(
  p_invitation_token_hash text,
  p_session_token_hash text,
  p_request_key text
)
returns public.communication_channel_setup_attempts
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_attempt public.communication_channel_setup_attempts%rowtype;
  v_binding public.communication_channel_bindings%rowtype;
  v_business_status text;
  v_integration record;
  v_invitation_hash text := lower(btrim(coalesce(p_invitation_token_hash, '')));
  v_session_hash text := lower(btrim(coalesce(p_session_token_hash, '')));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_now timestamptz := statement_timestamp();
begin
  if v_invitation_hash !~ '^[0-9a-f]{64}$'
     or v_session_hash !~ '^[0-9a-f]{64}$'
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid WhatsApp remote setup redemption request';
  end if;

  select a.*
    into v_attempt
    from public.communication_channel_setup_attempts a
   where a.remote_setup_invitation_token_hash = v_invitation_hash
   for update;

  if not found
     or v_attempt.status <> 'STARTED'
     or v_attempt.expires_at <= v_now
     or v_attempt.remote_setup_revoked_at is not null
     or v_attempt.remote_setup_invitation_created_at is null
     or v_attempt.remote_setup_invitation_expires_at is null
     or v_attempt.remote_setup_invitation_expires_at <= v_now
     or v_attempt.remote_setup_invitation_redeemed_at is not null
  then
    raise exception 'WhatsApp remote setup invitation is invalid, expired, redeemed or revoked';
  end if;

  select b.*
    into v_binding
    from public.communication_channel_bindings b
   where b.organization_id = v_attempt.organization_id
     and b.id = v_attempt.communication_channel_binding_id;

  if not found
     or v_binding.status <> 'ACTIVE'
     or v_binding.channel <> 'WHATSAPP'
     or v_binding.version <> v_attempt.binding_version
     or v_binding.tenant_business_id <> v_attempt.tenant_business_id
     or v_binding.branch_id is distinct from v_attempt.branch_id
  then
    raise exception 'canonical WhatsApp binding changed before remote setup redemption';
  end if;

  select tb.status
    into v_business_status
    from public.tenant_businesses tb
   where tb.organization_id = v_attempt.organization_id
     and tb.id = v_attempt.tenant_business_id;

  select ic.provider, ic.channel, ic.enabled
    into v_integration
    from public.integration_connections ic
   where ic.organization_id = v_attempt.organization_id
     and ic.id = v_binding.integration_connection_id;

  if v_business_status is distinct from 'ACTIVE'
     or v_integration.provider is distinct from 'META'
     or v_integration.channel is distinct from 'WHATSAPP'
     or v_integration.enabled is distinct from true
  then
    raise exception 'canonical Meta WhatsApp setup scope is not active';
  end if;

  update public.communication_channel_setup_attempts
     set status = 'AUTHORIZED',
         remote_setup_invitation_redeemed_at = v_now,
         remote_setup_session_token_hash = v_session_hash,
         remote_setup_session_expires_at = least(expires_at, v_now + interval '20 minutes'),
         last_request_key = v_request_key,
         version = version + 1,
         updated_at = v_now
   where id = v_attempt.id
     and version = v_attempt.version
  returning * into v_attempt;

  if not found then
    raise exception 'WhatsApp remote setup redemption lost optimistic state';
  end if;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id,
    after_data, tenant_business_id, branch_id
  ) values (
    v_attempt.organization_id,
    'SYSTEM',
    'whatsapp_setup_capability',
    'META_WHATSAPP_REMOTE_SETUP_INVITE_REDEEMED',
    'communication_channel_setup_attempt',
    v_attempt.id::text,
    jsonb_build_object(
      'capability', 'WHATSAPP_SETUP',
      'binding_id', v_attempt.communication_channel_binding_id,
      'binding_version', v_attempt.binding_version,
      'connection_mode', v_attempt.connection_mode,
      'purpose', v_attempt.purpose,
      'session_expires_at', v_attempt.remote_setup_session_expires_at
    ),
    v_attempt.tenant_business_id,
    v_attempt.branch_id
  );

  return v_attempt;
end;
$$;

create or replace function public.get_meta_whatsapp_remote_setup_context(
  p_session_token_hash text
)
returns table(
  attempt_id uuid,
  attempt_version integer,
  organization_id uuid,
  tenant_business_id uuid,
  branch_id uuid,
  binding_id uuid,
  binding_version integer,
  connection_mode text,
  purpose text,
  session_expires_at timestamptz
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
    a.organization_id,
    a.tenant_business_id,
    a.branch_id,
    a.communication_channel_binding_id,
    a.binding_version,
    a.connection_mode,
    a.purpose,
    a.remote_setup_session_expires_at
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
    and a.status = 'AUTHORIZED'
    and a.remote_setup_revoked_at is null
    and a.expires_at > v_now
    and a.remote_setup_session_expires_at is not null
    and a.remote_setup_session_expires_at > v_now
    and b.status = 'ACTIVE'
    and b.channel = 'WHATSAPP'
    and b.version = a.binding_version
    and b.tenant_business_id = a.tenant_business_id
    and b.branch_id is not distinct from a.branch_id
    and tb.status = 'ACTIVE'
    and ic.provider = 'META'
    and ic.channel = 'WHATSAPP'
    and ic.enabled = true
  limit 1;
end;
$$;

create or replace function public.revoke_meta_whatsapp_remote_setup_invite(
  p_organization_id uuid,
  p_attempt_id uuid,
  p_binding_id uuid,
  p_expected_attempt_version integer,
  p_actor_user_id uuid,
  p_request_key text
)
returns public.communication_channel_setup_attempts
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_attempt public.communication_channel_setup_attempts%rowtype;
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_now timestamptz := statement_timestamp();
begin
  if p_organization_id is null
     or p_attempt_id is null
     or p_binding_id is null
     or p_actor_user_id is null
     or p_expected_attempt_version is null
     or p_expected_attempt_version < 1
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid WhatsApp remote setup revoke request';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.role = 'OWNER'
  ) then
    raise exception 'Organization OWNER required for WhatsApp remote setup revoke';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_binding_id::text, 0));

  select a.*
    into v_attempt
    from public.communication_channel_setup_attempts a
   where a.organization_id = p_organization_id
     and a.id = p_attempt_id
     and a.communication_channel_binding_id = p_binding_id
   for update;

  if not found
     or v_attempt.status = 'COMPLETED'
     or v_attempt.version <> p_expected_attempt_version
  then
    raise exception 'WhatsApp remote setup attempt changed before revoke';
  end if;

  update public.communication_channel_setup_attempts
     set status = 'STARTED',
         remote_setup_session_token_hash = null,
         remote_setup_session_expires_at = null,
         remote_setup_revoked_at = v_now,
         last_request_key = v_request_key,
         version = version + 1,
         updated_at = v_now
   where organization_id = p_organization_id
     and id = p_attempt_id
     and version = p_expected_attempt_version
  returning * into v_attempt;

  if not found then
    raise exception 'WhatsApp remote setup revoke lost optimistic state';
  end if;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id,
    after_data, tenant_business_id, branch_id
  ) values (
    p_organization_id,
    'USER',
    p_actor_user_id::text,
    'META_WHATSAPP_REMOTE_SETUP_REVOKED',
    'communication_channel_setup_attempt',
    p_attempt_id::text,
    jsonb_build_object(
      'capability', 'WHATSAPP_SETUP',
      'binding_id', p_binding_id,
      'attempt_version', v_attempt.version
    ),
    v_attempt.tenant_business_id,
    v_attempt.branch_id
  );

  return v_attempt;
end;
$$;

revoke all on function public.issue_meta_whatsapp_remote_setup_invite(
  uuid,uuid,uuid,integer,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.issue_meta_whatsapp_remote_setup_invite(
  uuid,uuid,uuid,integer,text,uuid,text
) to service_role;

revoke all on function public.redeem_meta_whatsapp_remote_setup_invite(
  text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.redeem_meta_whatsapp_remote_setup_invite(
  text,text,text
) to service_role;

revoke all on function public.get_meta_whatsapp_remote_setup_context(
  text
) from public, anon, authenticated, service_role;
grant execute on function public.get_meta_whatsapp_remote_setup_context(
  text
) to service_role;

revoke all on function public.revoke_meta_whatsapp_remote_setup_invite(
  uuid,uuid,uuid,integer,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.revoke_meta_whatsapp_remote_setup_invite(
  uuid,uuid,uuid,integer,uuid,text
) to service_role;
