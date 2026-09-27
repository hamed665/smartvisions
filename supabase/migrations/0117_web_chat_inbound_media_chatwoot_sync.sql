-- 0117: Web Chat at-most-once Chatwoot inbound sync + media annotation.
-- Extends the existing web_chat_events journal; no second queue or message store.

alter table public.web_chat_events
  add column if not exists chatwoot_sync_status text,
  add column if not exists chatwoot_message_id bigint,
  add column if not exists chatwoot_synced_at timestamptz;

update public.web_chat_events
   set chatwoot_sync_status='PENDING'
 where event_type='MESSAGE' and chatwoot_sync_status is null;

alter table public.web_chat_events
  drop constraint if exists web_chat_events_chatwoot_sync_status_check;
alter table public.web_chat_events
  add constraint web_chat_events_chatwoot_sync_status_check
  check (
    chatwoot_sync_status is null
    or chatwoot_sync_status in ('PENDING','PROCESSING','ACCEPTED','RECONCILIATION_REQUIRED')
  );

create unique index if not exists web_chat_events_chatwoot_message_unique
  on public.web_chat_events(organization_id,chatwoot_message_id)
  where chatwoot_message_id is not null;

create or replace function public.journal_web_chat_inbound_message(
 p_widget_public_key text,p_session_id uuid,p_token_hash text,p_origin text,p_client_message_id text,p_text text
)
returns table(organization_id uuid,tenant_business_id uuid,branch_id uuid,binding_id uuid,identity_id uuid,provider_message_id text,message_text text,event_inserted boolean)
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare s public.web_chat_sessions%rowtype;w public.web_chat_widget_configs%rowtype;v_provider_id text;v_inserted boolean:=false;v_text text:=trim(coalesce(p_text,''));v_client text:=trim(coalesce(p_client_message_id,''));
begin
 if p_token_hash !~ '^[0-9a-f]{64}$' or v_client !~ '^[A-Za-z0-9_-]{8,120}$' then raise exception 'invalid Web Chat message identity';end if;
 select * into s from public.web_chat_sessions where id=p_session_id and token_hash=p_token_hash for update;
 if not found or s.status<>'ACTIVE' or s.expires_at<=now() then raise exception 'Web Chat session unavailable';end if;
 if s.origin<>trim(coalesce(p_origin,'')) then raise exception 'Web Chat origin mismatch';end if;
 select * into w from public.web_chat_widget_configs where organization_id=s.organization_id and id=s.widget_config_id and public_key=trim(p_widget_public_key) and enabled=true;
 if not found or not (s.origin=any(w.allowed_origins)) then raise exception 'Web Chat widget unavailable';end if;
 if w.consent_required and s.consent_accepted_at is null then raise exception 'Web Chat consent required';end if;
 if length(v_text) not between 1 and w.max_message_chars then raise exception 'Web Chat message length invalid';end if;
 if (select count(*) from public.web_chat_events e where e.organization_id=s.organization_id and e.session_id=s.id and e.event_type='MESSAGE' and e.created_at>now()-interval '1 minute')>=20 then raise exception 'Web Chat message rate limit';end if;
 if (select count(*) from public.web_chat_events e where e.organization_id=s.organization_id and e.session_id=s.id and e.event_type='MESSAGE')>=500 then raise exception 'Web Chat session message limit';end if;
 if not exists(select 1 from public.communication_channel_bindings b where b.organization_id=s.organization_id and b.id=s.communication_channel_binding_id and b.status='ACTIVE' and b.channel='WEB_CHAT') then raise exception 'Web Chat binding unavailable';end if;
 v_provider_id:=s.id::text||':'||v_client;
 insert into public.web_chat_events(organization_id,session_id,event_id,event_type,payload,chatwoot_sync_status)
 values(s.organization_id,s.id,'message:'||v_provider_id,'MESSAGE',jsonb_build_object('providerMessageId',v_provider_id,'text',v_text),'PENDING')
 on conflict(organization_id,event_id) do nothing returning true into v_inserted;
 update public.web_chat_sessions set last_seen_at=now() where id=s.id;
 return query select s.organization_id,s.tenant_business_id,s.branch_id,s.communication_channel_binding_id,s.crm_identity_id,v_provider_id,v_text,coalesce(v_inserted,false);
end $$;

create or replace function public.claim_web_chat_chatwoot_sync(
 p_organization_id uuid,p_session_id uuid,p_provider_message_id text
)
returns table(event_id uuid,claimed boolean,sync_status text,chatwoot_message_id bigint)
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare e public.web_chat_events%rowtype;v_event_id text:='message:'||trim(coalesce(p_provider_message_id,''));
begin
 select * into e from public.web_chat_events
  where organization_id=p_organization_id and session_id=p_session_id and event_id=v_event_id and event_type='MESSAGE'
  for update;
 if not found then raise exception 'Web Chat message journal event unavailable';end if;
 if coalesce(e.payload->>'providerMessageId','')<>trim(p_provider_message_id) then raise exception 'Web Chat message journal scope mismatch';end if;

 if e.chatwoot_sync_status='ACCEPTED' then
   return query select e.id,false,'ACCEPTED'::text,e.chatwoot_message_id;return;
 end if;
 if e.chatwoot_sync_status in('PROCESSING','RECONCILIATION_REQUIRED') then
   return query select e.id,false,e.chatwoot_sync_status,e.chatwoot_message_id;return;
 end if;
 if coalesce(e.chatwoot_sync_status,'PENDING')<>'PENDING' then raise exception 'invalid Web Chat Chatwoot sync state';end if;

 update public.web_chat_events
    set chatwoot_sync_status='PROCESSING'
  where id=e.id;
 return query select e.id,true,'PROCESSING'::text,null::bigint;
