\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000009301'),
  ('00000000-0000-4000-8000-000000009302'),
  ('00000000-0000-4000-8000-000000009303'),
  ('00000000-0000-4000-8000-000000009304');

insert into public.organizations(id,name) values
  ('00000000-0000-4000-8000-000000009310','Unified Inbox scope org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-4000-8000-000000009310','00000000-0000-4000-8000-000000009301','OWNER'),
  ('00000000-0000-4000-8000-000000009310','00000000-0000-4000-8000-000000009302','VIEWER'),
  ('00000000-0000-4000-8000-000000009310','00000000-0000-4000-8000-000000009303','ADMIN'),
  ('00000000-0000-4000-8000-000000009310','00000000-0000-4000-8000-000000009304','VIEWER');

insert into public.brands(id,organization_id,name,slug,status) values
  ('10000000-0000-4000-8000-000000009310','00000000-0000-4000-8000-000000009310','Unified Inbox Brand','unified-inbox-brand','ACTIVE');

insert into public.tenant_businesses(
  id,organization_id,brand_id,name,slug,status
) values (
  '20000000-0000-4000-8000-000000009310',
  '00000000-0000-4000-8000-000000009310',
  '10000000-0000-4000-8000-000000009310',
  'Unified Inbox Business','unified-inbox-business','ACTIVE'
);

insert into public.branches(id,organization_id,tenant_business_id,name,code,status) values
  ('30000000-0000-4000-8000-000000009311','00000000-0000-4000-8000-000000009310','20000000-0000-4000-8000-000000009310','Branch A','A','ACTIVE'),
  ('30000000-0000-4000-8000-000000009312','00000000-0000-4000-8000-000000009310','20000000-0000-4000-8000-000000009310','Branch B','B','ACTIVE');

insert into public.departments(id,organization_id,branch_id,name,code,status) values
  ('40000000-0000-4000-8000-000000009311','00000000-0000-4000-8000-000000009310','30000000-0000-4000-8000-000000009311','Support','support','ACTIVE');

insert into public.teams(id,organization_id,department_id,name,code,status) values
  ('50000000-0000-4000-8000-000000009311','00000000-0000-4000-8000-000000009310','40000000-0000-4000-8000-000000009311','Tier One','tier-one','ACTIVE');

insert into public.integration_connections(
  id,organization_id,provider,channel,enabled,status
) values
  ('60000000-0000-4000-8000-000000009311','00000000-0000-4000-8000-000000009310','META','WHATSAPP',true,'CONNECTED'),
  ('60000000-0000-4000-8000-000000009312','00000000-0000-4000-8000-000000009310','META','WHATSAPP',true,'CONNECTED');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009301',false);

select (public.create_communication_channel_binding(
  '00000000-0000-4000-8000-000000009310',
  '20000000-0000-4000-8000-000000009310',
  '30000000-0000-4000-8000-000000009311',
  '60000000-0000-4000-8000-000000009311',
  'WHATSAPP',
  'unified-inbox-binding-a'
)).id as binding_a \gset

select (public.create_communication_channel_binding(
  '00000000-0000-4000-8000-000000009310',
  '20000000-0000-4000-8000-000000009310',
  '30000000-0000-4000-8000-000000009312',
  '60000000-0000-4000-8000-000000009312',
  'WHATSAPP',
  'unified-inbox-binding-b'
)).id as binding_b \gset

select (public.create_chatwoot_account_mapping(
  '00000000-0000-4000-8000-000000009310',
  '20000000-0000-4000-8000-000000009310',
  'unified-inbox-account'
)).id as account_mapping_id \gset

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-4000-8000-000000009310',
  :'account_mapping_id'::uuid,
  1,
  'ACTIVE',
  9301,
  null,
  'unified-inbox-account-active'
)).id;

select (public.create_chatwoot_inbox_mapping(
  '00000000-0000-4000-8000-000000009310',
  '20000000-0000-4000-8000-000000009310',
  '30000000-0000-4000-8000-000000009311',
  :'binding_a'::uuid,
  :'account_mapping_id'::uuid,
  'unified-inbox-mapping-a'
)).id as inbox_mapping_a \gset

select (public.create_chatwoot_inbox_mapping(
  '00000000-0000-4000-8000-000000009310',
  '20000000-0000-4000-8000-000000009310',
  '30000000-0000-4000-8000-000000009312',
  :'binding_b'::uuid,
  :'account_mapping_id'::uuid,
  'unified-inbox-mapping-b'
)).id as inbox_mapping_b \gset

