\set ON_ERROR_STOP on

begin;

create temp table c3b_interlock_state (
  key text primary key,
  value text not null
) on commit drop;

grant select, insert, update on c3b_interlock_state to authenticated, service_role;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000e501'),
  ('00000000-0000-0000-0000-00000000e502');

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-00000000f501','C3B interlock org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000f501','00000000-0000-0000-0000-00000000e501','OWNER'),
  ('00000000-0000-0000-0000-00000000f501','00000000-0000-0000-0000-00000000e502','VIEWER');

insert into public.brands(id,organization_id,name,slug) values
  ('10000000-0000-0000-0000-00000000f501','00000000-0000-0000-0000-00000000f501','C3B Interlock Brand','c3b-interlock-brand');

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values
  ('20000000-0000-0000-0000-00000000f501','00000000-0000-0000-0000-00000000f501','10000000-0000-0000-0000-00000000f501','C3B Interlock Business','c3b-interlock-business');

insert into public.branches(id,organization_id,tenant_business_id,name,code) values
  ('30000000-0000-0000-0000-00000000f501','00000000-0000-0000-0000-00000000f501','20000000-0000-0000-0000-00000000f501','HQ','HQ');

insert into public.integration_connections(
  id,organization_id,provider,channel,enabled,status
) values (
  '60000000-0000-0000-0000-00000000f501',
  '00000000-0000-0000-0000-00000000f501',
  'META','WHATSAPP',true,'CONNECTED'
);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e501',false);

-- A lower-scope SALES_AGENT grant makes the canonical VIEWER eligible for
-- an Account-wide Chatwoot agent membership.
select (public.create_member_scope_assignment(
  '00000000-0000-0000-0000-00000000f501',
  '00000000-0000-0000-0000-00000000e502',
  'BRAND',
  'SALES_AGENT',
  '10000000-0000-0000-0000-00000000f501',
  null,null,null,null,
  '{}'::jsonb,
  'c3b-interlock-brand-scope-create'
)).id as brand_assignment_id \gset

insert into c3b_interlock_state(key,value)
values ('brand_assignment_id', :'brand_assignment_id');

select (public.create_communication_channel_binding(
  '00000000-0000-0000-0000-00000000f501',
  '20000000-0000-0000-0000-00000000f501',
  '30000000-0000-0000-0000-00000000f501',
  '60000000-0000-0000-0000-00000000f501',
  'WHATSAPP',
  'c3b-interlock-binding-create'
)).id as binding_id \gset

select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000f501',
  '20000000-0000-0000-0000-00000000f501',
  'c3b-interlock-account-create'
)).id as account_mapping_id \gset

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-00000000f501',
  :'account_mapping_id'::uuid,
  1,
  'ACTIVE',
  501,
  null,
  'c3b-interlock-account-active'
)).id;

insert into c3b_interlock_state(key,value)
values ('account_mapping_id', :'account_mapping_id');

select (public.create_chatwoot_user_mapping(
  '00000000-0000-0000-0000-00000000f501',
  '20000000-0000-0000-0000-00000000f501',
  '00000000-0000-0000-0000-00000000e502',
  'c3b-interlock-user-create'
)).id as user_mapping_id \gset

select (public.set_chatwoot_user_mapping_state(
  '00000000-0000-0000-0000-00000000f501',
  '20000000-0000-0000-0000-00000000f501',
  '00000000-0000-0000-0000-00000000e502',
  :'user_mapping_id'::uuid,
  1,
  'ACTIVE',
  151,
  null,
  'c3b-interlock-user-active'
)).id;

insert into c3b_interlock_state(key,value)
values ('user_mapping_id', :'user_mapping_id');

select (public.create_chatwoot_account_membership(
  '00000000-0000-0000-0000-00000000f501',
  '20000000-0000-0000-0000-00000000f501',
  '00000000-0000-0000-0000-00000000e502',
  :'user_mapping_id'::uuid,
  :'account_mapping_id'::uuid,
  'c3b-interlock-membership-create'
)).id as membership_id \gset

insert into c3b_interlock_state(key,value)
values ('membership_id', :'membership_id');

-- 0084 caller-declared "verified role" API is no longer executable.
do $old_generic_state_revoked$
begin
  begin
    perform public.set_chatwoot_account_membership_state(
      '00000000-0000-0000-0000-00000000f501',
      '20000000-0000-0000-0000-00000000f501',
      (select value::uuid from c3b_interlock_state where key='membership_id'),
      1,'ACTIVE',5000000501,'agent',null,'old-generic-state'
    );
    raise exception 'caller-declared membership verification unexpectedly remained executable';
  exception
    when insufficient_privilege then null;
  end;
