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

do $$
begin
 if has_function_privilege('authenticated','public.read_meta_whatsapp_vault_import_credential(uuid,uuid,uuid)','EXECUTE')
   or has_function_privilege('anon','public.read_meta_whatsapp_vault_import_credential(uuid,uuid,uuid)','EXECUTE')
   or has_function_privilege('authenticated','private.read_meta_whatsapp_vault_import_credential_internal(uuid,uuid,uuid)','EXECUTE')
   or not has_function_privilege('service_role','public.read_meta_whatsapp_vault_import_credential(uuid,uuid,uuid)','EXECUTE')
 then raise exception 'Credential resolver ACL drift'; end if;
end $$;

set local role service_role;
do $$
declare v_result record;
begin
 select * into v_result from public.read_meta_whatsapp_vault_import_credential(
  '11111111-1111-4111-8111-111111111003','11111111-1111-4111-8111-111111111005','11111111-1111-4111-8111-111111111001');
 if v_result.phone_number_id<>'87654321' or v_result.access_token<>'controlled-test-credential-value' then
  raise exception 'Exact source credential not resolved'; end if;
 begin
  perform * from public.read_meta_whatsapp_vault_import_credential(
   '11111111-1111-4111-8111-111111111003','11111111-1111-4111-8111-111111111005','11111111-1111-4111-8111-111111111002');
  raise exception 'ADMIN unexpectedly accepted';
 exception when raise_exception then
  if sqlerrm='ADMIN unexpectedly accepted' then raise; end if;
 end;
 begin
  perform * from public.read_meta_whatsapp_vault_import_credential(
   '11111111-1111-4111-8111-111111111003','11111111-1111-4111-8111-111111111006','11111111-1111-4111-8111-111111111001');
  raise exception 'Other Business unexpectedly accepted';
 exception when raise_exception then
  if sqlerrm='Other Business unexpectedly accepted' then raise; end if;
 end;
end $$;
reset role;
-- A malicious config rewrite cannot relabel the trusted source Vault secret.
update public.integration_connections set config=jsonb_set(config,'{metaWhatsAppVaultImport,tenantBusinessId}',
 '"11111111-1111-4111-8111-111111111006"') where organization_id='11111111-1111-4111-8111-111111111003';
set local role service_role;
do $$
begin
 begin
  perform * from public.read_meta_whatsapp_vault_import_credential(
   '11111111-1111-4111-8111-111111111003','11111111-1111-4111-8111-111111111006','11111111-1111-4111-8111-111111111001');
  raise exception 'Cross-scope Vault source unexpectedly accepted';
 exception when raise_exception then
  if sqlerrm='Cross-scope Vault source unexpectedly accepted' then raise; end if;
 end;
end $$;
reset role;
rollback;
