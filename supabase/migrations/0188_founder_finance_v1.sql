-- FOUNDER-FINANCE V1
-- Adds a narrow company-finance evidence snapshot plus explicitly-labeled
-- Founder scenario assumptions. This is not a second invoice/payment ledger.

create table if not exists public.company_financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  as_of_date date not null,
  currency text not null
    check (currency = upper(trim(currency)) and currency ~ '^[A-Z]{3}$'),
  cash_balance numeric not null check (cash_balance >= 0),
  monthly_net_burn numeric not null check (monthly_net_burn >= 0),
  monthly_payroll numeric not null default 0 check (monthly_payroll >= 0),
  monthly_sales_marketing_spend numeric not null default 0 check (monthly_sales_marketing_spend >= 0),
  monthly_other_opex numeric not null default 0 check (monthly_other_opex >= 0),
  accounts_receivable numeric not null default 0 check (accounts_receivable >= 0),
  accounts_payable numeric not null default 0 check (accounts_payable >= 0),
  source_type text not null
    check (source_type in ('MANUAL_CONFIRMED','IMPORT_VERIFIED')),
  source_ref text not null
    check (length(trim(source_ref)) between 1 and 512),
  evidence jsonb not null
    check (
      jsonb_typeof(evidence) = 'object'
      and evidence <> '{}'::jsonb
      and octet_length(evidence::text) <= 32768
    ),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id,id)
);

create index if not exists company_financial_snapshots_org_date_idx
  on public.company_financial_snapshots(organization_id,as_of_date desc,created_at desc);
create index if not exists company_financial_snapshots_created_by_idx
  on public.company_financial_snapshots(organization_id,created_by_user_id);

create table if not exists public.founder_finance_scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','ARCHIVED')),
  currency text not null
    check (currency = upper(trim(currency)) and currency ~ '^[A-Z]{3}$'),
  cash_balance_assumption numeric not null check (cash_balance_assumption >= 0),
  monthly_net_burn_assumption numeric not null check (monthly_net_burn_assumption >= 0),
  monthly_sales_marketing_spend_assumption numeric not null default 0
    check (monthly_sales_marketing_spend_assumption >= 0),
  new_customers_per_month_assumption numeric not null default 0
    check (new_customers_per_month_assumption >= 0),
  monthly_arpa_assumption numeric not null default 0
    check (monthly_arpa_assumption >= 0),
  gross_margin_bps_assumption integer not null default 0
    check (gross_margin_bps_assumption between 0 and 10000),
  monthly_churn_bps_assumption integer not null default 0
    check (monthly_churn_bps_assumption between 0 and 10000),
  notes text check (notes is null or length(notes) <= 2000),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id)
);

create index if not exists founder_finance_scenarios_org_status_idx
  on public.founder_finance_scenarios(organization_id,status,updated_at desc);
create index if not exists founder_finance_scenarios_created_by_idx
  on public.founder_finance_scenarios(organization_id,created_by_user_id);
create index if not exists founder_finance_scenarios_updated_by_idx
  on public.founder_finance_scenarios(organization_id,updated_by_user_id);

create or replace function public.guard_founder_finance_scenario_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $guard_founder_finance$
begin
  if new.organization_id is distinct from old.organization_id
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Founder finance scenario identity fields are immutable';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by_user_id := auth.uid();
  return new;
end;
$guard_founder_finance$;

drop trigger if exists founder_finance_scenarios_guard on public.founder_finance_scenarios;
create trigger founder_finance_scenarios_guard
before update on public.founder_finance_scenarios
for each row execute function public.guard_founder_finance_scenario_update();

create or replace function public.audit_founder_finance_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $audit_founder_finance$
declare
  v_row jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org uuid := nullif(v_row->>'organization_id','')::uuid;
  v_id text := v_row->>'id';
  v_action text;
  v_after jsonb;
  v_before jsonb;
