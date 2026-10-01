\set ON_ERROR_STOP on
begin;

do $advisor_hardening$
declare
  v_count integer;
  v_policy_count integer;
begin
  select count(*)
    into v_count
    from pg_indexes
   where schemaname='public'
     and tablename='communication_channel_setup_attempts'
     and indexname in (
       'communication_channel_setup_attempts_business_fk_idx',
       'communication_channel_setup_attempts_branch_fk_idx',
       'communication_channel_setup_attempts_started_by_fk_idx',
       'communication_channel_setup_attempts_completed_by_fk_idx'
     );

  if v_count <> 4 then
    raise exception 'WhatsApp setup-attempt FK index hardening is incomplete';
  end if;

  select count(*)
    into v_policy_count
    from pg_policies
   where schemaname='public'
     and tablename='communication_channel_setup_attempts'
     and policyname='communication_channel_setup_attempts_authenticated_deny_all'
     and cmd='ALL'
     and roles @> array['authenticated']::name[]
     and qual='false'
     and with_check='false';

  if v_policy_count <> 1 then
    raise exception 'WhatsApp setup-attempt authenticated deny policy is missing or drifted';
  end if;

  if has_table_privilege('authenticated','public.communication_channel_setup_attempts','SELECT')
     or has_table_privilege('authenticated','public.communication_channel_setup_attempts','INSERT')
     or has_table_privilege('authenticated','public.communication_channel_setup_attempts','UPDATE')
     or has_table_privilege('authenticated','public.communication_channel_setup_attempts','DELETE')
  then
    raise exception 'authenticated role gained direct setup-attempt table privileges';
  end if;
end;
$advisor_hardening$;

rollback;
