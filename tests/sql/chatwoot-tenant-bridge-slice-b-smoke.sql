\set ON_ERROR_STOP on

begin;

create temp table slice_b_state (
  key text primary key,
  value text not null
) on commit drop;

grant select, insert, update on slice_b_state to authenticated, service_role;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000d101'),
  ('00000000-0000-0000-0000-00000000d102'),
  ('00000000-0000-0000-0000-00000000d103');

insert into public.organizations(id, name) values
  ('00000000-0000-0000-0000-00000000e101', 'Slice B Org');

insert into public.organization_members(organization_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000d101', 'OWNER'),
  ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000d102', 'ADMIN'),
  ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000d103', 'VIEWER');

insert into public.brands(id, organization_id, name, slug) values
  ('10000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000e101', 'Slice B Brand', 'slice-b-brand');

insert into public.tenant_businesses(id, organization_id, brand_id, name, slug) values
  ('20000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000e101', '10000000-0000-0000-0000-00000000e101', 'Slice B Business', 'slice-b-business');

insert into public.branches(id, organization_id, tenant_business_id, name, code) values
  ('30000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000e101', '20000000-0000-0000-0000-00000000e101', 'HQ', 'HQ');

insert into public.departments(id, organization_id, branch_id, name, code) values
  ('40000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000e101', '30000000-0000-0000-0000-00000000e101', 'Sales', 'SALES');

insert into public.teams(id, organization_id, department_id, name, code) values
  ('50000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000e101', '40000000-0000-0000-0000-00000000e101', 'Closer Team', 'CLOSE');

insert into public.integration_connections(
  id, organization_id, provider, channel, enabled, status
) values (
  '60000000-0000-0000-0000-00000000e101',
  '00000000-0000-0000-0000-00000000e101',
  'META',
  'WHATSAPP',
  true,
  'CONNECTED'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d101', false);

select (public.create_communication_channel_binding(
  '00000000-0000-0000-0000-00000000e101',
  '20000000-0000-0000-0000-00000000e101',
  '30000000-0000-0000-0000-00000000e101',
  '60000000-0000-0000-0000-00000000e101',
  'WHATSAPP',
  'slice-b-binding-create'
)).id as binding_id \gset

insert into slice_b_state(key, value)
values ('binding_id', :'binding_id');

select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000e101',
  '20000000-0000-0000-0000-00000000e101',
  'slice-b-account-create'
)).id as account_mapping_id \gset

insert into slice_b_state(key, value)
values ('account_mapping_id', :'account_mapping_id');

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-00000000e101',
  :'account_mapping_id'::uuid,
  1,
  'ACTIVE',
  301,
  null,
  'slice-b-account-active'
)).id;

reset role;
select set_config('request.jwt.claim.sub', '', false);
set role service_role;

insert into public.chatwoot_user_mappings(
  id, smart_user_id, status, version, last_request_key, created_by_user_id, updated_by_user_id
) values
  ('70000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000d101', 'PROVISIONING', 1, 'slice-b-owner-user-create', '00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-00000000d101'),
  ('70000000-0000-0000-0000-00000000e102', '00000000-0000-0000-0000-00000000d102', 'PROVISIONING', 1, 'slice-b-admin-user-create', '00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-00000000d101'),
  ('70000000-0000-0000-0000-00000000e103', '00000000-0000-0000-0000-00000000d103', 'PROVISIONING', 1, 'slice-b-viewer-user-create', '00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-00000000d101');

update public.chatwoot_user_mappings
set chatwoot_user_id=101, status='ACTIVE', version=2, last_request_key='slice-b-owner-user-active',
    last_verified_at=now(), updated_by_user_id='00000000-0000-0000-0000-00000000d101'
where id='70000000-0000-0000-0000-00000000e101';

update public.chatwoot_user_mappings
set chatwoot_user_id=102, status='ACTIVE', version=2, last_request_key='slice-b-admin-user-active',
    last_verified_at=now(), updated_by_user_id='00000000-0000-0000-0000-00000000d101'
where id='70000000-0000-0000-0000-00000000e102';

update public.chatwoot_user_mappings
set chatwoot_user_id=103, status='ACTIVE', version=2, last_request_key='slice-b-viewer-user-active',
    last_verified_at=now(), updated_by_user_id='00000000-0000-0000-0000-00000000d101'
where id='70000000-0000-0000-0000-00000000e103';

