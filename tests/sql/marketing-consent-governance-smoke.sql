\set ON_ERROR_STOP on

create temp table marketing_consent_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as message_count;

do $marketing_consent_structure$
declare
  v_func record;
begin
  if not (select relrowsecurity from pg_class where oid='public.lead_sources'::regclass) then
    raise exception 'MARKETING-CONSENT canonical lead_sources RLS is not enabled';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='lead_sources' and column_name='permission_channel'
  ) then
    raise exception 'MARKETING-CONSENT did not extend canonical lead_sources';
  end if;

  if to_regclass('public.lead_sources_marketing_permission_lookup_idx') is null
     or to_regclass('public.lead_sources_marketing_permission_actor_idx') is null
     or to_regclass('public.lead_sources_marketing_consent_request_key_unique') is null
  then
    raise exception 'MARKETING-CONSENT indexes are incomplete';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.lead_sources'::regclass
      and tgname='lead_sources_marketing_permission_guard'
      and not tgisinternal
  ) then
    raise exception 'MARKETING-CONSENT append-only guard trigger is missing';
  end if;

  for v_func in
    select p.proname,p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'normalize_marketing_permission_recipient',
        'guard_marketing_permission_evidence',
        'record_marketing_permission_event',
        'get_marketing_permission',
        'get_marketing_preferences'
      )
  loop
    if v_func.prosecdef then
      raise exception 'MARKETING-CONSENT function % unexpectedly uses SECURITY DEFINER',v_func.proname;
    end if;
  end loop;

  if has_function_privilege(
    'authenticated',
    'public.record_marketing_permission_event(uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz,boolean,text)',
    'EXECUTE'
  ) then
    raise exception 'MARKETING-CONSENT browser mutation RPC grant is too broad';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.record_marketing_permission_event(uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz,boolean,text)',
    'EXECUTE'
  ) then
    raise exception 'MARKETING-CONSENT trusted mutation RPC grant is missing';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_marketing_permission(uuid,uuid,text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.get_marketing_preferences(uuid,uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'MARKETING-CONSENT authenticated read grants are incomplete';
  end if;
end;
$marketing_consent_structure$;

-- The Lead is a controlled CI fixture created by SALES-NEXT-ACTION earlier in
-- this same PostgreSQL chain. Production never receives this fixture.
do $marketing_consent_fixture$
begin
  if not exists (
    select 1 from public.leads
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and id='20000000-0000-0000-0000-000000000c91'
  ) then
    raise exception 'MARKETING-CONSENT expected controlled Lead fixture is missing';
  end if;
end;
$marketing_consent_fixture$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $marketing_consent_direct_browser_guard$
begin
  begin
    insert into public.lead_sources(
      organization_id,lead_id,field_name,value,source_type,source_url,retrieved_at,verified_at,
      confidence,permission_channel,permission_purpose,permission_action,permission_recipient,
      legal_basis,preference_center_managed,consent_request_key,recorded_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      '20000000-0000-0000-0000-000000000c91',
      'marketing_permission',
      '{}'::jsonb,
      'OPERATOR',
      'smoke:browser-fabrication',
      now(),
      now(),
      1,
      'EMAIL',
      'MARKETING',
      'GRANT',
      'customer@example.com',
      'EXPLICIT_CONSENT',
      false,
      'marketing-consent-browser-fabrication',
      '00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Browser fabricated MARKETING permission evidence directly';
  exception when others then
    if sqlerrm not like 'MARKETING permission evidence requires the trusted server boundary%' then
      raise;
    end if;
  end;

  -- Existing generic provenance remains usable; MARKETING-CONSENT does not
  -- hijack the wider lead_sources authority.
  insert into public.lead_sources(
    organization_id,lead_id,field_name,value,source_type,source_url,retrieved_at,verified_at,confidence
  ) values (
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c91',
    'marketing_consent_generic_compatibility_probe',
    '{"ok":true}'::jsonb,
    'CONTROLLED_TEST',
    'smoke:generic-provenance',
    now(),
    now(),
    1
  );
end;
$marketing_consent_direct_browser_guard$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role service_role;

do $marketing_consent_grant_replay$
declare
  v_first public.lead_sources%rowtype;
  v_replay public.lead_sources%rowtype;
  v_occurred timestamptz:='2026-09-28T18:00:00Z'::timestamptz;
begin
  v_first:=public.record_marketing_permission_event(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '20000000-0000-0000-0000-000000000c91',
    'EMAIL',
    'MARKETING',
    'GRANT',
    ' Customer@Example.COM ',
    'WEBSITE_FORM',
    'form:marketing-consent-smoke',
    'EXPLICIT_CONSENT',
    v_occurred,
    true,
    'marketing-consent-grant-1'
  );

  v_replay:=public.record_marketing_permission_event(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '20000000-0000-0000-0000-000000000c91',
    'EMAIL',
    'MARKETING',
    'GRANT',
    'customer@example.com',
    'WEBSITE_FORM',
    'form:marketing-consent-smoke',
    'EXPLICIT_CONSENT',
    v_occurred,
    true,
    'marketing-consent-grant-1'
  );

  if v_first.id is distinct from v_replay.id
     or v_first.permission_recipient<>'customer@example.com'
     or v_first.permission_action<>'GRANT'
     or v_first.permission_purpose<>'MARKETING'
  then
    raise exception 'MARKETING-CONSENT grant normalization/replay failed';
  end if;

  begin
    perform public.record_marketing_permission_event(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      '20000000-0000-0000-0000-000000000c91',
      'EMAIL',
      'MARKETING',
      'REVOKE',
      'customer@example.com',
      'OPERATOR',
      'operator:semantic-conflict',
      'WITHDRAWAL',
      v_occurred,
      false,
      'marketing-consent-grant-1'
    );
    raise exception 'MARKETING-CONSENT accepted request-key semantic conflict';
  exception when others then
    if sqlerrm not like 'MARKETING permission request key conflict%' then raise; end if;
  end;
end;
$marketing_consent_grant_replay$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $marketing_consent_grant_read$
declare
  v_row record;
begin
  select * into v_row
  from public.get_marketing_permission(
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c91',
    'EMAIL',
    'MARKETING',
    'CUSTOMER@EXAMPLE.COM'
  );

  if v_row.allowed<>true
     or v_row.reason<>'VERIFIED_PERMISSION'
     or v_row.permission_action<>'GRANT'
     or v_row.legal_basis<>'EXPLICIT_CONSENT'
     or v_row.source_type<>'WEBSITE_FORM'
     or v_row.preference_center_managed<>true
  then
    raise exception 'MARKETING-CONSENT effective grant read failed: %',to_jsonb(v_row);
  end if;
end;
$marketing_consent_grant_read$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role service_role;

select public.record_marketing_permission_event(
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c001',
  '20000000-0000-0000-0000-000000000c91',
  'EMAIL',
  'MARKETING',
  'REVOKE',
  'customer@example.com',
  'OPERATOR',
  'operator:unsubscribe-smoke',
  'WITHDRAWAL',
  '2026-09-28T18:05:00Z'::timestamptz,
  false,
  'marketing-consent-revoke-1'
);

do $marketing_consent_append_only$
begin
  begin
    update public.lead_sources
    set permission_action='GRANT'
    where consent_request_key='marketing-consent-revoke-1';
    raise exception 'MARKETING permission evidence was mutable';
  exception when others then
    if sqlerrm not like 'MARKETING permission evidence is append-only%' then raise; end if;
  end;

  begin
    delete from public.lead_sources
    where consent_request_key='marketing-consent-revoke-1';
    raise exception 'MARKETING permission evidence was deletable';
  exception when others then
    if sqlerrm not like 'MARKETING permission evidence is append-only%' then raise; end if;
  end;
end;
$marketing_consent_append_only$;

do $marketing_consent_role_guard$
begin
  begin
    perform public.record_marketing_permission_event(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c003',
      '20000000-0000-0000-0000-000000000c91',
      'EMAIL',
      'MARKETING',
      'GRANT',
      'customer@example.com',
      'OPERATOR',
      'operator:unauthorized-role',
      'EXPLICIT_CONSENT',
      '2026-09-28T18:10:00Z'::timestamptz,
      false,
      'marketing-consent-unauthorized-role'
    );
    raise exception 'MARKETING permission accepted an unauthorized operator role';
  exception when others then
    if sqlerrm not like 'MARKETING permission operator mutation requires OWNER, ADMIN or SALES_MANAGER%' then
      raise;
    end if;
  end;
end;
$marketing_consent_role_guard$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $marketing_consent_revoke_read$
declare
  v_row record;
  v_pref record;
begin
  select * into v_row
  from public.get_marketing_permission(
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c91',
    'EMAIL',
    'MARKETING',
    'customer@example.com'
  );

  if v_row.allowed<>false
     or v_row.reason<>'LATEST_PERMISSION_IS_REVOKE'
     or v_row.permission_action<>'REVOKE'
     or v_row.legal_basis<>'WITHDRAWAL'
  then
    raise exception 'MARKETING-CONSENT latest revoke did not win: %',to_jsonb(v_row);
  end if;

  select * into v_pref
  from public.get_marketing_preferences(
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c91',
    20
  )
  where permission_channel='EMAIL'
    and permission_recipient='customer@example.com';

  if v_pref.event_id is null
     or v_pref.allowed<>false
     or v_pref.permission_action<>'REVOKE'
  then
    raise exception 'MARKETING-CONSENT preference read model is not latest-state bounded';
  end if;
end;
$marketing_consent_revoke_read$;

reset role;
select set_config('request.jwt.claim.sub','',false);

-- Cross-tenant authenticated reads must not expose Organization c01 evidence.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c002',false);

do $marketing_consent_cross_tenant$
declare
  v_row record;
begin
  select * into v_row
  from public.get_marketing_permission(
    '00000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c91',
    'EMAIL',
    'MARKETING',
    'customer@example.com'
  );

  if v_row.allowed<>false or v_row.reason<>'NO_PERMISSION_EVIDENCE' then
    raise exception 'MARKETING-CONSENT leaked another Organization permission evidence';
  end if;

  if exists (
    select 1 from public.get_marketing_preferences(
      '00000000-0000-0000-0000-000000000c01',
      null,
      200
    )
  ) then
    raise exception 'MARKETING-CONSENT preference read model leaked another Organization';
  end if;
end;
$marketing_consent_cross_tenant$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $marketing_consent_no_send_side_effect$
declare
  v_before record;
begin
  select * into v_before from marketing_consent_side_effect_baseline;

  if (select count(*) from public.outreach_messages)<>v_before.outreach_count
     or (select count(*) from public.conversation_messages)<>v_before.message_count
  then
    raise exception 'MARKETING-CONSENT evidence mutation triggered outbound/provider side effects';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and action='MARKETING_PERMISSION_GRANTED'
      and after_data->>'provider_send_triggered'='false'
  ) or not exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and action='MARKETING_PERMISSION_REVOKED'
      and after_data->>'provider_send_triggered'='false'
  ) then
    raise exception 'MARKETING-CONSENT bounded no-send audit evidence is incomplete';
  end if;
end;
$marketing_consent_no_send_side_effect$;

select 'MARKETING-CONSENT smoke passed' as result;
