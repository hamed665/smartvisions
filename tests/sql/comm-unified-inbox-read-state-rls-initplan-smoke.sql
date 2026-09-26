\set ON_ERROR_STOP on

begin;

do $policy_shape$
declare
  v_insert text;
  v_update_using text;
  v_update_check text;
  v_prosecdef boolean;
  v_provolatile "char";
begin
  select with_check
    into v_insert
    from pg_policies
   where schemaname='public'
     and tablename='unified_inbox_user_states'
     and policyname='unified_inbox_user_states_insert';

  select qual, with_check
    into v_update_using, v_update_check
    from pg_policies
   where schemaname='public'
     and tablename='unified_inbox_user_states'
     and policyname='unified_inbox_user_states_update';

  if v_insert is null
     or v_update_using is null
     or v_update_check is null
  then
    raise exception 'Unified Inbox read-state policies missing after 0097';
  end if;

  if v_insert like '%current_setting%'
     or v_update_using like '%current_setting%'
     or v_update_check like '%current_setting%'
  then
    raise exception 'read-state policy still embeds current_setting directly';
  end if;

  if v_insert not like '%unified_inbox_read_state_command_enabled%'
     or v_update_using not like '%unified_inbox_read_state_command_enabled%'
     or v_update_check not like '%unified_inbox_read_state_command_enabled%'
  then
    raise exception 'read-state policy helper is not wired into every mutation predicate';
  end if;

  select p.prosecdef, p.provolatile
    into v_prosecdef, v_provolatile
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='unified_inbox_read_state_command_enabled'
     and p.pronargs=0;

  if v_prosecdef or v_provolatile <> 's' then
    raise exception 'read-state command helper must be STABLE SECURITY INVOKER';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.unified_inbox_read_state_command_enabled()',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.unified_inbox_read_state_command_enabled()',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.unified_inbox_read_state_command_enabled()',
       'EXECUTE'
     )
  then
    raise exception 'read-state command helper privilege boundary is incorrect';
  end if;
end;
$policy_shape$;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000009701');

insert into public.organizations(id,name) values
  ('00000000-0000-4000-8000-000000009710','Unified Inbox RLS initplan org');

insert into public.organization_members(organization_id,user_id,role) values
  (
    '00000000-0000-4000-8000-000000009710',
    '00000000-0000-4000-8000-000000009701',
    'OWNER'
  );

insert into public.sales_conversations(
  id,organization_id,lead_id,channel,stage,priority,requires_human,last_message_at
) values (
  '72000000-0000-4000-8000-000000009711',
  '00000000-0000-4000-8000-000000009710',
  null,
  'EMAIL',
  'ACTIVE',
  1,
  false,
  statement_timestamp()
);

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000009701',
  false
);

do $direct_write_still_denied$
begin
  if public.unified_inbox_read_state_command_enabled() then
    raise exception 'read-state command helper unexpectedly enabled outside governed RPC';
  end if;

  begin
    insert into public.unified_inbox_user_states(
      organization_id,user_id,conversation_id,last_read_at
    ) values (
      '00000000-0000-4000-8000-000000009710',
      '00000000-0000-4000-8000-000000009701',
      '72000000-0000-4000-8000-000000009711',
      statement_timestamp()
    );
    raise exception 'direct read-state write unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'direct read-state write unexpectedly succeeded' then
        raise;
      end if;
  end;
end;
$direct_write_still_denied$;

select (public.mark_unified_inbox_conversation_read(
  '00000000-0000-4000-8000-000000009710',
  '72000000-0000-4000-8000-000000009711'
)).conversation_id;

do $governed_write_still_works$
begin
  if not exists (
    select 1
      from public.unified_inbox_user_states
     where organization_id='00000000-0000-4000-8000-000000009710'
       and user_id='00000000-0000-4000-8000-000000009701'
       and conversation_id='72000000-0000-4000-8000-000000009711'
       and last_read_at is not null
  ) then
    raise exception 'governed mark-read path failed after initPlan hardening';
  end if;
end;
$governed_write_still_works$;

reset role;
select set_config('request.jwt.claim.sub','',false);

rollback;