do $$
begin
  if exists (
    select 1 from public.audit_logs
    where entity_type='chatwoot_user_mappings'
      and entity_id in (
        '70000000-0000-0000-0000-00000000e101',
        '70000000-0000-0000-0000-00000000e102',
        '70000000-0000-0000-0000-00000000e103'
      )
  ) then
    raise exception 'global Chatwoot User mapping unexpectedly wrote tenantless audit';
  end if;
end;
$$;

insert into public.chatwoot_account_memberships(
  id, organization_id, tenant_business_id, smart_user_id,
  chatwoot_user_mapping_id, chatwoot_account_mapping_id,
  effective_smart_role, chatwoot_role,
  status, version, last_request_key, created_by_user_id, updated_by_user_id
) values (
  '80000000-0000-0000-0000-00000000e101',
  '00000000-0000-0000-0000-00000000e101',
  '20000000-0000-0000-0000-00000000e101',
  '00000000-0000-0000-0000-00000000d101',
  '70000000-0000-0000-0000-00000000e101',
  :'account_mapping_id'::uuid,
  'OWNER',
  'administrator',
  'PROVISIONING',
  1,
  'slice-b-owner-membership-create',
  '00000000-0000-0000-0000-00000000d101',
  '00000000-0000-0000-0000-00000000d101'
);

update public.chatwoot_account_memberships
set chatwoot_account_user_id=5000000001, status='ACTIVE', version=2,
    last_request_key='slice-b-owner-membership-active',
    last_verified_at=now(),
    updated_by_user_id='00000000-0000-0000-0000-00000000d101'
where id='80000000-0000-0000-0000-00000000e101';

do $$
begin
  begin
    insert into public.chatwoot_account_memberships(
      organization_id, tenant_business_id, smart_user_id,
      chatwoot_user_mapping_id, chatwoot_account_mapping_id,
      effective_smart_role, chatwoot_role, status, version, last_request_key
    ) values (
      '00000000-0000-0000-0000-00000000e101',
      '20000000-0000-0000-0000-00000000e101',
      '00000000-0000-0000-0000-00000000d102',
      '70000000-0000-0000-0000-00000000e102',
      (select value::uuid from slice_b_state where key='account_mapping_id'),
      'ADMIN',
      'administrator',
      'PROVISIONING',
      1,
      'slice-b-admin-wrong-role'
    );
    raise exception 'ADMIN unexpectedly projected to Chatwoot administrator';
  exception
    when others then
      if sqlerrm not like 'non-OWNER Smart role must project to Chatwoot agent%' then
        raise;
      end if;
  end;

  begin
    insert into public.chatwoot_account_memberships(
      organization_id, tenant_business_id, smart_user_id,
      chatwoot_user_mapping_id, chatwoot_account_mapping_id,
      effective_smart_role, chatwoot_role, status, version, last_request_key
    ) values (
      '00000000-0000-0000-0000-00000000e101',
      '20000000-0000-0000-0000-00000000e101',
      '00000000-0000-0000-0000-00000000d103',
      '70000000-0000-0000-0000-00000000e103',
      (select value::uuid from slice_b_state where key='account_mapping_id'),
      'VIEWER',
      'agent',
      'PROVISIONING',
      1,
      'slice-b-viewer-membership'
    );
    raise exception 'VIEWER unexpectedly received Chatwoot membership';
  exception
    when check_violation then null;
  end;
end;
$$;

insert into public.chatwoot_account_memberships(
  id, organization_id, tenant_business_id, smart_user_id,
  chatwoot_user_mapping_id, chatwoot_account_mapping_id,
  effective_smart_role, chatwoot_role,
  status, version, last_request_key, created_by_user_id, updated_by_user_id
) values (
  '80000000-0000-0000-0000-00000000e102',
  '00000000-0000-0000-0000-00000000e101',
  '20000000-0000-0000-0000-00000000e101',
  '00000000-0000-0000-0000-00000000d102',
  '70000000-0000-0000-0000-00000000e102',
  :'account_mapping_id'::uuid,
  'ADMIN',
  'agent',
  'PROVISIONING',
  1,
  'slice-b-admin-membership-create',
  '00000000-0000-0000-0000-00000000d101',
  '00000000-0000-0000-0000-00000000d101'
);

update public.chatwoot_account_memberships
set chatwoot_account_user_id=5000000002, status='ACTIVE', version=2,
    last_request_key='slice-b-admin-membership-active',
    last_verified_at=now(),
    updated_by_user_id='00000000-0000-0000-0000-00000000d101'
where id='80000000-0000-0000-0000-00000000e102';

