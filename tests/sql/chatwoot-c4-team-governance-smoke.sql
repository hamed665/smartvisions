\set ON_ERROR_STOP on

begin;

create temp table c4_team_state (
  key text primary key,
  value text not null
) on commit drop;

grant select, insert, update on c4_team_state to authenticated, service_role;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000ec01');

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-00000000fc01','C4 Team org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000fc01','00000000-0000-0000-0000-00000000ec01','OWNER');

insert into public.brands(id,organization_id,name,slug) values
  ('10000000-0000-0000-0000-00000000fc01','00000000-0000-0000-0000-00000000fc01','C4 Team Brand','c4-team-brand');

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values
  ('20000000-0000-0000-0000-00000000fc01','00000000-0000-0000-0000-00000000fc01','10000000-0000-0000-0000-00000000fc01','C4 Team Business','c4-team-business');

insert into public.branches(id,organization_id,tenant_business_id,name,code) values
  ('30000000-0000-0000-0000-00000000fc01','00000000-0000-0000-0000-00000000fc01','20000000-0000-0000-0000-00000000fc01','HQ','HQ');

insert into public.departments(id,organization_id,branch_id,name,code) values
  ('40000000-0000-0000-0000-00000000fc01','00000000-0000-0000-0000-00000000fc01','30000000-0000-0000-0000-00000000fc01','Sales','SALES');

insert into public.teams(id,organization_id,department_id,name,code,status) values
  ('12345678-0000-4000-8000-00000000fc01','00000000-0000-0000-0000-00000000fc01','40000000-0000-0000-0000-00000000fc01','Sales Team','TEAM-SALES','ACTIVE');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ec01',false);

select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000fc01',
  '20000000-0000-0000-0000-00000000fc01',
  'c4-team-account-create'
)).id as account_mapping_id \gset

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-00000000fc01',
  :'account_mapping_id'::uuid,
  1,
  'ACTIVE',
  1001,
  null,
  'c4-team-account-active'
)).id;

select (public.create_chatwoot_team_mapping(
  '00000000-0000-0000-0000-00000000fc01',
  '20000000-0000-0000-0000-00000000fc01',
  '12345678-0000-4000-8000-00000000fc01',
  :'account_mapping_id'::uuid,
  'c4-team-mapping-create'
)).id as team_mapping_id \gset

insert into c4_team_state(key,value) values
  ('account_mapping_id', :'account_mapping_id'),
  ('team_mapping_id', :'team_mapping_id');

reset role;
set role service_role;

do $projected_name_verified$
begin
  if not exists (
    select 1
    from public.chatwoot_team_mappings
    where id=(select value::uuid from c4_team_state where key='team_mapping_id')
      and organization_id='00000000-0000-0000-0000-00000000fc01'
      and tenant_business_id='20000000-0000-0000-0000-00000000fc01'
      and smart_team_id='12345678-0000-4000-8000-00000000fc01'
      and projected_name='sales team [12345678]'
      and status='PROVISIONING'
      and version=1
  ) then
    raise exception 'deterministic Chatwoot Team projected name is invalid';
  end if;
end;
$projected_name_verified$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ec01',false);

do $direct_authenticated_write_denied$
begin
  begin
    update public.chatwoot_team_mappings
       set projected_name='tampered team',
           version=version+1,
           last_request_key='direct-team-write'
     where id=(select value::uuid from c4_team_state where key='team_mapping_id');
    raise exception 'direct authenticated Team mapping mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%governed command%'
       and sqlerrm not like '%row-level security%'
    then
      raise;
    end if;
  end;
end;
$direct_authenticated_write_denied$;

do $authenticated_receipt_denied$
begin
  begin
    perform public.record_chatwoot_team_reconciliation(
      '00000000-0000-0000-0000-00000000fc01',
      '20000000-0000-0000-0000-00000000fc01',
      (select value::uuid from c4_team_state where key='team_mapping_id'),
      1,
      9223372036854775001,
      'sales team [12345678]',
      'smartvisions:team:12345678-0000-4000-8000-00000000fc01;business:20000000-0000-0000-0000-00000000fc01;v=1',
      'forged-team-receipt'
    );
    raise exception 'authenticated caller unexpectedly minted Team receipt';
  exception when insufficient_privilege then
    null;
  end;
