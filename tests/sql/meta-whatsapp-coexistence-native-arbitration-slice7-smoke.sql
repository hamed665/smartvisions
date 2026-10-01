\set ON_ERROR_STOP on

begin;

insert into public.organizations(id,name) values
  ('00000000-0000-4000-8000-000000016801','Slice 7 smoke org');

insert into public.businesses(
  id,organization_id,name,country_code,whatsapp
) values (
  '10000000-0000-4000-8000-000000016801',
  '00000000-0000-4000-8000-000000016801',
  'Slice 7 existing customer','OM','+96891234567'
);

insert into public.leads(
  id,organization_id,business_id,status,agent_mode
) values (
  '20000000-0000-4000-8000-000000016801',
  '00000000-0000-4000-8000-000000016801',
  '10000000-0000-4000-8000-000000016801',
  'REPLIED','AUTO'
);

insert into public.sales_conversations(
  id,organization_id,lead_id,channel,agent_mode,requires_human
) values (
  '30000000-0000-4000-8000-000000016801',
  '00000000-0000-4000-8000-000000016801',
  '20000000-0000-4000-8000-000000016801',
  'WHATSAPP','AUTO',false
);

insert into public.conversation_messages(
  id,organization_id,conversation_id,lead_id,provider_message_id,
  channel,direction,media_type,original_text,status,provider_delivery_status,
  provenance,source_plane,source_message_id
) values (
  '40000000-0000-4000-8000-000000016801',
  '00000000-0000-4000-8000-000000016801',
  '30000000-0000-4000-8000-000000016801',
  '20000000-0000-4000-8000-000000016801',
  'wamid.slice7-native-live',
  'WHATSAPP','OUTBOUND','TEXT','native human reply','SENT','ACCEPTED',
  'HUMAN_NATIVE_WHATSAPP','META_WHATSAPP','wamid.slice7-native-live'
);

insert into public.whatsapp_events(
  id,organization_id,lead_id,conversation_id,provider_message_id,
  direction,event_type,payload,chatwoot_sync_status
) values (
  '80000000-0000-4000-8000-000000016801',
  '00000000-0000-4000-8000-000000016801',
  '20000000-0000-4000-8000-000000016801',
  '30000000-0000-4000-8000-000000016801',
  'wamid.slice7-native-live',
  'OUTBOUND','SMB_MESSAGE_ECHO_TEXT',
  jsonb_build_object(
    'routing',jsonb_build_object('bindingId','70000000-0000-4000-8000-000000016801'),
    'canonical',jsonb_build_object('messageId','40000000-0000-4000-8000-000000016801')
  ),
  'PENDING'
);

do $native_takeover$
declare
  first_result jsonb;
  replay_result jsonb;
begin
  select public.claim_whatsapp_native_human_takeover(
    '00000000-0000-4000-8000-000000016801',
    '30000000-0000-4000-8000-000000016801',
    '20000000-0000-4000-8000-000000016801',
    'wamid.slice7-native-live',
    statement_timestamp()
  ) into first_result;

  if coalesce((first_result->>'claimed')::boolean,false) is not true
     or first_result->>'reason'<>'WHATSAPP_NATIVE_ACTIVITY'
  then
    raise exception 'live native human message did not claim takeover';
  end if;

  if not exists (
    select 1 from public.leads
     where id='20000000-0000-4000-8000-000000016801'
       and organization_id='00000000-0000-4000-8000-000000016801'
       and agent_mode='HUMAN'
  ) then
    raise exception 'native human takeover did not move Lead to HUMAN';
  end if;

  if not exists (
    select 1 from public.sales_conversations
     where id='30000000-0000-4000-8000-000000016801'
       and organization_id='00000000-0000-4000-8000-000000016801'
       and agent_mode='HUMAN'
       and requires_human is true
       and awaiting_party='HUMAN'
       and stage_reason='WHATSAPP_NATIVE_ACTIVITY'
  ) then
    raise exception 'native human takeover did not lock canonical Conversation to HUMAN';
  end if;

  select public.claim_whatsapp_native_human_takeover(
    '00000000-0000-4000-8000-000000016801',
    '30000000-0000-4000-8000-000000016801',
    '20000000-0000-4000-8000-000000016801',
    'wamid.slice7-native-live',
    statement_timestamp()
  ) into replay_result;

  if coalesce((replay_result->>'replayed')::boolean,false) is not true
     or replay_result->>'reason'<>'WHATSAPP_NATIVE_ACTIVITY_ALREADY_APPLIED'
  then
    raise exception 'native human takeover replay was not idempotent';
  end if;

  if (
    select count(*)
      from public.handoff_events
     where organization_id='00000000-0000-4000-8000-000000016801'
       and request_key='whatsapp-native:wamid.slice7-native-live'
  ) <> 1 then
    raise exception 'native human takeover created duplicate handoff evidence';
  end if;
