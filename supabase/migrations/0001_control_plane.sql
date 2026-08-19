create extension if not exists pgcrypto;

create type public.lead_status as enum ('NEW','AUDITED','QUALIFIED','READY_TO_CONTACT','CONTACTED','REPLIED','INTERESTED','HOT','HUMAN','WON','LOST','DO_NOT_CONTACT');
create type public.agent_mode as enum ('AUTO','PAUSED','HUMAN');

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

create table public.market_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  country_code text not null,
  enabled boolean not null default true,
  currency text not null,
  timezone text not null,
  send_window_start time not null default '09:00',
  send_window_end time not null default '19:00',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (organization_id, country_code)
);

create table public.services (
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create table public.service_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id text not null,
  country_code text not null,
  currency text not null,
  price numeric not null check (price >= 0),
  minimum_price numeric check (minimum_price is null or minimum_price >= 0),
  max_auto_discount_pct numeric not null default 0 check (max_auto_discount_pct between 0 and 100),
  max_discount_with_approval_pct numeric not null default 0 check (max_discount_with_approval_pct between 0 and 100),
  foreign key (organization_id, service_id) references public.services(organization_id, id) on delete cascade,
  unique (organization_id, service_id, country_code)
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  country_code text not null,
  city text,
  category text,
  google_place_id text,
  official_website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index businesses_place_unique on public.businesses(organization_id, google_place_id) where google_place_id is not null;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  status public.lead_status not null default 'NEW',
  opportunity_score integer not null default 0 check (opportunity_score between 0 and 100),
  intent_score integer not null default 0 check (intent_score between 0 and 100),
  agent_mode public.agent_mode not null default 'AUTO',
  recommended_offer text,
  score_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  field_name text not null,
  value jsonb,
  source_type text not null,
  source_url text,
  retrieved_at timestamptz not null default now(),
  verified_at timestamptz,
  confidence numeric check (confidence is null or confidence between 0 and 1)
);

create table public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text,
  phone text,
  domain text,
  reason text not null,
  source text,
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null or domain is not null)
);

create table public.system_controls (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  global_kill_switch boolean not null default false,
  email_paused boolean not null default false,
  whatsapp_ai_paused boolean not null default false,
  agents_paused boolean not null default false,
  shadow_mode boolean not null default true,
  monthly_budget_usd numeric,
  updated_at timestamptz not null default now()
);

create table public.prompt_versions (
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

create table public.knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  knowledge_key text not null,
  version integer not null,
  payload jsonb not null,
  active boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, knowledge_key, version)
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

create index leads_status_idx on public.leads(organization_id, status);
create index leads_scores_idx on public.leads(organization_id, opportunity_score, intent_score);
create index suppression_email_idx on public.suppression_list(organization_id, lower(email)) where email is not null;
create index audit_logs_created_idx on public.audit_logs(organization_id, created_at desc);

create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.organization_members m where m.organization_id = org_id and m.user_id = auth.uid()); $$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.market_settings enable row level security;
alter table public.services enable row level security;
alter table public.service_prices enable row level security;
alter table public.businesses enable row level security;
alter table public.leads enable row level security;
alter table public.lead_sources enable row level security;
alter table public.suppression_list enable row level security;
alter table public.system_controls enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.knowledge_versions enable row level security;
alter table public.audit_logs enable row level security;

create policy org_member_orgs on public.organizations for select using (public.is_org_member(id));
create policy org_member_members on public.organization_members for select using (public.is_org_member(organization_id));
create policy org_member_markets on public.market_settings for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_services on public.services for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_prices on public.service_prices for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_businesses on public.businesses for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_leads on public.leads for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_sources on public.lead_sources for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_suppression on public.suppression_list for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_controls on public.system_controls for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_prompts on public.prompt_versions for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_knowledge on public.knowledge_versions for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_audit on public.audit_logs for select using (public.is_org_member(organization_id));
