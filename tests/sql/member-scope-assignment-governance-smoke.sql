\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000e201'),
  ('00000000-0000-0000-0000-00000000e202'),
  ('00000000-0000-0000-0000-00000000e203');

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-00000000f201','Scope governance org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000f201','00000000-0000-0000-0000-00000000e201','OWNER'),
  ('00000000-0000-0000-0000-00000000f201','00000000-0000-0000-0000-00000000e202','ADMIN'),
  ('00000000-0000-0000-0000-00000000f201','00000000-0000-0000-0000-00000000e203','VIEWER');

insert into public.brands(id,organization_id,name,slug) values
  ('10000000-0000-0000-0000-00000000f201','00000000-0000-0000-0000-00000000f201','Scope Governance Brand','scope-governance-brand');

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values
  ('20000000-0000-0000-0000-00000000f201','00000000-0000-0000-0000-00000000f201','10000000-0000-0000-0000-00000000f201','Scope Governance Business','scope-governance-business');

-- Owner direct DML is blocked without command context.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e201',false);

do $direct_insert_denied$
begin
  begin
    insert into public.member_scope_assignments(
      organization_id,user_id,scope_type,role,tenant_business_id,
      attributes,assigned_by,version,last_request_key,updated_by_user_id
    ) values (
      '00000000-0000-0000-0000-00000000f201',
      '00000000-0000-0000-0000-00000000e202',
      'BUSINESS','ADMIN','20000000-0000-0000-0000-00000000f201',
      '{}'::jsonb,
      '00000000-0000-0000-0000-00000000e201',
      1,'direct-write-must-fail',
      '00000000-0000-0000-0000-00000000e201'
    );
    raise exception 'direct member scope assignment insert unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%governed command%' then
      raise;
    end if;
  end;
end;
$direct_insert_denied$;

-- Governed create succeeds and replay returns the same row.
do $create_and_replay$
declare
  v_first public.member_scope_assignments%rowtype;
  v_replay public.member_scope_assignments%rowtype;
begin
  select * into v_first
  from public.create_member_scope_assignment(
    '00000000-0000-0000-0000-00000000f201',
    '00000000-0000-0000-0000-00000000e202',
    'BUSINESS',
    'ADMIN',
    null,
    '20000000-0000-0000-0000-00000000f201',
    null,null,null,
    '{}'::jsonb,
    'scope-create-1'
  );

  select * into v_replay
  from public.create_member_scope_assignment(
    '00000000-0000-0000-0000-00000000f201',
    '00000000-0000-0000-0000-00000000e202',
    'BUSINESS',
    'ADMIN',
    null,
    '20000000-0000-0000-0000-00000000f201',
    null,null,null,
    '{}'::jsonb,
    'scope-create-1'
  );

  if v_first.id <> v_replay.id
     or v_first.version <> 1
     or v_replay.version <> 1
     or v_first.last_request_key <> 'scope-create-1'
  then
    raise exception 'governed create replay did not preserve assignment identity/version';
  end if;

  if (
    select count(*)
    from public.member_scope_assignment_command_claims
    where organization_id='00000000-0000-0000-0000-00000000f201'
      and request_key='scope-create-1'
  ) <> 1 then
    raise exception 'create replay produced duplicate command claims';
  end if;
end;
$create_and_replay$;

-- Same request key with changed payload fails closed.
do $request_key_conflict$
begin
  begin
    perform public.create_member_scope_assignment(
      '00000000-0000-0000-0000-00000000f201',
      '00000000-0000-0000-0000-00000000e202',
      'BUSINESS',
      'SALES_AGENT',
      null,
      '20000000-0000-0000-0000-00000000f201',
      null,null,null,
      '{}'::jsonb,
      'scope-create-1'
    );
    raise exception 'request-key payload conflict unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%request key already used%' then
      raise;
    end if;
  end;
end;
$request_key_conflict$;

