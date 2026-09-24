\set ON_ERROR_STOP on

begin;

create temp table c5_membership_sync_state (
  key text primary key,
  value text not null
) on commit drop;

grant select, insert, update on c5_membership_sync_state
  to authenticated, service_role;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000ed01'),
  ('00000000-0000-0000-0000-00000000ed02');

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-00000000fd01','C5 membership sync org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000fd01','00000000-0000-0000-0000-00000000ed01','OWNER'),
  ('00000000-0000-0000-0000-00000000fd01','00000000-0000-0000-0000-00000000ed02','ADMIN');

insert into public.brands(id,organization_id,name,slug) values
  ('10000000-0000-0000-0000-00000000fd01','00000000-0000-0000-0000-00000000fd01','C5 Sync Brand','c5-sync-brand');

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values
  ('20000000-0000-0000-0000-00000000fd01','00000000-0000-0000-0000-00000000fd01','10000000-0000-0000-0000-00000000fd01','C5 Sync Business','c5-sync-business');

insert into public.branches(id,organization_id,tenant_business_id,name,code) values
  ('30000000-0000-0000-0000-00000000fd01','00000000-0000-0000-0000-00000000fd01','20000000-0000-0000-0000-00000000fd01','HQ','HQ');

insert into public.departments(id,organization_id,branch_id,name,code) values
  ('40000000-0000-0000-0000-00000000fd01','00000000-0000-0000-0000-00000000fd01','30000000-0000-0000-0000-00000000fd01','Sales','SALES');

insert into public.teams(id,organization_id,department_id,name,code,status) values
  ('50000000-0000-0000-0000-00000000fd01','00000000-0000-0000-0000-00000000fd01','40000000-0000-0000-0000-00000000fd01','Sales Team','SALES-TEAM','ACTIVE');

insert into public.integration_connections(
  id,organization_id,provider,channel,enabled,status
) values (
  '60000000-0000-0000-0000-00000000fd01',
  '00000000-0000-0000-0000-00000000fd01',
  'META','WHATSAPP',true,'CONNECTED'
);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ed01',false);

select (public.create_communication_channel_binding(
  '00000000-0000-0000-0000-00000000fd01',
  '20000000-0000-0000-0000-00000000fd01',
  '30000000-0000-0000-0000-00000000fd01',
  '60000000-0000-0000-0000-00000000fd01',
  'WHATSAPP',
  'c5-sync-binding-create'
)).id as binding_id \gset

select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000fd01',
  '20000000-0000-0000-0000-00000000fd01',
  'c5-sync-account-create'
)).id as account_mapping_id \gset

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-00000000fd01',
  :'account_mapping_id'::uuid,
  1,
  'ACTIVE',
  1101,
  null,
  'c5-sync-account-active'
)).id;

insert into c5_membership_sync_state(key,value) values
  ('binding_id', :'binding_id'),
  ('account_mapping_id', :'account_mapping_id');

-- Fixture the already-governed ACTIVE Inbox/Team mappings under the same
-- transaction-local command guard. This smoke is for 0090 claim/result semantics.
select set_config('smartvisions.chatwoot_bridge_command','1',true);

insert into public.chatwoot_inbox_mappings(
  id,
  organization_id,
  tenant_business_id,
  branch_id,
  communication_channel_binding_id,
  chatwoot_account_mapping_id,
  channel_type,
  status,
  version,
  last_request_key,
  created_by_user_id,
  updated_by_user_id
) values (
  '70000000-0000-0000-0000-00000000fd01',
  '00000000-0000-0000-0000-00000000fd01',
  '20000000-0000-0000-0000-00000000fd01',
  '30000000-0000-0000-0000-00000000fd01',
  :'binding_id'::uuid,
  :'account_mapping_id'::uuid,
  'Channel::Api',
  'PROVISIONING',
  1,
  'c5-sync-inbox-fixture-create',
  '00000000-0000-0000-0000-00000000ed01',
  '00000000-0000-0000-0000-00000000ed01'
);

update public.chatwoot_inbox_mappings
   set chatwoot_inbox_id=701,
       chatwoot_channel_identifier='c5-sync-api-channel',
       webhook_secret_ref='secretref://supabase-vault/00000000-0000-4000-8000-00000000fd11',
       hmac_token_ref='secretref://supabase-vault/00000000-0000-4000-8000-00000000fd12',
       status='ACTIVE',
       version=2,
       last_request_key='c5-sync-inbox-fixture-active',
       last_verified_at=now(),
       updated_by_user_id='00000000-0000-0000-0000-00000000ed01'
 where organization_id='00000000-0000-0000-0000-00000000fd01'
   and id='70000000-0000-0000-0000-00000000fd01';

