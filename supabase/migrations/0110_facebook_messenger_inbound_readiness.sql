-- 0110: Facebook Messenger tenant binding + signed inbound journal readiness.
-- Internal readiness only. No provider credential, outbound execution, or adapter activation.

alter table public.communication_channel_bindings
  drop constraint if exists communication_channel_bindings_channel_check;
alter table public.communication_channel_bindings
  add constraint communication_channel_bindings_channel_check
  check (channel in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER'));

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
 if v_channel not in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER') then raise exception 'unsupported communication channel'; end if;
 select * into v_ic from public.integration_connections where id=p_integration_connection_id and organization_id=p_organization_id;
 if not found or v_ic.enabled<>true or v_ic.status<>'CONNECTED' or v_ic.channel<>v_channel then
   raise exception 'CONNECTED integration connection for exact channel required';
 end if;
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

create table public.facebook_messenger_events(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 provider_event_id text not null check(length(trim(provider_event_id)) between 1 and 300),
 provider_destination_id text not null check(length(trim(provider_destination_id)) between 1 and 200),
 event_type text not null check(event_type in ('MESSAGE','POSTBACK','REACTION','READ','DELIVERY')),
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(organization_id,provider_event_id,event_type)
);
create index facebook_messenger_events_destination_idx on public.facebook_messenger_events(organization_id,provider_destination_id,created_at desc);
alter table public.facebook_messenger_events enable row level security;
create policy facebook_messenger_events_org_member_read on public.facebook_messenger_events for select to authenticated using(public.is_org_member(organization_id));
revoke all on table public.facebook_messenger_events from public,anon,authenticated,service_role;
grant select on table public.facebook_messenger_events to authenticated;
grant select,insert on table public.facebook_messenger_events to service_role;

create or replace function public.resolve_meta_facebook_messenger_destination(p_destination_id text)
returns table(organization_id uuid,tenant_business_id uuid,branch_id uuid,binding_id uuid,integration_connection_id uuid,destination_id text,provider_account_id text)
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare v_destination text:=trim(coalesce(p_destination_id,'')); v_count integer;
begin
 if length(v_destination) not between 1 and 200 then raise exception 'invalid Meta Messenger destination'; end if;
 select count(*) into v_count from public.communication_channel_bindings b join public.integration_connections ic on ic.id=b.integration_connection_id and ic.organization_id=b.organization_id
 where b.status='ACTIVE' and b.channel='FACEBOOK_MESSENGER' and b.provider='META' and b.provider_destination_id=v_destination
 and ic.enabled=true and ic.status='CONNECTED' and ic.provider='META' and ic.channel='FACEBOOK_MESSENGER';
 if v_count=0 then raise exception 'Meta Messenger destination is not configured'; elsif v_count>1 then raise exception 'Meta Messenger destination is ambiguous'; end if;
 return query select b.organization_id,b.tenant_business_id,b.branch_id,b.id,b.integration_connection_id,b.provider_destination_id,b.provider_account_id
 from public.communication_channel_bindings b join public.integration_connections ic on ic.id=b.integration_connection_id and ic.organization_id=b.organization_id
 where b.status='ACTIVE' and b.channel='FACEBOOK_MESSENGER' and b.provider='META' and b.provider_destination_id=v_destination
 and ic.enabled=true and ic.status='CONNECTED' and ic.provider='META' and ic.channel='FACEBOOK_MESSENGER';
end $$;
revoke all on function public.resolve_meta_facebook_messenger_destination(text) from public,anon,authenticated,service_role;
grant execute on function public.resolve_meta_facebook_messenger_destination(text) to service_role;
