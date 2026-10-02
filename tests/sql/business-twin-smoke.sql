\set ON_ERROR_STOP on

-- BRAIN-BUSINESS-TWIN controlled acceptance. All fixtures are transaction-scoped.

begin;

insert into public.organizations(id,name)
values ('00000000-0000-0000-0000-00000000d701','Business Twin CI')
on conflict (id) do nothing;

insert into auth.users(id)
values ('00000000-0000-0000-0000-00000000d711')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role)
values (
  '00000000-0000-0000-0000-00000000d701',
  '00000000-0000-0000-0000-00000000d711',
  'OWNER'
)
on conflict (organization_id,user_id) do update set role=excluded.role;

insert into public.organization_settings(
  organization_id,brand_name,operator_language,default_customer_language,config
) values (
  '00000000-0000-0000-0000-00000000d701',
  'Business Twin CI Brand','en','en','{}'::jsonb
)
on conflict (organization_id) do update set brand_name=excluded.brand_name;

insert into public.brands(id,organization_id,name,slug,status,metadata)
values (
  '00000000-0000-0000-0000-00000000d721',
  '00000000-0000-0000-0000-00000000d701',
  'Twin Brand','twin-ci','ACTIVE','{}'::jsonb
)
on conflict (id) do nothing;

insert into public.tenant_businesses(
  id,organization_id,brand_id,name,slug,country_code,timezone,status,metadata
) values (
  '00000000-0000-0000-0000-00000000d731',
  '00000000-0000-0000-0000-00000000d701',
  '00000000-0000-0000-0000-00000000d721',
  'Twin Business','twin-business','OM','Asia/Muscat','ACTIVE','{}'::jsonb
)
on conflict (id) do nothing;

insert into public.branches(
  id,organization_id,tenant_business_id,name,code,country_code,timezone,status,metadata
) values (
  '00000000-0000-0000-0000-00000000d741',
  '00000000-0000-0000-0000-00000000d701',
  '00000000-0000-0000-0000-00000000d731',
  'Twin Muscat','TWIN_MCT','OM','Asia/Muscat','ACTIVE','{}'::jsonb
)
on conflict (id) do nothing;

insert into public.services(id,organization_id,name,enabled,config,updated_at)
values (
  'brain_twin_ci_service',
  '00000000-0000-0000-0000-00000000d701',
  'BRAIN CI Service',true,'{}'::jsonb,now()
)
on conflict (organization_id,id) do update set name=excluded.name,enabled=true;

insert into public.service_prices(
  id,organization_id,service_id,country_code,currency,price,minimum_price,
  max_auto_discount_pct,max_discount_with_approval_pct,premium_price
) values (
  '00000000-0000-0000-0000-00000000d751',
  '00000000-0000-0000-0000-00000000d701',
  'brain_twin_ci_service','OM','OMR',25,20,5,10,30
)
on conflict (organization_id,service_id,country_code)
do update set price=excluded.price,minimum_price=excluded.minimum_price;

reset role;
set role service_role;

do $twin_direct_config_guard$
begin
  begin
    insert into public.scope_configuration_overrides(
      organization_id,scope_type,namespace,config_key,config_value,updated_by
    ) values (
      '00000000-0000-0000-0000-00000000d701','ORGANIZATION','business_twin',
      'BRAND_TONE','{"style":"forbidden-direct"}'::jsonb,
      '00000000-0000-0000-0000-00000000d711'
    );
    raise exception 'Direct Business Twin configuration unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Business Twin configuration requires governed command%' then raise; end if;
  end;
end;
$twin_direct_config_guard$;

do $twin_config_governance$
declare
  c public.scope_configuration_overrides%rowtype;
begin
  select * into c from public.set_business_twin_configuration_v1(
    '00000000-0000-0000-0000-00000000d701',
    '00000000-0000-0000-0000-00000000d711',
    'BRANCH',null,null,'00000000-0000-0000-0000-00000000d741',
    'BUSINESS_HOURS','{"timezone":"Asia/Muscat","weekly":{"SUN":["09:00-18:00"]}}'::jsonb,
    null,'business-twin-config-ci-1'
  );
  if c.version<>1 or c.namespace<>'business_twin' then
    raise exception 'Business Twin governed configuration was not created';
  end if;

  select * into c from public.set_business_twin_configuration_v1(
    '00000000-0000-0000-0000-00000000d701',
    '00000000-0000-0000-0000-00000000d711',
    'BRANCH',null,null,'00000000-0000-0000-0000-00000000d741',
    'BUSINESS_HOURS','{"timezone":"Asia/Muscat","weekly":{"SUN":["09:00-18:00"]}}'::jsonb,
    null,'business-twin-config-ci-1'
  );
  if c.version<>1 then raise exception 'Business Twin replay changed configuration version'; end if;

  begin
    perform public.set_business_twin_configuration_v1(
      '00000000-0000-0000-0000-00000000d701',
      '00000000-0000-0000-0000-00000000d711',
      'BRANCH',null,null,'00000000-0000-0000-0000-00000000d741',
      'BUSINESS_HOURS','{"timezone":"Asia/Muscat","weekly":{"SUN":["10:00-19:00"]}}'::jsonb,
      99,'business-twin-config-ci-stale'
    );
    raise exception 'Stale Business Twin configuration unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Business Twin configuration version changed%' then raise; end if;
  end;

  select * into c from public.set_business_twin_configuration_v1(
    '00000000-0000-0000-0000-00000000d701',
    '00000000-0000-0000-0000-00000000d711',
    'BRANCH',null,null,'00000000-0000-0000-0000-00000000d741',
    'BUSINESS_HOURS','{"timezone":"Asia/Muscat","weekly":{"SUN":["10:00-19:00"]}}'::jsonb,
    1,'business-twin-config-ci-2'
  );
  if c.version<>2 then raise exception 'Business Twin configuration version did not advance'; end if;
