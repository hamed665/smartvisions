\set ON_ERROR_STOP on

begin;

create temp table c3b_writer_state (
  key text primary key,
  value text not null
) on commit drop;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000e401'),
  ('00000000-0000-0000-0000-00000000e402'),
  ('00000000-0000-0000-0000-00000000e403');

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-00000000f401','C3B writer org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000f401','00000000-0000-0000-0000-00000000e401','OWNER'),
  ('00000000-0000-0000-0000-00000000f401','00000000-0000-0000-0000-00000000e402','ADMIN'),
  ('00000000-0000-0000-0000-00000000f401','00000000-0000-0000-0000-00000000e403','VIEWER');

insert into public.brands(id,organization_id,name,slug) values
  ('10000000-0000-0000-0000-00000000f401','00000000-0000-0000-0000-00000000f401','C3B Writer Brand','c3b-writer-brand');

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values
  ('20000000-0000-0000-0000-00000000f401','00000000-0000-0000-0000-00000000f401','10000000-0000-0000-0000-00000000f401','C3B Writer Business','c3b-writer-business');

insert into public.branches(id,organization_id,tenant_business_id,name,code) values
  ('30000000-0000-0000-0000-00000000f401','00000000-0000-0000-0000-00000000f401','20000000-0000-0000-0000-00000000f401','HQ','HQ');

insert into public.integration_connections(
  id,organization_id,provider,channel,enabled,status
) values (
  '60000000-0000-0000-0000-00000000f401',
  '00000000-0000-0000-0000-00000000f401',
  'META','WHATSAPP',true,'CONNECTED'
);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e401',false);

select (public.create_communication_channel_binding(
  '00000000-0000-0000-0000-00000000f401',
  '20000000-0000-0000-0000-00000000f401',
  '30000000-0000-0000-0000-00000000f401',
  '60000000-0000-0000-0000-00000000f401',
  'WHATSAPP',
  'c3b-writer-binding-create'
)).id as binding_id \gset

select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000f401',
  '20000000-0000-0000-0000-00000000f401',
  'c3b-writer-account-create'
)).id as account_mapping_id \gset

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-00000000f401',
  :'account_mapping_id'::uuid,
  1,
  'ACTIVE',
  401,
  null,
  'c3b-writer-account-active'
)).id;

insert into c3b_writer_state(key,value) values
  ('account_mapping_id', :'account_mapping_id');

-- Direct authenticated table mutation has grants but cannot pass governed context.
do $direct_authenticated_denied$
begin
  begin
    insert into public.chatwoot_user_mappings(
      smart_user_id,status,version,last_request_key,created_by_user_id,updated_by_user_id
    ) values (
      '00000000-0000-0000-0000-00000000e402',
      'PROVISIONING',1,'direct-user-write',
      '00000000-0000-0000-0000-00000000e401',
      '00000000-0000-0000-0000-00000000e401'
    );
    raise exception 'direct authenticated User mapping insert unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%governed command%'
       and sqlerrm not like '%row-level security%'
    then
      raise;
    end if;
  end;
end;
$direct_authenticated_denied$;

-- OWNER and ADMIN are eligible; VIEWER is not.
select (public.create_chatwoot_user_mapping(
  '00000000-0000-0000-0000-00000000f401',
  '20000000-0000-0000-0000-00000000f401',
  '00000000-0000-0000-0000-00000000e401',
  'c3b-writer-owner-user-create'
)).id as owner_user_mapping_id \gset

select (public.create_chatwoot_user_mapping(
  '00000000-0000-0000-0000-00000000f401',
  '20000000-0000-0000-0000-00000000f401',
  '00000000-0000-0000-0000-00000000e402',
  'c3b-writer-admin-user-create'
)).id as admin_user_mapping_id \gset

insert into c3b_writer_state(key,value) values
  ('owner_user_mapping_id', :'owner_user_mapping_id'),
  ('admin_user_mapping_id', :'admin_user_mapping_id');

do $viewer_user_denied$
begin
  begin
    perform public.create_chatwoot_user_mapping(
      '00000000-0000-0000-0000-00000000f401',
      '20000000-0000-0000-0000-00000000f401',
      '00000000-0000-0000-0000-00000000e403',
      'c3b-writer-viewer-user-create'
    );
    raise exception 'VIEWER unexpectedly received Chatwoot User mapping';
  exception when others then
    if sqlerrm not like 'VIEWER does not require%' then
      raise;
    end if;
  end;
end;
$viewer_user_denied$;

-- User mapping create replay preserves identity.
do $user_create_replay$
declare
  v_replay public.chatwoot_user_mappings%rowtype;
