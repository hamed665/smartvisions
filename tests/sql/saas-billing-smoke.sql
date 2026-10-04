\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000e001'),
  ('00000000-0000-0000-0000-00000000e002'),
  ('00000000-0000-0000-0000-00000000e003')
on conflict(id) do nothing;

insert into public.organizations(id,name)
values ('00000000-0000-0000-0000-000000000e01','SAAS Billing Smoke')
on conflict(id) do nothing;

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-00000000e001','OWNER'),
  ('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-00000000e002','ADMIN'),
  ('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-00000000e003','SALES_AGENT')
on conflict do nothing;

insert into public.plans(id,code,name,status,metadata)
values (
  '60000000-0000-0000-0000-000000000e01',
  'SAAS_BILLING_SMOKE',
  'SaaS Billing Smoke',
  'DRAFT',
  '{"testOnly":true}'::jsonb
);

insert into public.pricing_versions(
  id,plan_id,version,status,currency,billing_period,
  recurring_amount,setup_fee_amount,ai_cost_multiplier,
  included_units,unit_prices,effective_from
) values (
  '70000000-0000-0000-0000-000000000e01',
  '60000000-0000-0000-0000-000000000e01',
  1,'DRAFT','OMR','MONTHLY',
  20,10,4,
  '{"SEATS":2,"FEATURE.ADVANCED":0,"API.REQUESTS":10,"AI.RAW_COST_USD":0.25,"THIRD_PARTY.RAW_COST_USD":0.5}'::jsonb,
  '{"SEATS":5,"FEATURE.ADVANCED":10,"API.REQUESTS":0.5}'::jsonb,
  now()-interval '40 days'
);

insert into public.plan_entitlements(pricing_version_id,feature_key,entitlement_value)
values (
  '70000000-0000-0000-0000-000000000e01',
  'FEATURE.ADVANCED',
  '{"kind":"BOOLEAN","enabled":true}'::jsonb
);

do $invalid_meter_map$
begin
  begin
    insert into public.pricing_versions(
      plan_id,version,status,currency,billing_period,recurring_amount,
      included_units,unit_prices
    ) values (
      '60000000-0000-0000-0000-000000000e01',
      2,'DRAFT','USD','MONTHLY',1,
      '{"seats":1}'::jsonb,
      '{}'::jsonb
    );
    raise exception 'lowercase billing meter key unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Invalid SAAS-BILLING included-unit/unit-price contract%' then
      raise;
    end if;
  end;
end;
$invalid_meter_map$;

update public.plans
set status='ACTIVE'
where id='60000000-0000-0000-0000-000000000e01';

update public.pricing_versions
set status='ACTIVE'
where id='70000000-0000-0000-0000-000000000e01';

set role service_role;

insert into public.subscriptions(
  id,organization_id,pricing_version_id,status,
  started_at,current_period_start,current_period_end,metadata
) values (
  '80000000-0000-0000-0000-000000000e01',
  '00000000-0000-0000-0000-000000000e01',
  '70000000-0000-0000-0000-000000000e01',
  'ACTIVE',
  now()-interval '32 days',
  now()-interval '31 days',
  now()-interval '1 day',
  '{"testOnly":true}'::jsonb
);

reset role;

insert into public.usage_events(
  id,organization_id,provider,operation,cost_usd,units,metadata,created_at
) values
  (
    '90000000-0000-0000-0000-000000000e01',
    '00000000-0000-0000-0000-000000000e01',
    'OPENAI','SAAS_BILLING_AI_SMOKE',1,1,'{}'::jsonb,now()-interval '2 days'
  ),
  (
    '90000000-0000-0000-0000-000000000e02',
    '00000000-0000-0000-0000-000000000e01',
    'GOOGLE_PLACES','SAAS_BILLING_THIRD_PARTY_SMOKE',2,1,'{}'::jsonb,now()-interval '2 days'
  ),
  (
    '90000000-0000-0000-0000-000000000e03',
    '00000000-0000-0000-0000-000000000e01',
    'EMAIL','SAAS_BILLING_API_SMOKE',0,15,
    '{"billingUnitKey":"API.REQUESTS"}'::jsonb,now()-interval '2 days'
  ),
  (
    '90000000-0000-0000-0000-000000000e04',
    '00000000-0000-0000-0000-000000000e01',
    'OPENAI','SAAS_BILLING_INTERNAL_EXCLUSION_SMOKE',100,1,
    '{}'::jsonb,now()-interval '2 days'
  );

set role service_role;

select *
from public.classify_usage_event(
  '00000000-0000-0000-0000-000000000e01',
  '90000000-0000-0000-0000-000000000e01',
  'BILLABLE',
  'SAAS billing AI smoke',
  'saas-billing-ai-classify',
  null,
  'saas-billing-smoke'
);

select *
from public.classify_usage_event(
  '00000000-0000-0000-0000-000000000e01',
  '90000000-0000-0000-0000-000000000e02',
  'BILLABLE',
  'SAAS billing third-party smoke',
  'saas-billing-third-party-classify',
  null,
  'saas-billing-smoke'
);

select *
from public.classify_usage_event(
  '00000000-0000-0000-0000-000000000e01',
  '90000000-0000-0000-0000-000000000e03',
  'BILLABLE',
  'SAAS billing API smoke',
  'saas-billing-api-classify',
  null,
  'saas-billing-smoke'
);

