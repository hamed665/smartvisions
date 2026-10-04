-- DATA-ATTRIBUTION V2
--
-- Extends the existing observational Marketing Attribution read model across
-- canonical downstream outcomes. This migration deliberately creates no
-- attribution fact/table/event truth. Every result is recomputed read-only from
-- real sent Marketing touchpoints plus timestamped canonical outcome evidence.
--
-- V1 public.get_marketing_attribution(uuid,text,integer,integer) remains intact for compatibility.
-- Causality is never claimed. DEAL/QUOTE/ORDER values are commercial evidence,
-- not collected revenue. Only PAYMENT_CAPTURED uses immutable PAYMENT-CORE
-- money-movement evidence, and even that remains observational campaign credit.

create index if not exists crm_deals_data_attribution_won_idx
  on public.crm_deals(organization_id,won_at desc,id,lead_id)
  where state='WON' and won_at is not null and lead_id is not null;

create index if not exists booking_events_data_attribution_completed_idx
  on public.booking_lifecycle_events(organization_id,occurred_at desc,booking_id,id)
  where transition='COMPLETED';

create index if not exists quote_events_data_attribution_accepted_idx
  on public.quote_lifecycle_events(organization_id,occurred_at desc,quote_id,id)
  where transition='ACCEPTED';

create index if not exists order_events_data_attribution_fulfilled_idx
  on public.order_lifecycle_events(organization_id,occurred_at desc,order_id,id)
  where transition='FULFILLED';

create index if not exists payment_transactions_data_attribution_captured_idx
  on public.payment_transactions(organization_id,occurred_at desc,payment_intent_id,id)
  where transaction_type='CAPTURED';

drop function if exists public.get_observational_attribution_v2(uuid,text,text,integer,integer);

create function public.get_observational_attribution_v2(
  p_organization_id uuid,
  p_outcome_type text default 'ALL',
  p_model text default 'LAST_TOUCH',
  p_lookback_days integer default 30,
  p_limit integer default 200
)
returns table(
  outcome_type text,
  outcome_id uuid,
  outcome_evidence_id uuid,
  lead_id uuid,
  lead_link_basis text,
  deal_id uuid,
  outcome_at timestamptz,
  outcome_value numeric,
  outcome_currency text,
  outcome_value_class text,
  campaign_id uuid,
  campaign_name text,
  campaign_channel text,
  attribution_model text,
  credit_bps integer,
  first_touch_at timestamptz,
  last_touch_at timestamptz,
  touch_count bigint,
  conversation_ids uuid[],
  reply_count bigint,
  explicit_conversion_evidence_count bigint,
  causal_claim boolean,
  collected_money_evidence boolean,
  evidence_basis text[]
)
language plpgsql
stable
security invoker
set search_path=public,pg_catalog
as $data_attribution_v2$
declare
  v_model text:=upper(trim(coalesce(p_model,'LAST_TOUCH')));
  v_outcome_type text:=upper(trim(coalesce(p_outcome_type,'ALL')));
