\set ON_ERROR_STOP on

begin;

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

select (public.create_communication_channel_binding(
  '00000000-0000-0000-0000-00000000c101',
  '20000000-0000-0000-0000-00000000c101',
  '30000000-0000-0000-0000-00000000c101',
  '40000000-0000-0000-0000-00000000c101',
  'EMAIL',
  'bridge-binding-create-1'
)).id as binding_id \gset

do $$
begin
  if not exists (
    select 1 from public.communication_channel_bindings
    where id = :'binding_id'::uuid
      and status = 'ACTIVE'
      and version = 1
      and channel = 'EMAIL'
  ) then
    raise exception 'communication binding create failed';
  end if;
end;
$$;

select (public.create_communication_channel_binding(
  '00000000-0000-0000-0000-00000000c101',
  '20000000-0000-0000-0000-00000000c101',
  '30000000-0000-0000-0000-00000000c101',
  '40000000-0000-0000-0000-00000000c101',
  'EMAIL',
  'bridge-binding-create-1'
)).id as replay_binding_id \gset

do $$
begin
  if :'replay_binding_id'::uuid <> :'binding_id'::uuid then
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

select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000c101',
  '20000000-0000-0000-0000-00000000c101',
  'bridge-account-create-1'
)).id as mapping_id \gset

select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000c101',
  '20000000-0000-0000-0000-00000000c101',
  'bridge-account-create-1'
)).id as replay_mapping_id \gset

do $$
begin
  if :'mapping_id'::uuid <> :'replay_mapping_id'::uuid then
    raise exception 'account mapping request-key replay did not return same row';
  end if;
end;
$$;

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-00000000c101',
  :'mapping_id'::uuid,
  1,
  'ACTIVE',
  101,
  null,
  'bridge-account-active-1'
)).version as active_version \gset

do $$
begin
  if :'active_version'::integer <> 2 then
    raise exception 'account mapping ACTIVE transition did not increment version';
  end if;

  if not exists (
    select 1 from public.chatwoot_account_mappings
    where id=:'mapping_id'::uuid
      and status='ACTIVE'
      and chatwoot_account_id=101
      and last_verified_at is not null
      and last_error_code is null
  ) then
    raise exception 'account mapping ACTIVE state evidence invalid';
  end if;
end;
$$;

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-00000000c101',
  :'mapping_id'::uuid,
  1,
  'ACTIVE',
  101,
  null,
  'bridge-account-active-1'
)).version as replay_active_version \gset

do $$
begin
  if :'replay_active_version'::integer <> 2 then
    raise exception 'account state replay did not return current logical result';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.set_chatwoot_account_mapping_state(
      '00000000-0000-0000-0000-00000000c101',
      :'mapping_id'::uuid,
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
end;
$$;

perform public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-00000000c101',
  :'mapping_id'::uuid,
  2,
  'DEGRADED',
  101,
  'UPSTREAM_TIMEOUT',
  'bridge-account-degraded-1'
);

perform public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-00000000c101',
  :'mapping_id'::uuid,
  3,
  'ACTIVE',
  101,
  null,
  'bridge-account-recovered-1'
);

perform public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-00000000c101',
  :'mapping_id'::uuid,
  4,
  'ARCHIVED',
  101,
  null,
  'bridge-account-archive-1'
);

do $$
begin
  begin
    perform public.set_chatwoot_account_mapping_state(
      '00000000-0000-0000-0000-00000000c101',
      :'mapping_id'::uuid,
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

select (public.set_communication_channel_binding_lifecycle(
  '00000000-0000-0000-0000-00000000c101',
  :'binding_id'::uuid,
  1,
  'ARCHIVED',
  'bridge-binding-archive-1'
)).version as binding_archived_version \gset

do $$
begin
  begin
    perform public.set_communication_channel_binding_lifecycle(
      '00000000-0000-0000-0000-00000000c101',
      :'binding_id'::uuid,
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
end;
$$;

perform public.set_communication_channel_binding_lifecycle(
  '00000000-0000-0000-0000-00000000c101',
  :'binding_id'::uuid,
  2,
  'ACTIVE',
  'bridge-binding-reactivate-1'
);

do $$
begin
  if not exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000c101'
      and action='COMMUNICATION_CHANNEL_BINDING_CREATED'
      and entity_id=:'binding_id'
      and tenant_business_id='20000000-0000-0000-0000-00000000c101'
  ) then
    raise exception 'communication binding audit event missing';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000c101'
      and action='CHATWOOT_ACCOUNT_MAPPING_ACTIVATED'
      and entity_id=:'mapping_id'
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
     or has_table_privilege('service_role', 'public.communication_channel_bindings', 'INSERT')
     or has_table_privilege('service_role', 'public.chatwoot_account_mappings', 'UPDATE')
  then
    raise exception 'Chatwoot bridge table grants are broader than Slice A contract';
  end if;

  if not has_table_privilege('authenticated', 'public.communication_channel_bindings', 'SELECT')
     or not has_table_privilege('authenticated', 'public.chatwoot_account_mappings', 'SELECT')
  then
    raise exception 'authenticated bridge read grants are missing';
  end if;
end;
$$;

rollback;
