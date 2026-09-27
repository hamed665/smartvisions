-- 0122: OMNI-TELEGRAM customer messaging foundation.
-- Keeps the existing Telegram Owner Assistant/control plane separate.
-- Extends canonical Smart Core channel/identity truth; no second CRM, Conversation store or queue.
-- Production activation remains disabled until a real tenant Bot credential + acceptance evidence exists.

alter table public.communication_channel_bindings
  drop constraint if exists communication_channel_bindings_channel_check;
alter table public.communication_channel_bindings
  add constraint communication_channel_bindings_channel_check
  check (channel in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT','TELEGRAM'));

alter table public.sales_conversations
  drop constraint if exists sales_conversations_channel_check;
alter table public.sales_conversations
  add constraint sales_conversations_channel_check
  check (channel in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT','TELEGRAM','WEB','OTHER'));

alter table public.conversation_messages
  drop constraint if exists conversation_messages_channel_check;
alter table public.conversation_messages
  add constraint conversation_messages_channel_check
  check (channel in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT','TELEGRAM','WEB','OTHER'));

alter table public.crm_identities
  drop constraint if exists crm_identities_identity_type_check;
alter table public.crm_identities
  add constraint crm_identities_identity_type_check
  check (identity_type in (
    'EMAIL','PHONE','WHATSAPP','INSTAGRAM','INSTAGRAM_PROVIDER_USER',
    'FACEBOOK_MESSENGER_PROVIDER_USER','WEBCHAT_SESSION','TELEGRAM_PROVIDER_USER'
  ));

alter table public.crm_identity_links
  drop constraint if exists crm_identity_links_source_type_check;
alter table public.crm_identity_links
  add constraint crm_identity_links_source_type_check
  check (source_type in (
    'BUSINESS_FIELD','EMAIL_INBOUND','WHATSAPP_INBOUND','INSTAGRAM_INBOUND',
    'FACEBOOK_MESSENGER_INBOUND','WEB_CHAT_VERIFIED','TELEGRAM_INBOUND','MANUAL','IMPORT'
  ));

alter table public.system_controls
  add column if not exists telegram_ai_paused boolean not null default true;

insert into public.integration_connections(
  organization_id,provider,channel,enabled,status,account_label,config
)
select o.id,'TELEGRAM','TELEGRAM',false,'NOT_CONFIGURED','Telegram Customer Messaging',
       '{"customer_messaging":true,"owner_assistant_separate":true}'::jsonb
from public.organizations o
on conflict (organization_id,provider,channel) do nothing;

create or replace function public.create_communication_channel_binding(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_integration_connection_id uuid,
  p_channel text,
  p_request_key text
)
returns public.communication_channel_bindings
language plpgsql
set search_path=public,auth,pg_catalog
as $function$
declare
 v_created public.communication_channel_bindings%rowtype;
 v_existing public.communication_channel_bindings%rowtype;
 v_claim record;
 v_actor uuid:=auth.uid();
 v_channel text:=upper(trim(coalesce(p_channel,'')));
 v_request_key text:=trim(coalesce(p_request_key,''));
 v_payload_hash text;
 v_ic public.integration_connections%rowtype;
begin
 if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
   raise exception 'Chatwoot bridge mutation not permitted';
 end if;
 if length(v_request_key) not between 1 and 200 then
   raise exception 'request key must contain 1..200 characters';
 end if;
 if v_channel not in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT','TELEGRAM') then
   raise exception 'unsupported communication channel';
 end if;
 select * into v_ic
 from public.integration_connections
 where id=p_integration_connection_id and organization_id=p_organization_id;
 if not found or v_ic.enabled<>true or v_ic.status<>'CONNECTED' or v_ic.channel<>v_channel then
   raise exception 'CONNECTED integration connection for exact channel required';
 end if;
 v_payload_hash:=encode(extensions.digest(jsonb_build_object(
   'organizationId',p_organization_id,
   'tenantBusinessId',p_tenant_business_id,
   'branchId',p_branch_id,
   'integrationConnectionId',p_integration_connection_id,
   'channel',v_channel
 )::text,'sha256'),'hex');
 perform set_config('smartvisions.chatwoot_bridge_command','1',true);
 select * into v_claim
 from public.claim_chatwoot_bridge_command(
   p_organization_id,v_request_key,'CREATE_CHANNEL_BINDING',
   'COMMUNICATION_CHANNEL_BINDING',null,1,v_payload_hash
 );
 if not v_claim.is_new then
   select * into v_existing
   from public.communication_channel_bindings
   where organization_id=p_organization_id and id=v_claim.entity_id;
   if not found then raise exception 'Chatwoot bridge command claim has no binding row'; end if;
   perform set_config('smartvisions.chatwoot_bridge_command','0',true);
   return v_existing;
 end if;
 insert into public.communication_channel_bindings(
   id,organization_id,tenant_business_id,branch_id,integration_connection_id,
   channel,status,version,last_request_key,created_by_user_id,updated_by_user_id
 ) values(
   v_claim.entity_id,p_organization_id,p_tenant_business_id,p_branch_id,
   p_integration_connection_id,v_channel,'ACTIVE',1,v_request_key,v_actor,v_actor
 ) returning * into v_created;
 perform set_config('smartvisions.chatwoot_bridge_command','0',true);
 return v_created;
exception when others then
 perform set_config('smartvisions.chatwoot_bridge_command','0',true);
 raise;
end
$function$;

create table public.telegram_customer_events(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  branch_id uuid not null,
  communication_channel_binding_id uuid not null,
  update_id bigint not null check(update_id>=0),
  event_type text not null check(event_type in('MESSAGE','EDITED_MESSAGE','CALLBACK_QUERY')),
  provider_message_id text,
  provider_chat_id text not null check(length(trim(provider_chat_id)) between 1 and 200),
  provider_user_id text,
  payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
  occurred_at timestamptz,
  identity_resolution_status text not null default 'PENDING'
    check(identity_resolution_status in('PENDING','MATCHED','UNRESOLVED','NOT_APPLICABLE')),
  chatwoot_sync_status text not null default 'PENDING'
    check(chatwoot_sync_status in('PENDING','IDENTITY_UNRESOLVED','PROCESSING','ACCEPTED','RECONCILIATION_REQUIRED','NOT_APPLICABLE')),
  chatwoot_message_id integer check(chatwoot_message_id is null or chatwoot_message_id>0),
  processing_started_at timestamptz,
  processing_error_code text check(
    processing_error_code is null
    or (
      length(processing_error_code) between 1 and 120
      and processing_error_code=upper(processing_error_code)
      and processing_error_code ~ '^[A-Z0-9_:.-]+$'
    )
  ),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(communication_channel_binding_id,update_id),
  foreign key(organization_id,tenant_business_id)
    references public.tenant_businesses(organization_id,id) on delete restrict,
  foreign key(organization_id,branch_id)
    references public.branches(organization_id,id) on delete restrict,
  foreign key(organization_id,communication_channel_binding_id)
    references public.communication_channel_bindings(organization_id,id) on delete restrict
);

create index telegram_customer_events_scope_idx
  on public.telegram_customer_events(
    organization_id,tenant_business_id,communication_channel_binding_id,created_at desc
  );
create index telegram_customer_events_sync_idx
  on public.telegram_customer_events(
    organization_id,chatwoot_sync_status,created_at
  ) where chatwoot_sync_status in('PENDING','IDENTITY_UNRESOLVED','PROCESSING','RECONCILIATION_REQUIRED');
create index telegram_customer_events_branch_fk_idx
  on public.telegram_customer_events(organization_id,branch_id);
create index telegram_customer_events_binding_fk_idx
  on public.telegram_customer_events(organization_id,communication_channel_binding_id);

alter table public.telegram_customer_events enable row level security;
revoke all on table public.telegram_customer_events from public,anon,authenticated,service_role;
grant select,insert,update on table public.telegram_customer_events to service_role;

create or replace function public.claim_telegram_customer_chatwoot_sync(
  p_event_id uuid
)
returns table(claimed boolean,current_status text)
language plpgsql
security definer
set search_path=public,pg_catalog
as $function$
declare
  e public.telegram_customer_events%rowtype;
begin
  select * into e
  from public.telegram_customer_events
  where id=p_event_id
  for update;

  if not found then
    raise exception 'Telegram customer event not found';
  end if;

  if e.chatwoot_sync_status='PROCESSING' then
    update public.telegram_customer_events
    set chatwoot_sync_status='RECONCILIATION_REQUIRED',
        processing_error_code='AMBIGUOUS_PROCESSING_REPLAY',
        processed_at=statement_timestamp()
    where id=e.id;
    return query select false,'RECONCILIATION_REQUIRED'::text;
    return;
  end if;

  if e.chatwoot_sync_status in('ACCEPTED','RECONCILIATION_REQUIRED','NOT_APPLICABLE') then
    return query select false,e.chatwoot_sync_status;
    return;
  end if;

  if e.chatwoot_sync_status not in('PENDING','IDENTITY_UNRESOLVED') then
    raise exception 'Telegram customer event has invalid sync state';
  end if;

  update public.telegram_customer_events
  set chatwoot_sync_status='PROCESSING',
      processing_started_at=statement_timestamp(),
      processing_error_code=null
  where id=e.id;

  return query select true,'PROCESSING'::text;
end
$function$;

create or replace function public.accept_telegram_customer_chatwoot_sync(
  p_event_id uuid,
  p_chatwoot_message_id integer
)
returns public.telegram_customer_events
language plpgsql
security definer
set search_path=public,pg_catalog
as $function$
declare
  e public.telegram_customer_events%rowtype;
begin
  if p_chatwoot_message_id is null or p_chatwoot_message_id<=0 then
    raise exception 'valid Chatwoot message id required';
  end if;

  update public.telegram_customer_events
  set chatwoot_sync_status='ACCEPTED',
      chatwoot_message_id=p_chatwoot_message_id,
      processing_error_code=null,
      processed_at=statement_timestamp()
  where id=p_event_id
    and chatwoot_sync_status='PROCESSING'
  returning * into e;

  if found then
    return e;
  end if;

  select * into e
  from public.telegram_customer_events
  where id=p_event_id;

  if not found then
    raise exception 'Telegram customer event not found';
  end if;
  if e.chatwoot_sync_status='ACCEPTED' and e.chatwoot_message_id=p_chatwoot_message_id then
    return e;
  end if;

  raise exception 'Telegram customer event was not processing';
end
$function$;

create or replace function public.require_telegram_customer_reconciliation(
  p_event_id uuid,
  p_error_code text
)
returns public.telegram_customer_events
language plpgsql
security definer
set search_path=public,pg_catalog
as $function$
declare
  e public.telegram_customer_events%rowtype;
  v_code text:=upper(trim(coalesce(p_error_code,'')));
begin
  if length(v_code) not between 1 and 120
     or v_code !~ '^[A-Z0-9_:.-]+$'
  then
    raise exception 'valid reconciliation error code required';
  end if;

  update public.telegram_customer_events
  set chatwoot_sync_status='RECONCILIATION_REQUIRED',
      processing_error_code=v_code,
      processed_at=statement_timestamp()
  where id=p_event_id
    and chatwoot_sync_status='PROCESSING'
  returning * into e;

  if found then
    return e;
  end if;

  select * into e
  from public.telegram_customer_events
  where id=p_event_id;

  if not found then
    raise exception 'Telegram customer event not found';
  end if;
  if e.chatwoot_sync_status='RECONCILIATION_REQUIRED' then
    return e;
  end if;

  raise exception 'Telegram customer event was not processing';
end
$function$;

revoke all on function public.claim_telegram_customer_chatwoot_sync(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_telegram_customer_chatwoot_sync(uuid)
  to service_role;

revoke all on function public.accept_telegram_customer_chatwoot_sync(uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.accept_telegram_customer_chatwoot_sync(uuid,integer)
  to service_role;

revoke all on function public.require_telegram_customer_reconciliation(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.require_telegram_customer_reconciliation(uuid,text)
  to service_role;

create or replace function public.configure_telegram_customer_binding(
  p_organization_id uuid,
  p_binding_id uuid,
  p_expected_version integer,
  p_bot_id text,
  p_bot_username text,
  p_bot_token text,
  p_webhook_secret text,
  p_request_key text
)
returns public.communication_channel_bindings
language plpgsql
security invoker
set search_path=public,auth,vault,pg_catalog
as $$
declare
  v_current public.communication_channel_bindings%rowtype;
  v_updated public.communication_channel_bindings%rowtype;
  v_actor uuid:=auth.uid();
  v_bot_id text:=trim(coalesce(p_bot_id,''));
  v_username text:=regexp_replace(trim(coalesce(p_bot_username,'')),'^@','','g');
  v_token text:=trim(coalesce(p_bot_token,''));
  v_webhook_secret text:=trim(coalesce(p_webhook_secret,''));
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_secret_id uuid;
  v_secret_value text;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Telegram binding configuration not permitted';
  end if;
  if p_expected_version is null or p_expected_version<1
     or v_bot_id !~ '^[1-9][0-9]{4,19}$'
     or length(v_username) not between 5 and 64
     or v_username !~ '^[A-Za-z0-9_]+$'
     or length(v_token) not between 20 and 256
     or position(':' in v_token)=0
     or length(v_webhook_secret) not between 16 and 128
     or v_webhook_secret !~ '^[A-Za-z0-9_-]+$'
     or length(v_request_key) not between 8 and 200
  then raise exception 'invalid Telegram binding configuration'; end if;

  select * into v_current
  from public.communication_channel_bindings
  where organization_id=p_organization_id and id=p_binding_id
  for update;

  if not found
     or v_current.channel<>'TELEGRAM'
     or v_current.status<>'ACTIVE'
     or v_current.version<>p_expected_version
     or v_current.branch_id is null
  then raise exception 'Telegram binding is not eligible for configuration'; end if;

  if not exists(
    select 1 from public.integration_connections ic
    where ic.organization_id=p_organization_id
      and ic.id=v_current.integration_connection_id
      and ic.provider='TELEGRAM'
      and ic.channel='TELEGRAM'
      and ic.enabled=true
      and ic.status='CONNECTED'
  ) then raise exception 'CONNECTED Telegram integration required'; end if;

  if exists(
    select 1 from public.communication_channel_bindings sibling
    where sibling.status='ACTIVE'
      and sibling.channel='TELEGRAM'
      and sibling.provider='TELEGRAM'
      and sibling.provider_destination_id=v_bot_id
      and sibling.id<>v_current.id
  ) then raise exception 'Telegram Bot is already bound'; end if;

  v_secret_value:=jsonb_build_object(
    'botToken',v_token,
    'webhookSecret',v_webhook_secret
  )::text;

  if v_current.provider_secret_ref is null then
    v_secret_id:=vault.create_secret(
      v_secret_value,
      'telegram_customer_binding_'||replace(v_current.id::text,'-',''),
      'Smart Visions tenant-bound Telegram customer Bot credential',
      null
    );
  else
    perform vault.update_secret(
      v_current.provider_secret_ref,
      v_secret_value,
      null,
      'Smart Visions tenant-bound Telegram customer Bot credential',
      null
    );
    v_secret_id:=v_current.provider_secret_ref;
  end if;

  update public.communication_channel_bindings
  set provider='TELEGRAM',
      provider_account_id=v_bot_id,
      provider_destination_id=v_bot_id,
      provider_destination_label='@'||v_username,
      provider_secret_ref=v_secret_id,
      version=version+1,
      last_request_key=v_request_key,
      last_error_code=null,
      updated_by_user_id=v_actor
  where organization_id=p_organization_id and id=p_binding_id and version=p_expected_version
  returning * into v_updated;

  if not found then raise exception 'Telegram binding configuration lost optimistic lock'; end if;
  return v_updated;
end $$;

create or replace function public.resolve_telegram_customer_credential(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid default null
)
returns table(
  binding_id uuid,
  integration_connection_id uuid,
  bot_id text,
  bot_username text,
  bot_token text,
  webhook_secret text
)
language plpgsql
security definer
set search_path=public,vault,pg_catalog
as $$
declare
  v_binding public.communication_channel_bindings%rowtype;
  v_secret text;
  v_json jsonb;
  v_count integer;
begin
  select count(*) into v_count
  from public.communication_channel_bindings b
  join public.integration_connections ic
    on ic.id=b.integration_connection_id and ic.organization_id=b.organization_id
  where b.organization_id=p_organization_id
    and b.tenant_business_id=p_tenant_business_id
    and b.status='ACTIVE'
    and b.channel='TELEGRAM'
    and b.provider='TELEGRAM'
    and b.provider_destination_id is not null
    and b.provider_secret_ref is not null
    and ic.enabled=true
    and ic.status='CONNECTED'
    and ic.provider='TELEGRAM'
    and ic.channel='TELEGRAM'
    and ((p_branch_id is not null and b.branch_id=p_branch_id)
      or (p_branch_id is null and b.branch_id is null));

  if v_count=0 then raise exception 'Telegram tenant credential is not configured';
  elsif v_count>1 then raise exception 'Telegram tenant credential is ambiguous'; end if;

  select b.* into v_binding
  from public.communication_channel_bindings b
  join public.integration_connections ic
    on ic.id=b.integration_connection_id and ic.organization_id=b.organization_id
  where b.organization_id=p_organization_id
    and b.tenant_business_id=p_tenant_business_id
    and b.status='ACTIVE'
    and b.channel='TELEGRAM'
    and b.provider='TELEGRAM'
    and b.provider_destination_id is not null
    and b.provider_secret_ref is not null
    and ic.enabled=true
    and ic.status='CONNECTED'
    and ic.provider='TELEGRAM'
    and ic.channel='TELEGRAM'
    and ((p_branch_id is not null and b.branch_id=p_branch_id)
      or (p_branch_id is null and b.branch_id is null));

  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds where ds.id=v_binding.provider_secret_ref;
  if v_secret is null then raise exception 'Telegram tenant credential secret is unavailable'; end if;

  begin v_json:=v_secret::jsonb;
  exception when others then raise exception 'Telegram tenant credential secret is invalid'; end;

  if length(trim(coalesce(v_json->>'botToken','')))<20
     or length(trim(coalesce(v_json->>'webhookSecret','')))<16
  then raise exception 'Telegram tenant credential secret is incomplete'; end if;

  return query select
    v_binding.id,
    v_binding.integration_connection_id,
    v_binding.provider_destination_id,
    nullif(regexp_replace(coalesce(v_binding.provider_destination_label,''),'^@','','g'),''),
    v_json->>'botToken',
    v_json->>'webhookSecret';
end $$;

create or replace function public.resolve_telegram_customer_webhook(
  p_binding_id uuid
)
returns table(
  organization_id uuid,
  tenant_business_id uuid,
  branch_id uuid,
  binding_id uuid,
  integration_connection_id uuid,
  bot_id text,
  bot_username text,
  bot_token text,
  webhook_secret text
)
language plpgsql
security definer
set search_path=public,vault,pg_catalog
as $$
declare
  v_binding public.communication_channel_bindings%rowtype;
  v_secret text;
  v_json jsonb;
begin
  select b.* into v_binding
  from public.communication_channel_bindings b
  join public.integration_connections ic
    on ic.id=b.integration_connection_id and ic.organization_id=b.organization_id
  where b.id=p_binding_id
    and b.status='ACTIVE'
    and b.channel='TELEGRAM'
    and b.provider='TELEGRAM'
    and b.branch_id is not null
    and b.provider_destination_id is not null
    and b.provider_secret_ref is not null
    and ic.enabled=true
    and ic.status='CONNECTED'
    and ic.provider='TELEGRAM'
    and ic.channel='TELEGRAM';

  if not found then raise exception 'Telegram webhook binding unavailable'; end if;

  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds where ds.id=v_binding.provider_secret_ref;
  if v_secret is null then raise exception 'Telegram webhook credential unavailable'; end if;
  begin v_json:=v_secret::jsonb;
  exception when others then raise exception 'Telegram webhook credential invalid'; end;

  if length(trim(coalesce(v_json->>'botToken','')))<20
     or length(trim(coalesce(v_json->>'webhookSecret','')))<16
  then raise exception 'Telegram webhook credential incomplete'; end if;

  return query select
    v_binding.organization_id,
    v_binding.tenant_business_id,
    v_binding.branch_id,
    v_binding.id,
    v_binding.integration_connection_id,
    v_binding.provider_destination_id,
    nullif(regexp_replace(coalesce(v_binding.provider_destination_label,''),'^@','','g'),''),
    v_json->>'botToken',
    v_json->>'webhookSecret';
end $$;

create or replace function public.resolve_telegram_provider_business(
  p_organization_id uuid,
  p_binding_id uuid,
  p_provider_user_id text
)
returns table(business_id uuid,identity_id uuid)
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_value text:=trim(coalesce(p_provider_user_id,''));
  v_identity uuid;
  v_count integer;
begin
  if p_organization_id is null or p_binding_id is null or length(v_value) not between 1 and 512 then
    raise exception 'Telegram provider identity scope is required';
  end if;
  if not exists(
    select 1 from public.communication_channel_bindings b
    where b.organization_id=p_organization_id
      and b.id=p_binding_id
      and b.channel='TELEGRAM'
      and b.provider='TELEGRAM'
      and b.status='ACTIVE'
  ) then raise exception 'Telegram binding is not active'; end if;

  select i.id into v_identity
  from public.crm_identities i
  where i.organization_id=p_organization_id
    and i.identity_type='TELEGRAM_PROVIDER_USER'
    and i.normalized_value=p_binding_id::text||':'||v_value
    and i.status='ACTIVE';

  if v_identity is null then return; end if;

  select count(distinct l.business_id)::integer into v_count
  from public.crm_identity_links l
  where l.organization_id=p_organization_id
    and l.identity_id=v_identity
    and l.status='ACTIVE';

  if v_count>1 then raise exception 'Telegram provider identity is ambiguous';
  elsif v_count=1 then
    return query
    select l.business_id,l.identity_id
    from public.crm_identity_links l
    where l.organization_id=p_organization_id
      and l.identity_id=v_identity
      and l.status='ACTIVE'
    limit 1;
  end if;
end $$;

create or replace function public.project_telegram_inbound_message(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_binding_id uuid,
  p_business_id uuid,
  p_identity_id uuid,
  p_event_id uuid,
  p_provider_message_id text,
  p_message_text text,
  p_media_type text,
  p_message_metadata jsonb,
  p_chatwoot_conversation_display_id integer,
  p_chatwoot_conversation_uuid uuid,
  p_chatwoot_contact_id bigint,
  p_occurred_at timestamptz,
  p_request_key text
)
returns table(
  lead_id uuid,
  conversation_id uuid,
  message_id uuid,
  projection_id uuid,
  message_inserted boolean
)
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_lead_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_projection_id uuid;
  v_projected_chatwoot_id integer;
  v_mapping_id uuid;
  v_brand_id uuid;
  v_inserted boolean:=false;
  v_now timestamptz:=coalesce(p_occurred_at,now());
  v_metadata jsonb:=coalesce(p_message_metadata,'{}'::jsonb);
begin
  if p_provider_message_id is null or length(trim(p_provider_message_id)) not between 1 and 500 then
    raise exception 'provider message id required';
  end if;
  if p_event_id is null or not exists(
    select 1 from public.telegram_customer_events e
    where e.organization_id=p_organization_id
      and e.id=p_event_id
      and e.communication_channel_binding_id=p_binding_id
  ) then raise exception 'Telegram event journal evidence required'; end if;
  if p_chatwoot_conversation_display_id is null or p_chatwoot_conversation_display_id<=0 then
    raise exception 'valid Chatwoot conversation required';
  end if;
  if p_request_key is null or length(trim(p_request_key)) not between 8 and 200 then
    raise exception 'valid request key required';
  end if;
  if jsonb_typeof(v_metadata)<>'object' then raise exception 'Telegram message metadata must be an object'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_business_id::text,0));

  select tb.brand_id into v_brand_id
  from public.tenant_businesses tb
  where tb.organization_id=p_organization_id
    and tb.id=p_tenant_business_id
    and tb.status='ACTIVE';
  if v_brand_id is null then raise exception 'active tenant business not found'; end if;

  if not exists(
    select 1 from public.branches br
    where br.organization_id=p_organization_id
      and br.id=p_branch_id
      and br.tenant_business_id=p_tenant_business_id
      and br.status='ACTIVE'
  ) then raise exception 'active branch scope mismatch'; end if;

  if not exists(
    select 1 from public.communication_channel_bindings cb
    where cb.organization_id=p_organization_id
      and cb.id=p_binding_id
      and cb.tenant_business_id=p_tenant_business_id
      and cb.branch_id=p_branch_id
      and cb.channel='TELEGRAM'
      and cb.provider='TELEGRAM'
      and cb.status='ACTIVE'
  ) then raise exception 'active Telegram binding mismatch'; end if;

  if not exists(
    select 1
    from public.crm_identity_links l
    join public.crm_identities i
      on i.id=l.identity_id and i.organization_id=l.organization_id
    where l.organization_id=p_organization_id
      and l.business_id=p_business_id
      and l.identity_id=p_identity_id
      and l.status='ACTIVE'
      and i.identity_type='TELEGRAM_PROVIDER_USER'
      and i.status='ACTIVE'
  ) then raise exception 'verified Telegram canonical identity link required'; end if;

  select im.id into v_mapping_id
  from public.chatwoot_inbox_mappings im
  where im.organization_id=p_organization_id
    and im.tenant_business_id=p_tenant_business_id
    and im.branch_id=p_branch_id
    and im.communication_channel_binding_id=p_binding_id
    and im.chatwoot_inbox_id is not null
    and im.status='ACTIVE';
  if v_mapping_id is null then raise exception 'active Chatwoot inbox mapping required'; end if;

  insert into public.leads(organization_id,business_id,status,agent_mode)
  values(p_organization_id,p_business_id,'REPLIED','AUTO')
  on conflict(organization_id,business_id) where business_id is not null
  do update set updated_at=excluded.updated_at
  returning id into v_lead_id;

  select p.conversation_id,p.id,p.chatwoot_conversation_display_id
  into v_conversation_id,v_projection_id,v_projected_chatwoot_id
  from public.unified_inbox_conversation_projections p
  join public.sales_conversations sc
    on sc.organization_id=p.organization_id and sc.id=p.conversation_id
  where p.organization_id=p_organization_id
    and p.tenant_business_id=p_tenant_business_id
    and p.branch_id=p_branch_id
    and p.communication_channel_binding_id=p_binding_id
    and sc.lead_id=v_lead_id
    and sc.channel='TELEGRAM'
    and p.lifecycle_status in('ACTIVE','DEGRADED')
  order by p.updated_at desc limit 1;

  if v_conversation_id is not null
     and v_projected_chatwoot_id<>p_chatwoot_conversation_display_id
  then raise exception 'Chatwoot conversation does not match canonical Telegram projection'; end if;

  if v_conversation_id is null then
    insert into public.sales_conversations(
      organization_id,lead_id,channel,stage,agent_mode,last_message_at,
      last_inbound_at,unread_count,awaiting_party,stage_reason
    ) values(
      p_organization_id,v_lead_id,'TELEGRAM','ACTIVE','AUTO',v_now,
      v_now,0,'US','TELEGRAM_INBOUND'
    ) returning id into v_conversation_id;

    perform set_config('smartvisions.unified_inbox_projection_command','1',true);
    insert into public.unified_inbox_conversation_projections(
      organization_id,conversation_id,brand_id,tenant_business_id,branch_id,
      communication_channel_binding_id,chatwoot_inbox_mapping_id,
      chatwoot_conversation_display_id,chatwoot_conversation_uuid,
      chatwoot_contact_id,chatwoot_status,last_activity_at,last_request_key,last_reconciled_at
    ) values(
      p_organization_id,v_conversation_id,v_brand_id,p_tenant_business_id,p_branch_id,
      p_binding_id,v_mapping_id,p_chatwoot_conversation_display_id,
      p_chatwoot_conversation_uuid,p_chatwoot_contact_id,'open',v_now,p_request_key,now()
    ) returning id into v_projection_id;
  end if;

  insert into public.conversation_messages(
    organization_id,conversation_id,lead_id,provider_message_id,channel,direction,
    media_type,original_text,status,metadata,created_at
  ) values(
    p_organization_id,v_conversation_id,v_lead_id,trim(p_provider_message_id),
    'TELEGRAM','INBOUND',coalesce(nullif(upper(p_media_type),''),'TEXT'),
    p_message_text,'RECEIVED',
    v_metadata||jsonb_build_object(
      'source','TELEGRAM_CUSTOMER_WEBHOOK',
      'canonical_identity_id',p_identity_id,
      'binding_id',p_binding_id,
      'telegram_event_id',p_event_id
    ),
    v_now
  )
  on conflict(organization_id,channel,provider_message_id)
    where provider_message_id is not null
  do nothing
  returning id into v_message_id;

  v_inserted:=v_message_id is not null;
  if not v_inserted then
    select cm.id into v_message_id
    from public.conversation_messages cm
    where cm.organization_id=p_organization_id
      and cm.channel='TELEGRAM'
      and cm.provider_message_id=trim(p_provider_message_id);
  else
    update public.sales_conversations
    set stage=case when stage in('NEW','WAITING_CUSTOMER','UNANSWERED','FOLLOW_UP_DUE') then 'ACTIVE' else stage end,
        last_message_at=v_now,
        last_inbound_at=v_now,
        unread_count=unread_count+1,
        awaiting_party=case when agent_mode='AUTO' and not requires_human then 'US' else awaiting_party end,
        stage_reason='TELEGRAM_INBOUND',
        updated_at=now()
    where organization_id=p_organization_id and id=v_conversation_id;

    perform set_config('smartvisions.unified_inbox_projection_command','1',true);
    update public.unified_inbox_conversation_projections
    set last_activity_at=v_now,
        last_request_key=p_request_key,
        last_reconciled_at=now(),
        version=version+1
    where organization_id=p_organization_id and id=v_projection_id;
  end if;

  return query select v_lead_id,v_conversation_id,v_message_id,v_projection_id,v_inserted;
exception when others then
  perform set_config('smartvisions.unified_inbox_projection_command','0',true);
  raise;
end $$;

create table public.telegram_activation_acceptance_receipts(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  branch_id uuid not null,
  communication_channel_binding_id uuid not null,
  provider_destination_id text not null,
  inbound_event_id uuid not null,
  outbound_provider_message_id text not null,
  media_verified boolean not null check(media_verified=true),
  observed_at timestamptz not null,
  request_key text not null check(length(trim(request_key)) between 8 and 200),
  created_at timestamptz not null default now(),
  unique(organization_id,request_key),
  foreign key(organization_id,tenant_business_id)
    references public.tenant_businesses(organization_id,id) on delete restrict,
  foreign key(organization_id,branch_id)
    references public.branches(organization_id,id) on delete restrict,
  foreign key(organization_id,communication_channel_binding_id)
    references public.communication_channel_bindings(organization_id,id) on delete restrict,
  foreign key(organization_id,inbound_event_id)
    references public.telegram_customer_events(organization_id,id) on delete restrict
);

create index telegram_acceptance_binding_idx
  on public.telegram_activation_acceptance_receipts(
    organization_id,tenant_business_id,communication_channel_binding_id,observed_at desc
  );

alter table public.telegram_activation_acceptance_receipts enable row level security;
revoke all on table public.telegram_activation_acceptance_receipts from public,anon,authenticated,service_role;
grant select,insert on table public.telegram_activation_acceptance_receipts to service_role;

create or replace function public.telegram_activation_readiness(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid default null
)
returns table(
  ready boolean,
  blockers text[],
  binding_id uuid,
  destination_id text,
  inbox_mapping_id uuid,
  telegram_ai_paused boolean,
  reconciliation_required_count bigint
)
language plpgsql
security definer
set search_path=public,vault,pg_catalog
as $$
declare
  v_blockers text[]:=array[]::text[];
  v_binding public.communication_channel_bindings%rowtype;
  v_count integer;
  v_inbox uuid;
  v_secret text;
  v_json jsonb;
  v_reconciliation bigint:=0;
  v_paused boolean:=true;
begin
  select count(*) into v_count
  from public.communication_channel_bindings b
  where b.organization_id=p_organization_id
    and b.tenant_business_id=p_tenant_business_id
    and b.channel='TELEGRAM'
    and b.status='ACTIVE'
    and ((p_branch_id is null and b.branch_id is null) or b.branch_id=p_branch_id);

  if v_count<>1 then
    v_blockers:=array_append(v_blockers,case when v_count=0 then 'ACTIVE_BINDING_MISSING' else 'ACTIVE_BINDING_AMBIGUOUS' end);
  else
    select * into v_binding
    from public.communication_channel_bindings b
    where b.organization_id=p_organization_id
      and b.tenant_business_id=p_tenant_business_id
      and b.channel='TELEGRAM'
      and b.status='ACTIVE'
      and ((p_branch_id is null and b.branch_id is null) or b.branch_id=p_branch_id);

    if v_binding.provider<>'TELEGRAM'
       or v_binding.provider_destination_id is null
       or v_binding.provider_secret_ref is null
    then v_blockers:=array_append(v_blockers,'TELEGRAM_CREDENTIAL_BINDING_INCOMPLETE');
    else
      select ds.decrypted_secret into v_secret
      from vault.decrypted_secrets ds where ds.id=v_binding.provider_secret_ref;
      begin v_json:=v_secret::jsonb;
      exception when others then v_json:=null; end;
      if v_json is null
         or length(trim(coalesce(v_json->>'botToken','')))<20
         or length(trim(coalesce(v_json->>'webhookSecret','')))<16
      then v_blockers:=array_append(v_blockers,'VAULT_SECRET_UNAVAILABLE'); end if;
    end if;

    if not exists(
      select 1 from public.integration_connections ic
      where ic.organization_id=p_organization_id
        and ic.id=v_binding.integration_connection_id
        and ic.provider='TELEGRAM'
        and ic.channel='TELEGRAM'
        and ic.enabled=true
        and ic.status='CONNECTED'
    ) then v_blockers:=array_append(v_blockers,'INTEGRATION_NOT_CONNECTED'); end if;

    select im.id into v_inbox
    from public.chatwoot_inbox_mappings im
    where im.organization_id=p_organization_id
      and im.tenant_business_id=p_tenant_business_id
      and im.communication_channel_binding_id=v_binding.id
      and im.status='ACTIVE'
      and im.chatwoot_inbox_id is not null
      and im.chatwoot_channel_identifier is not null
    order by im.last_verified_at desc nulls last
    limit 1;
    if v_inbox is null then v_blockers:=array_append(v_blockers,'CHATWOOT_INBOX_NOT_VERIFIED'); end if;

    select count(*) into v_reconciliation
    from public.telegram_customer_events e
    where e.organization_id=p_organization_id
      and e.communication_channel_binding_id=v_binding.id
      and e.chatwoot_sync_status='RECONCILIATION_REQUIRED';
    if v_reconciliation>0 then v_blockers:=array_append(v_blockers,'RECONCILIATION_REQUIRED'); end if;

    if not exists(
      select 1 from public.telegram_activation_acceptance_receipts ar
      where ar.organization_id=p_organization_id
        and ar.tenant_business_id=p_tenant_business_id
        and ar.communication_channel_binding_id=v_binding.id
        and ar.provider_destination_id=v_binding.provider_destination_id
    ) then v_blockers:=array_append(v_blockers,'LIVE_ACCEPTANCE_EVIDENCE_MISSING'); end if;
  end if;

  select coalesce(sc.telegram_ai_paused,true) into v_paused
  from public.system_controls sc where sc.organization_id=p_organization_id;

  if exists(
    select 1 from public.system_controls sc
    where sc.organization_id=p_organization_id and sc.global_kill_switch
  ) then v_blockers:=array_append(v_blockers,'GLOBAL_KILL_SWITCH'); end if;

  return query select
    cardinality(v_blockers)=0,
    v_blockers,
    v_binding.id,
    v_binding.provider_destination_id,
    v_inbox,
    coalesce(v_paused,true),
    v_reconciliation;
end $$;

create or replace function public.record_telegram_activation_acceptance(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_binding_id uuid,
  p_inbound_event_id uuid,
  p_outbound_provider_message_id text,
  p_request_key text
)
returns public.telegram_activation_acceptance_receipts
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  b public.communication_channel_bindings%rowtype;
  i public.telegram_customer_events%rowtype;
  o public.conversation_messages%rowtype;
  e public.telegram_activation_acceptance_receipts%rowtype;
  r public.telegram_activation_acceptance_receipts%rowtype;
  v_media boolean:=false;
begin
  if length(trim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'valid request key required';
  end if;
  select * into e
  from public.telegram_activation_acceptance_receipts
  where organization_id=p_organization_id and request_key=trim(p_request_key);
  if found then return e; end if;

  select * into b
  from public.communication_channel_bindings
  where organization_id=p_organization_id
    and tenant_business_id=p_tenant_business_id
    and id=p_binding_id
    and channel='TELEGRAM'
    and provider='TELEGRAM'
    and status='ACTIVE'
    and provider_destination_id is not null
    and provider_secret_ref is not null;
  if not found or b.branch_id is null then raise exception 'eligible Telegram binding required'; end if;

  select * into i
  from public.telegram_customer_events
  where organization_id=p_organization_id
    and id=p_inbound_event_id
    and communication_channel_binding_id=p_binding_id
    and event_type in('MESSAGE','EDITED_MESSAGE')
    and chatwoot_sync_status='ACCEPTED';
  if not found then raise exception 'real signed inbound Telegram evidence required'; end if;

  v_media:=coalesce(jsonb_array_length(
    case when jsonb_typeof(i.payload->'media')='array' then i.payload->'media' else '[]'::jsonb end
  ),0)>0;
  if not v_media then raise exception 'real Telegram media evidence required'; end if;

  select * into o
  from public.conversation_messages
  where organization_id=p_organization_id
    and channel='TELEGRAM'
    and direction='OUTBOUND'
    and provider_message_id=trim(p_outbound_provider_message_id)
    and provider_delivery_status='ACCEPTED'
  order by created_at desc limit 1;
  if not found then raise exception 'provider-accepted Telegram outbound evidence required'; end if;

  if not exists(
    select 1 from public.unified_inbox_conversation_projections p
    where p.organization_id=p_organization_id
      and p.conversation_id=o.conversation_id
      and p.tenant_business_id=p_tenant_business_id
      and p.communication_channel_binding_id=p_binding_id
      and p.lifecycle_status in('ACTIVE','DEGRADED')
  ) then raise exception 'outbound evidence is outside canonical Telegram tenant projection'; end if;

  insert into public.telegram_activation_acceptance_receipts(
    organization_id,tenant_business_id,branch_id,communication_channel_binding_id,
    provider_destination_id,inbound_event_id,outbound_provider_message_id,
    media_verified,observed_at,request_key
  ) values(
    p_organization_id,p_tenant_business_id,b.branch_id,p_binding_id,
    b.provider_destination_id,i.id,o.provider_message_id,
    true,now(),trim(p_request_key)
  ) returning * into r;
  return r;
end $$;

revoke all on function public.configure_telegram_customer_binding(uuid,uuid,integer,text,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.configure_telegram_customer_binding(uuid,uuid,integer,text,text,text,text,text)
  to authenticated;

revoke all on function public.resolve_telegram_customer_credential(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.resolve_telegram_customer_credential(uuid,uuid,uuid)
  to service_role;

revoke all on function public.resolve_telegram_customer_webhook(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.resolve_telegram_customer_webhook(uuid)
  to service_role;

revoke all on function public.resolve_telegram_provider_business(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.resolve_telegram_provider_business(uuid,uuid,text)
  to service_role;

revoke all on function public.project_telegram_inbound_message(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,integer,uuid,bigint,timestamptz,text
) from public,anon,authenticated,service_role;
grant execute on function public.project_telegram_inbound_message(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,integer,uuid,bigint,timestamptz,text
) to service_role;

revoke all on function public.telegram_activation_readiness(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.telegram_activation_readiness(uuid,uuid,uuid)
  to service_role;

revoke all on function public.record_telegram_activation_acceptance(uuid,uuid,uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_telegram_activation_acceptance(uuid,uuid,uuid,uuid,text,text)
  to service_role;
