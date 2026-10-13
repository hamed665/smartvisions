\set ON_ERROR_STOP on
begin;
-- Controlled fixtures only. This file is never executed against Production.
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111001'),('11111111-1111-4111-8111-111111111002');
insert into public.organizations(id,name) values
 ('11111111-1111-4111-8111-111111111003','Vault import test');
insert into public.organization_members(organization_id,user_id,role) values
 ('11111111-1111-4111-8111-111111111003','11111111-1111-4111-8111-111111111001','OWNER'),
 ('11111111-1111-4111-8111-111111111003','11111111-1111-4111-8111-111111111002','ADMIN');
insert into public.brands(id,organization_id,name,slug,status) values
 ('11111111-1111-4111-8111-111111111004','11111111-1111-4111-8111-111111111003','Test','vault-import-test','ACTIVE');
insert into public.tenant_businesses(id,organization_id,brand_id,name,slug,status) values
 ('11111111-1111-4111-8111-111111111005','11111111-1111-4111-8111-111111111003','11111111-1111-4111-8111-111111111004','Test','vault-import-test','ACTIVE'),
 ('11111111-1111-4111-8111-111111111006','11111111-1111-4111-8111-111111111003','11111111-1111-4111-8111-111111111004','Other','vault-import-other','ACTIVE');
insert into vault.secrets(id,name,secret,description) values
 ('11111111-1111-4111-8111-111111111007','unit-test-vault-import','controlled-test-credential-value',
 '{"authority":"META_WHATSAPP_VAULT_IMPORT_V1","organizationId":"11111111-1111-4111-8111-111111111003","tenantBusinessId":"11111111-1111-4111-8111-111111111005","wabaId":"12345678","phoneNumberId":"87654321","displayPhoneNumber":"+968 9000 0000"}');
insert into public.integration_connections(organization_id,provider,channel,enabled,status,config) values
 ('11111111-1111-4111-8111-111111111003','META','WHATSAPP',true,'READY',
 '{"metaWhatsAppVaultImport":{"tenantBusinessId":"11111111-1111-4111-8111-111111111005","secretRef":"11111111-1111-4111-8111-111111111007","wabaId":"12345678","phoneNumberId":"87654321","displayPhoneNumber":"+968 9000 0000"}}');

-- These controlled fixtures run only in disposable CI PostgreSQL, never Production.
select set_config('smartvisions.chatwoot_bridge_command','1',true);
insert into public.communication_channel_bindings(
 id,organization_id,tenant_business_id,integration_connection_id,channel,status,
 provider,provider_account_id,provider_destination_id,last_request_key,
 created_by_user_id,updated_by_user_id
) select '11111111-1111-4111-8111-111111111008',organization_id,
 '11111111-1111-4111-8111-111111111005',id,'WHATSAPP','ACTIVE',
 'META','12345678','87654321','controlled-health-fixture',
 '11111111-1111-4111-8111-111111111001','11111111-1111-4111-8111-111111111001'
 from public.integration_connections where organization_id='11111111-1111-4111-8111-111111111003';
select set_config('smartvisions.chatwoot_bridge_command','0',true);
-- Reproduce Production's intentionally restricted table privilege.
revoke update on public.communication_channel_bindings from service_role;
do $$ begin
 if has_table_privilege('service_role','public.communication_channel_bindings','UPDATE') then
  raise exception 'Test must reproduce restricted service table UPDATE'; end if;
 if has_function_privilege('anon','private.mark_meta_whatsapp_binding_health_internal(uuid,uuid,integer,text,uuid,text)','EXECUTE')
 or has_function_privilege('authenticated','private.mark_meta_whatsapp_binding_health_internal(uuid,uuid,integer,text,uuid,text)','EXECUTE')
 or has_function_privilege('authenticated','public.mark_meta_whatsapp_binding_health(uuid,uuid,integer,text,uuid,text)','EXECUTE')
 then raise exception 'Health command browser ACL drift'; end if;
end $$;
set local role service_role;
do $$ declare v public.communication_channel_bindings; begin
 begin
  perform public.mark_meta_whatsapp_binding_health(
   '11111111-1111-4111-8111-111111111003','11111111-1111-4111-8111-111111111008',1,'VERIFIED',
   '11111111-1111-4111-8111-111111111002','controlled-health-admin');
  raise exception 'ADMIN incorrectly marked health';
 exception when raise_exception then if sqlerrm='ADMIN incorrectly marked health' then raise; end if; end;
 select * into v from public.mark_meta_whatsapp_binding_health(
  '11111111-1111-4111-8111-111111111003','11111111-1111-4111-8111-111111111008',1,'VERIFIED',
  '11111111-1111-4111-8111-111111111001','controlled-health-owner');
 if v.version<>2 or v.last_verified_at is null or v.last_error_code is not null then
  raise exception 'Health did not commit through narrow command'; end if;
 if current_setting('smartvisions.chatwoot_bridge_command',true)<>'0' then
  raise exception 'Command guard leaked'; end if;
 begin
  perform public.mark_meta_whatsapp_binding_health(
   '11111111-1111-4111-8111-111111111003','11111111-1111-4111-8111-111111111008',1,'VERIFIED',
   '11111111-1111-4111-8111-111111111001','controlled-health-stale');
  raise exception 'Stale version incorrectly accepted';
 exception when raise_exception then if sqlerrm='Stale version incorrectly accepted' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.audit_logs where entity_id='11111111-1111-4111-8111-111111111008'
  and action='META_WHATSAPP_CREDENTIAL_HEALTH_VERIFIED') then raise exception 'Health audit missing'; end if;
end $$;
rollback;
