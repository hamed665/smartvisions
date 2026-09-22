\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-00000000a002'),
  ('00000000-0000-0000-0000-00000000a003'),
  ('00000000-0000-0000-0000-00000000a004');

insert into public.organizations(id, name) values
  ('00000000-0000-0000-0000-000000000a01', 'Org A'),
  ('00000000-0000-0000-0000-000000000b01', 'Org B');

insert into public.organization_members(organization_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-00000000a001', 'OWNER'),
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-00000000a002', 'VIEWER'),
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-00000000a003', 'OWNER'),
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-00000000a003', 'OWNER'),
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-00000000a004', 'VIEWER');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);

insert into public.brands(id, organization_id, name, slug) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000a01', 'Brand A', 'brand-a');

insert into public.tenant_businesses(id, organization_id, brand_id, name, slug) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000a01', '10000000-0000-0000-0000-000000000001', 'Business A', 'business-a');

insert into public.branches(id, organization_id, tenant_business_id, name, code) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000a01', '20000000-0000-0000-0000-000000000001', 'Branch A', 'A');

insert into public.departments(id, organization_id, branch_id, name, code) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000a01', '30000000-0000-0000-0000-000000000001', 'Department A', 'A');

insert into public.teams(id, organization_id, department_id, name, code) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000a01', '40000000-0000-0000-0000-000000000001', 'Team A', 'A');

insert into public.member_scope_assignments(
  organization_id, user_id, scope_type, role, team_id, attributes, assigned_by
) values (
  '00000000-0000-0000-0000-000000000a01',
  '00000000-0000-0000-0000-00000000a002',
  'TEAM',
  'SALES_AGENT',
  '50000000-0000-0000-0000-000000000001',
  '{"region":"OM","channel":"WHATSAPP"}'::jsonb,
  '00000000-0000-0000-0000-00000000a001'
);

insert into public.scope_configuration_overrides(
  organization_id, scope_type, team_id, namespace, config_key, config_value, updated_by
) values (
  '00000000-0000-0000-0000-000000000a01',
  'TEAM',
  '50000000-0000-0000-0000-000000000001',
  'sales',
  'tone',
  '"concise"'::jsonb,
  '00000000-0000-0000-0000-00000000a001'
);

do $$
begin
  if not exists (
    select 1 from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000a01'
      and entity_type = 'scope_configuration_overrides'
      and correlation_id like 'dbtx:%'
  ) then
    raise exception 'trigger-audited mutation did not receive DB transaction correlation';
  end if;
end;
$$;

insert into public.usage_events(id, organization_id, provider, operation, cost_usd, metadata)
values (
  '90000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000a01',
  'OPENAI',
  'CI_SMOKE',
  0.123456,
  '{"source":"ci"}'::jsonb
);

do $$
begin
  if not exists (
    select 1 from public.usage_events
    where id = '90000000-0000-0000-0000-000000000001'
      and usage_classification = 'INTERNAL'
  ) then
    raise exception 'usage classification did not fail closed to INTERNAL';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.usage_events(
      organization_id, provider, operation, cost_usd, usage_classification
    ) values (
      '00000000-0000-0000-0000-000000000a01',
      'OPENAI',
      'FORBIDDEN_DIRECT_CLASSIFICATION',
      0.01,
      'BILLABLE'
    );
    raise exception 'authenticated role unexpectedly set usage_classification';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

insert into public.brands(id, organization_id, name, slug) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000b01', 'Brand B', 'brand-b');

do $$
begin
  begin
    insert into public.tenant_businesses(
      organization_id, brand_id, name, slug
    ) values (
      '00000000-0000-0000-0000-000000000b01',
      '10000000-0000-0000-0000-000000000001',
      'Invalid Cross Tenant Business',
      'invalid-cross-tenant'
    );
    raise exception 'cross-tenant hierarchy foreign key unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);

do $$
begin
  if exists (
    select 1 from public.brands
    where organization_id = '00000000-0000-0000-0000-000000000b01'
  ) then
    raise exception 'RLS exposed Tenant B brand to Tenant A owner';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a004', false);

do $$
begin
  if exists (
    select 1
    from public.member_scope_assignments
    where user_id = '00000000-0000-0000-0000-00000000a002'
  ) then
    raise exception 'scoped IAM assignment leaked to another non-owner member';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', false);

do $$
begin
  if not exists (
    select 1
    from public.member_scope_assignments
    where user_id = '00000000-0000-0000-0000-00000000a002'
  ) then
    raise exception 'assigned user could not read their scoped IAM assignment';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a003', false);

do $$
begin
  begin
    update public.brands
       set organization_id = '00000000-0000-0000-0000-000000000b01'
     where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'tenant ownership unexpectedly moved between organizations';
  exception
    when others then
      if sqlerrm not like 'organization_id is immutable%' then
        raise;
      end if;
  end;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from public.brands
    where id = '10000000-0000-0000-0000-000000000001'
      and organization_id = '00000000-0000-0000-0000-000000000a01'
  ) then
    raise exception 'tenant ownership guard did not preserve original organization';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