begin
  select * into v_replay
  from public.create_chatwoot_user_mapping(
    '00000000-0000-0000-0000-00000000f401',
    '20000000-0000-0000-0000-00000000f401',
    '00000000-0000-0000-0000-00000000e402',
    'c3b-writer-admin-user-create'
  );

  if v_replay.id <> :'admin_user_mapping_id'::uuid
     or v_replay.version <> 1
     or v_replay.status <> 'PROVISIONING'
  then
    raise exception 'Chatwoot User create replay did not preserve mapping identity';
  end if;
end;
$user_create_replay$;

-- Activate both external Users through governed writer.
select (public.set_chatwoot_user_mapping_state(
  '00000000-0000-0000-0000-00000000f401',
  '20000000-0000-0000-0000-00000000f401',
  '00000000-0000-0000-0000-00000000e401',
  :'owner_user_mapping_id'::uuid,
  1,'ACTIVE',141,null,'c3b-writer-owner-user-active'
)).version as owner_user_version \gset

select (public.set_chatwoot_user_mapping_state(
  '00000000-0000-0000-0000-00000000f401',
  '20000000-0000-0000-0000-00000000f401',
  '00000000-0000-0000-0000-00000000e402',
  :'admin_user_mapping_id'::uuid,
  1,'ACTIVE',142,null,'c3b-writer-admin-user-active'
)).version as admin_user_version \gset

do $user_activation_verified$
begin
  if :'owner_user_version'::integer <> 2
     or :'admin_user_version'::integer <> 2
  then
    raise exception 'Chatwoot User activation did not advance version to 2';
  end if;

  if not exists (
    select 1
    from public.chatwoot_user_mappings
    where id=:'admin_user_mapping_id'::uuid
      and smart_user_id='00000000-0000-0000-0000-00000000e402'
      and chatwoot_user_id=142
      and status='ACTIVE'
      and last_verified_at is not null
  ) then
    raise exception 'governed Chatwoot User activation state is invalid';
  end if;
end;
$user_activation_verified$;

-- User state replay does not trip expected-version after the first success.
do $user_state_replay$
declare
  v_replay public.chatwoot_user_mappings%rowtype;
begin
  select * into v_replay
  from public.set_chatwoot_user_mapping_state(
    '00000000-0000-0000-0000-00000000f401',
    '20000000-0000-0000-0000-00000000f401',
    '00000000-0000-0000-0000-00000000e402',
    :'admin_user_mapping_id'::uuid,
    1,'ACTIVE',142,null,'c3b-writer-admin-user-active'
  );

  if v_replay.version <> 2 or v_replay.chatwoot_user_id <> 142 then
    raise exception 'Chatwoot User state replay is not idempotent';
  end if;
end;
$user_state_replay$;

-- Create OWNER membership. Role is computed server-side; caller supplies no role.
select (public.create_chatwoot_account_membership(
  '00000000-0000-0000-0000-00000000f401',
  '20000000-0000-0000-0000-00000000f401',
  '00000000-0000-0000-0000-00000000e401',
  :'owner_user_mapping_id'::uuid,
  :'account_mapping_id'::uuid,
  'c3b-writer-owner-membership-create'
)).id as owner_membership_id \gset

do $owner_projection_created$
begin
  if not exists (
    select 1
    from public.chatwoot_account_memberships
    where id=:'owner_membership_id'::uuid
      and effective_smart_role='OWNER'
      and chatwoot_role='administrator'
      and status='PROVISIONING'
      and version=1
  ) then
    raise exception 'OWNER membership did not use canonical administrator projection';
  end if;
end;
$owner_projection_created$;

-- A false external role cannot activate OWNER membership.
do $owner_wrong_external_role_denied$
begin
  begin
    perform public.set_chatwoot_account_membership_state(
      '00000000-0000-0000-0000-00000000f401',
      '20000000-0000-0000-0000-00000000f401',
      :'owner_membership_id'::uuid,
      1,'ACTIVE',5000000401,'agent',null,
      'c3b-writer-owner-membership-wrong-role'
    );
    raise exception 'OWNER membership unexpectedly activated from agent evidence';
  exception when others then
    if sqlerrm not like 'verified external Chatwoot role does not match%' then
      raise;
    end if;
  end;
end;
$owner_wrong_external_role_denied$;

select (public.set_chatwoot_account_membership_state(
  '00000000-0000-0000-0000-00000000f401',
  '20000000-0000-0000-0000-00000000f401',
  :'owner_membership_id'::uuid,
  1,'ACTIVE',5000000401,'administrator',null,
  'c3b-writer-owner-membership-active'
)).version as owner_membership_version \gset

