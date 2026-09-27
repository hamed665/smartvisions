-- 0116: Web Chat signed Chatwoot outbound sync + session lifecycle.
-- Reuses the existing signed Chatwoot webhook journal and canonical conversation store.

create or replace function public.reconcile_web_chat_chatwoot_outbound_event(p_event_id uuid)
returns table(handled boolean,outcome text,message_id uuid,event_status text)
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  e public.chatwoot_webhook_events%rowtype;
  p public.unified_inbox_conversation_projections%rowtype;
  sc public.sales_conversations%rowtype;
  v_message_id bigint;
  v_display_id integer;
  v_provider_id text;
  v_content text;
  v_message uuid;
  v_existing public.conversation_messages%rowtype;
  v_created timestamptz;
  v_sender_id bigint;
  v_sender_type text;
begin
  select * into e from public.chatwoot_webhook_events where id=p_event_id for update;
  if not found then raise exception 'Chatwoot webhook event not found'; end if;

  if e.event_type <> 'message_created' then
    return query select false,'NOT_MESSAGE_CREATED'::text,null::uuid,e.status;
    return;
  end if;

  if lower(coalesce(e.payload->>'message_type','')) <> 'outgoing'
     or coalesce((e.payload->>'private')::boolean,false)=true
  then
    return query select false,'NOT_PUBLIC_OUTGOING'::text,null::uuid,e.status;
    return;
  end if;

  if coalesce(e.payload->>'id','') !~ '^[1-9][0-9]*$'
     or coalesce(e.payload->'conversation'->>'id','') !~ '^[1-9][0-9]*$'
  then
    raise exception 'invalid Chatwoot Web Chat message identity';
  end if;

  v_message_id := (e.payload->>'id')::bigint;
  v_display_id := (e.payload->'conversation'->>'id')::integer;
  v_provider_id := 'chatwoot:'||v_message_id::text;
  v_content := nullif(trim(coalesce(e.payload->>'content','')),'');
  if v_content is null then
    return query select false,'UNSUPPORTED_EMPTY_OR_ATTACHMENT_ONLY'::text,null::uuid,e.status;
    return;
  end if;

  begin
    v_created := nullif(e.payload->>'created_at','')::timestamptz;
  exception when others then
    raise exception 'invalid Chatwoot Web Chat message timestamp';
  end;
  v_created := coalesce(v_created,e.received_at);

  if coalesce(e.payload->'sender'->>'id','') ~ '^[1-9][0-9]*$' then
    v_sender_id := (e.payload->'sender'->>'id')::bigint;
  end if;
  v_sender_type := nullif(trim(coalesce(e.payload->'sender'->>'type',e.payload->'sender'->>'sender_type','')),'');

  select up.* into p
    from public.unified_inbox_conversation_projections up
   where up.organization_id=e.organization_id
     and up.tenant_business_id=e.tenant_business_id
     and up.chatwoot_inbox_mapping_id=e.chatwoot_inbox_mapping_id
     and up.chatwoot_conversation_display_id=v_display_id
     and up.lifecycle_status in('ACTIVE','DEGRADED')
   limit 2;

  if not found then
    return query select false,'NO_CANONICAL_PROJECTION'::text,null::uuid,e.status;
    return;
  end if;

  if exists(
    select 1 from public.unified_inbox_conversation_projections up
     where up.organization_id=e.organization_id
       and up.tenant_business_id=e.tenant_business_id
       and up.chatwoot_inbox_mapping_id=e.chatwoot_inbox_mapping_id
       and up.chatwoot_conversation_display_id=v_display_id
       and up.lifecycle_status in('ACTIVE','DEGRADED')
       and up.id<>p.id
  ) then
    raise exception 'ambiguous Chatwoot Web Chat projection';
  end if;

  select * into sc from public.sales_conversations
   where organization_id=e.organization_id and id=p.conversation_id;
  if not found or sc.channel<>'WEB_CHAT' then
    return query select false,'NOT_WEB_CHAT_CONVERSATION'::text,null::uuid,e.status;
    return;
  end if;

  select * into v_existing from public.conversation_messages
   where organization_id=e.organization_id and channel='WEB_CHAT' and provider_message_id=v_provider_id;

  if found then
    if v_existing.conversation_id<>sc.id
       or v_existing.direction<>'OUTBOUND'
       or coalesce(v_existing.original_text,'')<>v_content
    then
      raise exception 'Chatwoot Web Chat message replay mismatch';
    end if;
    update public.chatwoot_webhook_events
       set status='PROCESSED',error_code=null,processed_at=coalesce(processed_at,statement_timestamp())
     where id=e.id and status in('RECEIVED','FAILED');
    return query select true,'REPLAY'::text,v_existing.id,'PROCESSED'::text;
    return;
  end if;

  insert into public.conversation_messages(
    organization_id,conversation_id,lead_id,provider_message_id,channel,direction,
    media_type,original_text,status,metadata,created_at,processed_at,sent_at
  ) values(
    e.organization_id,sc.id,sc.lead_id,v_provider_id,'WEB_CHAT','OUTBOUND',
    'TEXT',v_content,'SENT',
    jsonb_build_object(
      'source','CHATWOOT_SIGNED_WEBHOOK',
      'chatwoot_event_id',e.id,
      'chatwoot_message_id',v_message_id,
      'chatwoot_sender_id',v_sender_id,
      'chatwoot_sender_type',v_sender_type,
      'chatwoot_inbox_mapping_id',e.chatwoot_inbox_mapping_id
    ),
    v_created,statement_timestamp(),v_created
  )
  returning id into v_message;

  update public.sales_conversations
     set last_message_at=v_created,last_outbound_at=v_created,awaiting_party='CUSTOMER',
         unread_count=0,stage_reason='WEB_CHAT_OUTBOUND',updated_at=statement_timestamp()
   where organization_id=e.organization_id and id=sc.id;

  perform set_config('smartvisions.unified_inbox_projection_command','1',true);
  update public.unified_inbox_conversation_projections
     set last_activity_at=greatest(coalesce(last_activity_at,v_created),v_created),
         source_event_id=e.id,last_reconciled_at=statement_timestamp(),
         version=version+1,last_request_key='webchat-outbound:event:'||e.id::text
   where organization_id=e.organization_id and id=p.id;
  perform set_config('smartvisions.unified_inbox_projection_command','0',true);

  update public.chatwoot_webhook_events
     set status='PROCESSED',error_code=null,processed_at=statement_timestamp()
   where id=e.id and status in('RECEIVED','FAILED');

  return query select true,'INSERTED'::text,v_message,'PROCESSED'::text;
