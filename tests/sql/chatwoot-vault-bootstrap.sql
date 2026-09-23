-- CI-only Supabase Vault contract bootstrap.
-- This emulates function/view signatures only; it does NOT emulate Vault encryption.

create schema if not exists vault;

create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  secret text not null,
  name text unique,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace view vault.decrypted_secrets
with (security_invoker = true)
as
select
  id,
  secret,
  secret as decrypted_secret,
  name,
  description,
  created_at,
  updated_at
from vault.secrets;

create or replace function vault.create_secret(
  new_secret text,
  new_name text default null,
  new_description text default '',
  new_key_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = vault, pg_catalog
as $$
declare
  v_id uuid;
begin
  insert into vault.secrets(secret, name, description)
  values (new_secret, new_name, coalesce(new_description, ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function vault.update_secret(
  secret_id uuid,
  new_secret text default null,
  new_name text default null,
  new_description text default null,
  new_key_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = vault, pg_catalog
as $$
begin
  update vault.secrets
  set secret=coalesce(new_secret, secret),
      name=coalesce(new_name, name),
      description=coalesce(new_description, description),
      updated_at=now()
  where id=secret_id;
end;
$$;

revoke all on schema vault from public, anon, authenticated, service_role;
revoke all on table vault.secrets from public, anon, authenticated, service_role;
revoke all on table vault.decrypted_secrets from public, anon, authenticated, service_role;
revoke all on function vault.create_secret(text,text,text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function vault.update_secret(uuid,text,text,text,uuid)
  from public, anon, authenticated, service_role;

grant usage on schema vault to service_role;
grant select, insert, update on table vault.secrets to service_role;
grant select on table vault.decrypted_secrets to service_role;
grant execute on function vault.create_secret(text,text,text,uuid) to service_role;
grant execute on function vault.update_secret(uuid,text,text,text,uuid) to service_role;
