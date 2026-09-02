do $$
declare
  v_org_id uuid;
begin
  select id
    into v_org_id
    from public.organizations
   where name = 'Smart Visions'
   order by created_at asc
   limit 1;

  if v_org_id is null then
    raise exception 'Smart Visions organization not found';
  end if;

  insert into public.services(
    organization_id,
    id,
    name,
    enabled,
    config
  )
  values (
    v_org_id,
    'seo_growth',
    'SEO Growth',
    true,
    '{"serviceFamily":"SEO_GROWTH","billingCadence":"monthly","startingFrom":true,"availableCountries":["OM"]}'::jsonb
  )
  on conflict (organization_id, id)
  do update set
    name = excluded.name,
    enabled = excluded.enabled,
    config = excluded.config,
    updated_at = now();

  insert into public.service_prices(
    organization_id,
    service_id,
    country_code,
    currency,
    price,
    minimum_price,
    max_auto_discount_pct,
    max_discount_with_approval_pct
  )
  values (
    v_org_id,
    'seo_growth',
    'OM',
    'OMR',
    149,
    135,
    5,
    10
  )
  on conflict (organization_id, service_id, country_code)
  do update set
    currency = excluded.currency,
    price = excluded.price,
    minimum_price = excluded.minimum_price,
    max_auto_discount_pct = excluded.max_auto_discount_pct,
    max_discount_with_approval_pct = excluded.max_discount_with_approval_pct;
end $$;
