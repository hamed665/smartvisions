-- 0100: COMM-UNIFIED-INBOX governed private internal notes.
--
-- Extends the existing Chatwoot bridge command claim ledger. It does not add
-- another queue or Conversation store. Note content is never stored in the
-- claim ledger; only the existing payload hash is durable Smart Core evidence.
-- Chatwoot remains the Communication Plane note store.
--
-- Chatwoot v4.18 message creation has no server-side idempotency key. Runtime
-- therefore claims first, writes a private note with a durable request marker
-- in content_attributes, and reconciles by that marker before reporting success.
-- Ambiguous outcomes are never blindly retried.

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
    'CLAIM_ACCOUNT_EXTERNAL_CREATE',
    'SET_CONVERSATION_STATUS',
    'SET_CONVERSATION_LABELS',
    'SET_CONVERSATION_ASSIGNEE',
    'SET_CONVERSATION_TEAM',
    'CREATE_INTERNAL_NOTE'
  ));

create or replace function public.claim_unified_inbox_action(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_request_key text,
  p_action text,
  p_payload jsonb
)
returns table(
  is_new boolean,
  projection_id uuid,
  claimed_projection_version integer,
  current_projection_version integer,
  brand_id uuid,
  tenant_business_id uuid,
  branch_id uuid,
  department_id uuid,
  team_id uuid,
  chatwoot_conversation_display_id integer
)
language plpgsql
security invoker
set search_path = public, auth, extensions, pg_catalog
as $$
declare
  v_projection public.unified_inbox_conversation_projections%rowtype;
  v_existing public.chatwoot_bridge_command_claims%rowtype;
  v_actor uuid := auth.uid();
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_action text := upper(trim(coalesce(p_action, '')));
  v_command_type text;
  v_payload jsonb := coalesce(p_payload, 'null'::jsonb);
  v_payload_hash text;
  v_uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if v_actor is null
     or p_organization_id is null
     or p_conversation_id is null
     or length(v_request_key) not between 1 and 200
     or jsonb_typeof(v_payload) <> 'object'
     or (
       v_action <> 'INTERNAL_NOTE'
       and octet_length(v_payload::text) > 4096
     )
     or (
       v_action = 'INTERNAL_NOTE'
       and octet_length(v_payload::text) > 50000
     )
  then
    raise exception 'invalid Unified Inbox action claim';
  end if;

  select *
    into v_projection
    from public.unified_inbox_conversation_projections p
   where p.organization_id = p_organization_id
     and p.conversation_id = p_conversation_id
     and p.lifecycle_status in ('ACTIVE','DEGRADED');

  if not found
     or not public.can_manage_unified_inbox_projection(
       p_organization_id,
       v_projection.id
     )
  then
    raise exception 'Unified Inbox action not permitted';
  end if;

  if v_action = 'STATUS' then
    v_command_type := 'SET_CONVERSATION_STATUS';
    if (v_payload - array['status','snoozedUntil']) <> '{}'::jsonb
       or coalesce(v_payload->>'status','') not in ('open','resolved','pending','snoozed')
       or (
         v_payload ? 'snoozedUntil'
         and jsonb_typeof(v_payload->'snoozedUntil') not in ('number','null')
       )
       or (
         coalesce(v_payload->>'status','') <> 'snoozed'
         and v_payload ? 'snoozedUntil'
         and jsonb_typeof(v_payload->'snoozedUntil') <> 'null'
       )
    then
      raise exception 'invalid Unified Inbox status action payload';
    end if;
  elsif v_action = 'LABELS' then
    v_command_type := 'SET_CONVERSATION_LABELS';
    if (v_payload - array['labels']) <> '{}'::jsonb
       or jsonb_typeof(v_payload->'labels') <> 'array'
       or jsonb_array_length(v_payload->'labels') > 50
       or exists (
         select 1
           from jsonb_array_elements(v_payload->'labels') e
          where jsonb_typeof(e) <> 'string'
             or length(trim(e #>> '{}')) not between 1 and 120
       )
    then
      raise exception 'invalid Unified Inbox labels action payload';
    end if;
  elsif v_action = 'ASSIGNEE' then
    v_command_type := 'SET_CONVERSATION_ASSIGNEE';
    if (v_payload - array['smartUserId']) <> '{}'::jsonb
       or not (v_payload ? 'smartUserId')
       or (
         jsonb_typeof(v_payload->'smartUserId') <> 'null'
         and (
           jsonb_typeof(v_payload->'smartUserId') <> 'string'
           or lower(v_payload->>'smartUserId') !~ v_uuid_re
         )
       )
    then
      raise exception 'invalid Unified Inbox assignee action payload';
    end if;
  elsif v_action = 'TEAM' then
    v_command_type := 'SET_CONVERSATION_TEAM';
    if (v_payload - array['teamId']) <> '{}'::jsonb
       or not (v_payload ? 'teamId')
       or (
         jsonb_typeof(v_payload->'teamId') <> 'null'
         and (
           jsonb_typeof(v_payload->'teamId') <> 'string'
           or lower(v_payload->>'teamId') !~ v_uuid_re
         )
       )
    then
      raise exception 'invalid Unified Inbox team action payload';
    end if;
  elsif v_action = 'INTERNAL_NOTE' then
    v_command_type := 'CREATE_INTERNAL_NOTE';
    if (v_payload - array['content']) <> '{}'::jsonb
       or jsonb_typeof(v_payload->'content') <> 'string'
       or length(trim(v_payload->>'content')) not between 1 and 10000
    then
      raise exception 'invalid Unified Inbox internal note payload';
    end if;
  else
    raise exception 'unsupported Unified Inbox action';
  end if;

  v_payload_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'action', v_action,
        'conversationId', p_conversation_id,
        'payload', v_payload
      )::text,
      'sha256'
    ),
    'hex'
  );

  select *
    into v_existing
    from public.chatwoot_bridge_command_claims c
   where c.organization_id = p_organization_id
     and c.request_key = v_request_key;

  if found then
    if v_existing.command_type <> v_command_type
       or v_existing.entity_type <> 'UNIFIED_INBOX_PROJECTION'
       or v_existing.entity_id <> v_projection.id
       or v_existing.payload_hash <> v_payload_hash
    then
      raise exception 'request key already used with different Unified Inbox action payload';
    end if;

    return query
    select
      false,
      v_projection.id,
      v_existing.applied_version,
      v_projection.version,
      v_projection.brand_id,
      v_projection.tenant_business_id,
      v_projection.branch_id,
      v_projection.department_id,
      v_projection.team_id,
      v_projection.chatwoot_conversation_display_id;
    return;
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

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
    'UNIFIED_INBOX_PROJECTION',
    v_projection.id,
    v_projection.version,
    v_payload_hash,
    v_actor
  );

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);

  return query
  select
    true,
    v_projection.id,
    v_projection.version,
    v_projection.version,
    v_projection.brand_id,
    v_projection.tenant_business_id,
    v_projection.branch_id,
    v_projection.department_id,
    v_projection.team_id,
    v_projection.chatwoot_conversation_display_id;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

revoke all on function public.claim_unified_inbox_action(
  uuid,uuid,text,text,jsonb
) from public, anon, service_role;
grant execute on function public.claim_unified_inbox_action(
  uuid,uuid,text,text,jsonb
) to authenticated;
