\set ON_ERROR_STOP on

begin;

create temp table bridge_test_state (
  key text primary key,
  value text not null
) on commit drop;

grant select, insert, update on bridge_test_state to authenticated, service_role;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000b101'),
  ('00000000-0000-0000-0000-00000000b102'),
  ('00000000-0000-0000-0000-00000000b103'),
  ('00000000-0000-0000-0000-00000000b104');

insert into public.organizations(id, name) values
  ('00000000-0000-0000-0000-00000000c101', 'Bridge Org A'),
  ('00000000-0000-0000-0000-00000000c102', 'Bridge Org B');

insert into public.organization_members(organization_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000b101', 'OWNER'),
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000b102', 'ADMIN'),
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000b103', 'SALES_AGENT'),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000b101', 'OWNER'),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000b104', 'OWNER');

insert into public.brands(id, organization_id, name, slug) values
  ('10000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c101', 'Bridge Brand A', 'bridge-brand-a'),
  ('10000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000c102', 'Bridge Brand B', 'bridge-brand-b');

insert into public.tenant_businesses(id, organization_id, brand_id, name, slug) values
  ('20000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c101', '10000000-0000-0000-0000-00000000c101', 'Bridge Business A', 'bridge-business-a'),
  ('20000000-0000-0000-0000-00000000c111', '00000000-0000-0000-0000-00000000c101', '10000000-0000-0000-0000-00000000c101', 'Bridge Business A2', 'bridge-business-a2'),
  ('20000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000c102', '10000000-0000-0000-0000-00000000c102', 'Bridge Business B', 'bridge-business-b');

insert into public.branches(id, organization_id, tenant_business_id, name, code) values
  ('30000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c101', '20000000-0000-0000-0000-00000000c101', 'Bridge Branch A', 'A'),
  ('30000000-0000-0000-0000-00000000c111', '00000000-0000-0000-0000-00000000c101', '20000000-0000-0000-0000-00000000c111', 'Bridge Branch A2', 'A2');

insert into public.integration_connections(
  id, organization_id, provider, channel, enabled, status
) values
  ('40000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c101', 'EMAIL_PROVIDER', 'EMAIL', true, 'CONNECTED'),
  ('40000000-0000-0000-0000-00000000c111', '00000000-0000-0000-0000-00000000c101', 'META', 'WHATSAPP', true, 'CONNECTED'),
  ('40000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000c102', 'EMAIL_PROVIDER', 'EMAIL', true, 'CONNECTED');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b101', false);

insert into bridge_test_state(key, value)
select 'binding_id', (public.create_communication_channel_binding(
  '00000000-0000-0000-0000-00000000c101',
  '20000000-0000-0000-0000-00000000c101',
  '30000000-0000-0000-0000-00000000c101',
  '40000000-0000-0000-0000-00000000c101',
  'EMAIL',
  'bridge-binding-create-1'
)).id::text;

do $$
declare
  v_binding_id uuid := (select value::uuid from bridge_test_state where key='binding_id');
  v_replay_id uuid;
begin
  if not exists (
    select 1 from public.communication_channel_bindings
    where id = v_binding_id
      and status = 'ACTIVE'
      and version = 1
      and channel = 'EMAIL'
      and last_verified_at is null
  ) then
    raise exception 'communication binding create failed';
  end if;

  select (public.create_communication_channel_binding(
    '00000000-0000-0000-0000-00000000c101',
    '20000000-0000-0000-0000-00000000c101',
    '30000000-0000-0000-0000-00000000c101',
    '40000000-0000-0000-0000-00000000c101',
    'EMAIL',
    'bridge-binding-create-1'
  )).id into v_replay_id;

  if v_replay_id <> v_binding_id then
    raise exception 'binding request-key replay did not return same row';
  end if;

  if (select count(*) from public.communication_channel_bindings
      where organization_id='00000000-0000-0000-0000-00000000c101') <> 1 then
    raise exception 'binding replay created duplicate row';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.communication_channel_bindings(
      organization_id, tenant_business_id, integration_connection_id,
      channel, last_request_key, created_by_user_id, updated_by_user_id
    ) values (
      '00000000-0000-0000-0000-00000000c101',
      '20000000-0000-0000-0000-00000000c101',
      '40000000-0000-0000-0000-00000000c111',
      'WHATSAPP',
      'forbidden-direct-binding',
      '00000000-0000-0000-0000-00000000b101',
      '00000000-0000-0000-0000-00000000b101'
    );
    raise exception 'direct binding insert unexpectedly bypassed command guard';
  exception
    when others then
      if sqlerrm not like 'Chatwoot bridge mutations must use the governed command RPC%' then
        raise;
      end if;
  end;
end;
$$;

