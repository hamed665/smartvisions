-- 0101: Meta WhatsApp tenant-bound destination and credential authority.
--
-- Extends the existing communication_channel_bindings authority. It does not
-- create another integration source of truth or another secret store.
-- Access tokens stay in Supabase Vault; only opaque Vault UUID references are
-- stored on the canonical tenant/business/branch binding.

alter table public.communication_channel_bindings
  add column if not exists provider text,
  add column if not exists provider_account_id text,
  add column if not exists provider_destination_id text,
  add column if not exists provider_destination_label text,
  add column if not exists provider_secret_ref uuid;

alter table public.communication_channel_bindings
  add constraint communication_channel_bindings_provider_check
  check (
    provider is null
    or (
      length(trim(provider)) between 1 and 40
      and provider = upper(provider)
      and provider ~ '^[A-Z0-9_-]+$'
    )
  ),
  add constraint communication_channel_bindings_provider_account_id_check
  check (
    provider_account_id is null
    or length(trim(provider_account_id)) between 1 and 200
  ),
  add constraint communication_channel_bindings_provider_destination_id_check
  check (
    provider_destination_id is null
    or length(trim(provider_destination_id)) between 1 and 200
  ),
  add constraint communication_channel_bindings_provider_destination_label_check
  check (
    provider_destination_label is null
    or length(trim(provider_destination_label)) between 1 and 200
  );

create unique index communication_channel_bindings_active_provider_destination
  on public.communication_channel_bindings(channel, provider, provider_destination_id)
  where status = 'ACTIVE'
    and provider_destination_id is not null;

create index communication_channel_bindings_provider_account_idx
  on public.communication_channel_bindings(organization_id, channel, provider, provider_account_id)
  where status = 'ACTIVE'
    and provider_account_id is not null;

create or replace function public.resolve_meta_whatsapp_destination(
  p_phone_number_id text,
  p_waba_id text default null
)
returns table(
  organization_id uuid,
  tenant_business_id uuid,
  branch_id uuid,
  binding_id uuid,
  integration_connection_id uuid,
  phone_number_id text,
  waba_id text
)
language plpgsql
security definer
set search_path = public, vault, pg_catalog
as $$
declare
  v_phone text := trim(coalesce(p_phone_number_id, ''));
  v_waba text := nullif(trim(coalesce(p_waba_id, '')), '');
begin
  if length(v_phone) not between 1 and 200
     or (v_waba is not null and length(v_waba) > 200)
  then
    raise exception 'invalid Meta WhatsApp destination';
  end if;

  return query
  select b.organization_id,
         b.tenant_business_id,
         b.branch_id,
         b.id,
         b.integration_connection_id,
         b.provider_destination_id,
         b.provider_account_id
    from public.communication_channel_bindings b
    join public.integration_connections ic
      on ic.id = b.integration_connection_id
     and ic.organization_id = b.organization_id
   where b.status = 'ACTIVE'
     and b.channel = 'WHATSAPP'
     and b.provider = 'META'
     and b.provider_destination_id = v_phone
     and (v_waba is null or b.provider_account_id = v_waba)
     and ic.enabled = true
     and ic.status = 'CONNECTED'
     and ic.provider = 'META'
     and ic.channel = 'WHATSAPP'
   limit 1;
end;
$$;

create or replace function public.resolve_meta_whatsapp_credential(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid default null
)
returns table(
  binding_id uuid,
  integration_connection_id uuid,
  phone_number_id text,
  waba_id text,
  access_token text
)
language plpgsql
security definer
set search_path = public, vault, pg_catalog
as $$
declare
  v_binding public.communication_channel_bindings%rowtype;
  v_secret text;
begin
  if p_organization_id is null or p_tenant_business_id is null then
    raise exception 'Meta WhatsApp tenant credential scope is required';
  end if;

  select b.*
    into v_binding
    from public.communication_channel_bindings b
    join public.integration_connections ic
      on ic.id = b.integration_connection_id
     and ic.organization_id = b.organization_id
   where b.organization_id = p_organization_id
     and b.tenant_business_id = p_tenant_business_id
     and b.status = 'ACTIVE'
     and b.channel = 'WHATSAPP'
     and b.provider = 'META'
     and b.provider_destination_id is not null
     and b.provider_secret_ref is not null
     and ic.enabled = true
     and ic.status = 'CONNECTED'
     and ic.provider = 'META'
     and ic.channel = 'WHATSAPP'
     and (
       (p_branch_id is not null and b.branch_id = p_branch_id)
       or (p_branch_id is null and b.branch_id is null)
     )
   order by b.updated_at desc, b.id desc
   limit 2;

  if not found then
    raise exception 'Meta WhatsApp tenant credential is not configured';
  end if;

  if exists (
    select 1
      from public.communication_channel_bindings sibling
      join public.integration_connections sic
        on sic.id = sibling.integration_connection_id
       and sic.organization_id = sibling.organization_id
     where sibling.organization_id = p_organization_id
       and sibling.tenant_business_id = p_tenant_business_id
       and sibling.status = 'ACTIVE'
       and sibling.channel = 'WHATSAPP'
       and sibling.provider = 'META'
       and sibling.provider_destination_id is not null
       and sibling.provider_secret_ref is not null
       and sic.enabled = true
       and sic.status = 'CONNECTED'
       and sic.provider = 'META'
       and sic.channel = 'WHATSAPP'
       and (
         (p_branch_id is not null and sibling.branch_id = p_branch_id)
         or (p_branch_id is null and sibling.branch_id is null)
       )
       and sibling.id <> v_binding.id
  ) then
    raise exception 'Meta WhatsApp tenant credential is ambiguous';
  end if;

  select ds.decrypted_secret
    into v_secret
    from vault.decrypted_secrets ds
   where ds.id = v_binding.provider_secret_ref;

  if v_secret is null or length(trim(v_secret)) < 20 then
    raise exception 'Meta WhatsApp tenant credential secret is unavailable';
  end if;

  return query
  select v_binding.id,
         v_binding.integration_connection_id,
         v_binding.provider_destination_id,
         v_binding.provider_account_id,
         v_secret;
end;
$$;

revoke all on function public.resolve_meta_whatsapp_destination(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_meta_whatsapp_destination(text,text)
  to service_role;

revoke all on function public.resolve_meta_whatsapp_credential(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_meta_whatsapp_credential(uuid,uuid,uuid)
  to service_role;