select (public.create_member_scope_assignment(
  '00000000-0000-4000-8000-000000009310',
  '00000000-0000-4000-8000-000000009302',
  'BRANCH',
  'SALES_AGENT',
  null,null,
  '30000000-0000-4000-8000-000000009311',
  null,null,
  '{}'::jsonb,
  'unified-inbox-branch-a-agent'
)).id;

select (public.create_member_scope_assignment(
  '00000000-0000-4000-8000-000000009310',
  '00000000-0000-4000-8000-000000009302',
  'TEAM',
  'VIEWER',
  null,null,null,null,
  '50000000-0000-4000-8000-000000009311',
  '{}'::jsonb,
  'unified-inbox-team-viewer'
)).id;

reset role;
select set_config('request.jwt.claim.sub','',false);

-- Fixture-only activation. 0088 already has dedicated receipt-backed activation
-- smoke coverage. Here we need two valid ACTIVE API Inbox mappings solely to
-- exercise the new projection lineage and RLS boundary.
select set_config('smartvisions.chatwoot_bridge_command','1',true);

update public.chatwoot_inbox_mappings
   set chatwoot_inbox_id=9311,
       chatwoot_channel_identifier='api-unified-inbox-a',
       webhook_secret_ref='secretref://test/unified-inbox/a/webhook',
       hmac_token_ref='secretref://test/unified-inbox/a/hmac',
       status='ACTIVE',
       version=2,
       last_request_key='unified-inbox-mapping-a-active',
       last_verified_at=statement_timestamp()
 where id=:'inbox_mapping_a'::uuid;

update public.chatwoot_inbox_mappings
   set chatwoot_inbox_id=9312,
       chatwoot_channel_identifier='api-unified-inbox-b',
       webhook_secret_ref='secretref://test/unified-inbox/b/webhook',
       hmac_token_ref='secretref://test/unified-inbox/b/hmac',
       status='ACTIVE',
       version=2,
       last_request_key='unified-inbox-mapping-b-active',
       last_verified_at=statement_timestamp()
 where id=:'inbox_mapping_b'::uuid;

select set_config('smartvisions.chatwoot_bridge_command','0',true);

insert into public.businesses(
  id,organization_id,name,country_code,email
) values
  ('70000000-0000-4000-8000-000000009311','00000000-0000-4000-8000-000000009310','Customer A','OM','a@example.test'),
  ('70000000-0000-4000-8000-000000009312','00000000-0000-4000-8000-000000009310','Customer B','OM','b@example.test');

insert into public.leads(
  id,organization_id,business_id,status
) values
  ('71000000-0000-4000-8000-000000009311','00000000-0000-4000-8000-000000009310','70000000-0000-4000-8000-000000009311','NEW'),
  ('71000000-0000-4000-8000-000000009312','00000000-0000-4000-8000-000000009310','70000000-0000-4000-8000-000000009312','NEW');

insert into public.sales_conversations(
  id,organization_id,lead_id,channel,last_message_at
) values
  ('72000000-0000-4000-8000-000000009311','00000000-0000-4000-8000-000000009310','71000000-0000-4000-8000-000000009311','WHATSAPP',statement_timestamp()),
  ('72000000-0000-4000-8000-000000009312','00000000-0000-4000-8000-000000009310','71000000-0000-4000-8000-000000009312','WHATSAPP',statement_timestamp()),
  ('72000000-0000-4000-8000-000000009313','00000000-0000-4000-8000-000000009310',null,'EMAIL',statement_timestamp());

insert into public.conversation_messages(
  id,organization_id,conversation_id,lead_id,channel,direction,original_text
) values
  ('72100000-0000-4000-8000-000000009311','00000000-0000-4000-8000-000000009310','72000000-0000-4000-8000-000000009311','71000000-0000-4000-8000-000000009311','WHATSAPP','INBOUND','branch a'),
  ('72100000-0000-4000-8000-000000009312','00000000-0000-4000-8000-000000009310','72000000-0000-4000-8000-000000009312','71000000-0000-4000-8000-000000009312','WHATSAPP','INBOUND','branch b');