do $$
begin
  begin
    perform public.create_communication_channel_binding(
      '00000000-0000-0000-0000-00000000c101',
      '20000000-0000-0000-0000-00000000c111',
      null,
      '40000000-0000-0000-0000-00000000c101',
      'EMAIL',
      'bridge-binding-duplicate-lane'
    );
    raise exception 'same active provider lane bound to two tenant Businesses';
  exception
    when unique_violation then null;
  end;
end;
$$;

do $$
begin
  begin
    perform public.create_communication_channel_binding(
      '00000000-0000-0000-0000-00000000c101',
      '20000000-0000-0000-0000-00000000c102',
      null,
      '40000000-0000-0000-0000-00000000c101',
      'EMAIL',
      'bridge-cross-tenant-business'
    );
    raise exception 'cross-tenant Business binding unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like 'tenant Business not found for communication binding%' then
        raise;
      end if;
  end;
end;
$$;

do $$
begin
  begin
    perform public.create_communication_channel_binding(
      '00000000-0000-0000-0000-00000000c101',
      '20000000-0000-0000-0000-00000000c101',
      '30000000-0000-0000-0000-00000000c111',
      '40000000-0000-0000-0000-00000000c111',
      'WHATSAPP',
      'bridge-wrong-branch'
    );
    raise exception 'cross-Business Branch binding unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like 'communication binding Branch does not match tenant Business%' then
        raise;
      end if;
  end;
end;
$$;

insert into bridge_test_state(key, value)
select 'mapping_id', (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000c101',
  '20000000-0000-0000-0000-00000000c101',
  'bridge-account-create-1'
)).id::text;

do $$
declare
  v_mapping_id uuid := (select value::uuid from bridge_test_state where key='mapping_id');
  v_replay_id uuid;
  v_version integer;
begin
  select (public.create_chatwoot_account_mapping(
    '00000000-0000-0000-0000-00000000c101',
    '20000000-0000-0000-0000-00000000c101',
    'bridge-account-create-1'
  )).id into v_replay_id;

  if v_mapping_id <> v_replay_id then
    raise exception 'account mapping request-key replay did not return same row';
  end if;

  select (public.set_chatwoot_account_mapping_state(
    '00000000-0000-0000-0000-00000000c101',
    v_mapping_id,
    1,
    'ACTIVE',
    101,
    null,
    'bridge-account-active-1'
  )).version into v_version;

  if v_version <> 2 then
    raise exception 'account mapping ACTIVE transition did not increment version';
  end if;

  if not exists (
    select 1 from public.chatwoot_account_mappings
    where id=v_mapping_id
      and status='ACTIVE'
      and chatwoot_account_id=101
      and last_verified_at is not null
      and last_error_code is null
  ) then
    raise exception 'account mapping ACTIVE state evidence invalid';
  end if;

  select (public.set_chatwoot_account_mapping_state(
    '00000000-0000-0000-0000-00000000c101',
    v_mapping_id,
    1,
    'ACTIVE',
    101,
    null,
    'bridge-account-active-1'
  )).version into v_version;

  if v_version <> 2 then
    raise exception 'account state replay did not return current logical result';
  end if;

  begin
    perform public.set_chatwoot_account_mapping_state(
      '00000000-0000-0000-0000-00000000c101',
      v_mapping_id,
      2,
      'ACTIVE',
      102,
      null,
      'bridge-account-replace-id'
    );
    raise exception 'external Chatwoot Account ID replacement unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like 'Chatwoot Account ID cannot be replaced in-place%' then
        raise;
      end if;
  end;

  perform public.set_chatwoot_account_mapping_state(
    '00000000-0000-0000-0000-00000000c101',
    v_mapping_id,
    2,
    'DEGRADED',
    101,
    'UPSTREAM_TIMEOUT',
    'bridge-account-degraded-1'
  );

  perform public.set_chatwoot_account_mapping_state(
    '00000000-0000-0000-0000-00000000c101',
    v_mapping_id,
    3,
    'ACTIVE',
    101,
    null,
    'bridge-account-recovered-1'
  );

  perform public.set_chatwoot_account_mapping_state(
    '00000000-0000-0000-0000-00000000c101',
    v_mapping_id,
    4,
    'ARCHIVED',
    101,
    null,
    'bridge-account-archive-1'
  );

  begin
    perform public.set_chatwoot_account_mapping_state(
      '00000000-0000-0000-0000-00000000c101',
      v_mapping_id,
      5,
      'ACTIVE',
      101,
      null,
      'bridge-account-reactivate-forbidden'
    );
    raise exception 'ARCHIVED Chatwoot Account mapping unexpectedly reactivated';
  exception
    when others then
      if sqlerrm not like 'ARCHIVED Chatwoot Account mapping is terminal%' then
        raise;
      end if;
  end;
end;
$$;

