\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000e301'),
  ('00000000-0000-0000-0000-00000000e302'),
  ('00000000-0000-0000-0000-00000000e303'),
  ('00000000-0000-0000-0000-00000000e304'),
  ('00000000-0000-0000-0000-00000000e305');

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-00000000f301','Private authority migration org A'),
  ('00000000-0000-0000-0000-00000000f302','Private authority migration org B');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000f301','00000000-0000-0000-0000-00000000e301','OWNER'),
  ('00000000-0000-0000-0000-00000000f301','00000000-0000-0000-0000-00000000e302','ADMIN'),
  ('00000000-0000-0000-0000-00000000f301','00000000-0000-0000-0000-00000000e303','VIEWER'),
  ('00000000-0000-0000-0000-00000000f302','00000000-0000-0000-0000-00000000e304','OWNER'),
  ('00000000-0000-0000-0000-00000000f301','00000000-0000-0000-0000-00000000e305','OWNER');

insert into public.brands(id,organization_id,name,slug) values
  ('10000000-0000-0000-0000-00000000f301','00000000-0000-0000-0000-00000000f301','Private Authority Migration Brand A','private-authority-migration-a'),
  ('10000000-0000-0000-0000-00000000f302','00000000-0000-0000-0000-00000000f302','Private Authority Migration Brand B','private-authority-migration-b');

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values
  ('20000000-0000-0000-0000-00000000f301','00000000-0000-0000-0000-00000000f301','10000000-0000-0000-0000-00000000f301','Private Authority Migration Business A','private-authority-migration-a'),
  ('20000000-0000-0000-0000-00000000f302','00000000-0000-0000-0000-00000000f302','10000000-0000-0000-0000-00000000f302','Private Authority Migration Business B','private-authority-migration-b');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e301',false);

-- Self-read RLS remains unchanged while the narrow private helper resolves target authority.
do $baseline_role$
begin
  if exists (
    select 1
    from public.organization_members
    where organization_id='00000000-0000-0000-0000-00000000f301'
      and user_id='00000000-0000-0000-0000-00000000e302'
  ) then
    raise exception 'organization_members target-row RLS unexpectedly widened';
  end if;

  if private.chatwoot_business_wide_role(
    '00000000-0000-0000-0000-00000000f301',
    '20000000-0000-0000-0000-00000000f301',
    '00000000-0000-0000-0000-00000000e302'
  ) <> 'ADMIN' then
    raise exception 'private authority did not resolve canonical Organization ADMIN';
  end if;

  if private.chatwoot_business_wide_role(
    '00000000-0000-0000-0000-00000000f301',
    '20000000-0000-0000-0000-00000000f301',
    '00000000-0000-0000-0000-00000000e303'
  ) <> 'VIEWER' then
    raise exception 'private authority did not preserve canonical Organization VIEWER';
  end if;
end;
$baseline_role$;

-- Build lower-scope evidence through the governed 0082 RPCs.
do $create_scope_evidence$
declare
  v_brand public.member_scope_assignments%rowtype;
  v_business public.member_scope_assignments%rowtype;
begin
  select * into v_brand
  from public.create_member_scope_assignment(
    '00000000-0000-0000-0000-00000000f301',
    '00000000-0000-0000-0000-00000000e302',
    'BRAND',
    'VIEWER',
    '10000000-0000-0000-0000-00000000f301',
    null,null,null,null,
    '{}'::jsonb,
    'private-role-brand-create'
  );

  select * into v_business
  from public.create_member_scope_assignment(
    '00000000-0000-0000-0000-00000000f301',
    '00000000-0000-0000-0000-00000000e302',
    'BUSINESS',
    'SALES_AGENT',
    null,
    '20000000-0000-0000-0000-00000000f301',
    null,null,null,
    '{}'::jsonb,
    'private-role-business-create'
  );

  if v_brand.version <> 1 or v_business.version <> 1 then
    raise exception 'governed scope evidence did not start at version 1';
  end if;
