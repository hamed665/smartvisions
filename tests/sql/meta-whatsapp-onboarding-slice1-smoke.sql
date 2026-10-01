\set ON_ERROR_STOP on
begin;

do $slice1$
declare
  v_rls boolean;
  v_mode_constraint text;
  v_start_def text;
  v_complete_def text;
  v_internal_def text;
begin
  select c.relrowsecurity
    into v_rls
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public'
     and c.relname='communication_channel_setup_attempts';

  if v_rls is distinct from true then
    raise exception 'setup attempts must have RLS enabled';
  end if;

  select pg_get_constraintdef(c.oid)
    into v_mode_constraint
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
   where n.nspname='public'
     and t.relname='communication_channel_setup_attempts'
     and pg_get_constraintdef(c.oid) like '%connection_mode%';

  if v_mode_constraint is null
     or v_mode_constraint not like '%BUSINESS_APP_COEXISTENCE%'
     or v_mode_constraint not like '%API_NEW_NUMBER%'
     or v_mode_constraint not like '%EXISTING_API_RECONNECT%'
     or v_mode_constraint like '%FULL_MIGRATION_FROM_BUSINESS_APP%'
  then
    raise exception 'non-destructive WhatsApp connection mode contract drifted';
  end if;

  select pg_get_functiondef(p.oid) into v_start_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='start_meta_whatsapp_setup_attempt';

  select pg_get_functiondef(p.oid) into v_complete_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='complete_meta_whatsapp_setup_attempt';

  select pg_get_functiondef(p.oid) into v_internal_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname='apply_meta_whatsapp_binding_credential_internal';

  if v_start_def is null
     or v_start_def not like '%Organization OWNER required%'
     or v_start_def not like '%SUPERSEDED%'
  then raise exception 'setup-attempt start boundary is incomplete'; end if;

  if v_complete_def is null
     or v_complete_def not like '%apply_meta_whatsapp_binding_credential_internal%'
     or v_complete_def not like '%setup attempt is stale or not completable%'
  then raise exception 'trusted setup completion boundary is incomplete'; end if;

  if v_internal_def is null
     or v_internal_def not like '%vault.create_secret%'
     or v_internal_def not like '%vault.update_secret%'
  then raise exception 'trusted Vault mutation boundary is incomplete'; end if;

  if has_function_privilege('authenticated',
       'public.configure_meta_whatsapp_binding(uuid,uuid,integer,text,text,text,text,text)',
       'EXECUTE')
  then raise exception 'legacy authenticated Vault mutation path is still executable'; end if;

  if has_function_privilege('authenticated',
       'public.start_meta_whatsapp_setup_attempt(uuid,uuid,integer,text,text,uuid,text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.start_meta_whatsapp_setup_attempt(uuid,uuid,integer,text,text,uuid,text)',
       'EXECUTE')
  then raise exception 'setup-attempt start ACL drifted'; end if;

  if has_function_privilege('authenticated',
       'public.complete_meta_whatsapp_setup_attempt(uuid,uuid,uuid,integer,text,text,text,text,uuid,text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.complete_meta_whatsapp_setup_attempt(uuid,uuid,uuid,integer,text,text,text,text,uuid,text)',
       'EXECUTE')
  then raise exception 'setup completion ACL drifted'; end if;

  if has_table_privilege('authenticated','public.communication_channel_setup_attempts','SELECT')
     or has_table_privilege('authenticated','public.communication_channel_setup_attempts','INSERT')
     or has_table_privilege('authenticated','public.communication_channel_setup_attempts','UPDATE')
  then raise exception 'authenticated role must not directly access setup-attempt state'; end if;
end;
$slice1$;

rollback;
