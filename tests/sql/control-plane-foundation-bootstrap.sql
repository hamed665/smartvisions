\set ON_ERROR_STOP on

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'create role anon nologin';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create role authenticated nologin';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'create role service_role nologin bypassrls';
  else
    execute 'alter role service_role bypassrls';
  end if;
end;
$$;

create schema if not exists auth;

create table auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth, public to authenticated, service_role;
grant usage on schema extensions to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  country_code text not null,
  email text,
  phone text,
  international_phone text,
  whatsapp text,
  instagram text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  operation text not null,
  cost_usd numeric(12,6) not null default 0 check (cost_usd >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  units numeric(12,3) check (units is null or units >= 0),
  lead_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_type text not null,
  actor_id text,
  action text not null,
  entity_type text,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists(
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists(
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.role = 'OWNER'
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_owner(uuid) from public;
grant execute on function public.is_org_member(uuid), public.is_org_owner(uuid) to authenticated, service_role;

alter table public.organization_members enable row level security;
alter table public.businesses enable row level security;
create policy organization_members_self_read
  on public.organization_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy businesses_member_read
  on public.businesses
  for select
  to authenticated
  using (public.is_org_member(organization_id));

alter table public.usage_events enable row level security;
create policy usage_events_member_read
  on public.usage_events
  for select
  to authenticated
  using (public.is_org_member(organization_id));
create policy usage_events_owner_insert
  on public.usage_events
  for insert
  to authenticated
  with check (public.is_org_owner(organization_id));

alter table public.audit_logs enable row level security;
create policy org_member_audit
  on public.audit_logs
  for select
  using (public.is_org_member(organization_id));
create policy org_member_audit_insert
  on public.audit_logs
  for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and (actor_type <> 'USER' or actor_id = (select auth.uid())::text)
  );

grant select on public.organization_members to authenticated;
grant select on public.businesses to authenticated, service_role;
grant select, insert on public.usage_events to authenticated;
grant select, insert on public.usage_events to service_role;
grant update (cost_usd, input_tokens, output_tokens, units, metadata)
  on public.usage_events to service_role;
grant select, insert on public.audit_logs to authenticated;
grant select, insert, update, delete on public.audit_logs to service_role;
