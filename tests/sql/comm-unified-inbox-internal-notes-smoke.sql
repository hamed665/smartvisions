\set ON_ERROR_STOP on

begin;

do $internal_note_contract$
declare
  v_constraint text;
  v_function text;
begin
  select pg_get_constraintdef(c.oid)
    into v_constraint
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
   where n.nspname='public'
     and t.relname='chatwoot_bridge_command_claims'
     and c.conname='chatwoot_bridge_command_claims_command_type_check';

  if v_constraint is null
     or v_constraint not like '%CREATE_INTERNAL_NOTE%'
  then
    raise exception 'internal note command type is not present in the canonical claim ledger';
  end if;

  select pg_get_functiondef(p.oid)
    into v_function
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='claim_unified_inbox_action'
     and pg_get_function_identity_arguments(p.oid)='p_organization_id uuid, p_conversation_id uuid, p_request_key text, p_action text, p_payload jsonb';

  if v_function is null
     or v_function not like '%INTERNAL_NOTE%'
     or v_function not like '%CREATE_INTERNAL_NOTE%'
     or v_function not like '%invalid Unified Inbox internal note payload%'
  then
    raise exception 'internal note claim validation is not installed';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.claim_unified_inbox_action(uuid,uuid,text,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.claim_unified_inbox_action(uuid,uuid,text,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.claim_unified_inbox_action(uuid,uuid,text,text,jsonb)',
       'EXECUTE'
     )
  then
    raise exception 'internal note claim RPC privilege boundary drifted';
  end if;
end;
$internal_note_contract$;

rollback;
