\set ON_ERROR_STOP on
begin;

do $slice2$
declare
  v_count integer;
  v_issue_def text;
  v_redeem_def text;
  v_context_def text;
  v_revoke_def text;
begin
  select count(*)
    into v_count
    from information_schema.columns
   where table_schema='public'
     and table_name='communication_channel_setup_attempts'
     and column_name in (
       'remote_setup_invitation_token_hash',
       'remote_setup_invitation_created_at',
       'remote_setup_invitation_expires_at',
       'remote_setup_invitation_redeemed_at',
       'remote_setup_session_token_hash',
       'remote_setup_session_expires_at',
       'remote_setup_revoked_at'
     );

  if v_count <> 7 then
    raise exception 'WhatsApp remote setup child state is incomplete';
  end if;

  select count(*)
    into v_count
    from pg_indexes
   where schemaname='public'
     and tablename='communication_channel_setup_attempts'
     and indexname in (
       'communication_channel_setup_attempts_remote_invite_hash_uidx',
       'communication_channel_setup_attempts_remote_session_hash_uidx'
     );

  if v_count <> 2 then
    raise exception 'WhatsApp remote setup hash uniqueness indexes are incomplete';
  end if;

  select pg_get_functiondef(p.oid) into v_issue_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='issue_meta_whatsapp_remote_setup_invite';

  select pg_get_functiondef(p.oid) into v_redeem_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='redeem_meta_whatsapp_remote_setup_invite';

  select pg_get_functiondef(p.oid) into v_context_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='get_meta_whatsapp_remote_setup_context';

  select pg_get_functiondef(p.oid) into v_revoke_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='revoke_meta_whatsapp_remote_setup_invite';

  if v_issue_def is null
     or v_issue_def not like '%Organization OWNER required%'
     or v_issue_def not like '%30 minutes%'
     or v_issue_def not like '%WHATSAPP_SETUP%'
     or v_issue_def like '%vault.%'
  then raise exception 'remote setup invitation issue boundary drifted'; end if;

  if v_redeem_def is null
     or v_redeem_def not like '%20 minutes%'
     or v_redeem_def not like '%AUTHORIZED%'
     or v_redeem_def not like '%already used%'
     or v_redeem_def like '%vault.%'
  then raise exception 'remote setup one-time redemption boundary drifted'; end if;

  if v_context_def is null
     or v_context_def not like '%remote_setup_session_token_hash%'
     or v_context_def not like '%a.status = ''AUTHORIZED''%'
     or v_context_def not like '%b.version = a.binding_version%'
  then raise exception 'remote setup context boundary drifted'; end if;

  if v_revoke_def is null
     or v_revoke_def not like '%Organization OWNER required%'
     or v_revoke_def not like '%remote_setup_revoked_at%'
  then raise exception 'remote setup revoke boundary drifted'; end if;

  if has_function_privilege('anon',
       'public.issue_meta_whatsapp_remote_setup_invite(uuid,uuid,uuid,integer,text,uuid,text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.issue_meta_whatsapp_remote_setup_invite(uuid,uuid,uuid,integer,text,uuid,text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.issue_meta_whatsapp_remote_setup_invite(uuid,uuid,uuid,integer,text,uuid,text)',
       'EXECUTE')
  then raise exception 'remote setup invite issue ACL drifted'; end if;

  if has_function_privilege('anon',
       'public.redeem_meta_whatsapp_remote_setup_invite(text,text,text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.redeem_meta_whatsapp_remote_setup_invite(text,text,text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.redeem_meta_whatsapp_remote_setup_invite(text,text,text)',
       'EXECUTE')
  then raise exception 'remote setup redeem ACL drifted'; end if;

  if has_function_privilege('anon',
       'public.get_meta_whatsapp_remote_setup_context(text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.get_meta_whatsapp_remote_setup_context(text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.get_meta_whatsapp_remote_setup_context(text)',
       'EXECUTE')
  then raise exception 'remote setup context ACL drifted'; end if;

  if has_function_privilege('anon',
       'public.revoke_meta_whatsapp_remote_setup_invite(uuid,uuid,uuid,integer,uuid,text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.revoke_meta_whatsapp_remote_setup_invite(uuid,uuid,uuid,integer,uuid,text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.revoke_meta_whatsapp_remote_setup_invite(uuid,uuid,uuid,integer,uuid,text)',
       'EXECUTE')
  then raise exception 'remote setup revoke ACL drifted'; end if;

  if has_table_privilege('anon','public.communication_channel_setup_attempts','SELECT')
     or has_table_privilege('authenticated','public.communication_channel_setup_attempts','SELECT')
  then raise exception 'remote setup must not expose attempt state directly'; end if;
end;
$slice2$;

rollback;
