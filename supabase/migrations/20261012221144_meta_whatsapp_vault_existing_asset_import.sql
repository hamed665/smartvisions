-- Operator-staged existing API assets. Credential storage stays in Vault;
-- integration config contains only the approved Business and opaque secret UUID.
-- No browser role may read the token. The authenticated OWNER route performs
-- read-only Meta verification before canonical bootstrap/setup completion.
create or replace function private.read_meta_whatsapp_vault_import_credential_internal(
  p_organization_id uuid, p_tenant_business_id uuid, p_actor_user_id uuid
)
returns table(access_token text, secret_ref uuid, waba_id text,
  phone_number_id text, display_phone_number text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_config jsonb;
  v_secret uuid;
  v_token text;
  v_scope jsonb;
begin
  if not exists(select 1 from public.organization_members
    where organization_id=p_organization_id and user_id=p_actor_user_id and role='OWNER')
    or not exists(select 1 from public.tenant_businesses
      where organization_id=p_organization_id and id=p_tenant_business_id and status='ACTIVE')
  then raise exception 'Organization OWNER and ACTIVE Business required'; end if;

  select config->'metaWhatsAppVaultImport' into v_config
    from public.integration_connections
    where organization_id=p_organization_id and provider='META' and channel='WHATSAPP'
      and enabled and status in ('READY','CONNECTED');
  if v_config is null or v_config->>'tenantBusinessId' is distinct from p_tenant_business_id::text
    or coalesce(v_config->>'wabaId','') !~ '^[0-9]{5,30}$'
    or coalesce(v_config->>'phoneNumberId','') !~ '^[0-9]{5,30}$'
    or coalesce(v_config->>'displayPhoneNumber','') !~ '^\+[0-9 ]{8,25}$'
  then raise exception 'Exact Business Vault import is not prepared'; end if;
  v_secret := (v_config->>'secretRef')::uuid;
  -- Only the trusted Vault operator can label source credentials. Organization
  -- owners cannot obtain another tenant's secret by editing integration config.
  select decrypted_secret, description::jsonb into v_token,v_scope
    from vault.decrypted_secrets where id=v_secret;
  if v_scope->>'authority' is distinct from 'META_WHATSAPP_VAULT_IMPORT_V1'
    or v_scope->>'organizationId' is distinct from p_organization_id::text
    or v_scope->>'tenantBusinessId' is distinct from p_tenant_business_id::text
    or v_scope->>'wabaId' is distinct from v_config->>'wabaId'
    or v_scope->>'phoneNumberId' is distinct from v_config->>'phoneNumberId'
    or v_scope->>'displayPhoneNumber' is distinct from v_config->>'displayPhoneNumber'
  then raise exception 'Staged Vault credential scope does not match'; end if;
  if v_token is null or length(btrim(v_token))<20 then
    raise exception 'Staged credential unavailable';
  end if;
  if exists(select 1 from public.communication_channel_bindings
    where provider_secret_ref=v_secret and status='ACTIVE'
      and (organization_id<>p_organization_id or tenant_business_id<>p_tenant_business_id))
  then raise exception 'Staged credential belongs to another binding'; end if;
  return query select v_token,v_secret,v_config->>'wabaId',v_config->>'phoneNumberId',v_config->>'displayPhoneNumber';
end;
$$;

create or replace function public.read_meta_whatsapp_vault_import_credential(
  p_organization_id uuid, p_tenant_business_id uuid, p_actor_user_id uuid
)
returns table(access_token text, secret_ref uuid, waba_id text,
  phone_number_id text, display_phone_number text)
language sql security invoker set search_path = ''
as $$
  select * from private.read_meta_whatsapp_vault_import_credential_internal(
    p_organization_id,p_tenant_business_id,p_actor_user_id);
$$;

revoke all on function private.read_meta_whatsapp_vault_import_credential_internal(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.read_meta_whatsapp_vault_import_credential(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.read_meta_whatsapp_vault_import_credential_internal(uuid,uuid,uuid) to service_role;
grant execute on function public.read_meta_whatsapp_vault_import_credential(uuid,uuid,uuid) to service_role;