insert into public.whatsapp_events(
  id,organization_id,lead_id,conversation_id,provider_message_id,direction,event_type,payload
) values
  ('72200000-0000-4000-8000-000000009311','00000000-0000-4000-8000-000000009310','71000000-0000-4000-8000-000000009311','72000000-0000-4000-8000-000000009311','wamid.scope.a','INBOUND','MESSAGE_RECEIVED','{"branch":"A"}'::jsonb),
  ('72200000-0000-4000-8000-000000009312','00000000-0000-4000-8000-000000009310','71000000-0000-4000-8000-000000009312','72000000-0000-4000-8000-000000009312','wamid.scope.b','INBOUND','MESSAGE_RECEIVED','{"branch":"B"}'::jsonb);

insert into public.crm_identities(
  id,organization_id,identity_type,normalized_value,display_value
) values
  ('73000000-0000-4000-8000-000000009311','00000000-0000-4000-8000-000000009310','EMAIL','a@example.test','a@example.test'),
  ('73000000-0000-4000-8000-000000009312','00000000-0000-4000-8000-000000009310','EMAIL','b@example.test','b@example.test');

insert into public.crm_identity_links(
  id,organization_id,identity_id,business_id,source_type,source_ref
) values
  ('73100000-0000-4000-8000-000000009311','00000000-0000-4000-8000-000000009310','73000000-0000-4000-8000-000000009311','70000000-0000-4000-8000-000000009311','BUSINESS_FIELD','email'),
  ('73100000-0000-4000-8000-000000009312','00000000-0000-4000-8000-000000009310','73000000-0000-4000-8000-000000009312','70000000-0000-4000-8000-000000009312','BUSINESS_FIELD','email');

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
  chatwoot_conversation_uuid,
  chatwoot_contact_id,
  chatwoot_status,
  labels,
  last_activity_at,
  last_request_key,
  last_reconciled_at
) values
  (
    '00000000-0000-4000-8000-000000009310',
    '72000000-0000-4000-8000-000000009311',
    '10000000-0000-4000-8000-000000009310',
    '20000000-0000-4000-8000-000000009310',
    '30000000-0000-4000-8000-000000009311',
    '40000000-0000-4000-8000-000000009311',
    '50000000-0000-4000-8000-000000009311',
    :'binding_a'::uuid,
    :'inbox_mapping_a'::uuid,
    9411,
    '74000000-0000-4000-8000-000000009311',
    9511,
    'open',
    array['vip','sales'],
    statement_timestamp(),
    'unified-inbox-projection-a',
    statement_timestamp()
  ),
  (
    '00000000-0000-4000-8000-000000009310',
    '72000000-0000-4000-8000-000000009312',
    '10000000-0000-4000-8000-000000009310',
    '20000000-0000-4000-8000-000000009310',
    '30000000-0000-4000-8000-000000009312',
    null,
    null,
    :'binding_b'::uuid,
    :'inbox_mapping_b'::uuid,
    9412,
    '74000000-0000-4000-8000-000000009312',
    9512,
    'open',
    array['sales'],
    statement_timestamp(),
    'unified-inbox-projection-b',
    statement_timestamp()
  );

select set_config('smartvisions.unified_inbox_projection_command','0',true);

-- OWNER keeps legacy/current Smart Core visibility.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009301',false);

do $owner_visibility$
begin
  if (select count(*) from public.sales_conversations where organization_id='00000000-0000-4000-8000-000000009310') <> 3 then
    raise exception 'OWNER lost intended Unified Inbox/legacy conversation visibility';
  end if;
end;
$owner_visibility$;

-- Scoped-only user: Branch A only. Direct Data API reads must not leak Branch B.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009302',false);

do $scoped_visibility$
begin
  if (select count(*) from public.sales_conversations where organization_id='00000000-0000-4000-8000-000000009310') <> 1
     or not exists (
       select 1 from public.sales_conversations
       where id='72000000-0000-4000-8000-000000009311'
     )
  then
    raise exception 'scoped user leaked out-of-branch conversations';
  end if;

  if (select count(*) from public.conversation_messages where organization_id='00000000-0000-4000-8000-000000009310') <> 1 then
    raise exception 'scoped user leaked out-of-branch messages';
  end if;

  if (select count(*) from public.leads where organization_id='00000000-0000-4000-8000-000000009310') <> 1
     or (select count(*) from public.businesses where organization_id='00000000-0000-4000-8000-000000009310') <> 1
     or (select count(*) from public.crm_identities where organization_id='00000000-0000-4000-8000-000000009310') <> 1
  then
    raise exception 'scoped user leaked unrelated Smart Core contact truth';
  end if;

  if (select count(*) from public.whatsapp_events where organization_id='00000000-0000-4000-8000-000000009310') <> 0 then
    raise exception 'scoped user leaked raw Organization-wide communication event history';
  end if;