do $$
declare
  v_mapping_id uuid := (select value::uuid from bridge_test_state where key='mapping_id');
  v_replay public.chatwoot_account_mappings%rowtype;
begin
  select * into v_replay
  from public.create_chatwoot_account_mapping(
    '00000000-0000-0000-0000-00000000c101',
    '20000000-0000-0000-0000-00000000c101',
    'bridge-account-create-1'
  );

  if v_replay.id <> v_mapping_id
     or v_replay.status <> 'ARCHIVED'
     or v_replay.version <> 5
  then
    raise exception 'old Account create request key did not replay current archived entity';
  end if;

  if (select count(*) from public.chatwoot_account_mappings
      where organization_id='00000000-0000-0000-0000-00000000c101') <> 1 then
    raise exception 'old Account create replay created a replacement mapping';
  end if;
end;
$$;

do $$
declare
  v_binding_id uuid := (select value::uuid from bridge_test_state where key='binding_id');
  v_version integer;
begin
  select (public.set_communication_channel_binding_lifecycle(
    '00000000-0000-0000-0000-00000000c101',
    v_binding_id,
    1,
    'ARCHIVED',
    'bridge-binding-archive-1'
  )).version into v_version;

  if v_version <> 2 then
    raise exception 'binding archive did not increment version';
  end if;

  begin
    perform public.set_communication_channel_binding_lifecycle(
      '00000000-0000-0000-0000-00000000c101',
      v_binding_id,
      1,
      'ACTIVE',
      'bridge-binding-stale-version'
    );
    raise exception 'stale binding version unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like 'communication binding version conflict%' then
        raise;
      end if;
  end;

  perform public.set_communication_channel_binding_lifecycle(
    '00000000-0000-0000-0000-00000000c101',
    v_binding_id,
    2,
    'ACTIVE',
    'bridge-binding-reactivate-1'
  );
end;
$$;

do $$
declare
  v_binding_id uuid := (select value::uuid from bridge_test_state where key='binding_id');
  v_replay public.communication_channel_bindings%rowtype;
begin
  select * into v_replay
  from public.create_communication_channel_binding(
    '00000000-0000-0000-0000-00000000c101',
    '20000000-0000-0000-0000-00000000c101',
    '30000000-0000-0000-0000-00000000c101',
    '40000000-0000-0000-0000-00000000c101',
    'EMAIL',
    'bridge-binding-create-1'
  );

  if v_replay.id <> v_binding_id or v_replay.version <> 3 or v_replay.status <> 'ACTIVE' then
    raise exception 'old binding create request key did not replay current entity';
  end if;

  if (select count(*) from public.communication_channel_bindings
      where organization_id='00000000-0000-0000-0000-00000000c101') <> 1 then
    raise exception 'old binding create replay created duplicate binding';
  end if;

  begin
    perform public.create_communication_channel_binding(
      '00000000-0000-0000-0000-00000000c101',
      '20000000-0000-0000-0000-00000000c111',
      null,
      '40000000-0000-0000-0000-00000000c111',
      'WHATSAPP',
      'bridge-binding-create-1'
    );
    raise exception 'same request key with changed payload unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like 'request key already used with different Chatwoot bridge payload%' then
        raise;
      end if;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.chatwoot_bridge_command_claims(
      organization_id,
      request_key,
      command_type,
      entity_type,
      entity_id,
      applied_version,
      payload_hash,
      created_by_user_id
    ) values (
      '00000000-0000-0000-0000-00000000c101',
      'forbidden-direct-claim',
      'CREATE_ACCOUNT_MAPPING',
      'CHATWOOT_ACCOUNT_MAPPING',
      gen_random_uuid(),
      1,
      encode(extensions.digest('{}', 'sha256'), 'hex'),
      '00000000-0000-0000-0000-00000000b101'
    );
    raise exception 'direct command claim insert unexpectedly bypassed governed context';
  exception
    when others then
      if sqlerrm not like 'Chatwoot bridge command claim requires governed command context%' then
        raise;
      end if;
  end;
end;
$$;

do $$
begin
  if (select count(*)
      from public.chatwoot_bridge_command_claims
      where organization_id='00000000-0000-0000-0000-00000000c101') <> 8 then
    raise exception 'unexpected durable Chatwoot bridge command claim count';
  end if;

  if exists (
    select 1
    from public.chatwoot_bridge_command_claims
    where organization_id='00000000-0000-0000-0000-00000000c101'
      and request_key in (
        'bridge-binding-duplicate-lane',
        'bridge-cross-tenant-business',
        'bridge-wrong-branch',
        'bridge-account-replace-id',
        'bridge-account-reactivate-forbidden',
        'bridge-binding-stale-version',
        'bridge-account-archived-mutate-forbidden',
        'forbidden-direct-claim'
      )
  ) then
    raise exception 'failed Chatwoot bridge command left orphan idempotency claim';
  end if;
