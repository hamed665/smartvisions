\set ON_ERROR_STOP on

begin;

create temp table c3b_user_receipt_state (
  key text primary key,
  value text not null
) on commit drop;

grant select, insert, update on c3b_user_receipt_state to authenticated, service_role;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000e801'),
  ('00000000-0000-0000-0000-00000000e802');

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-00000000f801','C3B User receipt org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000f801','00000000-0000-0000-0000-00000000e801','OWNER'),
  ('00000000-0000-0000-0000-00000000f801','00000000-0000-0000-0000-00000000e802','ADMIN');

insert into public.brands(id,organization_id,name,slug) values
  ('10000000-0000-0000-0000-00000000f801','00000000-0000-0000-0000-00000000f801','C3B User Receipt Brand','c3b-user-receipt-brand');

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values
  ('20000000-0000-0000-0000-00000000f801','00000000-0000-0000-0000-00000000f801','10000000-0000-0000-0000-00000000f801','C3B User Receipt Business','c3b-user-receipt-business');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e801',false);

select (public.create_chatwoot_user_mapping(
  '00000000-0000-0000-0000-00000000f801',
  '20000000-0000-0000-0000-00000000f801',
  '00000000-0000-0000-0000-00000000e802',
  'c3b-user-receipt-mapping-create'
)).id as user_mapping_id \gset

insert into c3b_user_receipt_state(key,value)
values ('user_mapping_id', :'user_mapping_id');

-- The #214 caller-declared external User ID state RPC is revoked by 0086.
do $old_user_state_revoked$
begin
  begin
    perform public.set_chatwoot_user_mapping_state(
      '00000000-0000-0000-0000-00000000f801',
      '20000000-0000-0000-0000-00000000f801',
      '00000000-0000-0000-0000-00000000e802',
      (select value::uuid from c3b_user_receipt_state where key='user_mapping_id'),
      1,'ACTIVE',171,null,'old-user-state'
    );
    raise exception 'caller-declared Chatwoot User verification unexpectedly remained executable';
  exception when insufficient_privilege then null;
  end;
end;
$old_user_state_revoked$;

-- Authenticated callers cannot forge User reconciliation receipts.
do $user_receipt_client_denied$
begin
  begin
    perform public.record_chatwoot_user_reconciliation(
      '00000000-0000-0000-0000-00000000f801',
      '20000000-0000-0000-0000-00000000f801',
      (select value::uuid from c3b_user_receipt_state where key='user_mapping_id'),
      1,
      '00000000-0000-0000-0000-00000000e802',
      171,
      'agent@example.com',
      'forged-user-receipt'
    );
    raise exception 'authenticated caller unexpectedly minted User receipt';
  exception when insufficient_privilege then null;
  end;
end;
$user_receipt_client_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

select (public.record_chatwoot_user_reconciliation(
  '00000000-0000-0000-0000-00000000f801',
  '20000000-0000-0000-0000-00000000f801',
  (select value::uuid from c3b_user_receipt_state where key='user_mapping_id'),
  1,
  '00000000-0000-0000-0000-00000000e802',
  171,
  'agent@example.com',
  'c3b-user-receipt-present-1'
)).id as user_receipt_id \gset

insert into c3b_user_receipt_state(key,value)
values ('user_receipt_id', :'user_receipt_id');

do $user_receipt_acl$
begin
  if has_table_privilege(
       'authenticated',
       'public.chatwoot_user_reconciliation_receipts',
       'SELECT'
     )
     or has_table_privilege(
       'authenticated',
       'public.chatwoot_user_reconciliation_receipts',
       'INSERT'
     )
  then
    raise exception 'User reconciliation receipts unexpectedly exposed to authenticated';
  end if;

  if not has_table_privilege(
       'service_role',
       'public.chatwoot_user_reconciliation_receipts',
       'SELECT'
     )
     or not has_table_privilege(
       'service_role',
       'public.chatwoot_user_reconciliation_receipts',
       'INSERT'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_user_reconciliation_receipts',
       'UPDATE'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_user_reconciliation_receipts',
       'DELETE'
     )
  then
    raise exception 'service_role User receipt grants are not append/read only';
  end if;
end;
$user_receipt_acl$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e801',false);

select (public.activate_chatwoot_user_mapping_verified(
  '00000000-0000-0000-0000-00000000f801',
  '20000000-0000-0000-0000-00000000f801',
  '00000000-0000-0000-0000-00000000e802',
  (select value::uuid from c3b_user_receipt_state where key='user_mapping_id'),
  1,
  (select value::uuid from c3b_user_receipt_state where key='user_receipt_id'),
  'c3b-user-receipt-activate-1'
)).version as active_user_version \gset

insert into c3b_user_receipt_state(key,value)
values ('active_user_version', :'active_user_version');