do $$
begin
  begin
    update public.chatwoot_user_mappings
    set status='PROVISIONING',
        version=3,
        last_request_key='slice-b-user-invalid-backward-state',
        updated_by_user_id='00000000-0000-0000-0000-00000000d101'
    where id='70000000-0000-0000-0000-00000000e101';
    raise exception 'ACTIVE Chatwoot User mapping unexpectedly returned to PROVISIONING';
  exception
    when others then
      if sqlerrm not like 'invalid Chatwoot User mapping transition%' then
        raise;
      end if;
  end;

  begin
    update public.chatwoot_user_mappings
    set status='ARCHIVED',
        version=3,
        last_request_key='slice-b-user-archive-with-live-membership',
        updated_by_user_id='00000000-0000-0000-0000-00000000d101'
    where id='70000000-0000-0000-0000-00000000e101';
    raise exception 'User mapping with live Account membership unexpectedly archived';
  exception
    when others then
      if sqlerrm not like 'archive Chatwoot Account memberships before User mapping%' then
        raise;
      end if;
  end;
end;
$$;

insert into public.chatwoot_inbox_mappings(
  id, organization_id, tenant_business_id, branch_id,
  communication_channel_binding_id, chatwoot_account_mapping_id,
  status, version, last_request_key, created_by_user_id, updated_by_user_id
) values (
  '90000000-0000-0000-0000-00000000e101',
  '00000000-0000-0000-0000-00000000e101',
  '20000000-0000-0000-0000-00000000e101',
  '30000000-0000-0000-0000-00000000e101',
  :'binding_id'::uuid,
  :'account_mapping_id'::uuid,
  'PROVISIONING',
  1,
  'slice-b-inbox-create',
  '00000000-0000-0000-0000-00000000d101',
  '00000000-0000-0000-0000-00000000d101'
);

do $$
begin
  begin
    update public.chatwoot_inbox_mappings
    set webhook_secret_ref='this-is-a-plaintext-secret',
        version=2,
        last_request_key='slice-b-inbox-plaintext-secret'
    where id='90000000-0000-0000-0000-00000000e101';
    raise exception 'plaintext Inbox secret unexpectedly accepted as secret reference';
  exception
    when check_violation then null;
  end;
end;
$$;

update public.chatwoot_inbox_mappings
set chatwoot_inbox_id=201,
    chatwoot_channel_identifier='synthetic-channel-identifier',
    webhook_secret_ref='secretref://chatwoot/slice-b/webhook',
    hmac_token_ref='secretref://chatwoot/slice-b/hmac',
    status='ACTIVE',
    version=2,
    last_request_key='slice-b-inbox-active',
    last_verified_at=now(),
    updated_by_user_id='00000000-0000-0000-0000-00000000d101'
where id='90000000-0000-0000-0000-00000000e101';

insert into public.chatwoot_team_mappings(
  id, organization_id, tenant_business_id, smart_team_id,
  chatwoot_account_mapping_id, projected_name,
  status, version, last_request_key, created_by_user_id, updated_by_user_id
) values (
  'a0000000-0000-0000-0000-00000000e101',
  '00000000-0000-0000-0000-00000000e101',
  '20000000-0000-0000-0000-00000000e101',
  '50000000-0000-0000-0000-00000000e101',
  :'account_mapping_id'::uuid,
  'HQ / SALES / CLOSE — Closer Team',
  'PROVISIONING',
  1,
  'slice-b-team-create',
  '00000000-0000-0000-0000-00000000d101',
  '00000000-0000-0000-0000-00000000d101'
);

update public.chatwoot_team_mappings
set chatwoot_team_id=5000000003,
    status='ACTIVE',
    version=2,
    last_request_key='slice-b-team-active',
    last_verified_at=now(),
    updated_by_user_id='00000000-0000-0000-0000-00000000d101'
where id='a0000000-0000-0000-0000-00000000e101';

