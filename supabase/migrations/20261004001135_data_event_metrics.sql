-- DATA-EVENT-METRICS
--
-- Canonical analytics semantics only:
-- - does not create a second business-event store;
-- - projects bounded event evidence from existing OLTP authorities;
-- - introduces one versioned Metrics Registry;
-- - never exposes raw provider payloads/audit before-after blobs;
-- - does not claim causality or cross-currency aggregation.

create table public.metric_definitions (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null
    check (metric_key ~ '^[a-z0-9][a-z0-9_.]{2,119}$'),
  version integer not null check (version >= 1),
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  description text not null check (length(btrim(description)) between 1 and 1200),
  owner_domain text not null
    check (owner_domain in ('COMMUNICATION','SALES','BOOKING','COMMERCE','PAYMENT','AI','OPERATIONS')),
  metric_kind text not null
    check (metric_kind in ('COUNT','SUM','RATE','GAUGE')),
  unit text not null
    check (unit in ('COUNT','PERCENT','USD','MONEY')),
  aggregation text not null
    check (aggregation in ('COUNT','SUM','RATE','LATEST')),
  source_mode text not null
    check (source_mode in ('EVENT_FEED','CANONICAL_STATE','DERIVED')),
  supported_scopes text[] not null default array['ORGANIZATION']::text[]
    check (
      cardinality(supported_scopes) between 1 and 3
      and supported_scopes <@ array['ORGANIZATION','BUSINESS','BRANCH']::text[]
    ),
  supported_dimensions text[] not null default '{}'::text[]
    check (cardinality(supported_dimensions) <= 24),
  freshness_sla_seconds integer not null default 300
    check (freshness_sla_seconds between 0 and 86400),
  definition jsonb not null
    check (jsonb_typeof(definition) = 'object'),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','RETIRED')),
  created_at timestamptz not null default now(),
  unique(metric_key,version)
);

create unique index metric_definitions_one_active_key_uidx
  on public.metric_definitions(metric_key)
  where status='ACTIVE';

create index metric_definitions_domain_status_idx
  on public.metric_definitions(owner_domain,status,metric_key,version desc);

alter table public.metric_definitions enable row level security;

create policy metric_definitions_authenticated_read
on public.metric_definitions
for select
to authenticated
using (true);

revoke all on table public.metric_definitions from public, anon, authenticated, service_role;
grant select on table public.metric_definitions to authenticated, service_role;

comment on table public.metric_definitions is
  'Versioned canonical metric semantics. Definitions are release-controlled metadata, not measured business facts.';

create view public.metric_registry_current_v1
with (security_invoker=true)
as
select
  metric_key,
  version,
  display_name,
  description,
  owner_domain,
  metric_kind,
  unit,
  aggregation,
  source_mode,
  supported_scopes,
  supported_dimensions,
  freshness_sla_seconds,
  definition
from public.metric_definitions
where status='ACTIVE';

revoke all on table public.metric_registry_current_v1 from public, anon, authenticated, service_role;
grant select on table public.metric_registry_current_v1 to authenticated, service_role;

comment on view public.metric_registry_current_v1 is
  'Current Metrics Registry projection. Metric metadata is readable; measured tenant facts remain outside this view.';

create view public.analytics_event_feed_v1
with (security_invoker=true)
as
-- Generic audit evidence is intentionally generic and is not the preferred source
-- for lifecycle metrics when a dedicated lifecycle authority exists.
select
  a.organization_id,
  a.tenant_business_id,
  a.branch_id,
  a.id::text as event_id,
  'audit.action.v1'::text as event_name,
  1::integer as event_version,
  'audit_logs'::text as source_table,
  a.action::text as source_event_type,
  'AUDIT'::text as evidence_class,
  coalesce(a.entity_type,'audit')::text as entity_type,
  a.entity_id::text as entity_id,
  null::uuid as lead_id,
  null::uuid as conversation_id,
  a.created_at as occurred_at,
  null::numeric as numeric_value,
  null::text as numeric_unit,
  jsonb_strip_nulls(jsonb_build_object(
    'actorType',a.actor_type,
    'action',a.action,
    'brandId',a.brand_id,
    'departmentId',a.department_id,
    'teamId',a.team_id
  )) as dimensions
from public.audit_logs a

union all