end;
$authenticated_receipt_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $service_acl$
begin
  if not has_table_privilege(
       'service_role',
       'public.chatwoot_team_mappings',
       'SELECT'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_team_mappings',
       'INSERT'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_team_mappings',
       'UPDATE'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_team_mappings',
       'DELETE'
     )
  then
    raise exception 'service_role Team mapping ACL is not read-only';
  end if;

  if not has_table_privilege(
       'service_role',
       'public.chatwoot_team_reconciliation_receipts',
       'SELECT'
     )
     or not has_table_privilege(
       'service_role',
       'public.chatwoot_team_reconciliation_receipts',
       'INSERT'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_team_reconciliation_receipts',
       'UPDATE'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_team_reconciliation_receipts',
       'DELETE'
     )
  then
    raise exception 'service_role Team receipt ACL is not append/read only';
  end if;

  if has_table_privilege(
       'authenticated',
       'public.chatwoot_team_reconciliation_receipts',
       'SELECT'
     )
     or has_table_privilege(
       'authenticated',
       'public.chatwoot_team_reconciliation_receipts',
       'INSERT'
     )
  then
    raise exception 'authenticated unexpectedly has Team receipt table access';
  end if;
end;
$service_acl$;

select (public.record_chatwoot_team_reconciliation(
  '00000000-0000-0000-0000-00000000fc01',
  '20000000-0000-0000-0000-00000000fc01',
  (select value::uuid from c4_team_state where key='team_mapping_id'),
  1,
  9223372036854775001,
  'sales team [12345678]',
  'smartvisions:team:12345678-0000-4000-8000-00000000fc01;business:20000000-0000-0000-0000-00000000fc01;v=1',
  'c4-team-receipt-1'
)).id as receipt_id \gset

insert into c4_team_state(key,value)
values ('receipt_id', :'receipt_id');

do $receipt_request_key_conflict$
begin
  begin
    perform public.record_chatwoot_team_reconciliation(
      '00000000-0000-0000-0000-00000000fc01',
      '20000000-0000-0000-0000-00000000fc01',
      (select value::uuid from c4_team_state where key='team_mapping_id'),
      1,
      9223372036854775002,
      'sales team [12345678]',
      'smartvisions:team:12345678-0000-4000-8000-00000000fc01;business:20000000-0000-0000-0000-00000000fc01;v=1',
      'c4-team-receipt-1'
    );
    raise exception 'changed Team receipt payload unexpectedly reused request key';
  exception when others then
    if sqlerrm not like 'Team reconciliation request key already used with different payload%'
       and sqlerrm not like 'Chatwoot Team identity drift detected by receipt%'
    then
      raise;
    end if;
  end;
end;
$receipt_request_key_conflict$;

do $marker_mismatch_denied$
begin
  begin
    perform public.record_chatwoot_team_reconciliation(
      '00000000-0000-0000-0000-00000000fc01',
      '20000000-0000-0000-0000-00000000fc01',
      (select value::uuid from c4_team_state where key='team_mapping_id'),
      1,
      9223372036854775001,
      'sales team [12345678]',
      'smartvisions:team:wrong;business:wrong;v=1',
      'c4-team-bad-marker'
    );
    raise exception 'Team receipt unexpectedly accepted wrong projection marker';
  exception when others then
    if sqlerrm not like 'Chatwoot Team projection marker mismatch%' then
      raise;
    end if;
  end;
end;
$marker_mismatch_denied$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ec01',false);

select (public.activate_chatwoot_team_mapping_verified(
  '00000000-0000-0000-0000-00000000fc01',
  '20000000-0000-0000-0000-00000000fc01',
  (select value::uuid from c4_team_state where key='team_mapping_id'),
  1,
  (select value::uuid from c4_team_state where key='receipt_id'),
  'c4-team-activate-1'
)).version as active_version \gset

