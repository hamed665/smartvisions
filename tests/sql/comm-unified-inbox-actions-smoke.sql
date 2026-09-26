\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000009801'),
  ('00000000-0000-4000-8000-000000009802'),
  ('00000000-0000-4000-8000-000000009803');

insert into public.organizations(id,name) values
  ('00000000-0000-4000-8000-000000009810','Unified Inbox actions org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-4000-8000-000000009810','00000000-0000-4000-8000-000000009801','OWNER'),
  ('00000000-0000-4000-8000-000000009810','00000000-0000-4000-8000-000000009802','SALES_MANAGER'),
  ('00000000-0000-4000-8000-000000009810','00000000-0000-4000-8000-000000009803','VIEWER');

insert into public.brands(id,organization_id,name,slug,status) values
  ('10000000-0000-4000-8000-000000009810','00000000-0000-4000-8000-000000009810','Actions Brand','actions-brand','ACTIVE');

insert into public.tenant_businesses(
  id,organization_id,brand_id,name,slug,status
) values (
  '20000000-0000-4000-8000-000000009810',
  '00000000-0000-4000-8000-000000009810',
  '10000000-0000-4000-8000-000000009810',
  'Actions Business','actions-business','ACTIVE'
);

insert into public.branches(id,organization_id,tenant_business_id,name,code,status) values
  ('30000000-0000-4000-8000-000000009810','00000000-0000-4000-8000-000000009810','20000000-0000-4000-8000-000000009810','Actions Branch','ACT','ACTIVE');

insert into public.integration_connections(
  id,organization_id,provider,channel,enabled,status
) values (
  '60000000-0000-4000-8000-000000009810',
  '00000000-0000-4000-8000-000000009810',
  'META','WHATSAPP',true,'CONNECTED'
);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009801',false);

select (public.create_communication_channel_binding(
  '00000000-0000-4000-8000-000000009810',
  '20000000-0000-4000-8000-000000009810',
  '30000000-0000-4000-8000-000000009810',
  '60000000-0000-4000-8000-000000009810',
  'WHATSAPP',
  'actions-binding'
)).id as binding_id \gset

select (public.create_chatwoot_account_mapping(
  '00000000-0000-4000-8000-000000009810',
  '20000000-0000-4000-8000-000000009810',
  'actions-account'
)).id as account_mapping_id \gset

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-4000-8000-000000009810',
  :'account_mapping_id'::uuid,
  1,
  'ACTIVE',
  9810,
  null,
  'actions-account-active'
)).id;

select (public.create_chatwoot_inbox_mapping(
  '00000000-0000-4000-8000-000000009810',
  '20000000-0000-4000-8000-000000009810',
  '30000000-0000-4000-8000-000000009810',
  :'binding_id'::uuid,
  :'account_mapping_id'::uuid,
  'actions-inbox'
)).id as inbox_mapping_id \gset

reset role;
select set_config('request.jwt.claim.sub','',false);

select set_config('smartvisions.chatwoot_bridge_command','1',true);
update public.chatwoot_inbox_mappings
   set chatwoot_inbox_id=9811,
       chatwoot_channel_identifier='api-actions',
       webhook_secret_ref='secretref://test/actions/webhook',
       hmac_token_ref='secretref://test/actions/hmac',
       status='ACTIVE',
       version=2,
       last_request_key='actions-inbox-active',
       last_verified_at=statement_timestamp()
 where id=:'inbox_mapping_id'::uuid;
select set_config('smartvisions.chatwoot_bridge_command','0',true);

insert into public.sales_conversations(
  id,organization_id,lead_id,channel,last_message_at
) values (
  '72000000-0000-4000-8000-000000009810',
  '00000000-0000-4000-8000-000000009810',
  null,
  'WHATSAPP',
  statement_timestamp()
);

select set_config('smartvisions.unified_inbox_projection_command','1',true);
insert into public.unified_inbox_conversation_projections(
  organization_id,
  conversation_id,
  brand_id,
  tenant_business_id,
  branch_id,
  department_id,
  team_id,
  communication_channel_binding_id,
  chatwoot_inbox_mapping_id,
  chatwoot_conversation_display_id,
  chatwoot_status,
  labels,
  last_request_key
) values (
  '00000000-0000-4000-8000-000000009810',
  '72000000-0000-4000-8000-000000009810',
  '10000000-0000-4000-8000-000000009810',
  '20000000-0000-4000-8000-000000009810',
  '30000000-0000-4000-8000-000000009810',
  null,
  null,
  :'binding_id'::uuid,
  :'inbox_mapping_id'::uuid,
  9812,
  'open',
  array['sales'],
  'actions-projection-create'
);
select set_config('smartvisions.unified_inbox_projection_command','0',true);

