-- Smart Visions AI Business OS 2027
-- SECTION OMNICHANNEL / OMNI-META-SOCIAL
-- Durable Instagram provider-event evidence + exact tenant destination resolution.
-- Does not activate outbound messaging or store raw credentials.

create table public.instagram_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_event_id text not null check (length(trim(provider_event_id)) between 1 and 300),
  provider_destination_id text not null check (length(trim(provider_destination_id)) between 1 and 200),
  event_type text not null check (length(trim(event_type)) between 1 and 120),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, provider_event_id, event_type)
);

create index instagram_events_destination_idx
  on public.instagram_events(organization_id, provider_destination_id, created_at desc);

alter table public.instagram_events enable row level security;

create policy instagram_events_org_member_read
  on public.instagram_events for select
  using (public.is_org_member(organization_id));

revoke all on table public.instagram_events from public, anon, authenticated, service_role;
grant select on table public.instagram_events to authenticated;
grant select, insert on table public.instagram_events to service_role;

create or replace function public.resolve_meta_instagram_destination(
  p_destination_id text
)
returns table(
  organization_id uuid,
  tenant_business_id uuid,
  branch_id uuid,
  binding_id uuid,
  integration_connection_id uuid,
  destination_id text,
  provider_account_id text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_destination text := trim(coalesce(p_destination_id, ''));
  v_count integer;
begin
  if length(v_destination) not between 1 and 200 then
    raise exception 'invalid Meta Instagram destination';
  end if;

  select count(*)
    into v_count
    from public.communication_channel_bindings b
    join public.integration_connections ic
      on ic.id = b.integration_connection_id
     and ic.organization_id = b.organization_id
   where b.status = 'ACTIVE'
     and b.channel = 'INSTAGRAM'
     and b.provider = 'META'
     and b.provider_destination_id = v_destination
     and ic.enabled = true
     and ic.status = 'CONNECTED'
     and ic.provider = 'META'
     and ic.channel = 'INSTAGRAM';

  if v_count = 0 then
    raise exception 'Meta Instagram destination is not configured';
  elsif v_count > 1 then
    raise exception 'Meta Instagram destination is ambiguous';
  end if;

  return query
  select b.organization_id,
         b.tenant_business_id,
         b.branch_id,
         b.id,
         b.integration_connection_id,
         b.provider_destination_id,
         b.provider_account_id
    from public.communication_channel_bindings b
    join public.integration_connections ic
      on ic.id = b.integration_connection_id
     and ic.organization_id = b.organization_id
   where b.status = 'ACTIVE'
     and b.channel = 'INSTAGRAM'
     and b.provider = 'META'
     and b.provider_destination_id = v_destination
     and ic.enabled = true
     and ic.status = 'CONNECTED'
     and ic.provider = 'META'
     and ic.channel = 'INSTAGRAM';
end;
$$;

revoke all on function public.resolve_meta_instagram_destination(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_meta_instagram_destination(text)
  to service_role;
