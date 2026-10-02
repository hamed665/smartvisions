-- 0179: PAYMENT-OMAN
-- Oman gateway adapters extend canonical PAYMENT-CORE only.
-- Credentials stay in the existing Supabase Vault; integration_connections stores references only.
-- Provider callbacks/readbacks enter PAYMENT-CORE through its existing verified/reconciliation boundary.

create or replace function public.integration_vault_secret_id(p_secret_ref text)
returns uuid
language plpgsql
immutable
security invoker
set search_path=pg_catalog
as $$
declare
  v_ref text:=trim(coalesce(p_secret_ref,''));
  v_id_text text;
begin
  if v_ref !~ '^secretref://supabase-vault/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'invalid Integration Vault secret reference';
  end if;
  v_id_text:=substring(v_ref from length('secretref://supabase-vault/')+1);
  return v_id_text::uuid;
end;
$$;

create or replace function public.integration_vault_create_secret(
  p_secret text,p_name text,p_description text default null
)
returns text
language plpgsql
security invoker
set search_path=pg_catalog
as $$
declare
  v_secret text:=coalesce(p_secret,'');
  v_name text:=trim(coalesce(p_name,''));
  v_description text:=nullif(trim(coalesce(p_description,'')),'');
  v_id uuid;
  v_existing text;
begin
  if current_user<>'service_role' then raise exception 'Integration Vault is service-only'; end if;
  if length(v_secret)<1 or length(v_secret)>16384 then raise exception 'Integration Vault secret length is invalid'; end if;
  if v_name !~ '^integration/[A-Za-z0-9/_:.-]{1,200}$' then raise exception 'Integration Vault secret name is invalid'; end if;
  if v_description is not null and length(v_description)>500 then raise exception 'Integration Vault description is too long'; end if;

  select ds.id,ds.decrypted_secret into v_id,v_existing
  from vault.decrypted_secrets ds where ds.name=v_name;
  if found then
    if v_existing is distinct from v_secret then
      raise exception 'Integration Vault secret name already exists with different secret';
    end if;
    return 'secretref://supabase-vault/'||v_id::text;
  end if;

  begin
    select vault.create_secret(v_secret,v_name,coalesce(v_description,''),null) into v_id;
  exception when unique_violation then
    select ds.id,ds.decrypted_secret into v_id,v_existing
    from vault.decrypted_secrets ds where ds.name=v_name;
    if not found or v_existing is distinct from v_secret then
      raise exception 'Integration Vault secret name collision requires reconciliation';
    end if;
  end;
  if v_id is null then raise exception 'Integration Vault secret creation returned no identifier'; end if;
  return 'secretref://supabase-vault/'||v_id::text;
end;
$$;

create or replace function public.integration_vault_update_secret(
  p_secret_ref text,p_secret text,p_name text default null,p_description text default null
)
returns text
language plpgsql
security invoker
set search_path=pg_catalog
as $$
declare
  v_id uuid:=public.integration_vault_secret_id(p_secret_ref);
  v_secret text:=coalesce(p_secret,'');
  v_name text:=nullif(trim(coalesce(p_name,'')),'');
  v_description text:=nullif(trim(coalesce(p_description,'')),'');
begin
  if current_user<>'service_role' then raise exception 'Integration Vault is service-only'; end if;
  if length(v_secret)<1 or length(v_secret)>16384 then raise exception 'Integration Vault secret length is invalid'; end if;
  if v_name is not null and v_name !~ '^integration/[A-Za-z0-9/_:.-]{1,200}$' then
    raise exception 'Integration Vault secret name is invalid';
  end if;
  if v_description is not null and length(v_description)>500 then raise exception 'Integration Vault description is too long'; end if;
  if not exists(select 1 from vault.secrets where id=v_id) then raise exception 'Integration Vault secret reference not found'; end if;
  perform vault.update_secret(v_id,v_secret,v_name,v_description,null);
  return 'secretref://supabase-vault/'||v_id::text;
end;
$$;

create or replace function public.integration_vault_read_secret(p_secret_ref text)
returns text
language plpgsql
stable
security invoker
set search_path=pg_catalog
as $$
declare
  v_id uuid:=public.integration_vault_secret_id(p_secret_ref);
  v_secret text;
