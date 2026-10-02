\set ON_ERROR_STOP on

-- BRAIN-BUSINESS-TWIN CI lineage bridge.
-- Production already carries Organization settings, locale/market profiles and
-- versioned Knowledge from the pre-Business-OS lineage. The compact PG17 chain
-- intentionally starts at migration 0068, so reconstruct only those canonical
-- legacy authorities before migration 0180 is evaluated. Test-only: this does
-- not create an alternate settings, locale, market or Knowledge authority.

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  brand_name text not null default 'Smart Visions',
  operator_language text not null default 'fa',
  default_customer_language text not null default 'en',
  notification_email text,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.locale_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  country_code text not null,
  primary_locale text not null,
  fallback_locale text,
  dialect text,
  tone_profile text not null,
  dialect_intensity numeric not null default 0,
  max_first_touch_words integer not null default 80,
  max_reply_words integer not null default 120,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.market_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  country_code text not null,
  enabled boolean not null default true,
  currency text not null,
  timezone text not null,
  send_window_start time not null default '09:00',
  send_window_end time not null default '19:00',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  knowledge_key text not null,
  version integer not null,
  payload jsonb not null,
  active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists business_twin_ci_locale_org_idx
  on public.locale_profiles(organization_id,country_code);
create index if not exists business_twin_ci_market_org_idx
  on public.market_settings(organization_id,country_code);
create index if not exists business_twin_ci_knowledge_org_active_idx
  on public.knowledge_versions(organization_id,active,knowledge_key,version);

alter table public.organization_settings enable row level security;
alter table public.locale_profiles enable row level security;
alter table public.market_settings enable row level security;
alter table public.knowledge_versions enable row level security;

grant select,insert,update,delete on
  public.organization_settings,
  public.locale_profiles,
  public.market_settings,
  public.knowledge_versions
to authenticated,service_role;

do $business_twin_legacy_authority_baseline$
begin
  if to_regclass('public.organization_settings') is null
     or to_regclass('public.locale_profiles') is null
     or to_regclass('public.market_settings') is null
     or to_regclass('public.knowledge_versions') is null
  then
    raise exception 'Business Twin legacy canonical authority baseline is incomplete';
  end if;
end;
$business_twin_legacy_authority_baseline$;
