\set ON_ERROR_STOP on

create temp table marketing_campaign_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as conversation_message_count;

do $marketing_structure$
declare
  v_func record;
begin
  if not (
    select relrowsecurity
    from pg_class
    where oid='public.marketing_campaign_conversion_evidence'::regclass
  ) then
    raise exception 'MARKETING-CAMPAIGNS conversion evidence RLS is not enabled';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='campaigns'
      and column_name='campaign_kind'
  ) then
    raise exception 'MARKETING-CAMPAIGNS did not extend canonical campaigns';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.campaigns'::regclass
      and conname='campaigns_marketing_snapshot_fkey'
  ) then
    raise exception 'MARKETING-CAMPAIGNS immutable Snapshot FK is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.message_variants'::regclass
      and conname='message_variants_campaign_fkey'
  ) then
    raise exception 'MARKETING-CAMPAIGNS variant campaign FK is missing';
  end if;

  if to_regclass('public.marketing_campaign_conversion_deal_fk_idx') is null
     or to_regclass('public.marketing_campaign_conversion_variant_fk_idx') is null
     or to_regclass('public.marketing_campaign_conversion_recorded_by_fk_idx') is null
  then
    raise exception 'MARKETING-CAMPAIGNS conversion evidence FK indexes are incomplete';
  end if;

  for v_func in
    select p.oid,p.proname,p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'create_marketing_campaign',
        'upsert_marketing_campaign_variant',
        'transition_marketing_campaign',
        'record_marketing_campaign_conversion',
        'get_marketing_campaigns'
      )
  loop
    if v_func.prosecdef then
      raise exception 'MARKETING-CAMPAIGNS function % unexpectedly uses SECURITY DEFINER',v_func.proname;
    end if;
  end loop;

  if has_function_privilege(
       'authenticated',
       'public.create_marketing_campaign(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,integer,bigint,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.upsert_marketing_campaign_variant(uuid,uuid,uuid,uuid,text,text,integer,boolean)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.transition_marketing_campaign(uuid,uuid,uuid,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.record_marketing_campaign_conversion(uuid,uuid,uuid,uuid,uuid,text,timestamptz,text)',
       'EXECUTE'
     )
  then
    raise exception 'MARKETING-CAMPAIGNS browser mutation RPC grants are too broad';
  end if;

  if not has_function_privilege(
       'service_role',
       'public.create_marketing_campaign(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,integer,bigint,text,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.upsert_marketing_campaign_variant(uuid,uuid,uuid,uuid,text,text,integer,boolean)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.transition_marketing_campaign(uuid,uuid,uuid,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.record_marketing_campaign_conversion(uuid,uuid,uuid,uuid,uuid,text,timestamptz,text)',
       'EXECUTE'
     )
  then
    raise exception 'MARKETING-CAMPAIGNS trusted mutation RPC grants are incomplete';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.get_marketing_campaigns(uuid,integer)',
       'EXECUTE'
     )
  then
    raise exception 'MARKETING-CAMPAIGNS authenticated read RPC grant is missing';
  end if;
end;
$marketing_structure$;

-- Test-only fixture setup. No Production fixtures are created by this migration.
insert into public.system_controls(
  organization_id,global_kill_switch,email_paused,whatsapp_ai_paused,agents_paused,shadow_mode
) values (
  '00000000-0000-0000-0000-000000000c01',false,false,false,false,true
)
on conflict (organization_id) do update
set shadow_mode=true,
    global_kill_switch=false,
    email_paused=false,
    whatsapp_ai_paused=false,
    agents_paused=false;

do $marketing_fixture_controls$
begin
  if not exists (
    select 1 from public.system_controls
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and shadow_mode=true
  ) then
    raise exception 'MARKETING-CAMPAIGNS fixture requires Shadow Mode ON';
  end if;

  if not exists (
    select 1 from public.crm_deals
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and id='60000000-0000-0000-0000-000000000c92'
  ) then
    raise exception 'MARKETING-CAMPAIGNS expects the SALES-NEXT-ACTION Deal fixture';
  end if;
end;
$marketing_fixture_controls$;

