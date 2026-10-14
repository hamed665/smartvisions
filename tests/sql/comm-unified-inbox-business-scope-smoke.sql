\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values ('00000000-0000-4000-8000-000000009401');
insert into public.organizations(id,name) values
  ('00000000-0000-4000-8000-000000009410','Unified Inbox reconciler org');
insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-4000-8000-000000009410','00000000-0000-4000-8000-000000009401','OWNER');

insert into public.brands(id,organization_id,name,slug,status) values
  ('10000000-0000-4000-8000-000000009410','00000000-0000-4000-8000-000000009410','Reconciler Brand','reconciler-brand','ACTIVE');
insert into public.tenant_businesses(id,organization_id,brand_id,name,slug,status) values
  ('20000000-0000-4000-8000-000000009410','00000000-0000-4000-8000-000000009410','10000000-0000-4000-8000-000000009410','Reconciler Business','reconciler-business','ACTIVE');
insert into public.branches(id,organization_id,tenant_business_id,name,code,status) values
  ('30000000-0000-4000-8000-000000009410','00000000-0000-4000-8000-000000009410','20000000-0000-4000-8000-000000009410','Main Branch','MAIN','ACTIVE');
insert into public.departments(id,organization_id,branch_id,name,code,status) values
  ('40000000-0000-4000-8000-000000009410','00000000-0000-4000-8000-000000009410','30000000-0000-4000-8000-000000009410','Support','support','ACTIVE');
insert into public.teams(id,organization_id,department_id,name,code,status) values
  ('50000000-0000-4000-8000-000000009410','00000000-0000-4000-8000-000000009410','40000000-0000-4000-8000-000000009410','Tier One','tier-one','ACTIVE');
insert into public.integration_connections(id,organization_id,provider,channel,enabled,status) values
  ('60000000-0000-4000-8000-000000009410','00000000-0000-4000-8000-000000009410','META','WHATSAPP',true,'CONNECTED');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009401',false);

select (public.create_communication_channel_binding(
  '00000000-0000-4000-8000-000000009410',
  '20000000-0000-4000-8000-000000009410',
  null,
  '60000000-0000-4000-8000-000000009410',
  'WHATSAPP','reconciler-binding'
)).id as binding_id \gset

select (public.create_chatwoot_account_mapping(
  '00000000-0000-4000-8000-000000009410',
  '20000000-0000-4000-8000-000000009410',
  'reconciler-account'
)).id as account_mapping_id \gset

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-4000-8000-000000009410',
  :'account_mapping_id'::uuid,1,'ACTIVE',9401,null,'reconciler-account-active'
)).id;

select (public.create_chatwoot_inbox_mapping(
  '00000000-0000-4000-8000-000000009410',
  '20000000-0000-4000-8000-000000009410',
  null,
  :'binding_id'::uuid,:'account_mapping_id'::uuid,'reconciler-inbox'
)).id as inbox_mapping_id \gset

select (public.create_chatwoot_team_mapping(
  '00000000-0000-4000-8000-000000009410',
  '20000000-0000-4000-8000-000000009410',
  '50000000-0000-4000-8000-000000009410',
  :'account_mapping_id'::uuid,'reconciler-team'
)).id as team_mapping_id \gset

reset role;
select set_config('request.jwt.claim.sub','',false);

select set_config('smartvisions.chatwoot_bridge_command','1',true);
update public.chatwoot_inbox_mappings
   set chatwoot_inbox_id=9501,
       chatwoot_channel_identifier='api-reconciler',
       webhook_secret_ref='secretref://test/reconciler/webhook',
       hmac_token_ref='secretref://test/reconciler/hmac',
       status='ACTIVE', version=2,
       last_request_key='reconciler-inbox-active',
       last_verified_at=statement_timestamp()
 where id=:'inbox_mapping_id'::uuid;

update public.chatwoot_team_mappings
   set chatwoot_team_id=9601,
       status='ACTIVE', version=2,
       last_request_key='reconciler-team-active',
       last_verified_at=statement_timestamp()
 where id=:'team_mapping_id'::uuid;
select set_config('smartvisions.chatwoot_bridge_command','0',true);

insert into public.sales_conversations(id,organization_id,lead_id,channel,last_message_at) values
  ('72000000-0000-4000-8000-000000009410','00000000-0000-4000-8000-000000009410',null,'WHATSAPP','2026-09-26T10:00:00Z');

