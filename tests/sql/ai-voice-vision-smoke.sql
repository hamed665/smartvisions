\set ON_ERROR_STOP on

begin;

insert into public.organizations(id,name) values
  ('00000000-0000-4000-8000-000000019401','AI Voice Vision CI'),
  ('00000000-0000-4000-8000-000000019402','AI Voice Vision Cross Org CI')
on conflict (id) do nothing;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000019411')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-4000-8000-000000019401','00000000-0000-4000-8000-000000019411','OWNER')
on conflict (organization_id,user_id) do update set role=excluded.role;

insert into public.sales_conversations(
  id,organization_id,lead_id,channel,last_message_at
) values (
  '00000000-0000-4000-8000-000000019421',
  '00000000-0000-4000-8000-000000019401',
  null,'WHATSAPP',now()
)
on conflict (id) do update set last_message_at=excluded.last_message_at;

insert into public.conversation_messages(
  id,organization_id,conversation_id,provider_message_id,channel,direction,
  media_type,original_text,status,metadata,provenance,source_plane,source_message_id
) values
(
  '00000000-0000-4000-8000-000000019431',
  '00000000-0000-4000-8000-000000019401',
  '00000000-0000-4000-8000-000000019421',
  'wamid.ai-vision-image-ci',
  'WHATSAPP','INBOUND','IMAGE','[WhatsApp image message]','RECEIVED',
  '{"media_id":"media-image-ci","mime_type":"image/jpeg","tenant_business_id":"tenant-ci","communication_channel_binding_id":"binding-ci"}'::jsonb,
  'CUSTOMER','META_WHATSAPP','wamid.ai-vision-image-ci'
),
(
  '00000000-0000-4000-8000-000000019432',
  '00000000-0000-4000-8000-000000019401',
  '00000000-0000-4000-8000-000000019421',
  'wamid.ai-voice-ci',
  'WHATSAPP','INBOUND','VOICE','[WhatsApp voice message]','RECEIVED',
  '{"media_id":"media-voice-ci","mime_type":"audio/ogg","tenant_business_id":"tenant-ci","communication_channel_binding_id":"binding-ci","voice":true}'::jsonb,
  'CUSTOMER','META_WHATSAPP','wamid.ai-voice-ci'
)
on conflict (id) do nothing;

insert into public.conversation_messages(
  id,organization_id,conversation_id,provider_message_id,channel,direction,
  media_type,original_text,status,metadata,provenance,source_plane,source_message_id
) values
(
  '00000000-0000-4000-8000-000000019433',
  '00000000-0000-4000-8000-000000019401',
  '00000000-0000-4000-8000-000000019421',
  'wamid.ai-vision-stale-safe-ci',
  'WHATSAPP','INBOUND','IMAGE','[WhatsApp image message]','RECEIVED',
  '{"media_id":"media-stale-safe-ci","mime_type":"image/jpeg","tenant_business_id":"tenant-ci","communication_channel_binding_id":"binding-ci","media_analysis":{"schemaVersion":1,"status":"PROCESSING","requestKey":"ai-media:old-safe:v1","startedAt":"2020-01-01T00:00:00Z"}}'::jsonb,
  'CUSTOMER','META_WHATSAPP','wamid.ai-vision-stale-safe-ci'
),
(
  '00000000-0000-4000-8000-000000019434',
  '00000000-0000-4000-8000-000000019401',
  '00000000-0000-4000-8000-000000019421',
  'wamid.ai-vision-stale-paid-ci',
  'WHATSAPP','INBOUND','IMAGE','[WhatsApp image message]','RECEIVED',
  '{"media_id":"media-stale-paid-ci","mime_type":"image/jpeg","tenant_business_id":"tenant-ci","communication_channel_binding_id":"binding-ci","media_analysis":{"schemaVersion":1,"status":"PROCESSING","requestKey":"ai-media:old-paid:v1","startedAt":"2020-01-01T00:00:00Z","providerCallStartedAt":"2020-01-01T00:01:00Z"}}'::jsonb,
  'CUSTOMER','META_WHATSAPP','wamid.ai-vision-stale-paid-ci'
),
(
  '00000000-0000-4000-8000-000000019435',
  '00000000-0000-4000-8000-000000019401',
  '00000000-0000-4000-8000-000000019421',
  'wamid.ai-text-ci',
  'WHATSAPP','INBOUND','TEXT','hello','RECEIVED',
  '{"media_id":"media-text-ci","mime_type":"text/plain","tenant_business_id":"tenant-ci","communication_channel_binding_id":"binding-ci"}'::jsonb,
  'CUSTOMER','META_WHATSAPP','wamid.ai-text-ci'
)
on conflict (id) do nothing;

