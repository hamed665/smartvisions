\set ON_ERROR_STOP on

begin;

create temp table chatwoot_vault_test_state (
  key text primary key,
  value text not null
) on commit drop;

set role service_role;

select public.chatwoot_vault_create_secret(
  'slice-c1-secret-v1',
  'chatwoot/ci/slice-c1/webhook',
  'CI synthetic Chatwoot secret'
) as secret_ref \gset

insert into chatwoot_vault_test_state(key, value)
values ('secret_ref', :'secret_ref');

do $$
declare
  v_ref text := (select value from chatwoot_vault_test_state where key='secret_ref');
  v_read text;
  v_replay text;
  v_found text;
begin
  if v_ref !~ '^secretref://supabase-vault/[0-9a-fA-F-]{36}$' then
    raise exception 'Chatwoot Vault create returned invalid secret reference';
  end if;

  select public.chatwoot_vault_read_secret(v_ref) into v_read;
  if v_read <> 'slice-c1-secret-v1' then
    raise exception 'Chatwoot Vault read returned wrong plaintext';
  end if;

  select public.chatwoot_vault_create_secret(
    'slice-c1-secret-v1',
    'chatwoot/ci/slice-c1/webhook',
    'CI synthetic Chatwoot secret'
  ) into v_replay;

  if v_replay <> v_ref then
    raise exception 'same Vault name + same secret did not replay the same reference';
  end if;

  select public.chatwoot_vault_find_secret_ref(
    'chatwoot/ci/slice-c1/webhook'
  ) into v_found;

  if v_found <> v_ref then
    raise exception 'Vault name reconciliation did not resolve the canonical reference';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.chatwoot_vault_create_secret(
      'different-secret',
      'chatwoot/ci/slice-c1/webhook',
      'collision'
    );
    raise exception 'same Vault name with different secret unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like 'Chatwoot Vault secret name already exists with different secret%' then
        raise;
      end if;
  end;
end;
$$;

select public.chatwoot_vault_update_secret(
  :'secret_ref',
  'slice-c1-secret-v2',
  null,
  'CI updated description'
) as updated_ref \gset

insert into chatwoot_vault_test_state(key, value)
values ('updated_ref', :'updated_ref');

do $$
declare
  v_ref text := (select value from chatwoot_vault_test_state where key='secret_ref');
  v_updated_ref text := (select value from chatwoot_vault_test_state where key='updated_ref');
  v_read text;
begin
  if v_updated_ref <> v_ref then
    raise exception 'Vault update changed the secret reference';
  end if;

  select public.chatwoot_vault_read_secret(v_ref) into v_read;
  if v_read <> 'slice-c1-secret-v2' then
    raise exception 'Vault update did not replace the secret value';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.chatwoot_vault_read_secret('secretref://supabase-vault/not-a-uuid');
    raise exception 'invalid Vault reference unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like 'invalid Chatwoot Vault secret reference%' then
        raise;
      end if;
  end;

  begin
    perform public.chatwoot_vault_update_secret(
      'secretref://supabase-vault/00000000-0000-0000-0000-000000000000',
      'x',
      null,
      null
    );
    raise exception 'unknown Vault reference unexpectedly updated';
  exception
    when others then
      if sqlerrm not like 'Chatwoot Vault secret reference not found%' then
        raise;
      end if;
  end;
end;
$$;

reset role;
set role authenticated;

do $$
begin
  begin
    perform public.chatwoot_vault_create_secret(
      'forbidden',
      'chatwoot/ci/forbidden',
      null
    );
    raise exception 'authenticated unexpectedly executed Chatwoot Vault wrapper';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  if not has_function_privilege(
    'service_role',
    'public.chatwoot_vault_create_secret(text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.chatwoot_vault_find_secret_ref(text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.chatwoot_vault_update_secret(text,text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.chatwoot_vault_read_secret(text)',
    'EXECUTE'
  ) then
    raise exception 'service_role is missing Chatwoot Vault wrapper execution';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.chatwoot_vault_create_secret(text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.chatwoot_vault_read_secret(text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.chatwoot_vault_read_secret(text)',
    'EXECUTE'
  ) then
    raise exception 'Chatwoot Vault wrappers are broader than service-role-only contract';
  end if;
end;
$$;


-- The bootstrap checks the wrapper contract; it deliberately does not emulate encryption.
-- Inspect the actual Vault extension's encrypted storage separately in a safe environment.
do $
declare
  v_fn record;
  v_role text;
begin
  for v_fn in
    select p.oid, p.proname, p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'chatwoot_vault_secret_id',
        'chatwoot_vault_create_secret',
        'chatwoot_vault_find_secret_ref',
        'chatwoot_vault_update_secret',
        'chatwoot_vault_read_secret'
      )
  loop
    if v_fn.prosecdef then
      raise exception 'Chatwoot Vault wrapper % must be SECURITY INVOKER', v_fn.proname;
    end if;
    if not has_function_privilege('service_role', v_fn.oid, 'EXECUTE') then
      raise exception 'service_role cannot execute Chatwoot Vault wrapper %', v_fn.proname;
    end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, v_fn.oid, 'EXECUTE') then
        raise exception '% can execute Chatwoot Vault wrapper %', v_role, v_fn.proname;
      end if;
    end loop;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (
        'chatwoot_vault_secret_id','chatwoot_vault_create_secret',
        'chatwoot_vault_find_secret_ref','chatwoot_vault_update_secret',
        'chatwoot_vault_read_secret')) <> 5 then
    raise exception 'Chatwoot Vault wrapper set is incomplete';
  end if;
end;
$;

do $
declare
  v_ref text := (select value from chatwoot_vault_test_state where key='secret_ref');
begin
  if (select count(*) from vault.secrets where name='chatwoot/ci/slice-c1/webhook') <> 1 then
    raise exception 'deterministic Vault name created duplicate rows';
  end if;
  if (select count(*) from vault.secrets where id=public.chatwoot_vault_secret_id(v_ref)) <> 1 then
    raise exception 'Vault reference does not identify the existing secret';
  end if;
end;
$;

rollback;