begin
  if v_model not in ('FIRST_TOUCH','LAST_TOUCH','LINEAR') then
    raise exception 'unsupported attribution model';
  end if;

  if v_outcome_type not in (
    'ALL','DEAL_WON','BOOKING_COMPLETED','QUOTE_ACCEPTED',
    'ORDER_FULFILLED','PAYMENT_CAPTURED'
  ) then
    raise exception 'unsupported attribution outcome type';
  end if;

  if p_lookback_days<1 or p_lookback_days>180 then
    raise exception 'attribution lookback must be between 1 and 180 days';
  end if;

  if p_limit<1 or p_limit>500 then
    raise exception 'attribution limit must be between 1 and 500 outcomes';
  end if;

  return query
  with deal_outcomes as (
    select
      d.organization_id,
      'DEAL_WON'::text as outcome_type,
      d.id as outcome_id,
      d.id as outcome_evidence_id,
      d.lead_id,
      'DIRECT_DEAL_LEAD'::text as lead_link_basis,
      d.id as deal_id,
      d.won_at as outcome_at,
      d.amount as outcome_value,
      d.currency as outcome_currency,
      'SALES_VALUE'::text as outcome_value_class,
      false as collected_money_evidence
    from public.crm_deals d
    where d.organization_id=p_organization_id
      and d.state='WON'
      and d.lead_id is not null
      and d.won_at is not null
  ),
  booking_outcomes as (
    select distinct on (b.id)
      b.organization_id,
      'BOOKING_COMPLETED'::text as outcome_type,
      b.id as outcome_id,
      e.id as outcome_evidence_id,
      b.lead_id,
      'DIRECT_BOOKING_LEAD'::text as lead_link_basis,
      null::uuid as deal_id,
      e.occurred_at as outcome_at,
      null::numeric as outcome_value,
      null::text as outcome_currency,
      'NON_MONETARY'::text as outcome_value_class,
      false as collected_money_evidence
    from public.booking_lifecycle_events e
    join public.bookings b
      on b.organization_id=e.organization_id
     and b.id=e.booking_id
    where e.organization_id=p_organization_id
      and e.transition='COMPLETED'
      and b.lead_id is not null
    order by b.id,e.occurred_at asc,e.id asc
  ),
  quote_outcomes as (
    select distinct on (q.id)
      q.organization_id,
      'QUOTE_ACCEPTED'::text as outcome_type,
      q.id as outcome_id,
      e.id as outcome_evidence_id,
      d.lead_id,
      'DEAL_LEAD'::text as lead_link_basis,
      q.deal_id,
      e.occurred_at as outcome_at,
      qv.total as outcome_value,
      qv.currency as outcome_currency,
      'COMMERCIAL_VALUE'::text as outcome_value_class,
      false as collected_money_evidence
    from public.quote_lifecycle_events e
    join public.quotes q
      on q.organization_id=e.organization_id
     and q.id=e.quote_id
    join public.crm_deals d
      on d.organization_id=q.organization_id
     and d.id=q.deal_id
     and d.lead_id is not null
    join public.quote_versions qv
      on qv.organization_id=q.organization_id
     and qv.quote_id=q.id
     and qv.version_no=q.current_version
    where e.organization_id=p_organization_id
      and e.transition='ACCEPTED'
      and q.deal_id is not null
    order by q.id,e.occurred_at asc,e.id asc
  ),
  order_candidates as (
    select distinct on (o.id)
      o.organization_id,
      o.id as outcome_id,
      e.id as outcome_evidence_id,
      o.deal_id,
      d.lead_id as deal_lead_id,
      b.lead_id as booking_lead_id,
      e.occurred_at as outcome_at,
      o.total as outcome_value,
      o.currency as outcome_currency
    from public.order_lifecycle_events e
    join public.orders o
      on o.organization_id=e.organization_id
     and o.id=e.order_id
    left join public.crm_deals d
      on d.organization_id=o.organization_id
     and d.id=o.deal_id
    left join public.bookings b
      on b.organization_id=o.organization_id
     and b.id=o.booking_id
    where e.organization_id=p_organization_id
      and e.transition='FULFILLED'
    order by o.id,e.occurred_at asc,e.id asc
  ),
  order_outcomes as (
    select
      oc.organization_id,
      'ORDER_FULFILLED'::text as outcome_type,
      oc.outcome_id,
      oc.outcome_evidence_id,
      case
        when oc.deal_lead_id is not null
         and oc.booking_lead_id is not null
         and oc.deal_lead_id<>oc.booking_lead_id
        then null
        else coalesce(oc.deal_lead_id,oc.booking_lead_id)
      end as lead_id,
      case
        when oc.deal_lead_id is not null and oc.booking_lead_id is not null then 'DEAL_AND_BOOKING_LEAD'
        when oc.deal_lead_id is not null then 'DEAL_LEAD'
        when oc.booking_lead_id is not null then 'BOOKING_LEAD'
        else 'UNRESOLVED'
      end as lead_link_basis,
      oc.deal_id,
      oc.outcome_at,
      oc.outcome_value,
      oc.outcome_currency,
      'COMMERCIAL_VALUE'::text as outcome_value_class,
      false as collected_money_evidence
    from order_candidates oc
    where not (
      oc.deal_lead_id is not null
      and oc.booking_lead_id is not null
      and oc.deal_lead_id<>oc.booking_lead_id
    )
      and coalesce(oc.deal_lead_id,oc.booking_lead_id) is not null
  ),
  payment_candidates as (
    select distinct on (pt.id)
      pt.organization_id,
      pi.id as outcome_id,
      pt.id as outcome_evidence_id,
      pi.deal_id,
      d.lead_id as deal_lead_id,
      b.lead_id as booking_lead_id,
      pt.occurred_at as outcome_at,
      pt.amount as outcome_value,
      pt.currency as outcome_currency
    from public.payment_transactions pt
    join public.payment_intents pi
      on pi.organization_id=pt.organization_id
     and pi.id=pt.payment_intent_id
    left join public.crm_deals d
      on d.organization_id=pi.organization_id
     and d.id=pi.deal_id
    left join public.bookings b
      on b.organization_id=pi.organization_id
     and b.id=pi.booking_id
    where pt.organization_id=p_organization_id
      and pt.transaction_type='CAPTURED'
    order by pt.id,pt.occurred_at asc
  ),
  payment_outcomes as (
    select
      pc.organization_id,
      'PAYMENT_CAPTURED'::text as outcome_type,
      pc.outcome_id,
      pc.outcome_evidence_id,
      case
        when pc.deal_lead_id is not null
         and pc.booking_lead_id is not null
         and pc.deal_lead_id<>pc.booking_lead_id
        then null
        else coalesce(pc.deal_lead_id,pc.booking_lead_id)
      end as lead_id,
      case
        when pc.deal_lead_id is not null and pc.booking_lead_id is not null then 'DEAL_AND_BOOKING_LEAD'
        when pc.deal_lead_id is not null then 'DEAL_LEAD'
        when pc.booking_lead_id is not null then 'BOOKING_LEAD'
        else 'UNRESOLVED'
      end as lead_link_basis,
      pc.deal_id,
      pc.outcome_at,
      pc.outcome_value,
      pc.outcome_currency,
      'COLLECTED_MONEY'::text as outcome_value_class,
      true as collected_money_evidence
    from payment_candidates pc
    where not (
      pc.deal_lead_id is not null
      and pc.booking_lead_id is not null
      and pc.deal_lead_id<>pc.booking_lead_id
    )
      and coalesce(pc.deal_lead_id,pc.booking_lead_id) is not null
  ),
  all_outcomes as (
    select * from deal_outcomes
    union all
    select * from booking_outcomes
    union all
    select * from quote_outcomes
    union all
    select * from order_outcomes
    union all
    select * from payment_outcomes
  ),
  bounded_outcomes as (
    select o.*
    from all_outcomes o
    where v_outcome_type='ALL' or o.outcome_type=v_outcome_type
    order by o.outcome_at desc,o.outcome_type,o.outcome_id
    limit p_limit
  ),
  touch_evidence as (
    select
      o.*,
      c.id as campaign_id,
      c.name as campaign_name,
      c.channel as campaign_channel,
      om.id as outreach_message_id,
      om.sent_at as touch_at,
      cm.conversation_id,
      re.id as reply_event_id,
      ce.id as conversion_evidence_id
    from bounded_outcomes o
    join public.outreach_messages om
      on om.organization_id=o.organization_id
     and om.lead_id=o.lead_id
     and om.campaign_id is not null
     and om.direction='OUTBOUND'
     and om.sent_at is not null
     and om.sent_at<=o.outcome_at
     and om.sent_at>=o.outcome_at-make_interval(days=>p_lookback_days)
    join public.campaigns c
      on c.organization_id=om.organization_id
     and c.id=om.campaign_id
     and c.campaign_kind='MARKETING'
    left join public.conversation_messages cm
      on cm.organization_id=om.organization_id
     and cm.channel=om.channel
     and cm.provider_message_id=om.provider_message_id
     and cm.direction='OUTBOUND'
     and om.provider_message_id is not null
    left join public.reply_events re
      on re.organization_id=om.organization_id
     and re.outreach_message_id=om.id
     and re.created_at>=om.sent_at
     and re.created_at<=o.outcome_at
    left join public.marketing_campaign_conversion_evidence ce
      on o.deal_id is not null
     and ce.organization_id=o.organization_id
     and ce.campaign_id=c.id
     and ce.deal_id=o.deal_id
     and ce.occurred_at<=o.outcome_at
  ),
  campaign_rollup as (
    select
      te.organization_id,
      te.outcome_type,
      te.outcome_id,
      te.outcome_evidence_id,
      te.lead_id,
      te.lead_link_basis,
      te.deal_id,
      te.outcome_at,
      te.outcome_value,
      te.outcome_currency,
      te.outcome_value_class,
      te.collected_money_evidence,
      te.campaign_id,
      max(te.campaign_name) as campaign_name,
      max(te.campaign_channel) as campaign_channel,
      min(te.touch_at) as first_touch_at,
      max(te.touch_at) as last_touch_at,
      count(distinct te.outreach_message_id)::bigint as touch_count,
      coalesce(
        array_agg(distinct te.conversation_id)
          filter (where te.conversation_id is not null),
        array[]::uuid[]
      ) as conversation_ids,
      count(distinct te.reply_event_id)::bigint as reply_count,
      count(distinct te.conversion_evidence_id)::bigint as explicit_conversion_evidence_count
    from touch_evidence te
    group by
      te.organization_id,
      te.outcome_type,
      te.outcome_id,
      te.outcome_evidence_id,
      te.lead_id,
      te.lead_link_basis,
      te.deal_id,
      te.outcome_at,
      te.outcome_value,
      te.outcome_currency,
      te.outcome_value_class,
      te.collected_money_evidence,
      te.campaign_id
  ),
  ranked as (
    select
      cr.*,
      row_number() over (
        partition by cr.outcome_type,cr.outcome_id,cr.outcome_evidence_id
        order by cr.first_touch_at asc,cr.campaign_id asc
      ) as first_rank,
      row_number() over (
        partition by cr.outcome_type,cr.outcome_id,cr.outcome_evidence_id
        order by cr.last_touch_at desc,cr.campaign_id asc
      ) as last_rank,
      count(*) over (
        partition by cr.outcome_type,cr.outcome_id,cr.outcome_evidence_id
      )::integer as campaign_count,
      row_number() over (
        partition by cr.outcome_type,cr.outcome_id,cr.outcome_evidence_id
        order by cr.campaign_id asc
      )::integer as linear_rank
    from campaign_rollup cr
  )
  select
    r.outcome_type,
    r.outcome_id,
    r.outcome_evidence_id,
    r.lead_id,
    r.lead_link_basis,
    r.deal_id,
    r.outcome_at,
    r.outcome_value,
    r.outcome_currency,
    r.outcome_value_class,
    r.campaign_id,
    r.campaign_name,
    r.campaign_channel,
    v_model as attribution_model,
    case
      when v_model='LINEAR' then
        (
          (10000/r.campaign_count)
          + case when r.linear_rank<=(10000%r.campaign_count) then 1 else 0 end
        )::integer
      else 10000
    end as credit_bps,
    r.first_touch_at,
    r.last_touch_at,
    r.touch_count,
    r.conversation_ids,
    r.reply_count,
    r.explicit_conversion_evidence_count,
    false as causal_claim,
    r.collected_money_evidence,
    array_remove(
      array[
        case r.outcome_type
          when 'DEAL_WON' then 'CANONICAL_WON_DEAL'
          when 'BOOKING_COMPLETED' then 'BOOKING_COMPLETED_LIFECYCLE_EVENT'
          when 'QUOTE_ACCEPTED' then 'QUOTE_ACCEPTED_LIFECYCLE_EVENT'
          when 'ORDER_FULFILLED' then 'ORDER_FULFILLED_LIFECYCLE_EVENT'
          when 'PAYMENT_CAPTURED' then 'PAYMENT_CAPTURED_TRANSACTION'
        end,
        r.lead_link_basis,
        'SENT_MARKETING_TOUCHPOINT',
        case when cardinality(r.conversation_ids)>0 then 'EXACT_PROVIDER_CONVERSATION' end,
        case when r.reply_count>0 then 'DIRECT_REPLY_EVENT' end,
        case when r.explicit_conversion_evidence_count>0 then 'EXPLICIT_CONVERSION_EVIDENCE' end,
        case when r.collected_money_evidence then 'IMMUTABLE_MONEY_MOVEMENT_EVIDENCE' end
      ]::text[],
      null
    ) as evidence_basis
  from ranked r
  where
    v_model='LINEAR'
    or (v_model='FIRST_TOUCH' and r.first_rank=1)
    or (v_model='LAST_TOUCH' and r.last_rank=1)
  order by r.outcome_at desc,r.outcome_type,r.outcome_id,r.last_touch_at desc,r.campaign_id;
end;
$data_attribution_v2$;

revoke all on function public.get_observational_attribution_v2(uuid,text,text,integer,integer)
  from public,anon;
grant execute on function public.get_observational_attribution_v2(uuid,text,text,integer,integer)
  to authenticated,service_role;

comment on function public.get_observational_attribution_v2(uuid,text,text,integer,integer) is
  'Read-only observational Marketing/Sales attribution over real sent Marketing touchpoints and timestamped canonical Deal/Booking/Quote/Order/Payment outcomes. Never claims causality. Only PAYMENT_CAPTURED carries immutable collected-money evidence; commercial/sales values are not revenue. Outcomes without an exact Lead linkage are excluded rather than guessed.';