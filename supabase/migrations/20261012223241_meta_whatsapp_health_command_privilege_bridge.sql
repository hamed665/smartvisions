-- Preserve the canonical health contract without broad table UPDATE grants.
-- The trusted service invokes a private command that validates the actual OWNER,
-- exact ACTIVE Meta binding, version and human disconnect before guarded writes.
create or replace function private.mark_meta_whatsapp_binding_health_internal(
  p_organization_id uuid,
  p_binding_id uuid,
  p_expected_version integer,
  p_health_state text,
  p_actor_user_id uuid,
  p_request_key text
)
returns public.communication_channel_bindings
language plpgsql
security definer
set search_path = ''
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

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_binding;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

create or replace function public.mark_meta_whatsapp_binding_health(
 p_organization_id uuid,p_binding_id uuid,p_expected_version integer,
 p_health_state text,p_actor_user_id uuid,p_request_key text
) returns public.communication_channel_bindings
language sql security invoker set search_path = ''
as $$
 select * from private.mark_meta_whatsapp_binding_health_internal(
  p_organization_id,p_binding_id,p_expected_version,p_health_state,p_actor_user_id,p_request_key);
$$;
revoke all on function private.mark_meta_whatsapp_binding_health_internal(uuid,uuid,integer,text,uuid,text)
 from public,anon,authenticated,service_role;
revoke all on function public.mark_meta_whatsapp_binding_health(uuid,uuid,integer,text,uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function private.mark_meta_whatsapp_binding_health_internal(uuid,uuid,integer,text,uuid,text) to service_role;
grant execute on function public.mark_meta_whatsapp_binding_health(uuid,uuid,integer,text,uuid,text) to service_role;
