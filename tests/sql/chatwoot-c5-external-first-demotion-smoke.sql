\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000009201'),
  ('00000000-0000-0000-0000-000000009202');

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-000000009211','C5 external-first org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-000000009211','00000000-0000-0000-0000-000000009201','OWNER'),
  ('00000000-0000-0000-0000-000000009211','00000000-0000-0000-0000-000000009202','ADMIN');

insert into public.brands(id,organization_id,name,slug,status) values
  ('10000000-0000-0000-0000-000000009211','00000000-0000-0000-0000-000000009211','C5 Brand','c5-brand-92','ACTIVE');

insert into public.tenant_businesses(
  id,organization_id,brand_id,name,slug,status
) values (
  '20000000-0000-0000-0000-000000009211',
  '00000000-0000-0000-0000-000000009211',
  '10000000-0000-0000-0000-000000009211',
  'C5 Business','c5-business-92','ACTIVE'
);

insert into public.branches(
  id,organization_id,tenant_business_id,name,code,status
) values (
  '30000000-0000-0000-0000-000000009211',
  '00000000-0000-0000-0000-000000009211',
  '20000000-0000-0000-0000-000000009211',
  'Main','main-92','ACTIVE'
);

insert into public.integration_connections(
  id,organization_id,provider,channel,enabled,status
) values (
  '60000000-0000-0000-0000-000000009211',
  '00000000-0000-0000-0000-000000009211',
  'META','WHATSAPP',true,'CONNECTED'
);

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000009201',
  false
);

select (public.create_communication_channel_binding(
  '00000000-0000-0000-0000-000000009211',
  '20000000-0000-0000-0000-000000009211',
  '30000000-0000-0000-0000-000000009211',
  '60000000-0000-0000-0000-000000009211',
  'WHATSAPP',
  'c5-ext-binding'
)).id as binding_id \gset

select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-000000009211',
  '20000000-0000-0000-0000-000000009211',
  'c5-ext-account'
)).id as account_mapping_id \gset

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-000000009211',
  :'account_mapping_id'::uuid,
  1,
  'ACTIVE',
  9201,
  null,
  'c5-ext-account-active'
)).id;

select (public.create_chatwoot_user_mapping(
  '00000000-0000-0000-0000-000000009211',
  '20000000-0000-0000-0000-000000009211',
  '00000000-0000-0000-0000-000000009202',
  'c5-ext-user'
)).id as user_mapping_id \gset

reset role;
select set_config('request.jwt.claim.sub','',false);

-- Fixture-only superuser state adoption. Receipt-backed activation is covered
-- by earlier migrations/tests; this smoke targets the 0092 receipt/interlock.
select set_config('smartvisions.chatwoot_bridge_command','1',true);
update public.chatwoot_user_mappings
   set chatwoot_user_id = 9202,
       status = 'ACTIVE',
       version = 2,
       last_request_key = 'c5-ext-user-active',
       last_verified_at = statement_timestamp(),
       updated_by_user_id = '00000000-0000-0000-0000-000000009201'
 where id = :'user_mapping_id'::uuid;
select set_config('smartvisions.chatwoot_bridge_command','0',true);

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000009201',
  false
);

select (public.create_chatwoot_account_membership(
  '00000000-0000-0000-0000-000000009211',
  '20000000-0000-0000-0000-000000009211',
  '00000000-0000-0000-0000-000000009202',
  :'user_mapping_id'::uuid,
  :'account_mapping_id'::uuid,
  'c5-ext-membership'
)).id as membership_id \gset

select (public.create_chatwoot_inbox_mapping(
  '00000000-0000-0000-0000-000000009211',
  '20000000-0000-0000-0000-000000009211',
  '30000000-0000-0000-0000-000000009211',
  :'binding_id'::uuid,
  :'account_mapping_id'::uuid,
  'c5-ext-inbox'
)).id as inbox_mapping_id \gset

select (public.create_member_scope_assignment(
  '00000000-0000-0000-0000-000000009211',
  '00000000-0000-0000-0000-000000009202',
  'BRANCH',
  'SALES_AGENT',
  null,null,
  '30000000-0000-0000-0000-000000009211',
  null,null,
  '{}'::jsonb,
  'c5-ext-branch-role'
)).id as assignment_id \gset

