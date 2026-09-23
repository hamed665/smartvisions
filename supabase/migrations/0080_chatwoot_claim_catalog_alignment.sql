-- C3B claim catalog alignment. Preserve OWNER authorization, SECURITY INVOKER,
-- request-key/payload replay semantics and existing ACL of the 0077 function.
-- 0078 expanded table constraints, but the function's own whitelist remained Slice A-only.

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
begin
  if auth.uid() is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot bridge mutation not permitted';
  end if;

  if coalesce(current_setting('smartvisions.chatwoot_bridge_command', true), '') <> '1' then
    raise exception 'Chatwoot bridge command claim requires governed command context';
  end if;

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
       'SET_TEAM_MAPPING_STATE'
     )
     or v_entity_type not in (
       'COMMUNICATION_CHANNEL_BINDING',
       'CHATWOOT_ACCOUNT_MAPPING',
       'CHATWOOT_USER_MAPPING',
       'CHATWOOT_ACCOUNT_MEMBERSHIP',
       'CHATWOOT_INBOX_MAPPING',
       'CHATWOOT_TEAM_MAPPING'
     )
     or v_entity_type <> case v_command_type
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
     end
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
