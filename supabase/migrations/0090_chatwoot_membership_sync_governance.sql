-- 0090: governed Chatwoot Inbox/Team membership reconciliation intent + bounded audit.
--
-- No redundant membership table is introduced. Canonical desired membership is
-- recomputed from Smart IAM + ACTIVE AccountUser projections. This migration
-- extends the existing Chatwoot command claim ledger and records only bounded
-- reconciliation evidence in audit_logs.

alter table public.chatwoot_bridge_command_claims
  drop constraint if exists chatwoot_bridge_command_claims_command_type_check;

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
    'SYNC_INBOX_MEMBERS',
    'SYNC_TEAM_MEMBERS'
  ));

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
       'SET_TEAM_MAPPING_STATE',
       'SYNC_INBOX_MEMBERS',
       'SYNC_TEAM_MEMBERS'
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
       when 'SYNC_INBOX_MEMBERS' then 'CHATWOOT_INBOX_MAPPING'
       when 'SYNC_TEAM_MEMBERS' then 'CHATWOOT_TEAM_MAPPING'
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

create or replace function public.claim_chatwoot_membership_sync(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_resource_kind text,
  p_mapping_id uuid,
  p_expected_mapping_version integer,
  p_desired_set_sha256 text,
  p_desired_count integer,
  p_request_key text
)
returns table(
  is_new boolean,
  entity_id uuid,
  applied_version integer,
  result_recorded boolean
)
language plpgsql
security invoker
set search_path = public, auth, extensions, pg_catalog
as $
declare
  v_actor uuid := auth.uid();
  v_kind text := upper(trim(coalesce(p_resource_kind, '')));
  v_hash text := lower(trim(coalesce(p_desired_set_sha256, '')));
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_command_type text;
  v_entity_type text;
  v_payload_hash text;
  v_claim record;
  v_account_mapping_id uuid;
  v_result_action text;
  v_result_recorded boolean := false;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot membership sync not permitted';
  end if;

  if v_kind not in ('INBOX','TEAM')
     or p_expected_mapping_version is null
     or p_expected_mapping_version < 1
     or p_desired_count is null
     or p_desired_count < 0
     or p_desired_count > 1000
     or v_hash !~ '^[0-9a-f]{64}$'
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Chatwoot membership sync claim';
  end if;

  if v_kind = 'INBOX' then
    select m.chatwoot_account_mapping_id
      into v_account_mapping_id
      from public.chatwoot_inbox_mappings m
     where m.organization_id = p_organization_id
       and m.tenant_business_id = p_tenant_business_id
       and m.id = p_mapping_id
       and m.version = p_expected_mapping_version
       and m.status = 'ACTIVE'
       and m.chatwoot_inbox_id is not null
       and m.channel_type = 'Channel::Api';

    v_command_type := 'SYNC_INBOX_MEMBERS';
    v_entity_type := 'CHATWOOT_INBOX_MAPPING';
    v_result_action := 'CHATWOOT_INBOX_MEMBERSHIP_RECONCILED';
  else
    select m.chatwoot_account_mapping_id
      into v_account_mapping_id
      from public.chatwoot_team_mappings m
     where m.organization_id = p_organization_id
       and m.tenant_business_id = p_tenant_business_id
       and m.id = p_mapping_id
       and m.version = p_expected_mapping_version
       and m.status = 'ACTIVE'
       and m.chatwoot_team_id is not null;

    v_command_type := 'SYNC_TEAM_MEMBERS';
    v_entity_type := 'CHATWOOT_TEAM_MAPPING';
    v_result_action := 'CHATWOOT_TEAM_MEMBERSHIP_RECONCILED';
  end if;

  if not found then
    raise exception 'ACTIVE Chatwoot membership target mapping/version required';
  end if;

  if not exists (
    select 1
      from public.chatwoot_account_mappings a
     where a.organization_id = p_organization_id
       and a.tenant_business_id = p_tenant_business_id
       and a.id = v_account_mapping_id
       and a.status = 'ACTIVE'
       and a.chatwoot_account_id is not null
  ) then
    raise exception 'ACTIVE Chatwoot Account mapping required for membership sync';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'resourceKind', v_kind,
    'mappingId', p_mapping_id,
    'mappingVersion', p_expected_mapping_version,
    'desiredSetSha256', v_hash,
    'desiredCount', p_desired_count
  )::text, 'sha256'), 'hex');

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      v_command_type,
      v_entity_type,
      p_mapping_id,
      p_expected_mapping_version,
      v_payload_hash
    );

  if v_claim.is_new then
    insert into public.audit_logs(
      organization_id,
      actor_type,
      actor_id,
      action,
      entity_type,
      entity_id,
      before_data,
      after_data
    ) values (
      p_organization_id,
      'USER',
      v_actor::text,
      case when v_kind = 'INBOX'
        then 'CHATWOOT_INBOX_MEMBERSHIP_SYNC_CLAIMED'
        else 'CHATWOOT_TEAM_MEMBERSHIP_SYNC_CLAIMED'
      end,
      case when v_kind = 'INBOX'
        then 'chatwoot_inbox_mappings'
        else 'chatwoot_team_mappings'
      end,
      p_mapping_id::text,
      null,
      jsonb_build_object(
        'tenant_business_id', p_tenant_business_id,
        'mapping_version', p_expected_mapping_version,
        'desired_count', p_desired_count,
        'desired_set_sha256', v_hash,
        'request_key', v_request_key
      )
    );
  end if;

  select exists (
    select 1
      from public.audit_logs a
     where a.organization_id = p_organization_id
       and a.action = v_result_action
       and a.entity_id = p_mapping_id::text
       and a.after_data->>'request_key' = v_request_key
  )
  into v_result_recorded;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);

  return query
  select
    v_claim.is_new,
    v_claim.entity_id,
    v_claim.applied_version,
    v_result_recorded;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

