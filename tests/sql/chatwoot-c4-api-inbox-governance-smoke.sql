\set ON_ERROR_STOP on

begin;

create temp table c4_inbox_state (
  key text primary key,
  value text not null
) on commit drop;

grant select, insert, update on c4_inbox_state to authenticated, service_role;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000eb01');

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-00000000fb01','C4 API Inbox org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000fb01','00000000-0000-0000-0000-00000000eb01','OWNER');

insert into public.brands(id,organization_id,name,slug) values
  ('10000000-0000-0000-0000-00000000fb01','00000000-0000-0000-0000-00000000fb01','C4 API Inbox Brand','c4-api-inbox-brand');

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values
  ('20000000-0000-0000-0000-00000000fb01','00000000-0000-0000-0000-00000000fb01','10000000-0000-0000-0000-00000000fb01','C4 API Inbox Business','c4-api-inbox-business');

insert into public.branches(id,organization_id,tenant_business_id,name,code) values
  ('30000000-0000-0000-0000-00000000fb01','00000000-0000-0000-0000-00000000fb01','20000000-0000-0000-0000-00000000fb01','HQ','HQ');

insert into public.integration_connections(
  id,organization_id,provider,channel,enabled,status
) values (
  '60000000-0000-0000-0000-00000000fb01',
  '00000000-0000-0000-0000-00000000fb01',
  'META','WHATSAPP',true,'CONNECTED'
);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000eb01',false);

select (public.create_communication_channel_binding(
  '00000000-0000-0000-0000-00000000fb01',
  '20000000-0000-0000-0000-00000000fb01',
  '30000000-0000-0000-0000-00000000fb01',
  '60000000-0000-0000-0000-00000000fb01',
  'WHATSAPP',
  'c4-inbox-binding-create'
)).id as binding_id \gset

select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000fb01',
  '20000000-0000-0000-0000-00000000fb01',
  'c4-inbox-account-create'
)).id as account_mapping_id \gset

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-00000000fb01',
  :'account_mapping_id'::uuid,
  1,
  'ACTIVE',
  901,
  null,
  'c4-inbox-account-active'
)).id;

select (public.create_chatwoot_inbox_mapping(
  '00000000-0000-0000-0000-00000000fb01',
  '20000000-0000-0000-0000-00000000fb01',
  '30000000-0000-0000-0000-00000000fb01',
  :'binding_id'::uuid,
  :'account_mapping_id'::uuid,
  'c4-inbox-mapping-create'
)).id as inbox_mapping_id \gset

insert into c4_inbox_state(key,value) values
  ('binding_id', :'binding_id'),
  ('account_mapping_id', :'account_mapping_id'),
  ('inbox_mapping_id', :'inbox_mapping_id');

do $direct_authenticated_write_denied$
begin
  begin
    update public.chatwoot_inbox_mappings
    set last_request_key='direct-auth-update',
        version=version+1
    where id=(select value::uuid from c4_inbox_state where key='inbox_mapping_id');
    raise exception 'direct authenticated Inbox mapping mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%governed command%'
       and sqlerrm not like '%row-level security%'
    then
      raise;
    end if;
  end;
end;
$direct_authenticated_write_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

select public.chatwoot_vault_create_secret(
  'c4-inbox-webhook-secret',
  'chatwoot/test/inbox/fb01/webhook-secret',
  'rollback smoke API Inbox webhook secret'
) as webhook_secret_ref \gset

select public.chatwoot_vault_create_secret(
  'c4-inbox-hmac-token',
  'chatwoot/test/inbox/fb01/hmac-token',
  'rollback smoke API Inbox hmac token'
) as hmac_token_ref \gset

select (public.record_chatwoot_inbox_reconciliation(
  '00000000-0000-0000-0000-00000000fb01',
  '20000000-0000-0000-0000-00000000fb01',
  (select value::uuid from c4_inbox_state where key='inbox_mapping_id'),
  1,
  801,
  'api-channel-fb01',
  'https://app.example.com/api/chatwoot/webhook/' ||
    (select value from c4_inbox_state where key='inbox_mapping_id'),
  :'webhook_secret_ref',
  :'hmac_token_ref',
  'c4-inbox-receipt-1'
)).id as receipt_id \gset

