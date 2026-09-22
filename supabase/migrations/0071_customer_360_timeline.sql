-- Smart Visions AI Business OS 2027
-- Phase 3 / Customer 360 Timeline
--
-- Read model only:
-- - no new event store;
-- - no provider side effect;
-- - no copied source-of-truth rows;
-- - provider journals enrich delivery state but do not become duplicate timeline items;
-- - underlying RLS is preserved through SECURITY INVOKER view semantics.

create or replace view public.crm_customer_timeline
with (security_invoker = true)
as
with provider_statuses as (
  select
    organization_id,
    'WHATSAPP'::text as channel,
    provider_message_id,
    case event_type
      when 'SENT' then 'SENT'
      when 'DELIVERED' then 'DELIVERED'
      when 'READ' then 'READ'
      when 'FAILED' then 'FAILED'
      when 'DELETED' then 'DELETED'
      else null
    end as delivery_status,
    created_at as occurred_at
  from public.whatsapp_events
  where direction = 'STATUS'
    and provider_message_id is not null
    and event_type in ('SENT','DELIVERED','READ','FAILED','DELETED')

  union all

  select
    organization_id,
    'EMAIL'::text as channel,
    provider_message_id,
    case event_type
      when 'email.scheduled' then 'QUEUED'
      when 'email.sent' then 'SENT'
      when 'email.delivered' then 'DELIVERED'
      when 'email.bounced' then 'BOUNCED'
      when 'email.complained' then 'COMPLAINED'
      when 'email.failed' then 'FAILED'
      when 'email.suppressed' then 'SUPPRESSED'
      else null
    end as delivery_status,
    created_at as occurred_at
  from public.email_events
  where provider_message_id is not null
    and event_type in (
      'email.scheduled',
      'email.sent',
      'email.delivered',
      'email.bounced',
      'email.complained',
      'email.failed',
      'email.suppressed'
    )
),
latest_provider_status as (
  select distinct on (organization_id, channel, provider_message_id)
    organization_id,
    channel,
    provider_message_id,
    delivery_status,
    occurred_at
  from provider_statuses
  where delivery_status is not null
  order by organization_id, channel, provider_message_id, occurred_at desc, delivery_status desc
),
conversation_items as (
  select
    'conversation_message:' || cm.id::text as item_id,
    cm.organization_id,
    l.business_id,
    l.id as lead_id,
    cm.conversation_id,
    'conversation_messages'::text as source,
    cm.id as source_id,
    case
      when cm.direction = 'INBOUND' then 'MESSAGE_INBOUND'
      when cm.status = 'SENT' then 'MESSAGE_OUTBOUND'
      when cm.status = 'APPROVAL_REQUIRED' then 'MESSAGE_APPROVAL_REQUIRED'
      when cm.status = 'BLOCKED' then 'MESSAGE_BLOCKED'
      when cm.status = 'FAILED' then 'MESSAGE_FAILED'
      else 'MESSAGE_INTERNAL'
    end as kind,
    case
      when cm.direction = 'INBOUND' or cm.status = 'SENT'
        then 'CUSTOMER'
      else 'INTERNAL'
    end as visibility,
    cm.channel,
    cm.direction,
    cm.status,
    ps.delivery_status,
    cm.provider_message_id,
    case
      when cm.direction = 'OUTBOUND' and cm.status = 'SENT'
        then coalesce(cm.sent_at, cm.created_at)
      else cm.created_at
    end as occurred_at,
    cm.created_at as recorded_at,
    null::text as subject,
    coalesce(cm.original_text, cm.transcript, cm.persian_summary) as body,
    null::text as title,
    cm.persian_summary as summary,
    jsonb_strip_nulls(jsonb_build_object(
      'mediaType', cm.media_type,
      'detectedLanguage', cm.detected_language,
      'detectedDialect', cm.detected_dialect,
      'persianTranslation', cm.persian_translation,
      'intent', cm.intent_label,
      'sentiment', cm.sentiment_label,
      'confidence', cm.confidence,
      'requiresApproval', cm.requires_approval,
      'approvalReason', cm.approval_reason
    )) as metadata
  from public.conversation_messages cm
  join public.sales_conversations sc
    on sc.organization_id = cm.organization_id
   and sc.id = cm.conversation_id
  join public.leads l
    on l.organization_id = cm.organization_id
   and l.id = coalesce(cm.lead_id, sc.lead_id)
  left join latest_provider_status ps
    on ps.organization_id = cm.organization_id
   and ps.channel = cm.channel
   and ps.provider_message_id = cm.provider_message_id
),
outreach_items as (
  select
    'outreach_message:' || om.id::text as item_id,
    om.organization_id,
    l.business_id,
    l.id as lead_id,
    null::uuid as conversation_id,
    'outreach_messages'::text as source,
    om.id as source_id,
    case
      when om.direction = 'INBOUND' then 'MESSAGE_INBOUND'
      when om.direction = 'OUTBOUND'
        and (om.sent_at is not null or om.status in ('SENT','DELIVERED','READ'))
        then 'MESSAGE_OUTBOUND'
      else 'OUTREACH_INTERNAL'
    end as kind,
    case
      when om.direction = 'INBOUND'
        or (
          om.direction = 'OUTBOUND'
          and (om.sent_at is not null or om.status in ('SENT','DELIVERED','READ'))
        )
        then 'CUSTOMER'
      else 'INTERNAL'
    end as visibility,
    om.channel,
    om.direction,
    om.status,
    ps.delivery_status,
    om.provider_message_id,
    case
      when om.direction = 'INBOUND' then coalesce(om.received_at, om.created_at)
      when om.direction = 'OUTBOUND' then coalesce(om.sent_at, om.created_at)
      else om.created_at
    end as occurred_at,
    om.created_at as recorded_at,
    om.subject,
    om.body,
    null::text as title,
    null::text as summary,
    jsonb_build_object(
      'ledgerStatus', om.status
    ) as metadata
  from public.outreach_messages om
  join public.leads l
    on l.organization_id = om.organization_id
   and l.id = om.lead_id
  left join latest_provider_status ps
    on ps.organization_id = om.organization_id
   and ps.channel = om.channel
   and ps.provider_message_id = om.provider_message_id
  where not exists (
    select 1
    from public.conversation_messages cm
    where cm.organization_id = om.organization_id
      and om.provider_message_id is not null
      and cm.provider_message_id = om.provider_message_id
      and cm.channel = om.channel
      and (
        cm.direction = 'INBOUND'
        or cm.status = 'SENT'
      )
  )
),
followup_items as (
  select
    'followup_job:' || f.id::text as item_id,
    f.organization_id,
    l.business_id,
    l.id as lead_id,
    null::uuid as conversation_id,
    'followup_jobs'::text as source,
    f.id as source_id,
    'FOLLOWUP_JOB'::text as kind,
    'INTERNAL'::text as visibility,
    f.channel,
    null::text as direction,
    f.status,
    null::text as delivery_status,
    null::text as provider_message_id,
    f.created_at as occurred_at,
    f.created_at as recorded_at,
    null::text as subject,
    null::text as body,
    'Follow-up'::text as title,
    f.stop_reason as summary,
    jsonb_strip_nulls(jsonb_build_object(
      'sequence', f.sequence,
      'scheduledAt', f.scheduled_at,
      'currentStatus', f.status,
      'stopReason', f.stop_reason
    )) as metadata
  from public.followup_jobs f
  join public.leads l
    on l.organization_id = f.organization_id
   and l.id = f.lead_id
),
handoff_items as (
  select
    'handoff_event:' || h.id::text as item_id,
    h.organization_id,
    l.business_id,
    l.id as lead_id,
    h.conversation_id,
    'handoff_events'::text as source,
    h.id as source_id,
    'HUMAN_HANDOFF'::text as kind,
    'INTERNAL'::text as visibility,
    sc.channel,
    null::text as direction,
    h.to_mode::text as status,
    null::text as delivery_status,
    null::text as provider_message_id,
    h.created_at as occurred_at,
    h.created_at as recorded_at,
    null::text as subject,
    null::text as body,
    'Conversation mode changed'::text as title,
    null::text as summary,
    jsonb_strip_nulls(jsonb_build_object(
      'fromMode', h.from_mode::text,
      'toMode', h.to_mode::text,
      'reasons', h.reasons,
      'actorType', h.actor_type,
      'actorId', h.actor_id
    )) as metadata
  from public.handoff_events h
  left join public.sales_conversations sc
    on sc.organization_id = h.organization_id
   and sc.id = h.conversation_id
  join public.leads l
    on l.organization_id = h.organization_id
   and l.id = coalesce(h.lead_id, sc.lead_id)
),
reply_items as (
  select
    'reply_event:' || r.id::text as item_id,
    r.organization_id,
    l.business_id,
    l.id as lead_id,
    null::uuid as conversation_id,
    'reply_events'::text as source,
    r.id as source_id,
    'REPLY_CLASSIFIED'::text as kind,
    'INTERNAL'::text as visibility,
    om.channel,
    'INBOUND'::text as direction,
    r.category as status,
    null::text as delivery_status,
    om.provider_message_id,
    r.created_at as occurred_at,
    r.created_at as recorded_at,
    null::text as subject,
    null::text as body,
    'Reply classified'::text as title,
    r.category as summary,
    jsonb_strip_nulls(jsonb_build_object(
      'intentScore', r.intent_score,
      'hot', r.hot,
      'stopFollowups', r.stop_followups,
      'signals', r.signals
    )) as metadata
  from public.reply_events r
  left join public.outreach_messages om
    on om.organization_id = r.organization_id
   and om.id = r.outreach_message_id
  join public.leads l
    on l.organization_id = r.organization_id
   and l.id = coalesce(r.lead_id, om.lead_id)
),
operator_brief_items as (
  select
    'operator_brief:' || ob.id::text as item_id,
    ob.organization_id,
    l.business_id,
    l.id as lead_id,
    ob.conversation_id,
    'operator_briefs'::text as source,
    ob.id as source_id,
    'OPERATOR_BRIEF'::text as kind,
    'INTERNAL'::text as visibility,
    sc.channel,
    null::text as direction,
    ob.brief_type as status,
    null::text as delivery_status,
    null::text as provider_message_id,
    ob.created_at as occurred_at,
    ob.created_at as recorded_at,
    null::text as subject,
    null::text as body,
    ob.title,
    ob.summary,
    jsonb_strip_nulls(jsonb_build_object(
      'language', ob.language,
      'requiresAction', ob.requires_action,
      'details', ob.details,
      'messageId', ob.message_id
    )) as metadata
  from public.operator_briefs ob
  join public.sales_conversations sc
    on sc.organization_id = ob.organization_id
   and sc.id = ob.conversation_id
  join public.leads l
    on l.organization_id = ob.organization_id
   and l.id = sc.lead_id
)
select * from conversation_items
union all
select * from outreach_items
union all
select * from followup_items
union all
select * from handoff_items
union all
select * from reply_items
union all
select * from operator_brief_items;

