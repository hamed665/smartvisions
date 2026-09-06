create or replace function public.claim_human_takeover(
  p_organization_id uuid,
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation public.sales_conversations%rowtype;
  v_lead public.leads%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = v_user_id
      and om.role = 'OWNER'
  ) then
    raise exception 'owner role required';
  end if;

  select * into v_conversation
  from public.sales_conversations sc
  where sc.organization_id = p_organization_id
    and sc.id = p_conversation_id
  for update;

  if not found then
    raise exception 'conversation not found';
  end if;

  if v_conversation.lead_id is null then
    raise exception 'conversation has no lead';
  end if;

  if v_conversation.stage in ('WON','LOST','DO_NOT_CONTACT','SPAM') then
    raise exception 'terminal conversation cannot enter owner takeover';
  end if;

  select * into v_lead
  from public.leads l
  where l.organization_id = p_organization_id
    and l.id = v_conversation.lead_id
  for update;

  if not found then
    raise exception 'lead not found';
  end if;

  if v_lead.status in ('WON','LOST','DO_NOT_CONTACT') then
    raise exception 'terminal lead cannot enter owner takeover';
  end if;

  if v_conversation.requires_human
     and coalesce(v_conversation.agent_mode, '') = 'HUMAN'
     and coalesce(v_lead.agent_mode, '') = 'HUMAN' then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'ALREADY_HUMAN',
      'conversation_id', v_conversation.id,
      'lead_id', v_lead.id
    );
  end if;

  update public.leads
  set agent_mode = 'HUMAN',
      updated_at = now()
  where organization_id = p_organization_id
    and id = v_lead.id;

  update public.sales_conversations
  set agent_mode = 'HUMAN',
      requires_human = true,
      awaiting_party = 'HUMAN',
      stage_reason = 'OWNER_TAKEOVER',
      updated_at = now()
  where organization_id = p_organization_id
    and id = v_conversation.id;

  v_result := jsonb_build_object(
    'claimed', true,
    'reason', 'OWNER_TAKEOVER',
    'conversation_id', v_conversation.id,
    'lead_id', v_lead.id,
    'previous', jsonb_build_object(
      'lead_status', v_lead.status,
      'lead_agent_mode', v_lead.agent_mode,
      'conversation_stage', v_conversation.stage,
      'conversation_agent_mode', v_conversation.agent_mode,
      'requires_human', v_conversation.requires_human,
      'awaiting_party', v_conversation.awaiting_party
    ),
    'current', jsonb_build_object(
      'lead_status', v_lead.status,
      'lead_agent_mode', 'HUMAN',
      'conversation_stage', v_conversation.stage,
      'conversation_agent_mode', 'HUMAN',
      'requires_human', true,
      'awaiting_party', 'HUMAN'
    )
  );

  insert into public.audit_logs (
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
    v_user_id,
    'CLAIM_HUMAN_TAKEOVER',
    'sales_conversation',
    p_conversation_id::text,
    v_result->'previous',
    v_result->'current'
  );

  return v_result;
end;
$$;

revoke all on function public.claim_human_takeover(uuid, uuid) from public;
revoke all on function public.claim_human_takeover(uuid, uuid) from anon;
grant execute on function public.claim_human_takeover(uuid, uuid) to authenticated;

create unique index if not exists conversation_messages_owner_request_unique
  on public.conversation_messages(organization_id, (metadata->>'owner_request_id'))
  where metadata->>'source' = 'OWNER_MANUAL_REPLY'
    and metadata ? 'owner_request_id';
