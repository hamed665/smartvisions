-- Smart Visions AI Business OS 2027
-- HUNTER-CUSTOMER-MODULE customer-facing read model.
--
-- Extends existing authorities only:
-- campaigns -> discovery_records -> businesses/growth_opportunities -> canonical leads/deals,
-- usage_events/Cost Guard for provider consumption, existing subscription/entitlement
-- authority for commercial configuration, and suppression_list for compliance evidence.
--
-- No second Prospect store, CRM, credit ledger, entitlement store, consent source,
-- send gate or provider runtime is created. Contactability is never permission.

drop function if exists public.get_hunter_customer_summary(uuid);
drop function if exists public.get_hunter_customer_prospects(uuid,integer);

create function public.get_hunter_customer_summary(
  p_organization_id uuid
)
returns table(
  hunter_campaign_count bigint,
  running_hunter_campaign_count bigint,
  configured_target_total bigint,
  discovered_prospect_count bigint,
  enriched_business_count bigint,
  promoted_lead_count bigint,
  qualified_prospect_count bigint,
  suppressed_prospect_count bigint,
  usage_period_start timestamptz,
  hunter_usage_units numeric,
  hunter_provider_cost_usd numeric,
  observed_won_deal_count bigint,
  observed_won_amounts jsonb,
  hunter_entitlements jsonb,
  hunter_entitlement_status text
)
language plpgsql
stable
security invoker
set search_path=public,auth,pg_catalog
as $hunter_customer_summary$
begin
  if p_organization_id is null then
    raise exception 'organization is required';
  end if;

  return query
  with linked as (
    select
      dr.id as discovery_id,
      b.id as business_id,
      l.id as lead_id,
      g.id as growth_opportunity_id,
      g.should_contact,
      g.prospect_tier,
      exists (
        select 1
        from public.suppression_list s
        where s.organization_id=dr.organization_id
          and (
            (s.email is not null and b.email is not null and lower(trim(s.email))=lower(trim(b.email)))
            or (
              s.phone is not null
              and coalesce(b.international_phone,b.phone) is not null
              and regexp_replace(s.phone,'\D','','g')<>''
              and regexp_replace(s.phone,'\D','','g')=
                  regexp_replace(coalesce(b.international_phone,b.phone),'\D','','g')
            )
            or (
              s.domain is not null
              and b.dedupe_domain is not null
              and lower(trim(s.domain))=lower(trim(b.dedupe_domain))
            )
          )
      ) as suppressed
    from public.discovery_records dr
    left join lateral (
      select b0.*
      from public.businesses b0
      where b0.organization_id=dr.organization_id
        and (
          (dr.source_type='google_places' and b0.google_place_id=dr.source_id)
          or b0.id=case
            when coalesce(dr.raw_payload->>'businessId','') ~*
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (dr.raw_payload->>'businessId')::uuid
            else null
          end
        )
      order by case when dr.source_type='google_places' and b0.google_place_id=dr.source_id then 0 else 1 end,b0.id
      limit 1
    ) b on true
    left join lateral (
      select l0.*
      from public.leads l0
      where l0.organization_id=dr.organization_id
        and (
          (b.id is not null and l0.business_id=b.id)
          or l0.id=case
            when coalesce(dr.raw_payload->>'leadId','') ~*
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (dr.raw_payload->>'leadId')::uuid
            else null
          end
        )
      order by case when b.id is not null and l0.business_id=b.id then 0 else 1 end,l0.id
      limit 1
    ) l on true
    left join public.growth_opportunities g
      on g.organization_id=dr.organization_id
     and g.business_id=b.id
    where dr.organization_id=p_organization_id
  ),
  linked_leads as (
    select distinct lead_id
    from linked
    where lead_id is not null
  ),
  hunter_usage as (
    select
      coalesce(sum(u.units),0)::numeric as units,
      coalesce(sum(u.cost_usd),0)::numeric as cost_usd
    from public.usage_events u
    where u.organization_id=p_organization_id
      and u.created_at>=date_trunc('month',now())
      and (
        upper(u.provider)='GOOGLE_PLACES'
        or upper(coalesce(u.metadata->>'module',''))='HUNTER'
        or upper(coalesce(u.metadata->>'product',''))='HUNTER'
      )
  ),
  won as (
    select d.id,d.amount,d.currency
    from public.crm_deals d
    join linked_leads ll on ll.lead_id=d.lead_id
    where d.organization_id=p_organization_id
      and d.state='WON'
  ),
  won_by_currency as (
    select
      coalesce(currency,'UNSPECIFIED') as currency,
      coalesce(sum(amount),0)::numeric as amount
    from won
    group by coalesce(currency,'UNSPECIFIED')
  ),
  entitlement_rows as (
    select
      'PLAN'::text as source_type,
      pe.feature_key,
      pe.entitlement_value,
      s.started_at as effective_at
    from public.subscriptions s
    join public.plan_entitlements pe
      on pe.pricing_version_id=s.pricing_version_id
    where s.organization_id=p_organization_id
      and s.status in ('TRIAL','ACTIVE','GRACE_PERIOD')
      and upper(pe.feature_key) like '%HUNTER%'

    union all

    select
      ('OVERRIDE:'||o.source_type)::text as source_type,
      o.feature_key,
      o.entitlement_value,
      o.valid_from as effective_at
    from public.organization_entitlement_overrides o
    where o.organization_id=p_organization_id
      and o.valid_from<=now()
      and (o.valid_to is null or o.valid_to>now())
      and upper(o.feature_key) like '%HUNTER%'
  ),
  entitlement_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'source',source_type,
          'featureKey',feature_key,
          'value',entitlement_value,
          'effectiveAt',effective_at
        )
        order by effective_at desc,feature_key
      ),
      '[]'::jsonb
    ) as value
    from entitlement_rows
  )
  select
    (select count(*) from public.campaigns c
      where c.organization_id=p_organization_id and c.campaign_kind='HUNTER')::bigint,
    (select count(*) from public.campaigns c
      where c.organization_id=p_organization_id and c.campaign_kind='HUNTER' and c.status='RUNNING')::bigint,
    (select coalesce(sum(c.target_count),0) from public.campaigns c
      where c.organization_id=p_organization_id and c.campaign_kind='HUNTER')::bigint,
    (select count(*) from linked)::bigint,
    (select count(distinct business_id) from linked where business_id is not null)::bigint,
    (select count(distinct lead_id) from linked where lead_id is not null)::bigint,
    (select count(*) from linked
      where growth_opportunity_id is not null
        and (should_contact=true or prospect_tier in ('A','B')))::bigint,
    (select count(*) from linked where suppressed)::bigint,
    date_trunc('month',now()),
    (select units from hunter_usage),
    (select cost_usd from hunter_usage),
    (select count(*) from won)::bigint,
    coalesce(
      (select jsonb_object_agg(currency,amount order by currency) from won_by_currency),
      '{}'::jsonb
    ),
    (select value from entitlement_json),
    case
      when jsonb_array_length((select value from entitlement_json))>0 then 'CONFIGURED'
      else 'UNCONFIGURED'
    end;