insert into c4_inbox_state(key,value) values
  ('receipt_id', :'receipt_id'),
  ('webhook_secret_ref', :'webhook_secret_ref'),
  ('hmac_token_ref', :'hmac_token_ref');

do $receipt_acl$
begin
  if has_table_privilege(
       'authenticated',
       'public.chatwoot_inbox_reconciliation_receipts',
       'SELECT'
     )
     or has_table_privilege(
       'authenticated',
       'public.chatwoot_inbox_reconciliation_receipts',
       'INSERT'
     )
  then
    raise exception 'authenticated unexpectedly has Inbox receipt table access';
  end if;

  if not has_table_privilege(
       'service_role',
       'public.chatwoot_inbox_reconciliation_receipts',
       'SELECT'
     )
     or not has_table_privilege(
       'service_role',
       'public.chatwoot_inbox_reconciliation_receipts',
       'INSERT'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_inbox_reconciliation_receipts',
       'UPDATE'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_inbox_reconciliation_receipts',
       'DELETE'
     )
  then
    raise exception 'service_role Inbox receipt ACL is not append/read only';
  end if;

  if not has_table_privilege(
       'service_role',
       'public.chatwoot_inbox_mappings',
       'SELECT'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_inbox_mappings',
       'INSERT'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_inbox_mappings',
       'UPDATE'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_inbox_mappings',
       'DELETE'
     )
  then
    raise exception 'service_role Inbox mapping privilege is not read-only';
  end if;
end;
$receipt_acl$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000eb01',false);

do $authenticated_receipt_denied$
begin
  begin
    perform public.record_chatwoot_inbox_reconciliation(
      '00000000-0000-0000-0000-00000000fb01',
      '20000000-0000-0000-0000-00000000fb01',
      (select value::uuid from c4_inbox_state where key='inbox_mapping_id'),
      1,
      801,
      'api-channel-fb01',
      'https://app.example.com/api/chatwoot/webhook/' ||
        (select value from c4_inbox_state where key='inbox_mapping_id'),
      (select value from c4_inbox_state where key='webhook_secret_ref'),
      (select value from c4_inbox_state where key='hmac_token_ref'),
      'forged-client-inbox-receipt'
    );
    raise exception 'authenticated unexpectedly minted Inbox reconciliation receipt';
  exception when insufficient_privilege then
    null;
  end;
end;
$authenticated_receipt_denied$;

select (public.activate_chatwoot_inbox_mapping_verified(
  '00000000-0000-0000-0000-00000000fb01',
  '20000000-0000-0000-0000-00000000fb01',
  (select value::uuid from c4_inbox_state where key='inbox_mapping_id'),
  1,
  (select value::uuid from c4_inbox_state where key='receipt_id'),
  'c4-inbox-activate-1'
)).version as active_version \gset

insert into c4_inbox_state(key,value)
values ('active_version', :'active_version');

reset role;
set role service_role;

do $active_mapping_verified$
begin
  if (select value::integer from c4_inbox_state where key='active_version') <> 2 then
    raise exception 'verified Inbox activation did not advance version';
  end if;

  if not exists (
    select 1
    from public.chatwoot_inbox_mappings
    where id=(select value::uuid from c4_inbox_state where key='inbox_mapping_id')
      and status='ACTIVE'
      and version=2
      and chatwoot_inbox_id=801
      and chatwoot_channel_identifier='api-channel-fb01'
      and webhook_secret_ref=(select value from c4_inbox_state where key='webhook_secret_ref')
      and hmac_token_ref=(select value from c4_inbox_state where key='hmac_token_ref')
      and last_verified_at is not null
  ) then
    raise exception 'verified Inbox mapping activation state is invalid';
  end if;

  begin
    update public.chatwoot_inbox_mappings
    set status='DEGRADED'
    where id=(select value::uuid from c4_inbox_state where key='inbox_mapping_id');
    raise exception 'service_role direct Inbox mapping mutation unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$active_mapping_verified$;