end;
$old_generic_state_revoked$;

-- Authenticated users cannot mint reconciliation receipts.
do $receipt_client_denied$
begin
  begin
    perform public.record_chatwoot_account_membership_reconciliation(
      '00000000-0000-0000-0000-00000000f501',
      '20000000-0000-0000-0000-00000000f501',
      (select value::uuid from c3b_interlock_state where key='membership_id'),
      1,501,151,'PRESENT',5000000501,'agent','forged-client-receipt'
    );
    raise exception 'authenticated caller unexpectedly minted server receipt';
  exception
    when insufficient_privilege then null;
  end;
end;
$receipt_client_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

-- Server-side GET reconciliation evidence is persisted as an immutable receipt.
select (public.record_chatwoot_account_membership_reconciliation(
  '00000000-0000-0000-0000-00000000f501',
  '20000000-0000-0000-0000-00000000f501',
  (select value::uuid from c3b_interlock_state where key='membership_id'),
  1,501,151,'PRESENT',5000000501,'agent','c3b-interlock-present-receipt'
)).id as present_receipt_id \gset

insert into c3b_interlock_state(key,value)
values ('present_receipt_id', :'present_receipt_id');

do $receipt_grants$
begin
  if has_table_privilege(
       'authenticated',
       'public.chatwoot_account_membership_reconciliation_receipts',
       'SELECT'
     )
     or has_table_privilege(
       'authenticated',
       'public.chatwoot_account_membership_reconciliation_receipts',
       'INSERT'
     )
  then
    raise exception 'reconciliation receipts unexpectedly exposed to authenticated';
  end if;

  if not has_table_privilege(
       'service_role',
       'public.chatwoot_account_membership_reconciliation_receipts',
       'SELECT'
     )
     or not has_table_privilege(
       'service_role',
       'public.chatwoot_account_membership_reconciliation_receipts',
       'INSERT'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_account_membership_reconciliation_receipts',
       'UPDATE'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_account_membership_reconciliation_receipts',
       'DELETE'
     )
  then
    raise exception 'service_role reconciliation receipt grants are not append/read only';
  end if;
end;
$receipt_grants$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e501',false);

select (public.activate_chatwoot_account_membership_verified(
  '00000000-0000-0000-0000-00000000f501',
  '20000000-0000-0000-0000-00000000f501',
  (select value::uuid from c3b_interlock_state where key='membership_id'),
  1,
  (select value::uuid from c3b_interlock_state where key='present_receipt_id'),
  'c3b-interlock-membership-active'
)).version as active_membership_version \gset

insert into c3b_interlock_state(key,value)
values ('active_membership_version', :'active_membership_version');

reset role;
set role service_role;

do $active_membership_verified$
begin
  if (select value::integer from c3b_interlock_state where key='active_membership_version') <> 2 then
    raise exception 'receipt-backed membership activation did not advance version';
  end if;

  if not exists (
    select 1
    from public.chatwoot_account_memberships
    where id=(select value::uuid from c3b_interlock_state where key='membership_id')
      and status='ACTIVE'
      and version=2
      and chatwoot_account_user_id=5000000501
      and effective_smart_role='SALES_AGENT'
      and chatwoot_role='agent'
      and last_verified_at is not null
  ) then
    raise exception 'receipt-backed ACTIVE membership state is invalid';
  end if;
end;
$active_membership_verified$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e501',false);

-- A live external membership blocks every scope mutation path that would
-- reduce this Business-wide role to VIEWER.
do $viewer_reduction_blocked$
begin
  begin
    perform public.update_member_scope_assignment(
      '00000000-0000-0000-0000-00000000f501',
      (select value::uuid from c3b_interlock_state where key='brand_assignment_id'),
      1,
      'VIEWER',
      '{}'::jsonb,
      'c3b-interlock-brand-to-viewer-blocked'
    );
    raise exception 'live membership unexpectedly allowed BRAND role reduction to VIEWER';
  exception when others then
    if sqlerrm not like 'archive verified Chatwoot Account membership before reducing%' then
      raise;
    end if;
  end;

  begin
    perform public.delete_member_scope_assignment(
      '00000000-0000-0000-0000-00000000f501',
      (select value::uuid from c3b_interlock_state where key='brand_assignment_id'),
      1,
      'c3b-interlock-brand-delete-blocked'
    );
    raise exception 'live membership unexpectedly allowed BRAND grant deletion to VIEWER fallback';
  exception when others then
    if sqlerrm not like 'archive verified Chatwoot Account membership before reducing%' then
      raise;
    end if;
  end;

  begin
    perform public.create_member_scope_assignment(
      '00000000-0000-0000-0000-00000000f501',
      '00000000-0000-0000-0000-00000000e502',
      'BUSINESS',
      'VIEWER',
      null,
      '20000000-0000-0000-0000-00000000f501',
      null,null,null,
      '{}'::jsonb,
      'c3b-interlock-business-viewer-insert-blocked'
    );
    raise exception 'live membership unexpectedly allowed BUSINESS VIEWER insert';
  exception when others then
    if sqlerrm not like 'archive verified Chatwoot Account membership before reducing%' then
      raise;
    end if;
  end;