-- Admin membership must project to agent, never administrator.
select (public.create_chatwoot_account_membership(
  '00000000-0000-0000-0000-00000000f401',
  '20000000-0000-0000-0000-00000000f401',
  '00000000-0000-0000-0000-00000000e402',
  :'admin_user_mapping_id'::uuid,
  :'account_mapping_id'::uuid,
  'c3b-writer-admin-membership-create'
)).id as admin_membership_id \gset

do $admin_projection_created$
begin
  if not exists (
    select 1
    from public.chatwoot_account_memberships
    where id=:'admin_membership_id'::uuid
      and effective_smart_role='ADMIN'
      and chatwoot_role='agent'
      and status='PROVISIONING'
  ) then
    raise exception 'ADMIN membership did not use canonical agent projection';
  end if;

  begin
    perform public.set_chatwoot_account_membership_state(
      '00000000-0000-0000-0000-00000000f401',
      '20000000-0000-0000-0000-00000000f401',
      :'admin_membership_id'::uuid,
      1,'ACTIVE',5000000402,'administrator',null,
      'c3b-writer-admin-membership-wrong-role'
    );
    raise exception 'ADMIN membership unexpectedly activated as administrator';
  exception when others then
    if sqlerrm not like 'verified external Chatwoot role does not match%' then
      raise;
    end if;
  end;
end;
$admin_projection_created$;

select (public.set_chatwoot_account_membership_state(
  '00000000-0000-0000-0000-00000000f401',
  '20000000-0000-0000-0000-00000000f401',
  :'admin_membership_id'::uuid,
  1,'ACTIVE',5000000402,'agent',null,
  'c3b-writer-admin-membership-active'
)).version as admin_membership_version \gset

do $active_memberships_verified$
begin
  if :'owner_membership_version'::integer <> 2
     or :'admin_membership_version'::integer <> 2
  then
    raise exception 'membership activation did not advance version to 2';
  end if;

  if not exists (
    select 1
    from public.chatwoot_account_memberships
    where id=:'owner_membership_id'::uuid
      and chatwoot_account_user_id=5000000401
      and chatwoot_role='administrator'
      and status='ACTIVE'
  ) then
    raise exception 'OWNER bigint AccountUser projection is invalid';
  end if;

  if not exists (
    select 1
    from public.chatwoot_account_memberships
    where id=:'admin_membership_id'::uuid
      and chatwoot_account_user_id=5000000402
      and chatwoot_role='agent'
      and status='ACTIVE'
  ) then
    raise exception 'ADMIN bigint AccountUser projection is invalid';
  end if;
end;
$active_memberships_verified$;

-- Membership state replay is version-safe.
do $membership_state_replay$
declare
  v_replay public.chatwoot_account_memberships%rowtype;
begin
  select * into v_replay
  from public.set_chatwoot_account_membership_state(
    '00000000-0000-0000-0000-00000000f401',
    '20000000-0000-0000-0000-00000000f401',
    :'admin_membership_id'::uuid,
    1,'ACTIVE',5000000402,'agent',null,
    'c3b-writer-admin-membership-active'
  );

  if v_replay.version <> 2 or v_replay.chatwoot_account_user_id <> 5000000402 then
    raise exception 'membership state replay is not idempotent';
  end if;
end;
$membership_state_replay$;

-- Canonical role is recomputed after a governed scope change.
select (public.create_member_scope_assignment(
  '00000000-0000-0000-0000-00000000f401',
  '00000000-0000-0000-0000-00000000e402',
  'BUSINESS','SALES_AGENT',
  null,'20000000-0000-0000-0000-00000000f401',
  null,null,null,
  '{}'::jsonb,
  'c3b-writer-admin-business-role'
)).id as admin_scope_assignment_id \gset

select (public.set_chatwoot_account_membership_state(
  '00000000-0000-0000-0000-00000000f401',
  '20000000-0000-0000-0000-00000000f401',
  :'admin_membership_id'::uuid,
  2,'ACTIVE',5000000402,'agent',null,
  'c3b-writer-admin-membership-role-refresh'
)).version as admin_membership_role_version \gset

do $canonical_role_recomputed$
begin
  if :'admin_membership_role_version'::integer <> 3 then
    raise exception 'canonical membership role refresh did not increment version';
  end if;

  if not exists (
    select 1
    from public.chatwoot_account_memberships
    where id=:'admin_membership_id'::uuid
      and effective_smart_role='SALES_AGENT'
      and chatwoot_role='agent'
      and version=3
      and last_verified_at is not null
  ) then
    raise exception 'membership role was not recomputed from Smart Core';
  end if;
end;
$canonical_role_recomputed$;

