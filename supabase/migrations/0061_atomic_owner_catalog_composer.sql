create or replace function public.apply_owner_catalog_batch(
  p_organization_id uuid,
  p_plan jsonb,
  p_owner_user_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_expected jsonb;
  v_current jsonb;
  v_service_id text;
  v_country_code text;
  v_currency text;
  v_price numeric;
  v_minimum_price numeric;
  v_auto_discount numeric;
  v_approval_discount numeric;
  v_services_changed integer := 0;
  v_prices_changed integer := 0;
begin
  if p_organization_id is null then
    raise exception 'organization is required';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'catalog plan must be a JSON object';
  end if;
  if p_plan->>'source' <> 'TELEGRAM_OWNER_CATALOG_COMPOSER' or p_plan->>'version' <> '1' then
    raise exception 'unsupported catalog plan provenance';
  end if;
  if jsonb_typeof(p_plan->'services') <> 'array' or jsonb_typeof(p_plan->'prices') <> 'array' then
    raise exception 'catalog plan operations must be arrays';
  end if;
  if jsonb_array_length(p_plan->'services') + jsonb_array_length(p_plan->'prices') > 50 then
    raise exception 'catalog plan exceeds 50-operation safety limit';
  end if;
  if octet_length(p_plan::text) > 100000 then
    raise exception 'catalog plan payload is too large';
  end if;
  if coalesce(length(p_owner_user_id), 0) < 1 or length(p_owner_user_id) > 128 then
    raise exception 'owner identity is invalid';
  end if;

  v_country_code := upper(coalesce(p_plan->>'countryCode', ''));
  v_currency := upper(coalesce(p_plan->>'currency', ''));
  if v_country_code !~ '^[A-Z]{2}$' or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'catalog market metadata is invalid';
  end if;

  -- Services are applied first so a new service can be referenced by a price in the same transaction.
  for v_item in select value from jsonb_array_elements(p_plan->'services')
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'service operation must be an object';
    end if;
    v_service_id := coalesce(v_item->>'id', '');
    if v_service_id !~ '^[a-z][a-z0-9_]{1,79}$' then
      raise exception 'invalid service id: %', v_service_id;
    end if;
    if coalesce(length(v_item->>'name'), 0) < 1 or length(v_item->>'name') > 200 then
      raise exception 'invalid service name for %', v_service_id;
    end if;
    if jsonb_typeof(v_item->'enabled') <> 'boolean' then
      raise exception 'service enabled must be boolean for %', v_service_id;
    end if;
    if jsonb_typeof(v_item->'config') <> 'object' then
      raise exception 'service config must be an object for %', v_service_id;
    end if;
    if octet_length((v_item->'config')::text) > 20000 then
      raise exception 'service config is too large for %', v_service_id;
    end if;
    if (v_item->'config') ?| array['secret','token','password','credential','apiKey','api_key'] then
      raise exception 'sensitive config keys are not allowed in catalog composer';
    end if;

    select jsonb_build_object(
      'name', s.name,
      'enabled', s.enabled,
      'config', s.config
    ) into v_current
    from public.services s
    where s.organization_id = p_organization_id
      and s.id = v_service_id
    for update;

    v_expected := v_item->'expectedBefore';
    if v_expected is null or v_expected = 'null'::jsonb then
      if v_current is not null then
        raise exception 'catalog preview is stale: service % now exists', v_service_id;
      end if;
    else
      if v_current is null then
        raise exception 'catalog preview is stale: service % no longer exists', v_service_id;
      end if;
      if v_current <> v_expected then
        raise exception 'catalog preview is stale: service % changed after preview', v_service_id;
      end if;
    end if;

    insert into public.services (id, organization_id, name, enabled, config, updated_at)
    values (
      v_service_id,
      p_organization_id,
      v_item->>'name',
      (v_item->>'enabled')::boolean,
      v_item->'config',
      now()
    )
    on conflict (organization_id, id) do update
      set name = excluded.name,
          enabled = excluded.enabled,
          config = excluded.config,
          updated_at = now();

    v_services_changed := v_services_changed + 1;
    v_current := null;
  end loop;

  for v_item in select value from jsonb_array_elements(p_plan->'prices')
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'price operation must be an object';
    end if;
    v_service_id := coalesce(v_item->>'serviceId', '');
    if v_service_id !~ '^[a-z][a-z0-9_]{1,79}$' then
      raise exception 'invalid price service id: %', v_service_id;
    end if;
    if upper(coalesce(v_item->>'countryCode', '')) <> v_country_code
       or upper(coalesce(v_item->>'currency', '')) <> v_currency then
      raise exception 'price operation market does not match batch market';
    end if;
    if not exists (
      select 1 from public.services s
      where s.organization_id = p_organization_id and s.id = v_service_id
    ) then
      raise exception 'price references missing service %', v_service_id;
    end if;

    begin
      v_price := (v_item->>'price')::numeric;
      v_minimum_price := nullif(v_item->>'minimumPrice', '')::numeric;
      v_auto_discount := coalesce((v_item->>'maxAutoDiscountPct')::numeric, 0);
      v_approval_discount := coalesce((v_item->>'maxDiscountWithApprovalPct')::numeric, 0);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'invalid numeric price data for %', v_service_id;
    end;
    if v_price < 0 or v_price > 1000000 then
      raise exception 'price is outside safe range for %', v_service_id;
    end if;
    if v_minimum_price is not null and (v_minimum_price < 0 or v_minimum_price > v_price) then
      raise exception 'minimum price is invalid for %', v_service_id;
    end if;
    if v_auto_discount < 0 or v_auto_discount > 100
       or v_approval_discount < 0 or v_approval_discount > 100
       or v_approval_discount < v_auto_discount then
      raise exception 'discount policy is invalid for %', v_service_id;
    end if;

    select jsonb_build_object(
      'currency', sp.currency,
      'price', sp.price,
      'minimumPrice', sp.minimum_price,
      'maxAutoDiscountPct', sp.max_auto_discount_pct,
      'maxDiscountWithApprovalPct', sp.max_discount_with_approval_pct
    ) into v_current
    from public.service_prices sp
    where sp.organization_id = p_organization_id
      and sp.service_id = v_service_id
      and sp.country_code = v_country_code
    for update;

    v_expected := v_item->'expectedBefore';
    if v_expected is null or v_expected = 'null'::jsonb then
      if v_current is not null then
        raise exception 'catalog preview is stale: price %/% now exists', v_service_id, v_country_code;
      end if;
    else
      if v_current is null then
        raise exception 'catalog preview is stale: price %/% no longer exists', v_service_id, v_country_code;
      end if;
      if v_current <> v_expected then
        raise exception 'catalog preview is stale: price %/% changed after preview', v_service_id, v_country_code;
      end if;
    end if;

    insert into public.service_prices (
      organization_id,
      service_id,
      country_code,
      currency,
      price,
      minimum_price,
      max_auto_discount_pct,
      max_discount_with_approval_pct
    ) values (
      p_organization_id,
      v_service_id,
      v_country_code,
      v_currency,
      v_price,
      v_minimum_price,
      v_auto_discount,
      v_approval_discount
    )
    on conflict (organization_id, service_id, country_code) do update
      set currency = excluded.currency,
          price = excluded.price,
          minimum_price = excluded.minimum_price,
          max_auto_discount_pct = excluded.max_auto_discount_pct,
          max_discount_with_approval_pct = excluded.max_discount_with_approval_pct;

    v_prices_changed := v_prices_changed + 1;
    v_current := null;
  end loop;

  insert into public.audit_logs (
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    p_organization_id,
    'SYSTEM',
    p_owner_user_id,
    'TELEGRAM_OWNER_CATALOG_BATCH_APPLIED',
    'catalog_batch',
    v_country_code,
    jsonb_build_object(
      'services', (
        select coalesce(jsonb_agg(jsonb_build_object('id', value->>'id', 'value', value->'expectedBefore')), '[]'::jsonb)
        from jsonb_array_elements(p_plan->'services')
      ),
      'prices', (
        select coalesce(jsonb_agg(jsonb_build_object('serviceId', value->>'serviceId', 'value', value->'expectedBefore')), '[]'::jsonb)
        from jsonb_array_elements(p_plan->'prices')
      )
    ),
    jsonb_build_object(
      'source', p_plan->>'source',
      'version', p_plan->>'version',
      'countryCode', v_country_code,
      'currency', v_currency,
      'services', p_plan->'services',
      'prices', p_plan->'prices'
    )
  );

  return jsonb_build_object(
    'applied', true,
    'services_changed', v_services_changed,
    'prices_changed', v_prices_changed,
    'country_code', v_country_code,
    'currency', v_currency
  );
end;
$$;

revoke all on function public.apply_owner_catalog_batch(uuid, jsonb, text) from public;
revoke all on function public.apply_owner_catalog_batch(uuid, jsonb, text) from anon;
revoke all on function public.apply_owner_catalog_batch(uuid, jsonb, text) from authenticated;
grant execute on function public.apply_owner_catalog_batch(uuid, jsonb, text) to service_role;
