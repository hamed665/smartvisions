\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000ea01');

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-00000000fa01','C4 webhook journal org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000fa01','00000000-0000-0000-0000-00000000ea01','OWNER');

insert into public.brands(id,organization_id,name,slug) values
  ('10000000-0000-0000-0000-00000000fa01','00000000-0000-0000-0000-00000000fa01','C4 Webhook Brand','c4-webhook-brand');

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values
  ('20000000-0000-0000-0000-00000000fa01','00000000-0000-0000-0000-00000000fa01','10000000-0000-0000-0000-00000000fa01','C4 Webhook Business','c4-webhook-business');

insert into public.branches(id,organization_id,tenant_business_id,name,code) values
  ('30000000-0000-0000-0000-00000000fa01','00000000-0000-0000-0000-00000000fa01','20000000-0000-0000-0000-00000000fa01','HQ','HQ');

insert into public.integration_connections(
  id,organization_id,provider,channel,enabled,status
) values (
  '60000000-0000-0000-0000-00000000fa01',
  '00000000-0000-0000-0000-00000000fa01',
  'META','WHATSAPP',true,'CONNECTED'
);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ea01',false);

select (public.create_communication_channel_binding(
  '00000000-0000-0000-0000-00000000fa01',
  '20000000-0000-0000-0000-00000000fa01',
  '30000000-0000-0000-0000-00000000fa01',
  '60000000-0000-0000-0000-00000000fa01',
  'WHATSAPP',
  'c4-webhook-binding-create'
)).id as binding_id \gset

select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000fa01',
  '20000000-0000-0000-0000-00000000fa01',
  'c4-webhook-account-create'
)).id as account_mapping_id \gset

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-00000000fa01',
  :'account_mapping_id'::uuid,
  1,
  'ACTIVE',
  801,
  null,
  'c4-webhook-account-active'
)).id;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role service_role;

select public.chatwoot_vault_create_secret(
  'c4-webhook-signing-secret',
  'chatwoot/test/webhook/fa01',
  'rollback smoke webhook signing secret'
) as webhook_secret_ref \gset

select public.chatwoot_vault_create_secret(
  'c4-webhook-hmac-token',
  'chatwoot/test/hmac/fa01',
  'rollback smoke API channel HMAC token'
) as hmac_token_ref \gset

reset role;

insert into public.chatwoot_inbox_mappings(
  id,
  organization_id,
  tenant_business_id,
  branch_id,
  communication_channel_binding_id,
  chatwoot_account_mapping_id,
  chatwoot_inbox_id,
  chatwoot_channel_identifier,
  channel_type,
  webhook_secret_ref,
  hmac_token_ref,
  status,
  version,
  last_request_key,
  created_by_user_id,
  updated_by_user_id
) values (
  '40000000-0000-0000-0000-00000000fa01',
  '00000000-0000-0000-0000-00000000fa01',
  '20000000-0000-0000-0000-00000000fa01',
  '30000000-0000-0000-0000-00000000fa01',
  :'binding_id'::uuid,
  :'account_mapping_id'::uuid,
  701,
  'api-channel-fa01',
  'Channel::Api',
  :'webhook_secret_ref',
  :'hmac_token_ref',
  'PROVISIONING',
  1,
  'c4-webhook-inbox-create',
  '00000000-0000-0000-0000-00000000ea01',
  '00000000-0000-0000-0000-00000000ea01'
);

update public.chatwoot_inbox_mappings
set status='ACTIVE',
    version=2,
    last_request_key='c4-webhook-inbox-active',
    last_verified_at=now(),
    updated_by_user_id='00000000-0000-0000-0000-00000000ea01'
where id='40000000-0000-0000-0000-00000000fa01'
  and organization_id='00000000-0000-0000-0000-00000000fa01';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000ea01',false);

do $authenticated_journal_denied$
begin
  if has_table_privilege(
       'authenticated',
       'public.chatwoot_webhook_events',
       'SELECT'
     )
     or has_table_privilege(
       'authenticated',
       'public.chatwoot_webhook_events',
       'INSERT'
     )
  then
    raise exception 'authenticated unexpectedly has direct Chatwoot journal access';
  end if;

  begin
    perform public.record_chatwoot_webhook_event(
      '00000000-0000-0000-0000-00000000fa01',
      '20000000-0000-0000-0000-00000000fa01',
      '40000000-0000-0000-0000-00000000fa01',
      701,
      '50000000-0000-0000-0000-00000000fa01',
      'message_created',
      repeat('a',64),
      '{"event":"message_created","inbox":{"id":701}}'::jsonb
    );
    raise exception 'authenticated unexpectedly executed Chatwoot journal recorder';
  exception when insufficient_privilege then
    null;
  end;
end;
$authenticated_journal_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

select * from public.record_chatwoot_webhook_event(
  '00000000-0000-0000-0000-00000000fa01',
  '20000000-0000-0000-0000-00000000fa01',
  '40000000-0000-0000-0000-00000000fa01',
  701,
  '50000000-0000-0000-0000-00000000fa01',
  'message_created',
  repeat('a',64),
  '{"event":"message_created","inbox":{"id":701},"id":91}'::jsonb
);

