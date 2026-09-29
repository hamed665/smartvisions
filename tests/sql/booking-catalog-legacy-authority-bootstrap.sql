\set ON_ERROR_STOP on

-- BOOKING-CATALOG CI lineage bridge.
-- Production already carries canonical services/service_prices from the
-- pre-Business-OS lineage. The compact CI chain starts later, so reconstruct
-- only that existing authority before migration 0157 is evaluated.

create table if not exists public.services (
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id,id)
);

create table if not exists public.service_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id text not null,
  country_code text not null,
  currency text not null,
  price numeric not null check (price>=0),
  minimum_price numeric check (minimum_price is null or minimum_price>=0),
  max_auto_discount_pct numeric not null default 0 check (
    max_auto_discount_pct between 0 and 100
  ),
  max_discount_with_approval_pct numeric not null default 0 check (
    max_discount_with_approval_pct between 0 and 100
  ),
  premium_price numeric check (
    premium_price is null or (premium_price>=0 and premium_price>=price)
  ),
  foreign key (organization_id,service_id)
    references public.services(organization_id,id)
    on delete cascade,
  unique (organization_id,service_id,country_code)
);

alter table public.services enable row level security;
alter table public.service_prices enable row level security;

drop policy if exists booking_ci_services_member_read on public.services;
create policy booking_ci_services_member_read
on public.services for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists booking_ci_services_owner_insert on public.services;
create policy booking_ci_services_owner_insert
on public.services for insert to authenticated
with check (public.is_org_owner(organization_id));

drop policy if exists booking_ci_services_owner_update on public.services;
create policy booking_ci_services_owner_update
on public.services for update to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists booking_ci_services_owner_delete on public.services;
create policy booking_ci_services_owner_delete
on public.services for delete to authenticated
using (public.is_org_owner(organization_id));

drop policy if exists booking_ci_service_prices_member_read on public.service_prices;
create policy booking_ci_service_prices_member_read
on public.service_prices for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists booking_ci_service_prices_owner_insert on public.service_prices;
create policy booking_ci_service_prices_owner_insert
on public.service_prices for insert to authenticated
with check (public.is_org_owner(organization_id));

drop policy if exists booking_ci_service_prices_owner_update on public.service_prices;
create policy booking_ci_service_prices_owner_update
on public.service_prices for update to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists booking_ci_service_prices_owner_delete on public.service_prices;
create policy booking_ci_service_prices_owner_delete
on public.service_prices for delete to authenticated
using (public.is_org_owner(organization_id));

grant select,insert,update,delete on public.services,public.service_prices
  to authenticated,service_role;

do $booking_catalog_legacy_authority_baseline$
begin
  if to_regclass('public.services') is null
     or to_regclass('public.service_prices') is null
  then
    raise exception 'Canonical service catalog legacy authority baseline is incomplete';
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.services'::regclass
      and contype='p'
  ) then
    raise exception 'Canonical services primary key authority is missing';
  end if;
end;
$booking_catalog_legacy_authority_baseline$;
