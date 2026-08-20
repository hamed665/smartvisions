create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  brand_name text not null default 'Smart Visions',
  operator_language text not null default 'fa',
  default_customer_language text not null default 'en',
  notification_email text,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('EMAIL','WHATSAPP','INSTAGRAM','OTHER')),
  purpose text not null default 'FIRST_TOUCH',
  country_code text,
  language text not null default 'en',
  subject text,
  body text not null,
  enabled boolean not null default true,
  is_default boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists message_templates_lookup_idx on public.message_templates(organization_id, channel, purpose, country_code, enabled);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trigger_key text not null,
  action_key text not null,
  enabled boolean not null default true,
  priority integer not null default 50 check (priority between 0 and 100),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automation_rules_active_idx on public.automation_rules(organization_id, enabled, priority desc);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  channel text not null,
  enabled boolean not null default false,
  status text not null default 'NOT_CONFIGURED' check (status in ('NOT_CONFIGURED','READY','DEGRADED','ERROR','PAUSED')),
  account_label text,
  last_checked_at timestamptz,
  last_error text,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(organization_id, provider, channel)
);

alter table public.organization_settings enable row level security;
alter table public.message_templates enable row level security;
alter table public.automation_rules enable row level security;
alter table public.integration_connections enable row level security;

create policy org_member_organization_settings on public.organization_settings for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_message_templates on public.message_templates for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_automation_rules on public.automation_rules for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_integration_connections on public.integration_connections for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

grant select, insert, update, delete on public.organization_settings to authenticated;
grant select, insert, update, delete on public.message_templates to authenticated;
grant select, insert, update, delete on public.automation_rules to authenticated;
grant select, insert, update, delete on public.integration_connections to authenticated;

insert into public.organization_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

insert into public.integration_connections (organization_id, provider, channel, status)
select o.id, v.provider, v.channel, 'NOT_CONFIGURED'
from public.organizations o
cross join (values
  ('META','WHATSAPP'),
  ('META','INSTAGRAM'),
  ('EMAIL_PROVIDER','EMAIL'),
  ('GOOGLE_PLACES','DISCOVERY'),
  ('OPENAI','AI'),
  ('CRAWL4AI','AUDIT'),
  ('REDIS','QUEUE')
) as v(provider, channel)
on conflict (organization_id, provider, channel) do nothing;
