-- Smart Visions AI Business OS 2027
-- Phase 3 / Slice 6: governed Dynamic Lead Segments.
--
-- Boundaries:
-- - LEAD only
-- - DYNAMIC evaluation only
-- - no snapshots/current-membership persistence
-- - no campaign/workflow/provider execution
-- - no arbitrary SQL / JSONPath / PostgREST filter strings
-- - no PII/SENSITIVE Custom Field predicates
-- - no metadata JSON predicates
-- - no destructive DELETE lifecycle

create table if not exists public.crm_segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null default 'LEAD'
    check (entity_type = 'LEAD'),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','ARCHIVED')),
  current_definition_version integer not null default 1
    check (current_definition_version >= 1),
  version integer not null default 1
    check (version >= 1),
  last_request_key text not null
    check (length(trim(last_request_key)) between 1 and 200),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),
  unique (organization_id, last_request_key),

  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  foreign key (organization_id, updated_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create table if not exists public.crm_segment_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  segment_id uuid not null,
  version integer not null check (version >= 1),
  name text not null check (length(trim(name)) between 1 and 160),
  evaluation_mode text not null default 'DYNAMIC'
    check (evaluation_mode = 'DYNAMIC'),
  predicate_tree jsonb not null
    check (jsonb_typeof(predicate_tree) = 'object'),
  predicate_hash text not null
    check (predicate_hash ~ '^[0-9a-f]{32}$'),
  predicate_leaf_count integer not null
    check (predicate_leaf_count between 1 and 20),
  request_key text not null
    check (length(trim(request_key)) between 1 and 200),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),

  unique (organization_id, id),
  unique (organization_id, segment_id, version),
  unique (organization_id, request_key),

  foreign key (organization_id, segment_id)
    references public.crm_segments(organization_id, id)
    on delete restrict,
  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create index if not exists crm_segments_org_status_updated_idx
  on public.crm_segments(organization_id, status, updated_at desc, id desc);

create index if not exists crm_segments_created_by_fk_idx
  on public.crm_segments(organization_id, created_by_user_id);

create index if not exists crm_segments_updated_by_fk_idx
  on public.crm_segments(organization_id, updated_by_user_id);

create index if not exists crm_segment_versions_created_by_fk_idx
  on public.crm_segment_versions(organization_id, created_by_user_id);

create or replace function public.crm_segment_can_manage(
  p_organization_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('OWNER','ADMIN','SALES_MANAGER')
  );
$$;

