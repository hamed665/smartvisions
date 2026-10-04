\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email,email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000e601','owner-scope-a@example.com',statement_timestamp()),
  ('00000000-0000-0000-0000-00000000e602','customer-admin@example.com',statement_timestamp()),
  ('00000000-0000-0000-0000-00000000e603','admin-noscope@example.com',statement_timestamp()),
  ('00000000-0000-0000-0000-00000000e604','sales-scope@example.com',statement_timestamp()),
  ('00000000-0000-0000-0000-00000000e605','viewer-scope@example.com',statement_timestamp()),
  ('00000000-0000-0000-0000-00000000e606','owner-scope-b@example.com',statement_timestamp());

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-00000000f601','Customer Scope Org A'),
  ('00000000-0000-0000-0000-00000000f602','Customer Scope Org B');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000f601','00000000-0000-0000-0000-00000000e601','OWNER'),
  ('00000000-0000-0000-0000-00000000f601','00000000-0000-0000-0000-00000000e603','ADMIN'),
  ('00000000-0000-0000-0000-00000000f601','00000000-0000-0000-0000-00000000e604','SALES_AGENT'),
  ('00000000-0000-0000-0000-00000000f601','00000000-0000-0000-0000-00000000e605','VIEWER'),
  ('00000000-0000-0000-0000-00000000f602','00000000-0000-0000-0000-00000000e606','OWNER');

-- Canonical Business bootstrap remains OWNER-only.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e601',false);

insert into public.brands(id,organization_id,name,slug) values
  ('10000000-0000-4000-8000-00000000f601','00000000-0000-0000-0000-00000000f601','Client Brand A','client-brand-a');

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug,country_code,timezone) values
  ('20000000-0000-4000-8000-00000000f601','00000000-0000-0000-0000-00000000f601','10000000-0000-4000-8000-00000000f601','Client Business A','client-business-a','OM','Asia/Muscat'),
  ('20000000-0000-4000-8000-00000000f602','00000000-0000-0000-0000-00000000f601','10000000-0000-4000-8000-00000000f601','Client Business B','client-business-b','OM','Asia/Muscat');

-- Existing scoped IAM is the only Business assignment authority.
select (public.create_member_scope_assignment(
  '00000000-0000-0000-0000-00000000f601',
  '00000000-0000-0000-0000-00000000e604',
  'BUSINESS',
  'SALES_AGENT',
  null,
  '20000000-0000-4000-8000-00000000f601',
  null,null,null,
  '{}'::jsonb,
  'customer-scope-sales'
)).id;

select (public.create_member_scope_assignment(
  '00000000-0000-0000-0000-00000000f601',
  '00000000-0000-0000-0000-00000000e605',
  'BUSINESS',
  'VIEWER',
  null,
  '20000000-0000-4000-8000-00000000f601',
  null,null,null,
  '{}'::jsonb,
  'customer-scope-viewer'
)).id;

-- Customer invitation is explicitly bound to Business A.
do $issue_business_invite$
declare
  v record;
begin
  select * into v
  from public.issue_organization_member_business_invitation(
    '00000000-0000-0000-0000-00000000f601',
    '20000000-0000-4000-8000-00000000f601',
    'customer-admin@example.com',
    'ADMIN',
    repeat('7',64),
    'customer-business-invite'
  );

  if v.tenant_business_id <> '20000000-0000-4000-8000-00000000f601'::uuid
     or v.role <> 'ADMIN'
  then
    raise exception 'customer Business invitation was not canonically bound';
  end if;
end;
$issue_business_invite$;

reset role;
select set_config('request.jwt.claim.sub','',false);

-- Separate Org B exists and must never leak.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e606',false);

insert into public.brands(id,organization_id,name,slug) values
  ('10000000-0000-4000-8000-00000000f602','00000000-0000-0000-0000-00000000f602','Client Brand B','client-brand-b');

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug,country_code,timezone) values
  ('20000000-0000-4000-8000-00000000f603','00000000-0000-0000-0000-00000000f602','10000000-0000-4000-8000-00000000f602','Foreign Business','foreign-business','OM','Asia/Muscat');

