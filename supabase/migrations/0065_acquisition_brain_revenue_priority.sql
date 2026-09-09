alter table public.growth_opportunities
  add column if not exists company_size text,
  add column if not exists company_size_reason text,
  add column if not exists revenue_potential_band text,
  add column if not exists urgency_score integer,
  add column if not exists priority_score integer,
  add column if not exists recommended_acquisition_route text,
  add column if not exists acquisition_routing_reason text,
  add column if not exists future_service_id text,
  add column if not exists do_not_offer_service_ids jsonb not null default '[]'::jsonb;

alter table public.service_prices
  add column if not exists premium_price numeric(12,2);

alter table public.growth_opportunities
  add constraint growth_opportunities_company_size_check
    check (company_size is null or company_size in ('MICRO','SMALL','MEDIUM','ENTERPRISE')),
  add constraint growth_opportunities_revenue_potential_band_check
    check (revenue_potential_band is null or revenue_potential_band in ('LOW','MEDIUM','HIGH','STRATEGIC')),
  add constraint growth_opportunities_urgency_score_check
    check (urgency_score is null or urgency_score between 0 and 100),
  add constraint growth_opportunities_priority_score_check
    check (priority_score is null or priority_score between 0 and 100),
  add constraint growth_opportunities_acquisition_route_check
    check (recommended_acquisition_route is null or recommended_acquisition_route in ('EMAIL','GCC_HUMAN_IG_WA','HYBRID_EMAIL_HUMAN_GCC','HUMAN_REVIEW','NONE')),
  add constraint growth_opportunities_do_not_offer_service_ids_array_check
    check (jsonb_typeof(do_not_offer_service_ids) = 'array');

alter table public.service_prices
  add constraint service_prices_premium_price_check
    check (premium_price is null or (premium_price >= 0 and premium_price >= price));

create index if not exists growth_opportunities_priority_score_idx
  on public.growth_opportunities (priority_score desc nulls last, updated_at desc);

create index if not exists growth_opportunities_market_routing_idx
  on public.growth_opportunities (company_size, recommended_acquisition_route, priority_score desc nulls last);

update public.services
set config = coalesce(config, '{}'::jsonb)
  || jsonb_build_object(
    'availableCountries', jsonb_build_array('OM'),
    'availableServiceRegions', jsonb_build_array('MUSCAT_LOCAL'),
    'physicalDelivery', true,
    'outsideMuscatFallbackRequired', true
  ),
  updated_at = now()
where id = 'custom_content_production';

update public.market_settings
set config = coalesce(config, '{}'::jsonb)
  || case country_code
    when 'OM' then jsonb_build_object(
      'acquisitionStrategy', 'GCC_WHATSAPP_INSTAGRAM_FIRST',
      'permittedAcquisitionChannels', jsonb_build_array('HUMAN_INSTAGRAM','HUMAN_WHATSAPP','EMAIL','INBOUND_WHATSAPP'),
      'instagramAutoColdEnabled', false,
      'whatsappColdEnabled', false,
      'whatsappOptInRequirement', 'VERIFIED_EVIDENCE',
      'humanReviewRequiredForColdSocial', true,
      'coldEmailContactPolicy', 'BUSINESS_ENDPOINT_OR_DOCUMENTED_CONSENT',
      'complianceSource', 'OM_MTCIT_PDPL'
    )
    when 'AE' then jsonb_build_object(
      'acquisitionStrategy', 'GCC_WHATSAPP_INSTAGRAM_FIRST',
      'permittedAcquisitionChannels', jsonb_build_array('HUMAN_INSTAGRAM','HUMAN_WHATSAPP','EMAIL','INBOUND_WHATSAPP'),
      'instagramAutoColdEnabled', false,
      'whatsappColdEnabled', false,
      'whatsappOptInRequirement', 'VERIFIED_EVIDENCE',
      'humanReviewRequiredForColdSocial', true,
      'coldEmailContactPolicy', 'BUSINESS_ENDPOINT_OR_DOCUMENTED_CONSENT'
    )
    when 'SA' then jsonb_build_object(
      'acquisitionStrategy', 'GCC_WHATSAPP_INSTAGRAM_FIRST',
      'permittedAcquisitionChannels', jsonb_build_array('HUMAN_INSTAGRAM','HUMAN_WHATSAPP','EMAIL','INBOUND_WHATSAPP'),
      'instagramAutoColdEnabled', false,
      'whatsappColdEnabled', false,
      'whatsappOptInRequirement', 'VERIFIED_EVIDENCE',
      'humanReviewRequiredForColdSocial', true,
      'coldEmailContactPolicy', 'BUSINESS_ENDPOINT_OR_DOCUMENTED_CONSENT',
      'complianceSource', 'SA_SDAIA_PDPL'
    )
    when 'QA' then jsonb_build_object(
      'acquisitionStrategy', 'GCC_WHATSAPP_INSTAGRAM_FIRST',
      'permittedAcquisitionChannels', jsonb_build_array('HUMAN_INSTAGRAM','HUMAN_WHATSAPP','EMAIL','INBOUND_WHATSAPP'),
      'instagramAutoColdEnabled', false,
      'whatsappColdEnabled', false,
      'whatsappOptInRequirement', 'VERIFIED_EVIDENCE',
      'humanReviewRequiredForColdSocial', true,
      'coldEmailContactPolicy', 'BUSINESS_ENDPOINT_OR_DOCUMENTED_CONSENT'
    )
    when 'GB' then jsonb_build_object(
      'acquisitionStrategy', 'EMAIL_FIRST',
      'permittedAcquisitionChannels', jsonb_build_array('EMAIL','HUMAN_LINKEDIN','INBOUND_WHATSAPP'),
      'instagramAutoColdEnabled', false,
      'whatsappColdEnabled', false,
      'coldEmailContactPolicy', 'CORPORATE_SUBSCRIBER_OR_VALID_CONSENT',
      'unsubscribeRequired', true,
      'complianceSource', 'UK_ICO_PECR'
    )
    when 'US' then jsonb_build_object(
      'acquisitionStrategy', 'EMAIL_FIRST',
      'permittedAcquisitionChannels', jsonb_build_array('EMAIL','HUMAN_LINKEDIN','INBOUND_WHATSAPP'),
      'instagramAutoColdEnabled', false,
      'whatsappColdEnabled', false,
      'unsubscribeRequired', true,
      'commercialIdentityRequired', true,
      'complianceSource', 'US_FTC_CAN_SPAM'
    )
    when 'CA' then jsonb_build_object(
      'acquisitionStrategy', 'EMAIL_FIRST_RESTRICTED',
      'permittedAcquisitionChannels', jsonb_build_array('EMAIL_WITH_VALID_CONSENT_BASIS','HUMAN_LINKEDIN','INBOUND_WHATSAPP'),
      'coldEmailEnabled', false,
      'instagramAutoColdEnabled', false,
      'whatsappColdEnabled', false,
      'commercialActivationBlocked', true,
      'commercialActivationBlockers', jsonb_build_array('CAD_PRICING_REQUIRED','CASL_CONSENT_BASIS_REQUIRED'),
      'unsubscribeRequired', true,
      'complianceSource', 'CA_CRTC_CASL'
    )
    else '{}'::jsonb
  end,
  enabled = case when country_code = 'CA' then false else enabled end,
  updated_at = now()
where country_code in ('OM','AE','SA','QA','GB','US','CA');