-- Same receipt request key with changed external identity fails closed.
do $receipt_request_conflict$
begin
  begin
    perform public.record_chatwoot_inbox_reconciliation(
      '00000000-0000-0000-0000-00000000fb01',
      '20000000-0000-0000-0000-00000000fb01',
      (select value::uuid from c4_inbox_state where key='inbox_mapping_id'),
      2,
      802,
      'api-channel-fb02',
      'https://app.example.com/api/chatwoot/webhook/' ||
        (select value from c4_inbox_state where key='inbox_mapping_id'),
      (select value from c4_inbox_state where key='webhook_secret_ref'),
      (select value from c4_inbox_state where key='hmac_token_ref'),
      'c4-inbox-receipt-1'
    );
    raise exception 'changed Inbox receipt payload unexpectedly reused request key';
  exception when others then
    if sqlerrm not like 'Inbox reconciliation request key already used with different payload%'
       and sqlerrm not like 'Chatwoot Inbox identity drift detected by receipt%'
    then
      raise;
    end if;
  end;
end;
$receipt_request_conflict$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000eb01',false);

do $stale_receipt_denied$
begin
  begin
    perform public.activate_chatwoot_inbox_mapping_verified(
      '00000000-0000-0000-0000-00000000fb01',
      '20000000-0000-0000-0000-00000000fb01',
      (select value::uuid from c4_inbox_state where key='inbox_mapping_id'),
      2,
      (select value::uuid from c4_inbox_state where key='receipt_id'),
      'c4-inbox-stale-receipt'
    );
    raise exception 'stale Inbox receipt unexpectedly activated newer version';
  exception when others then
    if sqlerrm not like 'fresh Chatwoot Inbox reconciliation receipt not found%' then
      raise;
    end if;
  end;
end;
$stale_receipt_denied$;

select (public.mark_chatwoot_inbox_mapping_degraded(
  '00000000-0000-0000-0000-00000000fb01',
  '20000000-0000-0000-0000-00000000fb01',
  (select value::uuid from c4_inbox_state where key='inbox_mapping_id'),
  2,
  'UPSTREAM_UNAVAILABLE',
  'c4-inbox-degraded'
)).version as degraded_version \gset

insert into c4_inbox_state(key,value)
values ('degraded_version', :'degraded_version');

reset role;
set role service_role;

select (public.record_chatwoot_inbox_reconciliation(
  '00000000-0000-0000-0000-00000000fb01',
  '20000000-0000-0000-0000-00000000fb01',
  (select value::uuid from c4_inbox_state where key='inbox_mapping_id'),
  3,
  801,
  'api-channel-fb01',
  'https://app.example.com/api/chatwoot/webhook/' ||
    (select value from c4_inbox_state where key='inbox_mapping_id'),
  (select value from c4_inbox_state where key='webhook_secret_ref'),
  (select value from c4_inbox_state where key='hmac_token_ref'),
  'c4-inbox-receipt-3'
)).id as fresh_receipt_id \gset

insert into c4_inbox_state(key,value)
values ('fresh_receipt_id', :'fresh_receipt_id');

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000eb01',false);

select (public.activate_chatwoot_inbox_mapping_verified(
  '00000000-0000-0000-0000-00000000fb01',
  '20000000-0000-0000-0000-00000000fb01',
  (select value::uuid from c4_inbox_state where key='inbox_mapping_id'),
  3,
  (select value::uuid from c4_inbox_state where key='fresh_receipt_id'),
  'c4-inbox-reactivate'
)).version as reactivated_version \gset

insert into c4_inbox_state(key,value)
values ('reactivated_version', :'reactivated_version');

reset role;
set role service_role;

do $final_state$
begin
  if (select value::integer from c4_inbox_state where key='degraded_version') <> 3
     or (select value::integer from c4_inbox_state where key='reactivated_version') <> 4
  then
    raise exception 'Inbox degraded/reactivation version sequence is invalid';
  end if;

  if not exists (
    select 1
    from public.chatwoot_inbox_mappings
    where id=(select value::uuid from c4_inbox_state where key='inbox_mapping_id')
      and status='ACTIVE'
      and version=4
      and chatwoot_inbox_id=801
      and chatwoot_channel_identifier='api-channel-fb01'
      and last_error_code is null
  ) then
    raise exception 'final Chatwoot Inbox mapping state is invalid';
  end if;
end;
$final_state$;

reset role;

rollback;