-- CI starts after the legacy 0038/0039 service-role grant lineage. Reconstruct
-- the exact minimum Production privileges required by SECURITY INVOKER RPCs.
grant select, update on table public.conversation_messages to service_role;
grant insert on table public.audit_logs to service_role;
grant select, update on table public.conversation_messages to authenticated;

set role service_role;

do $claim_and_finalize$
declare
  c record;
  r record;
  a jsonb;
begin
  select * into c from public.claim_conversation_media_analysis(
    '00000000-0000-4000-8000-000000019401',
    '00000000-0000-4000-8000-000000019431',
    'media-image-ci',
    'ai-media:ci-image:v1'
  );
  if c.claimed is distinct from true or c.claim_state<>'CLAIMED' then
    raise exception 'AI-VOICE-VISION claim failed: %',row_to_json(c);
  end if;

  select * into r from public.claim_conversation_media_analysis(
    '00000000-0000-4000-8000-000000019401',
    '00000000-0000-4000-8000-000000019431',
    'media-image-ci',
    'ai-media:ci-image:v1'
  );
  if r.claimed is distinct from false or r.claim_state<>'IN_PROGRESS' then
    raise exception 'AI-VOICE-VISION concurrent replay was not blocked: %',row_to_json(r);
  end if;

  a:=public.mark_conversation_media_analysis_provider_started(
    '00000000-0000-4000-8000-000000019401',
    '00000000-0000-4000-8000-000000019431',
    'ai-media:ci-image:v1',
    'gpt-5.6-luna'
  );
  if coalesce(a->>'providerCallStartedAt','')='' then
    raise exception 'AI-VOICE-VISION provider start evidence missing';
  end if;

  select * into r from public.finalize_conversation_media_analysis(
    '00000000-0000-4000-8000-000000019401',
    '00000000-0000-4000-8000-000000019431',
    'ai-media:ci-image:v1',
    'SUCCEEDED',
    'gpt-5.6-luna',
    'A customer supplied image with visible service details.',
    'Service A',
    0.91,
    'en',
    null
  );
  if r.final_state<>'SUCCEEDED' or r.replayed then
    raise exception 'AI-VOICE-VISION finalize failed: %',row_to_json(r);
  end if;

  select metadata->'media_analysis' into a
  from public.conversation_messages
  where id='00000000-0000-4000-8000-000000019431';
  if a->>'status'<>'SUCCEEDED'
     or a->>'summary'<>'A customer supplied image with visible service details.'
     or a->>'extractedText'<>'Service A'
  then
    raise exception 'AI-VOICE-VISION canonical evidence mismatch: %',a;
  end if;

  select * into r from public.claim_conversation_media_analysis(
    '00000000-0000-4000-8000-000000019401',
    '00000000-0000-4000-8000-000000019431',
    'media-image-ci',
    'ai-media:ci-image:v1'
  );
  if r.claimed or r.claim_state<>'SUCCEEDED' or not r.replayed then
    raise exception 'AI-VOICE-VISION success replay failed: %',row_to_json(r);
  end if;
