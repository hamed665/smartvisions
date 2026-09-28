\set ON_ERROR_STOP on

create temp table segment_snapshot_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as conversation_message_count;

do $snapshot_structure$
begin
  if not (
    select relrowsecurity
    from pg_class
    where oid='public.crm_segment_snapshots'::regclass
  ) or not (
    select relrowsecurity
    from pg_class
    where oid='public.crm_segment_snapshot_members'::regclass
  ) then
    raise exception 'SEGMENT-SNAPSHOT RLS is not enabled';
  end if;

  if has_table_privilege('authenticated','public.crm_segment_snapshots','INSERT')
     or has_table_privilege('authenticated','public.crm_segment_snapshot_members','INSERT')
     or has_table_privilege('authenticated','public.crm_segment_snapshots','UPDATE')
     or has_table_privilege('authenticated','public.crm_segment_snapshots','DELETE')
  then
    raise exception 'SEGMENT-SNAPSHOT browser mutation privileges are too broad';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.create_crm_segment_snapshot(uuid,uuid,uuid,integer,text,text,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.create_crm_segment_snapshot(uuid,uuid,uuid,integer,text,text,text)',
       'EXECUTE'
     )
  then
    raise exception 'SEGMENT-SNAPSHOT creation RPC grants are incorrect';
  end if;

  if (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='create_crm_segment_snapshot'
      and pg_get_function_identity_arguments(p.oid)=
        'p_organization_id uuid, p_actor_user_id uuid, p_segment_id uuid, p_segment_version integer, p_purpose text, p_source_ref text, p_request_key text'
  ) then
    raise exception 'SEGMENT-SNAPSHOT creation unexpectedly uses SECURITY DEFINER';
  end if;
end;
$snapshot_structure$;

set role service_role;

do $snapshot_create_replay$
declare
  v_segment public.crm_segments%rowtype;
  v_first public.crm_segment_snapshots%rowtype;
  v_replay public.crm_segment_snapshots%rowtype;
begin
  select *
    into v_segment
  from public.crm_segments
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='segment-v2-person-active';

  if v_segment.id is null or v_segment.entity_type<>'PERSON' then
    raise exception 'SEGMENT-SNAPSHOT Person Segment fixture is missing';
  end if;

  v_first:=public.create_crm_segment_snapshot(
    v_segment.organization_id,
    '00000000-0000-0000-0000-00000000c001',
    v_segment.id,
    1,
    'MANUAL',
    'smoke:person-v1',
    'segment-snapshot-person-v1'
  );

  if v_first.segment_version<>1
     or v_first.entity_type<>'PERSON'
     or v_first.member_count<1
     or length(v_first.membership_hash)<>32
     or length(v_first.predicate_hash)<>32
  then
    raise exception 'SEGMENT-SNAPSHOT frozen evidence is invalid: %',to_jsonb(v_first);
  end if;

  if (
    select count(*)
    from public.crm_segment_snapshot_members m
    where m.organization_id=v_first.organization_id
      and m.snapshot_id=v_first.id
  )<>v_first.member_count then
    raise exception 'SEGMENT-SNAPSHOT member rows do not match frozen count';
  end if;

  v_replay:=public.create_crm_segment_snapshot(
    v_segment.organization_id,
    '00000000-0000-0000-0000-00000000c001',
    v_segment.id,
    1,
    'MANUAL',
    'smoke:person-v1',
    'segment-snapshot-person-v1'
  );

  if v_replay.id is distinct from v_first.id
     or v_replay.membership_hash is distinct from v_first.membership_hash
  then
    raise exception 'SEGMENT-SNAPSHOT replay changed frozen evidence';
  end if;

  begin
    perform public.create_crm_segment_snapshot(
      v_segment.organization_id,
      '00000000-0000-0000-0000-00000000c001',
      v_segment.id,
      1,
      'EXPORT',
      'smoke:conflict',
      'segment-snapshot-person-v1'
    );
    raise exception 'SEGMENT-SNAPSHOT accepted request-key semantic conflict';
  exception when others then
    if sqlerrm not like 'CRM Segment Snapshot request key conflict%' then raise; end if;
  end;
end;
$snapshot_create_replay$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $snapshot_historical_reproducibility$
declare
  v_segment public.crm_segments%rowtype;
  v_snapshot public.crm_segment_snapshots%rowtype;
  v_before_count integer;
  v_before_hash text;
  v_after_count integer;
  v_after_hash text;
begin
  select *
    into v_segment
  from public.crm_segments
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='segment-v2-person-active';

  select *
    into v_snapshot
  from public.crm_segment_snapshots
  where organization_id=v_segment.organization_id
    and request_key='segment-snapshot-person-v1';

  select count(*)::integer,
         md5(
           v_snapshot.entity_type || ':' ||
           v_snapshot.segment_version::text || ':' ||
           coalesce(string_agg(m.entity_id::text, ',' order by m.ordinal),'')
         )
    into v_before_count,v_before_hash
  from public.crm_segment_snapshot_members m
  where m.organization_id=v_snapshot.organization_id
    and m.snapshot_id=v_snapshot.id;

  v_segment:=public.update_crm_segment_definition(
    v_segment.organization_id,
    v_segment.id,
    v_segment.version,
    'Retired People future view',
    '{"kind":"PREDICATE","source":"CANONICAL","field":"status","operator":"EQ","value":"RETIRED"}'::jsonb,
    'segment-snapshot-person-definition-v2'
  );

  if v_segment.current_definition_version<>2 then
    raise exception 'SEGMENT-SNAPSHOT fixture failed to advance Segment definition';
  end if;

  select count(*)::integer,
         md5(
           v_snapshot.entity_type || ':' ||
           v_snapshot.segment_version::text || ':' ||
           coalesce(string_agg(m.entity_id::text, ',' order by m.ordinal),'')
         )
    into v_after_count,v_after_hash
  from public.crm_segment_snapshot_members m
  where m.organization_id=v_snapshot.organization_id
    and m.snapshot_id=v_snapshot.id;

  if v_before_count<>v_after_count
     or v_before_hash<>v_after_hash
     or v_snapshot.segment_version<>1
     or v_snapshot.membership_hash<>v_after_hash
  then
    raise exception 'SEGMENT-SNAPSHOT historical evidence changed after Segment v2 publish';
  end if;