select
  e.organization_id,
  br.tenant_business_id,
  b.branch_id,
  e.id::text,
  case e.transition
    when 'REQUESTED' then 'booking.created.v1'
    when 'HELD' then 'booking.held.v1'
    when 'CONFIRMED' then 'booking.confirmed.v1'
    when 'RESCHEDULED' then 'booking.rescheduled.v1'
    when 'CANCELED' then 'booking.cancelled.v1'
    when 'COMPLETED' then 'booking.completed.v1'
    when 'NO_SHOW' then 'booking.no_show.v1'
    else 'booking.lifecycle.'||lower(e.transition)||'.v1'
  end,
  1,
  'booking_lifecycle_events',
  e.transition,
  'LIFECYCLE',
  'booking',
  e.booking_id::text,
  b.lead_id,
  null::uuid,
  e.occurred_at,
  null::numeric,
  null::text,
  jsonb_strip_nulls(jsonb_build_object(
    'fromStatus',e.from_status,
    'toStatus',e.to_status,
    'personId',b.person_id,
    'serviceId',b.service_id
  ))
from public.booking_lifecycle_events e
join public.bookings b
  on b.organization_id=e.organization_id and b.id=e.booking_id
left join public.branches br
  on br.organization_id=b.organization_id and br.id=b.branch_id

union all

select
  e.organization_id,
  q.tenant_business_id,
  q.branch_id,
  e.id::text,
  case
    when e.to_status='ACCEPTED' then 'quote.accepted.v1'
    else 'quote.lifecycle.'||lower(e.transition)||'.v1'
  end,
  1,
  'quote_lifecycle_events',
  e.transition,
  'LIFECYCLE',
  'quote',
  e.quote_id::text,
  null::uuid,
  null::uuid,
  e.occurred_at,
  null::numeric,
  null::text,
  jsonb_strip_nulls(jsonb_build_object(
    'fromStatus',e.from_status,
    'toStatus',e.to_status,
    'quoteVersion',e.quote_version_no
  ))
from public.quote_lifecycle_events e
join public.quotes q
  on q.organization_id=e.organization_id and q.id=e.quote_id

union all

select
  e.organization_id,
  o.tenant_business_id,
  o.branch_id,
  e.id::text,
  case when e.transition='CREATED'
    then 'order.created.v1'
    else 'order.status_changed.v1'
  end,
  1,
  'order_lifecycle_events',
  e.transition,
  'LIFECYCLE',
  'order',
  e.order_id::text,
  null::uuid,
  null::uuid,
  e.occurred_at,
  null::numeric,
  null::text,
  jsonb_strip_nulls(jsonb_build_object(
    'transition',e.transition,
    'fromStatus',e.from_status,
    'toStatus',e.to_status,
    'currency',o.currency
  ))
from public.order_lifecycle_events e
join public.orders o
  on o.organization_id=e.organization_id and o.id=e.order_id

union all

select
  e.organization_id,
  i.tenant_business_id,
  i.branch_id,
  e.id::text,
  case e.event_type
    when 'ISSUED' then 'invoice.issued.v1'
    when 'OVERDUE' then 'invoice.overdue.v1'
    else 'invoice.lifecycle.'||lower(e.event_type)||'.v1'
  end,
  1,
  'invoice_lifecycle_events',
  e.event_type,
  'LIFECYCLE',
  case when e.credit_note_id is null then 'invoice' else 'invoice_credit_note' end,
  coalesce(e.credit_note_id,e.invoice_id)::text,
  null::uuid,
  null::uuid,
  e.occurred_at,
  null::numeric,
  null::text,
  jsonb_strip_nulls(jsonb_build_object(
    'invoiceId',e.invoice_id,
    'fromStatus',e.from_status,
    'toStatus',e.to_status,
    'currency',i.currency
  ))
from public.invoice_lifecycle_events e
join public.invoices i
  on i.organization_id=e.organization_id and i.id=e.invoice_id

union all

