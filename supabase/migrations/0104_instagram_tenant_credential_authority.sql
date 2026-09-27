-- Smart Visions AI Business OS 2027
-- OMNI-META-SOCIAL: tenant-bound Instagram credential authority.
-- Reuses communication_channel_bindings + Supabase Vault. No outbound activation.

create or replace function public.configure_meta_instagram_binding(
  p_organization_id uuid,
  p_binding_id uuid,
  p_expected_version integer,
  p_provider_account_id text,
  p_destination_id text,
  p_destination_label text,
  p_access_token text,
  p_request_key text
)
returns public.communication_channel_bindings
language plpgsql
security invoker
set search_path = public, auth, vault, pg_catalog
as $$
declare
  v_current public.communication_channel_bindings%rowtype;
  v_updated public.communication_channel_bindings%rowtype;
  v_actor uuid := auth.uid();
  v_account text := trim(coalesce(p_provider_account_id, ''));
  v_destination text := trim(coalesce(p_destination_id, ''));
  v_label text := nullif(trim(coalesce(p_destination_label, '')), '');
  v_token text := trim(coalesce(p_access_token, ''));
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_secret_id uuid;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Meta Instagram binding configuration not permitted';
  end if;
  if p_expected_version is null or p_expected_version < 1
     or length(v_account) not between 1 and 200
     or length(v_destination) not between 1 and 200
     or length(v_token) < 20
     or length(v_request_key) not between 1 and 200
     or (v_label is not null and length(v_label) > 200)
  then
    raise exception 'invalid Meta Instagram binding configuration';
  end if;

  select * into v_current
    from public.communication_channel_bindings b
   where b.organization_id = p_organization_id and b.id = p_binding_id
   for update;

  if not found
     or v_current.channel <> 'INSTAGRAM'
     or v_current.status <> 'ACTIVE'
     or v_current.version <> p_expected_version
  then
    raise exception 'Meta Instagram binding is not eligible for configuration';
  end if;

  if exists (
    select 1 from public.communication_channel_bindings sibling
     where sibling.status='ACTIVE'
       and sibling.channel='INSTAGRAM'
       and sibling.provider='META'
       and sibling.provider_destination_id=v_destination
       and sibling.id<>v_current.id
  ) then raise exception 'Meta Instagram destination is already bound'; end if;

  if v_current.provider_secret_ref is null then
    v_secret_id := vault.create_secret(
      v_token,
      'meta_instagram_binding_' || replace(v_current.id::text, '-', ''),
      'Smart Visions tenant-bound Meta Instagram access token',
      null
    );
  else
    perform vault.update_secret(
      v_current.provider_secret_ref, v_token, null,
      'Smart Visions tenant-bound Meta Instagram access token', null
    );
    v_secret_id := v_current.provider_secret_ref;
  end if;

  update public.communication_channel_bindings
     set provider='META',
         provider_account_id=v_account,
         provider_destination_id=v_destination,
         provider_destination_label=v_label,
         provider_secret_ref=v_secret_id,
         version=version+1,
         last_request_key=v_request_key,
         updated_by_user_id=v_actor
   where organization_id=p_organization_id and id=p_binding_id and version=p_expected_version
   returning * into v_updated;

  if not found then raise exception 'Meta Instagram binding configuration lost optimistic lock'; end if;
  return v_updated;
end;
$$;

create or replace function public.resolve_meta_instagram_credential(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid default null
)
returns table(
  binding_id uuid,
  integration_connection_id uuid,
  destination_id text,
  provider_account_id text,
  access_token text
)
language plpgsql
security definer
set search_path = public, vault, pg_catalog
as $$
declare
  v_binding public.communication_channel_bindings%rowtype;
  v_secret text;
  v_count integer;
begin
  if p_organization_id is null or p_tenant_business_id is null then
    raise exception 'Meta Instagram tenant credential scope is required';
  end if;

  select count(*) into v_count
    from public.communication_channel_bindings b
    join public.integration_connections ic
      on ic.id=b.integration_connection_id and ic.organization_id=b.organization_id
   where b.organization_id=p_organization_id
     and b.tenant_business_id=p_tenant_business_id
     and b.status='ACTIVE' and b.channel='INSTAGRAM' and b.provider='META'
     and b.provider_destination_id is not null and b.provider_secret_ref is not null
     and ic.enabled=true and ic.status='CONNECTED' and ic.provider='META' and ic.channel='INSTAGRAM'
     and ((p_branch_id is not null and b.branch_id=p_branch_id)
       or (p_branch_id is null and b.branch_id is null));

  if v_count=0 then raise exception 'Meta Instagram tenant credential is not configured';
  elsif v_count>1 then raise exception 'Meta Instagram tenant credential is ambiguous'; end if;

  select b.* into v_binding
    from public.communication_channel_bindings b
    join public.integration_connections ic
      on ic.id=b.integration_connection_id and ic.organization_id=b.organization_id
   where b.organization_id=p_organization_id
     and b.tenant_business_id=p_tenant_business_id
     and b.status='ACTIVE' and b.channel='INSTAGRAM' and b.provider='META'
     and b.provider_destination_id is not null and b.provider_secret_ref is not null
     and ic.enabled=true and ic.status='CONNECTED' and ic.provider='META' and ic.channel='INSTAGRAM'
     and ((p_branch_id is not null and b.branch_id=p_branch_id)
       or (p_branch_id is null and b.branch_id is null));

  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds
   where ds.id=v_binding.provider_secret_ref;
  if v_secret is null or length(trim(v_secret))<20 then
    raise exception 'Meta Instagram tenant credential secret is unavailable';
  end if;

  return query select v_binding.id, v_binding.integration_connection_id,
    v_binding.provider_destination_id, v_binding.provider_account_id, v_secret;
end;
$$;

revoke all on function public.configure_meta_instagram_binding(uuid,uuid,integer,text,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.configure_meta_instagram_binding(uuid,uuid,integer,text,text,text,text,text)
  to authenticated;

revoke all on function public.resolve_meta_instagram_credential(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_meta_instagram_credential(uuid,uuid,uuid)
  to service_role;
