\set ON_ERROR_STOP on
begin;

do $slice8$
declare
  v_destination_def text;
  v_credential_def text;
  v_apply_def text;
  v_disconnect_def text;
  v_health_def text;
  v_start_def text;
begin
  select pg_get_functiondef(p.oid) into v_destination_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='resolve_meta_whatsapp_destination';

  select pg_get_functiondef(p.oid) into v_credential_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='resolve_meta_whatsapp_credential';

  select pg_get_functiondef(p.oid) into v_apply_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname='apply_meta_whatsapp_binding_credential_internal';

  select pg_get_functiondef(p.oid) into v_disconnect_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='disconnect_meta_whatsapp_binding';

  select pg_get_functiondef(p.oid) into v_health_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='mark_meta_whatsapp_binding_health';

  select pg_get_functiondef(p.oid) into v_start_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='start_meta_whatsapp_setup_attempt';

  if v_destination_def is null
     or v_destination_def not like '%MANUAL_DISCONNECTED%'
     or v_destination_def not like '%META_CREDENTIAL_INVALID_OR_REVOKED%'
     or v_destination_def not like '%META_CREDENTIAL_HEALTH_UNCONFIRMED%'
     or v_destination_def not like '%META_PROVIDER_SUBSCRIPTION_MISSING%'
     or v_destination_def not like '%ic.status = ''CONNECTED''%'
  then raise exception 'Meta WhatsApp inbound routing does not fail closed on Slice 8 lifecycle state'; end if;

  if v_credential_def is null
     or v_credential_def not like '%MANUAL_DISCONNECTED%'
     or v_credential_def not like '%META_CREDENTIAL_INVALID_OR_REVOKED%'
     or v_credential_def not like '%META_CREDENTIAL_HEALTH_UNCONFIRMED%'
     or v_credential_def not like '%META_PROVIDER_SUBSCRIPTION_MISSING%'
     or v_credential_def not like '%vault.decrypted_secrets%'
  then raise exception 'Meta WhatsApp outbound credential resolution does not fail closed on Slice 8 lifecycle state'; end if;

  if v_apply_def is null
     or v_apply_def not like '%reconnect WABA identity changed%'
     or v_apply_def not like '%reconnect phone identity changed%'
     or v_apply_def not like '%vault.update_secret%'
     or v_apply_def not like '%version = version + 1%'
     or v_apply_def not like '%last_error_code = null%'
  then raise exception 'same-binding Meta WhatsApp reconnect identity/credential rotation drifted'; end if;

  if v_start_def is null
     or v_start_def not like '%EXISTING_API_RECONNECT%'
     or v_start_def not like '%RECONNECT%'
     or v_start_def like '%FULL_MIGRATION_FROM_BUSINESS_APP%'
  then raise exception 'bounded same-binding reconnect attempt contract drifted'; end if;

  if v_disconnect_def is null
     or v_disconnect_def not like '%Organization OWNER required%'
     or v_disconnect_def not like '%MANUAL_DISCONNECTED%'
     or v_disconnect_def not like '%SUPERSEDED%'
     or v_disconnect_def not like '%lifecycle_status = ''DEGRADED''%'
     or v_disconnect_def not like '%mobile_whatsapp_account_changed%'
     or v_disconnect_def not like '%false%'
  then raise exception 'safe Meta WhatsApp disconnect contract drifted'; end if;

  if v_health_def is null
     or v_health_def not like '%Organization OWNER required%'
     or v_health_def not like '%CREDENTIAL_INVALID%'
     or v_health_def not like '%UNCONFIRMED%'
     or v_health_def not like '%SUBSCRIPTION_MISSING%'
     or v_health_def not like '%META_PROVIDER_SUBSCRIPTION_MISSING%'
     or v_health_def not like '%version = version + 1%'
     or v_health_def not like '%p_expected_version%'
  then raise exception 'Meta WhatsApp credential/subscription health contract drifted'; end if;

  if has_function_privilege('anon',
       'public.disconnect_meta_whatsapp_binding(uuid,uuid,integer,uuid,text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.disconnect_meta_whatsapp_binding(uuid,uuid,integer,uuid,text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.disconnect_meta_whatsapp_binding(uuid,uuid,integer,uuid,text)',
       'EXECUTE')
  then raise exception 'Meta WhatsApp disconnect ACL drifted'; end if;

  if has_function_privilege('anon',
       'public.mark_meta_whatsapp_binding_health(uuid,uuid,integer,text,uuid,text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.mark_meta_whatsapp_binding_health(uuid,uuid,integer,text,uuid,text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.mark_meta_whatsapp_binding_health(uuid,uuid,integer,text,uuid,text)',
       'EXECUTE')
  then raise exception 'Meta WhatsApp health ACL drifted'; end if;

  if has_function_privilege('anon',
       'public.resolve_meta_whatsapp_destination(text,text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.resolve_meta_whatsapp_destination(text,text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.resolve_meta_whatsapp_destination(text,text)',
       'EXECUTE')
  then raise exception 'Meta WhatsApp inbound resolver ACL drifted'; end if;

  if has_function_privilege('anon',
       'public.resolve_meta_whatsapp_credential(uuid,uuid,uuid)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.resolve_meta_whatsapp_credential(uuid,uuid,uuid)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.resolve_meta_whatsapp_credential(uuid,uuid,uuid)',
       'EXECUTE')
  then raise exception 'Meta WhatsApp credential resolver ACL drifted'; end if;
end;
$slice8$;

rollback;