select public.put_saas_billing_profile_v1(
  '00000000-0000-0000-0000-000000000e01',
  'OMR',
  500,
  'CI VAT',
  'CI_TAX_EVIDENCE',
  0.4,
  'CI_COMMERCIAL_RATE',
  now()-interval '40 days',
  '00000000-0000-0000-0000-00000000e001',
  'saas-billing-profile-smoke'
);

select public.generate_saas_billing_statement_v1(
  '00000000-0000-0000-0000-000000000e01',
  '80000000-0000-0000-0000-000000000e01',
  '82000000-0000-0000-0000-000000000e01',
  'saas-billing-statement-smoke'
);

do $draft_totals$
declare
  s public.saas_billing_statements%rowtype;
  v_lines integer;
begin
  select * into s
  from public.saas_billing_statements
  where id='82000000-0000-0000-0000-000000000e01';

  if s.status<>'DRAFT'
     or s.setup_total<>10
     or s.platform_total<>20
     or s.feature_total<>10
     or s.seat_total<>5
     or s.overage_total<>2.5
     or s.ai_usage_total<>1.2
     or s.third_party_usage_total<>0.6
     or s.discount_total<>0
     or s.subtotal<>49.3
     or s.tax_total<>2.465
     or s.total<>51.765
  then
    raise exception 'SAAS-BILLING draft totals are incorrect: %',row_to_json(s);
  end if;

  select count(*) into v_lines
  from public.saas_billing_line_items
  where statement_id=s.id;

  if v_lines<>8 then
    raise exception 'SAAS-BILLING expected 8 draft lines, found %',v_lines;
  end if;
end;
$draft_totals$;

do $statement_idempotency$
declare
  v_id uuid;
begin
  v_id:=public.generate_saas_billing_statement_v1(
    '00000000-0000-0000-0000-000000000e01',
    '80000000-0000-0000-0000-000000000e01',
    '82000000-0000-0000-0000-000000000e01',
    'saas-billing-statement-smoke'
  );
  if v_id<>'82000000-0000-0000-0000-000000000e01' then
    raise exception 'SAAS-BILLING statement replay did not converge';
  end if;
end;
$statement_idempotency$;

select public.finalize_saas_billing_statement_v1(
  '00000000-0000-0000-0000-000000000e01',
  '82000000-0000-0000-0000-000000000e01',
  'saas-billing-finalize-smoke'
);

do $finalized_statement$
declare
  s public.saas_billing_statements%rowtype;
begin
  select * into s
  from public.saas_billing_statements
  where id='82000000-0000-0000-0000-000000000e01';

  if s.status<>'FINALIZED'
     or s.finalized_at is null
     or s.finalize_request_key<>'saas-billing-finalize-smoke'
     or s.total<>51.765
  then
    raise exception 'SAAS-BILLING finalization is incorrect: %',row_to_json(s);
  end if;

  if public.finalize_saas_billing_statement_v1(
    '00000000-0000-0000-0000-000000000e01',
    s.id,
    'saas-billing-finalize-smoke'
  )<>s.id then
    raise exception 'SAAS-BILLING finalize replay did not converge';
  end if;
end;
$finalized_statement$;

do $governed_mutation_guard$
begin
  begin
    update public.saas_billing_statements
    set total=1
    where id='82000000-0000-0000-0000-000000000e01';
    raise exception 'Direct finalized billing mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'SAAS-BILLING state requires governed service command%' then
      raise;
    end if;
  end;
end;
$governed_mutation_guard$;

reset role;
set role authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e001',false);
do $owner_billing_read$
begin
  if not exists(
    select 1 from public.saas_billing_statements
    where id='82000000-0000-0000-0000-000000000e01'
  ) then
    raise exception 'OWNER cannot read SAAS-BILLING statement';
  end if;
end;
$owner_billing_read$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e002',false);
do $admin_billing_read$
begin
  if not exists(
    select 1 from public.saas_billing_statements
    where id='82000000-0000-0000-0000-000000000e01'
  ) then
    raise exception 'ADMIN cannot read SAAS-BILLING statement';
  end if;
end;
$admin_billing_read$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e003',false);
do $sales_billing_denied$
begin
  if exists(
    select 1 from public.saas_billing_statements
    where id='82000000-0000-0000-0000-000000000e01'
  ) then
    raise exception 'SALES_AGENT can read SAAS-BILLING statement';
  end if;
end;
$sales_billing_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $billing_function_privileges$
begin
  if has_function_privilege(
    'authenticated',
    'public.generate_saas_billing_statement_v1(uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated browser can generate platform billing statement';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.finalize_saas_billing_statement_v1(uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated browser can finalize platform billing statement';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.put_saas_billing_profile_v1(uuid,text,integer,text,text,numeric,text,timestamptz,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated browser can mutate billing profile';
  end if;
end;
$billing_function_privileges$;

do $billing_audit_evidence$
begin
  if not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000e01'
      and action='SAAS_BILLING_STATEMENT_GENERATED'
      and entity_id='82000000-0000-0000-0000-000000000e01'
  ) or not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000e01'
      and action='SAAS_BILLING_STATEMENT_FINALIZED'
      and entity_id='82000000-0000-0000-0000-000000000e01'
  ) then
    raise exception 'SAAS-BILLING audit evidence is incomplete';
  end if;
end;
$billing_audit_evidence$;

rollback;