do $first_event_verified$
begin
  if (
    select count(*)
    from public.chatwoot_webhook_events
    where chatwoot_inbox_mapping_id='40000000-0000-0000-0000-00000000fa01'
      and delivery_id='50000000-0000-0000-0000-00000000fa01'
      and status='RECEIVED'
      and chatwoot_inbox_id=701
      and event_type='message_created'
      and raw_body_sha256=repeat('a',64)
  ) <> 1 then
    raise exception 'first Chatwoot webhook event was not journaled exactly once';
  end if;
end;
$first_event_verified$;

-- Exact replay returns the durable row without inserting another event.
do $exact_replay$
declare
  v_result record;
begin
  select *
    into v_result
    from public.record_chatwoot_webhook_event(
      '00000000-0000-0000-0000-00000000fa01',
      '20000000-0000-0000-0000-00000000fa01',
      '40000000-0000-0000-0000-00000000fa01',
      701,
      '50000000-0000-0000-0000-00000000fa01',
      'message_created',
      repeat('a',64),
      '{"event":"message_created","inbox":{"id":701},"id":91}'::jsonb
    );

  if v_result.is_new is not false
     or v_result.event_status <> 'RECEIVED'
  then
    raise exception 'exact Chatwoot delivery replay did not reconcile';
  end if;
end;
$exact_replay$;

-- Same delivery ID with changed signed evidence fails closed.
do $delivery_payload_conflict$
begin
  begin
    perform public.record_chatwoot_webhook_event(
      '00000000-0000-0000-0000-00000000fa01',
      '20000000-0000-0000-0000-00000000fa01',
      '40000000-0000-0000-0000-00000000fa01',
      701,
      '50000000-0000-0000-0000-00000000fa01',
      'message_created',
      repeat('b',64),
      '{"event":"message_created","inbox":{"id":701},"id":92}'::jsonb
    );
    raise exception 'changed Chatwoot delivery replay unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Chatwoot delivery ID replay payload mismatch%' then
      raise;
    end if;
  end;
end;
$delivery_payload_conflict$;

-- Wrong external Inbox ID cannot enter the journal.
do $mapping_scope_denied$
begin
  begin
    perform public.record_chatwoot_webhook_event(
      '00000000-0000-0000-0000-00000000fa01',
      '20000000-0000-0000-0000-00000000fa01',
      '40000000-0000-0000-0000-00000000fa01',
      999,
      '50000000-0000-0000-0000-00000000fa02',
      'message_created',
      repeat('c',64),
      '{"event":"message_created","inbox":{"id":999}}'::jsonb
    );
    raise exception 'wrong Chatwoot Inbox ID unexpectedly entered journal';
  exception when others then
    if sqlerrm not like 'Chatwoot webhook event does not match a live API Inbox mapping%' then
      raise;
    end if;
  end;
end;
$mapping_scope_denied$;

-- Processing may change lifecycle fields, never signed evidence.
update public.chatwoot_webhook_events
set status='PROCESSED',
    processed_at=now()
where chatwoot_inbox_mapping_id='40000000-0000-0000-0000-00000000fa01'
  and delivery_id='50000000-0000-0000-0000-00000000fa01';

do $journal_immutability$
begin
  begin
    update public.chatwoot_webhook_events
    set payload='{"event":"message_created","inbox":{"id":701},"id":999}'::jsonb
    where chatwoot_inbox_mapping_id='40000000-0000-0000-0000-00000000fa01'
      and delivery_id='50000000-0000-0000-0000-00000000fa01';
    raise exception 'signed Chatwoot journal evidence unexpectedly mutated';
  exception when others then
    if sqlerrm not like 'Chatwoot webhook journal evidence is immutable%' then
      raise;
    end if;
  end;

  begin
    update public.chatwoot_webhook_events
    set status='FAILED',
        error_code='LATE_FAILURE'
    where chatwoot_inbox_mapping_id='40000000-0000-0000-0000-00000000fa01'
      and delivery_id='50000000-0000-0000-0000-00000000fa01';
    raise exception 'terminal Chatwoot webhook event unexpectedly changed state';
  exception when others then
    if sqlerrm not like 'terminal Chatwoot webhook event cannot change state%' then
      raise;
    end if;
  end;
end;
$journal_immutability$;

do $service_role_acl$
begin
  if not has_table_privilege(
       'service_role',
       'public.chatwoot_webhook_events',
       'SELECT'
     )
     or not has_table_privilege(
       'service_role',
       'public.chatwoot_webhook_events',
       'INSERT'
     )
     or not has_table_privilege(
       'service_role',
       'public.chatwoot_webhook_events',
       'UPDATE'
     )
     or has_table_privilege(
       'service_role',
       'public.chatwoot_webhook_events',
       'DELETE'
     )
  then
    raise exception 'service_role Chatwoot journal ACL is invalid';
  end if;
end;
$service_role_acl$;

reset role;

rollback;
