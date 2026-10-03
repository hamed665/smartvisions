-- AI-VOICE-VISION
-- Keep public.conversation_messages as the canonical media/conversation authority.
-- This migration adds only trusted, replay-safe mutation commands over bounded
-- transcript/media-analysis evidence. It does not add a second media store.

create or replace function public.protect_conversation_ai_media_evidence()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if current_user in ('service_role','postgres') then
    return new;
  end if;

  if old.direction='INBOUND'
     and (
       old.transcript is distinct from new.transcript
       or old.detected_language is distinct from new.detected_language
       or coalesce(old.metadata->'media_analysis','null'::jsonb)
          is distinct from coalesce(new.metadata->'media_analysis','null'::jsonb)
     )
  then
    raise exception 'AI media evidence is trusted-server managed';
  end if;

  return new;
end;
$$;

drop trigger if exists conversation_messages_ai_media_evidence_guard on public.conversation_messages;
create trigger conversation_messages_ai_media_evidence_guard
before update on public.conversation_messages
for each row execute function public.protect_conversation_ai_media_evidence();

revoke all on function public.protect_conversation_ai_media_evidence() from public,anon,authenticated,service_role;

create or replace function public.claim_conversation_media_analysis(
  p_organization_id uuid,
  p_message_id uuid,
  p_expected_media_id text,
  p_request_key text
)
returns table(
  claim_state text,
  claimed boolean,
  replayed boolean,
  message_id uuid,
  media_type text,
  provider_message_id text,
  conversation_id uuid,
  lead_id uuid,
  metadata jsonb
)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  m public.conversation_messages%rowtype;
  v_analysis jsonb;
  v_status text;
  v_started_at timestamptz;
  v_provider_started_at timestamptz;
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_media_id text:=btrim(coalesce(p_expected_media_id,''));
  v_next jsonb;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'trusted server role required';
  end if;
  if p_organization_id is null or p_message_id is null then
    raise exception 'organization and message are required';
  end if;
  if length(v_request_key) not between 8 and 200 then
    raise exception 'media analysis request key is invalid';
  end if;
  if length(v_media_id) not between 1 and 512 then
    raise exception 'media id is invalid';
  end if;

  select * into m
  from public.conversation_messages
  where organization_id=p_organization_id
    and id=p_message_id
  for update;

  if not found then raise exception 'canonical conversation message not found'; end if;
  if m.channel<>'WHATSAPP' or m.direction<>'INBOUND' then
    raise exception 'canonical inbound WhatsApp message required';
  end if;
  if m.media_type not in ('IMAGE','DOCUMENT') then
    raise exception 'media analysis supports canonical IMAGE or DOCUMENT only';
  end if;
  if nullif(btrim(coalesce(m.provider_message_id,'')),'') is null
     or nullif(btrim(coalesce(m.metadata->>'mime_type','')),'') is null
     or nullif(btrim(coalesce(m.metadata->>'tenant_business_id','')),'') is null
     or nullif(btrim(coalesce(m.metadata->>'communication_channel_binding_id','')),'') is null
  then
    raise exception 'canonical provider media scope is incomplete';
  end if;
  if coalesce(m.metadata->>'media_id','')<>v_media_id then
    raise exception 'canonical media id mismatch';
  end if;

  v_analysis:=coalesce(m.metadata->'media_analysis','{}'::jsonb);
  v_status:=upper(coalesce(v_analysis->>'status',''));

  begin
    v_started_at:=nullif(v_analysis->>'startedAt','')::timestamptz;
  exception when others then
    v_started_at:=null;
  end;
  begin
    v_provider_started_at:=nullif(v_analysis->>'providerCallStartedAt','')::timestamptz;
  exception when others then
    v_provider_started_at:=null;
  end;

  if v_status='SUCCEEDED' then
    return query select 'SUCCEEDED',false,true,m.id,m.media_type,m.provider_message_id,m.conversation_id,m.lead_id,m.metadata;
    return;
  end if;

  if v_status in ('UNSUPPORTED','RECONCILIATION_REQUIRED') then
    return query select v_status,false,true,m.id,m.media_type,m.provider_message_id,m.conversation_id,m.lead_id,m.metadata;
    return;
  end if;

  if v_status='FAILED' and coalesce(v_analysis->>'requestKey','')=v_request_key then
    return query select 'FAILED',false,true,m.id,m.media_type,m.provider_message_id,m.conversation_id,m.lead_id,m.metadata;
    return;
  end if;

  if v_status='PROCESSING' then
    if v_started_at is not null and v_started_at>statement_timestamp()-interval '10 minutes' then
      return query select 'IN_PROGRESS',false,true,m.id,m.media_type,m.provider_message_id,m.conversation_id,m.lead_id,m.metadata;
      return;
    end if;

    if v_provider_started_at is not null then
      v_next:=v_analysis
        || jsonb_build_object(
          'status','RECONCILIATION_REQUIRED',
          'completedAt',statement_timestamp(),
          'error','STALE_AFTER_PROVIDER_START'
        );
      update public.conversation_messages as cm
      set metadata=jsonb_set(coalesce(cm.metadata,'{}'::jsonb),'{media_analysis}',v_next,true)
      where cm.id=m.id
      returning cm.* into m;

      insert into public.audit_logs(
        organization_id,actor_type,action,entity_type,entity_id,after_data,correlation_id
      ) values (
        p_organization_id,'SYSTEM','AI_MEDIA_ANALYSIS_RECONCILIATION_REQUIRED',
        'conversation_message',m.id::text,
        jsonb_build_object('reason','STALE_AFTER_PROVIDER_START','mediaType',m.media_type),
        v_request_key
      );

      return query select 'RECONCILIATION_REQUIRED',false,true,m.id,m.media_type,m.provider_message_id,m.conversation_id,m.lead_id,m.metadata;
      return;
    end if;
  end if;

  v_next:=jsonb_build_object(
    'schemaVersion',1,
    'status','PROCESSING',
    'kind',m.media_type,
    'provider','OPENAI',
    'requestKey',v_request_key,
    'startedAt',statement_timestamp()
  );

  update public.conversation_messages as cm
  set metadata=jsonb_set(coalesce(cm.metadata,'{}'::jsonb),'{media_analysis}',v_next,true)
  where cm.id=m.id
  returning cm.* into m;

  insert into public.audit_logs(
    organization_id,actor_type,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'SYSTEM','AI_MEDIA_ANALYSIS_CLAIMED',
    'conversation_message',m.id::text,
    jsonb_build_object('mediaType',m.media_type,'providerMessageId',m.provider_message_id),
    v_request_key
  );

  return query select 'CLAIMED',true,false,m.id,m.media_type,m.provider_message_id,m.conversation_id,m.lead_id,m.metadata;
