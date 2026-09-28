\set ON_ERROR_STOP on

-- Disposable CI compatibility for legacy Hunter authorities that predate the
-- Business OS migration-chain bootstrap. Production already owns these tables
-- and columns. This file is test-only and never runs as a Production migration.

-- The disposable Business OS CI bootstrap predates the legacy Hunter enrichment
-- columns that are present in long-lived Production. Mirror only the canonical
-- read fields consumed by HUNTER-CUSTOMER-MODULE so CI exercises the same shape
-- without creating a second Business authority.
alter table public.businesses
  add column if not exists country_code text,
  add column if not exists city text,
  add column if not exists category text,
  add column if not exists google_place_id text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists dedupe_domain text,
  add column if not exists international_phone text;

create table if not exists public.discovery_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid,
  source_type text not null,
  source_id text not null,
  source_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now()
);

create table if not exists public.growth_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  business_id uuid not null,
  should_contact boolean not null default false,
  prospect_tier text,
  qualification_score integer,
  qualification_confidence integer,
  priority_score integer,
  recommended_acquisition_route text
);

grant select on public.discovery_records to authenticated,service_role;
grant select on public.growth_opportunities to authenticated,service_role;