begin
  v_action := case
    when tg_table_name='company_financial_snapshots' then 'COMPANY_FINANCIAL_SNAPSHOT_' || tg_op
    else 'FOUNDER_FINANCE_SCENARIO_' || tg_op
  end;

  if tg_table_name='company_financial_snapshots' then
    v_after := case when tg_op='INSERT' then jsonb_build_object(
      'as_of_date',new.as_of_date,
      'currency',new.currency,
      'cash_balance',new.cash_balance,
      'monthly_net_burn',new.monthly_net_burn,
      'source_type',new.source_type,
      'source_ref',new.source_ref
    ) else null end;
    v_before := null;
  else
    v_before := case when tg_op='UPDATE' then jsonb_build_object(
      'name',old.name,'status',old.status,'currency',old.currency,'version',old.version
    ) else null end;
    v_after := jsonb_build_object(
      'name',new.name,
      'status',new.status,
      'currency',new.currency,
      'version',new.version,
      'assumption_keys',jsonb_build_array(
        'cash_balance','monthly_net_burn','monthly_sales_marketing_spend',
        'new_customers_per_month','monthly_arpa','gross_margin_bps','monthly_churn_bps'
      )
    );
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data
  ) values (
    v_org,'USER',auth.uid()::text,v_action,tg_table_name,v_id,v_before,v_after
  );
  return case when tg_op='DELETE' then old else new end;
end;
$audit_founder_finance$;

drop trigger if exists company_financial_snapshots_audit on public.company_financial_snapshots;
create trigger company_financial_snapshots_audit
after insert on public.company_financial_snapshots
for each row execute function public.audit_founder_finance_mutation();

drop trigger if exists founder_finance_scenarios_audit on public.founder_finance_scenarios;
create trigger founder_finance_scenarios_audit
after insert or update on public.founder_finance_scenarios
for each row execute function public.audit_founder_finance_mutation();

alter table public.company_financial_snapshots enable row level security;
alter table public.founder_finance_scenarios enable row level security;

drop policy if exists company_financial_snapshots_owner_read on public.company_financial_snapshots;
create policy company_financial_snapshots_owner_read
on public.company_financial_snapshots for select to authenticated
using (public.is_org_owner(organization_id));

drop policy if exists company_financial_snapshots_owner_insert on public.company_financial_snapshots;
create policy company_financial_snapshots_owner_insert
on public.company_financial_snapshots for insert to authenticated
with check (
  public.is_org_owner(organization_id)
  and created_by_user_id = (select auth.uid())
);

drop policy if exists founder_finance_scenarios_owner_read on public.founder_finance_scenarios;
create policy founder_finance_scenarios_owner_read
on public.founder_finance_scenarios for select to authenticated
using (public.is_org_owner(organization_id));

drop policy if exists founder_finance_scenarios_owner_insert on public.founder_finance_scenarios;
create policy founder_finance_scenarios_owner_insert
on public.founder_finance_scenarios for insert to authenticated
with check (
  public.is_org_owner(organization_id)
  and created_by_user_id = (select auth.uid())
  and updated_by_user_id = (select auth.uid())
);

drop policy if exists founder_finance_scenarios_owner_update on public.founder_finance_scenarios;
create policy founder_finance_scenarios_owner_update
on public.founder_finance_scenarios for update to authenticated
using (public.is_org_owner(organization_id))
with check (
  public.is_org_owner(organization_id)
  and updated_by_user_id = (select auth.uid())
);

revoke all on public.company_financial_snapshots from public,anon,authenticated,service_role;
revoke all on public.founder_finance_scenarios from public,anon,authenticated,service_role;

grant select,insert on public.company_financial_snapshots to authenticated;
grant select,insert,update on public.founder_finance_scenarios to authenticated;
grant select on public.company_financial_snapshots to service_role;
grant select on public.founder_finance_scenarios to service_role;

revoke all on function public.guard_founder_finance_scenario_update() from public,anon,authenticated;
revoke all on function public.audit_founder_finance_mutation() from public,anon,authenticated;

comment on table public.company_financial_snapshots is
  'Immutable OWNER-confirmed company-level cash/burn/opex evidence. It does not replace invoice, subscription or payment ledger truth.';
comment on table public.founder_finance_scenarios is
  'OWNER-only Founder scenario assumptions for runway/CAC/LTV planning. Scenario values are assumptions, never observed accounting facts.';