insert into public.plans(id, code, name, status)
values ('60000000-0000-0000-0000-000000000001', 'CI_PLAN', 'CI Plan', 'DRAFT');

update public.plans
   set status = 'ACTIVE'
 where id = '60000000-0000-0000-0000-000000000001';

insert into public.pricing_versions(
  id, plan_id, version, status, currency, billing_period, recurring_amount, effective_from
) values
  ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 1, 'DRAFT', 'OMR', 'MONTHLY', 100, now()),
  ('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 1, 'DRAFT', 'USD', 'MONTHLY', 260, now());

update public.pricing_versions
   set status = 'ACTIVE'
 where id in (
   '70000000-0000-0000-0000-000000000001',
   '70000000-0000-0000-0000-000000000002'
 );

insert into public.pricing_versions(
  id, plan_id, version, status, currency, billing_period, recurring_amount, effective_from
) values (
  '70000000-0000-0000-0000-000000000003',
  '60000000-0000-0000-0000-000000000001',
  2,
  'DRAFT',
  'OMR',
  'MONTHLY',
  110,
  now()
);

do $$
begin
  begin
    update public.pricing_versions
       set status = 'ACTIVE'
     where id = '70000000-0000-0000-0000-000000000003';
    raise exception 'second ACTIVE pricing version in the same lane unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;
end;
$$;

do $$
begin
  begin
    update public.pricing_versions
       set effective_to = now() + interval '30 days'
     where id = '70000000-0000-0000-0000-000000000002';
    raise exception 'ACTIVE pricing effective_to unexpectedly mutated without retirement';
  exception
    when others then
      if sqlerrm not like 'published pricing version commercial fields are immutable%' then
        raise;
      end if;
  end;
end;
$$;

update public.pricing_versions
   set status = 'RETIRED',
       effective_to = now() + interval '30 days'
 where id = '70000000-0000-0000-0000-000000000001';

set role service_role;

insert into public.subscriptions(
  id, organization_id, pricing_version_id, status, provider, provider_subscription_id
) values (
  '80000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000a01',
  '70000000-0000-0000-0000-000000000002',
  'TRIAL',
  'CI',
  'ci-sub-1'
);

do $$
begin
  begin
    insert into public.subscriptions(
      organization_id, pricing_version_id, status, provider, provider_subscription_id
    ) values (
      '00000000-0000-0000-0000-000000000a01',
      '70000000-0000-0000-0000-000000000002',
      'TRIAL',
      'CI',
      'ci-sub-2'
    );
    raise exception 'second live subscription unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;
end;
$$;

update public.subscriptions
   set status = 'ACTIVE'
 where id = '80000000-0000-0000-0000-000000000001';

select *
from public.classify_usage_event(
  '00000000-0000-0000-0000-000000000a01',
  '90000000-0000-0000-0000-000000000001',
  'BILLABLE',
  'CI smoke reconciliation',
  null,
  'ci-causation',
  'ci-runtime'
);

do $$
begin
  if not exists (
    select 1
    from public.usage_events
    where id = '90000000-0000-0000-0000-000000000001'
      and usage_classification = 'BILLABLE'
  ) then
    raise exception 'trusted classification RPC did not update usage classification';
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where entity_type = 'usage_event'
      and entity_id = '90000000-0000-0000-0000-000000000001'
      and action = 'USAGE_CLASSIFICATION_CHANGED'
      and correlation_id like 'dbtx:%'
      and causation_id = 'ci-causation'
  ) then
    raise exception 'usage classification audit correlation/causation is missing';
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where organization_id = '00000000-0000-0000-0000-000000000a01'
      and entity_type = 'subscriptions'
      and entity_id = '80000000-0000-0000-0000-000000000001'
      and correlation_id like 'dbtx:%'
  ) then
    raise exception 'subscription mutation audit correlation is missing';
  end if;
end;
$$;

reset role;

do $$
begin
  if has_table_privilege('service_role', 'public.plans', 'INSERT')
     or has_table_privilege('service_role', 'public.pricing_versions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.subscriptions', 'INSERT')
  then
    raise exception 'runtime catalog/subscription grants are broader than the foundation contract';
  end if;

  if not has_column_privilege('service_role', 'public.usage_events', 'usage_classification', 'UPDATE') then
    raise exception 'service_role cannot classify usage through SECURITY INVOKER';
  end if;

  if has_column_privilege('authenticated', 'public.usage_events', 'usage_classification', 'INSERT') then
    raise exception 'authenticated role can directly set usage classification';
  end if;
end;
$$;
