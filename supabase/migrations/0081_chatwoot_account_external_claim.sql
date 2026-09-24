-- C3B Account external attempt claim, reusing the existing command ledger.
-- One committed attempt per Account mapping; later calls reconcile, never POST blindly.
-- This migration does not invoke Chatwoot or authorize provider sends.

alter table public.chatwoot_bridge_command_claims
  drop constraint chatwoot_bridge_command_claims_command_type_check;

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
    'SET_TEAM_MAPPING_STATE',
    'CLAIM_ACCOUNT_EXTERNAL_CREATE'
  ));

create unique index chatwoot_account_one_external_create_attempt
  on public.chatwoot_bridge_command_claims(organization_id, entity_id)
  where command_type = 'CLAIM_ACCOUNT_EXTERNAL_CREATE'
    and entity_type = 'CHATWOOT_ACCOUNT_MAPPING';

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
  v_expected_entity_type text;
begin
  if auth.uid() is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot bridge mutation not permitted';
  end if;

  if coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') <> '1' then
    raise exception 'Chatwoot bridge command claim requires governed command context';
  end if;

  select case v_command_type
    when 'CREATE_CHANNEL_BINDING' then 'COMMUNICATION_CHANNEL_BINDING'
    when 'SET_CHANNEL_BINDING_LIFECYCLE' then 'COMMUNICATION_CHANNEL_BINDING'
    when 'CREATE_ACCOUNT_MAPPING' then 'CHATWOOT_ACCOUNT_MAPPING'
    when 'SET_ACCOUNT_MAPPING_STATE' then 'CHATWOOT_ACCOUNT_MAPPING'
    when 'CREATE_USER_MAPPING' then 'CHATWOOT_USER_MAPPING'
    when 'SET_USER_MAPPING_STATE' then 'CHATWOOT_USER_MAPPING'
    when 'CREATE_ACCOUNT_MEMBERSHIP' then 'CHATWOOT_ACCOUNT_MEMBERSHIP'
    when 'SET_ACCOUNT_MEMBERSHIP_STATE' then 'CHATWOOT_ACCOUNT_MEMBERSHIP'
    when 'CREATE_INBOX_MAPPING' then 'CHATWOOT_INBOX_MAPPING'
    when 'SET_INBOX_MAPPING_STATE' then 'CHATWOOT_INBOX_MAPPING'
    when 'CREATE_TEAM_MAPPING' then 'CHATWOOT_TEAM_MAPPING'
    when 'SET_TEAM_MAPPING_STATE' then 'CHATWOOT_TEAM_MAPPING'
    when 'CLAIM_ACCOUNT_EXTERNAL_CREATE' then 'CHATWOOT_ACCOUNT_MAPPING'
    else null
  end
  into v_expected_entity_type;

  if length(v_request_key) not between 1 and 200
     or v_command_type not in (
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
       'SET_TEAM_MAPPING_STATE',
       'CLAIM_ACCOUNT_EXTERNAL_CREATE'
     )
     or v_entity_type not in (
       'COMMUNICATION_CHANNEL_BINDING',
       'CHATWOOT_ACCOUNT_MAPPING',
       'CHATWOOT_USER_MAPPING',
       'CHATWOOT_ACCOUNT_MEMBERSHIP',
       'CHATWOOT_INBOX_MAPPING',
       'CHATWOOT_TEAM_MAPPING'
     )
     or v_expected_entity_type is null
     or v_entity_type <> v_expected_entity_type
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
         or v_existing.applied_version <> p_applied_version
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


create or replace function public.claim_chatwoot_account_external_create(
  p_organization_id uuid,
  p_mapping_id uuid,
  p_request_key text
)
returns table(
  may_attempt_create boolean,
  mapping_id uuid,
  tenant_business_id uuid,
  mapping_version integer
)
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $account_claim$
declare
  v_mapping public.chatwoot_account_mappings%rowtype;
  v_claim record;
  v_existing_request_key text;
  v_payload_hash text;
begin
  if auth.uid() is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot Account external claim not permitted';
  end if;

  select * into v_mapping
  from public.chatwoot_account_mappings m
  where m.organization_id = p_organization_id
    and m.id = p_mapping_id
  for update;

  if not found
     or v_mapping.status not in ('PROVISIONING','DEGRADED')
     or v_mapping.chatwoot_account_id is not null
  then
    raise exception 'Chatwoot Account mapping is not eligible for an external create attempt';
  end if;

  if not exists (
    select 1 from public.tenant_businesses b
    where b.organization_id = v_mapping.organization_id
      and b.id = v_mapping.tenant_business_id
      and b.status = 'ACTIVE'
  ) then
    raise exception 'Chatwoot Account external claim requires ACTIVE tenant Business';
  end if;

  select c.request_key into v_existing_request_key
  from public.chatwoot_bridge_command_claims c
  where c.organization_id = p_organization_id
    and c.command_type = 'CLAIM_ACCOUNT_EXTERNAL_CREATE'
    and c.entity_type = 'CHATWOOT_ACCOUNT_MAPPING'
    and c.entity_id = p_mapping_id;

  if found and v_existing_request_key <> trim(coalesce(p_request_key, '')) then
    raise exception 'Chatwoot Account external attempt already claimed; reconcile';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId',v_mapping.organization_id,
    'mappingId',v_mapping.id,
    'tenantBusinessId',v_mapping.tenant_business_id,
    'version',v_mapping.version,
    'command','CLAIM_ACCOUNT_EXTERNAL_CREATE'
  )::text, 'sha256'), 'hex');

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);
  select * into v_claim from public.claim_chatwoot_bridge_command(
    p_organization_id,
    p_request_key,
    'CLAIM_ACCOUNT_EXTERNAL_CREATE',
    'CHATWOOT_ACCOUNT_MAPPING',
    p_mapping_id,
    v_mapping.version,
    v_payload_hash
  );
  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);

  return query select v_claim.is_new, v_mapping.id, v_mapping.tenant_business_id,
                      v_mapping.version;
exception when others then
  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  raise;
end;
$account_claim$;

revoke all on function public.claim_chatwoot_account_external_create(uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_chatwoot_account_external_create(uuid,uuid,text)
  to authenticated;