end
$native_takeover$;

do $history_is_not_live$
begin
  begin
    perform public.claim_whatsapp_native_human_takeover(
      '00000000-0000-4000-8000-000000016801',
      '30000000-0000-4000-8000-000000016801',
      '20000000-0000-4000-8000-000000016801',
      'wamid.slice7-history-only',
      statement_timestamp() - interval '1 day'
    );
    raise exception 'history-only evidence unexpectedly claimed a live takeover';
  exception
    when others then
      if sqlerrm='history-only evidence unexpectedly claimed a live takeover' then
        raise;
      end if;
      if position('canonical WhatsApp native human message required' in sqlerrm)=0 then
        raise;
      end if;
  end;
end
$history_is_not_live$;

do $native_chatwoot_reconciliation$
declare
  r record;
begin
  select * into r
  from public.claim_whatsapp_native_chatwoot_sync(
    '00000000-0000-4000-8000-000000016801',
    'wamid.slice7-native-live'
  );

  if r.claimed is not true or r.sync_status<>'PROCESSING' then
    raise exception 'native Chatwoot sync claim did not become PROCESSING';
  end if;

  select * into r
  from public.finalize_whatsapp_native_chatwoot_sync(
    '80000000-0000-4000-8000-000000016801',
    'ACCEPTED',
    16801
  );

  if r.sync_status<>'ACCEPTED' or r.chatwoot_message_id<>16801 then
    raise exception 'native Chatwoot sync did not finalize exact ACCEPTED identity';
  end if;

  select * into r
  from public.claim_whatsapp_native_chatwoot_sync(
    '00000000-0000-4000-8000-000000016801',
    'wamid.slice7-native-live'
  );

  if r.claimed is not false
     or r.sync_status<>'ACCEPTED'
     or r.chatwoot_message_id<>16801
  then
    raise exception 'native Chatwoot sync replay was not idempotent';
  end if;
end
$native_chatwoot_reconciliation$;

do $slice7_acl$
begin
  if has_function_privilege(
       'anon',
       'public.claim_whatsapp_native_human_takeover(uuid,uuid,uuid,text,timestamptz)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.claim_whatsapp_native_human_takeover(uuid,uuid,uuid,text,timestamptz)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.claim_whatsapp_native_human_takeover(uuid,uuid,uuid,text,timestamptz)',
       'EXECUTE'
     )
  then
    raise exception 'native human takeover ACL drifted';
  end if;

  if has_function_privilege(
       'anon',
       'public.claim_whatsapp_native_chatwoot_sync(uuid,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.claim_whatsapp_native_chatwoot_sync(uuid,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.claim_whatsapp_native_chatwoot_sync(uuid,text)',
       'EXECUTE'
     )
  then
    raise exception 'native Chatwoot claim ACL drifted';
  end if;

  if has_function_privilege(
       'anon',
       'public.finalize_whatsapp_native_chatwoot_sync(uuid,text,bigint)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.finalize_whatsapp_native_chatwoot_sync(uuid,text,bigint)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.finalize_whatsapp_native_chatwoot_sync(uuid,text,bigint)',
       'EXECUTE'
     )
  then
    raise exception 'native Chatwoot finalize ACL drifted';
  end if;
end
$slice7_acl$;

rollback;
