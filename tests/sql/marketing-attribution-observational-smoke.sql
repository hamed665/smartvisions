\set ON_ERROR_STOP on

-- MARKETING-ATTRIBUTION controlled PostgreSQL 17 acceptance.
-- Reuses the controlled Marketing/Deal fixtures created by earlier smoke files.
-- This test runs only in disposable CI and creates no Production fixture.

do $attribution_structure$
declare
  v_result text;
begin
  if to_regclass('public.outreach_messages_marketing_attribution_idx') is null then
    raise exception 'MARKETING-ATTRIBUTION touchpoint index is missing';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname like 'marketing_attribution%'
      and c.relkind in ('r','p','v','m')
  ) then
    raise exception 'MARKETING-ATTRIBUTION created a parallel persisted attribution authority';
  end if;

  if (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_marketing_attribution'
      and pg_get_function_identity_arguments(p.oid)=
        'p_organization_id uuid, p_model text, p_lookback_days integer, p_limit integer'
  ) then
    raise exception 'MARKETING-ATTRIBUTION read model unexpectedly uses SECURITY DEFINER';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_marketing_attribution(uuid,text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'MARKETING-ATTRIBUTION authenticated read grant is missing';
  end if;

  select pg_get_function_result(p.oid)
    into v_result
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='get_marketing_attribution'
    and pg_get_function_identity_arguments(p.oid)=
      'p_organization_id uuid, p_model text, p_lookback_days integer, p_limit integer';

  if v_result ilike '%click%'
     or v_result ilike '%view%'
     or v_result ilike '%revenue_amount%'
  then
    raise exception 'MARKETING-ATTRIBUTION result contract invented unsupported click/view/revenue facts';
  end if;
end;
$attribution_structure$;

do $attribution_fixture_precondition$
begin
  if not exists (
    select 1
    from public.campaigns
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and campaign_kind='MARKETING'
      and last_request_key='marketing-campaign-create'
  ) then
    raise exception 'MARKETING-ATTRIBUTION expects the controlled Marketing Campaign fixture';
  end if;

  if not exists (
    select 1
    from public.crm_deals
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and id='60000000-0000-0000-0000-000000000c92'
      and lead_id='20000000-0000-0000-0000-000000000c92'
  ) then
    raise exception 'MARKETING-ATTRIBUTION expects the controlled Deal fixture';
  end if;
end;
$attribution_fixture_precondition$;

set role service_role;

do $attribution_campaign_fixtures$
declare
  v_snapshot uuid;
  v_second public.campaigns%rowtype;
  v_evidence_only public.campaigns%rowtype;
begin
  select audience_snapshot_id into v_snapshot
  from public.campaigns
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='marketing-campaign-create';

  v_second:=public.create_marketing_campaign(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Attribution second touch',
    'OM',
    v_snapshot,
    'EMAIL',
    '2026-09-27T00:00:00Z'::timestamptz,
    '2026-09-30T00:00:00Z'::timestamptz,
    2,
    25000,
    'OMR',
    'marketing-attribution-second-campaign'
  );

  v_evidence_only:=public.create_marketing_campaign(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'Attribution evidence-only campaign',
    'OM',
    v_snapshot,
    'EMAIL',
    '2026-09-27T00:00:00Z'::timestamptz,
    '2026-09-30T00:00:00Z'::timestamptz,
    2,
    25000,
    'OMR',
    'marketing-attribution-evidence-only-campaign'
  );

  perform public.record_marketing_campaign_conversion(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_evidence_only.id,
    null,
    '60000000-0000-0000-0000-000000000c92',
    'Controlled evidence-only record. Must not create attribution without a sent touchpoint.',
    '2026-09-28T11:00:00Z'::timestamptz,
    'marketing-attribution-evidence-only'
  );
end;
$attribution_campaign_fixtures$;

insert into public.outreach_messages(
  id,organization_id,lead_id,campaign_id,
  channel,direction,status,provider_message_id,body,
  sent_at,created_at,metadata
)
select
  '72000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '20000000-0000-0000-0000-000000000c92',
  c.id,
  'EMAIL','OUTBOUND','DELIVERED','attribution-provider-a',
  'Controlled attribution first touch',
  '2026-09-28T08:00:00Z'::timestamptz,
  '2026-09-28T08:00:00Z'::timestamptz,
  '{}'::jsonb
from public.campaigns c
where c.organization_id='00000000-0000-0000-0000-000000000c01'
  and c.last_request_key='marketing-campaign-create';

insert into public.outreach_messages(
  id,organization_id,lead_id,campaign_id,
  channel,direction,status,provider_message_id,body,
  sent_at,created_at,metadata
)
select
  '72000000-0000-0000-0000-000000000c02',
  '00000000-0000-0000-0000-000000000c01',
  '20000000-0000-0000-0000-000000000c92',
  c.id,
  'EMAIL','OUTBOUND','DELIVERED','attribution-provider-b',
  'Controlled attribution last touch',
  '2026-09-28T09:00:00Z'::timestamptz,
  '2026-09-28T09:00:00Z'::timestamptz,
  '{}'::jsonb
from public.campaigns c
where c.organization_id='00000000-0000-0000-0000-000000000c01'
  and c.last_request_key='marketing-attribution-second-campaign';

insert into public.outreach_messages(
  id,organization_id,lead_id,campaign_id,
  channel,direction,status,provider_message_id,body,
  sent_at,created_at,metadata
)
select
  '72000000-0000-0000-0000-000000000c03',
  '00000000-0000-0000-0000-000000000c01',
  '20000000-0000-0000-0000-000000000c92',
  c.id,
  'EMAIL','OUTBOUND','DELIVERED','attribution-provider-after-outcome',
  'Controlled post-outcome touch that must be ignored',
  '2026-09-28T13:00:00Z'::timestamptz,
  '2026-09-28T13:00:00Z'::timestamptz,
  '{}'::jsonb
from public.campaigns c
where c.organization_id='00000000-0000-0000-0000-000000000c01'
  and c.last_request_key='marketing-attribution-second-campaign';

insert into public.sales_conversations(
  id,organization_id,lead_id,channel,agent_mode,created_at,updated_at
) values (
  '51000000-0000-0000-0000-000000000c95',
  '00000000-0000-0000-0000-000000000c01',
  '20000000-0000-0000-0000-000000000c92',
  'EMAIL',
  'AUTO',
  '2026-09-28T09:00:00Z'::timestamptz,
  '2026-09-28T09:00:00Z'::timestamptz
);

insert into public.conversation_messages(
  id,organization_id,conversation_id,lead_id,
  provider_message_id,channel,direction,media_type,
  original_text,status,metadata,created_at,sent_at
) values (
  '52000000-0000-0000-0000-000000000c95',
  '00000000-0000-0000-0000-000000000c01',
  '51000000-0000-0000-0000-000000000c95',
  '20000000-0000-0000-0000-000000000c92',
  'attribution-provider-b',
  'EMAIL','OUTBOUND','TEXT',
  'Controlled exact provider-message linkage',
  'SENT',
  '{}'::jsonb,
  '2026-09-28T09:00:00Z'::timestamptz,
  '2026-09-28T09:00:00Z'::timestamptz
);

insert into public.reply_events(
  id,organization_id,lead_id,outreach_message_id,
  category,signals,intent_score,hot,stop_followups,created_at
) values (
  '73000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-000000000c01',
  '20000000-0000-0000-0000-000000000c92',
  '72000000-0000-0000-0000-000000000c02',
  'POSITIVE',
  '{"source":"controlled-attribution-smoke"}'::jsonb,
  80,
  true,
  false,
  '2026-09-28T09:30:00Z'::timestamptz
);

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $attribution_mark_won$
declare
  v_won_stage uuid;
begin
  select s.id into v_won_stage
  from public.crm_deals d
  join public.crm_pipeline_stages s
    on s.organization_id=d.organization_id
   and s.pipeline_id=d.pipeline_id
   and s.category='WON'
  where d.organization_id='00000000-0000-0000-0000-000000000c01'
    and d.id='60000000-0000-0000-0000-000000000c92'
  limit 1;

  if v_won_stage is null then
    raise exception 'MARKETING-ATTRIBUTION WON stage fixture is missing';
  end if;

  update public.crm_deals
  set
    stage_id=v_won_stage,
    state='WON',
    won_at='2026-09-28T12:00:00Z'::timestamptz,
    expected_close_at='2026-09-28T12:00:00Z'::timestamptz,
    close_evidence='{"sourceType":"OPERATOR_CONFIRMED","sourceRef":"controlled-attribution-smoke"}'::jsonb
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and id='60000000-0000-0000-0000-000000000c92';

  if not exists (
    select 1
    from public.crm_deals
    where id='60000000-0000-0000-0000-000000000c92'
      and state='WON'
      and won_at='2026-09-28T12:00:00Z'::timestamptz
  ) then
    raise exception 'MARKETING-ATTRIBUTION controlled Deal did not reach WON';
  end if;
end;
$attribution_mark_won$;

create temp table marketing_attribution_read_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as conversation_message_count,
  (select count(*) from public.reply_events) as reply_count;

do $attribution_models$
declare
  v_first uuid;
  v_last uuid;
  v_second uuid;
  v_evidence_only uuid;
  v_linear_count integer;
  v_linear_credit integer;
begin
  select id into v_first
  from public.campaigns
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='marketing-campaign-create';

  select id into v_second
  from public.campaigns
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='marketing-attribution-second-campaign';

  select id into v_evidence_only
  from public.campaigns
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='marketing-attribution-evidence-only-campaign';

  select campaign_id into v_first
  from public.get_marketing_attribution(
    '00000000-0000-0000-0000-000000000c01',
    'FIRST_TOUCH',
    30,
    200
  )
  where deal_id='60000000-0000-0000-0000-000000000c92';

  if v_first is distinct from (
    select id from public.campaigns
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and last_request_key='marketing-campaign-create'
  ) then
    raise exception 'FIRST_TOUCH did not choose the earliest real sent Marketing touchpoint';
  end if;

  select campaign_id into v_last
  from public.get_marketing_attribution(
    '00000000-0000-0000-0000-000000000c01',
    'LAST_TOUCH',
    30,
    200
  )
  where deal_id='60000000-0000-0000-0000-000000000c92';

  if v_last is distinct from v_second then
    raise exception 'LAST_TOUCH did not choose the latest pre-outcome Marketing touchpoint';
  end if;

  select count(*),sum(credit_bps)
    into v_linear_count,v_linear_credit
  from public.get_marketing_attribution(
    '00000000-0000-0000-0000-000000000c01',
    'LINEAR',
    30,
    200
  )
  where deal_id='60000000-0000-0000-0000-000000000c92';

  if v_linear_count<>2 or v_linear_credit<>10000 then
    raise exception 'LINEAR attribution is not bounded to 10000 bps across the two eligible campaigns';
  end if;

  if exists (
    select 1
    from public.get_marketing_attribution(
      '00000000-0000-0000-0000-000000000c01',
      'LINEAR',
      30,
      200
    )
    where campaign_id=v_evidence_only
  ) then
    raise exception 'Explicit conversion evidence alone created fabricated attribution';
  end if;

  if not exists (
    select 1
    from public.get_marketing_attribution(
      '00000000-0000-0000-0000-000000000c01',
      'LINEAR',
      30,
      200
    )
    where campaign_id=v_second
      and touch_count=1
      and cardinality(conversation_ids)=1
      and conversation_ids[1]='51000000-0000-0000-0000-000000000c95'
      and reply_count=1
      and causal_claim=false
      and revenue_claimed=false
  ) then
    raise exception 'Exact Conversation/reply evidence or non-causal/revenue contract failed';
  end if;
end;
$attribution_models$;

do $attribution_bounds$
begin
  begin
    perform *
    from public.get_marketing_attribution(
      '00000000-0000-0000-0000-000000000c01',
      'MAGIC_MODEL',
      30,
      10
    );
    raise exception 'Unsupported attribution model was accepted';
  exception when others then
    if sqlerrm not like 'unsupported marketing attribution model%' then raise; end if;
  end;

  begin
    perform *
    from public.get_marketing_attribution(
      '00000000-0000-0000-0000-000000000c01',
      'LAST_TOUCH',
      365,
      10
    );
    raise exception 'Unbounded attribution lookback was accepted';
  exception when others then
    if sqlerrm not like 'marketing attribution lookback must be between 1 and 180 days%' then raise; end if;
  end;
end;
$attribution_bounds$;

do $attribution_read_only$
declare
  v_baseline marketing_attribution_read_baseline%rowtype;
begin
  select * into v_baseline from marketing_attribution_read_baseline;

  perform *
  from public.get_marketing_attribution(
    '00000000-0000-0000-0000-000000000c01',
    'LAST_TOUCH',
    30,
    200
  );

  if (select count(*) from public.outreach_messages)<>v_baseline.outreach_count
     or (select count(*) from public.conversation_messages)<>v_baseline.conversation_message_count
     or (select count(*) from public.reply_events)<>v_baseline.reply_count
  then
    raise exception 'MARKETING-ATTRIBUTION read model caused a messaging side effect';
  end if;
end;
$attribution_read_only$;

reset role;
select set_config('request.jwt.claim.sub','',false);
