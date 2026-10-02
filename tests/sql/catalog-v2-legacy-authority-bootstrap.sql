\set ON_ERROR_STOP on

-- CATALOG-V2 CI lineage bridge.
-- Production already carries the canonical legacy portfolio/media evidence
-- authority from the pre-Business-OS lineage. The compact PostgreSQL CI chain
-- starts later, so recreate only that existing table before migration 0170 is
-- evaluated. This file is test-only and does not introduce a second media store.

create table if not exists public.portfolio_items (
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

alter table public.portfolio_items enable row level security;

drop policy if exists catalog_ci_portfolio_member_read on public.portfolio_items;
create policy catalog_ci_portfolio_member_read
on public.portfolio_items for select to authenticated
using (public.is_org_member(organization_id));

grant select,insert,update,delete on public.portfolio_items
  to authenticated,service_role;

do $catalog_v2_legacy_authority_baseline$
begin
  if to_regclass('public.services') is null
     or to_regclass('public.service_prices') is null
     or to_regclass('public.portfolio_items') is null
  then
    raise exception 'CATALOG-V2 legacy authority baseline is incomplete';
  end if;
end;
$catalog_v2_legacy_authority_baseline$;
