-- 0136: SEGMENT-V2 multi-entity extension.
--
-- Reuses canonical crm_segments + crm_segment_versions and the existing immutable
-- semantic-version contract. No second Segment store and no persisted dynamic
-- membership are introduced. SEGMENT-SNAPSHOT remains a separate Work Package.
--
-- Entity coverage:
--   LEAD    -> existing first-slice contract (fully backward compatible)
--   PERSON  -> canonical crm_people lifecycle/freshness fields
--   DEAL    -> canonical crm_deals + governed DEAL custom fields
--   ACCOUNT -> canonical public.businesses Account governance fields
--
-- Privacy/safety:
-- - no email/phone/display-name/free metadata predicates;
-- - no arbitrary SQL/JSONPath;
-- - custom fields stay INTERNAL + ACTIVE + filterable and only LEAD/DEAL;
-- - evaluation is bounded and side-effect free except bounded audit evidence.

alter table public.crm_segments
  drop constraint if exists crm_segments_entity_type_check;

alter table public.crm_segments
  add constraint crm_segments_entity_type_check
  check (entity_type in ('LEAD','PERSON','DEAL','ACCOUNT'));

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
    new.entity_type := upper(trim(coalesce(new.entity_type,'LEAD')));
    if new.entity_type not in ('LEAD','PERSON','DEAL','ACCOUNT') then
      raise exception 'CRM Segment entity type is not supported';
    end if;
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

create or replace function public.crm_validate_segment_deal_custom_predicate(
  p_organization_id uuid,
  p_node jsonb
)
returns integer
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_operator text := upper(coalesce(p_node->>'operator',''));
  v_definition public.crm_custom_field_definitions%rowtype;
  v_definition_id uuid;
  v_definition_version integer;
  v_data_type text;
  v_has_value boolean := (p_node ? 'value') and p_node->'value' <> 'null'::jsonb;
  v_item jsonb;
  v_currency text;
  v_min numeric;
  v_max numeric;
