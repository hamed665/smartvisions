\set ON_ERROR_STOP on

begin;

do $catalog_contract$
declare
  r record;
  readiness jsonb;
begin
  if (select count(*) from public.industry_packs where status='ACTIVE')<>9 then
    raise exception 'Industry Pack catalog must contain 9 active built-in packs';
  end if;
  if (select count(*) from public.industry_pack_versions where version=1)<>9 then
    raise exception 'Industry Pack V1 manifest count is wrong';
  end if;

  for r in select pack_key,version from public.industry_pack_versions order by pack_key
  loop
    readiness:=public.get_industry_pack_readiness_v1(r.pack_key,r.version);
    if readiness is null or coalesce((readiness->>'runtimeReady')::boolean,false)=false then
      raise exception 'Industry Pack % v% is not canonical-runtime ready: %',r.pack_key,r.version,readiness;
    end if;
  end loop;

  if jsonb_array_length(
    public.get_industry_pack_readiness_v1('pet_clinic',1)->'pendingCustomObjects'
  )<1 then
    raise exception 'Future custom-object dependency was not surfaced';
  end if;

  begin
    update public.industry_packs set name='Forbidden runtime edit' where pack_key='pet_clinic';
    raise exception 'Industry Pack catalog unexpectedly allowed runtime mutation';
  exception when others then
    if sqlerrm not like 'Industry Pack catalog/versions are migration-versioned and immutable at runtime%' then raise; end if;
  end;
end;
$catalog_contract$;

insert into public.organizations(id,name)
values ('00000000-0000-0000-0000-00000000e701','Industry Pack CI')
on conflict (id) do nothing;

insert into auth.users(id)
values ('00000000-0000-0000-0000-00000000e711')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role)
values (
  '00000000-0000-0000-0000-00000000e701',
  '00000000-0000-0000-0000-00000000e711',
  'OWNER'
)
on conflict (organization_id,user_id) do update set role=excluded.role;

insert into public.organization_settings(
  organization_id,brand_name,operator_language,default_customer_language,config
) values (
  '00000000-0000-0000-0000-00000000e701',
  'Industry Pack CI','en','en','{}'::jsonb
)
on conflict (organization_id) do update set brand_name=excluded.brand_name;

insert into public.brands(id,organization_id,name,slug,status,metadata)
values (
  '00000000-0000-0000-0000-00000000e721',
  '00000000-0000-0000-0000-00000000e701',
  'Industry CI Brand','industry-ci','ACTIVE','{}'::jsonb
)
on conflict (id) do nothing;

insert into public.tenant_businesses(
  id,organization_id,brand_id,name,slug,country_code,timezone,status,metadata
) values (
  '00000000-0000-0000-0000-00000000e731',
  '00000000-0000-0000-0000-00000000e701',
  '00000000-0000-0000-0000-00000000e721',
  'Industry CI Business','industry-ci-business','OM','Asia/Muscat','ACTIVE','{}'::jsonb
)
on conflict (id) do nothing;

reset role;
set role service_role;

do $direct_activation_guard$
begin
  begin
    insert into public.industry_pack_activations(
      organization_id,tenant_business_id,pack_key,pack_version,active,version,
      activated_by_user_id,last_request_key
    ) values (
      '00000000-0000-0000-0000-00000000e701',
      '00000000-0000-0000-0000-00000000e731',
      'pet_clinic',1,true,1,
      '00000000-0000-0000-0000-00000000e711','direct-pack-ci'
    );
    raise exception 'Direct Industry Pack activation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Industry Pack activation requires governed command%' then raise; end if;
  end;
end;
$direct_activation_guard$;

do $activation_contract$
declare
  a public.industry_pack_activations%rowtype;
  replayed public.industry_pack_activations%rowtype;
  changed public.industry_pack_activations%rowtype;
  ctx jsonb;
  twin jsonb;
  published public.business_twin_versions%rowtype;