-- Update requires expected version and increments exactly once.
do $update_versioning$
declare
  v_id uuid;
  v_updated public.member_scope_assignments%rowtype;
  v_replay public.member_scope_assignments%rowtype;
begin
  select id into v_id
  from public.member_scope_assignments
  where organization_id='00000000-0000-0000-0000-00000000f201'
    and user_id='00000000-0000-0000-0000-00000000e202'
    and scope_type='BUSINESS'
    and tenant_business_id='20000000-0000-0000-0000-00000000f201';

  select * into v_updated
  from public.update_member_scope_assignment(
    '00000000-0000-0000-0000-00000000f201',
    v_id,
    1,
    'SALES_AGENT',
    '{"region":"OM"}'::jsonb,
    'scope-update-1'
  );

  if v_updated.version <> 2
     or v_updated.role <> 'SALES_AGENT'
     or v_updated.last_request_key <> 'scope-update-1'
  then
    raise exception 'governed update did not apply version/role/request evidence';
  end if;

  select * into v_replay
  from public.update_member_scope_assignment(
    '00000000-0000-0000-0000-00000000f201',
    v_id,
    1,
    'SALES_AGENT',
    '{"region":"OM"}'::jsonb,
    'scope-update-1'
  );

  if v_replay.id <> v_id or v_replay.version <> 2 then
    raise exception 'update replay did not remain idempotent';
  end if;

  begin
    perform public.update_member_scope_assignment(
      '00000000-0000-0000-0000-00000000f201',
      v_id,
      1,
      'VIEWER',
      '{}'::jsonb,
      'scope-update-stale'
    );
    raise exception 'stale expected version unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%version conflict%' then
      raise;
    end if;
  end;
end;
$update_versioning$;

-- Direct UPDATE is also blocked.
do $direct_update_denied$
declare
  v_id uuid;
begin
  select id into v_id
  from public.member_scope_assignments
  where organization_id='00000000-0000-0000-0000-00000000f201'
    and user_id='00000000-0000-0000-0000-00000000e202'
    and scope_type='BUSINESS';

  begin
    update public.member_scope_assignments
    set role='VIEWER',
        version=version+1,
        last_request_key='direct-update-must-fail',
        updated_by_user_id='00000000-0000-0000-0000-00000000e201'
    where id=v_id;
    raise exception 'direct member scope assignment update unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%governed command%' then
      raise;
    end if;
  end;
end;
$direct_update_denied$;

-- Non-owner cannot mutate through the RPC.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e202',false);

do $non_owner_denied$
declare
  v_id uuid;
begin
  select id into v_id
  from public.member_scope_assignments
  where organization_id='00000000-0000-0000-0000-00000000f201'
    and user_id='00000000-0000-0000-0000-00000000e202'
    and scope_type='BUSINESS';

  begin
    perform public.update_member_scope_assignment(
      '00000000-0000-0000-0000-00000000f201',
      v_id,
      2,
      'VIEWER',
      '{}'::jsonb,
      'non-owner-update'
    );
    raise exception 'non-owner scope mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%mutation not permitted%' then
      raise;
    end if;
  end;
end;
$non_owner_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);

-- service_role remains read-only for canonical scope authority.
set role service_role;

do $service_role_read_only$
begin
  if not has_table_privilege('service_role','public.member_scope_assignments','SELECT')
     or has_table_privilege('service_role','public.member_scope_assignments','INSERT')
     or has_table_privilege('service_role','public.member_scope_assignments','UPDATE')
     or has_table_privilege('service_role','public.member_scope_assignments','DELETE')
  then
    raise exception 'service_role scope assignment privileges are not read-only';
  end if;

  begin
    update public.member_scope_assignments
    set role='VIEWER'
    where organization_id='00000000-0000-0000-0000-00000000f201';
    raise exception 'service_role direct IAM mutation unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$service_role_read_only$;

reset role;

