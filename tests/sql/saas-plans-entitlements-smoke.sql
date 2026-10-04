\set ON_ERROR_STOP on

begin;

do $canonical_plan_catalog$
begin
  if (
    select count(*)
    from public.plans
    where code in ('STARTER','GROWTH','PRO','BUSINESS','AGENCY','ENTERPRISE')
      and status='DRAFT'
      and metadata->>'commercialActivation'='PENDING_SAAS_BILLING'
  ) <> 6 then
    raise exception 'Canonical SaaS plan identities are not present as billing-pending drafts';
  end if;

  if exists(
    select 1
    from public.pricing_versions pv
    join public.plans p on p.id=pv.plan_id
    where p.code in ('STARTER','GROWTH','PRO','BUSINESS','AGENCY','ENTERPRISE')
  ) then
    raise exception 'SAAS-PLANS-ENTITLEMENTS invented canonical commercial pricing';
  end if;
end;
$canonical_plan_catalog$;

insert into auth.users(id)
values ('00000000-0000-0000-0000-00000000d001')
on conflict(id) do nothing;

insert into public.organizations(id,name)
values
  ('00000000-0000-0000-0000-000000000d01','SaaS Entitlement Smoke'),
  ('00000000-0000-0000-0000-000000000d02','SaaS Entitlement Other Tenant')
on conflict(id) do nothing;

insert into public.organization_members(organization_id,user_id,role)
values (
  '00000000-0000-0000-0000-000000000d01',
  '00000000-0000-0000-0000-00000000d001',
  'OWNER'
)
on conflict do nothing;

insert into public.plans(id,code,name,status,metadata)
values (
  '60000000-0000-0000-0000-000000000d01',
  'SAAS_SMOKE',
  'SaaS Smoke',
  'DRAFT',
  '{"testOnly":true}'::jsonb
);

insert into public.pricing_versions(
  id,plan_id,version,status,currency,billing_period,recurring_amount,setup_fee_amount,effective_from
)
values (
  '70000000-0000-0000-0000-000000000d01',
  '60000000-0000-0000-0000-000000000d01',
  1,
  'DRAFT',
  'OMR',
  'MONTHLY',
  10,
  0,
  now()
);

insert into public.plan_entitlements(pricing_version_id,feature_key,entitlement_value)
values
  (
    '70000000-0000-0000-0000-000000000d01',
    'feature.automations',
    '{"kind":"BOOLEAN","enabled":true}'::jsonb
  ),
  (
    '70000000-0000-0000-0000-000000000d01',
    'SEATS.MAX',
    '{"kind":"LIMIT","limit":5,"unit":"SEATS"}'::jsonb
  ),
  (
    '70000000-0000-0000-0000-000000000d01',
    'CHANNELS.ALLOWED',
    '{"kind":"SET","values":["EMAIL","WHATSAPP"]}'::jsonb
  ),
  (
    '70000000-0000-0000-0000-000000000d01',
    'API.REQUESTS_PER_MONTH',
    '{"kind":"LIMIT","limit":10000,"unit":"REQUESTS"}'::jsonb
  ),
  (
    '70000000-0000-0000-0000-000000000d01',
    'STORAGE.BYTES',
    '{"kind":"LIMIT","limit":1073741824,"unit":"BYTES"}'::jsonb
  ),
  (
    '70000000-0000-0000-0000-000000000d01',
    'ADDON.WHITE_LABEL',
    '{"kind":"BOOLEAN","enabled":false}'::jsonb
  );

do $invalid_entitlement_rejected$
begin
  begin
    insert into public.plan_entitlements(pricing_version_id,feature_key,entitlement_value)
    values (
      '70000000-0000-0000-0000-000000000d01',
      'UNKNOWN.KEY',
      '{"kind":"BOOLEAN","enabled":true}'::jsonb
    );
    raise exception 'Invalid entitlement key unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like 'Invalid SaaS entitlement key/value contract%' then
        raise;
      end if;
  end;

  begin
    insert into public.plan_entitlements(pricing_version_id,feature_key,entitlement_value)
    values (
      '70000000-0000-0000-0000-000000000d01',
      'SEATS.BAD',
      '{"kind":"LIMIT","limit":-1,"unit":"SEATS"}'::jsonb
    );
    raise exception 'Negative entitlement limit unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like 'Invalid SaaS entitlement key/value contract%' then
        raise;
      end if;
  end;
