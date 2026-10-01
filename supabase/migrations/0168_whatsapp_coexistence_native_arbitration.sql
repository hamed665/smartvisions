-- 0168: WhatsApp Business App native activity arbitration.
-- Extends existing canonical WhatsApp message/journal + human takeover authorities only.
-- Coexistence activation remains fail-closed until official provider/runtime eligibility is verified.

create or replace function public.claim_whatsapp_native_human_takeover(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_lead_id uuid,
  p_provider_message_id text,
  p_occurred_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $native_takeover$
declare
  v_provider text:=trim(coalesce(p_provider_message_id,''));
  v_request_key text;
  v_message public.conversation_messages%rowtype;
  v_conversation public.sales_conversations%rowtype;
  v_lead public.leads%rowtype;
  v_existing public.handoff_events%rowtype;
  v_from_mode public.agent_mode;
  v_occurred_at timestamptz:=coalesce(p_occurred_at,statement_timestamp());
begin
  if p_organization_id is null
     or p_conversation_id is null
     or p_lead_id is null
     or length(v_provider) not between 1 and 200 then
    raise exception 'invalid WhatsApp native takeover identity';
  end if;

  v_request_key:='whatsapp-native:'||v_provider;

  select * into v_message
    from public.conversation_messages m
   where m.organization_id=p_organization_id
     and m.conversation_id=p_conversation_id
     and m.lead_id=p_lead_id
     and m.channel='WHATSAPP'
     and m.direction='OUTBOUND'
     and m.provenance='HUMAN_NATIVE_WHATSAPP'
     and m.source_plane='META_WHATSAPP'
     and m.source_message_id=v_provider
   order by m.created_at desc,m.id
   limit 1;
  if not found then
    raise exception 'canonical WhatsApp native human message required';
  end if;

  select * into v_conversation
    from public.sales_conversations sc
   where sc.organization_id=p_organization_id
     and sc.id=p_conversation_id
     and sc.lead_id=p_lead_id
     and sc.channel='WHATSAPP'
   for update;
  if not found then
    raise exception 'canonical WhatsApp conversation unavailable';
  end if;

  select * into v_lead
    from public.leads l
   where l.organization_id=p_organization_id
     and l.id=p_lead_id
   for update;
  if not found then
    raise exception 'canonical WhatsApp lead unavailable';
  end if;

  select * into v_existing
    from public.handoff_events h
   where h.organization_id=p_organization_id
     and h.request_key=v_request_key
   limit 1;
  if found then
    if v_existing.conversation_id<>p_conversation_id or v_existing.lead_id<>p_lead_id then
      raise exception 'WhatsApp native takeover replay scope mismatch';
    end if;
    return jsonb_build_object(
      'claimed',false,
      'replayed',true,
      'reason','WHATSAPP_NATIVE_ACTIVITY_ALREADY_APPLIED',
      'conversation_id',p_conversation_id,
      'lead_id',p_lead_id
    );
  end if;

  if v_conversation.stage in ('WON','LOST','DO_NOT_CONTACT','SPAM')
     or v_lead.status in ('WON','LOST','DO_NOT_CONTACT') then
    return jsonb_build_object(
      'claimed',false,
      'replayed',false,
      'reason','TERMINAL_STATE',
      'conversation_id',p_conversation_id,
      'lead_id',p_lead_id
    );
  end if;

  v_from_mode:=coalesce(v_conversation.agent_mode,v_lead.agent_mode,'AUTO'::public.agent_mode);

  update public.leads
     set agent_mode='HUMAN',
         updated_at=statement_timestamp()
   where organization_id=p_organization_id
     and id=p_lead_id;

  update public.sales_conversations
     set agent_mode='HUMAN',
         requires_human=true,
         awaiting_party='HUMAN',
         stage_reason='WHATSAPP_NATIVE_ACTIVITY',
         last_outbound_at=case
           when last_outbound_at is null or v_occurred_at>last_outbound_at then v_occurred_at
           else last_outbound_at
         end,
         last_message_at=case
           when last_message_at is null or v_occurred_at>last_message_at then v_occurred_at
           else last_message_at
         end,
         updated_at=statement_timestamp()
   where organization_id=p_organization_id
     and id=p_conversation_id;

  insert into public.handoff_events(
    organization_id,lead_id,conversation_id,from_mode,to_mode,reasons,
    actor_type,actor_id,request_key
  ) values (
    p_organization_id,p_lead_id,p_conversation_id,v_from_mode,'HUMAN',
    jsonb_build_array('WHATSAPP_NATIVE_ACTIVITY'),
    'SYSTEM','meta-whatsapp-native',v_request_key
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data
  ) values (
    p_organization_id,
    'SYSTEM',
    'meta-whatsapp-native',
    'WHATSAPP_NATIVE_HUMAN_TAKEOVER',
    'sales_conversation',
    p_conversation_id::text,
    jsonb_build_object(
      'lead_agent_mode',v_lead.agent_mode,
      'conversation_agent_mode',v_conversation.agent_mode,
      'requires_human',v_conversation.requires_human,
      'awaiting_party',v_conversation.awaiting_party
    ),
    jsonb_build_object(
      'lead_agent_mode','HUMAN',
      'conversation_agent_mode','HUMAN',
      'requires_human',true,
      'awaiting_party','HUMAN',
      'provider_message_id',v_provider,
      'occurred_at',v_occurred_at
    )
  );

  return jsonb_build_object(
    'claimed',true,
    'replayed',false,
    'reason','WHATSAPP_NATIVE_ACTIVITY',
    'conversation_id',p_conversation_id,
    'lead_id',p_lead_id
  );
end
$native_takeover$;

revoke all on function public.claim_whatsapp_native_human_takeover(uuid,uuid,uuid,text,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_whatsapp_native_human_takeover(uuid,uuid,uuid,text,timestamptz)
  to service_role;

create or replace function public.claim_whatsapp_native_chatwoot_sync(
  p_organization_id uuid,
  p_provider_message_id text
)
returns table(
  event_id uuid,
  claimed boolean,
  sync_status text,
  chatwoot_message_id bigint,
  lead_id uuid,
  conversation_id uuid
)
language plpgsql
security definer
set search_path=public,pg_catalog
as $native_claim$
declare
  e public.whatsapp_events%rowtype;
  v_provider text:=trim(coalesce(p_provider_message_id,''));
begin
  if p_organization_id is null or length(v_provider) not between 1 and 512 then
    raise exception 'invalid WhatsApp native Chatwoot sync identity';
  end if;

  select * into e
    from public.whatsapp_events
   where organization_id=p_organization_id
     and provider_message_id=v_provider
     and direction='OUTBOUND'
     and event_type like 'SMB_MESSAGE_ECHO_%'
   order by created_at,id
   limit 1
   for update;

  if not found or e.conversation_id is null or e.lead_id is null then
    raise exception 'linked WhatsApp native journal event required';
  end if;

  if e.chatwoot_sync_status='ACCEPTED' then
    return query select e.id,false,'ACCEPTED'::text,e.chatwoot_message_id,e.lead_id,e.conversation_id;
    return;
  end if;

  if e.chatwoot_sync_status in ('PROCESSING','RECONCILIATION_REQUIRED') then
    return query select e.id,false,e.chatwoot_sync_status,e.chatwoot_message_id,e.lead_id,e.conversation_id;
    return;
  end if;

  if coalesce(e.chatwoot_sync_status,'PENDING')<>'PENDING' then
    raise exception 'invalid WhatsApp native Chatwoot sync state';
  end if;

  update public.whatsapp_events
     set chatwoot_sync_status='PROCESSING'
   where id=e.id;

  return query select e.id,true,'PROCESSING'::text,null::bigint,e.lead_id,e.conversation_id;
end
$native_claim$;

revoke all on function public.claim_whatsapp_native_chatwoot_sync(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_whatsapp_native_chatwoot_sync(uuid,text)
  to service_role;

create or replace function public.finalize_whatsapp_native_chatwoot_sync(
  p_event_id uuid,
  p_status text,
  p_chatwoot_message_id bigint default null
)
returns table(sync_status text,chatwoot_message_id bigint)
language plpgsql
security definer
set search_path=public,pg_catalog
as $native_finalize$
declare
  e public.whatsapp_events%rowtype;
  v_status text:=upper(trim(coalesce(p_status,'')));
begin
  if v_status not in ('ACCEPTED','RECONCILIATION_REQUIRED') then
    raise exception 'invalid WhatsApp native Chatwoot finalization state';
  end if;
  if v_status='ACCEPTED' and (p_chatwoot_message_id is null or p_chatwoot_message_id<=0) then
    raise exception 'accepted Chatwoot message id required';
  end if;
  if v_status='RECONCILIATION_REQUIRED' and p_chatwoot_message_id is not null then
    raise exception 'ambiguous Chatwoot result cannot assert a message id';
  end if;

  select * into e
    from public.whatsapp_events
   where id=p_event_id
     and direction='OUTBOUND'
     and event_type like 'SMB_MESSAGE_ECHO_%'
   for update;
  if not found then raise exception 'WhatsApp native journal event unavailable'; end if;

  if e.chatwoot_sync_status='ACCEPTED' then
    if v_status='ACCEPTED' and e.chatwoot_message_id=p_chatwoot_message_id then
      return query select e.chatwoot_sync_status,e.chatwoot_message_id;
      return;
    end if;
    raise exception 'accepted WhatsApp native Chatwoot sync is terminal';
  end if;

  if e.chatwoot_sync_status='RECONCILIATION_REQUIRED' then
    if v_status='RECONCILIATION_REQUIRED' then
      return query select e.chatwoot_sync_status,e.chatwoot_message_id;
      return;
    end if;
    raise exception 'ambiguous WhatsApp native Chatwoot sync requires operator reconciliation';
  end if;

  if e.chatwoot_sync_status<>'PROCESSING' then
    raise exception 'WhatsApp native Chatwoot sync was not claimed';
  end if;

  update public.whatsapp_events
     set chatwoot_sync_status=v_status,
         chatwoot_message_id=case when v_status='ACCEPTED' then p_chatwoot_message_id else null end,
         chatwoot_synced_at=statement_timestamp()
   where id=e.id
  returning public.whatsapp_events.chatwoot_sync_status,
            public.whatsapp_events.chatwoot_message_id
       into sync_status,chatwoot_message_id;

  return next;
end
$native_finalize$;

revoke all on function public.finalize_whatsapp_native_chatwoot_sync(uuid,text,bigint)
  from public,anon,authenticated,service_role;
grant execute on function public.finalize_whatsapp_native_chatwoot_sync(uuid,text,bigint)
  to service_role;
