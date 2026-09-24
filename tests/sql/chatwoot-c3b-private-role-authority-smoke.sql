\set ON_ERROR_STOP on

begin;

-- Synthetic tenant/IAM fixtures. All changes roll back.
insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000c501'),
  ('00000000-0000-0000-0000-00000000c502'),
  ('00000000-0000-0000-0000-00000000c503'),
  ('00000000-0000-0000-0000-00000000c504'),
  ('00000000-0000-0000-0000-00000000c505');

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-00000000d501','Private authority org A'),
  ('00000000-0000-0000-0000-00000000d502','Private authority org B');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000d501','00000000-0000-0000-0000-00000000c501','OWNER'),
  ('00000000-0000-0000-0000-00000000d501','00000000-0000-0000-0000-00000000c502','ADMIN'),
  ('00000000-0000-0000-0000-00000000d501','00000000-0000-0000-0000-00000000c503','VIEWER'),
  ('00000000-0000-0000-0000-00000000d502','00000000-0000-0000-0000-00000000c504','OWNER'),
  ('00000000-0000-0000-0000-00000000d501','00000000-0000-0000-0000-00000000c505','OWNER');

insert into public.brands(id,organization_id,name,slug) values
  ('10000000-0000-0000-0000-00000000d501','00000000-0000-0000-0000-00000000d501','Private Authority Brand A','private-authority-a'),
  ('10000000-0000-0000-0000-00000000d502','00000000-0000-0000-0000-00000000d502','Private Authority Brand B','private-authority-b');

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values
  ('20000000-0000-0000-0000-00000000d501','00000000-0000-0000-0000-00000000d501','10000000-0000-0000-0000-00000000d501','Private Authority Business A','private-authority-a'),
  ('20000000-0000-0000-0000-00000000d502','00000000-0000-0000-0000-00000000d502','10000000-0000-0000-0000-00000000d502','Private Authority Business B','private-authority-b');

-- Proof-only primitive. This is not a migration.
create schema if not exists private;

revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;