insert into c4_team_state(key,value)
values ('active_version', :'active_version');

reset role;
set role service_role;

do $active_mapping_verified$
begin
  if (select value::integer from c4_team_state where key='active_version') <> 2 then
    raise exception 'Team receipt-backed activation did not advance version';
  end if;

  if not exists (
    select 1
    from public.chatwoot_team_mappings
    where id=(select value::uuid from c4_team_state where key='team_mapping_id')
      and status='ACTIVE'
      and version=2
      and chatwoot_team_id=9223372036854775001
      and projected_name='sales team [12345678]'
      and last_verified_at is not null
  ) then
    raise exception 'ACTIVE Chatwoot Team mapping state is invalid';
  end if;

  begin
    update public.chatwoot_team_mappings
       set status='DEGRADED'
     where id=(select value::uuid from c4_team_state where key='team_mapping_id');
    raise exception 'service_role direct Team mapping mutation unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$active_mapping_verified$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ec01',false);

do $stale_receipt_denied$
begin
  begin
    perform public.activate_chatwoot_team_mapping_verified(
      '00000000-0000-0000-0000-00000000fc01',
      '20000000-0000-0000-0000-00000000fc01',
      (select value::uuid from c4_team_state where key='team_mapping_id'),
      2,
      (select value::uuid from c4_team_state where key='receipt_id'),
      'c4-team-stale-receipt'
    );
    raise exception 'stale Team receipt unexpectedly activated newer version';
  exception when others then
    if sqlerrm not like 'fresh Chatwoot Team reconciliation receipt not found%' then
      raise;
    end if;
  end;
end;
$stale_receipt_denied$;

select (public.mark_chatwoot_team_mapping_degraded(
  '00000000-0000-0000-0000-00000000fc01',
  '20000000-0000-0000-0000-00000000fc01',
  (select value::uuid from c4_team_state where key='team_mapping_id'),
  2,
  'UPSTREAM_UNAVAILABLE',
  'c4-team-degraded'
)).version as degraded_version \gset

insert into c4_team_state(key,value)
values ('degraded_version', :'degraded_version');

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

select (public.record_chatwoot_team_reconciliation(
  '00000000-0000-0000-0000-00000000fc01',
  '20000000-0000-0000-0000-00000000fc01',
  (select value::uuid from c4_team_state where key='team_mapping_id'),
  3,
  9223372036854775001,
  'sales team [12345678]',
  'smartvisions:team:12345678-0000-4000-8000-00000000fc01;business:20000000-0000-0000-0000-00000000fc01;v=1',
  'c4-team-receipt-3'
)).id as fresh_receipt_id \gset

insert into c4_team_state(key,value)
values ('fresh_receipt_id', :'fresh_receipt_id');

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ec01',false);

select (public.activate_chatwoot_team_mapping_verified(
  '00000000-0000-0000-0000-00000000fc01',
  '20000000-0000-0000-0000-00000000fc01',
  (select value::uuid from c4_team_state where key='team_mapping_id'),
  3,
  (select value::uuid from c4_team_state where key='fresh_receipt_id'),
  'c4-team-reactivate'
)).version as reactivated_version \gset

insert into c4_team_state(key,value)
values ('reactivated_version', :'reactivated_version');

reset role;
set role service_role;

do $final_state_verified$
begin
  if (select value::integer from c4_team_state where key='degraded_version') <> 3
     or (select value::integer from c4_team_state where key='reactivated_version') <> 4
  then
    raise exception 'Team degraded/reactivation version sequence is invalid';
  end if;

  if not exists (
    select 1
    from public.chatwoot_team_mappings
    where id=(select value::uuid from c4_team_state where key='team_mapping_id')
      and status='ACTIVE'
      and version=4
      and chatwoot_team_id=9223372036854775001
      and last_error_code is null
      and last_verified_at is not null
  ) then
    raise exception 'final Chatwoot Team mapping state is invalid';
  end if;
end;
$final_state_verified$;

reset role;

rollback;