begin
  select * into a from public.activate_industry_pack_v1(
    '00000000-0000-0000-0000-00000000e701',
    '00000000-0000-0000-0000-00000000e711',
    '00000000-0000-0000-0000-00000000e731',
    'pet_clinic',1,null,'industry-pack-ci-activate-1'
  );
  if a.version<>1 or not a.active or a.pack_key<>'pet_clinic' then
    raise exception 'Industry Pack first activation contract failed';
  end if;

  select * into replayed from public.activate_industry_pack_v1(
    '00000000-0000-0000-0000-00000000e701',
    '00000000-0000-0000-0000-00000000e711',
    '00000000-0000-0000-0000-00000000e731',
    'pet_clinic',1,null,'industry-pack-ci-activate-1'
  );
  if replayed.version<>1 or replayed.pack_key<>'pet_clinic' then
    raise exception 'Industry Pack replay changed activation';
  end if;

  begin
    perform public.activate_industry_pack_v1(
      '00000000-0000-0000-0000-00000000e701',
      '00000000-0000-0000-0000-00000000e711',
      '00000000-0000-0000-0000-00000000e731',
      'automotive',1,99,'industry-pack-ci-stale'
    );
    raise exception 'Stale Industry Pack activation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Industry Pack activation version changed%' then raise; end if;
  end;

  select * into changed from public.activate_industry_pack_v1(
    '00000000-0000-0000-0000-00000000e701',
    '00000000-0000-0000-0000-00000000e711',
    '00000000-0000-0000-0000-00000000e731',
    'automotive',1,1,'industry-pack-ci-activate-2'
  );
  if changed.version<>2 or changed.pack_key<>'automotive' then
    raise exception 'Industry Pack governed change did not advance version';
  end if;

  ctx:=public.resolve_industry_pack_context_v1(
    '00000000-0000-0000-0000-00000000e701',
    '00000000-0000-0000-0000-00000000e731'
  );
  if ctx->>'packKey'<>'automotive'
     or ctx->>'businessId'<>'00000000-0000-0000-0000-00000000e731'
     or jsonb_typeof(ctx->'manifest')<>'object'
  then raise exception 'Industry Pack context resolution failed'; end if;

  if exists(select 1 from public.crm_custom_field_definitions where organization_id='00000000-0000-0000-0000-00000000e701')
     or exists(select 1 from public.crm_pipelines where organization_id='00000000-0000-0000-0000-00000000e701')
     or exists(select 1 from public.automation_rules where organization_id='00000000-0000-0000-0000-00000000e701')
  then raise exception 'Industry Pack activation created parallel/implicit operational configuration'; end if;

  twin:=public.compile_business_twin_v2('00000000-0000-0000-0000-00000000e701');
  if twin#>>'{schemaVersion}'<>'2'
     or jsonb_array_length(twin->'industryPackReferences')<>1
     or twin#>>'{industryPackReferences,0,packKey}'<>'automotive'
  then raise exception 'Business Twin V2 did not carry Industry Pack reference'; end if;

  select * into published from public.publish_business_twin_v2(
    '00000000-0000-0000-0000-00000000e701',
    '00000000-0000-0000-0000-00000000e711',
    'industry-pack-ci-twin-publish'
  );
  if published.version<>1 or published.payload#>>'{schemaVersion}'<>'2' then
    raise exception 'Business Twin V2 publish failed with Pack reference';
  end if;

  select * into changed from public.deactivate_industry_pack_v1(
    '00000000-0000-0000-0000-00000000e701',
    '00000000-0000-0000-0000-00000000e711',
    '00000000-0000-0000-0000-00000000e731',
    2,'industry-pack-ci-deactivate'
  );
  if changed.version<>3 or changed.active then
    raise exception 'Industry Pack deactivation contract failed';
  end if;

  if public.resolve_industry_pack_context_v1(
    '00000000-0000-0000-0000-00000000e701',
    '00000000-0000-0000-0000-00000000e731'
  ) is not null then
    raise exception 'Deactivated Industry Pack still resolved';
  end if;
end;
$activation_contract$;

reset role;

do $acl_contract$
begin
  if not has_function_privilege(
    'service_role',
    'public.activate_industry_pack_v1(uuid,uuid,uuid,text,integer,integer,text)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'service_role cannot activate Industry Pack'; end if;

  if has_function_privilege(
    'authenticated',
    'public.activate_industry_pack_v1(uuid,uuid,uuid,text,integer,integer,text)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'Industry Pack trusted activation leaked to authenticated'; end if;

  if not has_function_privilege(
    'authenticated',
    'public.resolve_industry_pack_context_v1(uuid,uuid)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'Authenticated Industry Pack context read is unavailable'; end if;

  if not (select relrowsecurity from pg_class where oid='public.industry_pack_activations'::regclass)
     or not (select relrowsecurity from pg_class where oid='public.industry_pack_versions'::regclass)
  then raise exception 'Industry Pack RLS is not enabled'; end if;
end;
$acl_contract$;

rollback;