-- Live child membership prevents weakening the global User mapping.
do $live_child_blocks_user_degrade$
begin
  begin
    perform public.set_chatwoot_user_mapping_state(
      '00000000-0000-0000-0000-00000000f401',
      '20000000-0000-0000-0000-00000000f401',
      '00000000-0000-0000-0000-00000000e402',
      :'admin_user_mapping_id'::uuid,
      2,'DEGRADED',142,'UPSTREAM_UNAVAILABLE',
      'c3b-writer-admin-user-degrade'
    );
    raise exception 'User mapping with live membership unexpectedly degraded';
  exception when others then
    if sqlerrm not like 'live Chatwoot Account memberships require ACTIVE User mapping%' then
      raise;
    end if;
  end;
end;
$live_child_blocks_user_degrade$;

-- ARCHIVED is intentionally not opened by 0084.
do $archive_not_opened$
begin
  begin
    perform public.set_chatwoot_account_membership_state(
      '00000000-0000-0000-0000-00000000f401',
      '20000000-0000-0000-0000-00000000f401',
      :'admin_membership_id'::uuid,
      3,'ARCHIVED',5000000402,'agent',null,
      'c3b-writer-admin-membership-archive'
    );
    raise exception '0084 unexpectedly exposed Account membership ARCHIVED transition';
  exception when others then
    if sqlerrm not like 'invalid Chatwoot Account membership state payload%' then
      raise;
    end if;
  end;

  begin
    perform public.set_chatwoot_user_mapping_state(
      '00000000-0000-0000-0000-00000000f401',
      '20000000-0000-0000-0000-00000000f401',
      '00000000-0000-0000-0000-00000000e402',
      :'admin_user_mapping_id'::uuid,
      2,'ARCHIVED',142,null,
      'c3b-writer-admin-user-archive'
    );
    raise exception '0084 unexpectedly exposed User mapping ARCHIVED transition';
  exception when others then
    if sqlerrm not like 'invalid Chatwoot User mapping state payload%' then
      raise;
    end if;
  end;
end;
$archive_not_opened$;

-- Non-owner cannot use governed writers.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e402',false);

do $non_owner_denied$
begin
  begin
    perform public.create_chatwoot_user_mapping(
      '00000000-0000-0000-0000-00000000f401',
      '20000000-0000-0000-0000-00000000f401',
      '00000000-0000-0000-0000-00000000e402',
      'c3b-writer-non-owner-create'
    );
    raise exception 'non-owner unexpectedly mutated Chatwoot User mapping';
  exception when others then
    if sqlerrm not like '%mutation not permitted%' then
      raise;
    end if;
  end;
end;
$non_owner_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);

-- service_role is now read-only on User + Account membership mappings.
set role service_role;

do $service_role_read_only$
begin
  if not has_table_privilege('service_role','public.chatwoot_user_mappings','SELECT')
     or has_table_privilege('service_role','public.chatwoot_user_mappings','INSERT')
     or has_table_privilege('service_role','public.chatwoot_user_mappings','UPDATE')
     or has_table_privilege('service_role','public.chatwoot_account_memberships','INSERT')
     or has_table_privilege('service_role','public.chatwoot_account_memberships','UPDATE')
  then
    raise exception 'service_role User/Account membership privileges are not read-only';
  end if;

  begin
    update public.chatwoot_user_mappings
    set status='DEGRADED'
    where id=:'admin_user_mapping_id'::uuid;
    raise exception 'service_role direct User mapping mutation unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.chatwoot_account_memberships
    set status='DEGRADED'
    where id=:'admin_membership_id'::uuid;
    raise exception 'service_role direct Account membership mutation unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$service_role_read_only$;

reset role;

-- Private helpers remain read-only/narrow and service_role cannot invoke them.
do $private_helper_contract$
declare
  v_manage oid := 'private.chatwoot_user_mapping_manage_allowed(uuid)'::regprocedure;
  v_live oid := 'private.chatwoot_user_mapping_has_live_memberships(uuid,uuid)'::regprocedure;
  v_def text;
begin
  if not (select prosecdef from pg_proc where oid=v_manage)
     or not (select prosecdef from pg_proc where oid=v_live)
  then
    raise exception 'private User mapping helpers must be SECURITY DEFINER';
  end if;

  select lower(pg_get_functiondef(v_manage) || pg_get_functiondef(v_live)) into v_def;
  if v_def ~ '\m(insert|update|delete)\M' then
    raise exception 'private User mapping helpers unexpectedly contain mutation SQL';
  end if;

  if has_function_privilege(
       'service_role',
       'private.chatwoot_user_mapping_manage_allowed(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'private.chatwoot_user_mapping_has_live_memberships(uuid,uuid)',
       'EXECUTE'
     )
  then
    raise exception 'service_role unexpectedly executes private User mapping helpers';
  end if;
end;
$private_helper_contract$;

rollback;