end;
$claim_and_finalize$;

do $claim_guards$
declare
  r record;
begin
  select * into r from public.claim_conversation_media_analysis(
    '00000000-0000-4000-8000-000000019401',
    '00000000-0000-4000-8000-000000019433',
    'media-stale-safe-ci',
    'ai-media:reclaim-safe:v1'
  );
  if not r.claimed or r.claim_state<>'CLAIMED' then
    raise exception 'Stale pre-provider media claim was not safely reclaimed: %',row_to_json(r);
  end if;

  select * into r from public.claim_conversation_media_analysis(
    '00000000-0000-4000-8000-000000019401',
    '00000000-0000-4000-8000-000000019434',
    'media-stale-paid-ci',
    'ai-media:reclaim-paid:v1'
  );
  if r.claimed or r.claim_state<>'RECONCILIATION_REQUIRED' then
    raise exception 'Stale post-provider media claim allowed a blind retry: %',row_to_json(r);
  end if;

  begin
    perform public.claim_conversation_media_analysis(
      '00000000-0000-4000-8000-000000019402',
      '00000000-0000-4000-8000-000000019431',
      'media-image-ci',
      'ai-media:cross-org:v1'
    );
    raise exception 'Cross-org media claim unexpectedly succeeded';
  exception when others then
    if sqlerrm='Cross-org media claim unexpectedly succeeded' then raise; end if;
    if position('canonical conversation message not found' in sqlerrm)=0 then
      raise exception 'Unexpected cross-org media claim failure: %',sqlerrm;
    end if;
  end;

  begin
    perform public.claim_conversation_media_analysis(
      '00000000-0000-4000-8000-000000019401',
      '00000000-0000-4000-8000-000000019435',
      'media-text-ci',
      'ai-media:text-block:v1'
    );
    raise exception 'TEXT media claim unexpectedly succeeded';
  exception when others then
    if sqlerrm='TEXT media claim unexpectedly succeeded' then raise; end if;
    if position('IMAGE or DOCUMENT only' in sqlerrm)=0 then
      raise exception 'Unexpected TEXT media claim failure: %',sqlerrm;
    end if;
  end;
end;
$claim_guards$;

do $voice_projection$
declare
  r record;
  v_text text;
  v_status text;
begin
  select * into r from public.persist_conversation_voice_transcript(
    '00000000-0000-4000-8000-000000019401',
    'wamid.ai-voice-ci',
    '00000000-0000-4000-8000-000000019421',
    '00000000-0000-4000-8000-000000019441',
    'Please send me the price.',
    'en',
    'gpt-4o-mini-transcribe'
  );
  if r.replayed then raise exception 'First voice projection unexpectedly replayed'; end if;

  select transcript,metadata->'media_analysis'->>'status'
  into v_text,v_status
  from public.conversation_messages
  where id='00000000-0000-4000-8000-000000019432';
  if v_text<>'Please send me the price.' or v_status<>'SUCCEEDED' then
    raise exception 'Canonical voice transcript projection failed';
  end if;

  select * into r from public.persist_conversation_voice_transcript(
    '00000000-0000-4000-8000-000000019401',
    'wamid.ai-voice-ci',
    '00000000-0000-4000-8000-000000019421',
    '00000000-0000-4000-8000-000000019441',
    'Please send me the price.',
    'en',
    'gpt-4o-mini-transcribe'
  );
  if not r.replayed then raise exception 'Voice replay was not idempotent'; end if;
end;
$voice_projection$;