end;
$snapshot_historical_reproducibility$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $snapshot_tamper_fails_closed$
declare
  v_snapshot public.crm_segment_snapshots%rowtype;
begin
  select *
    into v_snapshot
  from public.crm_segment_snapshots
  where request_key='segment-snapshot-person-v1';

  begin
    insert into public.crm_segment_snapshot_members(
      organization_id,snapshot_id,ordinal,entity_id
    ) values (
      v_snapshot.organization_id,
      v_snapshot.id,
      v_snapshot.member_count+1,
      '90000000-0000-4000-8000-000000000001'
    );
    set constraints all immediate;
    raise exception 'SEGMENT-SNAPSHOT accepted membership tampering';
  exception when others then
    if sqlerrm not like 'CRM Segment Snapshot member evidence is inconsistent%' then
      raise;
    end if;
  end;
end;
$snapshot_tamper_fails_closed$;

reset role;

do $snapshot_immutable_even_for_owner$
declare
  v_snapshot uuid;
begin
  select id into v_snapshot
  from public.crm_segment_snapshots
  where request_key='segment-snapshot-person-v1';

  begin
    update public.crm_segment_snapshots
    set purpose='EXPORT'
    where id=v_snapshot;
    raise exception 'SEGMENT-SNAPSHOT header unexpectedly allowed UPDATE';
  exception when others then
    if sqlerrm not like 'CRM Segment Snapshot evidence is immutable%' then raise; end if;
  end;

  begin
    delete from public.crm_segment_snapshot_members
    where snapshot_id=v_snapshot;
    raise exception 'SEGMENT-SNAPSHOT members unexpectedly allowed DELETE';
  exception when others then
    if sqlerrm not like 'CRM Segment Snapshot evidence is immutable%' then raise; end if;
  end;
end;
$snapshot_immutable_even_for_owner$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c004',false);

do $snapshot_viewer_read$
declare
  v_snapshot uuid;
  v_count integer;
begin
  select id into v_snapshot
  from public.crm_segment_snapshots
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and request_key='segment-snapshot-person-v1';

  if v_snapshot is null then
    raise exception 'Viewer could not read Organization SEGMENT-SNAPSHOT';
  end if;

  select count(*) into v_count
  from public.get_crm_segment_snapshot_members(
    '00000000-0000-0000-0000-000000000c01',
    v_snapshot,
    100,
    null
  );

  if v_count<1 then
    raise exception 'Viewer could not reproduce SEGMENT-SNAPSHOT members';
  end if;
end;
$snapshot_viewer_read$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c002',false);

do $snapshot_cross_tenant$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.get_crm_segment_snapshots(
    '00000000-0000-0000-0000-000000000c01',
    null,100,null,null
  );

  if v_count<>0 then
    raise exception 'SEGMENT-SNAPSHOT crossed Organization boundary';
  end if;
end;
$snapshot_cross_tenant$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $snapshot_audit_privacy_and_side_effects$
declare
  v_outreach bigint;
  v_messages bigint;
  v_snapshot uuid;
begin
  select id into v_snapshot
  from public.crm_segment_snapshots
  where request_key='segment-snapshot-person-v1';

  if not exists (
    select 1
    from public.audit_logs
    where entity_type='crm_segment_snapshot'
      and entity_id=v_snapshot::text
      and action='CRM_SEGMENT_SNAPSHOT_CREATED'
      and (after_data->>'member_count')::integer>=1
      and length(after_data->>'membership_hash')=32
  ) then
    raise exception 'SEGMENT-SNAPSHOT bounded audit evidence is missing';
  end if;

  if exists (
    select 1
    from public.crm_segment_snapshot_members m
    join public.audit_logs a
      on a.entity_type='crm_segment_snapshot'
     and a.entity_id=m.snapshot_id::text
    where a.action='CRM_SEGMENT_SNAPSHOT_CREATED'
      and a.after_data::text like '%'||m.entity_id::text||'%'
  ) then
    raise exception 'SEGMENT-SNAPSHOT audit leaked raw member IDs';
  end if;

  select count(*) into v_outreach from public.outreach_messages;
  select count(*) into v_messages from public.conversation_messages;

  if v_outreach<>(select outreach_count from segment_snapshot_side_effect_baseline)
     or v_messages<>(select conversation_message_count from segment_snapshot_side_effect_baseline)
  then
    raise exception 'SEGMENT-SNAPSHOT caused outbound/conversation side effects';
  end if;
end;
$snapshot_audit_privacy_and_side_effects$;
