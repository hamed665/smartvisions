create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  hunter_type text not null check (hunter_type in ('BUSINESS','INTENT')),
  country_code text,
  city text,
  industry text,
  target_count integer check (target_count is null or target_count > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','RUNNING','PAUSED','COMPLETED','FAILED')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.discovery_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  source_type text not null,
  source_id text,
  source_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  unique (organization_id, source_type, source_id)
);

create table public.website_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  source_url text not null,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  title text,
  detected_languages text[] not null default '{}',
  services text[] not null default '{}',
  contact_emails text[] not null default '{}',
  contact_phones text[] not null default '{}',
  social_links jsonb not null default '{}'::jsonb,
  has_arabic boolean,
  has_english boolean,
  has_booking boolean,
  has_whatsapp boolean,
  mobile_quality text check (mobile_quality is null or mobile_quality in ('GOOD','FAIR','POOR','UNKNOWN')),
  seo_quality text check (seo_quality is null or seo_quality in ('GOOD','FAIR','POOR','UNKNOWN')),
  cta_quality text check (cta_quality is null or cta_quality in ('GOOD','FAIR','POOR','UNKNOWN')),
  broken_links integer not null default 0 check (broken_links >= 0),
  evidence jsonb not null default '[]'::jsonb,
  error_message text,
  audited_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.intent_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  source_type text not null,
  source_id text,
  source_url text,
  title text,
  body text not null,
  language text,
  country_code text,
  service_hint text,
  budget_amount numeric,
  budget_currency text,
  posted_at timestamptz,
  detected_at timestamptz not null default now(),
  freshness_score integer not null default 0 check (freshness_score between 0 and 100),
  intent_score integer not null default 0 check (intent_score between 0 and 100),
  priority text not null default 'LOW' check (priority in ('URGENT','HIGH','MEDIUM','LOW','SKIP')),
  contactability text not null default 'UNKNOWN' check (contactability in ('ALLOWED','REVIEW','BLOCKED','UNKNOWN')),
  scoring_reasons jsonb not null default '[]'::jsonb,
  unique (organization_id, source_type, source_id)
);

alter table public.businesses add column if not exists phone text;
alter table public.businesses add column if not exists email text;
alter table public.businesses add column if not exists instagram text;
alter table public.businesses add column if not exists whatsapp text;
alter table public.businesses add column if not exists dedupe_domain text;

create unique index if not exists businesses_domain_unique
on public.businesses(organization_id, lower(dedupe_domain))
where dedupe_domain is not null;

create index campaigns_status_idx on public.campaigns(organization_id, status);
create index website_audits_business_idx on public.website_audits(organization_id, business_id, created_at desc);
create index intent_priority_idx on public.intent_opportunities(organization_id, priority, intent_score desc, detected_at desc);

alter table public.campaigns enable row level security;
alter table public.discovery_records enable row level security;
alter table public.website_audits enable row level security;
alter table public.intent_opportunities enable row level security;

create policy org_member_campaigns on public.campaigns for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy org_member_discovery on public.discovery_records for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy org_member_website_audits on public.website_audits for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy org_member_intent on public.intent_opportunities for all
using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));