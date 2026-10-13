\set ON_ERROR_STOP on
begin;
-- Disposable CI only; no external API or Production tenant.
insert into auth.users(id) values ('00000000-0000-0000-0000-00000000d901');
insert into public.organizations(id,name) values ('00000000-0000-0000-0000-00000000d901','Account Recovery CI');
insert into public.organization_members(organization_id,user_id,role) values
('00000000-0000-0000-0000-00000000d901','00000000-0000-0000-0000-00000000d901','OWNER');
insert into public.brands(id,organization_id,name,slug) values
('10000000-0000-0000-0000-00000000d901','00000000-0000-0000-0000-00000000d901','Recovery CI','recovery-ci');
insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values
('20000000-0000-0000-0000-00000000d901','00000000-0000-0000-0000-00000000d901','10000000-0000-0000-0000-00000000d901','Recovery CI','recovery-ci');
insert into public.integration_connections(id,organization_id,provider,channel,enabled,status) values
('40000000-0000-0000-0000-00000000d901','00000000-0000-0000-0000-00000000d901','EMAIL_PROVIDER','EMAIL',true,'CONNECTED');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000d901',false);
select public.create_communication_channel_binding('00000000-0000-0000-0000-00000000d901',
'20000000-0000-0000-0000-00000000d901',null,'40000000-0000-0000-0000-00000000d901','EMAIL','ci-recovery-binding');
select (public.create_chatwoot_account_mapping('00000000-0000-0000-0000-00000000d901',
'20000000-0000-0000-0000-00000000d901','ci-recovery-mapping')).id as mapping_id \gset
select * from public.claim_chatwoot_account_external_create('00000000-0000-0000-0000-00000000d901',:'mapping_id','ci-original-attempt');
set role service_role;
select (public.record_chatwoot_account_absence_review('00000000-0000-0000-0000-00000000d901',:'mapping_id',1,
'00000000-0000-0000-0000-00000000d901','https://inbox.example.com',1,'[1]'::jsonb,clock_timestamp(),'ci-full-review')).id;
reset role;
commit;