end;
$create_scope_evidence$;

do $business_precedence$
begin
  if private.chatwoot_business_wide_role(
    '00000000-0000-0000-0000-00000000f301',
    '20000000-0000-0000-0000-00000000f301',
    '00000000-0000-0000-0000-00000000e302'
  ) <> 'SALES_AGENT' then
    raise exception 'BUSINESS assignment did not outrank BRAND assignment';
  end if;
end;
$business_precedence$;

-- Conditional BUSINESS assignment fails closed without trusted attributes.
do $conditional_business$
declare
  v_id uuid;
begin
  select id into v_id
  from public.member_scope_assignments
  where organization_id='00000000-0000-0000-0000-00000000f301'
    and user_id='00000000-0000-0000-0000-00000000e302'
    and scope_type='BUSINESS';

  perform public.update_member_scope_assignment(
    '00000000-0000-0000-0000-00000000f301',
    v_id,
    1,
    'SALES_AGENT',
    '{"certified":true}'::jsonb,
    'private-role-business-conditional'
  );

  if private.chatwoot_business_wide_role(
    '00000000-0000-0000-0000-00000000f301',
    '20000000-0000-0000-0000-00000000f301',
    '00000000-0000-0000-0000-00000000e302'
  ) <> 'VIEWER' then
    raise exception 'conditional BUSINESS assignment unexpectedly granted';
  end if;
end;
$conditional_business$;

-- Conditional BRAND assignment also fails closed, returning Organization ADMIN.
do $conditional_brand$
declare
  v_id uuid;
begin
  select id into v_id
  from public.member_scope_assignments
  where organization_id='00000000-0000-0000-0000-00000000f301'
    and user_id='00000000-0000-0000-0000-00000000e302'
    and scope_type='BRAND';

  perform public.update_member_scope_assignment(
    '00000000-0000-0000-0000-00000000f301',
    v_id,
    1,
    'VIEWER',
    '{"region":"OM"}'::jsonb,
    'private-role-brand-conditional'
  );

  if private.chatwoot_business_wide_role(
    '00000000-0000-0000-0000-00000000f301',
    '20000000-0000-0000-0000-00000000f301',
    '00000000-0000-0000-0000-00000000e302'
  ) <> 'ADMIN' then
    raise exception 'conditional BRAND assignment did not fail closed to Organization role';
  end if;
end;
$conditional_brand$;

-- Organization OWNER always remains OWNER despite a lower-scope VIEWER assignment.
perform public.create_member_scope_assignment(
  '00000000-0000-0000-0000-00000000f301',
  '00000000-0000-0000-0000-00000000e305',
  'BRAND',
  'VIEWER',
  '10000000-0000-0000-0000-00000000f301',
  null,null,null,null,
  '{}'::jsonb,
  'private-role-owner-lower-scope'
);

do $owner_preserved$
begin
  if private.chatwoot_business_wide_role(
    '00000000-0000-0000-0000-00000000f301',
    '20000000-0000-0000-0000-00000000f301',
    '00000000-0000-0000-0000-00000000e305'
  ) <> 'OWNER' then
    raise exception 'canonical Organization OWNER was incorrectly suppressed';
  end if;
end;
$owner_preserved$;

-- Non-owner cannot use the private authority function successfully.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e302',false);

do $non_owner_denied$
begin
  begin
    perform private.chatwoot_business_wide_role(
      '00000000-0000-0000-0000-00000000f301',
      '20000000-0000-0000-0000-00000000f301',
      '00000000-0000-0000-0000-00000000e303'
    );
    raise exception 'non-OWNER unexpectedly resolved canonical target role';
  exception when others then
    if sqlerrm not like 'current Organization OWNER required%' then
      raise;
    end if;
  end;
end;
$non_owner_denied$;

-- Owner A cannot resolve Org B.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e301',false);

