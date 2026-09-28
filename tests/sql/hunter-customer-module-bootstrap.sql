\set ON_ERROR_STOP on

-- Disposable CI compatibility for legacy Hunter authorities that predate the
-- Business OS migration-chain bootstrap. Production already owns these tables.
-- This file is test-only and never runs as a Production migration.

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