end;
$invalid_entitlement_rejected$;

do $normalized_key$
begin
  if not exists(
    select 1
    from public.plan_entitlements
    where pricing_version_id='70000000-0000-0000-0000-000000000d01'
      and feature_key='FEATURE.AUTOMATIONS'
  ) then
    raise exception 'Entitlement feature key was not normalized to uppercase';
  end if;
end;
$normalized_key$;

update public.plans
set status='ACTIVE'
where id='60000000-0000-0000-0000-000000000d01';

update public.pricing_versions
set status='ACTIVE'
where id='70000000-0000-0000-0000-000000000d01';

set role service_role;

insert into public.subscriptions(
  id,organization_id,pricing_version_id,status,provider,provider_subscription_id
)
values (
  '80000000-0000-0000-0000-000000000d01',
  '00000000-0000-0000-0000-000000000d01',
  '70000000-0000-0000-0000-000000000d01',
  'TRIAL',
  'CI',
  'saas-entitlement-smoke'
);

insert into public.organization_entitlement_overrides(
  id,organization_id,feature_key,entitlement_value,source_type,reason,valid_from
)
values (
  '81000000-0000-0000-0000-000000000d01',
  '00000000-0000-0000-0000-000000000d01',
  'SEATS.MAX',
  '{"kind":"LIMIT","limit":8,"unit":"SEATS"}'::jsonb,
  'MANUAL',
  'CI override precedence',
  now()-interval '1 minute'
);

do $effective_entitlements$
declare
  v_count integer;
  v_seat_limit integer;
  v_seat_source text;
  v_channel_source text;
begin
  select count(*) into v_count
  from public.get_effective_saas_entitlements(
    '00000000-0000-0000-0000-000000000d01',
    now()
  );

  if v_count<>6 then
    raise exception 'Effective entitlement snapshot expected 6 keys, found %',v_count;
  end if;

  select (entitlement_value->>'limit')::integer,source_type
    into v_seat_limit,v_seat_source
  from public.get_effective_saas_entitlements(
    '00000000-0000-0000-0000-000000000d01',
    now()
  )
  where feature_key='SEATS.MAX';

  if v_seat_limit<>8 or v_seat_source<>'OVERRIDE:MANUAL' then
    raise exception 'Organization override did not win entitlement precedence';
  end if;

  select source_type into v_channel_source
  from public.get_effective_saas_entitlements(
    '00000000-0000-0000-0000-000000000d01',
    now()
  )
  where feature_key='CHANNELS.ALLOWED';

  if v_channel_source<>'PLAN' then
    raise exception 'Plan entitlement source was not preserved';
  end if;
end;
$effective_entitlements$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000d001',false);

do $tenant_read_boundary$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.get_effective_saas_entitlements(
    '00000000-0000-0000-0000-000000000d01',
    now()
  );
  if v_count<>6 then
    raise exception 'Authenticated Organization member could not read effective entitlements';
  end if;

  begin
    perform *
    from public.get_effective_saas_entitlements(
      '00000000-0000-0000-0000-000000000d02',
      now()
    );
    raise exception 'Cross-tenant entitlement read unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like 'Organization membership required%' then
        raise;
      end if;
  end;
end;
$tenant_read_boundary$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $function_privileges$
begin
  if has_function_privilege(
    'anon',
    'public.get_effective_saas_entitlements(uuid,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous role can execute SaaS entitlement resolver';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_effective_saas_entitlements(uuid,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated Organization member cannot execute SaaS entitlement resolver';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.validate_saas_entitlement_value(text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated browser can directly execute trusted entitlement validator';
  end if;
end;
$function_privileges$;

rollback;