reset role;
select set_config('request.jwt.claim.sub','',false);

-- Server capability redeems raw token; customer browser receives only bounded session.
set role service_role;
select *
from public.redeem_organization_member_invitation(
  repeat('7',64),
  repeat('6',64),
  'customer-business-redeem'
);
reset role;

-- Matching Auth user accepts. Membership + canonical BUSINESS assignment are atomic.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e602',false);

do $accept_business_invite$
declare
  v_first record;
  v_replay record;
begin
  select * into v_first
  from public.accept_organization_member_business_invitation(
    repeat('6',64),
    'customer-business-accept'
  );

  if v_first.canonical_role <> 'ADMIN'
     or v_first.business_role <> 'ADMIN'
     or v_first.tenant_business_id <> '20000000-0000-4000-8000-00000000f601'::uuid
     or v_first.scope_replayed
  then
    raise exception 'customer Business acceptance did not materialize expected scope';
  end if;

  select * into v_replay
  from public.accept_organization_member_business_invitation(
    repeat('6',64),
    'customer-business-accept-replay'
  );

  if not v_replay.replayed or not v_replay.scope_replayed then
    raise exception 'customer Business acceptance replay was not idempotent';
  end if;

  if (
    select count(*)
    from public.member_scope_assignments a
    where a.organization_id='00000000-0000-0000-0000-00000000f601'
      and a.user_id='00000000-0000-0000-0000-00000000e602'
      and a.scope_type='BUSINESS'
      and a.tenant_business_id='20000000-0000-4000-8000-00000000f601'
  ) <> 1 then
    raise exception 'customer acceptance duplicated canonical Business scope';
  end if;
end;
$accept_business_invite$;

-- Delegated ADMIN sees only explicitly assigned Business A.
do $admin_business_boundary$
begin
  if (
    select count(*)
    from public.tenant_businesses
  ) <> 1 then
    raise exception 'delegated ADMIN can see a Business without explicit scope';
  end if;

  if not exists (
    select 1
    from public.tenant_businesses
    where id='20000000-0000-4000-8000-00000000f601'
  ) then
    raise exception 'delegated ADMIN lost explicitly assigned Business';
  end if;

  if public.customer_business_effective_role(
    '00000000-0000-0000-0000-00000000f601',
    '20000000-0000-4000-8000-00000000f602',
    '10000000-0000-4000-8000-00000000f601'
  ) is not null then
    raise exception 'Business A customer received implicit Business B authority';
  end if;
end;
$admin_business_boundary$;

-- ADMIN cannot self-promote OWNER or mutate another member scope.
do $admin_no_self_promotion$
declare
  v_role text;
begin
  begin
    update public.organization_members
       set role='OWNER'
     where organization_id='00000000-0000-0000-0000-00000000f601'
       and user_id='00000000-0000-0000-0000-00000000e602';
  exception
    when insufficient_privilege then null;
  end;

  select role into v_role
  from public.organization_members
  where organization_id='00000000-0000-0000-0000-00000000f601'
    and user_id='00000000-0000-0000-0000-00000000e602';

  if v_role <> 'ADMIN' then
    raise exception 'delegated ADMIN self-promoted to OWNER';
  end if;

  begin
    perform public.create_member_scope_assignment(
      '00000000-0000-0000-0000-00000000f601',
      '00000000-0000-0000-0000-00000000e602',
      'BUSINESS',
      'ADMIN',
      null,
      '20000000-0000-4000-8000-00000000f602',
      null,null,null,
      '{}'::jsonb,
      'admin-illegal-scope'
    );
    raise exception 'delegated ADMIN unexpectedly created its own Business scope';
  exception when others then
    if sqlerrm not like 'member scope assignment mutation not permitted%' then
      raise;
    end if;
  end;