end;
$scoped_visibility$;

do $scope_precedence$
declare
  v_role text;
begin
  select public.unified_inbox_effective_role(
    '00000000-0000-4000-8000-000000009310',
    '10000000-0000-4000-8000-000000009310',
    '20000000-0000-4000-8000-000000009310',
    '30000000-0000-4000-8000-000000009311',
    '40000000-0000-4000-8000-000000009311',
    '50000000-0000-4000-8000-000000009311'
  ) into v_role;

  if v_role <> 'VIEWER' then
    raise exception 'TEAM VIEWER did not override broader BRANCH SALES_AGENT';
  end if;

  if not public.can_access_unified_inbox_scope(
    '00000000-0000-4000-8000-000000009310',
    '10000000-0000-4000-8000-000000009310',
    '20000000-0000-4000-8000-000000009310',
    '30000000-0000-4000-8000-000000009311',
    '40000000-0000-4000-8000-000000009311',
    '50000000-0000-4000-8000-000000009311'
  ) then
    raise exception 'VIEWER role unexpectedly lost Unified Inbox read access';
  end if;

  select public.unified_inbox_effective_role(
    '00000000-0000-4000-8000-000000009310',
    '10000000-0000-4000-8000-000000009310',
    '20000000-0000-4000-8000-000000009310',
    '30000000-0000-4000-8000-000000009312',
    null,
    null
  ) into v_role;

  if v_role is not null then
    raise exception 'scoped-only VIEWER fell back outside assigned Branch scope';
  end if;
end;
$scope_precedence$;

do $scoped_mutation_denied$
declare
  v_rows bigint := 0;
begin
  begin
    update public.sales_conversations
       set summary='mutation-should-be-denied'
     where id='72000000-0000-4000-8000-000000009311';
    get diagnostics v_rows = row_count;
  exception when insufficient_privilege then
    v_rows := 0;
  end;

  if v_rows <> 0 then
    raise exception 'scoped user unexpectedly mutated a conversation';
  end if;
end;
$scoped_mutation_denied$;

-- Business-wide ADMIN preserves the existing Organization-wide read surface,
-- including legacy rows that have not entered the Chatwoot projection yet.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009303',false);

do $business_wide_visibility$
begin
  if (select count(*) from public.sales_conversations where organization_id='00000000-0000-4000-8000-000000009310') <> 3 then
    raise exception 'Business-wide ADMIN lost existing Organization-wide conversation visibility';
  end if;
end;
$business_wide_visibility$;

-- A Business-wide VIEWER with no lower-scope assignment is a read-only
-- Organization-wide operator. Native Chatwoot SSO is still separately denied
-- by C5; Unified Inbox read visibility does not depend on native SSO.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009304',false);

do $business_wide_viewer_visibility$
begin
  if (select count(*) from public.sales_conversations where organization_id='00000000-0000-4000-8000-000000009310') <> 3 then
    raise exception 'Business-wide VIEWER lost intended read visibility';
  end if;

  if (select count(*) from public.whatsapp_events where organization_id='00000000-0000-4000-8000-000000009310') <> 2 then
    raise exception 'Business-wide VIEWER unexpectedly hit scoped-only legacy boundary';
  end if;
end;
$business_wide_viewer_visibility$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $projection_acl$
begin
  if has_table_privilege('authenticated','public.unified_inbox_conversation_projections','INSERT')
     or has_table_privilege('authenticated','public.unified_inbox_conversation_projections','UPDATE')
     or has_table_privilege('authenticated','public.unified_inbox_conversation_projections','DELETE')
     or has_table_privilege('service_role','public.unified_inbox_conversation_projections','INSERT')
     or has_table_privilege('service_role','public.unified_inbox_conversation_projections','UPDATE')
     or has_table_privilege('service_role','public.unified_inbox_conversation_projections','DELETE')
  then
    raise exception 'Unified Inbox projection write path is not dormant';
  end if;
end;
$projection_acl$;

rollback;
