-- Minimal current integration_connections contract required by migration 0077
-- in the PostgreSQL 17 CI foundation database.

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  channel text not null,
  enabled boolean not null default false,
  status text not null default 'NOT_CONFIGURED'
    check (status in ('NOT_CONFIGURED','READY','CONNECTED','DEGRADED','ERROR','PAUSED')),
  account_label text,
  last_checked_at timestamptz,
  last_error text,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, channel)
);

alter table public.integration_connections enable row level security;

create policy integration_connections_member_read
  on public.integration_connections
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy integration_connections_owner_insert
  on public.integration_connections
  for insert to authenticated
  with check (public.is_org_owner(organization_id));

create policy integration_connections_owner_update
  on public.integration_connections
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

grant select, insert, update on public.integration_connections to authenticated;
grant select, insert, update on public.integration_connections to service_role;

-- Match the existing Production Supabase privilege contract used by
-- SECURITY INVOKER Chatwoot bridge triggers during service reconciliation.
grant select on public.organization_members to authenticated, service_role;