end;
$twin_config_governance$;

do $twin_compile_and_publish$
declare
  payload jsonb;
  v1 public.business_twin_versions%rowtype;
  v1_replay public.business_twin_versions%rowtype;
  v2 public.business_twin_versions%rowtype;
  c public.scope_configuration_overrides%rowtype;
begin
  payload:=public.compile_business_twin_v1('00000000-0000-0000-0000-00000000d701');
  if payload is null
     or (payload#>>'{sourceSummary,businessCount}')::int<>1
     or (payload#>>'{sourceSummary,branchCount}')::int<>1
     or (payload#>>'{sourceSummary,serviceCount}')::int<>1
     or payload::text not like '%BRAIN CI Service%'
     or payload::text not like '%BUSINESS_HOURS%'
  then raise exception 'Business Twin compiler missed canonical source evidence'; end if;

  begin
    insert into public.business_twin_versions(
      organization_id,version,source_hash,payload,published_by_user_id
    ) values (
      '00000000-0000-0000-0000-00000000d701',99,md5('direct'),
      '{"schemaVersion":1}'::jsonb,'00000000-0000-0000-0000-00000000d711'
    );
    raise exception 'Direct Business Twin version insert unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Business Twin version insert requires governed publish%' then raise; end if;
  end;

  select * into v1 from public.publish_business_twin_v1(
    '00000000-0000-0000-0000-00000000d701',
    '00000000-0000-0000-0000-00000000d711',
    'business-twin-publish-ci-1'
  );
  if v1.version<>1 then raise exception 'Business Twin first publish did not create v1'; end if;

  select * into v1_replay from public.publish_business_twin_v1(
    '00000000-0000-0000-0000-00000000d701',
    '00000000-0000-0000-0000-00000000d711',
    'business-twin-publish-ci-unchanged'
  );
  if v1_replay.id<>v1.id or v1_replay.version<>1 then
    raise exception 'Unchanged Business Twin truth manufactured another version';
  end if;

  select * into c
  from public.scope_configuration_overrides
  where organization_id='00000000-0000-0000-0000-00000000d701'
    and namespace='business_twin' and config_key='BUSINESS_HOURS'
  limit 1;

  perform public.set_business_twin_configuration_v1(
    '00000000-0000-0000-0000-00000000d701',
    '00000000-0000-0000-0000-00000000d711',
    'BRANCH',null,null,'00000000-0000-0000-0000-00000000d741',
    'BUSINESS_HOURS','{"timezone":"Asia/Muscat","weekly":{"SUN":["11:00-20:00"]}}'::jsonb,
    c.version,'business-twin-config-ci-3'
  );

  select * into v2 from public.publish_business_twin_v1(
    '00000000-0000-0000-0000-00000000d701',
    '00000000-0000-0000-0000-00000000d711',
    'business-twin-publish-ci-2'
  );
  if v2.version<>2 or v2.source_hash=v1.source_hash then
    raise exception 'Changed Business Twin truth did not create v2';
  end if;

end;
$twin_compile_and_publish$;

reset role;

do $twin_owner_immutable_guard$
declare
  v_id uuid;
begin
  select id into v_id
  from public.business_twin_versions
  where organization_id='00000000-0000-0000-0000-00000000d701'
  order by version
  limit 1;

  begin
    update public.business_twin_versions set payload='{"changed":true}'::jsonb where id=v_id;
    raise exception 'Business Twin immutable version update unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Business Twin versions are immutable%' then raise; end if;
  end;
end;
$twin_owner_immutable_guard$;

do $twin_acl$
begin
  if not has_function_privilege(
    'service_role',
    'public.publish_business_twin_v1(uuid,uuid,text)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'service_role cannot publish Business Twin'; end if;

  if has_table_privilege('service_role','public.business_twin_versions','UPDATE')
     or has_table_privilege('service_role','public.business_twin_versions','DELETE')
  then raise exception 'service_role unexpectedly has mutable Business Twin table privileges'; end if;

  if has_function_privilege(
    'authenticated',
    'public.publish_business_twin_v1(uuid,uuid,text)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.set_business_twin_configuration_v1(uuid,uuid,text,uuid,uuid,uuid,text,jsonb,integer,text)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'Business Twin trusted mutation leaked to authenticated'; end if;

  if not (select relrowsecurity from pg_class where oid='public.business_twin_versions'::regclass) then
    raise exception 'Business Twin versions RLS is not enabled';
  end if;

  if to_regclass('public.business_twin_services') is not null
     or to_regclass('public.business_twin_products') is not null
     or to_regclass('public.business_twin_payments') is not null
  then raise exception 'Business Twin created a parallel source-of-truth table';
  end if;
end;
$twin_acl$;

rollback;