insert into public.chatwoot_team_mappings(
  id,
  organization_id,
  tenant_business_id,
  smart_team_id,
  chatwoot_account_mapping_id,
  projected_name,
  status,
  version,
  last_request_key,
  created_by_user_id,
  updated_by_user_id
) values (
  '80000000-0000-0000-0000-00000000fd01',
  '00000000-0000-0000-0000-00000000fd01',
  '20000000-0000-0000-0000-00000000fd01',
  '50000000-0000-0000-0000-00000000fd01',
  :'account_mapping_id'::uuid,
  'sales team [50000000]',
  'PROVISIONING',
  1,
  'c5-sync-team-fixture-create',
  '00000000-0000-0000-0000-00000000ed01',
  '00000000-0000-0000-0000-00000000ed01'
);

update public.chatwoot_team_mappings
   set chatwoot_team_id=9223372036854775001,
       status='ACTIVE',
       version=2,
       last_request_key='c5-sync-team-fixture-active',
       last_verified_at=now(),
       updated_by_user_id='00000000-0000-0000-0000-00000000ed01'
 where organization_id='00000000-0000-0000-0000-00000000fd01'
   and id='80000000-0000-0000-0000-00000000fd01';

select set_config('smartvisions.chatwoot_bridge_command','0',true);

-- OWNER can claim exact Inbox desired-set intent.
select * from public.claim_chatwoot_membership_sync(
  '00000000-0000-0000-0000-00000000fd01',
  '20000000-0000-0000-0000-00000000fd01',
  'INBOX',
  '70000000-0000-0000-0000-00000000fd01',
  2,
  repeat('a',64),
  2,
  'c5-sync-inbox-members'
);

do $inbox_claim_verified$
begin
  if not exists (
    select 1
      from public.chatwoot_bridge_command_claims
     where organization_id='00000000-0000-0000-0000-00000000fd01'
       and request_key='c5-sync-inbox-members'
       and command_type='SYNC_INBOX_MEMBERS'
       and entity_type='CHATWOOT_INBOX_MAPPING'
       and entity_id='70000000-0000-0000-0000-00000000fd01'
       and applied_version=2
  ) then
    raise exception 'Inbox membership sync claim was not persisted correctly';
  end if;

  if (
    select count(*)
      from public.audit_logs
     where organization_id='00000000-0000-0000-0000-00000000fd01'
       and action='CHATWOOT_INBOX_MEMBERSHIP_SYNC_CLAIMED'
       and entity_id='70000000-0000-0000-0000-00000000fd01'
       and after_data->>'request_key'='c5-sync-inbox-members'
  ) <> 1 then
    raise exception 'Inbox membership sync claim audit is missing or duplicated';
  end if;
end;
$inbox_claim_verified$;

-- Same claim replays; same key with changed desired-set evidence fails closed.
do $claim_replay_and_conflict$
declare
  v_replay record;
begin
  select *
    into v_replay
    from public.claim_chatwoot_membership_sync(
      '00000000-0000-0000-0000-00000000fd01',
      '20000000-0000-0000-0000-00000000fd01',
      'INBOX',
      '70000000-0000-0000-0000-00000000fd01',
      2,
      repeat('a',64),
      2,
      'c5-sync-inbox-members'
    );

  if v_replay.is_new is not false
     or v_replay.entity_id <> '70000000-0000-0000-0000-00000000fd01'
     or v_replay.applied_version <> 2
  then
    raise exception 'Inbox membership sync replay is invalid';
  end if;

  begin
    perform public.claim_chatwoot_membership_sync(
      '00000000-0000-0000-0000-00000000fd01',
      '20000000-0000-0000-0000-00000000fd01',
      'INBOX',
      '70000000-0000-0000-0000-00000000fd01',
      2,
      repeat('b',64),
      2,
      'c5-sync-inbox-members'
    );
    raise exception 'changed desired set unexpectedly reused Inbox sync request key';
  exception when others then
    if sqlerrm not like 'request key already used with different Chatwoot bridge payload%' then
      raise;
    end if;
  end;
end;
$claim_replay_and_conflict$;

-- Non-OWNER cannot create external membership mutation intent.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ed02',false);

do $non_owner_denied$
begin
  begin
    perform public.claim_chatwoot_membership_sync(
      '00000000-0000-0000-0000-00000000fd01',
      '20000000-0000-0000-0000-00000000fd01',
      'TEAM',
      '80000000-0000-0000-0000-00000000fd01',
      2,
      repeat('c',64),
      1,
      'c5-sync-non-owner'
    );
    raise exception 'non-OWNER unexpectedly claimed Team membership sync';
  exception when others then
    if sqlerrm not like 'Chatwoot membership sync not permitted%' then
      raise;
    end if;
  end;
