-- Smart Visions AI Business OS 2027
-- MARKETING-ATTRIBUTION observational read model.
--
-- This migration deliberately creates no persisted attribution truth. Attribution
-- remains a bounded, read-only interpretation of canonical Marketing Campaign,
-- actual sent Outreach, exact provider-message Conversation linkage, canonical
-- WON Deal outcome and optional explicit conversion evidence.
--
-- Deal amount is sales evidence, not collected revenue. Booking/Order/Payment
-- authorities do not exist yet and are intentionally not fabricated here.

create index if not exists outreach_messages_marketing_attribution_idx
  on public.outreach_messages(
    organization_id,
    campaign_id,
    lead_id,
    sent_at,
    id
  )
  where campaign_id is not null
    and lead_id is not null
    and direction='OUTBOUND'
    and sent_at is not null;

drop function if exists public.get_marketing_attribution(uuid,text,integer,integer);

create function public.get_marketing_attribution(
  p_organization_id uuid,
  p_model text default 'LAST_TOUCH',
  p_lookback_days integer default 30,
  p_limit integer default 200
)
returns table(
  deal_id uuid,
  lead_id uuid,
  outcome_at timestamptz,
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
  won_deal_amount numeric,
  won_deal_currency text,
  causal_claim boolean,
  revenue_claimed boolean,
  evidence_basis text[]
)
language plpgsql
stable
security invoker
set search_path=public,pg_catalog
as $marketing_attribution$
declare
  v_model text:=upper(trim(coalesce(p_model,'LAST_TOUCH')));
begin
  if v_model not in ('FIRST_TOUCH','LAST_TOUCH','LINEAR') then
    raise exception 'unsupported marketing attribution model';
  end if;

  if p_lookback_days<1 or p_lookback_days>180 then
    raise exception 'marketing attribution lookback must be between 1 and 180 days';
  end if;

  if p_limit<1 or p_limit>500 then
    raise exception 'marketing attribution limit must be between 1 and 500';
  end if;

  return query
  with won_deals as (
    select
      d.organization_id,
      d.id as deal_id,
      d.lead_id,
      d.won_at as outcome_at,
      d.amount as won_deal_amount,
      d.currency as won_deal_currency
    from public.crm_deals d
    where d.organization_id=p_organization_id
      and d.state='WON'
      and d.lead_id is not null
      and d.won_at is not null
  ),
  touch_evidence as (
    select
      wd.organization_id,
      wd.deal_id,
      wd.lead_id,
      wd.outcome_at,
      wd.won_deal_amount,
      wd.won_deal_currency,
      c.id as campaign_id,
      c.name as campaign_name,
      c.channel as campaign_channel,
      om.id as outreach_message_id,
      om.sent_at as touch_at,
      cm.conversation_id,
      re.id as reply_event_id,
      ce.id as conversion_evidence_id
    from won_deals wd
    join public.outreach_messages om
      on om.organization_id=wd.organization_id
     and om.lead_id=wd.lead_id
     and om.campaign_id is not null
     and om.direction='OUTBOUND'
     and om.sent_at is not null
     and om.sent_at<=wd.outcome_at
     and om.sent_at>=wd.outcome_at-make_interval(days=>p_lookback_days)
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
    left join public.marketing_campaign_conversion_evidence ce
      on ce.organization_id=wd.organization_id
     and ce.campaign_id=c.id
     and ce.deal_id=wd.deal_id
  ),
  campaign_rollup as (
    select
      te.organization_id,
      te.deal_id,
      te.lead_id,
      te.outcome_at,
      te.won_deal_amount,
      te.won_deal_currency,
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
      te.deal_id,
      te.lead_id,
      te.outcome_at,
      te.won_deal_amount,
      te.won_deal_currency,
      te.campaign_id
  ),
  ranked as (
    select
      cr.*,
      row_number() over (
        partition by cr.deal_id
        order by cr.first_touch_at asc,cr.campaign_id asc
      ) as first_rank,
      row_number() over (
        partition by cr.deal_id
        order by cr.last_touch_at desc,cr.campaign_id asc
      ) as last_rank,
      count(*) over (partition by cr.deal_id)::integer as campaign_count,
      row_number() over (
        partition by cr.deal_id
        order by cr.campaign_id asc
      )::integer as linear_rank
    from campaign_rollup cr
  )
  select
    r.deal_id,
    r.lead_id,
    r.outcome_at,
    r.campaign_id,
    r.campaign_name,
    r.campaign_channel,
    v_model as attribution_model,
    case
      when v_model='LINEAR' then
        (
          (10000/r.campaign_count)
          + case
              when r.linear_rank<=(10000%r.campaign_count) then 1
              else 0
            end
        )::integer
      else 10000
    end as credit_bps,
    r.first_touch_at,
    r.last_touch_at,
    r.touch_count,
    r.conversation_ids,
    r.reply_count,
    r.explicit_conversion_evidence_count,
    r.won_deal_amount,
    r.won_deal_currency,
    false as causal_claim,
    false as revenue_claimed,
    array_remove(
      array[
        'WON_DEAL',
        'SENT_MARKETING_TOUCHPOINT',
        case
          when cardinality(r.conversation_ids)>0
          then 'EXACT_PROVIDER_CONVERSATION'
        end,
        case
          when r.reply_count>0
          then 'DIRECT_REPLY_EVENT'
        end,
        case
          when r.explicit_conversion_evidence_count>0
          then 'EXPLICIT_CONVERSION_EVIDENCE'
        end
      ]::text[],
      null
    ) as evidence_basis
  from ranked r
  where
    v_model='LINEAR'
    or (v_model='FIRST_TOUCH' and r.first_rank=1)
    or (v_model='LAST_TOUCH' and r.last_rank=1)
  order by r.outcome_at desc,r.deal_id,r.last_touch_at desc,r.campaign_id
  limit p_limit;
end;
$marketing_attribution$;

revoke all on function public.get_marketing_attribution(uuid,text,integer,integer)
  from public,anon;
grant execute on function public.get_marketing_attribution(uuid,text,integer,integer)
  to authenticated,service_role;

comment on function public.get_marketing_attribution(uuid,text,integer,integer) is
  'Read-only, observational Marketing attribution over real sent campaign touchpoints and canonical WON Deals. Supports bounded FIRST_TOUCH/LAST_TOUCH/LINEAR credit. Never claims causality or collected revenue; explicit conversion evidence alone is insufficient without a real prior touchpoint.';
