-- 0115: OMNI-WEBCHAT tenant/session/inbound foundation.
-- Built-in channel: no external credential. Anonymous sessions remain non-Person identities until verified linkage.

alter table public.communication_channel_bindings drop constraint if exists communication_channel_bindings_channel_check;
alter table public.communication_channel_bindings add constraint communication_channel_bindings_channel_check
check (channel in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT'));

alter table public.crm_identities drop constraint if exists crm_identities_identity_type_check;
alter table public.crm_identities add constraint crm_identities_identity_type_check
check (identity_type in ('EMAIL','PHONE','WHATSAPP','INSTAGRAM','INSTAGRAM_PROVIDER_USER','FACEBOOK_MESSENGER_PROVIDER_USER','WEBCHAT_SESSION'));

alter table public.crm_identity_links drop constraint if exists crm_identity_links_source_type_check;
alter table public.crm_identity_links add constraint crm_identity_links_source_type_check
check (source_type in ('BUSINESS_FIELD','EMAIL_INBOUND','WHATSAPP_INBOUND','INSTAGRAM_INBOUND','FACEBOOK_MESSENGER_INBOUND','WEB_CHAT_VERIFIED','MANUAL','IMPORT'));

alter table public.sales_conversations drop constraint if exists sales_conversations_channel_check;
alter table public.sales_conversations add constraint sales_conversations_channel_check
check (channel in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT','WEB','OTHER'));

alter table public.conversation_messages drop constraint if exists conversation_messages_channel_check;
alter table public.conversation_messages add constraint conversation_messages_channel_check
check (channel in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT','WEB','OTHER'));

alter table public.system_controls add column if not exists web_chat_ai_paused boolean not null default true;

insert into public.integration_connections(organization_id,provider,channel,enabled,status,account_label,config)
select o.id,'SMART_VISIONS','WEB_CHAT',true,'CONNECTED','Built-in Web Chat','{"builtin":true}'::jsonb
from public.organizations o
on conflict(organization_id,provider,channel) do update
set enabled=true,status='CONNECTED',account_label='Built-in Web Chat',
    config=coalesce(public.integration_connections.config,'{}'::jsonb)||'{"builtin":true}'::jsonb,
    last_error=null,updated_at=now();

create or replace function public.create_communication_channel_binding(
  p_organization_id uuid,p_tenant_business_id uuid,p_branch_id uuid,
  p_integration_connection_id uuid,p_channel text,p_request_key text
)
returns public.communication_channel_bindings
language plpgsql
set search_path=public,auth,pg_catalog
as $$
declare
 v_created public.communication_channel_bindings%rowtype; v_existing public.communication_channel_bindings%rowtype;
 v_claim record; v_actor uuid:=auth.uid(); v_channel text:=upper(trim(coalesce(p_channel,'')));
 v_request_key text:=trim(coalesce(p_request_key,'')); v_payload_hash text; v_ic public.integration_connections%rowtype;
begin
 if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then raise exception 'Chatwoot bridge mutation not permitted'; end if;
 if length(v_request_key) not between 1 and 200 then raise exception 'request key must contain 1..200 characters'; end if;
 if v_channel not in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT') then raise exception 'unsupported communication channel'; end if;
 select * into v_ic from public.integration_connections where id=p_integration_connection_id and organization_id=p_organization_id;
 if not found or v_ic.enabled<>true or v_ic.status<>'CONNECTED' or v_ic.channel<>v_channel then raise exception 'CONNECTED integration connection for exact channel required'; end if;
 v_payload_hash:=encode(extensions.digest(jsonb_build_object('organizationId',p_organization_id,'tenantBusinessId',p_tenant_business_id,'branchId',p_branch_id,'integrationConnectionId',p_integration_connection_id,'channel',v_channel)::text,'sha256'),'hex');
 perform set_config('smartvisions.chatwoot_bridge_command','1',true);
 select * into v_claim from public.claim_chatwoot_bridge_command(p_organization_id,v_request_key,'CREATE_CHANNEL_BINDING','COMMUNICATION_CHANNEL_BINDING',null,1,v_payload_hash);
 if not v_claim.is_new then
   select * into v_existing from public.communication_channel_bindings where organization_id=p_organization_id and id=v_claim.entity_id;
   if not found then raise exception 'Chatwoot bridge command claim has no binding row'; end if;
   perform set_config('smartvisions.chatwoot_bridge_command','0',true); return v_existing;
 end if;
 insert into public.communication_channel_bindings(id,organization_id,tenant_business_id,branch_id,integration_connection_id,channel,status,version,last_request_key,created_by_user_id,updated_by_user_id)
 values(v_claim.entity_id,p_organization_id,p_tenant_business_id,p_branch_id,p_integration_connection_id,v_channel,'ACTIVE',1,v_request_key,v_actor,v_actor)
 returning * into v_created;
 perform set_config('smartvisions.chatwoot_bridge_command','0',true); return v_created;
exception when others then perform set_config('smartvisions.chatwoot_bridge_command','0',true); raise;
end $$;

create table public.web_chat_widget_configs(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 tenant_business_id uuid not null,
 branch_id uuid not null,
 communication_channel_binding_id uuid not null,
 public_key text not null unique check(public_key ~ '^wc_[A-Za-z0-9_-]{24,80}$'),
 enabled boolean not null default false,
 allowed_origins text[] not null,
 consent_required boolean not null default true,
 session_ttl_minutes integer not null default 1440 check(session_ttl_minutes between 5 and 10080),
 max_message_chars integer not null default 4000 check(max_message_chars between 100 and 10000),
 config jsonb not null default '{}'::jsonb check(jsonb_typeof(config)='object'),
 version integer not null default 1 check(version>=1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,communication_channel_binding_id),
 foreign key(organization_id,tenant_business_id) references public.tenant_businesses(organization_id,id) on delete restrict,
 foreign key(organization_id,branch_id) references public.branches(organization_id,id) on delete restrict,
 foreign key(organization_id,communication_channel_binding_id) references public.communication_channel_bindings(organization_id,id) on delete restrict,
 check(cardinality(allowed_origins) between 1 and 20)
);

create table public.web_chat_sessions(
 id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 tenant_business_id uuid not null,
 branch_id uuid not null,
 communication_channel_binding_id uuid not null,
 widget_config_id uuid not null,
 crm_identity_id uuid not null,
 token_hash text not null check(token_hash ~ '^[0-9a-f]{64}$'),
 origin text not null check(length(origin) between 8 and 500),
 status text not null default 'ACTIVE' check(status in('ACTIVE','CLOSED','EXPIRED')),
 consent_accepted_at timestamptz,
 expires_at timestamptz not null,
 last_seen_at timestamptz not null default now(),
 conversation_id uuid references public.sales_conversations(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(token_hash),
 foreign key(organization_id,tenant_business_id) references public.tenant_businesses(organization_id,id) on delete restrict,
 foreign key(organization_id,branch_id) references public.branches(organization_id,id) on delete restrict,
 foreign key(organization_id,communication_channel_binding_id) references public.communication_channel_bindings(organization_id,id) on delete restrict,
 foreign key(organization_id,widget_config_id) references public.web_chat_widget_configs(organization_id,id) on delete restrict,
 foreign key(organization_id,crm_identity_id) references public.crm_identities(organization_id,id) on delete restrict
);

create table public.web_chat_events(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 session_id uuid not null,
 event_id text not null check(length(trim(event_id)) between 8 and 500),
 event_type text not null check(event_type in('SESSION_STARTED','MESSAGE','IDENTITY_LINKED','SESSION_CLOSED')),
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 created_at timestamptz not null default now(),
 unique(organization_id,event_id),
 foreign key(organization_id,session_id) references public.web_chat_sessions(organization_id,id) on delete cascade
);
create index web_chat_events_session_idx on public.web_chat_events(organization_id,session_id,created_at);
create index web_chat_sessions_expiry_idx on public.web_chat_sessions(organization_id,status,expires_at);

alter table public.web_chat_widget_configs enable row level security;
alter table public.web_chat_sessions enable row level security;
alter table public.web_chat_events enable row level security;

create policy web_chat_widget_configs_manager on public.web_chat_widget_configs for all to authenticated
using(public.chatwoot_bridge_can_manage(organization_id))
with check(public.chatwoot_bridge_can_manage(organization_id));
create policy web_chat_events_member_read on public.web_chat_events for select to authenticated using(public.is_org_member(organization_id));

revoke all on public.web_chat_widget_configs,public.web_chat_sessions,public.web_chat_events from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.web_chat_widget_configs to authenticated;
grant select,insert,update,delete on public.web_chat_widget_configs to service_role;
grant select,insert,update on public.web_chat_sessions to service_role;
grant select,insert on public.web_chat_events to service_role;
grant select on public.web_chat_events to authenticated;

create or replace function public.configure_web_chat_widget(
 p_organization_id uuid,p_binding_id uuid,p_expected_binding_version integer,p_public_key text,
 p_allowed_origins text[],p_consent_required boolean,p_session_ttl_minutes integer,p_max_message_chars integer,
 p_enabled boolean,p_config jsonb,p_request_key text
)
returns public.web_chat_widget_configs
language plpgsql security invoker set search_path=public,auth,pg_catalog
as $$
declare v_actor uuid:=auth.uid();b public.communication_channel_bindings%rowtype;w public.web_chat_widget_configs%rowtype;v_origin text;
begin
 if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then raise exception 'Web Chat configuration not permitted';end if;
 if p_public_key !~ '^wc_[A-Za-z0-9_-]{24,80}$' or cardinality(p_allowed_origins) not between 1 and 20
 or p_session_ttl_minutes not between 5 and 10080 or p_max_message_chars not between 100 and 10000
 or jsonb_typeof(coalesce(p_config,'{}'::jsonb))<>'object' or length(trim(coalesce(p_request_key,''))) not between 8 and 200
 then raise exception 'invalid Web Chat configuration';end if;
 foreach v_origin in array p_allowed_origins loop
   if v_origin !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' then raise exception 'Web Chat allowed origins must be exact HTTPS origins';end if;
 end loop;
 select * into b from public.communication_channel_bindings where organization_id=p_organization_id and id=p_binding_id for update;
 if not found or b.channel<>'WEB_CHAT' or b.status<>'ACTIVE' or b.branch_id is null or b.version<>p_expected_binding_version then raise exception 'eligible Web Chat binding required';end if;
 if not exists(select 1 from public.integration_connections ic where ic.organization_id=p_organization_id and ic.id=b.integration_connection_id and ic.provider='SMART_VISIONS' and ic.channel='WEB_CHAT' and ic.enabled=true and ic.status='CONNECTED') then raise exception 'built-in Web Chat integration unavailable';end if;
 insert into public.web_chat_widget_configs(organization_id,tenant_business_id,branch_id,communication_channel_binding_id,public_key,enabled,allowed_origins,consent_required,session_ttl_minutes,max_message_chars,config)
 values(p_organization_id,b.tenant_business_id,b.branch_id,b.id,p_public_key,p_enabled,p_allowed_origins,p_consent_required,p_session_ttl_minutes,p_max_message_chars,coalesce(p_config,'{}'::jsonb))
 on conflict(organization_id,communication_channel_binding_id) do update set public_key=excluded.public_key,enabled=excluded.enabled,allowed_origins=excluded.allowed_origins,consent_required=excluded.consent_required,session_ttl_minutes=excluded.session_ttl_minutes,max_message_chars=excluded.max_message_chars,config=excluded.config,version=public.web_chat_widget_configs.version+1,updated_at=now()
 returning * into w;
 perform set_config('smartvisions.chatwoot_bridge_command','1',true);
 update public.communication_channel_bindings set provider='SMART_VISIONS',provider_account_id=b.tenant_business_id::text,provider_destination_id=p_public_key,provider_destination_label='Web Chat',version=version+1,last_request_key=trim(p_request_key),updated_by_user_id=v_actor
 where organization_id=p_organization_id and id=p_binding_id and version=p_expected_binding_version;
 if not found then raise exception 'Web Chat binding configuration lost optimistic lock';end if;
 perform set_config('smartvisions.chatwoot_bridge_command','0',true);
 return w;
exception when others then
 perform set_config('smartvisions.chatwoot_bridge_command','0',true);
 raise;
end $;

create or replace function public.create_web_chat_session(
 p_widget_public_key text,p_session_id uuid,p_token_hash text,p_origin text,p_consent_accepted boolean
)
returns table(session_id uuid,organization_id uuid,tenant_business_id uuid,branch_id uuid,binding_id uuid,identity_id uuid,expires_at timestamptz,max_message_chars integer)
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare w public.web_chat_widget_configs%rowtype;b public.communication_channel_bindings%rowtype;v_identity uuid;v_exp timestamptz;v_origin text:=trim(coalesce(p_origin,''));
begin
 if p_session_id is null or p_token_hash !~ '^[0-9a-f]{64}$' or length(v_origin)>500 then raise exception 'invalid Web Chat session request';end if;
 select * into w from public.web_chat_widget_configs where public_key=trim(p_widget_public_key) and enabled=true;
 if not found then raise exception 'Web Chat widget unavailable';end if;
 if not (v_origin=any(w.allowed_origins)) then raise exception 'Web Chat origin not allowed';end if;
 if w.consent_required and not coalesce(p_consent_accepted,false) then raise exception 'Web Chat consent required';end if;
 if (select count(*) from public.web_chat_sessions s where s.widget_config_id=w.id and s.origin=v_origin and s.created_at>now()-interval '5 minutes')>=100 then raise exception 'Web Chat session rate limit';end if;
 select * into b from public.communication_channel_bindings where organization_id=w.organization_id and id=w.communication_channel_binding_id and tenant_business_id=w.tenant_business_id and branch_id=w.branch_id and channel='WEB_CHAT' and provider='SMART_VISIONS' and provider_destination_id=w.public_key and status='ACTIVE';
 if not found then raise exception 'Web Chat binding unavailable';end if;
 if not exists(select 1 from public.integration_connections ic where ic.organization_id=w.organization_id and ic.id=b.integration_connection_id and ic.provider='SMART_VISIONS' and ic.channel='WEB_CHAT' and ic.enabled=true and ic.status='CONNECTED') then raise exception 'Web Chat integration unavailable';end if;
 if not exists(select 1 from public.tenant_businesses tb where tb.organization_id=w.organization_id and tb.id=w.tenant_business_id and tb.status='ACTIVE') or not exists(select 1 from public.branches br where br.organization_id=w.organization_id and br.id=w.branch_id and br.tenant_business_id=w.tenant_business_id and br.status='ACTIVE') then raise exception 'Web Chat tenant scope unavailable';end if;
 if not exists(select 1 from public.chatwoot_inbox_mappings im where im.organization_id=w.organization_id and im.tenant_business_id=w.tenant_business_id and im.branch_id=w.branch_id and im.communication_channel_binding_id=w.communication_channel_binding_id and im.status='ACTIVE' and im.chatwoot_inbox_id is not null and im.chatwoot_channel_identifier is not null) then raise exception 'Web Chat Chatwoot inbox is not verified';end if;
 insert into public.crm_identities(organization_id,identity_type,normalized_value,status,metadata)
 values(w.organization_id,'WEBCHAT_SESSION',w.communication_channel_binding_id::text||':'||p_session_id::text,'ACTIVE',jsonb_build_object('source','WEB_CHAT_SESSION'))
 returning id into v_identity;
 v_exp:=now()+make_interval(mins=>w.session_ttl_minutes);
 insert into public.web_chat_sessions(id,organization_id,tenant_business_id,branch_id,communication_channel_binding_id,widget_config_id,crm_identity_id,token_hash,origin,consent_accepted_at,expires_at)
 values(p_session_id,w.organization_id,w.tenant_business_id,w.branch_id,w.communication_channel_binding_id,w.id,v_identity,p_token_hash,v_origin,case when p_consent_accepted then now() else null end,v_exp);
 insert into public.web_chat_events(organization_id,session_id,event_id,event_type,payload)
 values(w.organization_id,p_session_id,'session:'||p_session_id::text,'SESSION_STARTED',jsonb_build_object('origin',v_origin,'consentAccepted',coalesce(p_consent_accepted,false)));
 return query select p_session_id,w.organization_id,w.tenant_business_id,w.branch_id,w.communication_channel_binding_id,v_identity,v_exp,w.max_message_chars;
end $$;

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
 insert into public.web_chat_events(organization_id,session_id,event_id,event_type,payload)
 values(s.organization_id,s.id,'message:'||v_provider_id,'MESSAGE',jsonb_build_object('providerMessageId',v_provider_id,'text',v_text))
 on conflict(organization_id,event_id) do nothing returning true into v_inserted;
 update public.web_chat_sessions set last_seen_at=now() where id=s.id;
 return query select s.organization_id,s.tenant_business_id,s.branch_id,s.communication_channel_binding_id,s.crm_identity_id,v_provider_id,v_text,coalesce(v_inserted,false);
end $$;

create or replace function public.project_web_chat_inbound_message(
 p_organization_id uuid,p_session_id uuid,p_provider_message_id text,p_message_text text,
 p_chatwoot_conversation_display_id integer,p_chatwoot_conversation_uuid uuid,p_chatwoot_contact_id bigint,
 p_occurred_at timestamptz,p_request_key text
)
returns table(conversation_id uuid,message_id uuid,projection_id uuid,message_inserted boolean)
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare s public.web_chat_sessions%rowtype;v_conversation uuid;v_message uuid;v_projection uuid;v_mapping uuid;v_brand uuid;v_inserted boolean:=false;v_now timestamptz:=coalesce(p_occurred_at,now());v_existing_chatwoot integer;
begin
 if length(trim(coalesce(p_provider_message_id,''))) not between 10 and 500 or p_chatwoot_conversation_display_id is null or p_chatwoot_conversation_display_id<=0 or length(trim(coalesce(p_request_key,''))) not between 8 and 200 then raise exception 'invalid Web Chat projection request';end if;
 select * into s from public.web_chat_sessions where organization_id=p_organization_id and id=p_session_id for update;
 if not found or s.status<>'ACTIVE' or s.expires_at<=now() then raise exception 'active Web Chat session required';end if;
 if trim(p_provider_message_id) not like s.id::text||':%' then raise exception 'Web Chat provider message scope mismatch';end if;
 select tb.brand_id into v_brand from public.tenant_businesses tb where tb.organization_id=s.organization_id and tb.id=s.tenant_business_id and tb.status='ACTIVE';if v_brand is null then raise exception 'active tenant business required';end if;
 if not exists(select 1 from public.branches br where br.organization_id=s.organization_id and br.id=s.branch_id and br.tenant_business_id=s.tenant_business_id and br.status='ACTIVE') then raise exception 'active Web Chat branch required';end if;
 select im.id into v_mapping from public.chatwoot_inbox_mappings im where im.organization_id=s.organization_id and im.tenant_business_id=s.tenant_business_id and im.branch_id=s.branch_id and im.communication_channel_binding_id=s.communication_channel_binding_id and im.status='ACTIVE' and im.chatwoot_inbox_id is not null;
 if v_mapping is null then raise exception 'active Web Chat Chatwoot inbox mapping required';end if;
 v_conversation:=s.conversation_id;
 if v_conversation is not null then
   select p.id,p.chatwoot_conversation_display_id into v_projection,v_existing_chatwoot from public.unified_inbox_conversation_projections p where p.organization_id=s.organization_id and p.conversation_id=v_conversation and p.communication_channel_binding_id=s.communication_channel_binding_id and p.lifecycle_status in('ACTIVE','DEGRADED');
   if v_projection is null or v_existing_chatwoot<>p_chatwoot_conversation_display_id then raise exception 'Web Chat canonical projection mismatch';end if;
 else
   insert into public.sales_conversations(organization_id,lead_id,channel,stage,agent_mode,last_message_at,last_inbound_at,unread_count,awaiting_party,stage_reason)
   values(s.organization_id,null,'WEB_CHAT','ACTIVE','AUTO',v_now,v_now,0,'US','WEB_CHAT_INBOUND') returning id into v_conversation;
   perform set_config('smartvisions.unified_inbox_projection_command','1',true);
   insert into public.unified_inbox_conversation_projections(organization_id,conversation_id,brand_id,tenant_business_id,branch_id,communication_channel_binding_id,chatwoot_inbox_mapping_id,chatwoot_conversation_display_id,chatwoot_conversation_uuid,chatwoot_contact_id,chatwoot_status,last_activity_at,last_request_key,last_reconciled_at)
   values(s.organization_id,v_conversation,v_brand,s.tenant_business_id,s.branch_id,s.communication_channel_binding_id,v_mapping,p_chatwoot_conversation_display_id,p_chatwoot_conversation_uuid,p_chatwoot_contact_id,'open',v_now,p_request_key,now()) returning id into v_projection;
   update public.web_chat_sessions set conversation_id=v_conversation,last_seen_at=now() where organization_id=s.organization_id and id=s.id;
 end if;
 insert into public.conversation_messages(organization_id,conversation_id,lead_id,provider_message_id,channel,direction,media_type,original_text,status,metadata,created_at)
 values(s.organization_id,v_conversation,null,trim(p_provider_message_id),'WEB_CHAT','INBOUND','TEXT',p_message_text,'RECEIVED',jsonb_build_object('source','WEB_CHAT','web_chat_session_id',s.id,'canonical_identity_id',s.crm_identity_id,'binding_id',s.communication_channel_binding_id),v_now)
 on conflict(organization_id,channel,provider_message_id) where provider_message_id is not null do nothing returning id into v_message;
 v_inserted:=v_message is not null;
 if not v_inserted then select cm.id into v_message from public.conversation_messages cm where cm.organization_id=s.organization_id and cm.channel='WEB_CHAT' and cm.provider_message_id=trim(p_provider_message_id);else
   update public.sales_conversations set last_message_at=v_now,last_inbound_at=v_now,unread_count=unread_count+1,awaiting_party=case when agent_mode='AUTO' and not requires_human then 'US' else awaiting_party end,stage_reason='WEB_CHAT_INBOUND',updated_at=now() where organization_id=s.organization_id and id=v_conversation;
   perform set_config('smartvisions.unified_inbox_projection_command','1',true);
   update public.unified_inbox_conversation_projections set last_activity_at=v_now,last_request_key=p_request_key,last_reconciled_at=now(),version=version+1 where organization_id=s.organization_id and id=v_projection;
 end if;
 return query select v_conversation,v_message,v_projection,v_inserted;
end $$;

create or replace function public.link_web_chat_session_verified_business(
 p_organization_id uuid,p_session_id uuid,p_business_id uuid,p_verified_identity_id uuid,p_source_ref text
)
returns table(lead_id uuid,conversation_id uuid)
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare s public.web_chat_sessions%rowtype;v_lead uuid;
begin
 select * into s from public.web_chat_sessions where organization_id=p_organization_id and id=p_session_id for update;if not found then raise exception 'Web Chat session not found';end if;
 if not exists(select 1 from public.crm_identity_links l join public.crm_identities i on i.organization_id=l.organization_id and i.id=l.identity_id where l.organization_id=p_organization_id and l.business_id=p_business_id and l.identity_id=p_verified_identity_id and l.status='ACTIVE' and l.evidence_strength='VERIFIED' and i.status='ACTIVE' and i.identity_type in('EMAIL','PHONE','WHATSAPP','INSTAGRAM','INSTAGRAM_PROVIDER_USER','FACEBOOK_MESSENGER_PROVIDER_USER')) then raise exception 'verified canonical Business identity evidence required';end if;
 insert into public.crm_identity_links(organization_id,identity_id,business_id,source_type,source_ref,evidence_strength,status,evidence)
 values(p_organization_id,s.crm_identity_id,p_business_id,'WEB_CHAT_VERIFIED',left(coalesce(p_source_ref,''),512),'VERIFIED','ACTIVE',jsonb_build_object('verified_identity_id',p_verified_identity_id,'session_id',s.id))
 on conflict(organization_id,identity_id,business_id,source_type,source_ref) do update set evidence_strength='VERIFIED',status='ACTIVE',last_seen_at=now(),updated_at=now();
 insert into public.leads(organization_id,business_id,status,agent_mode) values(p_organization_id,p_business_id,'REPLIED','AUTO')
 on conflict(organization_id,business_id) where business_id is not null do update set updated_at=now() returning id into v_lead;
 if s.conversation_id is not null then
   update public.sales_conversations set lead_id=v_lead,updated_at=now() where organization_id=p_organization_id and id=s.conversation_id and (lead_id is null or lead_id=v_lead);
   if not found then raise exception 'Web Chat conversation already belongs to another Lead';end if;
   update public.conversation_messages set lead_id=v_lead where organization_id=p_organization_id and conversation_id=s.conversation_id and lead_id is null;
 end if;
 insert into public.web_chat_events(organization_id,session_id,event_id,event_type,payload)
 values(p_organization_id,s.id,'identity:'||s.id::text||':'||p_business_id::text,'IDENTITY_LINKED',jsonb_build_object('businessId',p_business_id,'verifiedIdentityId',p_verified_identity_id))
 on conflict(organization_id,event_id) do nothing;
 return query select v_lead,s.conversation_id;
end $$;

revoke all on function public.configure_web_chat_widget(uuid,uuid,integer,text,text[],boolean,integer,integer,boolean,jsonb,text) from public,anon,service_role;
grant execute on function public.configure_web_chat_widget(uuid,uuid,integer,text,text[],boolean,integer,integer,boolean,jsonb,text) to authenticated;
revoke all on function public.create_web_chat_session(text,uuid,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.create_web_chat_session(text,uuid,text,text,boolean) to service_role;
revoke all on function public.journal_web_chat_inbound_message(text,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.journal_web_chat_inbound_message(text,uuid,text,text,text,text) to service_role;
revoke all on function public.project_web_chat_inbound_message(uuid,uuid,text,text,integer,uuid,bigint,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.project_web_chat_inbound_message(uuid,uuid,text,text,integer,uuid,bigint,timestamptz,text) to service_role;
revoke all on function public.link_web_chat_session_verified_business(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.link_web_chat_session_verified_business(uuid,uuid,uuid,uuid,text) to service_role;