select
  e.organization_id,
  p.tenant_business_id,
  p.branch_id,
  e.id::text,
  case e.event_kind
    when 'AUTHORIZED' then 'payment.authorized.v1'
    when 'CAPTURED' then 'payment.captured.v1'
    when 'FAILED' then 'payment.failed.v1'
    when 'REFUNDED' then 'payment.refunded.v1'
    when 'EXPIRED' then 'payment.expired.v1'
    when 'REFUND_FAILED' then 'payment.refund_failed.v1'
    else 'payment.lifecycle.'||lower(e.event_kind)||'.v1'
  end,
  1,
  'payment_provider_events',
  e.event_kind,
  'PROVIDER_VERIFIED',
  case when e.refund_id is null then 'payment_intent' else 'payment_refund' end,
  coalesce(e.refund_id,e.payment_intent_id)::text,
  null::uuid,
  null::uuid,
  e.received_at,
  e.amount,
  e.currency,
  jsonb_strip_nulls(jsonb_build_object(
    'provider',e.provider,
    'authenticity',e.authenticity,
    'currency',e.currency,
    'paymentIntentId',e.payment_intent_id
  ))
from public.payment_provider_events e
join public.payment_intents p
  on p.organization_id=e.organization_id and p.id=e.payment_intent_id

union all

select
  u.organization_id,
  null::uuid,
  null::uuid,
  u.id::text,
  'ai.usage.recorded.v1',
  1,
  'usage_events',
  u.operation,
  'USAGE_LEDGER',
  'usage_event',
  u.id::text,
  u.lead_id,
  null::uuid,
  u.created_at,
  u.cost_usd,
  'USD',
  jsonb_strip_nulls(jsonb_build_object(
    'provider',u.provider,
    'operation',u.operation,
    'usageClassification',u.usage_classification,
    'inputTokens',u.input_tokens,
    'outputTokens',u.output_tokens,
    'units',u.units
  ))
from public.usage_events u

union all

select
  w.organization_id,
  null::uuid,
  null::uuid,
  w.id::text,
  'communication.whatsapp.'||lower(w.event_type)||'.v1',
  1,
  'whatsapp_events',
  w.event_type,
  'PROVIDER_EVENT',
  'message',
  w.provider_message_id,
  w.lead_id,
  w.conversation_id,
  w.created_at,
  null::numeric,
  null::text,
  jsonb_strip_nulls(jsonb_build_object(
    'direction',w.direction,
    'chatwootSyncStatus',w.chatwoot_sync_status
  ))
from public.whatsapp_events w

union all

select
  e.organization_id,
  null::uuid,
  null::uuid,
  e.id::text,
  'communication.email.'||regexp_replace(lower(e.event_type),'^email\.','')||'.v1',
  1,
  'email_events',
  e.event_type,
  'PROVIDER_EVENT',
  'message',
  coalesce(e.provider_message_id,e.id::text),
  null::uuid,
  null::uuid,
  e.created_at,
  null::numeric,
  null::text,
  jsonb_build_object('provider',e.provider)
from public.email_events e

union all

select
  r.organization_id,
  null::uuid,
  null::uuid,
  r.id::text,
  'sales.reply.classified.v1',
  1,
  'reply_events',
  r.category,
  'SEMANTIC_CLASSIFICATION',
  'lead',
  r.lead_id::text,
  r.lead_id,
  null::uuid,
  r.created_at,
  null::numeric,
  null::text,
  jsonb_build_object(
    'category',r.category,
    'hot',r.hot,
    'stopFollowups',r.stop_followups,
    'intentScore',r.intent_score
  )
from public.reply_events r

union all

select
  h.organization_id,
  null::uuid,
  null::uuid,
  h.id::text,
  case
    when h.to_mode::text='HUMAN' then 'conversation.human_takeover.started.v1'
    when h.from_mode::text='HUMAN' then 'conversation.human_takeover.ended.v1'
    else 'conversation.handoff.changed.v1'
  end,
  1,
  'handoff_events',
  h.from_mode::text||'->'||h.to_mode::text,
  'LIFECYCLE',
  'conversation',
  h.conversation_id::text,
  h.lead_id,
  h.conversation_id,
  h.created_at,
  null::numeric,
  null::text,
  jsonb_build_object(
    'fromMode',h.from_mode::text,
    'toMode',h.to_mode::text,
    'actorType',h.actor_type
  )
from public.handoff_events h

union all

select
  p.organization_id,
  null::uuid,
  null::uuid,
  p.id::text,
  'preview.'||lower(p.event_type)||'.v1',
  1,
  'preview_events',
  p.event_type,
  'LIFECYCLE',
  'preview',
  p.preview_id::text,
  null::uuid,
  null::uuid,
  p.created_at,
  null::numeric,
  null::text,
  '{}'::jsonb
