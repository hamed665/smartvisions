create table if not exists public.cost_guard_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  monthly_total_budget_usd numeric(10,2) not null default 25 check (monthly_total_budget_usd >= 0),
  openai_budget_usd numeric(10,2) not null default 10 check (openai_budget_usd >= 0),
  google_places_budget_usd numeric(10,2) not null default 5 check (google_places_budget_usd >= 0),
  email_budget_usd numeric(10,2) not null default 4 check (email_budget_usd >= 0),
  whatsapp_budget_usd numeric(10,2) not null default 3 check (whatsapp_budget_usd >= 0),
  reserve_budget_usd numeric(10,2) not null default 3 check (reserve_budget_usd >= 0),
  daily_new_leads integer not null default 50 check (daily_new_leads >= 0),
  daily_website_audits integer not null default 15 check (daily_website_audits >= 0),
  daily_deep_ai_runs integer not null default 10 check (daily_deep_ai_runs >= 0),
  max_ai_runs_per_lead integer not null default 20 check (max_ai_runs_per_lead >= 0),
  max_voice_seconds integer not null default 180 check (max_voice_seconds >= 0),
  max_auto_retries integer not null default 1 check (max_auto_retries between 0 and 5),
  warning_pct integer not null default 70 check (warning_pct between 1 and 100),
  throttle_pct integer not null default 85 check (throttle_pct between 1 and 100),
  critical_pct integer not null default 95 check (critical_pct between 1 and 100),
  hard_stop_pct integer not null default 100 check (hard_stop_pct between 1 and 100),
  audit_cache_days integer not null default 30 check (audit_cache_days >= 0),
  model_routing_enabled boolean not null default true,
  low_cost_model text,
  high_reasoning_model text,
  updated_at timestamptz not null default now(),
  constraint cost_guard_threshold_order check (
    warning_pct < throttle_pct and throttle_pct < critical_pct and critical_pct <= hard_stop_pct
  )
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  operation text not null,
  cost_usd numeric(12,6) not null default 0 check (cost_usd >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  units numeric(12,3) check (units is null or units >= 0),
  lead_id uuid references public.leads(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_org_created_idx
  on public.usage_events(organization_id, created_at desc);
create index if not exists usage_events_org_provider_created_idx
  on public.usage_events(organization_id, provider, created_at desc);
create index if not exists usage_events_lead_idx
  on public.usage_events(lead_id) where lead_id is not null;

alter table public.cost_guard_settings enable row level security;
alter table public.usage_events enable row level security;

create policy cost_guard_member_read on public.cost_guard_settings
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy cost_guard_owner_insert on public.cost_guard_settings
  for insert to authenticated
  with check (public.is_org_owner(organization_id));
create policy cost_guard_owner_update on public.cost_guard_settings
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));
create policy cost_guard_owner_delete on public.cost_guard_settings
  for delete to authenticated
  using (public.is_org_owner(organization_id));

create policy usage_events_member_read on public.usage_events
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy usage_events_owner_insert on public.usage_events
  for insert to authenticated
  with check (public.is_org_owner(organization_id));

grant select, insert, update, delete on public.cost_guard_settings to authenticated;
grant select, insert on public.usage_events to authenticated;

insert into public.cost_guard_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;