create or replace function public.record_chatwoot_membership_sync_result(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_resource_kind text,
  p_mapping_id uuid,
  p_mapping_version integer,
  p_desired_set_sha256 text,
  p_desired_count integer,
  p_observed_before_sha256 text,
  p_observed_before_count integer,
  p_observed_after_sha256 text,
  p_observed_after_count integer,
  p_mutation_attempted boolean,
  p_outcome text,
  p_request_key text
)
returns boolean
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
declare
  v_kind text := upper(trim(coalesce(p_resource_kind, '')));
  v_desired_hash text := lower(trim(coalesce(p_desired_set_sha256, '')));
  v_before_hash text := lower(trim(coalesce(p_observed_before_sha256, '')));
  v_after_hash text := lower(trim(coalesce(p_observed_after_sha256, '')));
  v_outcome text := upper(trim(coalesce(p_outcome, '')));
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_command_type text;
  v_entity_type text;
  v_action text;
  v_payload_hash text;
  v_claim public.chatwoot_bridge_command_claims%rowtype;
  v_existing_result public.audit_logs%rowtype;
begin
  if v_kind not in ('INBOX','TEAM')
     or p_mapping_version is null
     or p_mapping_version < 1
     or p_desired_count is null
     or p_desired_count < 0
     or p_desired_count > 1000
     or p_observed_before_count is null
     or p_observed_before_count < 0
     or p_observed_before_count > 1000
     or p_observed_after_count is null
     or p_observed_after_count < 0
     or p_observed_after_count > 1000
     or v_desired_hash !~ '^[0-9a-f]{64}$'
     or v_before_hash !~ '^[0-9a-f]{64}$'
     or v_after_hash !~ '^[0-9a-f]{64}$'
     or v_outcome not in (
       'ALREADY_MATCHED',
       'UPDATED_VERIFIED',
       'RECONCILED_AFTER_AMBIGUOUS_MUTATION',
       'AMBIGUOUS_UNRESOLVED',
       'DRIFT_UNRESOLVED'
     )
     or p_mutation_attempted is null
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Chatwoot membership sync result';
  end if;

  if v_outcome = 'ALREADY_MATCHED' then
    if p_mutation_attempted
       or v_before_hash <> v_desired_hash
       or p_observed_before_count <> p_desired_count
       or v_after_hash <> v_desired_hash
       or p_observed_after_count <> p_desired_count
    then
      raise exception 'ALREADY_MATCHED result evidence is inconsistent';
    end if;
  elsif v_outcome in ('UPDATED_VERIFIED','RECONCILED_AFTER_AMBIGUOUS_MUTATION') then
    if not p_mutation_attempted
       or v_after_hash <> v_desired_hash
       or p_observed_after_count <> p_desired_count
    then
      raise exception 'successful mutation result evidence is inconsistent';
    end if;
  else
    if not p_mutation_attempted then
      raise exception 'AMBIGUOUS_UNRESOLVED requires mutation attempt evidence';
    end if;
  end if;

  if v_kind = 'INBOX' then
    v_command_type := 'SYNC_INBOX_MEMBERS';
    v_entity_type := 'CHATWOOT_INBOX_MAPPING';
    v_action := 'CHATWOOT_INBOX_MEMBERSHIP_RECONCILED';

    if not exists (
      select 1
        from public.chatwoot_inbox_mappings m
       where m.organization_id = p_organization_id
         and m.tenant_business_id = p_tenant_business_id
         and m.id = p_mapping_id
         and m.version = p_mapping_version
         and m.status = 'ACTIVE'
    ) then
      raise exception 'ACTIVE Chatwoot Inbox mapping/version required for result';
    end if;
  else
    v_command_type := 'SYNC_TEAM_MEMBERS';
    v_entity_type := 'CHATWOOT_TEAM_MAPPING';
    v_action := 'CHATWOOT_TEAM_MEMBERSHIP_RECONCILED';

    if not exists (
      select 1
        from public.chatwoot_team_mappings m
       where m.organization_id = p_organization_id
         and m.tenant_business_id = p_tenant_business_id
         and m.id = p_mapping_id
         and m.version = p_mapping_version
         and m.status = 'ACTIVE'
    ) then
      raise exception 'ACTIVE Chatwoot Team mapping/version required for result';
    end if;
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'resourceKind', v_kind,
    'mappingId', p_mapping_id,
    'mappingVersion', p_mapping_version,
    'desiredSetSha256', v_desired_hash,
    'desiredCount', p_desired_count
  )::text, 'sha256'), 'hex');

  select *
    into v_claim
    from public.chatwoot_bridge_command_claims c
   where c.organization_id = p_organization_id
     and c.request_key = v_request_key;

  if not found
     or v_claim.command_type <> v_command_type
     or v_claim.entity_type <> v_entity_type
     or v_claim.entity_id <> p_mapping_id
     or v_claim.applied_version <> p_mapping_version
     or v_claim.payload_hash <> v_payload_hash
  then
    raise exception 'matching Chatwoot membership sync claim required for result';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || v_request_key,
      0
    )
  );

  select *
    into v_existing_result
    from public.audit_logs a
   where a.organization_id = p_organization_id
     and a.action = v_action
     and a.entity_id = p_mapping_id::text
     and a.after_data->>'request_key' = v_request_key
   order by a.created_at asc
   limit 1;

  if found then
    if v_existing_result.before_data is distinct from jsonb_build_object(
         'observed_count', p_observed_before_count,
         'observed_set_sha256', v_before_hash
       )
       or v_existing_result.after_data is distinct from jsonb_build_object(
         'tenant_business_id', p_tenant_business_id,
         'mapping_version', p_mapping_version,
         'desired_count', p_desired_count,
         'desired_set_sha256', v_desired_hash,
         'observed_count', p_observed_after_count,
         'observed_set_sha256', v_after_hash,
         'mutation_attempted', p_mutation_attempted,
         'outcome', v_outcome,
         'request_key', v_request_key
       )
    then
      raise exception 'Chatwoot membership sync result replay evidence mismatch';
    end if;

    return false;
  end if;

  insert into public.audit_logs(
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    p_organization_id,
    'SYSTEM',
    'chatwoot-membership-sync',
    v_action,
    case when v_kind = 'INBOX'
      then 'chatwoot_inbox_mappings'
      else 'chatwoot_team_mappings'
    end,
    p_mapping_id::text,
    jsonb_build_object(
      'observed_count', p_observed_before_count,
      'observed_set_sha256', v_before_hash
    ),
    jsonb_build_object(
      'tenant_business_id', p_tenant_business_id,
      'mapping_version', p_mapping_version,
      'desired_count', p_desired_count,
      'desired_set_sha256', v_desired_hash,
      'observed_count', p_observed_after_count,
      'observed_set_sha256', v_after_hash,
      'mutation_attempted', p_mutation_attempted,
      'outcome', v_outcome,
      'request_key', v_request_key
    )
  );

  return true;
end;
$$;

revoke all on function public.claim_chatwoot_membership_sync(
  uuid, uuid, text, uuid, integer, text, integer, text
) from public, anon, service_role;
grant execute on function public.claim_chatwoot_membership_sync(
  uuid, uuid, text, uuid, integer, text, integer, text
) to authenticated;

revoke all on function public.record_chatwoot_membership_sync_result(
  uuid, uuid, text, uuid, integer, text, integer, text, integer, text, integer, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.record_chatwoot_membership_sync_result(
  uuid, uuid, text, uuid, integer, text, integer, text, integer, text, integer, boolean, text, text
) to service_role;