exception when others then
  perform set_config('smartvisions.unified_inbox_projection_command','0',true);
  raise;
end $$;

create or replace function public.close_web_chat_session(
  p_widget_public_key text,p_session_id uuid,p_token_hash text,p_origin text
)
returns table(closed boolean,session_status text)
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare s public.web_chat_sessions%rowtype;w public.web_chat_widget_configs%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid Web Chat session token'; end if;
  select * into s from public.web_chat_sessions where id=p_session_id and token_hash=p_token_hash for update;
  if not found then raise exception 'Web Chat session unavailable'; end if;
  select * into w from public.web_chat_widget_configs
   where organization_id=s.organization_id and id=s.widget_config_id
     and public_key=trim(p_widget_public_key) and enabled=true;
  if not found or s.origin<>trim(coalesce(p_origin,'')) or not (s.origin=any(w.allowed_origins))
  then raise exception 'Web Chat session unavailable'; end if;

  if s.status='CLOSED' then
    return query select false,'CLOSED'::text; return;
  end if;
  if s.status='EXPIRED' or s.expires_at<=now() then
    update public.web_chat_sessions set status='EXPIRED',last_seen_at=now()
     where organization_id=s.organization_id and id=s.id;
    return query select false,'EXPIRED'::text; return;
  end if;

  update public.web_chat_sessions set status='CLOSED',last_seen_at=now()
   where organization_id=s.organization_id and id=s.id;
  insert into public.web_chat_events(organization_id,session_id,event_id,event_type,payload)
  values(s.organization_id,s.id,'close:'||s.id::text,'SESSION_CLOSED',jsonb_build_object('reason','CUSTOMER_CLOSED'))
  on conflict(organization_id,event_id) do nothing;
  return query select true,'CLOSED'::text;
end $$;

create or replace function public.expire_web_chat_sessions(p_limit integer default 500)
returns table(expired_count integer)
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_limit integer:=least(2000,greatest(1,coalesce(p_limit,500)));v_count integer;
begin
  with due as (
    select organization_id,id
      from public.web_chat_sessions
     where status='ACTIVE' and expires_at<=now()
     order by expires_at,id
     limit v_limit
     for update skip locked
  ), updated as (
    update public.web_chat_sessions s
       set status='EXPIRED',last_seen_at=now()
      from due
     where s.organization_id=due.organization_id and s.id=due.id
    returning s.organization_id,s.id
  )
  select count(*)::integer into v_count from updated;

  insert into public.web_chat_events(organization_id,session_id,event_id,event_type,payload)
  select s.organization_id,s.id,'expire:'||s.id::text,'SESSION_CLOSED',jsonb_build_object('reason','EXPIRED')
    from public.web_chat_sessions s
   where s.status='EXPIRED'
     and not exists(
       select 1 from public.web_chat_events e
        where e.organization_id=s.organization_id and e.event_id='expire:'||s.id::text
     )
     and s.expires_at<=now()
   order by s.expires_at desc
   limit v_count
  on conflict(organization_id,event_id) do nothing;

  return query select coalesce(v_count,0);
end $$;

revoke all on function public.reconcile_web_chat_chatwoot_outbound_event(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_web_chat_chatwoot_outbound_event(uuid) to service_role;
revoke all on function public.close_web_chat_session(text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.close_web_chat_session(text,uuid,text,text) to service_role;
revoke all on function public.expire_web_chat_sessions(integer) from public,anon,authenticated,service_role;
grant execute on function public.expire_web_chat_sessions(integer) to service_role;
