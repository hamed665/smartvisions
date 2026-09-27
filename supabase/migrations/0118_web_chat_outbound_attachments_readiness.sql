-- 0118: OMNI-WEBCHAT outgoing attachment projection + evidence-backed activation readiness.
-- Reuses the signed Chatwoot webhook journal and canonical conversation_messages store.
-- Browser delivery is session-scoped through Smart Core; Chatwoot Active Storage URLs are never projected to the browser.

create table public.web_chat_activation_acceptance_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  branch_id uuid not null,
  communication_channel_binding_id uuid not null,
  widget_config_id uuid not null references public.web_chat_widget_configs(id) on delete restrict,
  widget_version integer not null check (widget_version >= 1),
  public_key text not null check (public_key ~ '^wc_[A-Za-z0-9_-]{24,80}$'),
  session_id uuid not null references public.web_chat_sessions(id) on delete restrict,
  inbound_event_id uuid not null references public.web_chat_events(id) on delete restrict,
  outbound_webhook_event_id uuid not null references public.chatwoot_webhook_events(id) on delete restrict,
  origin text not null check (length(origin) between 8 and 500),
  media_verified boolean not null check (media_verified = true),
  observed_at timestamptz not null,
  request_key text not null check (length(trim(request_key)) between 8 and 200),
  created_at timestamptz not null default now(),
  unique (organization_id, request_key),
  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id,id) on delete restrict,
  foreign key (organization_id, branch_id)
    references public.branches(organization_id,id) on delete restrict,
  foreign key (organization_id, communication_channel_binding_id)
    references public.communication_channel_bindings(organization_id,id) on delete restrict
);

create index web_chat_acceptance_binding_idx
  on public.web_chat_activation_acceptance_receipts(
    organization_id,tenant_business_id,communication_channel_binding_id,observed_at desc
  );

