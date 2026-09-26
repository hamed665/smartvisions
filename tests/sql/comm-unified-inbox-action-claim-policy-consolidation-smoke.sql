\set ON_ERROR_STOP on

begin;

do $policy_count$
declare
  v_select_count integer;
  v_insert_count integer;
  v_select_qual text;
  v_insert_check text;
begin
  select count(*)
    into v_select_count
    from pg_policies
   where schemaname='public'
     and tablename='chatwoot_bridge_command_claims'
     and cmd='SELECT'
     and 'authenticated' = any(roles);

  select count(*)
    into v_insert_count
    from pg_policies
   where schemaname='public'
     and tablename='chatwoot_bridge_command_claims'
     and cmd='INSERT'
     and 'authenticated' = any(roles);

  if v_select_count <> 1 or v_insert_count <> 1 then
    raise exception 'claim policy consolidation did not leave exactly one SELECT and one INSERT policy';
  end if;

  select qual
    into v_select_qual
    from pg_policies
   where schemaname='public'
     and tablename='chatwoot_bridge_command_claims'
     and policyname='chatwoot_bridge_command_claims_read';

  select with_check
    into v_insert_check
    from pg_policies
   where schemaname='public'
     and tablename='chatwoot_bridge_command_claims'
     and policyname='chatwoot_bridge_command_claims_insert';

  if v_select_qual is null
     or v_select_qual not like '%chatwoot_bridge_can_read%'
     or v_select_qual not like '%can_manage_unified_inbox_projection%'
  then
    raise exception 'consolidated claim SELECT policy lost a legacy/admin or scoped-manager branch';
  end if;

  if v_insert_check is null
     or v_insert_check not like '%chatwoot_bridge_can_manage%'
     or v_insert_check not like '%can_manage_unified_inbox_projection%'
     or v_insert_check not like '%auth.uid%'
  then
    raise exception 'consolidated claim INSERT policy lost a legacy/owner or scoped-manager branch';
  end if;

  if exists (
    select 1
      from pg_policies
     where schemaname='public'
       and tablename='chatwoot_bridge_command_claims'
       and policyname in (
         'chatwoot_bridge_command_claims_admin_read',
         'chatwoot_bridge_command_claims_owner_insert',
         'chatwoot_bridge_command_claims_unified_inbox_read',
         'chatwoot_bridge_command_claims_unified_inbox_insert'
       )
  ) then
    raise exception 'superseded permissive claim policies remain present';
  end if;
end;
$policy_count$;

rollback;