from public.preview_events p;

revoke all on table public.analytics_event_feed_v1 from public, anon, authenticated, service_role;
grant select on table public.analytics_event_feed_v1 to service_role;

comment on view public.analytics_event_feed_v1 is
  'Read-only normalized projection over canonical OLTP event authorities. No raw provider payloads or audit before/after bodies are exposed.';

create or replace function public.read_analytics_event_feed_v1(
  p_organization_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_event_names text[] default null,
  p_tenant_business_id uuid default null,
  p_branch_id uuid default null,
  p_limit integer default 1000
)
returns table (
  organization_id uuid,
  tenant_business_id uuid,
  branch_id uuid,
  event_id text,
  event_name text,
  event_version integer,
  source_table text,
  source_event_type text,
  evidence_class text,
  entity_type text,
  entity_id text,
  lead_id uuid,
  conversation_id uuid,
  occurred_at timestamptz,
  numeric_value numeric,
  numeric_unit text,
  dimensions jsonb
)
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,1000),1),5000);
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'trusted analytics reader required';
  end if;
  if p_organization_id is null or p_start_at is null or p_end_at is null then
    raise exception 'organization and bounded time window are required';
  end if;
  if p_end_at<=p_start_at then
    raise exception 'analytics event window is invalid';
  end if;
  if p_end_at-p_start_at>interval '31 days' then
    raise exception 'analytics event window exceeds 31 days';
  end if;
  if p_event_names is not null and cardinality(p_event_names)>64 then
    raise exception 'too many event filters';
  end if;

  return query
  select
    f.organization_id,
    f.tenant_business_id,
    f.branch_id,
    f.event_id,
    f.event_name,
    f.event_version,
    f.source_table,
    f.source_event_type,
    f.evidence_class,
    f.entity_type,
    f.entity_id,
    f.lead_id,
    f.conversation_id,
    f.occurred_at,
    f.numeric_value,
    f.numeric_unit,
    f.dimensions
  from public.analytics_event_feed_v1 f
  where f.organization_id=p_organization_id
    and f.occurred_at>=p_start_at
    and f.occurred_at<p_end_at
    and (p_event_names is null or f.event_name=any(p_event_names))
    and (p_tenant_business_id is null or f.tenant_business_id=p_tenant_business_id)
    and (p_branch_id is null or f.branch_id=p_branch_id)
  order by f.occurred_at,f.source_table,f.event_id
  limit v_limit;
end;
$$;

revoke all on function public.read_analytics_event_feed_v1(uuid,timestamptz,timestamptz,text[],uuid,uuid,integer)
  from public, anon, authenticated;
grant execute on function public.read_analytics_event_feed_v1(uuid,timestamptz,timestamptz,text[],uuid,uuid,integer)
  to service_role;

comment on function public.read_analytics_event_feed_v1(uuid,timestamptz,timestamptz,text[],uuid,uuid,integer) is
  'Bounded service-only reader for the canonical analytics event feed. Maximum 31-day window and 5000 rows per call.';