insert into public.message_templates(
  id,organization_id,name,channel,purpose,country_code,language,subject,body,enabled,is_default,config
) values (
  '81000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  'Marketing Campaign Smoke',
  'EMAIL',
  'REACTIVATION',
  'OM',
  'en',
  'A controlled test',
  'Controlled test content only.',
  true,
  false,
  '{}'::jsonb
);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $legacy_hunter_compatibility$
declare
  v_id uuid;
begin
  insert into public.campaigns(
    organization_id,name,hunter_type,country_code,target_count,status,config
  ) values (
    '00000000-0000-0000-0000-000000000c01',
    'Legacy Hunter compatibility',
    'BUSINESS',
    'OM',
    2,
    'DRAFT',
    '{}'::jsonb
  )
  returning id into v_id;

  update public.campaigns
  set target_count=3
  where id=v_id;

  if not exists (
    select 1 from public.campaigns
    where id=v_id
      and campaign_kind='HUNTER'
      and hunter_type='BUSINESS'
      and target_count=3
  ) then
    raise exception 'MARKETING-CAMPAIGNS broke legacy Hunter campaign mutation';
  end if;
end;
$legacy_hunter_compatibility$;

do $browser_marketing_guard$
begin
  begin
    insert into public.campaigns(
      organization_id,name,hunter_type,country_code,target_count,status,config,campaign_kind
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      'Browser fabricated marketing campaign',
      null,
      'OM',
      1,
      'DRAFT',
      '{}'::jsonb,
      'MARKETING'
    );
    raise exception 'Browser fabricated a MARKETING campaign directly';
  exception when others then
    if sqlerrm not like 'MARKETING campaign mutation requires the trusted server boundary%' then
      raise;
    end if;
  end;
end;
$browser_marketing_guard$;

-- Own the LEAD Segment fixture inside this smoke instead of relying on a
-- previous smoke's durable residue. Replaying the same canonical request key
-- remains safe if another test already created the equivalent Segment.
do $marketing_lead_segment_fixture$
declare
  v_segment public.crm_segments%rowtype;
  v_eval jsonb;
begin
  v_segment:=public.create_crm_lead_segment(
    '00000000-0000-0000-0000-000000000c01',
    'All linked Leads',
    '{"kind":"PREDICATE","source":"CANONICAL","field":"business_id","operator":"IS_SET"}'::jsonb,
    'marketing-campaign-linked-leads'
  );

  v_eval:=public.evaluate_crm_lead_segment(
    v_segment.organization_id,
    v_segment.id,
    v_segment.current_definition_version,
    100,
    null
  );

  if v_segment.entity_type<>'LEAD'
     or jsonb_array_length(v_eval->'leadIds')<1
  then
    raise exception 'MARKETING-CAMPAIGNS self-contained LEAD Segment fixture is invalid: %',v_eval;
  end if;
end;
$marketing_lead_segment_fixture$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role service_role;

do $marketing_create_snapshot_and_campaign$
declare
  v_segment public.crm_segments%rowtype;
  v_snapshot public.crm_segment_snapshots%rowtype;
  v_first public.campaigns%rowtype;
  v_replay public.campaigns%rowtype;
begin
  select *
    into v_segment
  from public.crm_segments
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='marketing-campaign-linked-leads';

  if v_segment.id is null or v_segment.entity_type<>'LEAD' then
    raise exception 'MARKETING-CAMPAIGNS LEAD Segment fixture is missing';
  end if;

  v_snapshot:=public.create_crm_segment_snapshot(
    v_segment.organization_id,
    '00000000-0000-0000-0000-00000000c001',
    v_segment.id,
    v_segment.current_definition_version,
    'CAMPAIGN',
    'smoke:marketing-campaign',
    'marketing-campaign-snapshot'
  );

  if v_snapshot.entity_type<>'LEAD'
     or v_snapshot.purpose<>'CAMPAIGN'
     or v_snapshot.member_count<1
  then
    raise exception 'MARKETING-CAMPAIGNS immutable audience Snapshot is invalid: %',to_jsonb(v_snapshot);
  end if;

  v_first:=public.create_marketing_campaign(
    v_segment.organization_id,
    '00000000-0000-0000-0000-00000000c001',
    'Controlled marketing smoke',
    'OM',
    v_snapshot.id,
    'EMAIL',
    now()-interval '1 hour',
    now()+interval '7 days',
    2,
    25000,
    'OMR',
    'marketing-campaign-create'
  );

  v_replay:=public.create_marketing_campaign(
    v_segment.organization_id,
    '00000000-0000-0000-0000-00000000c001',
    'Controlled marketing smoke',
    'OM',
    v_snapshot.id,
    'EMAIL',
    v_first.scheduled_start_at,
    v_first.scheduled_end_at,
    2,
    25000,
    'OMR',
    'marketing-campaign-create'
  );

  if v_first.id is distinct from v_replay.id
     or v_first.campaign_kind<>'MARKETING'
     or v_first.audience_snapshot_id<>v_snapshot.id
     or v_first.approval_status<>'DRAFT'
     or v_first.status<>'DRAFT'
     or v_first.consent_policy<>'SEND_GATE_REQUIRED'
  then
    raise exception 'MARKETING-CAMPAIGNS create/replay contract failed';
  end if;

  begin
    perform public.create_marketing_campaign(
      v_segment.organization_id,
      '00000000-0000-0000-0000-00000000c001',
      'Changed semantics',
      'OM',
      v_snapshot.id,
      'EMAIL',
      v_first.scheduled_start_at,
      v_first.scheduled_end_at,
      2,
      25000,
      'OMR',
      'marketing-campaign-create'
    );
    raise exception 'MARKETING-CAMPAIGNS accepted request-key semantic conflict';
  exception when others then
    if sqlerrm not like 'MARKETING campaign request key conflict%' then raise; end if;
  end;