begin
  if current_user<>'service_role' then raise exception 'Integration Vault is service-only'; end if;
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.id=v_id;
  if not found or v_secret is null then raise exception 'Integration Vault secret unavailable'; end if;
  return v_secret;
end;
$$;

create or replace function public.configure_oman_payment_provider_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_provider text,
  p_mode text,
  p_secret_key text,
  p_publishable_key text,
  p_merchant_id text,
  p_request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_provider text:=upper(btrim(coalesce(p_provider,'')));
  v_mode text:=upper(btrim(coalesce(p_mode,'')));
  v_secret text:=btrim(coalesce(p_secret_key,''));
  v_publishable text:=btrim(coalesce(p_publishable_key,''));
  v_merchant text:=nullif(btrim(coalesce(p_merchant_id,'')),'');
  v_existing public.integration_connections%rowtype;
  v_secret_ref text;
  v_publishable_ref text;
  v_secret_name text;
  v_publishable_name text;
  v_hash text;
  v_config jsonb;
begin
  if current_user<>'service_role' then raise exception 'PAYMENT-OMAN configuration is service-only'; end if;
  if not exists(
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id and m.user_id=p_actor_user_id and m.role in ('OWNER','ADMIN')
  ) then raise exception 'PAYMENT-OMAN owner/admin permission is required'; end if;
  if v_provider not in ('TAP','THAWANI') then raise exception 'PAYMENT-OMAN provider must be TAP or THAWANI'; end if;
  if v_mode not in ('TEST','LIVE') then raise exception 'PAYMENT-OMAN mode must be TEST or LIVE'; end if;
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 240 then raise exception 'PAYMENT-OMAN request key is invalid'; end if;

  select * into v_existing
  from public.integration_connections
  where organization_id=p_organization_id and provider=v_provider and channel='PAYMENT'
  for update;

  v_secret_ref:=case when found then nullif(v_existing.config->>'secret_key_ref','') else null end;
  v_publishable_ref:=case when found then nullif(v_existing.config->>'publishable_key_ref','') else null end;
  v_secret_name:='integration/payment/'||p_organization_id::text||'/'||lower(v_provider)||'/secret';
  v_publishable_name:='integration/payment/'||p_organization_id::text||'/'||lower(v_provider)||'/publishable';

  if v_secret='' and v_secret_ref is null then raise exception 'PAYMENT-OMAN secret key is required'; end if;
  if v_secret<>'' then
    if v_secret_ref is null then
      v_secret_ref:=public.integration_vault_create_secret(v_secret,v_secret_name,'Smart Visions PAYMENT-OMAN secret key');
    else
      v_secret_ref:=public.integration_vault_update_secret(v_secret_ref,v_secret,v_secret_name,'Smart Visions PAYMENT-OMAN secret key');
    end if;
  end if;

  if v_provider='THAWANI' then
    if v_publishable='' and v_publishable_ref is null then raise exception 'PAYMENT-OMAN Thawani publishable key is required'; end if;
    if v_publishable<>'' then
      if v_publishable_ref is null then
        v_publishable_ref:=public.integration_vault_create_secret(v_publishable,v_publishable_name,'Smart Visions PAYMENT-OMAN publishable key');
      else
        v_publishable_ref:=public.integration_vault_update_secret(v_publishable_ref,v_publishable,v_publishable_name,'Smart Visions PAYMENT-OMAN publishable key');
      end if;
    end if;
  else
    v_publishable_ref:=null;
    if v_merchant is null or length(v_merchant) not between 3 and 160 then
      raise exception 'PAYMENT-OMAN Tap merchant ID is required';
    end if;
  end if;

  v_config:=jsonb_strip_nulls(jsonb_build_object(
    'mode',v_mode,
    'currency','OMR',
    'secret_key_ref',v_secret_ref,
    'publishable_key_ref',v_publishable_ref,
    'merchant_id',v_merchant,
    'settlement_authority','PAYMENT_CORE',
    'configured_at',statement_timestamp(),
    'webhook_policy',case when v_provider='TAP' then 'VERIFIED_HASHSTRING' else 'SERVER_READBACK_RECONCILIATION' end
  ));
  v_hash:=md5(jsonb_build_object(
    'provider',v_provider,'mode',v_mode,'merchantId',v_merchant,
    'secretSupplied',v_secret<>'','publishableSupplied',v_publishable<>''
  )::text);

  insert into public.integration_connections(
    id,organization_id,provider,channel,enabled,status,account_label,last_checked_at,last_error,config,updated_at
  ) values (
    gen_random_uuid(),p_organization_id,v_provider,'PAYMENT',true,'READY',
    case when v_provider='TAP' then 'Tap Payments Oman' else 'Thawani Pay Oman' end,
    null,null,v_config,statement_timestamp()
  )
  on conflict (organization_id,provider,channel) do update set
    enabled=true,status='READY',account_label=excluded.account_label,last_error=null,
    config=excluded.config,updated_at=statement_timestamp();

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'PAYMENT_OMAN_PROVIDER_CONFIGURED',
    'integration_connection',v_provider||':PAYMENT',
    jsonb_build_object(
      'requestHash',v_hash,'provider',v_provider,'mode',v_mode,'currency','OMR',
      'secretStoredInVault',true,'publishableStoredInVault',v_publishable_ref is not null,
      'providerConnected',false,'settlementAuthority','PAYMENT_CORE'
    ),p_request_key
  );

  return jsonb_build_object('provider',v_provider,'status','READY','mode',v_mode,'configured',true);
