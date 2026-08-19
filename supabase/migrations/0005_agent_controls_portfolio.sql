create table public.agent_settings (
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

create table public.approval_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action_key text not null,
  requires_approval boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (organization_id, action_key)
);

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  service_id text,
  industry text,
  country_code text,
  approved boolean not null default false,
  public_url text,
  summary text,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_settings enable row level security;
alter table public.approval_rules enable row level security;
alter table public.portfolio_items enable row level security;

create policy org_member_agent_settings on public.agent_settings for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_approval_rules on public.approval_rules for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_portfolio_items on public.portfolio_items for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