end;
$marketing_create_snapshot_and_campaign$;

do $marketing_variants_and_lifecycle$
declare
  v_campaign uuid;
  v_a public.message_variants%rowtype;
  v_b public.message_variants%rowtype;
  v_row public.campaigns%rowtype;
begin
  select id into v_campaign
  from public.campaigns
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='marketing-campaign-create';

  v_a:=public.upsert_marketing_campaign_variant(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_campaign,
    '81000000-0000-0000-0000-000000000c01',
    'A',
    'problem_first',
    5000,
    true
  );

  v_b:=public.upsert_marketing_campaign_variant(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_campaign,
    '81000000-0000-0000-0000-000000000c01',
    'B',
    'opportunity_first',
    5000,
    false
  );

  if (select count(*) from public.message_variants where campaign_id=v_campaign and enabled)<>2
     or (select sum(allocation_bps) from public.message_variants where campaign_id=v_campaign and enabled)<>10000
     or (select count(*) from public.message_variants where campaign_id=v_campaign and enabled and is_control)<>1
  then
    raise exception 'MARKETING-CAMPAIGNS A/B allocation contract failed';
  end if;

  v_row:=public.transition_marketing_campaign(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_campaign,
    'SUBMIT'
  );
  if v_row.approval_status<>'PENDING' then raise exception 'Campaign submit failed'; end if;

  v_row:=public.transition_marketing_campaign(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_campaign,
    'APPROVE'
  );
  if v_row.approval_status<>'APPROVED' or v_row.approved_by_user_id is null then
    raise exception 'Campaign approval failed';
  end if;

  v_row:=public.transition_marketing_campaign(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_campaign,
    'START'
  );
  if v_row.status<>'RUNNING' then raise exception 'Campaign start failed'; end if;

  begin
    perform public.upsert_marketing_campaign_variant(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      v_campaign,
      '81000000-0000-0000-0000-000000000c01',
      'A',
      'direct_idea',
      5000,
      true
    );
    raise exception 'RUNNING campaign variant was mutated';
  exception when others then
    if sqlerrm not like 'Pause MARKETING campaign before changing variants%' then raise; end if;
  end;

  v_row:=public.transition_marketing_campaign(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_campaign,
    'PAUSE'
  );
  if v_row.status<>'PAUSED' then raise exception 'Campaign pause failed'; end if;

  v_row:=public.transition_marketing_campaign(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_campaign,
    'RESUME'
  );
  if v_row.status<>'RUNNING' then raise exception 'Campaign resume failed'; end if;
end;
$marketing_variants_and_lifecycle$;

do $marketing_conversion_evidence$
declare
  v_campaign uuid;
  v_variant uuid;
  v_first public.marketing_campaign_conversion_evidence%rowtype;
  v_replay public.marketing_campaign_conversion_evidence%rowtype;
