\set ON_ERROR_STOP on

-- Test-only reconstruction of canonical legacy AI control-plane authorities
-- carried by long-lived Production from migrations 0001/0005/0016/0018/0053.
-- This file is never applied to Production.

create table if not exists public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_name text not null,
  version integer not null,
  prompt_text text not null,
  active boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, agent_name, version)
);

create unique index if not exists prompt_versions_one_active_uidx
  on public.prompt_versions(organization_id,agent_name)
  where active;

create table if not exists public.agent_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_name text not null,
  enabled boolean not null default true,
  model text,
  temperature numeric check (temperature is null or temperature between 0 and 2),
  max_tokens integer check (max_tokens is null or max_tokens > 0),
  confidence_threshold numeric not null default 0.65 check (confidence_threshold between 0 and 1),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (organization_id, agent_name)
);

alter table public.prompt_versions enable row level security;
alter table public.agent_settings enable row level security;

drop policy if exists org_member_prompts_read on public.prompt_versions;
create policy org_member_prompts_read on public.prompt_versions
  for select using (public.is_org_member(organization_id));
drop policy if exists org_owner_prompts_insert on public.prompt_versions;
create policy org_owner_prompts_insert on public.prompt_versions
  for insert with check (public.is_org_owner(organization_id));
drop policy if exists org_owner_prompts_update on public.prompt_versions;
create policy org_owner_prompts_update on public.prompt_versions
  for update using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));
drop policy if exists org_owner_prompts_delete on public.prompt_versions;
create policy org_owner_prompts_delete on public.prompt_versions
  for delete using (public.is_org_owner(organization_id));

drop policy if exists org_member_agent_settings_read on public.agent_settings;
create policy org_member_agent_settings_read on public.agent_settings
  for select using (public.is_org_member(organization_id));
drop policy if exists org_owner_agent_settings_insert on public.agent_settings;
create policy org_owner_agent_settings_insert on public.agent_settings
  for insert with check (public.is_org_owner(organization_id));
drop policy if exists org_owner_agent_settings_update on public.agent_settings;
create policy org_owner_agent_settings_update on public.agent_settings
  for update using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));
drop policy if exists org_owner_agent_settings_delete on public.agent_settings;
create policy org_owner_agent_settings_delete on public.agent_settings
  for delete using (public.is_org_owner(organization_id));

grant select,insert,update,delete on public.prompt_versions to authenticated;
grant select,insert,update,delete on public.agent_settings to authenticated;
grant select on public.prompt_versions to service_role;
grant select,update on public.agent_settings to service_role;