alter table public.web_chat_activation_acceptance_receipts enable row level security;
revoke all on table public.web_chat_activation_acceptance_receipts from public,anon,authenticated,service_role;
grant select,insert on table public.web_chat_activation_acceptance_receipts to service_role;

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
  im public.chatwoot_inbox_mappings%rowtype;
  am public.chatwoot_account_mappings%rowtype;
  v_message_id bigint;
  v_display_id integer;
  v_provider_id text;
  v_content text;
  v_message uuid;
  v_existing public.conversation_messages%rowtype;
  v_created timestamptz;
  v_sender_id bigint;
  v_sender_type text;
  v_attachments jsonb;
  v_attachment jsonb;
  v_safe_attachments jsonb := '[]'::jsonb;
  v_attachment_count integer := 0;
  v_media_type text := 'TEXT';
  v_file_size bigint;
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
  if v_message_id > 2147483647 then raise exception 'invalid Chatwoot Web Chat message identity'; end if;
  v_provider_id := 'chatwoot:'||v_message_id::text;
  v_content := nullif(trim(coalesce(e.payload->>'content','')),'');
  v_attachments := coalesce(e.payload->'attachments','[]'::jsonb);

  if jsonb_typeof(v_attachments) <> 'array' or jsonb_array_length(v_attachments) > 10 then
    raise exception 'invalid Chatwoot Web Chat attachment collection';
  end if;

  select * into im from public.chatwoot_inbox_mappings
   where organization_id=e.organization_id
     and tenant_business_id=e.tenant_business_id
     and id=e.chatwoot_inbox_mapping_id
     and status in('ACTIVE','DEGRADED');
  if not found then
    return query select false,'CHATWOOT_INBOX_MAPPING_UNAVAILABLE'::text,null::uuid,e.status;
    return;
  end if;

  select * into am from public.chatwoot_account_mappings
   where organization_id=e.organization_id
     and tenant_business_id=e.tenant_business_id
     and id=im.chatwoot_account_mapping_id
     and status='ACTIVE'
     and chatwoot_account_id is not null;
  if not found then
    return query select false,'CHATWOOT_ACCOUNT_MAPPING_UNAVAILABLE'::text,null::uuid,e.status;
    return;
  end if;

  for v_attachment in select value from jsonb_array_elements(v_attachments)
  loop
    if jsonb_typeof(v_attachment) <> 'object'
       or coalesce(v_attachment->>'id','') !~ '^[1-9][0-9]*$'
       or coalesce(v_attachment->>'message_id','') !~ '^[1-9][0-9]*$'
       or coalesce(v_attachment->>'account_id','') !~ '^[1-9][0-9]*$'
    then
      raise exception 'invalid Chatwoot Web Chat attachment identity';
    end if;
    if (v_attachment->>'id')::bigint > 2147483647
       or (v_attachment->>'message_id')::bigint <> v_message_id
       or (v_attachment->>'account_id')::bigint <> am.chatwoot_account_id
    then
      raise exception 'Chatwoot Web Chat attachment escaped message/account scope';
    end if;

    if coalesce(v_attachment->>'file_size','') ~ '^[0-9]+$' then
      v_file_size := (v_attachment->>'file_size')::bigint;
      if v_file_size > 1073741824 then raise exception 'invalid Chatwoot Web Chat attachment size'; end if;
    else
      v_file_size := null;
    end if;

    v_safe_attachments := v_safe_attachments || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id',(v_attachment->>'id')::bigint,
      'messageId',v_message_id,
      'accountId',am.chatwoot_account_id,
      'fileType',left(nullif(trim(coalesce(v_attachment->>'file_type','')),''),32),
      'contentType',left(nullif(trim(coalesce(v_attachment->>'content_type','')),''),120),
      'extension',left(lower(nullif(trim(coalesce(v_attachment->>'extension','')),'')),12),
      'size',v_file_size
    )));
    v_attachment_count := v_attachment_count + 1;
  end loop;

  if v_content is null and v_attachment_count=0 then
    return query select false,'UNSUPPORTED_EMPTY_MESSAGE'::text,null::uuid,e.status;
    return;
  end if;

  if v_attachment_count=1 then
    v_media_type := case lower(coalesce(v_safe_attachments->0->>'fileType',''))
      when 'image' then 'IMAGE'
      when 'audio' then 'AUDIO'
      when 'video' then 'VIDEO'
      when 'file' then 'DOCUMENT'
      else 'OTHER'
    end;
  elsif v_attachment_count>1 then
    v_media_type := 'OTHER';
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
       or coalesce(v_existing.original_text,'')<>coalesce(v_content,'')
       or coalesce(v_existing.metadata->'attachments','[]'::jsonb)<>v_safe_attachments
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
    v_media_type,v_content,'SENT',
    jsonb_build_object(
      'source','CHATWOOT_SIGNED_WEBHOOK',
      'chatwoot_event_id',e.id,
      'chatwoot_message_id',v_message_id,
      'chatwoot_sender_id',v_sender_id,
      'chatwoot_sender_type',v_sender_type,
      'chatwoot_inbox_mapping_id',e.chatwoot_inbox_mapping_id,
      'attachments',v_safe_attachments,
      'direct_storage_url_exposed',false
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

create or replace function public.web_chat_activation_readiness(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid default null
)
returns table(
  ready boolean,
  blockers text[],
  binding_id uuid,
  widget_config_id uuid,
  public_key text,
  allowed_origins text[],
  inbox_mapping_id uuid,
  inbox_last_verified_at timestamptz,
  acceptance_observed_at timestamptz,
  web_chat_ai_paused boolean,
  shadow_mode boolean,
  reconciliation_required_count bigint,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz
)
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_blockers text[] := array[]::text[];
  v_binding public.communication_channel_bindings%rowtype;
  v_widget public.web_chat_widget_configs%rowtype;
  v_binding_count integer := 0;
  v_inbox public.chatwoot_inbox_mappings%rowtype;
  v_acceptance timestamptz;
  v_controls public.system_controls%rowtype;
  v_reconciliation bigint := 0;
  v_last_inbound timestamptz;
  v_last_outbound timestamptz;
begin
  select count(*) into v_binding_count
  from public.communication_channel_bindings b
  where b.organization_id=p_organization_id
    and b.tenant_business_id=p_tenant_business_id
    and b.channel='WEB_CHAT'
    and b.status='ACTIVE'
    and (p_branch_id is null or b.branch_id=p_branch_id);

  if v_binding_count<>1 then
    v_blockers:=array_append(v_blockers,case when v_binding_count=0 then 'ACTIVE_BINDING_MISSING' else 'ACTIVE_BINDING_AMBIGUOUS' end);
  else
    select * into v_binding
    from public.communication_channel_bindings b
    where b.organization_id=p_organization_id
      and b.tenant_business_id=p_tenant_business_id
      and b.channel='WEB_CHAT'
      and b.status='ACTIVE'
      and (p_branch_id is null or b.branch_id=p_branch_id);

    if v_binding.provider<>'SMART_VISIONS' or v_binding.provider_destination_id is null then
      v_blockers:=array_append(v_blockers,'BUILTIN_BINDING_INCOMPLETE');
    end if;

    if not exists(
      select 1 from public.integration_connections ic
      where ic.organization_id=p_organization_id
        and ic.id=v_binding.integration_connection_id
        and ic.provider='SMART_VISIONS'
        and ic.channel='WEB_CHAT'
        and ic.enabled=true
        and ic.status='CONNECTED'
    ) then
      v_blockers:=array_append(v_blockers,'BUILTIN_INTEGRATION_CONFIG_MISSING');
    end if;

    select * into v_widget
    from public.web_chat_widget_configs w
    where w.organization_id=p_organization_id
      and w.tenant_business_id=p_tenant_business_id
      and w.communication_channel_binding_id=v_binding.id
      and w.enabled=true
    limit 2;

    if not found then
      v_blockers:=array_append(v_blockers,'ENABLED_WIDGET_MISSING');
    elsif v_widget.public_key<>v_binding.provider_destination_id
       or cardinality(v_widget.allowed_origins) not between 1 and 20
    then
      v_blockers:=array_append(v_blockers,'WIDGET_BINDING_MISMATCH');
    end if;

    select im.* into v_inbox
    from public.chatwoot_inbox_mappings im
    join public.chatwoot_account_mappings am
      on am.organization_id=im.organization_id
     and am.tenant_business_id=im.tenant_business_id
     and am.id=im.chatwoot_account_mapping_id
     and am.status='ACTIVE'
     and am.chatwoot_account_id is not null
    where im.organization_id=p_organization_id
      and im.tenant_business_id=p_tenant_business_id
      and im.communication_channel_binding_id=v_binding.id
      and im.status='ACTIVE'
      and im.channel_type='Channel::Api'
      and im.chatwoot_inbox_id is not null
      and im.chatwoot_channel_identifier is not null
    order by im.last_verified_at desc nulls last
    limit 1;

    if not found then
      v_blockers:=array_append(v_blockers,'CHATWOOT_INBOX_NOT_VERIFIED');
    end if;

    select count(*) into v_reconciliation
    from public.web_chat_events we
    join public.web_chat_sessions s
      on s.organization_id=we.organization_id and s.id=we.session_id
    where we.organization_id=p_organization_id
      and s.communication_channel_binding_id=v_binding.id
      and we.chatwoot_sync_status='RECONCILIATION_REQUIRED';
    if v_reconciliation>0 then
      v_blockers:=array_append(v_blockers,'RECONCILIATION_REQUIRED');
    end if;

    if v_widget.id is not null then
      select max(ar.observed_at) into v_acceptance
      from public.web_chat_activation_acceptance_receipts ar
      where ar.organization_id=p_organization_id
        and ar.tenant_business_id=p_tenant_business_id
        and ar.communication_channel_binding_id=v_binding.id
        and ar.widget_config_id=v_widget.id
        and ar.widget_version=v_widget.version
        and ar.public_key=v_widget.public_key
        and ar.origin=any(v_widget.allowed_origins);
    end if;
    if v_acceptance is null then
      v_blockers:=array_append(v_blockers,'LIVE_ACCEPTANCE_EVIDENCE_MISSING');
    end if;

    select max(cm.created_at) filter(where cm.direction='INBOUND'),
           max(cm.created_at) filter(where cm.direction='OUTBOUND')
      into v_last_inbound,v_last_outbound
    from public.conversation_messages cm
    join public.unified_inbox_conversation_projections up
      on up.organization_id=cm.organization_id
     and up.conversation_id=cm.conversation_id
     and up.communication_channel_binding_id=v_binding.id
     and up.lifecycle_status in('ACTIVE','DEGRADED')
    where cm.organization_id=p_organization_id and cm.channel='WEB_CHAT';
  end if;

  select * into v_controls from public.system_controls
   where organization_id=p_organization_id;
  if not found then
    v_blockers:=array_append(v_blockers,'SYSTEM_CONTROLS_MISSING');
  elsif v_controls.global_kill_switch then
    v_blockers:=array_append(v_blockers,'GLOBAL_KILL_SWITCH');
  end if;

  return query select
    cardinality(v_blockers)=0,
    v_blockers,
    v_binding.id,
    v_widget.id,
    v_widget.public_key,
    v_widget.allowed_origins,
    v_inbox.id,
    v_inbox.last_verified_at,
    v_acceptance,
    coalesce(v_controls.web_chat_ai_paused,true),
    coalesce(v_controls.shadow_mode,true),
    v_reconciliation,
    v_last_inbound,
    v_last_outbound;
end $$;

create or replace function public.record_web_chat_activation_acceptance(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_binding_id uuid,
  p_session_id uuid,
  p_inbound_event_id uuid,
  p_outbound_webhook_event_id uuid,
  p_request_key text
)
returns public.web_chat_activation_acceptance_receipts
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_existing public.web_chat_activation_acceptance_receipts%rowtype;
  v_created public.web_chat_activation_acceptance_receipts%rowtype;
  v_binding public.communication_channel_bindings%rowtype;
  v_widget public.web_chat_widget_configs%rowtype;
  v_session public.web_chat_sessions%rowtype;
  v_inbound_event public.web_chat_events%rowtype;
  v_outbound_event public.chatwoot_webhook_events%rowtype;
  v_projection public.unified_inbox_conversation_projections%rowtype;
  v_inbound_message public.conversation_messages%rowtype;
  v_outbound_message public.conversation_messages%rowtype;
  v_provider_message_id text;
  v_media_verified boolean := false;
begin
  if length(trim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'valid request key required';
  end if;

  select * into v_existing
  from public.web_chat_activation_acceptance_receipts
  where organization_id=p_organization_id and request_key=trim(p_request_key);
  if found then return v_existing; end if;

  select * into v_binding
  from public.communication_channel_bindings b
  where b.organization_id=p_organization_id
    and b.tenant_business_id=p_tenant_business_id
    and b.id=p_binding_id
    and b.channel='WEB_CHAT'
    and b.provider='SMART_VISIONS'
    and b.status='ACTIVE'
    and b.provider_destination_id is not null;
  if not found then raise exception 'eligible Web Chat binding required'; end if;

  select * into v_widget
  from public.web_chat_widget_configs w
  where w.organization_id=p_organization_id
    and w.tenant_business_id=p_tenant_business_id
    and w.communication_channel_binding_id=p_binding_id
    and w.public_key=v_binding.provider_destination_id
    and w.enabled=true;
  if not found then raise exception 'enabled Web Chat widget required'; end if;

  select * into v_session
  from public.web_chat_sessions s
  where s.organization_id=p_organization_id
    and s.tenant_business_id=p_tenant_business_id
    and s.communication_channel_binding_id=p_binding_id
    and s.widget_config_id=v_widget.id
    and s.id=p_session_id
    and s.status in('ACTIVE','CLOSED')
    and s.token_hash ~ '^[0-9a-f]{64}$'
    and s.origin=any(v_widget.allowed_origins)
    and s.conversation_id is not null;
  if not found then raise exception 'real scoped Web Chat session evidence required'; end if;
  if v_widget.consent_required and v_session.consent_accepted_at is null then
    raise exception 'Web Chat consent evidence required';
  end if;

  select * into v_inbound_event
  from public.web_chat_events we
  where we.organization_id=p_organization_id
    and we.session_id=p_session_id
    and we.id=p_inbound_event_id
    and we.event_type='MESSAGE'
    and we.chatwoot_sync_status='ACCEPTED'
    and we.chatwoot_message_id is not null
    and we.created_at between v_session.created_at and v_session.expires_at;
  if not found then raise exception 'accepted Web Chat inbound evidence required'; end if;

  v_provider_message_id:=nullif(trim(coalesce(v_inbound_event.payload->>'providerMessageId','')),'');
  select * into v_inbound_message
  from public.conversation_messages cm
  where cm.organization_id=p_organization_id
    and cm.conversation_id=v_session.conversation_id
    and cm.channel='WEB_CHAT'
    and cm.direction='INBOUND'
    and cm.provider_message_id=v_provider_message_id;
  if not found then raise exception 'canonical Web Chat inbound projection evidence required'; end if;

  select * into v_projection
  from public.unified_inbox_conversation_projections up
  where up.organization_id=p_organization_id
    and up.tenant_business_id=p_tenant_business_id
    and up.communication_channel_binding_id=p_binding_id
    and up.conversation_id=v_session.conversation_id
    and up.lifecycle_status in('ACTIVE','DEGRADED');
  if not found then raise exception 'canonical Web Chat conversation projection required'; end if;

  select * into v_outbound_event
  from public.chatwoot_webhook_events ce
  where ce.id=p_outbound_webhook_event_id
    and ce.organization_id=p_organization_id
    and ce.tenant_business_id=p_tenant_business_id
    and ce.chatwoot_inbox_mapping_id=v_projection.chatwoot_inbox_mapping_id
    and ce.event_type='message_created'
    and ce.status='PROCESSED'
    and lower(coalesce(ce.payload->>'message_type',''))='outgoing'
    and coalesce((ce.payload->>'private')::boolean,false)=false
    and coalesce(ce.payload->>'id','') ~ '^[1-9][0-9]*$'
    and coalesce(ce.payload->'conversation'->>'id','')=v_projection.chatwoot_conversation_display_id::text;
  if not found then raise exception 'signed Chatwoot outbound reply evidence required'; end if;

  select * into v_outbound_message
  from public.conversation_messages cm
  where cm.organization_id=p_organization_id
    and cm.conversation_id=v_session.conversation_id
    and cm.channel='WEB_CHAT'
    and cm.direction='OUTBOUND'
    and cm.provider_message_id='chatwoot:'||(v_outbound_event.payload->>'id')
    and cm.metadata->>'source'='CHATWOOT_SIGNED_WEBHOOK'
    and cm.metadata->>'chatwoot_event_id'=v_outbound_event.id::text;
  if not found then raise exception 'canonical Web Chat outbound projection evidence required'; end if;

  v_media_verified :=
    (jsonb_typeof(v_inbound_message.metadata->'attachments')='array'
      and jsonb_array_length(v_inbound_message.metadata->'attachments')>0)
    or
    (jsonb_typeof(v_outbound_message.metadata->'attachments')='array'
      and jsonb_array_length(v_outbound_message.metadata->'attachments')>0);
  if not v_media_verified then raise exception 'real Web Chat media evidence required'; end if;

  if exists(
    select 1
    from public.web_chat_events we
    join public.web_chat_sessions s
      on s.organization_id=we.organization_id and s.id=we.session_id
    where we.organization_id=p_organization_id
      and s.communication_channel_binding_id=p_binding_id
      and we.chatwoot_sync_status='RECONCILIATION_REQUIRED'
  ) then raise exception 'unresolved Web Chat reconciliation blocks acceptance'; end if;

  if exists(
    select 1 from public.system_controls sc
    where sc.organization_id=p_organization_id and sc.global_kill_switch
  ) then raise exception 'global kill switch blocks Web Chat acceptance'; end if;

  insert into public.web_chat_activation_acceptance_receipts(
    organization_id,tenant_business_id,branch_id,communication_channel_binding_id,
    widget_config_id,widget_version,public_key,session_id,inbound_event_id,
    outbound_webhook_event_id,origin,media_verified,observed_at,request_key
  ) values(
    p_organization_id,p_tenant_business_id,v_binding.branch_id,p_binding_id,
    v_widget.id,v_widget.version,v_widget.public_key,p_session_id,p_inbound_event_id,
    p_outbound_webhook_event_id,v_session.origin,true,statement_timestamp(),trim(p_request_key)
  ) returning * into v_created;
  return v_created;
end $$;

revoke all on function public.reconcile_web_chat_chatwoot_outbound_event(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_web_chat_chatwoot_outbound_event(uuid) to service_role;
revoke all on function public.web_chat_activation_readiness(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.web_chat_activation_readiness(uuid,uuid,uuid) to service_role;
revoke all on function public.record_web_chat_activation_acceptance(uuid,uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.record_web_chat_activation_acceptance(uuid,uuid,uuid,uuid,uuid,uuid,text) to service_role;