end;
$non_owner_denied$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ed01',false);

-- TEAM claim uses the same ledger with Team mapping identity.
select * from public.claim_chatwoot_membership_sync(
  '00000000-0000-0000-0000-00000000fd01',
  '20000000-0000-0000-0000-00000000fd01',
  'TEAM',
  '80000000-0000-0000-0000-00000000fd01',
  2,
  repeat('c',64),
  1,
  'c5-sync-team-members'
);

-- Mapping-version mismatch fails before a claim can be written.
do $version_mismatch_denied$
begin
  begin
    perform public.claim_chatwoot_membership_sync(
      '00000000-0000-0000-0000-00000000fd01',
      '20000000-0000-0000-0000-00000000fd01',
      'TEAM',
      '80000000-0000-0000-0000-00000000fd01',
      99,
      repeat('c',64),
      1,
      'c5-sync-team-wrong-version'
    );
    raise exception 'membership sync unexpectedly accepted stale mapping version';
  exception when others then
    if sqlerrm not like 'ACTIVE Chatwoot membership target mapping/version required%' then
      raise;
    end if;
  end;
end;
$version_mismatch_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $function_acl$
begin
  if has_function_privilege(
       'service_role',
       'public.claim_chatwoot_membership_sync(uuid,uuid,text,uuid,integer,text,integer,text)',
       'EXECUTE'
     )
  then
    raise exception 'service_role unexpectedly can claim Chatwoot membership sync';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.record_chatwoot_membership_sync_result(uuid,uuid,text,uuid,integer,text,integer,text,integer,text,integer,boolean,text,text)',
       'EXECUTE'
     )
  then
    raise exception 'authenticated unexpectedly can record server reconciliation result';
  end if;
end;
$function_acl$;

-- Server records bounded no-op Inbox evidence against the exact claim.
select public.record_chatwoot_membership_sync_result(
  '00000000-0000-0000-0000-00000000fd01',
  '20000000-0000-0000-0000-00000000fd01',
  'INBOX',
  '70000000-0000-0000-0000-00000000fd01',
  2,
  repeat('a',64),
  2,
  repeat('a',64),
  2,
  repeat('a',64),
  2,
  false,
  'ALREADY_MATCHED',
  'c5-sync-inbox-members'
) as inbox_result_inserted \gset

insert into c5_membership_sync_state(key,value)
values ('inbox_result_inserted', :'inbox_result_inserted');

-- Exact result replay is idempotent via advisory-lock + audit evidence check.
select public.record_chatwoot_membership_sync_result(
  '00000000-0000-0000-0000-00000000fd01',
  '20000000-0000-0000-0000-00000000fd01',
  'INBOX',
  '70000000-0000-0000-0000-00000000fd01',
  2,
  repeat('a',64),
  2,
  repeat('a',64),
  2,
  repeat('a',64),
  2,
  false,
  'ALREADY_MATCHED',
  'c5-sync-inbox-members'
) as inbox_result_replay \gset

insert into c5_membership_sync_state(key,value)
values ('inbox_result_replay', :'inbox_result_replay');

-- Team updated result proves before/after counts/hashes without storing member IDs.
select public.record_chatwoot_membership_sync_result(
  '00000000-0000-0000-0000-00000000fd01',
  '20000000-0000-0000-0000-00000000fd01',
  'TEAM',
  '80000000-0000-0000-0000-00000000fd01',
  2,
  repeat('c',64),
  1,
  repeat('d',64),
  2,
  repeat('c',64),
  1,
  true,
  'UPDATED_VERIFIED',
  'c5-sync-team-members'
) as team_result_inserted \gset

insert into c5_membership_sync_state(key,value)
values ('team_result_inserted', :'team_result_inserted');

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ed01',false);

do $terminal_claim_replay$
declare
  v_inbox record;
  v_team record;
begin
  select *
    into v_inbox
    from public.claim_chatwoot_membership_sync(
      '00000000-0000-0000-0000-00000000fd01',
      '20000000-0000-0000-0000-00000000fd01',
      'INBOX',
      '70000000-0000-0000-0000-00000000fd01',
      2,
      repeat('a',64),
      2,
      'c5-sync-inbox-members'
    );

  select *
    into v_team
    from public.claim_chatwoot_membership_sync(
      '00000000-0000-0000-0000-00000000fd01',
      '20000000-0000-0000-0000-00000000fd01',
      'TEAM',
      '80000000-0000-0000-0000-00000000fd01',
      2,
      repeat('c',64),
      1,
      'c5-sync-team-members'
    );

  if v_inbox.is_new is not false
     or v_inbox.result_recorded is not true
     or v_team.is_new is not false
     or v_team.result_recorded is not true
  then
    raise exception 'completed membership sync claim replay did not expose terminal result evidence';
  end if;
