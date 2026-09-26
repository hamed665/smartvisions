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
  '30000000-0000-4000-8000-000000009410',
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
  '30000000-0000-4000-8000-000000009410',
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
  '80000000-0000-4000-8000-000000009411',
  '72000000-0000-4000-8000-000000009410',
  9701,9801,null,null,'open',array['vip','sales','vip'],
  '2026-09-26T10:00:00Z','2026-09-26T10:00:01Z'
) \gset first_

do $created$
begin
  if :'first_outcome' <> 'CREATED'
     or :'first_projection_version'::integer <> 1
     or :'first_event_status' <> 'PROCESSED'
  then raise exception 'first event did not create projection version 1'; end if;
end;
$created$;

select * from public.reconcile_unified_inbox_projection_event(
  '80000000-0000-4000-8000-000000009411',
  '72000000-0000-4000-8000-000000009410',
  9701,9801,null,null,'open',array['sales','vip'],
  '2026-09-26T10:00:00Z','2026-09-26T10:00:01Z'
) \gset replay_

do $replay$
begin
  if :'replay_outcome' <> 'CREATED'
     or :'replay_projection_version'::integer <> 1
     or (select count(*) from public.unified_inbox_projection_reconciliation_receipts) <> 1
  then raise exception 'event replay was not idempotent'; end if;
end;
$replay$;

select * from public.reconcile_unified_inbox_projection_event(
  '80000000-0000-4000-8000-000000009412',
  '72000000-0000-4000-8000-000000009410',
  9701,9801,9901,9601,'pending',array['vip','priority'],
  '2026-09-26T10:05:00Z','2026-09-26T10:05:01Z'
) \gset second_

do $updated$
begin
  if :'second_outcome' <> 'UPDATED' or :'second_projection_version'::integer <> 2
  then raise exception 'newer event did not advance projection version'; end if;

  if not exists (
    select 1 from public.unified_inbox_conversation_projections p
     where p.conversation_id='72000000-0000-4000-8000-000000009410'
       and p.version=2
       and p.department_id='40000000-0000-4000-8000-000000009410'
       and p.team_id='50000000-0000-4000-8000-000000009410'
       and p.chatwoot_team_mapping_id=:'team_mapping_id'::uuid
       and p.chatwoot_assignee_user_id=9901
       and p.chatwoot_status='pending'
       and p.chatwoot_updated_at='2026-09-26T10:05:01Z'::timestamptz
  ) then raise exception 'Team/assignment snapshot did not reconcile'; end if;
end;
$updated$;

select * from public.reconcile_unified_inbox_projection_event(
  '80000000-0000-4000-8000-000000009413',
  '72000000-0000-4000-8000-000000009410',
  9701,9801,null,null,'resolved',array['old'],
  '2026-09-26T10:01:00Z','2026-09-26T10:01:01Z'
) \gset stale_

do $stale$
begin
  if :'stale_outcome' <> 'STALE_IGNORED'
     or :'stale_projection_version'::integer <> 2
     or :'stale_event_status' <> 'IGNORED'
     or (select chatwoot_status from public.unified_inbox_conversation_projections where conversation_id='72000000-0000-4000-8000-000000009410') <> 'pending'
  then raise exception 'stale event regressed current projection'; end if;
end;
$stale$;

select (public.finalize_chatwoot_webhook_event(
  '80000000-0000-4000-8000-000000009414','IGNORED','UNSUPPORTED_EVENT'
)).status as ignored_status \gset

do $finalizer$
begin
  if :'ignored_status' <> 'IGNORED'
  then raise exception 'unsupported event did not finalize IGNORED'; end if;
end;
$finalizer$;

do $unknown_team$
begin
  begin
    perform public.reconcile_unified_inbox_projection_event(
      '80000000-0000-4000-8000-000000009415',
      '72000000-0000-4000-8000-000000009410',
      9701,9801,null,999999,'open',array['bad-team'],
      '2026-09-26T10:06:00Z','2026-09-26T10:06:01Z'
    );
    raise exception 'unknown Chatwoot Team unexpectedly reconciled';
  exception
    when others then
      if sqlerrm not like '%not governed by an active Smart Team mapping%' then raise; end if;
  end;
  if (select version from public.unified_inbox_conversation_projections where conversation_id='72000000-0000-4000-8000-000000009410') <> 2
  then raise exception 'failed Team mapping attempt mutated projection'; end if;
end;
$unknown_team$;

do $direct_write_blocked$
begin
  begin
    update public.unified_inbox_conversation_projections
       set labels=array['bypass']
     where conversation_id='72000000-0000-4000-8000-000000009410';
    raise exception 'direct service_role projection update unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%requires reconciler command path%' then raise; end if;
  end;
end;
$direct_write_blocked$;

reset role;

do $acl$
begin
  if has_table_privilege('authenticated','public.unified_inbox_conversation_projections','INSERT')
     or has_table_privilege('authenticated','public.unified_inbox_conversation_projections','UPDATE')
     or has_table_privilege('authenticated','public.unified_inbox_projection_reconciliation_receipts','SELECT')
     or not has_table_privilege('service_role','public.unified_inbox_conversation_projections','INSERT')
     or not has_table_privilege('service_role','public.unified_inbox_conversation_projections','UPDATE')
     or has_table_privilege('service_role','public.unified_inbox_projection_reconciliation_receipts','UPDATE')
  then raise exception 'Unified Inbox reconciler ACL drifted'; end if;
end;
$acl$;

rollback;