do $cross_tenant_denied$
begin
  begin
    perform private.chatwoot_business_wide_role(
      '00000000-0000-0000-0000-00000000f302',
      '20000000-0000-0000-0000-00000000f302',
      '00000000-0000-0000-0000-00000000e304'
    );
    raise exception 'cross-tenant canonical role resolution unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'current Organization OWNER required%' then
      raise;
    end if;
  end;

  begin
    perform private.chatwoot_business_wide_role(
      '00000000-0000-0000-0000-00000000f301',
      '20000000-0000-0000-0000-00000000f302',
      '00000000-0000-0000-0000-00000000e302'
    );
    raise exception 'foreign tenant Business unexpectedly resolved';
  exception when others then
    if sqlerrm not like 'ACTIVE tenant Business lineage required%' then
      raise;
    end if;
  end;
end;
$cross_tenant_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);

-- Archived Business or Brand can never authorize projection.
update public.tenant_businesses
set status='ARCHIVED'
where id='20000000-0000-0000-0000-00000000f301';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e301',false);

do $archived_business_denied$
begin
  begin
    perform private.chatwoot_business_wide_role(
      '00000000-0000-0000-0000-00000000f301',
      '20000000-0000-0000-0000-00000000f301',
      '00000000-0000-0000-0000-00000000e302'
    );
    raise exception 'ARCHIVED tenant Business unexpectedly resolved canonical role';
  exception when others then
    if sqlerrm not like 'ACTIVE tenant Business lineage required%' then
      raise;
    end if;
  end;
end;
$archived_business_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);

update public.tenant_businesses
set status='ACTIVE'
where id='20000000-0000-0000-0000-00000000f301';

update public.brands
set status='ARCHIVED'
where id='10000000-0000-0000-0000-00000000f301';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e301',false);

do $archived_brand_denied$
begin
  begin
    perform private.chatwoot_business_wide_role(
      '00000000-0000-0000-0000-00000000f301',
      '20000000-0000-0000-0000-00000000f301',
      '00000000-0000-0000-0000-00000000e302'
    );
    raise exception 'ARCHIVED Brand unexpectedly resolved canonical role';
  exception when others then
    if sqlerrm not like 'ACTIVE tenant Business lineage required%' then
      raise;
    end if;
  end;
end;
$archived_brand_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $security_contract$
declare
  v_proc oid := 'private.chatwoot_business_wide_role(uuid,uuid,uuid)'::regprocedure;
  v_owner_proc oid := 'public.is_org_owner(uuid)'::regprocedure;
  v_definition text;
begin
  if not (select prosecdef from pg_proc where oid=v_proc) then
    raise exception 'private canonical role authority must be SECURITY DEFINER';
  end if;

  if (select prosecdef from pg_proc where oid=v_owner_proc) then
    raise exception 'public.is_org_owner hardening regressed to SECURITY DEFINER';
  end if;

  if not exists (
    select 1
    from pg_proc p
    cross join lateral unnest(coalesce(p.proconfig,array[]::text[])) cfg
    where p.oid=v_proc
      and cfg in ('search_path=','search_path=""')
  ) then
    raise exception 'private canonical role authority must pin empty search_path';
  end if;

  if not has_schema_privilege('authenticated','private','USAGE')
     or has_schema_privilege('anon','private','USAGE')
     or has_schema_privilege('service_role','private','USAGE')
  then
    raise exception 'private schema grants are broader than intended';
  end if;

  if not has_function_privilege(
       'authenticated',
       'private.chatwoot_business_wide_role(uuid,uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'private.chatwoot_business_wide_role(uuid,uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'private.chatwoot_business_wide_role(uuid,uuid,uuid)',
       'EXECUTE'
     )
  then
    raise exception 'private canonical role function grants are broader than intended';
  end if;

  select lower(pg_get_functiondef(v_proc)) into v_definition;

  if v_definition ~ '\m(insert|update|delete)\M' then
    raise exception 'private canonical role authority unexpectedly contains mutation SQL';
  end if;
end;
$security_contract$;

rollback;