insert into public.chatwoot_webhook_events(
  id,organization_id,tenant_business_id,chatwoot_inbox_mapping_id,
  chatwoot_inbox_id,delivery_id,event_type,raw_body_sha256,payload
) values
('80000000-0000-4000-8000-000000009411','00000000-0000-4000-8000-000000009410','20000000-0000-4000-8000-000000009410',:'inbox_mapping_id'::uuid,9501,'81000000-0000-4000-8000-000000009411','conversation_created',repeat('a',64),'{"event":"conversation_created"}'::jsonb),
('80000000-0000-4000-8000-000000009412','00000000-0000-4000-8000-000000009410','20000000-0000-4000-8000-000000009410',:'inbox_mapping_id'::uuid,9501,'81000000-0000-4000-8000-000000009412','conversation_updated',repeat('b',64),'{"event":"conversation_updated"}'::jsonb),
('80000000-0000-4000-8000-000000009413','00000000-0000-4000-8000-000000009410','20000000-0000-4000-8000-000000009410',:'inbox_mapping_id'::uuid,9501,'81000000-0000-4000-8000-000000009413','conversation_updated',repeat('c',64),'{"event":"conversation_updated","stale":true}'::jsonb),
('80000000-0000-4000-8000-000000009414','00000000-0000-4000-8000-000000009410','20000000-0000-4000-8000-000000009410',:'inbox_mapping_id'::uuid,9501,'81000000-0000-4000-8000-000000009414','conversation_typing_on',repeat('d',64),'{"event":"conversation_typing_on"}'::jsonb),
('80000000-0000-4000-8000-000000009415','00000000-0000-4000-8000-000000009410','20000000-0000-4000-8000-000000009410',:'inbox_mapping_id'::uuid,9501,'81000000-0000-4000-8000-000000009415','conversation_updated',repeat('e',64),'{"event":"conversation_updated","bad_team":true}'::jsonb);

set role service_role;

select * from public.reconcile_unified_inbox_projection_event(
  '80000000-0000-4000-8000-000000009411','72000000-0000-4000-8000-000000009410',
  9701,9801,null,null,'open',array['sales'],'2026-09-26T10:00:00Z','2026-09-26T10:00:01Z'
);
select * from public.reconcile_unified_inbox_projection_event(
  '80000000-0000-4000-8000-000000009411','72000000-0000-4000-8000-000000009410',
  9701,9801,null,null,'open',array['sales'],'2026-09-26T10:00:00Z','2026-09-26T10:00:01Z'
);
do $$ begin
 if not exists(select 1 from public.unified_inbox_conversation_projections
   where conversation_id='72000000-0000-4000-8000-000000009410'
     and branch_id is null and department_id is null and team_id is null and version=1)
 or (select count(*) from public.unified_inbox_projection_reconciliation_receipts
   where source_event_id='80000000-0000-4000-8000-000000009411')<>1 then
   raise exception 'Business-scope projection/replay failed';
 end if;
 begin
   perform public.reconcile_unified_inbox_projection_event(
     '80000000-0000-4000-8000-000000009412','72000000-0000-4000-8000-000000009410',
     9701,9801,null,9601,'open','{}','2026-09-26T10:01:00Z','2026-09-26T10:01:01Z');
   raise exception 'Business-scope Team accepted';
 exception when raise_exception then
   if sqlerrm not like 'Chatwoot Team requires a Branch-scoped Inbox mapping%' then raise; end if;
 end;
 begin
   update public.unified_inbox_conversation_projections set labels=array['bypass']
     where conversation_id='72000000-0000-4000-8000-000000009410';
   raise exception 'Direct mutation accepted';
 exception when raise_exception then
   if sqlerrm not like 'Unified Inbox projection mutation requires reconciler command path%' then raise; end if;
 end;
 perform set_config('smartvisions.unified_inbox_projection_command','1',true);
 begin
   update public.unified_inbox_conversation_projections
     set department_id='40000000-0000-4000-8000-000000009410',version=2,last_request_key='bad-business-department'
     where conversation_id='72000000-0000-4000-8000-000000009410';
   raise exception 'Branch assignment accepted on Business projection';
 exception when raise_exception then
   if sqlerrm not like 'Business-scoped Unified Inbox projection cannot carry Branch-scoped assignment%' then raise; end if;
 end;
 perform set_config('smartvisions.unified_inbox_projection_command','0',true);
 if exists(select 1 from public.unified_inbox_conversation_projections
   where conversation_id='72000000-0000-4000-8000-000000009410' and version<>1) then
   raise exception 'Rejected mutation altered projection';
 end if;
end $$;
reset role;
rollback;