-- Owner delete is governed and replay-safe.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e201',false);

do $delete_and_replay$
declare
  v_id uuid;
  v_result jsonb;
  v_replay jsonb;
begin
  select id into v_id
  from public.member_scope_assignments
  where organization_id='00000000-0000-0000-0000-00000000f201'
    and user_id='00000000-0000-0000-0000-00000000e202'
    and scope_type='BUSINESS';

  v_result := public.delete_member_scope_assignment(
    '00000000-0000-0000-0000-00000000f201',
    v_id,
    2,
    'scope-delete-1'
  );

  if coalesce((v_result->>'deleted')::boolean,false) is not true
     or coalesce((v_result->>'replayed')::boolean,true) is not false
  then
    raise exception 'governed delete result is invalid';
  end if;

  if exists (
    select 1 from public.member_scope_assignments
    where organization_id='00000000-0000-0000-0000-00000000f201'
      and id=v_id
  ) then
    raise exception 'governed delete left the assignment row live';
  end if;

  v_replay := public.delete_member_scope_assignment(
    '00000000-0000-0000-0000-00000000f201',
    v_id,
    2,
    'scope-delete-1'
  );

  if coalesce((v_replay->>'deleted')::boolean,false) is not true
     or coalesce((v_replay->>'replayed')::boolean,false) is not true
  then
    raise exception 'delete replay did not remain idempotent';
  end if;
end;
$delete_and_replay$;

-- Claims are immutable and bounded audit evidence was written once per mutation.
do $claims_and_audit$
begin
  if (
    select count(*)
    from public.member_scope_assignment_command_claims
    where organization_id='00000000-0000-0000-0000-00000000f201'
  ) <> 3 then
    raise exception 'unexpected member scope assignment command claim count';
  end if;

  if (
    select count(*)
    from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000f201'
      and action in (
        'MEMBER_SCOPE_ASSIGNMENT_CREATED',
        'MEMBER_SCOPE_ASSIGNMENT_UPDATED',
        'MEMBER_SCOPE_ASSIGNMENT_DELETED'
      )
  ) <> 3 then
    raise exception 'unexpected member scope assignment audit count';
  end if;

  begin
    update public.member_scope_assignment_command_claims
    set applied_version=99
    where organization_id='00000000-0000-0000-0000-00000000f201'
      and request_key='scope-create-1';
    raise exception 'command claim mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%immutable%'
       and sqlstate <> '42501'
    then
      raise;
    end if;
  end;
end;
$claims_and_audit$;

reset role;
select set_config('request.jwt.claim.sub','',false);

-- Existing ON DELETE CASCADE semantics remain usable for parent cleanup.
insert into public.member_scope_assignments(
  organization_id,user_id,scope_type,role,tenant_business_id,
  attributes,assigned_by,version,last_request_key,updated_by_user_id
) values (
  '00000000-0000-0000-0000-00000000f201',
  '00000000-0000-0000-0000-00000000e203',
  'BUSINESS','VIEWER','20000000-0000-0000-0000-00000000f201',
  '{}'::jsonb,
  '00000000-0000-0000-0000-00000000e201',
  1,'cascade-fixture',
  '00000000-0000-0000-0000-00000000e201'
);

-- The fixture above is database-owner setup, so open the command context explicitly.
-- Parent delete below should cascade without being mistaken for a top-level app delete.
select set_config('smartvisions.member_scope_assignment_command','1',true);
delete from public.organization_members
where organization_id='00000000-0000-0000-0000-00000000f201'
  and user_id='00000000-0000-0000-0000-00000000e203';
select set_config('smartvisions.member_scope_assignment_command','0',true);

if exists (
  select 1 from public.member_scope_assignments
  where organization_id='00000000-0000-0000-0000-00000000f201'
    and user_id='00000000-0000-0000-0000-00000000e203'
) then
  raise exception 'parent cascade left a member scope assignment row';
end if;

rollback;