comment on view public.crm_customer_timeline is
  'Security-invoker Customer 360 read model over canonical CRM/message/provider evidence. No copied event store and no side effects.';

create or replace function public.get_crm_customer_timeline(
  p_organization_id uuid,
  p_business_id uuid,
  p_limit integer default 50,
  p_before_at timestamptz default null,
  p_before_item_id text default null,
  p_include_internal boolean default true
)
returns setof public.crm_customer_timeline
language sql
stable
security invoker
set search_path = public, pg_catalog
as $timeline$
  select t.*
  from public.crm_customer_timeline t
  where t.organization_id = p_organization_id
    and t.business_id = p_business_id
    and (p_include_internal or t.visibility = 'CUSTOMER')
    and (
      p_before_at is null
      or t.occurred_at < p_before_at
      or (
        t.occurred_at = p_before_at
        and p_before_item_id is not null
        and t.item_id < p_before_item_id
      )
    )
  order by t.occurred_at desc, t.item_id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$timeline$;

revoke all on public.crm_customer_timeline from public, anon, authenticated, service_role;
grant select on public.crm_customer_timeline to authenticated, service_role;

revoke all on function public.get_crm_customer_timeline(
  uuid, uuid, integer, timestamptz, text, boolean
) from public, anon;
grant execute on function public.get_crm_customer_timeline(
  uuid, uuid, integer, timestamptz, text, boolean
) to authenticated, service_role;