end;
$$;

create or replace function public.mark_conversation_media_analysis_provider_started(
  p_organization_id uuid,
  p_message_id uuid,
  p_request_key text,
  p_model text
)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  m public.conversation_messages%rowtype;
  v_analysis jsonb;
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_model text:=btrim(coalesce(p_model,''));
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'trusted server role required';
  end if;
  if length(v_model) not between 1 and 120 then raise exception 'model is invalid'; end if;

  select * into m
  from public.conversation_messages
  where organization_id=p_organization_id and id=p_message_id
  for update;
  if not found then raise exception 'canonical conversation message not found'; end if;

  v_analysis:=coalesce(m.metadata->'media_analysis','{}'::jsonb);
  if upper(coalesce(v_analysis->>'status',''))<>'PROCESSING'
     or coalesce(v_analysis->>'requestKey','')<>v_request_key
  then
    raise exception 'media analysis claim is not active';
  end if;

  if nullif(v_analysis->>'providerCallStartedAt','') is null then
    v_analysis:=v_analysis || jsonb_build_object(
      'model',v_model,
      'providerCallStartedAt',statement_timestamp()
    );
    update public.conversation_messages as cm
    set metadata=jsonb_set(coalesce(cm.metadata,'{}'::jsonb),'{media_analysis}',v_analysis,true)
    where cm.id=m.id;
  end if;

  return v_analysis;
end;
$$;