end;
$admin_no_self_promotion$;

reset role;
select set_config('request.jwt.claim.sub','',false);

-- A same-Org ADMIN with no Business scope sees no Businesses at all.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e603',false);
do $admin_without_scope_fails_closed$
begin
  if exists (select 1 from public.tenant_businesses) then
    raise exception 'Organization ADMIN gained implicit customer Business access';
  end if;
end;
$admin_without_scope_fails_closed$;
reset role;

-- SALES and VIEWER are restricted to their explicit Business.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e604',false);
do $sales_boundary$
begin
  if (select count(*) from public.tenant_businesses) <> 1 then
    raise exception 'SALES_AGENT Business visibility is not bounded';
  end if;
  if public.customer_business_effective_role(
    '00000000-0000-0000-0000-00000000f601',
    '20000000-0000-4000-8000-00000000f601',
    '10000000-0000-4000-8000-00000000f601'
  ) <> 'SALES_AGENT' then
    raise exception 'SALES_AGENT effective Business role is incorrect';
  end if;
end;
$sales_boundary$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e605',false);
do $viewer_boundary$
begin
  if (select count(*) from public.tenant_businesses) <> 1 then
    raise exception 'VIEWER Business visibility is not bounded';
  end if;

  begin
    update public.tenant_businesses
       set name='illegal viewer mutation'
     where id='20000000-0000-4000-8000-00000000f601';
    if found then
      raise exception 'VIEWER unexpectedly mutated canonical Business';
    end if;
  exception
    when insufficient_privilege then null;
  end;
end;
$viewer_boundary$;
reset role;
select set_config('request.jwt.claim.sub','',false);

-- OWNER authority is preserved across both Businesses in its Organization.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e601',false);
do $owner_authority_preserved$
begin
  if (
    select count(*)
    from public.tenant_businesses
    where organization_id='00000000-0000-0000-0000-00000000f601'
  ) <> 2 then
    raise exception 'Organization OWNER lost canonical Business authority';
  end if;
end;
$owner_authority_preserved$;
reset role;
select set_config('request.jwt.claim.sub','',false);

-- Create Chatwoot mappings through the existing governed OWNER command path.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e601',false);
select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000f601',
  '20000000-0000-4000-8000-00000000f601',
  'scope-map-a'
)).id;
select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000f601',
  '20000000-0000-4000-8000-00000000f602',
  'scope-map-b'
)).id;
reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e606',false);
select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000f602',
  '20000000-0000-4000-8000-00000000f603',
  'scope-map-foreign'
)).id;
reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e602',false);
do $chatwoot_mapping_boundary$
begin
  if (
    select count(*)
    from public.chatwoot_account_mappings
  ) <> 1 then
    raise exception 'delegated ADMIN leaked cross-Business Chatwoot Account mappings';
  end if;

  if not exists (
    select 1 from public.chatwoot_account_mappings
    where tenant_business_id='20000000-0000-4000-8000-00000000f601'
  ) then
    raise exception 'delegated ADMIN lost its own Business Chatwoot mapping';
  end if;
end;
$chatwoot_mapping_boundary$;
reset role;

-- Function/table grant contract: no anonymous customer access and no parallel authority.
do $security_contract$
begin
  if has_function_privilege(
       'anon',
       'public.customer_business_effective_role(uuid,uuid,uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.customer_business_effective_role(uuid,uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.accept_organization_member_business_invitation(text,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.accept_organization_member_business_invitation(text,text)',
       'EXECUTE'
     )
  then
    raise exception 'customer Business function grants are broader than intended';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='tenant_businesses'
      and policyname='tenant_businesses_customer_scoped_read'
  ) then
    raise exception 'customer Business RLS policy is missing';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='tenant_businesses'
      and policyname='tenant_businesses_member_read'
  ) then
    raise exception 'legacy Organization-wide Business read policy still exists';
  end if;
end;
$security_contract$;

rollback;
