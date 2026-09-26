\set ON_ERROR_STOP on
begin;

do $meta_routing_contract$
declare
  v_columns integer;
  v_destination_def text;
  v_credential_def text;
  v_configure_def text;
begin
  select count(*) into v_columns
    from information_schema.columns
   where table_schema='public'
     and table_name='communication_channel_bindings'
     and column_name in (
       'provider','provider_account_id','provider_destination_id',
       'provider_destination_label','provider_secret_ref'
     );
  if v_columns <> 5 then
    raise exception 'Meta WhatsApp binding columns are incomplete';
  end if;

  select pg_get_functiondef(p.oid) into v_destination_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='resolve_meta_whatsapp_destination';
  select pg_get_functiondef(p.oid) into v_credential_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='resolve_meta_whatsapp_credential';
  select pg_get_functiondef(p.oid) into v_configure_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='configure_meta_whatsapp_binding';

  if v_destination_def is null
     or v_destination_def not like '%provider_destination_id%'
     or v_destination_def not like '%provider_account_id%'
  then raise exception 'Meta destination resolver is incomplete'; end if;

  if v_credential_def is null
     or v_credential_def not like '%vault.decrypted_secrets%'
     or v_credential_def not like '%credential is ambiguous%'
  then raise exception 'Meta credential resolver is incomplete'; end if;

  if v_configure_def is null
     or v_configure_def not like '%vault.create_secret%'
     or v_configure_def not like '%vault.update_secret%'
  then raise exception 'Meta governed credential setup is incomplete'; end if;

  if not has_function_privilege(
       'service_role',
       'public.resolve_meta_whatsapp_destination(text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.resolve_meta_whatsapp_destination(text,text)',
       'EXECUTE'
     )
  then raise exception 'Meta destination resolver ACL drifted'; end if;

  if not has_function_privilege(
       'service_role',
       'public.resolve_meta_whatsapp_credential(uuid,uuid,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.resolve_meta_whatsapp_credential(uuid,uuid,uuid)',
       'EXECUTE'
     )
  then raise exception 'Meta credential resolver ACL drifted'; end if;
end;
$meta_routing_contract$;

rollback;
