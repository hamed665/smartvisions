-- 0109: Instagram evidence-backed activation gate.
-- Activation evidence is durable and immutable. It cannot fabricate provider acceptance.

create table public.instagram_activation_acceptance_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  branch_id uuid,
  communication_channel_binding_id uuid not null,
  provider_destination_id text not null,
  inbound_provider_event_id text not null,
  outbound_provider_message_id text not null,
  outbound_delivery_status text not null check (outbound_delivery_status in ('DELIVERED','READ')),
  observed_at timestamptz not null,
  request_key text not null check (length(trim(request_key)) between 8 and 200),
  created_at timestamptz not null default now(),
  unique (organization_id, request_key),
  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id,id) on delete restrict,
  foreign key (organization_id, communication_channel_binding_id)
    references public.communication_channel_bindings(organization_id,id) on delete restrict
);

alter table public.instagram_activation_acceptance_receipts enable row level security;
revoke all on table public.instagram_activation_acceptance_receipts from public,anon,authenticated,service_role;
grant select,insert on table public.instagram_activation_acceptance_receipts to service_role;

create or replace function public.instagram_activation_readiness(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid default null
)
returns table(ready boolean, blockers text[], binding_id uuid, destination_id text, inbox_mapping_id uuid)
language plpgsql
security definer
set search_path=public,vault,pg_catalog
as $$
declare
  v_blockers text[] := array[]::text[];
  v_binding public.communication_channel_bindings%rowtype;
  v_binding_count integer;
  v_inbox uuid;
  v_secret_exists boolean := false;
begin
  select count(*) into v_binding_count
  from public.communication_channel_bindings b
  where b.organization_id=p_organization_id and b.tenant_business_id=p_tenant_business_id
    and b.channel='INSTAGRAM' and b.status='ACTIVE'
    and ((p_branch_id is null and b.branch_id is null) or b.branch_id=p_branch_id);

  if v_binding_count <> 1 then
    v_blockers := array_append(v_blockers, case when v_binding_count=0 then 'ACTIVE_BINDING_MISSING' else 'ACTIVE_BINDING_AMBIGUOUS' end);
  else
    select * into v_binding from public.communication_channel_bindings b
    where b.organization_id=p_organization_id and b.tenant_business_id=p_tenant_business_id
      and b.channel='INSTAGRAM' and b.status='ACTIVE'
      and ((p_branch_id is null and b.branch_id is null) or b.branch_id=p_branch_id);

    if v_binding.provider <> 'META' or v_binding.provider_destination_id is null or v_binding.provider_secret_ref is null then
      v_blockers := array_append(v_blockers,'META_CREDENTIAL_BINDING_INCOMPLETE');
    else
      select exists(select 1 from vault.decrypted_secrets ds where ds.id=v_binding.provider_secret_ref and length(trim(ds.decrypted_secret))>=20)
      into v_secret_exists;
      if not v_secret_exists then v_blockers := array_append(v_blockers,'VAULT_SECRET_UNAVAILABLE'); end if;
    end if;

    if not exists (
      select 1 from public.integration_connections ic
      where ic.organization_id=p_organization_id and ic.id=v_binding.integration_connection_id
        and ic.provider='META' and ic.channel='INSTAGRAM' and ic.enabled=true and ic.status='CONNECTED'
    ) then v_blockers := array_append(v_blockers,'INTEGRATION_NOT_CONNECTED'); end if;

    select im.id into v_inbox from public.chatwoot_inbox_mappings im
    where im.organization_id=p_organization_id and im.tenant_business_id=p_tenant_business_id
      and im.communication_channel_binding_id=v_binding.id and im.status='ACTIVE'
      and im.chatwoot_inbox_id is not null and im.chatwoot_channel_identifier is not null
    order by im.last_verified_at desc nulls last limit 1;
    if v_inbox is null then v_blockers := array_append(v_blockers,'CHATWOOT_INBOX_NOT_VERIFIED'); end if;

    if not exists (
      select 1 from public.instagram_activation_acceptance_receipts ar
      where ar.organization_id=p_organization_id and ar.tenant_business_id=p_tenant_business_id
        and ar.communication_channel_binding_id=v_binding.id
        and ar.provider_destination_id=v_binding.provider_destination_id
    ) then v_blockers := array_append(v_blockers,'LIVE_ACCEPTANCE_EVIDENCE_MISSING'); end if;
  end if;

  if exists(select 1 from public.system_controls sc where sc.organization_id=p_organization_id and sc.global_kill_switch) then
    v_blockers := array_append(v_blockers,'GLOBAL_KILL_SWITCH');
  end if;

  return query select cardinality(v_blockers)=0,v_blockers,v_binding.id,v_binding.provider_destination_id,v_inbox;
