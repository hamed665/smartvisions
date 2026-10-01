\set ON_ERROR_STOP on
begin;

do $slice3$
declare
  v_count integer;
  v_constraint text;
  v_owner_def text;
  v_context_def text;
  v_remote_def text;
begin
  select count(*)
    into v_count
    from information_schema.columns
   where table_schema='public'
     and table_name='communication_channel_setup_attempts'
     and column_name in ('completion_actor_type','completion_actor_ref');

  if v_count <> 2 then
    raise exception 'Slice 3 completion provenance columns are incomplete';
  end if;

  select pg_get_constraintdef(c.oid)
    into v_constraint
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
   where n.nspname='public'
     and t.relname='communication_channel_setup_attempts'
     and c.conname='communication_channel_setup_attempts_completion_pair_check';

  if v_constraint is null
     or v_constraint not like '%REMOTE_SETUP%'
     or v_constraint not like '%WHATSAPP_SETUP%'
     or v_constraint not like '%OWNER%'
  then
    raise exception 'Slice 3 completion provenance constraint drifted';
  end if;

  select pg_get_functiondef(p.oid) into v_owner_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='complete_meta_whatsapp_setup_attempt';

  select pg_get_functiondef(p.oid) into v_context_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='get_meta_whatsapp_remote_setup_context';

  select pg_get_functiondef(p.oid) into v_remote_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='complete_meta_whatsapp_remote_setup_attempt';

  if v_owner_def is null
     or v_owner_def not like '%Organization OWNER required%'
     or v_owner_def not like '%completion_actor_type = ''OWNER''%'
     or v_owner_def not like '%official WhatsApp Business App coexistence completion is not enabled yet%'
  then
    raise exception 'owner completion boundary or provenance drifted';
  end if;

  if v_context_def is null
     or v_context_def not like '%a.status in (''AUTHORIZED'', ''COMPLETED'')%'
     or v_context_def not like '%b.version = (a.binding_version + 1)%'
     or v_context_def not like '%remote_setup_session_token_hash%'
  then
    raise exception 'remote resume/replay context boundary drifted';
  end if;

  if v_remote_def is null
     or v_remote_def not like '%apply_meta_whatsapp_binding_credential_internal%'
     or v_remote_def not like '%remote_setup_session_token_hash%'
     or v_remote_def not like '%completion_actor_type = ''REMOTE_SETUP''%'
     or v_remote_def not like '%completion_actor_ref = ''WHATSAPP_SETUP''%'
     or v_remote_def not like '%official WhatsApp Business App coexistence completion is not enabled yet%'
     or v_remote_def not like '%META_WHATSAPP_REMOTE_SETUP_COMPLETED%'
  then
    raise exception 'remote trusted completion boundary drifted';
  end if;

  if has_function_privilege('anon',
       'public.complete_meta_whatsapp_remote_setup_attempt(uuid,uuid,integer,text,text,text,text,text,text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.complete_meta_whatsapp_remote_setup_attempt(uuid,uuid,integer,text,text,text,text,text,text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.complete_meta_whatsapp_remote_setup_attempt(uuid,uuid,integer,text,text,text,text,text,text)',
       'EXECUTE')
  then
    raise exception 'remote completion ACL drifted';
  end if;

  if has_function_privilege('anon',
       'public.get_meta_whatsapp_remote_setup_context(text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.get_meta_whatsapp_remote_setup_context(text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.get_meta_whatsapp_remote_setup_context(text)',
       'EXECUTE')
  then
    raise exception 'remote context ACL drifted';
  end if;

  if has_table_privilege('anon','public.communication_channel_setup_attempts','SELECT')
     or has_table_privilege('authenticated','public.communication_channel_setup_attempts','SELECT')
  then
    raise exception 'remote wizard must not expose setup-attempt state directly';
  end if;
end;
$slice3$;

rollback;