end;
$terminal_claim_replay$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $result_audit_verified$
begin
  if (select value::boolean from c5_membership_sync_state where key='inbox_result_inserted') is not true
     or (select value::boolean from c5_membership_sync_state where key='inbox_result_replay') is not false
     or (select value::boolean from c5_membership_sync_state where key='team_result_inserted') is not true
  then
    raise exception 'membership sync result idempotency is invalid';
  end if;

  if (
    select count(*)
      from public.audit_logs
     where organization_id='00000000-0000-0000-0000-00000000fd01'
       and action='CHATWOOT_INBOX_MEMBERSHIP_RECONCILED'
       and entity_id='70000000-0000-0000-0000-00000000fd01'
       and after_data->>'request_key'='c5-sync-inbox-members'
  ) <> 1 then
    raise exception 'Inbox reconciliation result audit is missing or duplicated';
  end if;

  if (
    select count(*)
      from public.audit_logs
     where organization_id='00000000-0000-0000-0000-00000000fd01'
       and action='CHATWOOT_TEAM_MEMBERSHIP_RECONCILED'
       and entity_id='80000000-0000-0000-0000-00000000fd01'
       and after_data->>'request_key'='c5-sync-team-members'
       and after_data->>'desired_count'='1'
       and after_data->>'observed_count'='1'
       and after_data->>'outcome'='UPDATED_VERIFIED'
  ) <> 1 then
    raise exception 'Team reconciliation result audit is invalid';
  end if;

  if exists (
    select 1
      from public.audit_logs
     where organization_id='00000000-0000-0000-0000-00000000fd01'
       and action in (
         'CHATWOOT_INBOX_MEMBERSHIP_RECONCILED',
         'CHATWOOT_TEAM_MEMBERSHIP_RECONCILED'
       )
       and (
         after_data ? 'user_ids'
         or before_data ? 'user_ids'
       )
  ) then
    raise exception 'membership reconciliation audit unexpectedly stores member IDs';
  end if;
end;
$result_audit_verified$;

-- Exact request-key result replay must match the original before/after evidence too.
do $result_replay_evidence_mismatch_denied$
begin
  begin
    perform public.record_chatwoot_membership_sync_result(
      '00000000-0000-0000-0000-00000000fd01',
      '20000000-0000-0000-0000-00000000fd01',
      'INBOX',
      '70000000-0000-0000-0000-00000000fd01',
      2,
      repeat('a',64),
      2,
      repeat('d',64),
      1,
      repeat('a',64),
      2,
      true,
      'UPDATED_VERIFIED',
      'c5-sync-inbox-members'
    );
    raise exception 'membership result replay unexpectedly accepted changed observation evidence';
  exception when others then
    if sqlerrm not like 'Chatwoot membership sync result replay evidence mismatch%' then
      raise;
    end if;
  end;
end;
$result_replay_evidence_mismatch_denied$;

-- Result evidence must match the immutable claim payload.
do $result_claim_mismatch_denied$
begin
  begin
    perform public.record_chatwoot_membership_sync_result(
      '00000000-0000-0000-0000-00000000fd01',
      '20000000-0000-0000-0000-00000000fd01',
      'TEAM',
      '80000000-0000-0000-0000-00000000fd01',
      2,
      repeat('e',64),
      1,
      repeat('d',64),
      2,
      repeat('e',64),
      1,
      true,
      'UPDATED_VERIFIED',
      'c5-sync-team-members'
    );
    raise exception 'membership result unexpectedly accepted claim payload mismatch';
  exception when others then
    if sqlerrm not like 'matching Chatwoot membership sync claim required for result%' then
      raise;
    end if;
  end;
end;
$result_claim_mismatch_denied$;

-- Inconsistent "success" evidence is rejected even with an otherwise valid claim.
do $success_evidence_denied$
begin
  begin
    perform public.record_chatwoot_membership_sync_result(
      '00000000-0000-0000-0000-00000000fd01',
      '20000000-0000-0000-0000-00000000fd01',
      'TEAM',
      '80000000-0000-0000-0000-00000000fd01',
      2,
      repeat('c',64),
      1,
      repeat('d',64),
      2,
      repeat('f',64),
      2,
      true,
      'UPDATED_VERIFIED',
      'c5-sync-team-members'
    );
    raise exception 'membership result unexpectedly accepted wrong after-set evidence';
  exception when others then
    if sqlerrm not like 'successful mutation result evidence is inconsistent%' then
      raise;
    end if;
  end;
end;
$success_evidence_denied$;

reset role;

rollback;