create or replace function private.chatwoot_business_wide_role(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_target_user_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $authority$
declare
  v_actor uuid := auth.uid();
  v_org_role text;
  v_brand_id uuid;
  v_scope_role text;
begin
  if v_actor is null then
    raise exception 'authenticated actor required for canonical Chatwoot role';
  end if;

  if not exists (
    select 1
    from public.organization_members actor
    where actor.organization_id = p_organization_id
      and actor.user_id = v_actor
      and actor.role = 'OWNER'
  ) then
    raise exception 'current Organization OWNER required for canonical Chatwoot role';
  end if;

  select b.brand_id
    into v_brand_id
    from public.tenant_businesses b
    join public.brands br
      on br.organization_id = b.organization_id
     and br.id = b.brand_id
   where b.organization_id = p_organization_id
     and b.id = p_tenant_business_id
     and b.status = 'ACTIVE'
     and br.status = 'ACTIVE';

  if not found then
    raise exception 'ACTIVE tenant Business lineage required for canonical Chatwoot role';
  end if;

  select target.role
    into v_org_role
    from public.organization_members target
   where target.organization_id = p_organization_id
     and target.user_id = p_target_user_id;

  if not found
     or v_org_role not in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER')
  then
    raise exception 'canonical Organization member role unavailable';
  end if;

  if v_org_role = 'OWNER' then
    return 'OWNER';
  end if;

  select msa.role
    into v_scope_role
    from public.member_scope_assignments msa
   where msa.organization_id = p_organization_id
     and msa.user_id = p_target_user_id
     and msa.scope_type = 'BUSINESS'
     and msa.tenant_business_id = p_tenant_business_id
     and msa.attributes = '{}'::jsonb;

  if found then
    return v_scope_role;
  end if;

  select msa.role
    into v_scope_role
    from public.member_scope_assignments msa
   where msa.organization_id = p_organization_id
     and msa.user_id = p_target_user_id
     and msa.scope_type = 'BRAND'
     and msa.brand_id = v_brand_id
     and msa.attributes = '{}'::jsonb;

  return coalesce(v_scope_role, v_org_role);
end;
$authority$;

revoke all on function private.chatwoot_business_wide_role(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.chatwoot_business_wide_role(uuid,uuid,uuid)
  to authenticated;

-- The caller still cannot read another member directly through RLS.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c501',false);

do $rls_proof$
begin
  if exists (
    select 1
    from public.organization_members
    where organization_id='00000000-0000-0000-0000-00000000d501'
      and user_id='00000000-0000-0000-0000-00000000c502'
  ) then
    raise exception 'self-read organization_members RLS unexpectedly widened';
  end if;

  if private.chatwoot_business_wide_role(
    '00000000-0000-0000-0000-00000000d501',
    '20000000-0000-0000-0000-00000000d501',
    '00000000-0000-0000-0000-00000000c502'
  ) <> 'ADMIN' then
    raise exception 'private canonical role did not resolve Organization ADMIN';
  end if;

  if private.chatwoot_business_wide_role(
    '00000000-0000-0000-0000-00000000d501',
    '20000000-0000-0000-0000-00000000d501',
    '00000000-0000-0000-0000-00000000c503'
  ) <> 'VIEWER' then
    raise exception 'private canonical role did not preserve Organization VIEWER';
  end if;
end;
$rls_proof$;

reset role;
select set_config('request.jwt.claim.sub','',false);

-- Deepest unconditional Business assignment outranks Brand.
insert into public.member_scope_assignments(
  organization_id,user_id,scope_type,role,brand_id,attributes,assigned_by
) values (
  '00000000-0000-0000-0000-00000000d501',
  '00000000-0000-0000-0000-00000000c502',
  'BRAND','VIEWER','10000000-0000-0000-0000-00000000d501','{}'::jsonb,
  '00000000-0000-0000-0000-00000000c501'
);

insert into public.member_scope_assignments(
  organization_id,user_id,scope_type,role,tenant_business_id,attributes,assigned_by
) values (
  '00000000-0000-0000-0000-00000000d501',
  '00000000-0000-0000-0000-00000000c502',
  'BUSINESS','SALES_AGENT','20000000-0000-0000-0000-00000000d501','{}'::jsonb,
  '00000000-0000-0000-0000-00000000c501'
);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c501',false);

do $scope_precedence$
begin
  if private.chatwoot_business_wide_role(
    '00000000-0000-0000-0000-00000000d501',
    '20000000-0000-0000-0000-00000000d501',
    '00000000-0000-0000-0000-00000000c502'
  ) <> 'SALES_AGENT' then
    raise exception 'BUSINESS assignment did not outrank BRAND assignment';
  end if;
end;
$scope_precedence$;

reset role;
select set_config('request.jwt.claim.sub','',false);

-- Conditional assignments cannot grant without trusted policy attributes.
update public.member_scope_assignments
set attributes='{"certified":true}'::jsonb
where organization_id='00000000-0000-0000-0000-00000000d501'
  and user_id='00000000-0000-0000-0000-00000000c502'
  and scope_type='BUSINESS';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c501',false);

do $conditional_business$
begin
  if private.chatwoot_business_wide_role(
    '00000000-0000-0000-0000-00000000d501',
    '20000000-0000-0000-0000-00000000d501',
    '00000000-0000-0000-0000-00000000c502'
  ) <> 'VIEWER' then
    raise exception 'conditional BUSINESS assignment unexpectedly granted without trusted attributes';
  end if;
end;
$conditional_business$;

reset role;
select set_config('request.jwt.claim.sub','',false);

update public.member_scope_assignments
set attributes='{"region":"OM"}'::jsonb
where organization_id='00000000-0000-0000-0000-00000000d501'
  and user_id='00000000-0000-0000-0000-00000000c502'
  and scope_type='BRAND';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c501',false);

do $conditional_fallback$
begin
  if private.chatwoot_business_wide_role(
    '00000000-0000-0000-0000-00000000d501',
    '20000000-0000-0000-0000-00000000d501',
    '00000000-0000-0000-0000-00000000c502'
  ) <> 'ADMIN' then
    raise exception 'conditional scope assignments did not fail closed to Organization role';
  end if;
end;
$conditional_fallback$;

-- Canonical Organization OWNER cannot be suppressed by lower-scope assignment.
reset role;
select set_config('request.jwt.claim.sub','',false);

insert into public.member_scope_assignments(
  organization_id,user_id,scope_type,role,brand_id,attributes,assigned_by
) values (
  '00000000-0000-0000-0000-00000000d501',
  '00000000-0000-0000-0000-00000000c505',
  'BRAND','VIEWER','10000000-0000-0000-0000-00000000d501','{}'::jsonb,
  '00000000-0000-0000-0000-00000000c501'
);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c501',false);

do $owner_preserved$
begin
  if private.chatwoot_business_wide_role(
    '00000000-0000-0000-0000-00000000d501',
    '20000000-0000-0000-0000-00000000d501',
    '00000000-0000-0000-0000-00000000c505'
  ) <> 'OWNER' then
    raise exception 'canonical Organization OWNER was incorrectly suppressed';
  end if;
end;
$owner_preserved$;

-- Non-OWNER actor is denied even though authenticated has function EXECUTE.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c502',false);

do $non_owner_denied$
begin
  begin
    perform private.chatwoot_business_wide_role(
      '00000000-0000-0000-0000-00000000d501',
      '20000000-0000-0000-0000-00000000d501',
      '00000000-0000-0000-0000-00000000c503'
    );
    raise exception 'non-OWNER unexpectedly resolved canonical target role';
  exception when others then
    if sqlerrm not like 'current Organization OWNER required%' then
      raise;
    end if;
  end;
end;
$non_owner_denied$;

-- Cross-tenant authority fails closed.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c501',false);

do $cross_tenant_denied$
begin
  begin
    perform private.chatwoot_business_wide_role(
      '00000000-0000-0000-0000-00000000d502',
      '20000000-0000-0000-0000-00000000d502',
      '00000000-0000-0000-0000-00000000c504'
    );
    raise exception 'cross-tenant canonical role resolution unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'current Organization OWNER required%' then
      raise;
    end if;
  end;

  begin
    perform private.chatwoot_business_wide_role(
      '00000000-0000-0000-0000-00000000d501',
      '20000000-0000-0000-0000-00000000d502',
      '00000000-0000-0000-0000-00000000c502'
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

-- Archived lineage is never valid authority context.
update public.tenant_businesses
set status='ARCHIVED'
where id='20000000-0000-0000-0000-00000000d501';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c501',false);

do $archived_business_denied$
begin
  begin
    perform private.chatwoot_business_wide_role(
      '00000000-0000-0000-0000-00000000d501',
      '20000000-0000-0000-0000-00000000d501',
      '00000000-0000-0000-0000-00000000c502'
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
where id='20000000-0000-0000-0000-00000000d501';

update public.brands
set status='ARCHIVED'
where id='10000000-0000-0000-0000-00000000d501';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c501',false);

do $archived_brand_denied$
begin
  begin
    perform private.chatwoot_business_wide_role(
      '00000000-0000-0000-0000-00000000d501',
      '20000000-0000-0000-0000-00000000d501',
      '00000000-0000-0000-0000-00000000c502'
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
  v_public_owner_proc oid := 'public.is_org_owner(uuid)'::regprocedure;
begin
  if not (select prosecdef from pg_proc where oid=v_proc) then
    raise exception 'private canonical role primitive must be SECURITY DEFINER';
  end if;

  if (select prosecdef from pg_proc where oid=v_public_owner_proc) then
    raise exception 'public.is_org_owner hardening regressed to SECURITY DEFINER';
  end if;

  if not exists (
    select 1
    from pg_proc p
    cross join lateral unnest(coalesce(p.proconfig,array[]::text[])) cfg
    where p.oid=v_proc
      and cfg in ('search_path=','search_path=""')
  ) then
    raise exception 'private canonical role primitive must pin an empty search_path';
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
end;
$security_contract$;

rollback;
