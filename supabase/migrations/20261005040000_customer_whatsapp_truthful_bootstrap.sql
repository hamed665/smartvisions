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

create or replace function public.enforce_communication_channel_binding_contract()
returns trigger
language plpgsql
set search_path to 'public', 'auth', 'pg_catalog'
as $function$
declare
  v_business_status text;
  v_branch_business_id uuid;
  v_branch_org_id uuid;
  v_branch_status text;
  v_connection_org_id uuid;
  v_connection_channel text;
  v_connection_provider text;
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

  select ic.organization_id, ic.channel, ic.provider, ic.enabled, ic.status
    into v_connection_org_id, v_connection_channel, v_connection_provider,
         v_connection_enabled, v_connection_status
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

    if not v_connection_enabled
       or not (
         v_connection_status = 'CONNECTED'
         or (
           new.channel = 'WHATSAPP'
           and upper(trim(coalesce(v_connection_provider,''))) = 'META'
           and v_connection_status = 'READY'
         )
       )
    then
      raise exception 'ACTIVE communication binding requires CONNECTED integration or READY META WhatsApp setup slot';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

comment on function public.enforce_communication_channel_binding_contract() is
  'Canonical communication binding invariant. ACTIVE normally requires CONNECTED integration; READY is permitted only for the pre-authorization META/WHATSAPP setup slot and is not provider-connected evidence.';

comment on function public.create_communication_channel_binding(uuid,uuid,uuid,uuid,text,text) is
  'Canonical communication binding command. Requires CONNECTED integration evidence, except a narrow READY META/WHATSAPP setup slot used before provider authorization. READY never means provider Connected.';