end;
$$;

create or replace function public.record_oman_payment_provider_health_v1(
  p_organization_id uuid,p_provider text,p_healthy boolean,p_detail text,p_evidence jsonb,p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_provider text:=upper(btrim(coalesce(p_provider,'')));
  v_status text;
begin
  if current_user<>'service_role' then raise exception 'PAYMENT-OMAN provider health is service-only'; end if;
  if v_provider not in ('TAP','THAWANI') then raise exception 'PAYMENT-OMAN provider must be TAP or THAWANI'; end if;
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb then
    raise exception 'PAYMENT-OMAN provider health evidence is required';
  end if;
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 240 then raise exception 'PAYMENT-OMAN request key is invalid'; end if;
  if not exists(
    select 1 from public.integration_connections
    where organization_id=p_organization_id and provider=v_provider and channel='PAYMENT' and enabled
  ) then raise exception 'PAYMENT-OMAN provider is not configured'; end if;

  v_status:=case when p_healthy then 'CONNECTED' else 'DEGRADED' end;
  update public.integration_connections
  set status=v_status,last_checked_at=statement_timestamp(),
      last_error=case when p_healthy then null else left(btrim(coalesce(p_detail,'Provider health check failed')),2000) end,
      updated_at=statement_timestamp()
  where organization_id=p_organization_id and provider=v_provider and channel='PAYMENT';

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'SYSTEM','payment_oman_adapter','PAYMENT_OMAN_PROVIDER_HEALTH_RECORDED',
    'integration_connection',v_provider||':PAYMENT',
    jsonb_build_object('provider',v_provider,'status',v_status,'detail',left(coalesce(p_detail,''),500),
      'evidence',p_evidence,'providerSuccessVerified',p_healthy),p_request_key
  );
  return v_status;
end;
$$;

revoke all on function public.integration_vault_secret_id(text) from public,anon,authenticated,service_role;
revoke all on function public.integration_vault_create_secret(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.integration_vault_update_secret(text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.integration_vault_read_secret(text) from public,anon,authenticated,service_role;
revoke all on function public.configure_oman_payment_provider_v1(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.record_oman_payment_provider_health_v1(uuid,text,boolean,text,jsonb,text) from public,anon,authenticated,service_role;

grant execute on function public.integration_vault_secret_id(text) to service_role;
grant execute on function public.integration_vault_create_secret(text,text,text) to service_role;
grant execute on function public.integration_vault_update_secret(text,text,text,text) to service_role;
grant execute on function public.integration_vault_read_secret(text) to service_role;
grant execute on function public.configure_oman_payment_provider_v1(uuid,uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.record_oman_payment_provider_health_v1(uuid,text,boolean,text,jsonb,text) to service_role;

comment on function public.configure_oman_payment_provider_v1(uuid,uuid,text,text,text,text,text,text) is
  'PAYMENT-OMAN credential/configuration gate. Plaintext credentials are written only to canonical Supabase Vault; integration_connections stores Vault references.';
comment on function public.record_oman_payment_provider_health_v1(uuid,text,boolean,text,jsonb,text) is
  'PAYMENT-OMAN provider readiness evidence. READY means configured; CONNECTED requires a successful real provider API interaction.';
