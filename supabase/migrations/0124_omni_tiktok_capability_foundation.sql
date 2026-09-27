-- 0124: OMNI-TIKTOK capability foundation.
-- Extends the canonical Smart Core channel model for TikTok Business Messaging.
-- This migration intentionally does NOT implement or activate provider webhook/send execution.
-- Production remains fail-closed: integration disabled + NOT_CONFIGURED and TikTok AI paused.
-- No fake tenant, provider credential, binding, event, message or acceptance evidence is created.

alter table public.communication_channel_bindings
  drop constraint if exists communication_channel_bindings_channel_check;
alter table public.communication_channel_bindings
  add constraint communication_channel_bindings_channel_check
  check (channel in (
    'EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT','TELEGRAM','TIKTOK'
  ));

alter table public.sales_conversations
  drop constraint if exists sales_conversations_channel_check;
alter table public.sales_conversations
  add constraint sales_conversations_channel_check
  check (channel in (
    'EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT','TELEGRAM','TIKTOK','WEB','OTHER'
  ));

alter table public.conversation_messages
  drop constraint if exists conversation_messages_channel_check;
alter table public.conversation_messages
  add constraint conversation_messages_channel_check
  check (channel in (
    'EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT','TELEGRAM','TIKTOK','WEB','OTHER'
  ));

alter table public.crm_identities
  drop constraint if exists crm_identities_identity_type_check;
alter table public.crm_identities
  add constraint crm_identities_identity_type_check
  check (identity_type in (
    'EMAIL','PHONE','WHATSAPP','INSTAGRAM','INSTAGRAM_PROVIDER_USER',
    'FACEBOOK_MESSENGER_PROVIDER_USER','WEBCHAT_SESSION','TELEGRAM_PROVIDER_USER',
    'TIKTOK_PROVIDER_USER'
  ));

alter table public.crm_identity_links
  drop constraint if exists crm_identity_links_source_type_check;
alter table public.crm_identity_links
  add constraint crm_identity_links_source_type_check
  check (source_type in (
    'BUSINESS_FIELD','EMAIL_INBOUND','WHATSAPP_INBOUND','INSTAGRAM_INBOUND',
    'FACEBOOK_MESSENGER_INBOUND','WEB_CHAT_VERIFIED','TELEGRAM_INBOUND',
    'TIKTOK_INBOUND','MANUAL','IMPORT'
  ));

alter table public.system_controls
  add column if not exists tiktok_ai_paused boolean not null default true;

insert into public.integration_connections(
  organization_id,provider,channel,enabled,status,account_label,config
)
select
  o.id,
  'TIKTOK',
  'TIKTOK',
  false,
  'NOT_CONFIGURED',
  'TikTok Business Messaging',
  jsonb_build_object(
    'business_messaging', true,
    'capability_gate_required', true,
    'provider_contract_status', 'FOUNDATION_ONLY'
  )
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
 if v_channel not in (
   'EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT','TELEGRAM','TIKTOK'
 ) then
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

comment on function public.create_communication_channel_binding(uuid,uuid,uuid,uuid,text,text)
is 'Governed canonical tenant channel binding command. TikTok remains unbindable until its exact integration connection is explicitly CONNECTED and enabled.';

comment on column public.system_controls.tiktok_ai_paused
is 'Fail-closed TikTok customer messaging AI control. Defaults true and is not changed by capability foundation.';
