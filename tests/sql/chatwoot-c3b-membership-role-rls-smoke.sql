\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000b801'),
  ('00000000-0000-0000-0000-00000000b802'),
  ('00000000-0000-0000-0000-00000000b803'),
  ('00000000-0000-0000-0000-00000000b804');

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-00000000b811','C3B membership reader org'),
  ('00000000-0000-0000-0000-00000000b812','C3B foreign org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000b811','00000000-0000-0000-0000-00000000b801','OWNER'),
  ('00000000-0000-0000-0000-00000000b811','00000000-0000-0000-0000-00000000b802','ADMIN'),
  ('00000000-0000-0000-0000-00000000b811','00000000-0000-0000-0000-00000000b803','VIEWER'),
  ('00000000-0000-0000-0000-00000000b812','00000000-0000-0000-0000-00000000b804','OWNER');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000b801',false);

do $owner_read$
begin
  if (select count(*) from public.organization_members
      where organization_id='00000000-0000-0000-0000-00000000b811') <> 3
  then
    raise exception 'Organization OWNER cannot read target members required by #208';
  end if;

  if exists (
    select 1 from public.organization_members
    where organization_id='00000000-0000-0000-0000-00000000b812'
  ) then
    raise exception 'Organization OWNER crossed tenant boundary';
  end if;
end;
$owner_read$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000b803',false);

do $non_owner_read$
begin
  if exists (
    select 1 from public.organization_members
    where organization_id='00000000-0000-0000-0000-00000000b811'
      and user_id='00000000-0000-0000-0000-00000000b802'
  ) then
    raise exception 'non-OWNER unexpectedly read another Organization member';
  end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id='00000000-0000-0000-0000-00000000b811'
      and user_id='00000000-0000-0000-0000-00000000b803'
  ) then
    raise exception 'existing self-read contract regressed';
  end if;
end;
$non_owner_read$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $policy_contract$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='organization_members'
      and policyname='organization_members_owner_read'
      and cmd='SELECT'
      and 'authenticated'=any(roles)
  ) then
    raise exception 'Organization OWNER read policy missing';
  end if;
end;
$policy_contract$;

rollback;