end;
$viewer_reduction_blocked$;

-- A receipt tied to the old membership version cannot be replayed after activation.
do $stale_present_receipt_denied$
begin
  begin
    perform public.activate_chatwoot_account_membership_verified(
      '00000000-0000-0000-0000-00000000f501',
      '20000000-0000-0000-0000-00000000f501',
      (select value::uuid from c3b_interlock_state where key='membership_id'),
      2,
      (select value::uuid from c3b_interlock_state where key='present_receipt_id'),
      'c3b-interlock-stale-present-receipt'
    );
    raise exception 'stale reconciliation receipt unexpectedly reused after version change';
  exception when others then
    if sqlerrm not like 'fresh Chatwoot reconciliation receipt not found%' then
      raise;
    end if;
  end;
end;
$stale_present_receipt_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

-- Server proves AccountUser is now absent after external DELETE + GET reconciliation.
select (public.record_chatwoot_account_membership_reconciliation(
  '00000000-0000-0000-0000-00000000f501',
  '20000000-0000-0000-0000-00000000f501',
  (select value::uuid from c3b_interlock_state where key='membership_id'),
  2,501,151,'ABSENT',null,null,'c3b-interlock-absent-receipt'
)).id as absent_receipt_id \gset

insert into c3b_interlock_state(key,value)
values ('absent_receipt_id', :'absent_receipt_id');

-- A changed payload cannot reuse the same server request key.
do $receipt_request_conflict$
begin
  begin
    perform public.record_chatwoot_account_membership_reconciliation(
      '00000000-0000-0000-0000-00000000f501',
      '20000000-0000-0000-0000-00000000f501',
      (select value::uuid from c3b_interlock_state where key='membership_id'),
      2,501,151,'PRESENT',5000000501,'agent','c3b-interlock-absent-receipt'
    );
    raise exception 'receipt request key unexpectedly accepted changed payload';
  exception when others then
    if sqlerrm not like 'reconciliation request key already used with different payload%' then
      raise;
    end if;
  end;
end;
$receipt_request_conflict$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e501',false);

select (public.archive_chatwoot_account_membership_verified(
  '00000000-0000-0000-0000-00000000f501',
  '20000000-0000-0000-0000-00000000f501',
  (select value::uuid from c3b_interlock_state where key='membership_id'),
  2,
  (select value::uuid from c3b_interlock_state where key='absent_receipt_id'),
  'c3b-interlock-membership-archive'
)).version as archived_membership_version \gset

insert into c3b_interlock_state(key,value)
values ('archived_membership_version', :'archived_membership_version');

-- Once the externally verified membership is archived, the Smart Core role may
-- safely reduce to VIEWER.
select (public.update_member_scope_assignment(
  '00000000-0000-0000-0000-00000000f501',
  (select value::uuid from c3b_interlock_state where key='brand_assignment_id'),
  1,
  'VIEWER',
  '{}'::jsonb,
  'c3b-interlock-brand-to-viewer-after-archive'
)).version as viewer_assignment_version \gset

insert into c3b_interlock_state(key,value) values
  ('viewer_assignment_version', :'viewer_assignment_version');

reset role;
set role service_role;

do $final_state_verified$
begin
  if (select value::integer from c3b_interlock_state where key='archived_membership_version') <> 3 then
    raise exception 'verified membership archive did not advance version';
  end if;

  if not exists (
    select 1
    from public.chatwoot_account_memberships
    where id=(select value::uuid from c3b_interlock_state where key='membership_id')
      and status='ARCHIVED'
      and version=3
      and chatwoot_account_user_id=5000000501
      and last_verified_at is not null
  ) then
    raise exception 'verified membership archive state is invalid';
  end if;

  if (select value::integer from c3b_interlock_state where key='viewer_assignment_version') <> 2 then
    raise exception 'post-archive Smart Core role reduction did not advance assignment version';
  end if;

  if not exists (
    select 1
    from public.member_scope_assignments
    where id=(select value::uuid from c3b_interlock_state where key='brand_assignment_id')
      and role='VIEWER'
      and version=2
  ) then
    raise exception 'post-archive Smart Core role reduction was not persisted';
  end if;
end;
$final_state_verified$;

reset role;

rollback;