end $$;

create or replace function public.finalize_web_chat_chatwoot_sync(
 p_event_id uuid,p_status text,p_chatwoot_message_id bigint default null
)
returns table(sync_status text,chatwoot_message_id bigint)
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare e public.web_chat_events%rowtype;v_status text:=upper(trim(coalesce(p_status,'')));
begin
 if v_status not in('ACCEPTED','RECONCILIATION_REQUIRED') then raise exception 'invalid Web Chat Chatwoot finalization state';end if;
 if v_status='ACCEPTED' and (p_chatwoot_message_id is null or p_chatwoot_message_id<=0) then raise exception 'accepted Chatwoot message id required';end if;
 if v_status='RECONCILIATION_REQUIRED' and p_chatwoot_message_id is not null then raise exception 'ambiguous Chatwoot result cannot assert a message id';end if;

 select * into e from public.web_chat_events where id=p_event_id and event_type='MESSAGE' for update;
 if not found then raise exception 'Web Chat message journal event unavailable';end if;

 if e.chatwoot_sync_status='ACCEPTED' then
   if v_status='ACCEPTED' and e.chatwoot_message_id=p_chatwoot_message_id then
     return query select e.chatwoot_sync_status,e.chatwoot_message_id;return;
   end if;
   raise exception 'accepted Web Chat Chatwoot sync is terminal';
 end if;
 if e.chatwoot_sync_status='RECONCILIATION_REQUIRED' then
   if v_status='RECONCILIATION_REQUIRED' then return query select e.chatwoot_sync_status,e.chatwoot_message_id;return;end if;
   raise exception 'ambiguous Web Chat Chatwoot sync requires operator reconciliation';
 end if;
 if e.chatwoot_sync_status<>'PROCESSING' then raise exception 'Web Chat Chatwoot sync was not claimed';end if;

 update public.web_chat_events
    set chatwoot_sync_status=v_status,
        chatwoot_message_id=case when v_status='ACCEPTED' then p_chatwoot_message_id else null end,
        chatwoot_synced_at=statement_timestamp()
  where id=e.id
 returning public.web_chat_events.chatwoot_sync_status,public.web_chat_events.chatwoot_message_id
 into sync_status,chatwoot_message_id;
 return next;
end $$;

create or replace function public.annotate_web_chat_message_media(
 p_organization_id uuid,p_message_id uuid,p_media_type text,p_attachments jsonb
)
returns public.conversation_messages
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare m public.conversation_messages%rowtype;v_media text:=upper(trim(coalesce(p_media_type,'')));
begin
 if v_media not in('IMAGE','VIDEO','AUDIO','DOCUMENT','OTHER') then raise exception 'invalid Web Chat media type';end if;
 if p_attachments is null or jsonb_typeof(p_attachments)<>'array' or jsonb_array_length(p_attachments) not between 1 and 4 or octet_length(p_attachments::text)>16384 then raise exception 'invalid Web Chat attachment metadata';end if;
 if exists(
   select 1 from jsonb_array_elements(p_attachments) a
   where jsonb_typeof(a)<>'object'
      or length(coalesce(a->>'name','')) not between 1 and 180
      or length(coalesce(a->>'contentType','')) not between 1 and 120
      or coalesce(a->>'size','') !~ '^[0-9]{1,12}$'
      or (a->>'size')::bigint<=0
      or (a->>'size')::bigint>10485760
 ) then raise exception 'invalid Web Chat attachment metadata item';end if;
 select * into m from public.conversation_messages
  where organization_id=p_organization_id and id=p_message_id and channel='WEB_CHAT' and direction='INBOUND'
  for update;
 if not found then raise exception 'canonical Web Chat inbound message required';end if;
 update public.conversation_messages
    set media_type=v_media,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('attachments',p_attachments)
  where id=m.id
 returning * into m;
 return m;
end $$;

revoke all on function public.claim_web_chat_chatwoot_sync(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_web_chat_chatwoot_sync(uuid,uuid,text) to service_role;
revoke all on function public.finalize_web_chat_chatwoot_sync(uuid,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.finalize_web_chat_chatwoot_sync(uuid,text,bigint) to service_role;
revoke all on function public.annotate_web_chat_message_media(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.annotate_web_chat_message_media(uuid,uuid,text,jsonb) to service_role;
