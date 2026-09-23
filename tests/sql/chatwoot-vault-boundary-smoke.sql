\set ON_ERROR_STOP on

begin;

create temp table chatwoot_vault_test_state (
  key text primary key,
  value text not null
) on commit drop;

set role service_role;

select public.chatwoot_vault_create_secret(
  'synthetic-secret-v1',
  'chatwoot/test/inbox/webhook',
  'synthetic CI secret'
) as secret_ref \gset

insert into chatwoot_vault_test_state(key,value)
values ('secret_ref', :'secret_ref');

do $$
declare
  v_ref text := (select value from chatwoot_vault_test_state where key='secret_ref');
  v_secret text;
begin
  if v_ref !~ '^secretref://supabase-vault/[0-9a-f-]{36}$' then
    raise exception 'Vault create returned invalid reference';
  end if;

  select public.chatwoot_vault_read_secret(v_ref) into v_secret;
  if v_secret <> 'synthetic-secret-v1' then
    raise exception 'Vault read returned wrong secret';
  end if;
end;
$$;

select public.chatwoot_vault_update_secret(
  :'secret_ref',
  'synthetic-secret-v2',
  'chatwoot/test/inbox/webhook',
  'synthetic CI rotated secret'
) as updated_ref \gset

insert into chatwoot_vault_test_state(key,value)
values ('updated_ref', :'updated_ref');

do $$
declare
  v_ref text := (select value from chatwoot_vault_test_state where key='secret_ref');
  v_updated_ref text := (select value from chatwoot_vault_test_state where key='updated_ref');
  v_secret text;
begin
  if v_updated_ref <> v_ref then
    raise exception 'Vault update changed secret reference';
  end if;

  select public.chatwoot_vault_read_secret(v_ref) into v_secret;
  if v_secret <> 'synthetic-secret-v2' then
    raise exception 'Vault update did not rotate secret';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.chatwoot_vault_read_secret('secretref://supabase-vault/not-a-uuid');
    raise exception 'invalid Vault reference unexpectedly accepted';
  exception
    when others then
      if sqlerrm not like 'invalid Chatwoot Vault secret reference%' then
        raise;
      end if;
  end;

  begin
    perform public.chatwoot_vault_create_secret(
      'x',
      'not-chatwoot/test',
      'bad name'
    );
    raise exception 'invalid Vault name unexpectedly accepted';
  exception
    when others then
      if sqlerrm not like 'Chatwoot Vault secret name is invalid%' then
        raise;
      end if;
  end;
end;
$$;

reset role;

do $$
begin
  if has_function_privilege(
       'authenticated',
       'public.chatwoot_vault_create_secret(text,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.chatwoot_vault_update_secret(text,text,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.chatwoot_vault_read_secret(text)',
       'EXECUTE'
     )
  then
    raise exception 'authenticated unexpectedly has Chatwoot Vault wrapper access';
  end if;

  if not has_function_privilege(
       'service_role',
       'public.chatwoot_vault_create_secret(text,text,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.chatwoot_vault_update_secret(text,text,text,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.chatwoot_vault_read_secret(text)',
       'EXECUTE'
     )
  then
    raise exception 'service_role Chatwoot Vault wrapper access missing';
  end if;
end;
$$;

rollback;