end;
$hunter_customer_summary$;

create function public.get_hunter_customer_prospects(
  p_organization_id uuid,
  p_limit integer default 200
)
returns table(
  discovery_id uuid,
  campaign_id uuid,
  campaign_name text,
  target_country text,
  target_city text,
  target_industry text,
  source_type text,
  source_id text,
  source_url text,
  discovered_at timestamptz,
  business_id uuid,
  business_name text,
  business_country text,
  business_city text,
  business_category text,
  lead_id uuid,
  lead_status text,
  prospect_tier text,
  qualification_score integer,
  qualification_confidence integer,
  priority_score integer,
  recommended_acquisition_route text,
  should_contact boolean,
  lifecycle_state text,
  suppressed boolean,
  compliance_state text,
  contactability_is_permission boolean,
  provider_usage_units numeric,
  provider_cost_usd numeric,
  observed_won_deal_count bigint,
  observed_won_amounts jsonb,
  roi_evidence_state text,
  evidence_basis text[]
)
language plpgsql
stable
security invoker
set search_path=public,auth,pg_catalog
as $hunter_customer_prospects$
begin
  if p_organization_id is null then
    raise exception 'organization is required';
  end if;
  if p_limit<1 or p_limit>500 then
    raise exception 'Hunter prospect limit must be between 1 and 500';
  end if;

  return query
  with prospect_base as (
    select
      dr.id as discovery_id,
      dr.organization_id,
      dr.campaign_id,
      c.name as campaign_name,
      c.country_code as target_country,
      c.city as target_city,
      c.industry as target_industry,
      dr.source_type,
      dr.source_id,
      dr.source_url,
      dr.discovered_at,
      b.id as business_id,
      b.name as business_name,
      b.country_code as business_country,
      b.city as business_city,
      b.category as business_category,
      b.email,
      b.phone,
      b.international_phone,
      b.dedupe_domain,
      l.id as lead_id,
      l.status::text as lead_status,
      g.prospect_tier,
      g.qualification_score,
      g.qualification_confidence,
      g.priority_score,
      g.recommended_acquisition_route,
      g.should_contact
    from public.discovery_records dr
    left join public.campaigns c
      on c.organization_id=dr.organization_id
     and c.id=dr.campaign_id
     and c.campaign_kind='HUNTER'
    left join lateral (
      select b0.*
      from public.businesses b0
      where b0.organization_id=dr.organization_id
        and (
          (dr.source_type='google_places' and b0.google_place_id=dr.source_id)
          or b0.id=case
            when coalesce(dr.raw_payload->>'businessId','') ~*
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (dr.raw_payload->>'businessId')::uuid
            else null
          end
        )
      order by case when dr.source_type='google_places' and b0.google_place_id=dr.source_id then 0 else 1 end,b0.id
      limit 1
    ) b on true
    left join lateral (
      select l0.*
      from public.leads l0
      where l0.organization_id=dr.organization_id
        and (
          (b.id is not null and l0.business_id=b.id)
          or l0.id=case
            when coalesce(dr.raw_payload->>'leadId','') ~*
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (dr.raw_payload->>'leadId')::uuid
            else null
          end
        )
      order by case when b.id is not null and l0.business_id=b.id then 0 else 1 end,l0.id
      limit 1
    ) l on true
    left join public.growth_opportunities g
      on g.organization_id=dr.organization_id
     and g.business_id=b.id
    where dr.organization_id=p_organization_id
    order by dr.discovered_at desc,dr.id desc
    limit p_limit
  )
  select
    pb.discovery_id,
    pb.campaign_id,
    pb.campaign_name,
    pb.target_country,
    pb.target_city,
    pb.target_industry,
    pb.source_type,
    pb.source_id,
    pb.source_url,
    pb.discovered_at,
    pb.business_id,
    pb.business_name,
    pb.business_country,
    pb.business_city,
    pb.business_category,
    pb.lead_id,
    pb.lead_status,
    pb.prospect_tier,
    pb.qualification_score,
    pb.qualification_confidence,
    pb.priority_score,
    pb.recommended_acquisition_route,
    coalesce(pb.should_contact,false),
    case
      when pb.lead_id is not null then 'CRM_PROMOTED'
      when pb.business_id is not null then 'ENRICHED'
      else 'DISCOVERED'
    end as lifecycle_state,
    suppression.is_suppressed,
    case
      when suppression.is_suppressed then 'SUPPRESSED'
      else 'REVIEW_REQUIRED_BEFORE_OUTREACH'
    end as compliance_state,
    false as contactability_is_permission,
    coalesce(provider_usage.units,0)::numeric,
    coalesce(provider_usage.cost_usd,0)::numeric,
    coalesce(won.won_count,0)::bigint,
    coalesce(won.amounts,'{}'::jsonb),
    case
      when coalesce(won.won_count,0)>0 then 'OBSERVATIONAL_WON_DEAL_EVIDENCE'
      when pb.lead_id is not null then 'CRM_PROMOTED_NO_WON_DEAL'
      when pb.business_id is not null then 'ENRICHED_NOT_PROMOTED'
      else 'DISCOVERY_ONLY'
    end as roi_evidence_state,
    array_remove(array[
      'DISCOVERY_EVIDENCE',
      case when pb.business_id is not null then 'BUSINESS_ENRICHMENT' end,
      case when pb.prospect_tier is not null then 'QUALIFICATION_EVIDENCE' end,
      case when coalesce(provider_usage.units,0)>0 then 'PROVIDER_USAGE_EVIDENCE' end,
      case when pb.lead_id is not null then 'CRM_PROMOTION_EVIDENCE' end,
      case when coalesce(won.won_count,0)>0 then 'WON_DEAL_OBSERVATION' end
    ]::text[],null)
  from prospect_base pb
  left join lateral (
    select exists (
      select 1
      from public.suppression_list s
      where s.organization_id=p_organization_id
        and (
          (s.email is not null and pb.email is not null and lower(trim(s.email))=lower(trim(pb.email)))
          or (
            s.phone is not null
            and coalesce(pb.international_phone,pb.phone) is not null
            and regexp_replace(s.phone,'\D','','g')<>''
            and regexp_replace(s.phone,'\D','','g')=
                regexp_replace(coalesce(pb.international_phone,pb.phone),'\D','','g')
          )
          or (
            s.domain is not null
            and pb.dedupe_domain is not null
            and lower(trim(s.domain))=lower(trim(pb.dedupe_domain))
          )
        )
    ) as is_suppressed
  ) suppression on true
  left join lateral (
    select
      coalesce(sum(u.units),0)::numeric as units,
      coalesce(sum(u.cost_usd),0)::numeric as cost_usd
    from public.usage_events u
    where u.organization_id=p_organization_id
      and (
        (pb.source_type='google_places' and upper(u.provider)='GOOGLE_PLACES'
          and u.metadata->>'placeId'=pb.source_id)
        or (pb.lead_id is not null and u.lead_id=pb.lead_id
          and upper(coalesce(u.metadata->>'module',''))='HUNTER')
      )
  ) provider_usage on true
  left join lateral (
    select
      (
        select count(*)::bigint
        from public.crm_deals d0
        where d0.organization_id=p_organization_id
          and d0.lead_id=pb.lead_id
          and d0.state='WON'
      ) as won_count,
      coalesce(
        (
          select jsonb_object_agg(x.currency,x.amount order by x.currency)
          from (
            select
              coalesce(d.currency,'UNSPECIFIED') as currency,
              coalesce(sum(d.amount),0)::numeric as amount
            from public.crm_deals d
            where d.organization_id=p_organization_id
              and d.lead_id=pb.lead_id
              and d.state='WON'
            group by coalesce(d.currency,'UNSPECIFIED')
          ) x
        ),
        '{}'::jsonb
      ) as amounts
  ) won on true
  order by pb.discovered_at desc,pb.discovery_id desc;
end;
$hunter_customer_prospects$;

revoke all on function public.get_hunter_customer_summary(uuid) from public,anon;
revoke all on function public.get_hunter_customer_prospects(uuid,integer) from public,anon;
grant execute on function public.get_hunter_customer_summary(uuid) to authenticated,service_role;
grant execute on function public.get_hunter_customer_prospects(uuid,integer) to authenticated,service_role;

comment on function public.get_hunter_customer_summary(uuid) is
  'Read-only customer Hunter summary over canonical Campaign, discovery, Growth, CRM, usage/cost, entitlement and suppression evidence. Hunter entitlement JSON is reported without inventing a credit balance or feature-key contract.';
comment on function public.get_hunter_customer_prospects(uuid,integer) is
  'Read-only Hunter prospect lifecycle. Discovery/contactability never grants send permission; suppression is surfaced and actual outreach remains governed by canonical send/consent/policy gates.';