do $$
begin
  if (select projected_name from public.chatwoot_team_mappings where id='a0000000-0000-0000-0000-00000000e101')
     <> 'hq / sales / close — closer team'
  then
    raise exception 'Chatwoot Team projected name did not mirror upstream normalization';
  end if;

  if not exists (
    select 1 from public.chatwoot_account_memberships
    where id='80000000-0000-0000-0000-00000000e101'
      and chatwoot_account_user_id=5000000001
      and chatwoot_role='administrator'
      and status='ACTIVE'
  ) then
    raise exception 'OWNER AccountUser bigint projection invalid';
  end if;

  if not exists (
    select 1 from public.chatwoot_inbox_mappings
    where id='90000000-0000-0000-0000-00000000e101'
      and chatwoot_inbox_id=201
      and channel_type='Channel::Api'
      and status='ACTIVE'
  ) then
    raise exception 'API Inbox projection invalid';
  end if;

  if exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000e101'
      and entity_type='chatwoot_inbox_mappings'
      and (
        coalesce(before_data::text,'') ilike '%secretref://%'
        or coalesce(after_data::text,'') ilike '%secretref://%'
        or coalesce(before_data::text,'') ilike '%webhook_secret_ref%'
        or coalesce(after_data::text,'') ilike '%hmac_token_ref%'
      )
  ) then
    raise exception 'Chatwoot Inbox audit exposed secret reference material';
  end if;
end;
$$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d101', false);

do $$
declare
  v_account_mapping_id uuid := (select value::uuid from slice_b_state where key='account_mapping_id');
  v_binding_id uuid := (select value::uuid from slice_b_state where key='binding_id');
begin
  begin
    perform public.set_chatwoot_account_mapping_state(
      '00000000-0000-0000-0000-00000000e101',
      v_account_mapping_id,
      2,
      'ARCHIVED',
      301,
      null,
      'slice-b-account-archive-with-live-children'
    );
    raise exception 'Account mapping with live Slice B children unexpectedly archived';
  exception
    when others then
      if sqlerrm not like 'archive Chatwoot child projections before Account mapping%' then
        raise;
      end if;
  end;

  begin
    perform public.set_communication_channel_binding_lifecycle(
      '00000000-0000-0000-0000-00000000e101',
      v_binding_id,
      1,
      'ARCHIVED',
      'slice-b-binding-archive-with-live-inbox'
    );
    raise exception 'communication binding with live Inbox mapping unexpectedly archived';
  exception
    when others then
      if sqlerrm not like 'archive Chatwoot Inbox mapping before communication binding%' then
        raise;
      end if;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d101', false);
set role authenticated;

do $$
begin
  begin
    delete from public.organization_members
    where organization_id='00000000-0000-0000-0000-00000000e101'
      and user_id='00000000-0000-0000-0000-00000000d102';
    raise exception 'Organization member with live Chatwoot membership unexpectedly removed';
  exception
    when others then
      if sqlerrm not like 'archive Chatwoot Account membership before removing Organization member%' then
        raise;
      end if;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
set role service_role;

do $$
begin
  begin
    update public.teams set status='ARCHIVED'
    where id='50000000-0000-0000-0000-00000000e101';
    raise exception 'Smart Team with live Chatwoot Team mapping unexpectedly archived';
  exception
    when others then
      if sqlerrm not like 'archive Chatwoot Team mapping before Smart Team%' then
        raise;
      end if;
  end;

  begin
    update public.departments set status='ARCHIVED'
    where id='40000000-0000-0000-0000-00000000e101';
    raise exception 'Department with live Chatwoot Team projection unexpectedly archived';
  exception
    when others then
      if sqlerrm not like 'archive Chatwoot Team projections before Department%' then
        raise;
      end if;
  end;

  begin
    update public.branches set status='ARCHIVED'
    where id='30000000-0000-0000-0000-00000000e101';
    raise exception 'Branch with live Chatwoot projections unexpectedly archived';
  exception
    when others then
      if sqlerrm not like 'archive Chatwoot Branch projections before Branch%' then
        raise;
      end if;
  end;
end;
$$;

reset role;

do $$
begin
  if has_table_privilege('authenticated','public.chatwoot_user_mappings','SELECT')
     or has_table_privilege('authenticated','public.chatwoot_account_memberships','SELECT')
     or has_table_privilege('authenticated','public.chatwoot_inbox_mappings','SELECT')
     or has_table_privilege('authenticated','public.chatwoot_team_mappings','SELECT')
  then
    raise exception 'Slice B mapping tables unexpectedly exposed to authenticated Data API';
  end if;

  if not has_table_privilege('service_role','public.chatwoot_user_mappings','SELECT')
     or not has_table_privilege('service_role','public.chatwoot_user_mappings','INSERT')
     or not has_table_privilege('service_role','public.chatwoot_user_mappings','UPDATE')
     or has_table_privilege('service_role','public.chatwoot_user_mappings','DELETE')
  then
    raise exception 'Slice B service-role grants do not match server-only contract';
  end if;
end;
$$;

rollback;