do $voice_scope_guards$
begin
  begin
    perform public.persist_conversation_voice_transcript(
      '00000000-0000-4000-8000-000000019402',
      'wamid.ai-voice-ci',
      '00000000-0000-4000-8000-000000019421',
      '00000000-0000-4000-8000-000000019442',
      'cross org attempt',
      'en',
      'gpt-4o-mini-transcribe'
    );
    raise exception 'Cross-org voice projection unexpectedly succeeded';
  exception when others then
    if sqlerrm='Cross-org voice projection unexpectedly succeeded' then raise; end if;
    if position('canonical WhatsApp inbound message not found' in sqlerrm)=0 then
      raise exception 'Unexpected cross-org voice failure: %',sqlerrm;
    end if;
  end;

  begin
    perform public.persist_conversation_voice_transcript(
      '00000000-0000-4000-8000-000000019401',
      'wamid.ai-voice-ci',
      '00000000-0000-4000-8000-000000019499',
      '00000000-0000-4000-8000-000000019443',
      'wrong conversation attempt',
      'en',
      'gpt-4o-mini-transcribe'
    );
    raise exception 'Wrong-conversation voice projection unexpectedly succeeded';
  exception when others then
    if sqlerrm='Wrong-conversation voice projection unexpectedly succeeded' then raise; end if;
    if position('voice transcript conversation mismatch' in sqlerrm)=0 then
      raise exception 'Unexpected wrong-conversation voice failure: %',sqlerrm;
    end if;
  end;

  begin
    perform public.persist_conversation_voice_transcript(
      '00000000-0000-4000-8000-000000019401',
      'wamid.ai-text-ci',
      '00000000-0000-4000-8000-000000019421',
      '00000000-0000-4000-8000-000000019444',
      'text mutation attempt',
      'en',
      'gpt-4o-mini-transcribe'
    );
    raise exception 'TEXT message received a voice transcript';
  exception when others then
    if sqlerrm='TEXT message received a voice transcript' then raise; end if;
    if position('canonical voice/audio message required' in sqlerrm)=0 then
      raise exception 'Unexpected TEXT voice projection failure: %',sqlerrm;
    end if;
  end;
end;
$voice_scope_guards$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000019411',false);

do $authenticated_guard$
begin
  begin
    update public.conversation_messages
       set transcript='tampered'
     where id='00000000-0000-4000-8000-000000019432';
    raise exception 'AI media evidence guard did not block authenticated mutation';
  exception
    when others then
      if sqlerrm='AI media evidence guard did not block authenticated mutation' then raise; end if;
      if position('trusted-server managed' in sqlerrm)=0 then
        raise exception 'Unexpected authenticated guard failure: %',sqlerrm;
      end if;
  end;
end;
$authenticated_guard$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $acl_and_invoker$
declare
  f record;
  fn text;
begin
  foreach fn in array array[
    'public.claim_conversation_media_analysis(uuid,uuid,text,text)',
    'public.mark_conversation_media_analysis_provider_started(uuid,uuid,text,text)',
    'public.finalize_conversation_media_analysis(uuid,uuid,text,text,text,text,text,numeric,text,text)',
    'public.persist_conversation_voice_transcript(uuid,text,uuid,uuid,text,text,text)'
  ]
  loop
    if has_function_privilege('anon',fn,'EXECUTE') then
      raise exception 'anon can execute trusted AI-VOICE-VISION RPC %',fn;
    end if;
    if has_function_privilege('authenticated',fn,'EXECUTE') then
      raise exception 'authenticated can execute trusted AI-VOICE-VISION RPC %',fn;
    end if;
    if not has_function_privilege('service_role',fn,'EXECUTE') then
      raise exception 'service_role cannot execute trusted AI-VOICE-VISION RPC %',fn;
    end if;
  end loop;

  for f in
    select p.proname,p.prosecdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'claim_conversation_media_analysis',
        'mark_conversation_media_analysis_provider_started',
        'finalize_conversation_media_analysis',
        'persist_conversation_voice_transcript',
        'protect_conversation_ai_media_evidence'
      )
  loop
    if f.prosecdef then
      raise exception 'AI-VOICE-VISION function % must remain SECURITY INVOKER',f.proname;
    end if;
  end loop;
end;
$acl_and_invoker$;

rollback;