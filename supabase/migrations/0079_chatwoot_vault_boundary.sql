-- Smart Visions AI Business OS 2027
-- COMM-TENANT-BRIDGE / Slice C1 — Vault secret boundary
--
-- Uses the installed Supabase Vault extension through SECURITY INVOKER wrappers.
-- Only service_role may execute these wrappers.
-- No secret plaintext is persisted in Smart Core mapping/audit tables.

create or replace function public.chatwoot_vault_secret_id(
  p_secret_ref text
)
returns uuid
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
declare
  v_ref text := trim(coalesce(p_secret_ref, ''));
  v_id_text text;
begin
  if v_ref !~ '^secretref://supabase-vault/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'invalid Chatwoot Vault secret reference';
  end if;

  v_id_text := substring(v_ref from length('secretref://supabase-vault/') + 1);
  return v_id_text::uuid;
end;
$$;

create or replace function public.chatwoot_vault_create_secret(
  p_secret text,
  p_name text,
  p_description text default null
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_secret text := coalesce(p_secret, '');
  v_name text := trim(coalesce(p_name, ''));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_id uuid;
  v_existing_secret text;
begin
  if length(v_secret) < 1 or length(v_secret) > 16384 then
    raise exception 'Chatwoot Vault secret length is invalid';
  end if;

  if v_name !~ '^chatwoot/[A-Za-z0-9/_:.-]{1,180}$' then
    raise exception 'Chatwoot Vault secret name is invalid';
  end if;

  if v_description is not null and length(v_description) > 500 then
    raise exception 'Chatwoot Vault secret description is too long';
  end if;

  select ds.id, ds.decrypted_secret
    into v_id, v_existing_secret
  from vault.decrypted_secrets ds
  where ds.name = v_name;

  if found then
    if v_existing_secret <> v_secret then
      raise exception 'Chatwoot Vault secret name already exists with different secret';
    end if;

    return 'secretref://supabase-vault/' || v_id::text;
  end if;

  begin
    select vault.create_secret(
      v_secret,
      v_name,
      coalesce(v_description, ''),
      null
    ) into v_id;
  exception
    when unique_violation then
      select ds.id, ds.decrypted_secret
        into v_id, v_existing_secret
      from vault.decrypted_secrets ds
      where ds.name = v_name;

      if not found or v_existing_secret <> v_secret then
        raise exception 'Chatwoot Vault secret name collision requires reconciliation';
      end if;
  end;

  if v_id is null then
    raise exception 'Chatwoot Vault secret creation returned no identifier';
  end if;

  return 'secretref://supabase-vault/' || v_id::text;
end;
$$;

create or replace function public.chatwoot_vault_find_secret_ref(
  p_name text
)
returns text
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_name !~ '^chatwoot/[A-Za-z0-9/_:.-]{1,180}$' then
    raise exception 'Chatwoot Vault secret name is invalid';
  end if;

  select s.id
    into v_id
  from vault.secrets s
  where s.name = v_name;

  if not found then
    return null;
  end if;

  return 'secretref://supabase-vault/' || v_id::text;
end;
$$;

create or replace function public.chatwoot_vault_update_secret(
  p_secret_ref text,
  p_secret text,
  p_name text default null,
  p_description text default null
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_id uuid := public.chatwoot_vault_secret_id(p_secret_ref);
  v_secret text := coalesce(p_secret, '');
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_description text := nullif(trim(coalesce(p_description, '')), '');
begin
  if length(v_secret) < 1 or length(v_secret) > 16384 then
    raise exception 'Chatwoot Vault secret length is invalid';
  end if;

  if v_name is not null and v_name !~ '^chatwoot/[A-Za-z0-9/_:.-]{1,180}$' then
    raise exception 'Chatwoot Vault secret name is invalid';
  end if;

  if v_description is not null and length(v_description) > 500 then
    raise exception 'Chatwoot Vault secret description is too long';
  end if;

  if not exists (
    select 1
    from vault.secrets s
    where s.id = v_id
  ) then
    raise exception 'Chatwoot Vault secret reference not found';
  end if;

  perform vault.update_secret(
    v_id,
    v_secret,
    v_name,
    v_description,
    null
  );

  return 'secretref://supabase-vault/' || v_id::text;
end;
$$;

create or replace function public.chatwoot_vault_read_secret(
  p_secret_ref text
)
returns text
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  v_id uuid := public.chatwoot_vault_secret_id(p_secret_ref);
  v_secret text;
begin
  select ds.decrypted_secret
    into v_secret
  from vault.decrypted_secrets ds
  where ds.id = v_id;

  if not found then
    raise exception 'Chatwoot Vault secret reference not found';
  end if;

  return v_secret;
end;
$$;

revoke all on function public.chatwoot_vault_secret_id(text)
  from public, anon, authenticated, service_role;
revoke all on function public.chatwoot_vault_create_secret(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.chatwoot_vault_find_secret_ref(text)
  from public, anon, authenticated, service_role;
grant execute on function public.chatwoot_vault_find_secret_ref(text)
  to service_role;
revoke all on function public.chatwoot_vault_update_secret(text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.chatwoot_vault_read_secret(text)
  from public, anon, authenticated, service_role;

grant execute on function public.chatwoot_vault_secret_id(text)
  to service_role;
grant execute on function public.chatwoot_vault_create_secret(text, text, text)
  to service_role;
grant execute on function public.chatwoot_vault_update_secret(text, text, text, text)
  to service_role;
grant execute on function public.chatwoot_vault_read_secret(text)
  to service_role;