end;
$$;

do $$
begin
  begin
    update public.branches
       set status='ARCHIVED'
     where id='30000000-0000-0000-0000-00000000c101';
    raise exception 'Branch with ACTIVE communication binding unexpectedly archived';
  exception
    when others then
      if sqlerrm not like 'archive communication binding before Branch%' then
        raise;
      end if;
  end;

  begin
    update public.tenant_businesses
       set status='ARCHIVED'
     where id='20000000-0000-0000-0000-00000000c101';
    raise exception 'tenant Business with ACTIVE communication binding unexpectedly archived';
  exception
    when others then
      if sqlerrm not like 'archive Chatwoot bridge resources before tenant Business%' then
        raise;
      end if;
  end;
end;
$$;

do $$
declare
  v_mapping_id uuid := (select value::uuid from bridge_test_state where key='mapping_id');
begin
  begin
    perform public.set_chatwoot_account_mapping_state(
      '00000000-0000-0000-0000-00000000c101',
      v_mapping_id,
      5,
      'ARCHIVED',
      101,
      null,
      'bridge-account-archived-mutate-forbidden'
    );
    raise exception 'ARCHIVED mapping unexpectedly accepted another mutation';
  exception
    when others then
      if sqlerrm not like 'ARCHIVED Chatwoot Account mapping is terminal%' then
        raise;
      end if;
  end;
end;
$$;

do $$
declare
  v_binding_id uuid := (select value::uuid from bridge_test_state where key='binding_id');
  v_mapping_id uuid := (select value::uuid from bridge_test_state where key='mapping_id');
begin
  if not exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000c101'
      and action='COMMUNICATION_CHANNEL_BINDING_CREATED'
      and entity_id=v_binding_id::text
      and tenant_business_id='20000000-0000-0000-0000-00000000c101'
  ) then
    raise exception 'communication binding audit event missing';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000c101'
      and action='CHATWOOT_ACCOUNT_MAPPING_ACTIVATED'
      and entity_id=v_mapping_id::text
      and after_data->>'chatwoot_account_id'='101'
  ) then
    raise exception 'Chatwoot Account activation audit event missing';
  end if;

  if exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000c101'
      and (
        after_data::text ilike '%token%'
        or after_data::text ilike '%secret%'
        or after_data::text ilike '%message_body%'
      )
  ) then
    raise exception 'Chatwoot bridge audit copied sensitive payload data';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b102', false);

do $$
begin
  if (select count(*) from public.communication_channel_bindings
      where organization_id='00000000-0000-0000-0000-00000000c101') = 0 then
    raise exception 'ADMIN cannot read bridge mappings';
  end if;

  begin
    perform public.create_chatwoot_account_mapping(
      '00000000-0000-0000-0000-00000000c101',
      '20000000-0000-0000-0000-00000000c111',
      'admin-forbidden-account-create'
    );
    raise exception 'ADMIN unexpectedly mutated owner-only bridge contract';
  exception
    when others then
      if sqlerrm not like 'Chatwoot bridge mutation not permitted%' then
        raise;
      end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b103', false);

do $$
begin
  if exists (
    select 1 from public.communication_channel_bindings
    where organization_id='00000000-0000-0000-0000-00000000c101'
  ) then
    raise exception 'SALES_AGENT unexpectedly read bridge infrastructure mappings';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

do $$
begin
  if has_table_privilege('authenticated', 'public.communication_channel_bindings', 'DELETE')
     or has_table_privilege('authenticated', 'public.chatwoot_account_mappings', 'DELETE')
     or has_table_privilege('authenticated', 'public.chatwoot_bridge_command_claims', 'UPDATE')
     or has_table_privilege('authenticated', 'public.chatwoot_bridge_command_claims', 'DELETE')
     or has_table_privilege('service_role', 'public.communication_channel_bindings', 'INSERT')
     or has_table_privilege('service_role', 'public.chatwoot_account_mappings', 'UPDATE')
     or has_table_privilege('service_role', 'public.chatwoot_bridge_command_claims', 'INSERT')
  then
    raise exception 'Chatwoot bridge table grants are broader than Slice A contract';
  end if;

  if not has_table_privilege('authenticated', 'public.communication_channel_bindings', 'SELECT')
     or not has_table_privilege('authenticated', 'public.chatwoot_account_mappings', 'SELECT')
     or not has_table_privilege('authenticated', 'public.chatwoot_bridge_command_claims', 'SELECT')
     or not has_table_privilege('authenticated', 'public.chatwoot_bridge_command_claims', 'INSERT')
     or not has_table_privilege('service_role', 'public.chatwoot_bridge_command_claims', 'SELECT')
  then
    raise exception 'Chatwoot bridge grants are missing';
  end if;
end;
$$;

rollback;