reset role;
set role service_role;

do $user_activation_verified$
begin
  if (select value::integer from c3b_user_receipt_state where key='active_user_version') <> 2 then
    raise exception 'receipt-backed User activation did not advance version';
  end if;

  if not exists (
    select 1
    from public.chatwoot_user_mappings
    where id=(select value::uuid from c3b_user_receipt_state where key='user_mapping_id')
      and smart_user_id='00000000-0000-0000-0000-00000000e802'
      and chatwoot_user_id=171
      and status='ACTIVE'
      and version=2
      and last_verified_at is not null
  ) then
    raise exception 'receipt-backed ACTIVE Chatwoot User mapping is invalid';
  end if;

  begin
    perform public.record_chatwoot_user_reconciliation(
      '00000000-0000-0000-0000-00000000f801',
      '20000000-0000-0000-0000-00000000f801',
      (select value::uuid from c3b_user_receipt_state where key='user_mapping_id'),
      2,
      '00000000-0000-0000-0000-00000000e802',
      172,
      'agent@example.com',
      'c3b-user-receipt-drift'
    );
    raise exception 'changed Chatwoot User ID unexpectedly produced a receipt';
  exception when others then
    if sqlerrm not like 'Chatwoot User identity drift detected by receipt%' then
      raise;
    end if;
  end;
end;
$user_activation_verified$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e801',false);

-- Receipt bound to version 1 cannot activate version 2 again.
do $stale_user_receipt_denied$
begin
  begin
    perform public.activate_chatwoot_user_mapping_verified(
      '00000000-0000-0000-0000-00000000f801',
      '20000000-0000-0000-0000-00000000f801',
      '00000000-0000-0000-0000-00000000e802',
      (select value::uuid from c3b_user_receipt_state where key='user_mapping_id'),
      2,
      (select value::uuid from c3b_user_receipt_state where key='user_receipt_id'),
      'c3b-user-receipt-stale'
    );
    raise exception 'stale User receipt unexpectedly reused after version change';
  exception when others then
    if sqlerrm not like 'fresh Chatwoot User reconciliation receipt not found%' then
      raise;
    end if;
  end;
end;
$stale_user_receipt_denied$;

-- With no live Account membership, controlled degradation remains available.
select (public.mark_chatwoot_user_mapping_degraded(
  '00000000-0000-0000-0000-00000000f801',
  '20000000-0000-0000-0000-00000000f801',
  '00000000-0000-0000-0000-00000000e802',
  (select value::uuid from c3b_user_receipt_state where key='user_mapping_id'),
  2,
  'UPSTREAM_UNAVAILABLE',
  'c3b-user-receipt-degraded'
)).version as degraded_user_version \gset

insert into c3b_user_receipt_state(key,value)
values ('degraded_user_version', :'degraded_user_version');

reset role;
set role service_role;

select (public.record_chatwoot_user_reconciliation(
  '00000000-0000-0000-0000-00000000f801',
  '20000000-0000-0000-0000-00000000f801',
  (select value::uuid from c3b_user_receipt_state where key='user_mapping_id'),
  3,
  '00000000-0000-0000-0000-00000000e802',
  171,
  'agent@example.com',
  'c3b-user-receipt-present-3'
)).id as fresh_user_receipt_id \gset

insert into c3b_user_receipt_state(key,value)
values ('fresh_user_receipt_id', :'fresh_user_receipt_id');

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e801',false);

select (public.activate_chatwoot_user_mapping_verified(
  '00000000-0000-0000-0000-00000000f801',
  '20000000-0000-0000-0000-00000000f801',
  '00000000-0000-0000-0000-00000000e802',
  (select value::uuid from c3b_user_receipt_state where key='user_mapping_id'),
  3,
  (select value::uuid from c3b_user_receipt_state where key='fresh_user_receipt_id'),
  'c3b-user-receipt-reactivate'
)).version as reactivated_user_version \gset

insert into c3b_user_receipt_state(key,value)
values ('reactivated_user_version', :'reactivated_user_version');

reset role;
set role service_role;

do $user_final_state$
begin
  if (select value::integer from c3b_user_receipt_state where key='degraded_user_version') <> 3
     or (select value::integer from c3b_user_receipt_state where key='reactivated_user_version') <> 4
  then
    raise exception 'User degraded/reactivation versions are invalid';
  end if;

  if not exists (
    select 1
    from public.chatwoot_user_mappings
    where id=(select value::uuid from c3b_user_receipt_state where key='user_mapping_id')
      and chatwoot_user_id=171
      and status='ACTIVE'
      and version=4
      and last_error_code is null
      and last_verified_at is not null
  ) then
    raise exception 'final verified User mapping state is invalid';
  end if;
end;
$user_final_state$;

reset role;

rollback;