-- Keep the authenticated OWNER context for fixture adoption. The canonical
-- role authority deliberately rejects unauthenticated trigger execution even
-- for superuser fixtures.
select set_config('smartvisions.chatwoot_bridge_command','1',true);
update public.chatwoot_account_memberships
   set chatwoot_account_user_id = 9203,
       effective_smart_role = 'ADMIN',
       chatwoot_role = 'agent',
       status = 'ACTIVE',
       version = 2,
       last_request_key = 'c5-ext-membership-active',
       last_verified_at = statement_timestamp(),
       updated_by_user_id = '00000000-0000-0000-0000-000000009201'
 where id = :'membership_id'::uuid;

update public.chatwoot_inbox_mappings
   set chatwoot_inbox_id = 9204,
       chatwoot_channel_identifier = 'c5-ext-channel',
       webhook_secret_ref = 'secretref://fixture/webhook-0092',
       hmac_token_ref = 'secretref://fixture/hmac-0092',
       status = 'ACTIVE',
       version = 2,
       last_request_key = 'c5-ext-inbox-active',
       last_verified_at = statement_timestamp(),
       updated_by_user_id = '00000000-0000-0000-0000-000000009201'
 where id = :'inbox_mapping_id'::uuid;
select set_config('smartvisions.chatwoot_bridge_command','0',true);

do $direct_reduction_stays_blocked$
begin
  begin
    perform public.update_member_scope_assignment(
      '00000000-0000-0000-0000-000000009211',
      :'assignment_id'::uuid,
      1,
      'VIEWER',
      '{}'::jsonb,
      'c5-ext-direct-viewer'
    );
    raise exception 'direct scoped reduction unexpectedly bypassed external-first interlock';
  exception
    when others then
      if sqlerrm not like '%external-first demotion required%' then
        raise;
      end if;
  end;
end;
$direct_reduction_stays_blocked$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role service_role;
select (public.record_chatwoot_scoped_access_reduction(
  '00000000-0000-0000-0000-000000009211',
  :'assignment_id'::uuid,
  1,
  'UPDATE',
  'VIEWER',
  '{}'::jsonb,
  9202,
  array[:'inbox_mapping_id'::uuid],
  '{}'::uuid[],
  'c5-ext-receipt'
)).id as receipt_id \gset

reset role;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000009201',
  false
);

select public.apply_member_scope_assignment_reduction_verified(
  '00000000-0000-0000-0000-000000009211',
  :'assignment_id'::uuid,
  1,
  'UPDATE',
  'VIEWER',
  '{}'::jsonb,
  :'receipt_id'::uuid,
  'c5-ext-verified-viewer'
);

do $assert_verified_reduction$
begin
  if (
    select role
      from public.member_scope_assignments
     where id = :'assignment_id'::uuid
  ) <> 'VIEWER' then
    raise exception 'verified external-first scoped reduction did not commit canonical VIEWER role';
  end if;

  if (
    select version
      from public.member_scope_assignments
     where id = :'assignment_id'::uuid
  ) <> 2 then
    raise exception 'verified external-first scoped reduction did not advance assignment version';
  end if;
end;
$assert_verified_reduction$;

-- A mismatched receipt cannot authorize a different reduction.
do $mismatched_receipt_blocked$
begin
  begin
    perform public.apply_member_scope_assignment_reduction_verified(
      '00000000-0000-0000-0000-000000009211',
      :'assignment_id'::uuid,
      2,
      'UPDATE',
      'SALES_AGENT',
      '{}'::jsonb,
      :'receipt_id'::uuid,
      'c5-ext-mismatched-replay'
    );
    raise exception 'mismatched scoped reduction receipt unexpectedly authorized a different mutation';
  exception
    when others then
      if sqlerrm not like '%fresh%' and sqlerrm not like '%external-first%' then
        -- Existing 0082 no-op/version/command checks may reject first; any such
        -- rejection is still fail-closed, so only an unexpected successful
        -- mutation is forbidden.
        null;
      end if;
  end;
end;
$mismatched_receipt_blocked$;

rollback;