select id as projection_id
from public.unified_inbox_conversation_projections
where conversation_id='72000000-0000-4000-8000-000000009810' \gset

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009802',false);

do $manager_claims$
declare
  v_row record;
begin
  select * into v_row
  from public.claim_unified_inbox_action(
    '00000000-0000-4000-8000-000000009810',
    '72000000-0000-4000-8000-000000009810',
    'actions-status-request',
    'STATUS',
    '{"status":"resolved"}'::jsonb
  );

  if not v_row.is_new
     or v_row.projection_id <> :'projection_id'::uuid
     or v_row.claimed_projection_version <> 1
     or v_row.current_projection_version <> 1
     or v_row.chatwoot_conversation_display_id <> 9812
  then
    raise exception 'manager status claim returned invalid contract';
  end if;

  select * into v_row
  from public.claim_unified_inbox_action(
    '00000000-0000-4000-8000-000000009810',
    '72000000-0000-4000-8000-000000009810',
    'actions-status-request',
    'STATUS',
    '{"status":"resolved"}'::jsonb
  );

  if v_row.is_new then
    raise exception 'exact replay created a second action claim';
  end if;

  begin
    perform public.claim_unified_inbox_action(
      '00000000-0000-4000-8000-000000009810',
      '72000000-0000-4000-8000-000000009810',
      'actions-status-request',
      'STATUS',
      '{"status":"open"}'::jsonb
    );
    raise exception 'request-key payload mismatch unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'request-key payload mismatch unexpectedly succeeded' then
        raise;
      end if;
  end;

  select * into v_row
  from public.claim_unified_inbox_action(
    '00000000-0000-4000-8000-000000009810',
    '72000000-0000-4000-8000-000000009810',
    'actions-label-request',
    'LABELS',
    '{"labels":["sales","vip"]}'::jsonb
  );

  if not v_row.is_new then
    raise exception 'labels claim was not created';
  end if;
end;
$manager_claims$;

do $direct_insert_denied$
begin
  begin
    insert into public.chatwoot_bridge_command_claims(
      organization_id,request_key,command_type,entity_type,entity_id,
      applied_version,payload_hash,created_by_user_id
    ) values (
      '00000000-0000-4000-8000-000000009810',
      'actions-direct-insert',
      'SET_CONVERSATION_STATUS',
      'UNIFIED_INBOX_PROJECTION',
      :'projection_id'::uuid,
      1,
      repeat('a',64),
      '00000000-0000-4000-8000-000000009802'
    );
    raise exception 'direct action claim insert unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'direct action claim insert unexpectedly succeeded' then
        raise;
      end if;
  end;
end;
$direct_insert_denied$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009803',false);

do $viewer_denied$
begin
  begin
    perform public.claim_unified_inbox_action(
      '00000000-0000-4000-8000-000000009810',
      '72000000-0000-4000-8000-000000009810',
      'actions-viewer-request',
      'STATUS',
      '{"status":"resolved"}'::jsonb
    );
    raise exception 'viewer action claim unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'viewer action claim unexpectedly succeeded' then
        raise;
      end if;
  end;
end;
$viewer_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $action_acl$
begin
  if not has_function_privilege(
       'authenticated',
       'public.claim_unified_inbox_action(uuid,uuid,text,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.claim_unified_inbox_action(uuid,uuid,text,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.claim_unified_inbox_action(uuid,uuid,text,text,jsonb)',
       'EXECUTE'
     )
  then
    raise exception 'Unified Inbox action RPC privilege boundary is incorrect';
  end if;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and p.proname in (
         'claim_unified_inbox_action',
         'can_manage_unified_inbox_projection'
       )
       and p.prosecdef
  ) then
    raise exception 'Unified Inbox action functions unexpectedly use SECURITY DEFINER';
  end if;
end;
$action_acl$;

rollback;