begin
  select id into v_campaign
  from public.campaigns
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='marketing-campaign-create';

  select id into v_variant
  from public.message_variants
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and campaign_id=v_campaign
    and variant_key='A';

  v_first:=public.record_marketing_campaign_conversion(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_campaign,
    v_variant,
    '60000000-0000-0000-0000-000000000c92',
    'Controlled direct Deal evidence; no attribution inferred.',
    '2026-09-28T10:00:00Z'::timestamptz,
    'marketing-campaign-conversion-1'
  );

  v_replay:=public.record_marketing_campaign_conversion(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_campaign,
    v_variant,
    '60000000-0000-0000-0000-000000000c92',
    'Controlled direct Deal evidence; no attribution inferred.',
    '2026-09-28T10:00:00Z'::timestamptz,
    'marketing-campaign-conversion-1'
  );

  if v_first.id is distinct from v_replay.id then
    raise exception 'MARKETING-CAMPAIGNS conversion evidence replay duplicated evidence';
  end if;
end;
$marketing_conversion_evidence$;

reset role;

do $marketing_conversion_append_only$
begin
  begin
    update public.marketing_campaign_conversion_evidence
    set evidence_note='tampered'
    where request_key='marketing-campaign-conversion-1';
    raise exception 'Conversion evidence was mutable';
  exception when others then
    if sqlerrm not like 'MARKETING campaign conversion evidence is append-only%' then raise; end if;
  end;
end;
$marketing_conversion_append_only$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $marketing_browser_update_guards$
declare
  v_campaign uuid;
  v_variant uuid;
begin
  select id into v_campaign
  from public.campaigns
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='marketing-campaign-create';

  select id into v_variant
  from public.message_variants
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and campaign_id=v_campaign
    and variant_key='A';

  begin
    update public.campaigns set status='PAUSED' where id=v_campaign;
    raise exception 'Browser directly mutated MARKETING campaign';
  exception when others then
    if sqlerrm not like 'MARKETING campaign mutation requires the trusted server boundary%' then raise; end if;
  end;

  begin
    update public.message_variants set enabled=false where id=v_variant;
    raise exception 'Browser directly mutated campaign variant';
  exception when others then
    if sqlerrm not like 'MARKETING campaign variant mutation requires the trusted server boundary%' then raise; end if;
  end;
end;
$marketing_browser_update_guards$;

do $marketing_read_model$
declare
  v_campaign uuid;
  v_row record;
begin
  select id into v_campaign
  from public.campaigns
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='marketing-campaign-create';

  select * into v_row
  from public.get_marketing_campaigns(
    '00000000-0000-0000-0000-000000000c01',
    100
  )
  where campaign_id=v_campaign;

  if v_row.campaign_id is null
     or v_row.segment_version<1
     or v_row.audience_member_count<1
     or v_row.variant_count<>2
     or v_row.allocation_bps<>10000
     or v_row.control_variant_count<>1
     or v_row.outbound_count<>0
     or v_row.response_count<>0
     or v_row.conversion_evidence_count<>1
     or v_row.ready_to_start<>true
     or not ('CONSENT_AND_SUPPRESSION_ENFORCED_AT_CANONICAL_SEND_GATE'=any(v_row.readiness_issues))
  then
    raise exception 'MARKETING-CAMPAIGNS read-model evidence is invalid: %',to_jsonb(v_row);
  end if;
end;
$marketing_read_model$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $marketing_no_send_side_effect$
declare
  v_before record;
begin
  select * into v_before from marketing_campaign_side_effect_baseline;

  if (select count(*) from public.outreach_messages)<>v_before.outreach_count
     or (select count(*) from public.conversation_messages)<>v_before.conversation_message_count
  then
    raise exception 'MARKETING-CAMPAIGNS control plane triggered outbound/provider side effects';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and action='MARKETING_CAMPAIGN_CREATED'
      and coalesce((after_data->>'provider_send_triggered')::boolean,false)=false
  ) then
    raise exception 'MARKETING-CAMPAIGNS no-send audit evidence is missing';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and action='MARKETING_CAMPAIGN_CONVERSION_EVIDENCE_RECORDED'
      and coalesce((after_data->>'attribution_claimed')::boolean,true)=false
  ) then
    raise exception 'MARKETING-CAMPAIGNS explicit non-attribution evidence is missing';
  end if;
end;
$marketing_no_send_side_effect$;

select 'MARKETING-CAMPAIGNS smoke passed' as result;