begin
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
  where d.organization_id=p_organization_id
    and d.id=v_definition_id;

  if not found
     or v_definition.entity_type<>'DEAL'
     or v_definition.status<>'ACTIVE'
     or not v_definition.filterable
     or v_definition.sensitivity_class<>'INTERNAL'
     or v_definition.version<>v_definition_version
     or v_definition.data_type<>v_data_type
  then
    raise exception 'CRM Segment Custom Field contract is unavailable or incompatible';
  end if;

  if v_data_type in ('EMAIL','PHONE') then
    raise exception 'CRM Segment PII Custom Fields are not allowed';
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
       or jsonb_typeof(p_node->'value')<>'string'
    then
      raise exception 'CRM Segment text Custom Field predicate is invalid';
    end if;
    return 1;
  end if;

  if v_data_type='NUMBER' then
    if v_operator in ('EQ','NEQ','GT','GTE','LT','LTE') then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'number' then
        raise exception 'CRM Segment NUMBER predicate requires numeric value';
      end if;
    elsif v_operator='BETWEEN' then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'array'
         or jsonb_array_length(p_node->'value')<>2
         or jsonb_typeof(p_node->'value'->0)<>'number'
         or jsonb_typeof(p_node->'value'->1)<>'number'
         or (p_node->'value'->>0)::numeric>(p_node->'value'->>1)::numeric
      then
        raise exception 'CRM Segment NUMBER BETWEEN is invalid';
      end if;
    else
      raise exception 'CRM Segment NUMBER operator is not allowed';
    end if;
    return 1;
  end if;

  if v_data_type='BOOLEAN' then
    if v_operator<>'EQ'
       or not v_has_value
       or jsonb_typeof(p_node->'value')<>'boolean'
    then
      raise exception 'CRM Segment BOOLEAN predicate must use EQ boolean';
    end if;
    return 1;
  end if;

  if v_data_type in ('DATE','DATETIME') then
    if v_operator in ('EQ','BEFORE','AFTER') then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'string' then
        raise exception 'CRM Segment date predicate requires string value';
      end if;
      if v_data_type='DATE'
         and not public.crm_segment_valid_date_text(p_node->>'value') then
        raise exception 'CRM Segment DATE value is invalid';
      end if;
      if v_data_type='DATETIME'
         and not public.crm_segment_valid_timestamptz_text(p_node->>'value') then
        raise exception 'CRM Segment DATETIME value is invalid';
      end if;
    elsif v_operator='BETWEEN' then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'array'
         or jsonb_array_length(p_node->'value')<>2
         or jsonb_typeof(p_node->'value'->0)<>'string'
         or jsonb_typeof(p_node->'value'->1)<>'string'
      then
        raise exception 'CRM Segment date BETWEEN requires two strings';
      end if;
      if v_data_type='DATE' then
        if not public.crm_segment_valid_date_text(p_node->'value'->>0)
           or not public.crm_segment_valid_date_text(p_node->'value'->>1)
           or (p_node->'value'->>0)::date>(p_node->'value'->>1)::date
        then raise exception 'CRM Segment DATE BETWEEN is invalid'; end if;
      else
        if not public.crm_segment_valid_timestamptz_text(p_node->'value'->>0)
           or not public.crm_segment_valid_timestamptz_text(p_node->'value'->>1)
           or (p_node->'value'->>0)::timestamptz>(p_node->'value'->>1)::timestamptz
        then raise exception 'CRM Segment DATETIME BETWEEN is invalid'; end if;
      end if;
    else
      raise exception 'CRM Segment date operator is not allowed';
    end if;
    return 1;
  end if;

  if v_data_type='SINGLE_SELECT' then
    if v_operator='EQ' then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'string'
         or not exists (
           select 1 from public.crm_custom_field_options o
           where o.organization_id=p_organization_id
             and o.definition_id=v_definition_id
             and o.option_key=lower(trim(p_node->>'value'))
             and o.status='ACTIVE'
         )
      then raise exception 'CRM Segment SINGLE_SELECT option is unavailable'; end if;
    elsif v_operator in ('IN','NOT_IN') then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'array'
         or jsonb_array_length(p_node->'value') not between 1 and 20
      then raise exception 'CRM Segment SINGLE_SELECT list requires 1..20 options'; end if;
      for v_item in select value from jsonb_array_elements(p_node->'value') loop
        if jsonb_typeof(v_item)<>'string'
           or not exists (
             select 1 from public.crm_custom_field_options o
             where o.organization_id=p_organization_id
               and o.definition_id=v_definition_id
               and o.option_key=lower(trim(v_item #>> '{}'))
               and o.status='ACTIVE'
           )
        then raise exception 'CRM Segment SINGLE_SELECT list contains unavailable option'; end if;
      end loop;
    else
      raise exception 'CRM Segment SINGLE_SELECT operator is not allowed';
    end if;
    return 1;
  end if;

  if v_data_type='MULTI_SELECT' then
    if v_operator<>'CONTAINS_ANY'
       or not v_has_value
       or jsonb_typeof(p_node->'value')<>'array'
       or jsonb_array_length(p_node->'value') not between 1 and 20
    then raise exception 'CRM Segment MULTI_SELECT supports CONTAINS_ANY with 1..20 options'; end if;
    for v_item in select value from jsonb_array_elements(p_node->'value') loop
      if jsonb_typeof(v_item)<>'string'
         or not exists (
           select 1 from public.crm_custom_field_options o
           where o.organization_id=p_organization_id
             and o.definition_id=v_definition_id
             and o.option_key=lower(trim(v_item #>> '{}'))
             and o.status='ACTIVE'
         )
      then raise exception 'CRM Segment MULTI_SELECT list contains unavailable option'; end if;
    end loop;
    return 1;
  end if;

  if v_data_type='CURRENCY' then
    if v_operator in ('EQ','NEQ','GT','GTE','LT','LTE') then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'object'
         or (p_node->'value' - array['amount','currency']::text[])<>'{}'::jsonb
         or jsonb_typeof(p_node->'value'->'amount')<>'number'
         or jsonb_typeof(p_node->'value'->'currency')<>'string'
      then raise exception 'CRM Segment CURRENCY predicate requires amount/currency object'; end if;
      v_currency:=upper(trim(p_node->'value'->>'currency'));
      if v_currency !~ '^[A-Z]{3}$' then raise exception 'CRM Segment CURRENCY code is invalid'; end if;
    elsif v_operator='BETWEEN' then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'object'
         or (p_node->'value' - array['min','max','currency']::text[])<>'{}'::jsonb
         or jsonb_typeof(p_node->'value'->'min')<>'number'
         or jsonb_typeof(p_node->'value'->'max')<>'number'
         or jsonb_typeof(p_node->'value'->'currency')<>'string'
      then raise exception 'CRM Segment CURRENCY BETWEEN requires min/max/currency object'; end if;
      v_min:=(p_node->'value'->>'min')::numeric;
      v_max:=(p_node->'value'->>'max')::numeric;
      v_currency:=upper(trim(p_node->'value'->>'currency'));
      if v_min>v_max or v_currency !~ '^[A-Z]{3}$' then
        raise exception 'CRM Segment CURRENCY BETWEEN is invalid';
      end if;
    else
      raise exception 'CRM Segment CURRENCY operator is not allowed';
    end if;
    return 1;
  end if;

  raise exception 'CRM Segment Custom Field data type is not supported';
end;
$$;

create or replace function public.crm_validate_segment_v2_predicate_node(
  p_organization_id uuid,
  p_entity_type text,
  p_node jsonb,
  p_depth integer default 0
)
returns integer
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_entity_type text:=upper(trim(coalesce(p_entity_type,'')));
  v_kind text;
  v_source text;
  v_field text;
  v_operator text;
  v_has_value boolean;
  v_child jsonb;
  v_item jsonb;
  v_leaf_count integer:=0;
  v_text_value text;
begin
  if v_entity_type='LEAD' then
    return public.crm_validate_segment_predicate_node(
      p_organization_id,'LEAD',p_node,p_depth
    );
  end if;
  if v_entity_type not in ('PERSON','DEAL','ACCOUNT') then
    raise exception 'CRM Segment entity type is not supported';
  end if;
  if p_depth<0 or p_depth>4 then
    raise exception 'CRM Segment predicate depth exceeds 4';
  end if;
  if p_node is null or jsonb_typeof(p_node)<>'object' then
    raise exception 'CRM Segment predicate node must be an object';
  end if;

  v_kind:=upper(coalesce(p_node->>'kind',''));
  if v_kind='GROUP' then
    if (p_node-array['kind','op','children']::text[])<>'{}'::jsonb then
      raise exception 'CRM Segment GROUP contains unsupported keys';
    end if;
    if upper(coalesce(p_node->>'op','')) not in ('AND','OR') then
      raise exception 'CRM Segment GROUP operator must be AND or OR';
    end if;
    if jsonb_typeof(p_node->'children')<>'array'
       or jsonb_array_length(p_node->'children') not between 1 and 8 then
      raise exception 'CRM Segment GROUP children must contain 1..8 nodes';
    end if;
    for v_child in select value from jsonb_array_elements(p_node->'children') loop
      v_leaf_count:=v_leaf_count+public.crm_validate_segment_v2_predicate_node(
        p_organization_id,v_entity_type,v_child,p_depth+1
      );
      if v_leaf_count>20 then raise exception 'CRM Segment predicate exceeds 20 leaves'; end if;
    end loop;
    return v_leaf_count;
  end if;

  if v_kind<>'PREDICATE' then
    raise exception 'CRM Segment node kind must be GROUP or PREDICATE';
  end if;

  v_source:=upper(coalesce(p_node->>'source',''));
  if v_source='CUSTOM_FIELD' then
    if v_entity_type<>'DEAL' then
      raise exception 'CRM Segment Custom Fields are unavailable for this entity type';
    end if;
    return public.crm_validate_segment_deal_custom_predicate(p_organization_id,p_node);
  end if;
  if v_source<>'CANONICAL' then
    raise exception 'CRM Segment predicate source is not allowed';
  end if;
  if (p_node-array['kind','source','field','operator','value']::text[])<>'{}'::jsonb then
    raise exception 'CRM Segment canonical predicate contains unsupported keys';
  end if;

  v_field:=lower(coalesce(p_node->>'field',''));
  v_operator:=upper(coalesce(p_node->>'operator',''));
  v_has_value:=(p_node?'value') and p_node->'value'<>'null'::jsonb;

  -- bounded enum/text fields
  if (v_entity_type='PERSON' and v_field='status')
     or (v_entity_type='DEAL' and v_field in ('state','currency'))
     or (v_entity_type='ACCOUNT' and v_field in (
       'account_lifecycle','country_code','city','category','hierarchy_relation'
     ))
  then
    if v_operator in ('EQ','NEQ') then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'string'
         or length(trim(p_node->>'value'))=0
      then raise exception 'CRM Segment text predicate requires a string value'; end if;
    elsif v_operator in ('IN','NOT_IN') then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'array'
         or jsonb_array_length(p_node->'value') not between 1 and 20
      then raise exception 'CRM Segment text list requires 1..20 values'; end if;
      for v_item in select value from jsonb_array_elements(p_node->'value') loop
        if jsonb_typeof(v_item)<>'string' or length(trim(v_item #>> '{}'))=0 then
          raise exception 'CRM Segment text list values must be strings';
        end if;
      end loop;
    else
      raise exception 'CRM Segment text operator is not allowed';
    end if;

    -- exact lifecycle/state allowlists where canonical values are closed.
    if v_entity_type='PERSON' and v_field='status' then
      if v_operator in ('EQ','NEQ') and upper(p_node->>'value') not in ('ACTIVE','MERGED','RETIRED') then
        raise exception 'CRM Segment Person status value is invalid';
      end if;
      if v_operator in ('IN','NOT_IN') then
        for v_item in select value from jsonb_array_elements(p_node->'value') loop
          if upper(v_item #>> '{}') not in ('ACTIVE','MERGED','RETIRED') then
            raise exception 'CRM Segment Person status list contains invalid value';
          end if;
        end loop;
      end if;
    elsif v_entity_type='DEAL' and v_field='state' then
      if v_operator in ('EQ','NEQ') and upper(p_node->>'value') not in ('OPEN','WON','LOST') then
        raise exception 'CRM Segment Deal state value is invalid';
      end if;
      if v_operator in ('IN','NOT_IN') then
        for v_item in select value from jsonb_array_elements(p_node->'value') loop
          if upper(v_item #>> '{}') not in ('OPEN','WON','LOST') then
            raise exception 'CRM Segment Deal state list contains invalid value';
          end if;
        end loop;
      end if;
    elsif v_entity_type='ACCOUNT' and v_field='account_lifecycle' then
      if v_operator in ('EQ','NEQ')
         and upper(p_node->>'value') not in (
           'UNCLASSIFIED','PROSPECT','QUALIFIED','CUSTOMER','FORMER_CUSTOMER','PARTNER','ARCHIVED'
         ) then
        raise exception 'CRM Segment Account lifecycle value is invalid';
      end if;
      if v_operator in ('IN','NOT_IN') then
        for v_item in select value from jsonb_array_elements(p_node->'value') loop
          if upper(v_item #>> '{}') not in (
            'UNCLASSIFIED','PROSPECT','QUALIFIED','CUSTOMER','FORMER_CUSTOMER','PARTNER','ARCHIVED'
          ) then
            raise exception 'CRM Segment Account lifecycle list contains invalid value';
          end if;
        end loop;
      end if;
    elsif v_entity_type='DEAL' and v_field='currency' then
      if v_operator in ('EQ','NEQ') and upper(p_node->>'value') !~ '^[A-Z]{3}$' then
        raise exception 'CRM Segment Deal currency is invalid';
      end if;
      if v_operator in ('IN','NOT_IN') then
        for v_item in select value from jsonb_array_elements(p_node->'value') loop
          if upper(v_item #>> '{}') !~ '^[A-Z]{3}$' then
            raise exception 'CRM Segment Deal currency list contains invalid value';
          end if;
        end loop;
      end if;
    end if;
    return 1;
  end if;

  -- numeric fields
  if v_entity_type='DEAL' and v_field='amount' then
    if v_operator in ('EQ','NEQ','GT','GTE','LT','LTE') then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'number' then
        raise exception 'CRM Segment numeric predicate requires numeric value';
      end if;
    elsif v_operator='BETWEEN' then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'array'
         or jsonb_array_length(p_node->'value')<>2
         or jsonb_typeof(p_node->'value'->0)<>'number'
         or jsonb_typeof(p_node->'value'->1)<>'number'
         or (p_node->'value'->>0)::numeric>(p_node->'value'->>1)::numeric
      then raise exception 'CRM Segment numeric BETWEEN is invalid'; end if;
    else
      raise exception 'CRM Segment numeric operator is not allowed';
    end if;
    return 1;
  end if;

  -- UUID fields
  if (v_entity_type='DEAL' and v_field in (
        'business_id','pipeline_id','stage_id','owner_user_id','person_id'
      ))
     or (v_entity_type='ACCOUNT' and v_field in (
        'account_owner_user_id','parent_business_id'
      ))
  then
    if v_operator in ('IS_SET','IS_NOT_SET') then
      if v_has_value then raise exception 'CRM Segment set-state predicate cannot include value'; end if;
    elsif v_operator='EQ' then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'string'
         or not public.crm_segment_valid_uuid_text(p_node->>'value')
      then raise exception 'CRM Segment UUID predicate requires UUID value'; end if;
    elsif v_operator in ('IN','NOT_IN') then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'array'
         or jsonb_array_length(p_node->'value') not between 1 and 20
      then raise exception 'CRM Segment UUID list requires 1..20 values'; end if;
      for v_item in select value from jsonb_array_elements(p_node->'value') loop
        if jsonb_typeof(v_item)<>'string'
           or not public.crm_segment_valid_uuid_text(v_item #>> '{}')
        then raise exception 'CRM Segment UUID list contains invalid value'; end if;
      end loop;
    else
      raise exception 'CRM Segment UUID operator is not allowed';
    end if;
    return 1;
  end if;

  -- timestamp fields
  if (v_entity_type='PERSON' and v_field in (
        'first_seen_at','last_seen_at','created_at','updated_at'
      ))
     or (v_entity_type='DEAL' and v_field in (
        'expected_close_at','created_at','updated_at'
      ))
     or (v_entity_type='ACCOUNT' and v_field in ('created_at','updated_at'))
  then
    if v_operator in ('BEFORE','AFTER') then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'string'
         or not public.crm_segment_valid_timestamptz_text(p_node->>'value')
      then raise exception 'CRM Segment timestamp predicate requires ISO timestamp'; end if;
    elsif v_operator='BETWEEN' then
      if not v_has_value or jsonb_typeof(p_node->'value')<>'array'
         or jsonb_array_length(p_node->'value')<>2
         or jsonb_typeof(p_node->'value'->0)<>'string'
         or jsonb_typeof(p_node->'value'->1)<>'string'
         or not public.crm_segment_valid_timestamptz_text(p_node->'value'->>0)
         or not public.crm_segment_valid_timestamptz_text(p_node->'value'->>1)
         or (p_node->'value'->>0)::timestamptz>(p_node->'value'->>1)::timestamptz
      then raise exception 'CRM Segment timestamp BETWEEN is invalid'; end if;
    else
      raise exception 'CRM Segment timestamp operator is not allowed';
    end if;
    return 1;
  end if;

  raise exception 'CRM Segment canonical field is not allowed for entity type %',v_entity_type;
end;
$$;

create or replace function public.crm_segment_entity_context(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_entity_type text:=upper(trim(coalesce(p_entity_type,'')));
  v_context jsonb;
begin
  if v_entity_type='LEAD' then
    select jsonb_build_object(
      'status',l.status::text,
      'opportunity_score',l.opportunity_score,
      'intent_score',l.intent_score,
      'business_id',l.business_id,
      'created_at',l.created_at,
      'updated_at',l.updated_at
    ) into v_context
    from public.leads l
    where l.organization_id=p_organization_id and l.id=p_entity_id;
  elsif v_entity_type='PERSON' then
    select jsonb_build_object(
      'status',p.status,
      'first_seen_at',p.first_seen_at,
      'last_seen_at',p.last_seen_at,
      'created_at',p.created_at,
      'updated_at',p.updated_at
    ) into v_context
    from public.crm_people p
    where p.organization_id=p_organization_id and p.id=p_entity_id;
  elsif v_entity_type='DEAL' then
    select jsonb_build_object(
      'state',d.state,
      'amount',d.amount,
      'currency',d.currency,
      'business_id',d.business_id,
      'pipeline_id',d.pipeline_id,
      'stage_id',d.stage_id,
      'owner_user_id',d.owner_user_id,
      'person_id',d.person_id,
      'expected_close_at',d.expected_close_at,
      'created_at',d.created_at,
      'updated_at',d.updated_at
    ) into v_context
    from public.crm_deals d
    where d.organization_id=p_organization_id and d.id=p_entity_id;
  elsif v_entity_type='ACCOUNT' then
    select jsonb_build_object(
      'account_lifecycle',b.account_lifecycle,
      'country_code',b.country_code,
      'city',b.city,
      'category',b.category,
      'hierarchy_relation',b.hierarchy_relation,
      'account_owner_user_id',b.account_owner_user_id,
      'parent_business_id',b.parent_business_id,
      'created_at',b.created_at,
      'updated_at',b.updated_at
    ) into v_context
    from public.businesses b
    where b.organization_id=p_organization_id and b.id=p_entity_id;
  else
    raise exception 'CRM Segment entity type is not supported';
  end if;
  return v_context;
end;
$$;

create or replace function public.crm_segment_custom_field_matches_entity(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_node jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_entity_type text:=upper(trim(coalesce(p_entity_type,'')));
  v_definition_id uuid:=(p_node->>'definitionId')::uuid;
  v_definition_version integer:=(p_node->>'definitionVersion')::integer;
  v_data_type text:=upper(p_node->>'dataType');
  v_operator text:=upper(p_node->>'operator');
  v_value_id uuid;
  v_value_text text;
  v_value_number numeric;
  v_value_boolean boolean;
  v_value_date date;
  v_value_datetime timestamptz;
  v_value_currency_amount numeric;
  v_value_currency_code text;
  v_value_option_keys text[];
  v_texts text[];
  v_target numeric;
  v_currency text;
begin
  if v_entity_type not in ('LEAD','DEAL') then return false; end if;

  select
    v.id,v.value_text,v.value_number,v.value_boolean,v.value_date,
    v.value_datetime,v.value_currency_amount,v.value_currency_code,v.value_option_keys
  into
    v_value_id,v_value_text,v_value_number,v_value_boolean,v_value_date,
    v_value_datetime,v_value_currency_amount,v_value_currency_code,v_value_option_keys
  from public.crm_custom_field_definitions d
  left join public.crm_custom_field_values v
    on v.organization_id=d.organization_id
   and v.definition_id=d.id
   and v.entity_type=v_entity_type
   and (
     (v_entity_type='LEAD' and v.lead_id=p_entity_id)
     or
     (v_entity_type='DEAL' and v.deal_id=p_entity_id)
   )
   and v.state='SET'
  where d.organization_id=p_organization_id
    and d.id=v_definition_id
    and d.entity_type=v_entity_type
    and d.status='ACTIVE'
    and d.filterable
    and d.sensitivity_class='INTERNAL'
    and d.version=v_definition_version
    and d.data_type=v_data_type;

  if not found then return false; end if;
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
    return v_value_number between
      (p_node->'value'->>0)::numeric and (p_node->'value'->>1)::numeric;
  end if;
  if v_data_type='BOOLEAN' then
    return v_value_boolean=(p_node->>'value')::boolean;
  end if;
  if v_data_type='DATE' then
    if v_operator='EQ' then return v_value_date=(p_node->>'value')::date; end if;
    if v_operator='BEFORE' then return v_value_date<(p_node->>'value')::date; end if;
    if v_operator='AFTER' then return v_value_date>(p_node->>'value')::date; end if;
    return v_value_date between
      (p_node->'value'->>0)::date and (p_node->'value'->>1)::date;
  end if;
  if v_data_type='DATETIME' then
    if v_operator='EQ' then return v_value_datetime=(p_node->>'value')::timestamptz; end if;
    if v_operator='BEFORE' then return v_value_datetime<(p_node->>'value')::timestamptz; end if;
    if v_operator='AFTER' then return v_value_datetime>(p_node->>'value')::timestamptz; end if;
    return v_value_datetime between
      (p_node->'value'->>0)::timestamptz and (p_node->'value'->>1)::timestamptz;
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
    v_currency:=upper(trim(p_node->'value'->>'currency'));
    if v_value_currency_code<>v_currency then return false; end if;
    if v_operator='BETWEEN' then
      return v_value_currency_amount between
        (p_node->'value'->>'min')::numeric and (p_node->'value'->>'max')::numeric;
    end if;
    v_target:=(p_node->'value'->>'amount')::numeric;
    if v_operator='EQ' then return v_value_currency_amount=v_target; end if;
    if v_operator='NEQ' then return v_value_currency_amount<>v_target; end if;
    if v_operator='GT' then return v_value_currency_amount>v_target; end if;
    if v_operator='GTE' then return v_value_currency_amount>=v_target; end if;
    if v_operator='LT' then return v_value_currency_amount<v_target; end if;
    return v_value_currency_amount<=v_target;
  end if;
  return false;
end;
$$;

create or replace function public.crm_segment_predicate_matches_v2_node(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_context jsonb,
  p_node jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_entity_type text:=upper(trim(coalesce(p_entity_type,'')));
  v_kind text:=upper(coalesce(p_node->>'kind',''));
  v_source text:=upper(coalesce(p_node->>'source',''));
  v_field text:=lower(coalesce(p_node->>'field',''));
  v_operator text:=upper(coalesce(p_node->>'operator',''));
  v_child jsonb;
  v_texts text[];
  v_actual_text text;
  v_actual_num numeric;
  v_actual_uuid uuid;
  v_actual_ts timestamptz;
begin
  if v_kind='GROUP' then
    if upper(p_node->>'op')='AND' then
      for v_child in select value from jsonb_array_elements(p_node->'children') loop
        if not public.crm_segment_predicate_matches_v2_node(
          p_organization_id,v_entity_type,p_entity_id,p_context,v_child
        ) then return false; end if;
      end loop;
      return true;
    end if;
    for v_child in select value from jsonb_array_elements(p_node->'children') loop
      if public.crm_segment_predicate_matches_v2_node(
        p_organization_id,v_entity_type,p_entity_id,p_context,v_child
      ) then return true; end if;
    end loop;
    return false;
  end if;

  if v_source='CUSTOM_FIELD' then
    return public.crm_segment_custom_field_matches_entity(
      p_organization_id,v_entity_type,p_entity_id,p_node
    );
  end if;

  if (v_entity_type='LEAD' and v_field='status')
     or (v_entity_type='PERSON' and v_field='status')
     or (v_entity_type='DEAL' and v_field in ('state','currency'))
     or (v_entity_type='ACCOUNT' and v_field in (
       'account_lifecycle','country_code','city','category','hierarchy_relation'
     ))
  then
    v_actual_text:=p_context->>v_field;
    if v_actual_text is null then return false; end if;
    if v_operator='EQ' then return v_actual_text=p_node->>'value'; end if;
    if v_operator='NEQ' then return v_actual_text<>p_node->>'value'; end if;
    select array_agg(value #>> '{}') into v_texts
    from jsonb_array_elements(p_node->'value');
    if v_operator='IN' then return v_actual_text=any(v_texts); end if;
    return not (v_actual_text=any(v_texts));
  end if;

  if (v_entity_type='LEAD' and v_field in ('opportunity_score','intent_score'))
     or (v_entity_type='DEAL' and v_field='amount')
  then
    if p_context->v_field is null or p_context->v_field='null'::jsonb then return false; end if;
    v_actual_num:=(p_context->>v_field)::numeric;
    if v_operator='EQ' then return v_actual_num=(p_node->>'value')::numeric; end if;
    if v_operator='NEQ' then return v_actual_num<>(p_node->>'value')::numeric; end if;
    if v_operator='GT' then return v_actual_num>(p_node->>'value')::numeric; end if;
    if v_operator='GTE' then return v_actual_num>=(p_node->>'value')::numeric; end if;
    if v_operator='LT' then return v_actual_num<(p_node->>'value')::numeric; end if;
    if v_operator='LTE' then return v_actual_num<=(p_node->>'value')::numeric; end if;
    return v_actual_num between
      (p_node->'value'->>0)::numeric and (p_node->'value'->>1)::numeric;
  end if;

  if (v_entity_type='LEAD' and v_field='business_id')
     or (v_entity_type='DEAL' and v_field in (
       'business_id','pipeline_id','stage_id','owner_user_id','person_id'
     ))
     or (v_entity_type='ACCOUNT' and v_field in (
       'account_owner_user_id','parent_business_id'
     ))
  then
    if v_operator='IS_SET' then return p_context->v_field is not null and p_context->v_field<>'null'::jsonb; end if;
    if v_operator='IS_NOT_SET' then return p_context->v_field is null or p_context->v_field='null'::jsonb; end if;
    if p_context->v_field is null or p_context->v_field='null'::jsonb then return false; end if;
    v_actual_uuid:=(p_context->>v_field)::uuid;
    if v_operator='EQ' then return v_actual_uuid=(p_node->>'value')::uuid; end if;
    select array_agg(value #>> '{}') into v_texts
    from jsonb_array_elements(p_node->'value');
    if v_operator='IN' then return v_actual_uuid::text=any(v_texts); end if;
    return not (v_actual_uuid::text=any(v_texts));
  end if;

  if (v_entity_type='LEAD' and v_field in ('created_at','updated_at'))
     or (v_entity_type='PERSON' and v_field in (
       'first_seen_at','last_seen_at','created_at','updated_at'
     ))
     or (v_entity_type='DEAL' and v_field in (
       'expected_close_at','created_at','updated_at'
     ))
     or (v_entity_type='ACCOUNT' and v_field in ('created_at','updated_at'))
  then
    if p_context->v_field is null or p_context->v_field='null'::jsonb then return false; end if;
    v_actual_ts:=(p_context->>v_field)::timestamptz;
    if v_operator='BEFORE' then return v_actual_ts<(p_node->>'value')::timestamptz; end if;
    if v_operator='AFTER' then return v_actual_ts>(p_node->>'value')::timestamptz; end if;
    return v_actual_ts between
      (p_node->'value'->>0)::timestamptz and (p_node->'value'->>1)::timestamptz;
  end if;

  return false;
end;
$$;

create or replace function public.crm_segment_predicate_matches_v2(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_node jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_context jsonb;
begin
  v_context:=public.crm_segment_entity_context(p_organization_id,p_entity_type,p_entity_id);
  if v_context is null then return false; end if;
  return public.crm_segment_predicate_matches_v2_node(
    p_organization_id,upper(trim(p_entity_type)),p_entity_id,v_context,p_node
  );
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

  new.name:=trim(new.name);
  new.request_key:=trim(new.request_key);

  if auth.uid() is null or new.created_by_user_id is distinct from auth.uid() then
    raise exception 'CRM Segment version creator must match auth.uid()';
  end if;

  select * into v_segment
  from public.crm_segments s
  where s.organization_id=new.organization_id and s.id=new.segment_id
  for update;

  if not found then raise exception 'CRM Segment identity not found'; end if;

  if new.version=1 then
    if v_segment.current_definition_version<>1
       or exists (
         select 1 from public.crm_segment_versions v
         where v.organization_id=new.organization_id and v.segment_id=new.segment_id
       )
    then raise exception 'CRM Segment initial definition version is invalid'; end if;
  elsif new.version<>v_segment.current_definition_version+1 then
    raise exception 'CRM Segment next definition version is invalid';
  end if;

  v_leaf_count:=public.crm_validate_segment_v2_predicate_node(
    new.organization_id,v_segment.entity_type,new.predicate_tree,0
  );
  if v_leaf_count not between 1 and 20 then
    raise exception 'CRM Segment predicate leaf count is invalid';
  end if;

  new.evaluation_mode:='DYNAMIC';
  new.predicate_leaf_count:=v_leaf_count;
  new.predicate_hash:=md5(new.predicate_tree::text);
  new.created_at:=coalesce(new.created_at,now());
  return new;
end;
$$;

create or replace function public.create_crm_segment(
  p_organization_id uuid,
  p_entity_type text,
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
  v_actor uuid:=auth.uid();
  v_entity_type text:=upper(trim(coalesce(p_entity_type,'')));
  v_segment public.crm_segments%rowtype;
  v_version public.crm_segment_versions%rowtype;
begin
  if v_actor is null or not public.crm_segment_can_manage(p_organization_id) then
    raise exception 'CRM Segment management is not permitted';
  end if;
  if v_entity_type not in ('LEAD','PERSON','DEAL','ACCOUNT')
     or length(trim(coalesce(p_name,''))) not between 1 and 160
     or length(trim(coalesce(p_request_key,''))) not between 1 and 200
  then raise exception 'CRM Segment create payload is invalid'; end if;

  select s.*,v.* into v_segment,v_version
  from public.crm_segments s
  join public.crm_segment_versions v
    on v.organization_id=s.organization_id
   and v.segment_id=s.id
   and v.version=1
  where s.organization_id=p_organization_id
    and s.last_request_key=trim(p_request_key)
    and v.request_key=trim(p_request_key);

  if found then
    if v_segment.entity_type<>v_entity_type
       or v_version.name<>trim(p_name)
       or v_version.predicate_hash<>md5(p_predicate_tree::text)
    then raise exception 'CRM Segment request key conflict'; end if;
    return v_segment;
  end if;

  insert into public.crm_segments(
    organization_id,entity_type,status,current_definition_version,version,
    last_request_key,created_by_user_id,updated_by_user_id
  ) values (
    p_organization_id,v_entity_type,'ACTIVE',1,1,
    trim(p_request_key),v_actor,v_actor
  ) returning * into v_segment;

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

create or replace function public.update_crm_segment_definition(
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
  v_actor uuid:=auth.uid();
  v_segment public.crm_segments%rowtype;
  v_next_definition_version integer;
begin
  if v_actor is null or not public.crm_segment_can_manage(p_organization_id) then
    raise exception 'CRM Segment management is not permitted';
  end if;
  if p_expected_version<1
     or length(trim(coalesce(p_name,''))) not between 1 and 160
     or length(trim(coalesce(p_request_key,''))) not between 1 and 200
  then raise exception 'CRM Segment update payload is invalid'; end if;

  select * into v_segment
  from public.crm_segments s
  where s.organization_id=p_organization_id and s.id=p_segment_id
  for update;

  if not found then raise exception 'CRM Segment not found'; end if;

  if v_segment.last_request_key=trim(p_request_key)
     and exists (
       select 1 from public.crm_segment_versions v
       where v.organization_id=p_organization_id
         and v.segment_id=p_segment_id
         and v.request_key=trim(p_request_key)
         and v.name=trim(p_name)
         and v.predicate_hash=md5(p_predicate_tree::text)
     )
  then return v_segment; end if;

  if exists (
    select 1 from public.crm_segment_versions v
    where v.organization_id=p_organization_id
      and v.segment_id=p_segment_id
      and v.request_key=trim(p_request_key)
  ) then raise exception 'CRM Segment request key conflict'; end if;

  if v_segment.version<>p_expected_version then
    raise exception 'CRM Segment version conflict; current version is %',v_segment.version;
  end if;
  if v_segment.status<>'ACTIVE' then
    raise exception 'Archived CRM Segment definition cannot be changed';
  end if;

  v_next_definition_version:=v_segment.current_definition_version+1;

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

  if not found then raise exception 'CRM Segment changed concurrently'; end if;
  return v_segment;
end;
$$;

create or replace function public.set_crm_segment_lifecycle(
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
  v_actor uuid:=auth.uid();
  v_segment public.crm_segments%rowtype;
  v_status text:=upper(trim(coalesce(p_status,'')));
begin
  if v_actor is null or not public.crm_segment_can_manage(p_organization_id) then
    raise exception 'CRM Segment management is not permitted';
  end if;
  if p_expected_version<1
     or v_status not in ('ACTIVE','ARCHIVED')
     or length(trim(coalesce(p_request_key,''))) not between 1 and 200
  then raise exception 'CRM Segment lifecycle payload is invalid'; end if;

  select * into v_segment
  from public.crm_segments s
  where s.organization_id=p_organization_id and s.id=p_segment_id
  for update;

  if not found then raise exception 'CRM Segment not found'; end if;
  if v_segment.last_request_key=trim(p_request_key) and v_segment.status=v_status then
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

  if not found then raise exception 'CRM Segment changed concurrently'; end if;
  return v_segment;
end;
$$;

create or replace function public.evaluate_crm_segment(
  p_organization_id uuid,
  p_segment_id uuid,
  p_segment_version integer default null,
  p_limit integer default 50,
  p_after_entity_id uuid default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor uuid:=auth.uid();
  v_segment public.crm_segments%rowtype;
  v_definition public.crm_segment_versions%rowtype;
  v_version integer;
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_ids uuid[];
  v_has_more boolean:=false;
  v_next_cursor uuid;
  v_evaluated_at timestamptz:=clock_timestamp();
begin
  if v_actor is null or not public.is_org_member(p_organization_id) then
    raise exception 'CRM Segment evaluation is not permitted';
  end if;

  select * into v_segment
  from public.crm_segments s
  where s.organization_id=p_organization_id and s.id=p_segment_id;

  if not found then raise exception 'CRM Segment not found'; end if;
  if v_segment.status<>'ACTIVE' then raise exception 'Archived CRM Segment cannot be evaluated'; end if;

  v_version:=coalesce(p_segment_version,v_segment.current_definition_version);
  if v_version<1 or v_version>v_segment.current_definition_version then
    raise exception 'CRM Segment evaluation version is invalid';
  end if;

  select * into v_definition
  from public.crm_segment_versions v
  where v.organization_id=p_organization_id
    and v.segment_id=p_segment_id
    and v.version=v_version;

  if not found then raise exception 'CRM Segment definition version not found'; end if;

  perform public.crm_validate_segment_v2_predicate_node(
    p_organization_id,v_segment.entity_type,v_definition.predicate_tree,0
  );

  if v_segment.entity_type='LEAD' then
    select coalesce(array_agg(q.id order by q.id),array[]::uuid[])
      into v_ids
    from (
      select l.id
      from public.leads l
      where l.organization_id=p_organization_id
        and (p_after_entity_id is null or l.id>p_after_entity_id)
        and public.crm_segment_predicate_matches_v2(
          p_organization_id,'LEAD',l.id,v_definition.predicate_tree
        )
      order by l.id asc
      limit v_limit+1
    ) q;
  elsif v_segment.entity_type='PERSON' then
    select coalesce(array_agg(q.id order by q.id),array[]::uuid[])
      into v_ids
    from (
      select p.id
      from public.crm_people p
      where p.organization_id=p_organization_id
        and (p_after_entity_id is null or p.id>p_after_entity_id)
        and public.crm_segment_predicate_matches_v2(
          p_organization_id,'PERSON',p.id,v_definition.predicate_tree
        )
      order by p.id asc
      limit v_limit+1
    ) q;
  elsif v_segment.entity_type='DEAL' then
    select coalesce(array_agg(q.id order by q.id),array[]::uuid[])
      into v_ids
    from (
      select d.id
      from public.crm_deals d
      where d.organization_id=p_organization_id
        and (p_after_entity_id is null or d.id>p_after_entity_id)
        and public.crm_segment_predicate_matches_v2(
          p_organization_id,'DEAL',d.id,v_definition.predicate_tree
        )
      order by d.id asc
      limit v_limit+1
    ) q;
  else
    select coalesce(array_agg(q.id order by q.id),array[]::uuid[])
      into v_ids
    from (
      select b.id
      from public.businesses b
      where b.organization_id=p_organization_id
        and (p_after_entity_id is null or b.id>p_after_entity_id)
        and public.crm_segment_predicate_matches_v2(
          p_organization_id,'ACCOUNT',b.id,v_definition.predicate_tree
        )
      order by b.id asc
      limit v_limit+1
    ) q;
  end if;

  v_has_more:=coalesce(cardinality(v_ids),0)>v_limit;
  if v_has_more then v_ids:=v_ids[1:v_limit]; end if;
  if coalesce(cardinality(v_ids),0)>0 then v_next_cursor:=v_ids[cardinality(v_ids)]; end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,'USER',v_actor::text,
    'CRM_SEGMENT_EVALUATED','crm_segment',p_segment_id::text,
    jsonb_build_object(
      'segment_version',v_version,
      'segment_entity_type',v_segment.entity_type,
      'evaluation_mode','DYNAMIC',
      'predicate_hash',v_definition.predicate_hash,
      'predicate_leaf_count',v_definition.predicate_leaf_count,
      'returned_count',coalesce(cardinality(v_ids),0),
      'has_more',v_has_more,
      'cursor_present',p_after_entity_id is not null
    )
  );

  return jsonb_build_object(
    'segmentId',p_segment_id,
    'segmentVersion',v_version,
    'entityType',v_segment.entity_type,
    'evaluationMode','DYNAMIC',
    'predicateHash',v_definition.predicate_hash,
    'evaluatedAt',v_evaluated_at,
    'entityIds',to_jsonb(v_ids),
    'hasMore',v_has_more,
    'nextCursor',v_next_cursor
  );
end;
$$;

revoke all on function public.crm_validate_segment_deal_custom_predicate(uuid,jsonb)
  from public,anon,service_role;
grant execute on function public.crm_validate_segment_deal_custom_predicate(uuid,jsonb)
  to authenticated;

revoke all on function public.crm_validate_segment_v2_predicate_node(uuid,text,jsonb,integer)
  from public,anon,service_role;
grant execute on function public.crm_validate_segment_v2_predicate_node(uuid,text,jsonb,integer)
  to authenticated;

revoke all on function public.crm_segment_entity_context(uuid,text,uuid)
  from public,anon,service_role;
grant execute on function public.crm_segment_entity_context(uuid,text,uuid)
  to authenticated;

revoke all on function public.crm_segment_custom_field_matches_entity(uuid,text,uuid,jsonb)
  from public,anon,service_role;
grant execute on function public.crm_segment_custom_field_matches_entity(uuid,text,uuid,jsonb)
  to authenticated;

revoke all on function public.crm_segment_predicate_matches_v2_node(uuid,text,uuid,jsonb,jsonb)
  from public,anon,service_role;
grant execute on function public.crm_segment_predicate_matches_v2_node(uuid,text,uuid,jsonb,jsonb)
  to authenticated;

revoke all on function public.crm_segment_predicate_matches_v2(uuid,text,uuid,jsonb)
  from public,anon,service_role;
grant execute on function public.crm_segment_predicate_matches_v2(uuid,text,uuid,jsonb)
  to authenticated;

revoke all on function public.create_crm_segment(uuid,text,text,jsonb,text)
  from public,anon,service_role;
grant execute on function public.create_crm_segment(uuid,text,text,jsonb,text)
  to authenticated;

revoke all on function public.update_crm_segment_definition(uuid,uuid,integer,text,jsonb,text)
  from public,anon,service_role;
grant execute on function public.update_crm_segment_definition(uuid,uuid,integer,text,jsonb,text)
  to authenticated;

revoke all on function public.set_crm_segment_lifecycle(uuid,uuid,integer,text,text)
  from public,anon,service_role;
grant execute on function public.set_crm_segment_lifecycle(uuid,uuid,integer,text,text)
  to authenticated;

revoke all on function public.evaluate_crm_segment(uuid,uuid,integer,integer,uuid)
  from public,anon,service_role;
grant execute on function public.evaluate_crm_segment(uuid,uuid,integer,integer,uuid)
  to authenticated;

comment on function public.evaluate_crm_segment(uuid,uuid,integer,integer,uuid) is
  'SEGMENT-V2 bounded dynamic evaluator over canonical LEAD/PERSON/DEAL/ACCOUNT authorities. No membership persistence or provider/workflow side effect.';