create or replace function public.finalize_conversation_media_analysis(
  p_organization_id uuid,
  p_message_id uuid,
  p_request_key text,
  p_status text,
  p_model text default null,
  p_summary text default null,
  p_extracted_text text default null,
  p_confidence numeric default null,
  p_detected_language text default null,
  p_error text default null
)
returns table(
  final_state text,
  replayed boolean,
  message_id uuid,
  metadata jsonb
)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  m public.conversation_messages%rowtype;
  v_analysis jsonb;
  v_status text:=upper(btrim(coalesce(p_status,'')));
  v_request_key text:=btrim(coalesce(p_request_key,''));
  v_summary text:=nullif(btrim(coalesce(p_summary,'')),'');
  v_extracted text:=nullif(btrim(coalesce(p_extracted_text,'')),'');
  v_model text:=nullif(btrim(coalesce(p_model,'')),'');
  v_language text:=nullif(btrim(coalesce(p_detected_language,'')),'');
  v_error text:=nullif(btrim(coalesce(p_error,'')),'');
  v_next jsonb;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'trusted server role required';
  end if;
  if v_status not in ('SUCCEEDED','FAILED','UNSUPPORTED','RECONCILIATION_REQUIRED') then
    raise exception 'invalid media analysis final state';
  end if;
  if length(coalesce(v_summary,''))>3000 then raise exception 'media summary too long'; end if;
  if length(coalesce(v_extracted,''))>12000 then raise exception 'media extracted text too long'; end if;
  if length(coalesce(v_model,''))>120 then raise exception 'media model too long'; end if;
  if length(coalesce(v_language,''))>40 then raise exception 'media language too long'; end if;
  if length(coalesce(v_error,''))>1000 then raise exception 'media error too long'; end if;
  if p_confidence is not null and (p_confidence<0 or p_confidence>1) then
    raise exception 'media confidence must be between 0 and 1';
  end if;

  select * into m
  from public.conversation_messages
  where organization_id=p_organization_id and id=p_message_id
  for update;
  if not found then raise exception 'canonical conversation message not found'; end if;

  v_analysis:=coalesce(m.metadata->'media_analysis','{}'::jsonb);

  if upper(coalesce(v_analysis->>'status',''))=v_status
     and coalesce(v_analysis->>'requestKey','')=v_request_key
     and v_status in ('SUCCEEDED','FAILED','UNSUPPORTED','RECONCILIATION_REQUIRED')
  then
    return query select v_status,true,m.id,m.metadata;
    return;
  end if;

  if upper(coalesce(v_analysis->>'status',''))<>'PROCESSING'
     or coalesce(v_analysis->>'requestKey','')<>v_request_key
  then
    raise exception 'media analysis claim is not active';
  end if;

  v_next:=jsonb_strip_nulls(jsonb_build_object(
    'schemaVersion',1,
    'status',v_status,
    'kind',m.media_type,
    'provider','OPENAI',
    'requestKey',v_request_key,
    'startedAt',v_analysis->>'startedAt',
    'providerCallStartedAt',v_analysis->>'providerCallStartedAt',
    'completedAt',statement_timestamp(),
    'model',v_model,
    'summary',v_summary,
    'extractedText',v_extracted,
    'confidence',p_confidence,
    'detectedLanguage',v_language,
    'error',v_error
  ));

  update public.conversation_messages as cm
  set metadata=jsonb_set(coalesce(cm.metadata,'{}'::jsonb),'{media_analysis}',v_next,true)
  where cm.id=m.id
  returning cm.* into m;

  insert into public.audit_logs(
    organization_id,actor_type,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'SYSTEM','AI_MEDIA_ANALYSIS_'||v_status,
    'conversation_message',m.id::text,
    jsonb_build_object('mediaType',m.media_type,'model',v_model,'confidence',p_confidence),
    v_request_key
  );

  return query select v_status,false,m.id,m.metadata;
end;
$$;