create or replace function public.crm_segment_valid_uuid_text(p_value text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(
    p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    false
  );
$$;

create or replace function public.crm_segment_valid_timestamptz_text(p_value text)
returns boolean
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
begin
  if p_value is null or trim(p_value) = '' then
    return false;
  end if;
  perform p_value::timestamptz;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.crm_segment_valid_date_text(p_value text)
returns boolean
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
begin
  if p_value is null or trim(p_value) = '' then
    return false;
  end if;
  perform p_value::date;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.crm_validate_segment_predicate_node(
  p_organization_id uuid,
  p_entity_type text,
  p_node jsonb,
  p_depth integer default 0
)
returns integer
language plpgsql
stable
security invoker
set search_path = public, auth, pg_catalog
as $segment_validate$
declare
  v_kind text;
  v_source text;
  v_field text;
  v_operator text;
  v_child jsonb;
  v_item jsonb;
  v_leaf_count integer := 0;
  v_definition public.crm_custom_field_definitions%rowtype;
  v_definition_id uuid;
  v_definition_version integer;
  v_data_type text;
  v_has_value boolean;
  v_option_count integer;
  v_currency text;
  v_min numeric;
  v_max numeric;
begin
  if p_entity_type <> 'LEAD' then
    raise exception 'CRM Segment first slice supports LEAD only';
  end if;
  if p_depth < 0 or p_depth > 4 then
    raise exception 'CRM Segment predicate depth exceeds 4';
  end if;
  if p_node is null or jsonb_typeof(p_node) <> 'object' then
    raise exception 'CRM Segment predicate node must be an object';
  end if;

  v_kind := upper(coalesce(p_node->>'kind',''));

  if v_kind = 'GROUP' then
    if (p_node - array['kind','op','children']::text[]) <> '{}'::jsonb then
      raise exception 'CRM Segment GROUP contains unsupported keys';
    end if;
    if upper(coalesce(p_node->>'op','')) not in ('AND','OR') then
      raise exception 'CRM Segment GROUP operator must be AND or OR';
    end if;
    if jsonb_typeof(p_node->'children') <> 'array'
       or jsonb_array_length(p_node->'children') not between 1 and 8
    then
      raise exception 'CRM Segment GROUP children must contain 1..8 nodes';
    end if;

    for v_child in
      select value from jsonb_array_elements(p_node->'children')
    loop
      v_leaf_count := v_leaf_count
        + public.crm_validate_segment_predicate_node(
            p_organization_id,p_entity_type,v_child,p_depth+1
          );
      if v_leaf_count > 20 then
        raise exception 'CRM Segment predicate exceeds 20 leaves';
      end if;
    end loop;
    return v_leaf_count;
  end if;

  if v_kind <> 'PREDICATE' then
    raise exception 'CRM Segment node kind must be GROUP or PREDICATE';
  end if;

  v_source := upper(coalesce(p_node->>'source',''));
  v_operator := upper(coalesce(p_node->>'operator',''));
  v_has_value := (p_node ? 'value') and p_node->'value' <> 'null'::jsonb;

  if v_source = 'CANONICAL' then
    if (p_node - array['kind','source','field','operator','value']::text[]) <> '{}'::jsonb then
      raise exception 'CRM Segment canonical predicate contains unsupported keys';
    end if;

    v_field := lower(coalesce(p_node->>'field',''));

    if v_field = 'status' then
      if v_operator in ('EQ','NEQ') then
        if not v_has_value or jsonb_typeof(p_node->'value') <> 'string'
           or length(trim(p_node->>'value')) = 0
        then
          raise exception 'CRM Segment status predicate requires a string value';
        end if;
      elsif v_operator in ('IN','NOT_IN') then
        if not v_has_value or jsonb_typeof(p_node->'value') <> 'array'
           or jsonb_array_length(p_node->'value') not between 1 and 20
        then
          raise exception 'CRM Segment status IN predicate requires 1..20 values';
        end if;
        for v_item in select value from jsonb_array_elements(p_node->'value') loop
          if jsonb_typeof(v_item) <> 'string' or length(trim(v_item #>> '{}')) = 0 then
            raise exception 'CRM Segment status list values must be strings';
          end if;
        end loop;
      else
        raise exception 'CRM Segment status operator is not allowed';
      end if;
      return 1;
    end if;

    if v_field in ('opportunity_score','intent_score') then
      if v_operator in ('EQ','NEQ','GT','GTE','LT','LTE') then
        if not v_has_value or jsonb_typeof(p_node->'value') <> 'number' then
          raise exception 'CRM Segment score predicate requires numeric value';
        end if;
      elsif v_operator = 'BETWEEN' then
        if not v_has_value or jsonb_typeof(p_node->'value') <> 'array'
           or jsonb_array_length(p_node->'value') <> 2
           or jsonb_typeof(p_node->'value'->0) <> 'number'
           or jsonb_typeof(p_node->'value'->1) <> 'number'
        then
          raise exception 'CRM Segment score BETWEEN requires two numbers';
        end if;
        if (p_node->'value'->>0)::numeric > (p_node->'value'->>1)::numeric then
          raise exception 'CRM Segment BETWEEN lower bound exceeds upper bound';
        end if;
      else
        raise exception 'CRM Segment score operator is not allowed';
      end if;
      return 1;
    end if;

    if v_field = 'business_id' then
      if v_operator in ('IS_SET','IS_NOT_SET') then
        if v_has_value then
          raise exception 'CRM Segment set-state predicate cannot include value';
        end if;
      elsif v_operator = 'EQ' then
        if not v_has_value or jsonb_typeof(p_node->'value') <> 'string'
           or not public.crm_segment_valid_uuid_text(p_node->>'value')
        then
          raise exception 'CRM Segment business_id EQ requires UUID value';
        end if;
      elsif v_operator in ('IN','NOT_IN') then
        if not v_has_value or jsonb_typeof(p_node->'value') <> 'array'
           or jsonb_array_length(p_node->'value') not between 1 and 20
        then
          raise exception 'CRM Segment business_id list requires 1..20 UUIDs';
        end if;
        for v_item in select value from jsonb_array_elements(p_node->'value') loop
          if jsonb_typeof(v_item) <> 'string'
             or not public.crm_segment_valid_uuid_text(v_item #>> '{}')
          then
            raise exception 'CRM Segment business_id list contains invalid UUID';
          end if;
        end loop;
      else
        raise exception 'CRM Segment business_id operator is not allowed';
      end if;
      return 1;
    end if;

    if v_field in ('created_at','updated_at') then
      if v_operator in ('BEFORE','AFTER') then
        if not v_has_value or jsonb_typeof(p_node->'value') <> 'string'
           or not public.crm_segment_valid_timestamptz_text(p_node->>'value')
        then
          raise exception 'CRM Segment timestamp predicate requires ISO timestamp';
        end if;
      elsif v_operator = 'BETWEEN' then
        if not v_has_value or jsonb_typeof(p_node->'value') <> 'array'
           or jsonb_array_length(p_node->'value') <> 2
           or jsonb_typeof(p_node->'value'->0) <> 'string'
           or jsonb_typeof(p_node->'value'->1) <> 'string'
           or not public.crm_segment_valid_timestamptz_text(p_node->'value'->>0)
           or not public.crm_segment_valid_timestamptz_text(p_node->'value'->>1)
        then
          raise exception 'CRM Segment timestamp BETWEEN requires two ISO timestamps';
        end if;
        if (p_node->'value'->>0)::timestamptz > (p_node->'value'->>1)::timestamptz then
          raise exception 'CRM Segment timestamp BETWEEN lower bound exceeds upper bound';
        end if;
      else
        raise exception 'CRM Segment timestamp operator is not allowed';
      end if;
      return 1;
    end if;

    raise exception 'CRM Segment canonical field is not allowed';
  end if;

  if v_source <> 'CUSTOM_FIELD' then
    raise exception 'CRM Segment predicate source is not allowed';
  end if;

  if (p_node - array[
      'kind','source','definitionId','definitionVersion','dataType','operator','value'
    ]::text[]) <> '{}'::jsonb
  then
    raise exception 'CRM Segment Custom Field predicate contains unsupported keys';
  end if;

  if jsonb_typeof(p_node->'definitionId') <> 'string'
     or not public.crm_segment_valid_uuid_text(p_node->>'definitionId')
  then
    raise exception 'CRM Segment Custom Field definitionId must be UUID';
  end if;
  if jsonb_typeof(p_node->'definitionVersion') <> 'number'
     or coalesce(p_node->>'definitionVersion','') !~ '^[1-9][0-9]*$'
  then
    raise exception 'CRM Segment Custom Field definitionVersion must be positive integer';
  end if;

  v_definition_id := (p_node->>'definitionId')::uuid;
  v_definition_version := (p_node->>'definitionVersion')::integer;
  v_data_type := upper(coalesce(p_node->>'dataType',''));

  select * into v_definition
  from public.crm_custom_field_definitions d
  where d.organization_id = p_organization_id
    and d.id = v_definition_id;

  if not found
     or v_definition.entity_type <> 'LEAD'
     or v_definition.status <> 'ACTIVE'
     or not v_definition.filterable
     or v_definition.sensitivity_class <> 'INTERNAL'
     or v_definition.version <> v_definition_version
     or v_definition.data_type <> v_data_type
  then
    raise exception 'CRM Segment Custom Field contract is unavailable or incompatible';
  end if;

  if v_data_type in ('EMAIL','PHONE') then
    raise exception 'CRM Segment PII Custom Fields are not allowed in first slice';
  end if;

  if v_operator in ('IS_SET','IS_NOT_SET') then
    if v_has_value then
      raise exception 'CRM Segment set-state predicate cannot include value';
    end if;
    return 1;
  end if;

  if v_data_type in ('TEXT','LONG_TEXT','URL') then
    if v_operator not in ('EQ','NEQ')
       or not v_has_value
       or jsonb_typeof(p_node->'value') <> 'string'
    then
      raise exception 'CRM Segment text Custom Field predicate is invalid';
    end if;
    return 1;
  end if;

  if v_data_type = 'NUMBER' then
    if v_operator in ('EQ','NEQ','GT','GTE','LT','LTE') then
      if not v_has_value or jsonb_typeof(p_node->'value') <> 'number' then
        raise exception 'CRM Segment NUMBER predicate requires numeric value';
      end if;
    elsif v_operator = 'BETWEEN' then
      if not v_has_value or jsonb_typeof(p_node->'value') <> 'array'
         or jsonb_array_length(p_node->'value') <> 2
         or jsonb_typeof(p_node->'value'->0) <> 'number'
         or jsonb_typeof(p_node->'value'->1) <> 'number'
      then
        raise exception 'CRM Segment NUMBER BETWEEN requires two numbers';
      end if;
      if (p_node->'value'->>0)::numeric > (p_node->'value'->>1)::numeric then
        raise exception 'CRM Segment NUMBER BETWEEN lower bound exceeds upper bound';
      end if;
    else
      raise exception 'CRM Segment NUMBER operator is not allowed';
    end if;
    return 1;
  end if;

  if v_data_type = 'BOOLEAN' then
    if v_operator <> 'EQ'
       or not v_has_value
       or jsonb_typeof(p_node->'value') <> 'boolean'
    then
      raise exception 'CRM Segment BOOLEAN predicate must use EQ boolean';
    end if;
    return 1;
  end if;

  if v_data_type in ('DATE','DATETIME') then
    if v_operator in ('EQ','BEFORE','AFTER') then
      if not v_has_value or jsonb_typeof(p_node->'value') <> 'string' then
        raise exception 'CRM Segment date predicate requires string value';
      end if;
      if v_data_type='DATE'
         and not public.crm_segment_valid_date_text(p_node->>'value')
      then
        raise exception 'CRM Segment DATE value is invalid';
      end if;
      if v_data_type='DATETIME'
         and not public.crm_segment_valid_timestamptz_text(p_node->>'value')
      then
        raise exception 'CRM Segment DATETIME value is invalid';
      end if;
    elsif v_operator='BETWEEN' then
      if not v_has_value or jsonb_typeof(p_node->'value') <> 'array'
         or jsonb_array_length(p_node->'value') <> 2
         or jsonb_typeof(p_node->'value'->0) <> 'string'
         or jsonb_typeof(p_node->'value'->1) <> 'string'
      then
        raise exception 'CRM Segment date BETWEEN requires two strings';
      end if;
      if v_data_type='DATE' then
        if not public.crm_segment_valid_date_text(p_node->'value'->>0)
           or not public.crm_segment_valid_date_text(p_node->'value'->>1)
           or (p_node->'value'->>0)::date > (p_node->'value'->>1)::date
        then
          raise exception 'CRM Segment DATE BETWEEN is invalid';
        end if;
      else
        if not public.crm_segment_valid_timestamptz_text(p_node->'value'->>0)
           or not public.crm_segment_valid_timestamptz_text(p_node->'value'->>1)
           or (p_node->'value'->>0)::timestamptz > (p_node->'value'->>1)::timestamptz
        then
          raise exception 'CRM Segment DATETIME BETWEEN is invalid';
        end if;
      end if;
    else
      raise exception 'CRM Segment date operator is not allowed';
    end if;
    return 1;
  end if;

  if v_data_type = 'SINGLE_SELECT' then
    if v_operator = 'EQ' then
      if not v_has_value or jsonb_typeof(p_node->'value') <> 'string' then
        raise exception 'CRM Segment SINGLE_SELECT EQ requires option key';
      end if;
      if not exists (
        select 1 from public.crm_custom_field_options o
        where o.organization_id=p_organization_id
          and o.definition_id=v_definition_id
          and o.option_key=lower(trim(p_node->>'value'))
          and o.status='ACTIVE'
      ) then
        raise exception 'CRM Segment SINGLE_SELECT option is unavailable';
      end if;
    elsif v_operator in ('IN','NOT_IN') then
      if not v_has_value or jsonb_typeof(p_node->'value') <> 'array'
         or jsonb_array_length(p_node->'value') not between 1 and 20
      then
        raise exception 'CRM Segment SINGLE_SELECT list requires 1..20 options';
      end if;
      for v_item in select value from jsonb_array_elements(p_node->'value') loop
        if jsonb_typeof(v_item) <> 'string'
           or not exists (
             select 1 from public.crm_custom_field_options o
             where o.organization_id=p_organization_id
               and o.definition_id=v_definition_id
               and o.option_key=lower(trim(v_item #>> '{}'))
               and o.status='ACTIVE'
           )
        then
          raise exception 'CRM Segment SINGLE_SELECT list contains unavailable option';
        end if;
      end loop;
    else
      raise exception 'CRM Segment SINGLE_SELECT operator is not allowed';
    end if;
    return 1;
  end if;

  if v_data_type = 'MULTI_SELECT' then
    if v_operator <> 'CONTAINS_ANY'
       or not v_has_value
       or jsonb_typeof(p_node->'value') <> 'array'
       or jsonb_array_length(p_node->'value') not between 1 and 20
    then
      raise exception 'CRM Segment MULTI_SELECT supports CONTAINS_ANY with 1..20 options';
    end if;
    for v_item in select value from jsonb_array_elements(p_node->'value') loop
      if jsonb_typeof(v_item) <> 'string'
         or not exists (
           select 1 from public.crm_custom_field_options o
           where o.organization_id=p_organization_id
             and o.definition_id=v_definition_id
             and o.option_key=lower(trim(v_item #>> '{}'))
             and o.status='ACTIVE'
         )
      then
        raise exception 'CRM Segment MULTI_SELECT list contains unavailable option';
      end if;
    end loop;
    return 1;
  end if;

  if v_data_type = 'CURRENCY' then
    if v_operator in ('EQ','NEQ','GT','GTE','LT','LTE') then
      if not v_has_value or jsonb_typeof(p_node->'value') <> 'object'
         or (p_node->'value' - array['amount','currency']::text[]) <> '{}'::jsonb
         or jsonb_typeof(p_node->'value'->'amount') <> 'number'
         or jsonb_typeof(p_node->'value'->'currency') <> 'string'
      then
        raise exception 'CRM Segment CURRENCY predicate requires amount/currency object';
      end if;
      v_currency := upper(trim(p_node->'value'->>'currency'));
      if v_currency !~ '^[A-Z]{3}$' then
        raise exception 'CRM Segment CURRENCY code is invalid';
      end if;
    elsif v_operator='BETWEEN' then
      if not v_has_value or jsonb_typeof(p_node->'value') <> 'object'
         or (p_node->'value' - array['min','max','currency']::text[]) <> '{}'::jsonb
         or jsonb_typeof(p_node->'value'->'min') <> 'number'
         or jsonb_typeof(p_node->'value'->'max') <> 'number'
         or jsonb_typeof(p_node->'value'->'currency') <> 'string'
      then
        raise exception 'CRM Segment CURRENCY BETWEEN requires min/max/currency object';
      end if;
      v_min := (p_node->'value'->>'min')::numeric;
      v_max := (p_node->'value'->>'max')::numeric;
      v_currency := upper(trim(p_node->'value'->>'currency'));
      if v_min > v_max or v_currency !~ '^[A-Z]{3}$' then
        raise exception 'CRM Segment CURRENCY BETWEEN is invalid';
      end if;
    else
      raise exception 'CRM Segment CURRENCY operator is not allowed';
    end if;
    return 1;
  end if;

  raise exception 'CRM Segment Custom Field data type is not supported';
end;
$segment_validate$;

create or replace function public.crm_segment_predicate_matches_lead_node(
  p_organization_id uuid,
  p_lead_id uuid,
  p_status text,
  p_opportunity_score integer,
  p_intent_score integer,
  p_business_id uuid,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_node jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $segment_match$
declare
  v_kind text := upper(coalesce(p_node->>'kind',''));
  v_source text := upper(coalesce(p_node->>'source',''));
  v_field text := lower(coalesce(p_node->>'field',''));
  v_operator text := upper(coalesce(p_node->>'operator',''));
  v_child jsonb;
  v_result boolean;
  v_texts text[];
  v_definition_id uuid;
  v_definition_version integer;
  v_data_type text;
  v_value_id uuid;
  v_value_text text;
  v_value_number numeric;
  v_value_boolean boolean;
  v_value_date date;
  v_value_datetime timestamptz;
  v_value_currency_amount numeric;
  v_value_currency_code text;
  v_value_option_keys text[];
  v_target numeric;
  v_currency text;
begin
  if v_kind='GROUP' then
    if upper(p_node->>'op')='AND' then
      for v_child in select value from jsonb_array_elements(p_node->'children') loop
        if not public.crm_segment_predicate_matches_lead_node(
          p_organization_id,p_lead_id,p_status,p_opportunity_score,p_intent_score,
          p_business_id,p_created_at,p_updated_at,v_child
        ) then
          return false;
        end if;
      end loop;
      return true;
    end if;

    for v_child in select value from jsonb_array_elements(p_node->'children') loop
      if public.crm_segment_predicate_matches_lead_node(
        p_organization_id,p_lead_id,p_status,p_opportunity_score,p_intent_score,
        p_business_id,p_created_at,p_updated_at,v_child
      ) then
        return true;
      end if;
    end loop;
    return false;
  end if;

  if v_source='CANONICAL' then
    if v_field='status' then
      if v_operator='EQ' then return p_status=p_node->>'value'; end if;
      if v_operator='NEQ' then return p_status<>p_node->>'value'; end if;
      select array_agg(value #>> '{}') into v_texts
      from jsonb_array_elements(p_node->'value');
      if v_operator='IN' then return p_status=any(v_texts); end if;
      return not (p_status=any(v_texts));
    end if;

    if v_field in ('opportunity_score','intent_score') then
      v_target := case when v_field='opportunity_score'
        then p_opportunity_score else p_intent_score end;
      if v_operator='EQ' then return v_target=(p_node->>'value')::numeric; end if;
      if v_operator='NEQ' then return v_target<>(p_node->>'value')::numeric; end if;
      if v_operator='GT' then return v_target>(p_node->>'value')::numeric; end if;
      if v_operator='GTE' then return v_target>=(p_node->>'value')::numeric; end if;
      if v_operator='LT' then return v_target<(p_node->>'value')::numeric; end if;
      if v_operator='LTE' then return v_target<=(p_node->>'value')::numeric; end if;
      return v_target between (p_node->'value'->>0)::numeric
        and (p_node->'value'->>1)::numeric;
    end if;

    if v_field='business_id' then
      if v_operator='IS_SET' then return p_business_id is not null; end if;
      if v_operator='IS_NOT_SET' then return p_business_id is null; end if;
      if v_operator='EQ' then return p_business_id=(p_node->>'value')::uuid; end if;
      select array_agg(value #>> '{}') into v_texts
      from jsonb_array_elements(p_node->'value');
      if v_operator='IN' then return p_business_id::text=any(v_texts); end if;
      return not (p_business_id::text=any(v_texts));
    end if;

    if v_field='created_at' then
      if v_operator='BEFORE' then return p_created_at<(p_node->>'value')::timestamptz; end if;
      if v_operator='AFTER' then return p_created_at>(p_node->>'value')::timestamptz; end if;
      return p_created_at between (p_node->'value'->>0)::timestamptz
        and (p_node->'value'->>1)::timestamptz;
    end if;

    if v_field='updated_at' then
      if v_operator='BEFORE' then return p_updated_at<(p_node->>'value')::timestamptz; end if;
      if v_operator='AFTER' then return p_updated_at>(p_node->>'value')::timestamptz; end if;
      return p_updated_at between (p_node->'value'->>0)::timestamptz
        and (p_node->'value'->>1)::timestamptz;
    end if;

    return false;
  end if;

  v_definition_id := (p_node->>'definitionId')::uuid;
  v_definition_version := (p_node->>'definitionVersion')::integer;
  v_data_type := upper(p_node->>'dataType');

  select
    v.id,v.value_text,v.value_number,v.value_boolean,v.value_date,
    v.value_datetime,v.value_currency_amount,v.value_currency_code,
    v.value_option_keys
  into
    v_value_id,v_value_text,v_value_number,v_value_boolean,v_value_date,
    v_value_datetime,v_value_currency_amount,v_value_currency_code,
    v_value_option_keys
  from public.crm_custom_field_definitions d
  left join public.crm_custom_field_values v
    on v.organization_id=d.organization_id
   and v.definition_id=d.id
   and v.entity_type='LEAD'
   and v.lead_id=p_lead_id
   and v.state='SET'
  where d.organization_id=p_organization_id
    and d.id=v_definition_id
    and d.entity_type='LEAD'
    and d.status='ACTIVE'
    and d.filterable
    and d.sensitivity_class='INTERNAL'
    and d.version=v_definition_version
    and d.data_type=v_data_type;

  if not found then
    return false;
  end if;

  if v_operator='IS_SET' then return v_value_id is not null; end if;
  if v_operator='IS_NOT_SET' then return v_value_id is null; end if;
  if v_value_id is null then return false; end if;

  if v_data_type in ('TEXT','LONG_TEXT','URL') then
    if v_operator='EQ' then return v_value_text=p_node->>'value'; end if;
    return v_value_text<>p_node->>'value';
  end if;

  if v_data_type='NUMBER' then
    if v_operator='EQ' then return v_value_number=(p_node->>'value')::numeric; end if;
    if v_operator='NEQ' then return v_value_number<>(p_node->>'value')::numeric; end if;
    if v_operator='GT' then return v_value_number>(p_node->>'value')::numeric; end if;
    if v_operator='GTE' then return v_value_number>=(p_node->>'value')::numeric; end if;
    if v_operator='LT' then return v_value_number<(p_node->>'value')::numeric; end if;
    if v_operator='LTE' then return v_value_number<=(p_node->>'value')::numeric; end if;
    return v_value_number between (p_node->'value'->>0)::numeric
      and (p_node->'value'->>1)::numeric;
  end if;

  if v_data_type='BOOLEAN' then
    return v_value_boolean=(p_node->>'value')::boolean;
  end if;

  if v_data_type='DATE' then
    if v_operator='EQ' then return v_value_date=(p_node->>'value')::date; end if;
    if v_operator='BEFORE' then return v_value_date<(p_node->>'value')::date; end if;
    if v_operator='AFTER' then return v_value_date>(p_node->>'value')::date; end if;
    return v_value_date between (p_node->'value'->>0)::date
      and (p_node->'value'->>1)::date;
  end if;

  if v_data_type='DATETIME' then
    if v_operator='EQ' then return v_value_datetime=(p_node->>'value')::timestamptz; end if;
    if v_operator='BEFORE' then return v_value_datetime<(p_node->>'value')::timestamptz; end if;
    if v_operator='AFTER' then return v_value_datetime>(p_node->>'value')::timestamptz; end if;
    return v_value_datetime between (p_node->'value'->>0)::timestamptz
      and (p_node->'value'->>1)::timestamptz;
  end if;

  if v_data_type='SINGLE_SELECT' then
    if v_operator='EQ' then
      return lower(trim(p_node->>'value'))=any(coalesce(v_value_option_keys,array[]::text[]));
    end if;
    select array_agg(lower(trim(value #>> '{}'))) into v_texts
    from jsonb_array_elements(p_node->'value');
    if v_operator='IN' then
      return coalesce(v_value_option_keys,array[]::text[]) && v_texts;
    end if;
    return not (coalesce(v_value_option_keys,array[]::text[]) && v_texts);
  end if;

  if v_data_type='MULTI_SELECT' then
    select array_agg(lower(trim(value #>> '{}'))) into v_texts
    from jsonb_array_elements(p_node->'value');
    return coalesce(v_value_option_keys,array[]::text[]) && v_texts;
  end if;

  if v_data_type='CURRENCY' then
    v_currency := upper(trim(p_node->'value'->>'currency'));
    if v_value_currency_code<>v_currency then return false; end if;
    if v_operator='BETWEEN' then
      return v_value_currency_amount between
        (p_node->'value'->>'min')::numeric and (p_node->'value'->>'max')::numeric;
    end if;
    v_target := (p_node->'value'->>'amount')::numeric;
    if v_operator='EQ' then return v_value_currency_amount=v_target; end if;
    if v_operator='NEQ' then return v_value_currency_amount<>v_target; end if;
    if v_operator='GT' then return v_value_currency_amount>v_target; end if;
    if v_operator='GTE' then return v_value_currency_amount>=v_target; end if;
    if v_operator='LT' then return v_value_currency_amount<v_target; end if;
    return v_value_currency_amount<=v_target;
  end if;

  return false;
end;
$segment_match$;

create or replace function public.crm_segment_predicate_matches_lead(
  p_organization_id uuid,
  p_lead_id uuid,
  p_node jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead record;
begin
  select
    l.status::text as status,
    l.opportunity_score,
    l.intent_score,
    l.business_id,
    l.created_at,
    l.updated_at
  into v_lead
  from public.leads l
  where l.organization_id=p_organization_id
    and l.id=p_lead_id;

  if not found then return false; end if;

  return public.crm_segment_predicate_matches_lead_node(
    p_organization_id,p_lead_id,v_lead.status,v_lead.opportunity_score,
    v_lead.intent_score,v_lead.business_id,v_lead.created_at,v_lead.updated_at,
    p_node
  );
end;
$$;

create or replace function public.guard_crm_segment_identity()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
begin
  new.last_request_key := trim(new.last_request_key);

  if tg_op='INSERT' then
    if auth.uid() is null
       or new.created_by_user_id is distinct from auth.uid()
       or new.updated_by_user_id is distinct from auth.uid()
    then
      raise exception 'CRM Segment actor must match auth.uid()';
    end if;
    new.entity_type := 'LEAD';
    new.status := 'ACTIVE';
    new.current_definition_version := 1;
    new.version := 1;
    new.created_at := coalesce(new.created_at,now());
    new.updated_at := now();
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.entity_type is distinct from old.entity_type
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'CRM Segment identity/tenant/creator is immutable';
  end if;

  if auth.uid() is null or new.updated_by_user_id is distinct from auth.uid() then
    raise exception 'CRM Segment updater must match auth.uid()';
  end if;
  if new.version is distinct from old.version then
    raise exception 'CRM Segment row version is database-managed';
  end if;
  if new.current_definition_version < old.current_definition_version
     or new.current_definition_version > old.current_definition_version+1
  then
    raise exception 'CRM Segment definition version pointer is invalid';
  end if;
  if new.current_definition_version <> old.current_definition_version
     and new.status is distinct from old.status
  then
    raise exception 'CRM Segment definition and lifecycle cannot change together';
  end if;
  if new.current_definition_version=old.current_definition_version+1
     and not exists (
       select 1 from public.crm_segment_versions v
       where v.organization_id=old.organization_id
         and v.segment_id=old.id
         and v.version=new.current_definition_version
     )
  then
    raise exception 'CRM Segment next definition version is missing';
  end if;

  new.version := old.version+1;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_crm_segment_version()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_segment public.crm_segments%rowtype;
  v_leaf_count integer;
begin
  if tg_op<>'INSERT' then
    raise exception 'CRM Segment versions are immutable';
  end if;

  new.name := trim(new.name);
  new.request_key := trim(new.request_key);

  if auth.uid() is null or new.created_by_user_id is distinct from auth.uid() then
    raise exception 'CRM Segment version creator must match auth.uid()';
  end if;

  select * into v_segment
  from public.crm_segments s
  where s.organization_id=new.organization_id
    and s.id=new.segment_id
  for update;

  if not found then
    raise exception 'CRM Segment identity not found';
  end if;

  if new.version=1 then
    if v_segment.current_definition_version<>1
       or exists (
         select 1 from public.crm_segment_versions v
         where v.organization_id=new.organization_id
           and v.segment_id=new.segment_id
       )
    then
      raise exception 'CRM Segment initial definition version is invalid';
    end if;
  elsif new.version<>v_segment.current_definition_version+1 then
    raise exception 'CRM Segment next definition version is invalid';
  end if;

  v_leaf_count := public.crm_validate_segment_predicate_node(
    new.organization_id,'LEAD',new.predicate_tree,0
  );
  if v_leaf_count not between 1 and 20 then
    raise exception 'CRM Segment predicate leaf count is invalid';
  end if;

  new.evaluation_mode := 'DYNAMIC';
  new.predicate_leaf_count := v_leaf_count;
  new.predicate_hash := md5(new.predicate_tree::text);
  new.created_at := coalesce(new.created_at,now());
  return new;
end;
$$;

create or replace function public.enforce_crm_segment_current_version()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $segment_current_constraint$
begin
  if not exists (
    select 1 from public.crm_segment_versions v
    where v.organization_id=new.organization_id
      and v.segment_id=new.id
      and v.version=new.current_definition_version
  ) then
    raise exception 'CRM Segment current definition version does not exist';
  end if;
  return new;
end;
$segment_current_constraint$;

create or replace function public.enforce_crm_segment_version_reachable()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $segment_reachable_constraint$
begin
  if not exists (
    select 1 from public.crm_segments s
    where s.organization_id=new.organization_id
      and s.id=new.segment_id
      and s.current_definition_version>=new.version
  ) then
    raise exception 'CRM Segment semantic version is not reachable from identity';
  end if;
  return new;
end;
$segment_reachable_constraint$;

create or replace function public.audit_crm_segment_version()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
begin
  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data
  ) values (
    new.organization_id,
    'USER',
    auth.uid()::text,
    case when new.version=1
      then 'CRM_SEGMENT_CREATED'
      else 'CRM_SEGMENT_DEFINITION_UPDATED'
    end,
    'crm_segment',
    new.segment_id::text,
    jsonb_build_object(
      'segment_version',new.version,
      'evaluation_mode','DYNAMIC',
      'predicate_hash',new.predicate_hash,
      'predicate_leaf_count',new.predicate_leaf_count
    )
  );
  return new;
end;
$$;

create or replace function public.audit_crm_segment_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
begin
  if new.status is distinct from old.status then
    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,
      before_data,after_data
    ) values (
      new.organization_id,
      'USER',
      auth.uid()::text,
      case when new.status='ARCHIVED'
        then 'CRM_SEGMENT_ARCHIVED'
        else 'CRM_SEGMENT_REACTIVATED'
      end,
      'crm_segment',
      new.id::text,
      jsonb_build_object(
        'status',old.status,
        'segment_version',old.current_definition_version
      ),
      jsonb_build_object(
        'status',new.status,
        'segment_version',new.current_definition_version
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists crm_segment_identity_guard on public.crm_segments;
create trigger crm_segment_identity_guard
before insert or update on public.crm_segments
for each row execute function public.guard_crm_segment_identity();

drop trigger if exists crm_segment_version_guard on public.crm_segment_versions;
create trigger crm_segment_version_guard
before insert or update or delete on public.crm_segment_versions
for each row execute function public.guard_crm_segment_version();

drop trigger if exists crm_segment_current_version_constraint on public.crm_segments;
create constraint trigger crm_segment_current_version_constraint
after insert or update of current_definition_version on public.crm_segments
deferrable initially deferred
for each row execute function public.enforce_crm_segment_current_version();

drop trigger if exists crm_segment_version_reachable_constraint on public.crm_segment_versions;
create constraint trigger crm_segment_version_reachable_constraint
after insert on public.crm_segment_versions
deferrable initially deferred
for each row execute function public.enforce_crm_segment_version_reachable();

drop trigger if exists crm_segment_version_audit on public.crm_segment_versions;
create trigger crm_segment_version_audit
after insert on public.crm_segment_versions
for each row execute function public.audit_crm_segment_version();

drop trigger if exists crm_segment_lifecycle_audit on public.crm_segments;
create trigger crm_segment_lifecycle_audit
after update on public.crm_segments
for each row execute function public.audit_crm_segment_lifecycle();

alter table public.crm_segments enable row level security;
alter table public.crm_segment_versions enable row level security;

create policy crm_segments_member_read
on public.crm_segments
for select to authenticated
using (public.is_org_member(organization_id));

create policy crm_segments_manager_insert
on public.crm_segments
for insert to authenticated
with check (
  public.crm_segment_can_manage(organization_id)
  and created_by_user_id=(select auth.uid())
  and updated_by_user_id=(select auth.uid())
);

create policy crm_segments_manager_update
on public.crm_segments
for update to authenticated
using (public.crm_segment_can_manage(organization_id))
with check (
  public.crm_segment_can_manage(organization_id)
  and updated_by_user_id=(select auth.uid())
);

create policy crm_segment_versions_member_read
on public.crm_segment_versions
for select to authenticated
using (public.is_org_member(organization_id));

create policy crm_segment_versions_manager_insert
on public.crm_segment_versions
for insert to authenticated
with check (
  public.crm_segment_can_manage(organization_id)
  and created_by_user_id=(select auth.uid())
);

create or replace function public.create_crm_lead_segment(
  p_organization_id uuid,
  p_name text,
  p_predicate_tree jsonb,
  p_request_key text
)
returns public.crm_segments
language plpgsql
volatile
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_segment public.crm_segments%rowtype;
begin
  if v_actor is null or not public.crm_segment_can_manage(p_organization_id) then
    raise exception 'CRM Segment management is not permitted';
  end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 160
     or length(trim(coalesce(p_request_key,''))) not between 1 and 200
  then
    raise exception 'CRM Segment name/request key is invalid';
  end if;

  select s.* into v_segment
  from public.crm_segments s
  join public.crm_segment_versions v
    on v.organization_id=s.organization_id
   and v.segment_id=s.id
   and v.version=1
  where s.organization_id=p_organization_id
    and s.last_request_key=trim(p_request_key)
    and v.request_key=trim(p_request_key);

  if found then
    return v_segment;
  end if;

  insert into public.crm_segments(
    organization_id,entity_type,status,current_definition_version,version,
    last_request_key,created_by_user_id,updated_by_user_id
  ) values (
    p_organization_id,'LEAD','ACTIVE',1,1,
    trim(p_request_key),v_actor,v_actor
  )
  returning * into v_segment;

  insert into public.crm_segment_versions(
    organization_id,segment_id,version,name,evaluation_mode,predicate_tree,
    predicate_hash,predicate_leaf_count,request_key,created_by_user_id
  ) values (
    p_organization_id,v_segment.id,1,trim(p_name),'DYNAMIC',p_predicate_tree,
    md5(p_predicate_tree::text),1,trim(p_request_key),v_actor
  );

  return v_segment;
end;
$$;

create or replace function public.update_crm_lead_segment_definition(
  p_organization_id uuid,
  p_segment_id uuid,
  p_expected_version integer,
  p_name text,
  p_predicate_tree jsonb,
  p_request_key text
)
returns public.crm_segments
language plpgsql
volatile
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_segment public.crm_segments%rowtype;
  v_next_definition_version integer;
begin
  if v_actor is null or not public.crm_segment_can_manage(p_organization_id) then
    raise exception 'CRM Segment management is not permitted';
  end if;
  if p_expected_version<1
     or length(trim(coalesce(p_name,''))) not between 1 and 160
     or length(trim(coalesce(p_request_key,''))) not between 1 and 200
  then
    raise exception 'CRM Segment update payload is invalid';
  end if;

  select * into v_segment
  from public.crm_segments s
  where s.organization_id=p_organization_id
    and s.id=p_segment_id
  for update;

  if not found then
    raise exception 'CRM Segment not found';
  end if;

  if v_segment.last_request_key=trim(p_request_key)
     and exists (
       select 1 from public.crm_segment_versions v
       where v.organization_id=p_organization_id
         and v.segment_id=p_segment_id
         and v.request_key=trim(p_request_key)
     )
  then
    return v_segment;
  end if;

  if v_segment.version<>p_expected_version then
    raise exception 'CRM Segment version conflict; current version is %',v_segment.version;
  end if;
  if v_segment.status<>'ACTIVE' then
    raise exception 'Archived CRM Segment definition cannot be changed';
  end if;

  v_next_definition_version := v_segment.current_definition_version+1;

  insert into public.crm_segment_versions(
    organization_id,segment_id,version,name,evaluation_mode,predicate_tree,
    predicate_hash,predicate_leaf_count,request_key,created_by_user_id
  ) values (
    p_organization_id,p_segment_id,v_next_definition_version,trim(p_name),
    'DYNAMIC',p_predicate_tree,md5(p_predicate_tree::text),1,
    trim(p_request_key),v_actor
  );

  update public.crm_segments
  set current_definition_version=v_next_definition_version,
      last_request_key=trim(p_request_key),
      updated_by_user_id=v_actor
  where organization_id=p_organization_id
    and id=p_segment_id
    and version=p_expected_version
  returning * into v_segment;

  if not found then
    raise exception 'CRM Segment changed concurrently';
  end if;

  return v_segment;
end;
$$;

create or replace function public.set_crm_lead_segment_lifecycle(
  p_organization_id uuid,
  p_segment_id uuid,
  p_expected_version integer,
  p_status text,
  p_request_key text
)
returns public.crm_segments
language plpgsql
volatile
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_segment public.crm_segments%rowtype;
  v_status text := upper(trim(coalesce(p_status,'')));
begin
  if v_actor is null or not public.crm_segment_can_manage(p_organization_id) then
    raise exception 'CRM Segment management is not permitted';
  end if;
  if p_expected_version<1
     or v_status not in ('ACTIVE','ARCHIVED')
     or length(trim(coalesce(p_request_key,''))) not between 1 and 200
  then
    raise exception 'CRM Segment lifecycle payload is invalid';
  end if;

  select * into v_segment
  from public.crm_segments s
  where s.organization_id=p_organization_id
    and s.id=p_segment_id
  for update;

  if not found then
    raise exception 'CRM Segment not found';
  end if;

  if v_segment.last_request_key=trim(p_request_key)
     and v_segment.status=v_status
  then
    return v_segment;
  end if;

  if v_segment.version<>p_expected_version then
    raise exception 'CRM Segment version conflict; current version is %',v_segment.version;
  end if;
  if v_segment.status=v_status then
    raise exception 'CRM Segment lifecycle transition has no change';
  end if;

  update public.crm_segments
  set status=v_status,
      last_request_key=trim(p_request_key),
      updated_by_user_id=v_actor
  where organization_id=p_organization_id
    and id=p_segment_id
    and version=p_expected_version
  returning * into v_segment;

  if not found then
    raise exception 'CRM Segment changed concurrently';
  end if;

  return v_segment;
end;
$$;

create or replace function public.get_crm_segments(
  p_organization_id uuid,
  p_include_archived boolean default false,
  p_limit integer default 50,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns table(
  id uuid,
  organization_id uuid,
  entity_type text,
  status text,
  current_definition_version integer,
  version integer,
  name text,
  predicate_tree jsonb,
  predicate_hash text,
  predicate_leaf_count integer,
  last_request_key text,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select
    s.id,s.organization_id,s.entity_type,s.status,
    s.current_definition_version,s.version,
    v.name,v.predicate_tree,v.predicate_hash,v.predicate_leaf_count,
    s.last_request_key,s.created_by_user_id,s.updated_by_user_id,
    s.created_at,s.updated_at
  from public.crm_segments s
  join public.crm_segment_versions v
    on v.organization_id=s.organization_id
   and v.segment_id=s.id
   and v.version=s.current_definition_version
  where s.organization_id=p_organization_id
    and (p_include_archived or s.status='ACTIVE')
    and (
      p_before_updated_at is null
      or s.updated_at<p_before_updated_at
      or (
        s.updated_at=p_before_updated_at
        and p_before_id is not null
        and s.id<p_before_id
      )
    )
  order by s.updated_at desc,s.id desc
  limit least(greatest(coalesce(p_limit,50),1),101);
$$;

create or replace function public.evaluate_crm_lead_segment(
  p_organization_id uuid,
  p_segment_id uuid,
  p_segment_version integer default null,
  p_limit integer default 50,
  p_after_lead_id uuid default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_segment public.crm_segments%rowtype;
  v_definition public.crm_segment_versions%rowtype;
  v_version integer;
  v_limit integer := least(greatest(coalesce(p_limit,50),1),100);
  v_ids uuid[];
  v_has_more boolean := false;
  v_next_cursor uuid;
  v_evaluated_at timestamptz := clock_timestamp();
begin
  if v_actor is null or not public.is_org_member(p_organization_id) then
    raise exception 'CRM Segment evaluation is not permitted';
  end if;

  select * into v_segment
  from public.crm_segments s
  where s.organization_id=p_organization_id
    and s.id=p_segment_id;

  if not found then
    raise exception 'CRM Segment not found';
  end if;
  if v_segment.status<>'ACTIVE' then
    raise exception 'Archived CRM Segment cannot be evaluated';
  end if;

  v_version := coalesce(p_segment_version,v_segment.current_definition_version);
  if v_version<1 or v_version>v_segment.current_definition_version then
    raise exception 'CRM Segment evaluation version is invalid';
  end if;

  select * into v_definition
  from public.crm_segment_versions v
  where v.organization_id=p_organization_id
    and v.segment_id=p_segment_id
    and v.version=v_version;

  if not found then
    raise exception 'CRM Segment definition version not found';
  end if;

  perform public.crm_validate_segment_predicate_node(
    p_organization_id,'LEAD',v_definition.predicate_tree,0
  );

  select coalesce(array_agg(q.id order by q.id),array[]::uuid[])
  into v_ids
  from (
    select l.id
    from public.leads l
    where l.organization_id=p_organization_id
      and (p_after_lead_id is null or l.id>p_after_lead_id)
      and public.crm_segment_predicate_matches_lead(
        p_organization_id,l.id,v_definition.predicate_tree
      )
    order by l.id asc
    limit v_limit+1
  ) q;

  v_has_more := coalesce(cardinality(v_ids),0)>v_limit;
  if v_has_more then
    v_ids := v_ids[1:v_limit];
  end if;
  if coalesce(cardinality(v_ids),0)>0 then
    v_next_cursor := v_ids[cardinality(v_ids)];
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,'USER',v_actor::text,
    'CRM_SEGMENT_EVALUATED','crm_segment',p_segment_id::text,
    jsonb_build_object(
      'segment_version',v_version,
      'evaluation_mode','DYNAMIC',
      'predicate_hash',v_definition.predicate_hash,
      'predicate_leaf_count',v_definition.predicate_leaf_count,
      'returned_count',coalesce(cardinality(v_ids),0),
      'has_more',v_has_more,
      'cursor_present',p_after_lead_id is not null
    )
  );

  return jsonb_build_object(
    'segmentId',p_segment_id,
    'segmentVersion',v_version,
    'evaluationMode','DYNAMIC',
    'predicateHash',v_definition.predicate_hash,
    'evaluatedAt',v_evaluated_at,
    'leadIds',to_jsonb(v_ids),
    'hasMore',v_has_more,
    'nextCursor',v_next_cursor
  );
end;
$$;

revoke all on public.crm_segments
  from public, anon, authenticated, service_role;
revoke all on public.crm_segment_versions
  from public, anon, authenticated, service_role;

grant select,insert,update on public.crm_segments to authenticated;
grant select,insert on public.crm_segment_versions to authenticated;

revoke all on function public.crm_segment_can_manage(uuid)
  from public,anon,service_role;
grant execute on function public.crm_segment_can_manage(uuid)
  to authenticated;

revoke all on function public.crm_segment_valid_uuid_text(text)
  from public,anon,service_role;
grant execute on function public.crm_segment_valid_uuid_text(text)
  to authenticated;

revoke all on function public.crm_segment_valid_timestamptz_text(text)
  from public,anon,service_role;
grant execute on function public.crm_segment_valid_timestamptz_text(text)
  to authenticated;

revoke all on function public.crm_segment_valid_date_text(text)
  from public,anon,service_role;
grant execute on function public.crm_segment_valid_date_text(text)
  to authenticated;

revoke all on function public.crm_validate_segment_predicate_node(uuid,text,jsonb,integer)
  from public,anon,service_role;
grant execute on function public.crm_validate_segment_predicate_node(uuid,text,jsonb,integer)
  to authenticated;

revoke all on function public.crm_segment_predicate_matches_lead_node(
  uuid,uuid,text,integer,integer,uuid,timestamptz,timestamptz,jsonb
) from public,anon,service_role;
grant execute on function public.crm_segment_predicate_matches_lead_node(
  uuid,uuid,text,integer,integer,uuid,timestamptz,timestamptz,jsonb
) to authenticated;

revoke all on function public.crm_segment_predicate_matches_lead(uuid,uuid,jsonb)
  from public,anon,service_role;
grant execute on function public.crm_segment_predicate_matches_lead(uuid,uuid,jsonb)
  to authenticated;

revoke all on function public.create_crm_lead_segment(uuid,text,jsonb,text)
  from public,anon,service_role;
grant execute on function public.create_crm_lead_segment(uuid,text,jsonb,text)
  to authenticated;

revoke all on function public.update_crm_lead_segment_definition(
  uuid,uuid,integer,text,jsonb,text
) from public,anon,service_role;
grant execute on function public.update_crm_lead_segment_definition(
  uuid,uuid,integer,text,jsonb,text
) to authenticated;

revoke all on function public.set_crm_lead_segment_lifecycle(
  uuid,uuid,integer,text,text
) from public,anon,service_role;
grant execute on function public.set_crm_lead_segment_lifecycle(
  uuid,uuid,integer,text,text
) to authenticated;

revoke all on function public.get_crm_segments(
  uuid,boolean,integer,timestamptz,uuid
) from public,anon,service_role;
grant execute on function public.get_crm_segments(
  uuid,boolean,integer,timestamptz,uuid
) to authenticated;

revoke all on function public.evaluate_crm_lead_segment(
  uuid,uuid,integer,integer,uuid
) from public,anon,service_role;
grant execute on function public.evaluate_crm_lead_segment(
  uuid,uuid,integer,integer,uuid
) to authenticated;

revoke all on function public.guard_crm_segment_identity()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_crm_segment_version()
  from public,anon,authenticated,service_role;
revoke all on function public.enforce_crm_segment_current_version()
  from public,anon,authenticated,service_role;
revoke all on function public.enforce_crm_segment_version_reachable()
  from public,anon,authenticated,service_role;
revoke all on function public.audit_crm_segment_version()
  from public,anon,authenticated,service_role;
revoke all on function public.audit_crm_segment_lifecycle()
  from public,anon,authenticated,service_role;