end;
$$;

create or replace function public.record_instagram_activation_acceptance(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_binding_id uuid,
  p_inbound_provider_event_id text,
  p_outbound_provider_message_id text,
  p_request_key text
)
returns public.instagram_activation_acceptance_receipts
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_binding public.communication_channel_bindings%rowtype;
  v_inbound public.instagram_events%rowtype;
  v_outbound public.conversation_messages%rowtype;
  v_existing public.instagram_activation_acceptance_receipts%rowtype;
  v_created public.instagram_activation_acceptance_receipts%rowtype;
begin
  if length(trim(coalesce(p_request_key,''))) not between 8 and 200 then raise exception 'valid request key required'; end if;

  select * into v_existing from public.instagram_activation_acceptance_receipts
  where organization_id=p_organization_id and request_key=trim(p_request_key);
  if found then return v_existing; end if;

  select * into v_binding from public.communication_channel_bindings b
  where b.organization_id=p_organization_id and b.tenant_business_id=p_tenant_business_id
    and b.id=p_binding_id and b.channel='INSTAGRAM' and b.provider='META' and b.status='ACTIVE'
    and b.provider_destination_id is not null and b.provider_secret_ref is not null;
  if not found then raise exception 'eligible Instagram binding required'; end if;

  select * into v_inbound from public.instagram_events e
  where e.organization_id=p_organization_id and e.provider_event_id=trim(p_inbound_provider_event_id)
    and e.provider_destination_id=v_binding.provider_destination_id
    and e.event_type in ('MESSAGE','POSTBACK')
  order by e.created_at desc limit 1;
  if not found then raise exception 'real signed inbound Instagram evidence required'; end if;

  select * into v_outbound from public.conversation_messages cm
  where cm.organization_id=p_organization_id and cm.channel='INSTAGRAM' and cm.direction='OUTBOUND'
    and cm.provider_message_id=trim(p_outbound_provider_message_id)
    and cm.provider_delivery_status in ('DELIVERED','READ')
  order by cm.created_at desc limit 1;
  if not found then raise exception 'delivered/read Instagram outbound evidence required'; end if;

  if not exists (
    select 1 from public.unified_inbox_conversation_projections p
    where p.organization_id=p_organization_id and p.conversation_id=v_outbound.conversation_id
      and p.tenant_business_id=p_tenant_business_id and p.communication_channel_binding_id=p_binding_id
      and p.lifecycle_status in ('ACTIVE','DEGRADED')
  ) then raise exception 'outbound evidence is outside canonical tenant projection'; end if;

  insert into public.instagram_activation_acceptance_receipts(
    organization_id,tenant_business_id,branch_id,communication_channel_binding_id,
    provider_destination_id,inbound_provider_event_id,outbound_provider_message_id,
    outbound_delivery_status,observed_at,request_key
  ) values (
    p_organization_id,p_tenant_business_id,v_binding.branch_id,p_binding_id,
    v_binding.provider_destination_id,v_inbound.provider_event_id,v_outbound.provider_message_id,
    v_outbound.provider_delivery_status,now(),trim(p_request_key)
  ) returning * into v_created;
  return v_created;
end;
$$;

revoke all on function public.instagram_activation_readiness(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.instagram_activation_readiness(uuid,uuid,uuid) to service_role;
revoke all on function public.record_instagram_activation_acceptance(uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.record_instagram_activation_acceptance(uuid,uuid,uuid,text,text,text) to service_role;
