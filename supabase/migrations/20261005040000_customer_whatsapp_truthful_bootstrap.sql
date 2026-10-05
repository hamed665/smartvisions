-- PR4 closeout: truthful customer WhatsApp bootstrap.
-- Keep the canonical communication binding authority, but distinguish a logical
-- Meta WhatsApp setup slot (READY) from provider-verified connectivity (CONNECTED).
-- CONNECTED remains provider evidence written only after provisioning/verification.

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
set search_path to 'public', 'auth', 'pg_catalog'
as $function$
declare
  v_created public.communication_channel_bindings%rowtype;
  v_existing public.communication_channel_bindings%rowtype;
  v_claim record;
  v_actor uuid:=auth.uid();
  v_channel text:=upper(trim(coalesce(p_channel,'')));
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_payload_hash text;
  v_ic public.integration_connections%rowtype;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot bridge mutation not permitted';
  end if;

  if length(v_request_key) not between 1 and 200 then
    raise exception 'request key must contain 1..200 characters';
  end if;

  if v_channel not in (
    'EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT','TELEGRAM','TIKTOK',
    'SMS','RCS'
  ) then
    raise exception 'unsupported communication channel';
  end if;

  select *
    into v_ic
    from public.integration_connections
   where id=p_integration_connection_id
     and organization_id=p_organization_id;

  if not found
     or v_ic.enabled<>true
     or v_ic.channel<>v_channel
     or not (
       v_ic.status='CONNECTED'
       or (
         v_channel='WHATSAPP'
         and upper(trim(coalesce(v_ic.provider,'')))='META'
         and v_ic.status='READY'
       )
     )
  then
    raise exception 'CONNECTED integration connection or READY META WhatsApp setup slot for exact channel required';
  end if;

  v_payload_hash:=encode(extensions.digest(jsonb_build_object(
    'organizationId',p_organization_id,
    'tenantBusinessId',p_tenant_business_id,
    'branchId',p_branch_id,
    'integrationConnectionId',p_integration_connection_id,
    'channel',v_channel
  )::text,'sha256'),'hex');

  perform set_config('smartvisions.chatwoot_bridge_command','1',true);

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,v_request_key,'CREATE_CHANNEL_BINDING',
      'COMMUNICATION_CHANNEL_BINDING',null,1,v_payload_hash
    );

  if not v_claim.is_new then
    select *
      into v_existing
      from public.communication_channel_bindings
     where organization_id=p_organization_id
       and id=v_claim.entity_id;

    if not found then
      raise exception 'Chatwoot bridge command claim has no binding row';
    end if;

    perform set_config('smartvisions.chatwoot_bridge_command','0',true);
    return v_existing;
  end if;

  insert into public.communication_channel_bindings(
    id,organization_id,tenant_business_id,branch_id,integration_connection_id,
    channel,status,version,last_request_key,created_by_user_id,updated_by_user_id
  ) values(
    v_claim.entity_id,p_organization_id,p_tenant_business_id,p_branch_id,
    p_integration_connection_id,v_channel,'ACTIVE',1,v_request_key,v_actor,v_actor
  )
  returning * into v_created;

  perform set_config('smartvisions.chatwoot_bridge_command','0',true);
  return v_created;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command','0',true);
    raise;
end
$function$;

comment on function public.create_communication_channel_binding(uuid,uuid,uuid,uuid,text,text) is
  'Canonical communication binding command. Requires CONNECTED integration evidence, except a narrow READY META/WHATSAPP setup slot used before provider authorization. READY never means provider Connected.';