insert into public.metric_definitions(
  metric_key,version,display_name,description,owner_domain,metric_kind,unit,aggregation,
  source_mode,supported_scopes,supported_dimensions,freshness_sla_seconds,definition,status
)
values
  (
    'communication.whatsapp.sent.count',1,'WhatsApp sent','Provider-event count for WhatsApp SENT evidence.',
    'COMMUNICATION','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION'],array['direction'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"communication.whatsapp.sent.v1","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'communication.whatsapp.delivered.count',1,'WhatsApp delivered','Provider-event count for WhatsApp DELIVERED evidence.',
    'COMMUNICATION','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION'],array['direction'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"communication.whatsapp.delivered.v1","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'communication.whatsapp.read.count',1,'WhatsApp read','Provider-event count for WhatsApp READ evidence.',
    'COMMUNICATION','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION'],array['direction'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"communication.whatsapp.read.v1","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'communication.email.sent.count',1,'Email sent','Provider-event count for Email SENT evidence.',
    'COMMUNICATION','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION'],array['provider'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"communication.email.sent.v1","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'communication.email.delivered.count',1,'Email delivered','Provider-event count for Email DELIVERED evidence.',
    'COMMUNICATION','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION'],array['provider'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"communication.email.delivered.v1","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'communication.email.received.count',1,'Email received','Provider-event count for inbound Email RECEIVED evidence.',
    'COMMUNICATION','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION'],array['provider'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"communication.email.received.v1","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'communication.email.bounced.count',1,'Email bounced','Provider-event count for Email BOUNCED evidence.',
    'COMMUNICATION','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION'],array['provider'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"communication.email.bounced.v1","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'conversation.human_takeover.count',1,'Human takeovers','Count of canonical Human takeover lifecycle events.',
    'OPERATIONS','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION'],array[]::text[],300,
    '{"feed":"analytics_event_feed_v1","eventName":"conversation.human_takeover.started.v1","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'booking.confirmed.count',1,'Bookings confirmed','Count of canonical Booking CONFIRMED lifecycle events.',
    'BOOKING','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION','BUSINESS','BRANCH'],array['serviceId'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"booking.confirmed.v1","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'booking.completed.count',1,'Bookings completed','Count of canonical Booking COMPLETED lifecycle events.',
    'BOOKING','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION','BUSINESS','BRANCH'],array['serviceId'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"booking.completed.v1","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'quote.accepted.count',1,'Quotes accepted','Count of canonical Quote transitions into ACCEPTED.',
    'COMMERCE','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION','BUSINESS','BRANCH'],array[]::text[],300,
    '{"feed":"analytics_event_feed_v1","eventName":"quote.accepted.v1","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'order.created.count',1,'Orders created','Count of canonical Order CREATED lifecycle events.',
    'COMMERCE','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION','BUSINESS','BRANCH'],array['currency'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"order.created.v1","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'invoice.issued.count',1,'Invoices issued','Count of canonical Invoice ISSUED lifecycle events.',
    'COMMERCE','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION','BUSINESS','BRANCH'],array['currency'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"invoice.issued.v1","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'payment.captured.count',1,'Payments captured','Count of provider-verified CAPTURED payment events.',
    'PAYMENT','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION','BUSINESS','BRANCH'],array['provider','currency'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"payment.captured.v1","requiredEvidenceClass":"PROVIDER_VERIFIED","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'payment.captured.amount',1,'Captured payment amount','Sum of provider-verified captured amount. Currency is a mandatory dimension; values must never be summed across currencies.',
    'PAYMENT','SUM','MONEY','SUM','EVENT_FEED',
    array['ORGANIZATION','BUSINESS','BRANCH'],array['provider','currency'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"payment.captured.v1","valueField":"numeric_value","unitField":"numeric_unit","requiredDimensions":["currency"],"crossCurrencyAggregation":false,"requiredEvidenceClass":"PROVIDER_VERIFIED","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'payment.refunded.amount',1,'Refunded payment amount','Sum of provider-verified refunded amount. Currency is a mandatory dimension; values must never be summed across currencies.',
    'PAYMENT','SUM','MONEY','SUM','EVENT_FEED',
    array['ORGANIZATION','BUSINESS','BRANCH'],array['provider','currency'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"payment.refunded.v1","valueField":"numeric_value","unitField":"numeric_unit","requiredDimensions":["currency"],"crossCurrencyAggregation":false,"requiredEvidenceClass":"PROVIDER_VERIFIED","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'ai.usage.cost_usd',1,'AI/provider usage cost','Sum of canonical Cost Guard usage ledger cost in USD.',
    'AI','SUM','USD','SUM','EVENT_FEED',
    array['ORGANIZATION'],array['provider','operation','usageClassification'],300,
    '{"feed":"analytics_event_feed_v1","eventName":"ai.usage.recorded.v1","valueField":"numeric_value","requiredNumericUnit":"USD","causal":false}'::jsonb,'ACTIVE'
  ),
  (
    'preview.viewed.count',1,'Preview views','Count of canonical Preview VIEWED lifecycle evidence.',
    'SALES','COUNT','COUNT','COUNT','EVENT_FEED',
    array['ORGANIZATION'],array[]::text[],300,
    '{"feed":"analytics_event_feed_v1","eventName":"preview.viewed.v1","causal":false}'::jsonb,'ACTIVE'
  );

comment on column public.metric_definitions.definition is
  'Machine-readable semantic contract. causal=false means metric association must not be presented as causal attribution.';