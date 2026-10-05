-- Controlled activation path for official WhatsApp Business App Coexistence.
-- Reuses the canonical setup-attempt, binding and Vault credential authorities.
-- Application/runtime capability remains fail-closed through META_WHATSAPP_COEXISTENCE_ENABLED.
-- No destructive migration path is introduced.

CREATE OR REPLACE FUNCTION public.complete_meta_whatsapp_setup_attempt(p_organization_id uuid, p_attempt_id uuid, p_binding_id uuid, p_expected_binding_version integer, p_waba_id text, p_phone_number_id text, p_display_phone_number text, p_access_token text, p_actor_user_id uuid, p_request_key text)
 RETURNS communication_channel_bindings
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
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
$function$


revoke all on function public.complete_meta_whatsapp_setup_attempt(
  uuid,uuid,uuid,integer,text,text,text,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.complete_meta_whatsapp_setup_attempt(
  uuid,uuid,uuid,integer,text,text,text,text,uuid,text
) to service_role;

comment on function public.complete_meta_whatsapp_setup_attempt(
  uuid,uuid,uuid,integer,text,text,text,text,uuid,text
) is
  'Trusted Meta WhatsApp setup completion authority. Supports API new-number, reconnect and provider-verified Business App Coexistence attempts; application capability gating remains fail-closed before this service-role RPC.';