create or replace function public.persist_conversation_voice_transcript(
  p_organization_id uuid,
  p_provider_message_id text,
  p_conversation_id uuid,
  p_transcription_id uuid,
  p_transcript text,
  p_detected_language text,
  p_model text
)
returns table(
  message_id uuid,
  replayed boolean
)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  m public.conversation_messages%rowtype;
  v_transcript text:=btrim(coalesce(p_transcript,''));
  v_language text:=nullif(btrim(coalesce(p_detected_language,'')),'');
  v_model text:=btrim(coalesce(p_model,''));
  v_analysis jsonb;
  v_replayed boolean:=false;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'trusted server role required';
  end if;
  if length(btrim(coalesce(p_provider_message_id,''))) not between 1 and 320 then
    raise exception 'provider message id is invalid';
  end if;
  if p_transcription_id is null then raise exception 'transcription id is required'; end if;
  if length(v_transcript) not between 1 and 12000 then raise exception 'voice transcript is invalid'; end if;
  if length(coalesce(v_language,''))>40 then raise exception 'voice language is invalid'; end if;
  if length(v_model) not between 1 and 120 then raise exception 'voice model is invalid'; end if;

  select * into m
  from public.conversation_messages
  where organization_id=p_organization_id
    and channel='WHATSAPP'
    and direction='INBOUND'
    and provider_message_id=p_provider_message_id
  for update;

  if not found then raise exception 'canonical WhatsApp inbound message not found'; end if;
  if p_conversation_id is not null and m.conversation_id<>p_conversation_id then
    raise exception 'voice transcript conversation mismatch';
  end if;
  if m.media_type not in ('VOICE','AUDIO') then
    raise exception 'canonical voice/audio message required';
  end if;
  if nullif(btrim(coalesce(m.metadata->>'media_id','')),'') is null
     or nullif(btrim(coalesce(m.metadata->>'tenant_business_id','')),'') is null
     or nullif(btrim(coalesce(m.metadata->>'communication_channel_binding_id','')),'') is null
  then
    raise exception 'canonical voice provider scope is incomplete';
  end if;

  if nullif(btrim(coalesce(m.transcript,'')),'') is not null then
    if btrim(m.transcript)<>v_transcript then
      raise exception 'conflicting canonical voice transcript';
    end if;
    v_replayed:=true;
  end if;

  v_analysis:=jsonb_strip_nulls(jsonb_build_object(
    'schemaVersion',1,
    'status','SUCCEEDED',
    'kind','VOICE_TRANSCRIPTION',
    'provider','OPENAI',
    'model',v_model,
    'sourceId',p_transcription_id,
    'completedAt',statement_timestamp(),
    'detectedLanguage',v_language
  ));

  update public.conversation_messages as cm
  set transcript=v_transcript,
      detected_language=coalesce(v_language,cm.detected_language),
      metadata=jsonb_set(coalesce(cm.metadata,'{}'::jsonb),'{media_analysis}',v_analysis,true)
  where cm.id=m.id;

  if not v_replayed then
    insert into public.audit_logs(
      organization_id,actor_type,action,entity_type,entity_id,after_data,correlation_id
    ) values (
      p_organization_id,'SYSTEM','AI_VOICE_TRANSCRIPT_PROJECTED',
      'conversation_message',m.id::text,
      jsonb_build_object('transcriptionId',p_transcription_id,'model',v_model,'detectedLanguage',v_language),
      'voice-transcription:'||p_transcription_id::text
    );
  end if;

  return query select m.id,v_replayed;
end;
$$;

revoke all on function public.claim_conversation_media_analysis(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.mark_conversation_media_analysis_provider_started(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.finalize_conversation_media_analysis(uuid,uuid,text,text,text,text,text,numeric,text,text) from public,anon,authenticated,service_role;
revoke all on function public.persist_conversation_voice_transcript(uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;

grant execute on function public.claim_conversation_media_analysis(uuid,uuid,text,text) to service_role;
grant execute on function public.mark_conversation_media_analysis_provider_started(uuid,uuid,text,text) to service_role;
grant execute on function public.finalize_conversation_media_analysis(uuid,uuid,text,text,text,text,text,numeric,text,text) to service_role;
grant execute on function public.persist_conversation_voice_transcript(uuid,text,uuid,uuid,text,text,text) to service_role;