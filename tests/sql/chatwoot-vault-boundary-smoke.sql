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

do $$
declare
  v_ref text := (select value from chatwoot_vault_test_state where key='secret_ref');
  v_read text;
begin
  if :'updated_ref' <> v_ref then
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

rollback;
