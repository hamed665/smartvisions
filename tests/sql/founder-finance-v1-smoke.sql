\set ON_ERROR_STOP on

begin;

insert into public.organizations(id,name) values
  ('00000000-0000-4000-8000-000000018801','Founder Finance CI')
on conflict (id) do nothing;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000018811'),
  ('00000000-0000-4000-8000-000000018812')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-4000-8000-000000018801','00000000-0000-4000-8000-000000018811','OWNER'),
  ('00000000-0000-4000-8000-000000018801','00000000-0000-4000-8000-000000018812','VIEWER')
on conflict (organization_id,user_id) do update set role=excluded.role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000018811',false);

insert into public.company_financial_snapshots(
  organization_id,as_of_date,currency,cash_balance,monthly_net_burn,
  monthly_payroll,monthly_sales_marketing_spend,monthly_other_opex,
  accounts_receivable,accounts_payable,source_type,source_ref,evidence,created_by_user_id
) values (
  '00000000-0000-4000-8000-000000018801','2026-10-03','OMR',12000,2000,
  2500,1000,500,1000,600,'MANUAL_CONFIRMED','ci-close',
  '{"confirmation":"OWNER_MANUAL_CONFIRMED"}'::jsonb,
  '00000000-0000-4000-8000-000000018811'
);

insert into public.founder_finance_scenarios(
  id,organization_id,name,currency,cash_balance_assumption,monthly_net_burn_assumption,
  monthly_sales_marketing_spend_assumption,new_customers_per_month_assumption,
  target_customer_count_assumption,monthly_arpa_assumption,gross_margin_bps_assumption,monthly_churn_bps_assumption,
  created_by_user_id,updated_by_user_id
) values (
  '00000000-0000-4000-8000-000000018821',
  '00000000-0000-4000-8000-000000018801','Base','OMR',12000,2000,1000,5,75,300,8000,500,
  '00000000-0000-4000-8000-000000018811','00000000-0000-4000-8000-000000018811'
);

update public.founder_finance_scenarios
set monthly_arpa_assumption=320
where id='00000000-0000-4000-8000-000000018821';

do $owner_checks$
begin
  if (select count(*) from public.company_financial_snapshots where organization_id='00000000-0000-4000-8000-000000018801') <> 1
  then raise exception 'OWNER snapshot insert missing'; end if;

  if (select version from public.founder_finance_scenarios where id='00000000-0000-4000-8000-000000018821') <> 2
  then raise exception 'Scenario optimistic version did not advance'; end if;

  if (select target_customer_count_assumption from public.founder_finance_scenarios where id='00000000-0000-4000-8000-000000018821') <> 75
  then raise exception 'Custom target-customer scenario assumption missing'; end if;

  if not exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-4000-8000-000000018801'
      and action='COMPANY_FINANCIAL_SNAPSHOT_INSERT'
  ) then raise exception 'Company finance audit missing'; end if;

  if not exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-4000-8000-000000018801'
      and action='FOUNDER_FINANCE_SCENARIO_UPDATE'
  ) then raise exception 'Finance scenario audit missing'; end if;
end;
$owner_checks$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000018812',false);

do $viewer_denied$
begin
  if exists (
    select 1 from public.company_financial_snapshots
    where organization_id='00000000-0000-4000-8000-000000018801'
  ) then raise exception 'VIEWER unexpectedly read company finance'; end if;

  begin
    insert into public.company_financial_snapshots(
      organization_id,as_of_date,currency,cash_balance,monthly_net_burn,
      source_type,source_ref,evidence,created_by_user_id
    ) values (
      '00000000-0000-4000-8000-000000018801','2026-10-04','OMR',1,1,
      'MANUAL_CONFIRMED','viewer','{"x":1}'::jsonb,
      '00000000-0000-4000-8000-000000018812'
    );
    raise exception 'VIEWER unexpectedly inserted finance';
  exception when others then
    if sqlerrm='VIEWER unexpectedly inserted finance' then raise; end if;
  end;
end;
$viewer_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $acl$
begin
  if has_table_privilege('anon','public.company_financial_snapshots','SELECT')
     or has_table_privilege('anon','public.founder_finance_scenarios','SELECT')
  then raise exception 'anon has finance access'; end if;

  if not has_table_privilege('service_role','public.company_financial_snapshots','SELECT')
     or has_table_privilege('service_role','public.company_financial_snapshots','INSERT')
  then raise exception 'service_role company finance ACL mismatch'; end if;
end;
$acl$;

rollback;
