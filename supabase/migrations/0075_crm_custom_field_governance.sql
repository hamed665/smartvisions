-- Smart Visions AI Business OS 2027
-- Phase 3 / Slice 5: governed Custom Fields for Lead + Deal only.
--
-- Boundaries:
-- - no Custom Objects
-- - no Segments
-- - no Person Contact
-- - no arbitrary JSON custom values
-- - no reuse of entity metadata/sales_state/provider JSON as tenant schema
-- - no provider/customer side effects

create unique index if not exists leads_organization_id_id_unique
  on public.leads(organization_id, id);

create table if not exists public.crm_custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  entity_type text not null
    check (entity_type in ('LEAD','DEAL')),
  field_key text not null
    check (
      field_key = lower(trim(field_key))
      and field_key ~ '^[a-z][a-z0-9_]{0,63}$'
    ),
  label text not null
    check (length(trim(label)) between 1 and 160),

  data_type text not null
    check (data_type in (
      'TEXT','LONG_TEXT','NUMBER','BOOLEAN','DATE','DATETIME',
      'SINGLE_SELECT','MULTI_SELECT','EMAIL','PHONE','URL','CURRENCY'
    )),

  required boolean not null default false,
  sensitivity_class text not null default 'INTERNAL'
    check (sensitivity_class in ('INTERNAL','PII','SENSITIVE')),
  searchable boolean not null default false,
  filterable boolean not null default true,
  unique_value boolean not null default false,

  text_min_length integer
    check (text_min_length is null or text_min_length >= 0),
  text_max_length integer
    check (text_max_length is null or text_max_length between 1 and 8000),
  number_min numeric,
  number_max numeric,

  default_text text,
  default_number numeric,
  default_boolean boolean,
  default_date date,
  default_datetime timestamptz,
  default_currency_amount numeric,
  default_currency_code text,
  default_option_keys text[],

  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','DEPRECATED')),
  version integer not null default 1
    check (version >= 1),

  last_request_key text not null
    check (length(trim(last_request_key)) between 1 and 200),

  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),
  unique (organization_id, id, entity_type),
  unique (organization_id, id, entity_type, data_type),
  unique (organization_id, entity_type, field_key),
  unique (organization_id, last_request_key),

  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  foreign key (organization_id, updated_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,

  check (
    text_min_length is null
    or text_max_length is null
    or text_min_length <= text_max_length
  ),
  check (
    number_min is null
    or number_max is null
    or number_min <= number_max
  ),
  check (
    data_type in ('TEXT','LONG_TEXT')
    or (text_min_length is null and text_max_length is null)
  ),
  check (
    data_type in ('NUMBER','CURRENCY')
    or (number_min is null and number_max is null)
  ),
  check (
    not searchable
    or data_type in ('TEXT','EMAIL','PHONE','URL')
  ),
  check (
    not unique_value
    or data_type in (
      'TEXT','NUMBER','DATE','DATETIME','SINGLE_SELECT',
      'EMAIL','PHONE','URL','CURRENCY'
    )
  ),
  check (
    sensitivity_class <> 'SENSITIVE'
    or (not searchable and not filterable and not unique_value)
  )
);

create table if not exists public.crm_custom_field_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  definition_id uuid not null,

  option_key text not null
    check (
      option_key = lower(trim(option_key))
      and option_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    ),
  label text not null
    check (length(trim(label)) between 1 and 160),
  position integer not null
    check (position >= 1),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','DEPRECATED')),
  version integer not null default 1
    check (version >= 1),
  last_request_key text not null
    check (length(trim(last_request_key)) between 1 and 200),

  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),
  unique (organization_id, definition_id, id),
  unique (organization_id, definition_id, option_key),
  unique (organization_id, definition_id, position),
  unique (organization_id, last_request_key),

  foreign key (organization_id, definition_id)
    references public.crm_custom_field_definitions(organization_id, id)
    on delete restrict,
  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  foreign key (organization_id, updated_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create table if not exists public.crm_custom_field_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,

  definition_id uuid not null,
  definition_version integer not null
    check (definition_version >= 1),
  entity_type text not null
    check (entity_type in ('LEAD','DEAL')),
  data_type text not null
    check (data_type in (
      'TEXT','LONG_TEXT','NUMBER','BOOLEAN','DATE','DATETIME',
      'SINGLE_SELECT','MULTI_SELECT','EMAIL','PHONE','URL','CURRENCY'
    )),

  lead_id uuid,
  deal_id uuid,

  state text not null default 'SET'
    check (state in ('SET','CLEARED')),

  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date date,
  value_datetime timestamptz,
  value_currency_amount numeric,
  value_currency_code text,
  value_option_keys text[],

  version integer not null default 1
    check (version >= 1),
  last_request_key text not null
    check (length(trim(last_request_key)) between 1 and 200),

  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  cleared_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cleared_at timestamptz,

  unique (organization_id, id),
  unique (organization_id, last_request_key),

  foreign key (organization_id, definition_id, entity_type, data_type)
    references public.crm_custom_field_definitions(
      organization_id, id, entity_type, data_type
    )
    on delete restrict,
  foreign key (organization_id, lead_id)
    references public.leads(organization_id, id)
    on delete restrict,
  foreign key (organization_id, deal_id)
    references public.crm_deals(organization_id, id)
    on delete restrict,
  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  foreign key (organization_id, updated_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  foreign key (organization_id, cleared_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,

  check (
    (entity_type = 'LEAD' and lead_id is not null and deal_id is null)
    or
    (entity_type = 'DEAL' and deal_id is not null and lead_id is null)
  )
);

create unique index if not exists crm_custom_field_values_lead_current_uidx
  on public.crm_custom_field_values(organization_id, definition_id, lead_id)
  where lead_id is not null;

create unique index if not exists crm_custom_field_values_deal_current_uidx
  on public.crm_custom_field_values(organization_id, definition_id, deal_id)
  where deal_id is not null;

create index if not exists crm_custom_field_values_lead_read_idx
  on public.crm_custom_field_values(organization_id, lead_id, definition_id)
  where lead_id is not null;

create index if not exists crm_custom_field_values_deal_read_idx
  on public.crm_custom_field_values(organization_id, deal_id, definition_id)
  where deal_id is not null;

create index if not exists crm_custom_field_options_definition_idx
  on public.crm_custom_field_options(organization_id, definition_id, position);

create index if not exists crm_custom_field_definitions_created_by_fk_idx
  on public.crm_custom_field_definitions(organization_id, created_by_user_id);

create index if not exists crm_custom_field_definitions_updated_by_fk_idx
  on public.crm_custom_field_definitions(organization_id, updated_by_user_id);

create index if not exists crm_custom_field_options_created_by_fk_idx
  on public.crm_custom_field_options(organization_id, created_by_user_id);

create index if not exists crm_custom_field_options_updated_by_fk_idx
  on public.crm_custom_field_options(organization_id, updated_by_user_id);

create index if not exists crm_custom_field_values_created_by_fk_idx
  on public.crm_custom_field_values(organization_id, created_by_user_id);

create index if not exists crm_custom_field_values_updated_by_fk_idx
  on public.crm_custom_field_values(organization_id, updated_by_user_id);

create index if not exists crm_custom_field_values_cleared_by_fk_idx
  on public.crm_custom_field_values(organization_id, cleared_by_user_id)
  where cleared_by_user_id is not null;

create or replace function public.crm_custom_field_is_schema_manager(
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
      and m.role in ('OWNER','ADMIN')
  );
$$;

create or replace function public.crm_custom_field_can_read_definition(
  p_organization_id uuid,
  p_definition_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
  select exists (
    select 1
    from public.crm_custom_field_definitions d
    join public.organization_members m
      on m.organization_id = d.organization_id
     and m.user_id = auth.uid()
    where d.organization_id = p_organization_id
      and d.id = p_definition_id
      and (
        d.sensitivity_class <> 'SENSITIVE'
        or m.role in ('OWNER','ADMIN')
      )
  );
$$;

create or replace function public.crm_custom_field_can_read_value(
  p_organization_id uuid,
  p_definition_id uuid,
  p_lead_id uuid,
  p_deal_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $custom_field_read_value$
  select public.crm_custom_field_can_read_definition(
    p_organization_id, p_definition_id
  )
  and (
    (
      p_lead_id is not null
      and p_deal_id is null
      and exists (
        select 1
        from public.leads l
        where l.organization_id = p_organization_id
          and l.id = p_lead_id
      )
    )
    or
    (
      p_deal_id is not null
      and p_lead_id is null
      and exists (
        select 1
        from public.crm_deals d
        where d.organization_id = p_organization_id
          and d.id = p_deal_id
      )
    )
  );
$custom_field_read_value$;

create or replace function public.crm_custom_field_can_manage_value(
  p_organization_id uuid,
  p_definition_id uuid,
  p_lead_id uuid,
  p_deal_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
  select exists (
    select 1
    from public.crm_custom_field_definitions d
    join public.organization_members m
      on m.organization_id = d.organization_id
     and m.user_id = auth.uid()
    where d.organization_id = p_organization_id
      and d.id = p_definition_id
      and (
        m.role in ('OWNER','ADMIN','SALES_MANAGER')
        or (
          m.role = 'SALES_AGENT'
          and d.entity_type = 'DEAL'
          and p_lead_id is null
          and p_deal_id is not null
          and exists (
            select 1
            from public.crm_deals deal
            where deal.organization_id = p_organization_id
              and deal.id = p_deal_id
              and deal.owner_user_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.guard_crm_custom_field_definition()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog, extensions
as $$
declare
  v_actor uuid := auth.uid();
  v_existing_entities bigint;
  v_missing bigint;
begin
  new.field_key := lower(trim(new.field_key));
  new.label := trim(new.label);
  new.last_request_key := trim(new.last_request_key);
  new.default_currency_code := case
    when new.default_currency_code is null then null
    else upper(trim(new.default_currency_code))
  end;

  if new.default_text is not null then
    if new.data_type = 'EMAIL' then
      new.default_text := lower(trim(new.default_text));
    elsif new.data_type = 'PHONE' then
      new.default_text := regexp_replace(trim(new.default_text), '[\s\-\(\)]', '', 'g');
    elsif new.data_type in ('TEXT','URL') then
      new.default_text := trim(new.default_text);
    end if;
  end if;

  if new.default_option_keys is not null then
    select coalesce(array_agg(distinct lower(trim(x)) order by lower(trim(x))), array[]::text[])
      into new.default_option_keys
    from unnest(new.default_option_keys) x;
  end if;

  if tg_op = 'INSERT' then
    if v_actor is null or new.created_by_user_id is distinct from v_actor
       or new.updated_by_user_id is distinct from v_actor
    then
      raise exception 'CRM custom field definition actor must match auth.uid()';
    end if;
    new.version := 1;
    new.created_at := coalesce(new.created_at, now());
  else
    if new.organization_id is distinct from old.organization_id
       or new.entity_type is distinct from old.entity_type
       or new.field_key is distinct from old.field_key
       or new.data_type is distinct from old.data_type
       or new.unique_value is distinct from old.unique_value
       or new.created_by_user_id is distinct from old.created_by_user_id
    then
      raise exception 'CRM custom field identity/type/unique contract is immutable';
    end if;

    if v_actor is null or new.updated_by_user_id is distinct from v_actor then
      raise exception 'CRM custom field definition updater must match auth.uid()';
    end if;

    if new.version is distinct from old.version then
      raise exception 'CRM custom field definition version is database-managed';
    end if;

    new.version := old.version + 1;
  end if;

  if new.searchable and new.data_type not in ('TEXT','EMAIL','PHONE','URL') then
    raise exception 'CRM custom field searchable is unsupported for %', new.data_type;
  end if;

  if new.unique_value and new.data_type in ('LONG_TEXT','BOOLEAN','MULTI_SELECT') then
    raise exception 'CRM custom field uniqueness is unsupported for %', new.data_type;
  end if;

  if new.sensitivity_class = 'SENSITIVE'
     and (new.searchable or new.filterable or new.unique_value)
  then
    raise exception 'SENSITIVE custom field cannot be searchable/filterable/unique';
  end if;

  if new.text_min_length is not null or new.text_max_length is not null then
    if new.data_type not in ('TEXT','LONG_TEXT') then
      raise exception 'Text validation is only supported for TEXT/LONG_TEXT';
    end if;
    if new.text_min_length is not null and new.text_max_length is not null
       and new.text_min_length > new.text_max_length
    then
      raise exception 'text_min_length cannot exceed text_max_length';
    end if;
  end if;

  if new.number_min is not null or new.number_max is not null then
    if new.data_type not in ('NUMBER','CURRENCY') then
      raise exception 'Numeric validation is only supported for NUMBER/CURRENCY';
    end if;
    if new.number_min is not null and new.number_max is not null
       and new.number_min > new.number_max
    then
      raise exception 'number_min cannot exceed number_max';
    end if;
  end if;

  if new.data_type not in ('SINGLE_SELECT','MULTI_SELECT')
     and new.default_option_keys is not null
  then
    raise exception 'default_option_keys only valid for select fields';
  end if;

  if new.data_type = 'SINGLE_SELECT'
     and new.default_option_keys is not null
     and cardinality(new.default_option_keys) > 1
  then
    raise exception 'SINGLE_SELECT default may contain at most one option';
  end if;

  if new.default_option_keys is not null and cardinality(new.default_option_keys) > 0 then
    if exists (
      select 1
      from unnest(new.default_option_keys) k
      where not exists (
        select 1
        from public.crm_custom_field_options o
        where o.organization_id = new.organization_id
          and o.definition_id = new.id
          and o.option_key = k
          and o.status = 'ACTIVE'
      )
    ) then
      raise exception 'CRM custom field default references missing/deprecated option';
    end if;
  end if;

  if new.default_text is not null then
    if new.data_type not in ('TEXT','LONG_TEXT','EMAIL','PHONE','URL') then
      raise exception 'default_text does not match custom field type %', new.data_type;
    end if;
    if new.data_type = 'TEXT' and length(new.default_text) > 1024 then
      raise exception 'TEXT default exceeds 1024 characters';
    elsif new.data_type = 'LONG_TEXT' and length(new.default_text) > 8000 then
      raise exception 'LONG_TEXT default exceeds 8000 characters';
    elsif new.data_type = 'EMAIL'
      and (
        length(new.default_text) > 320
        or new.default_text !~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'
      )
    then
      raise exception 'Invalid EMAIL default';
    elsif new.data_type = 'PHONE'
      and new.default_text !~ '^\\+[1-9][0-9]{7,14}$'
    then
      raise exception 'PHONE default must be E.164';
    elsif new.data_type = 'URL'
      and (
        length(new.default_text) > 2048
        or new.default_text !~* '^https?://[^\\s]+$'
      )
    then
      raise exception 'URL default must use http/https and fit 2048 characters';
    end if;

    if new.text_min_length is not null and length(new.default_text) < new.text_min_length then
      raise exception 'Default text shorter than text_min_length';
    end if;
    if new.text_max_length is not null and length(new.default_text) > new.text_max_length then
      raise exception 'Default text longer than text_max_length';
    end if;
  end if;

  if new.default_number is not null then
    if new.data_type <> 'NUMBER' then
      raise exception 'default_number only valid for NUMBER';
    end if;
    if new.number_min is not null and new.default_number < new.number_min then
      raise exception 'default_number below number_min';
    end if;
    if new.number_max is not null and new.default_number > new.number_max then
      raise exception 'default_number above number_max';
    end if;
  end if;

  if new.default_boolean is not null and new.data_type <> 'BOOLEAN' then
    raise exception 'default_boolean only valid for BOOLEAN';
  end if;
  if new.default_date is not null and new.data_type <> 'DATE' then
    raise exception 'default_date only valid for DATE';
  end if;
  if new.default_datetime is not null and new.data_type <> 'DATETIME' then
    raise exception 'default_datetime only valid for DATETIME';
  end if;

  if (new.default_currency_amount is null) <> (new.default_currency_code is null) then
    raise exception 'CURRENCY default requires both amount and currency code';
  end if;
  if new.default_currency_amount is not null then
    if new.data_type <> 'CURRENCY' then
      raise exception 'Currency default only valid for CURRENCY';
    end if;
    if new.default_currency_code !~ '^[A-Z]{3}$' then
      raise exception 'Currency default code must be three uppercase letters';
    end if;
    if new.number_min is not null and new.default_currency_amount < new.number_min then
      raise exception 'Currency default below number_min';
    end if;
    if new.number_max is not null and new.default_currency_amount > new.number_max then
      raise exception 'Currency default above number_max';
    end if;
  end if;

  if (
    (new.default_text is not null)::int
    + (new.default_number is not null)::int
    + (new.default_boolean is not null)::int
    + (new.default_date is not null)::int
    + (new.default_datetime is not null)::int
    + (new.default_currency_amount is not null)::int
    + (
        new.default_option_keys is not null
        and cardinality(new.default_option_keys) > 0
      )::int
  ) > 1 then
    raise exception 'CRM custom field definition may have only one typed default';
  end if;

  if new.required then
    if new.entity_type = 'LEAD' then
      select count(*) into v_existing_entities
      from public.leads e
      where e.organization_id = new.organization_id;
    else
      select count(*) into v_existing_entities
      from public.crm_deals e
      where e.organization_id = new.organization_id;
    end if;

    if v_existing_entities > 0 then
      if tg_op = 'INSERT' then
        raise exception 'Required custom field cannot be created while existing entities lack values';
      elsif not old.required then
        if new.entity_type = 'LEAD' then
          select count(*) into v_missing
          from public.leads e
          where e.organization_id = new.organization_id
            and not exists (
              select 1
              from public.crm_custom_field_values v
              where v.organization_id = e.organization_id
                and v.definition_id = new.id
                and v.lead_id = e.id
                and v.state = 'SET'
            );
        else
          select count(*) into v_missing
          from public.crm_deals e
          where e.organization_id = new.organization_id
            and not exists (
              select 1
              from public.crm_custom_field_values v
              where v.organization_id = e.organization_id
                and v.definition_id = new.id
                and v.deal_id = e.id
                and v.state = 'SET'
            );
        end if;

        if v_missing > 0 then
          raise exception 'Required custom field cannot activate while % entities lack SET values', v_missing;
        end if;
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.text_min_length is distinct from old.text_min_length
    or new.text_max_length is distinct from old.text_max_length
    or new.number_min is distinct from old.number_min
    or new.number_max is distinct from old.number_max
  ) then
    if exists (
      select 1
      from public.crm_custom_field_values v
      where v.organization_id = new.organization_id
        and v.definition_id = new.id
        and v.state = 'SET'
        and (
          (
            new.data_type in ('TEXT','LONG_TEXT')
            and (
              (new.text_min_length is not null and length(v.value_text) < new.text_min_length)
              or
              (new.text_max_length is not null and length(v.value_text) > new.text_max_length)
            )
          )
          or (
            new.data_type = 'NUMBER'
            and (
              (new.number_min is not null and v.value_number < new.number_min)
              or
              (new.number_max is not null and v.value_number > new.number_max)
            )
          )
          or (
            new.data_type = 'CURRENCY'
            and (
              (new.number_min is not null and v.value_currency_amount < new.number_min)
              or
              (new.number_max is not null and v.value_currency_amount > new.number_max)
            )
          )
        )
    ) then
      raise exception 'Custom field constraint change would invalidate stored values';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_crm_custom_field_option()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_definition public.crm_custom_field_definitions%rowtype;
begin
  new.option_key := lower(trim(new.option_key));
  new.label := trim(new.label);
  new.last_request_key := trim(new.last_request_key);

  perform pg_advisory_xact_lock(
    hashtextextended(new.definition_id::text, 0)
  );

  select * into v_definition
  from public.crm_custom_field_definitions d
  where d.organization_id = new.organization_id
    and d.id = new.definition_id;

  if not found then
    raise exception 'CRM custom field definition not found';
  end if;

  if v_definition.data_type not in ('SINGLE_SELECT','MULTI_SELECT') then
    raise exception 'Options are only valid for select custom fields';
  end if;

  if v_definition.status <> 'ACTIVE' and tg_op = 'INSERT' then
    raise exception 'Cannot add option to deprecated custom field';
  end if;

  if tg_op = 'INSERT' then
    if v_actor is null or new.created_by_user_id is distinct from v_actor
       or new.updated_by_user_id is distinct from v_actor
    then
      raise exception 'CRM custom field option actor must match auth.uid()';
    end if;
    new.version := 1;
    new.created_at := coalesce(new.created_at, now());
  else
    if new.organization_id is distinct from old.organization_id
       or new.definition_id is distinct from old.definition_id
       or new.option_key is distinct from old.option_key
       or new.created_by_user_id is distinct from old.created_by_user_id
    then
      raise exception 'CRM custom field option identity is immutable';
    end if;
    if v_actor is null or new.updated_by_user_id is distinct from v_actor then
      raise exception 'CRM custom field option updater must match auth.uid()';
    end if;
    if new.version is distinct from old.version then
      raise exception 'CRM custom field option version is database-managed';
    end if;

    if old.status = 'ACTIVE' and new.status = 'DEPRECATED' then
      if exists (
        select 1
        from public.crm_custom_field_values v
        where v.organization_id = new.organization_id
          and v.definition_id = new.definition_id
          and v.state = 'SET'
          and new.option_key = any(coalesce(v.value_option_keys, array[]::text[]))
      ) or exists (
        select 1
        from public.crm_custom_field_definitions d
        where d.organization_id = new.organization_id
          and d.id = new.definition_id
          and new.option_key = any(coalesce(d.default_option_keys, array[]::text[]))
      ) then
        raise exception 'Cannot deprecate custom field option while values/defaults reference it';
      end if;
    end if;

    new.version := old.version + 1;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_crm_custom_field_value()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  d public.crm_custom_field_definitions%rowtype;
  v_set_slots integer;
begin
  select * into d
  from public.crm_custom_field_definitions def
  where def.organization_id = new.organization_id
    and def.id = new.definition_id;

  if not found then
    raise exception 'CRM custom field definition not found';
  end if;

  if new.entity_type is distinct from d.entity_type then
    raise exception 'CRM custom field entity_type mismatch';
  end if;

  new.data_type := d.data_type;
  new.definition_version := d.version;
  new.last_request_key := trim(new.last_request_key);

  if new.entity_type = 'LEAD' then
    if new.lead_id is null or new.deal_id is not null then
      raise exception 'LEAD custom field requires lead_id only';
    end if;
  else
    if new.deal_id is null or new.lead_id is not null then
      raise exception 'DEAL custom field requires deal_id only';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if v_actor is null or new.created_by_user_id is distinct from v_actor
       or new.updated_by_user_id is distinct from v_actor
    then
      raise exception 'CRM custom field value actor must match auth.uid()';
    end if;
    new.version := 1;
    new.created_at := coalesce(new.created_at, now());
  else
    if new.organization_id is distinct from old.organization_id
       or new.definition_id is distinct from old.definition_id
       or new.entity_type is distinct from old.entity_type
       or new.lead_id is distinct from old.lead_id
       or new.deal_id is distinct from old.deal_id
       or new.created_by_user_id is distinct from old.created_by_user_id
    then
      raise exception 'CRM custom field value binding is immutable';
    end if;
    if v_actor is null or new.updated_by_user_id is distinct from v_actor then
      raise exception 'CRM custom field value updater must match auth.uid()';
    end if;
    if new.version is distinct from old.version then
      raise exception 'CRM custom field value version is database-managed';
    end if;
    new.version := old.version + 1;
  end if;

  if new.state = 'CLEARED' then
    if d.required then
      raise exception 'Required CRM custom field cannot be cleared';
    end if;
    new.value_text := null;
    new.value_number := null;
    new.value_boolean := null;
    new.value_date := null;
    new.value_datetime := null;
    new.value_currency_amount := null;
    new.value_currency_code := null;
    new.value_option_keys := null;
    new.cleared_at := now();
    new.cleared_by_user_id := v_actor;
    new.updated_at := now();
    return new;
  end if;

  if d.status <> 'ACTIVE' then
    raise exception 'Deprecated CRM custom field cannot receive SET values';
  end if;

  new.cleared_at := null;
  new.cleared_by_user_id := null;

  if new.value_text is not null then
    if d.data_type = 'EMAIL' then
      new.value_text := lower(trim(new.value_text));
    elsif d.data_type = 'PHONE' then
      new.value_text := regexp_replace(trim(new.value_text), '[\s\-\(\)]', '', 'g');
    elsif d.data_type in ('TEXT','URL') then
      new.value_text := trim(new.value_text);
    end if;
  end if;

  if new.value_currency_code is not null then
    new.value_currency_code := upper(trim(new.value_currency_code));
  end if;

  if d.data_type <> 'CURRENCY' and new.value_currency_code is not null then
    raise exception 'value_currency_code only valid for CURRENCY custom fields';
  end if;

  if new.value_option_keys is not null then
    select coalesce(array_agg(distinct lower(trim(x)) order by lower(trim(x))), array[]::text[])
      into new.value_option_keys
    from unnest(new.value_option_keys) x;
  end if;

  v_set_slots :=
      (new.value_text is not null)::int
    + (new.value_number is not null)::int
    + (new.value_boolean is not null)::int
    + (new.value_date is not null)::int
    + (new.value_datetime is not null)::int
    + (new.value_currency_amount is not null)::int
    + (
        new.value_option_keys is not null
        and cardinality(new.value_option_keys) > 0
      )::int;

  if v_set_slots <> 1 then
    raise exception 'CRM custom field SET value requires exactly one typed value slot';
  end if;

  case d.data_type
    when 'TEXT' then
      if new.value_text is null or length(new.value_text) > 1024 then
        raise exception 'TEXT custom value invalid';
      end if;
    when 'LONG_TEXT' then
      if new.value_text is null or length(new.value_text) > 8000 then
        raise exception 'LONG_TEXT custom value invalid';
      end if;
    when 'EMAIL' then
      if new.value_text is null
         or length(new.value_text) > 320
         or new.value_text !~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'
      then
        raise exception 'EMAIL custom value invalid';
      end if;
    when 'PHONE' then
      if new.value_text is null
         or new.value_text !~ '^\\+[1-9][0-9]{7,14}$'
      then
        raise exception 'PHONE custom value must be E.164';
      end if;
    when 'URL' then
      if new.value_text is null
         or length(new.value_text) > 2048
         or new.value_text !~* '^https?://[^\\s]+$'
      then
        raise exception 'URL custom value must use http/https';
      end if;
    when 'NUMBER' then
      if new.value_number is null then
        raise exception 'NUMBER custom value invalid';
      end if;
    when 'BOOLEAN' then
      if new.value_boolean is null then
        raise exception 'BOOLEAN custom value invalid';
      end if;
    when 'DATE' then
      if new.value_date is null then
        raise exception 'DATE custom value invalid';
      end if;
    when 'DATETIME' then
      if new.value_datetime is null then
        raise exception 'DATETIME custom value invalid';
      end if;
    when 'SINGLE_SELECT' then
      if new.value_option_keys is null or cardinality(new.value_option_keys) <> 1 then
        raise exception 'SINGLE_SELECT requires exactly one option key';
      end if;
    when 'MULTI_SELECT' then
      if new.value_option_keys is null or cardinality(new.value_option_keys) < 1 then
        raise exception 'MULTI_SELECT requires at least one option key';
      end if;
    when 'CURRENCY' then
      if new.value_currency_amount is null
         or new.value_currency_code is null
         or new.value_currency_code !~ '^[A-Z]{3}$'
      then
        raise exception 'CURRENCY custom value requires amount and three-letter currency code';
      end if;
    else
      raise exception 'Unsupported CRM custom field type %', d.data_type;
  end case;

  if d.data_type in ('TEXT','LONG_TEXT') then
    if d.text_min_length is not null and length(new.value_text) < d.text_min_length then
      raise exception 'Custom value shorter than text_min_length';
    end if;
    if d.text_max_length is not null and length(new.value_text) > d.text_max_length then
      raise exception 'Custom value longer than text_max_length';
    end if;
  end if;

  if d.data_type = 'NUMBER' then
    if d.number_min is not null and new.value_number < d.number_min then
      raise exception 'Custom value below number_min';
    end if;
    if d.number_max is not null and new.value_number > d.number_max then
      raise exception 'Custom value above number_max';
    end if;
  elsif d.data_type = 'CURRENCY' then
    if d.number_min is not null and new.value_currency_amount < d.number_min then
      raise exception 'Currency custom value below number_min';
    end if;
    if d.number_max is not null and new.value_currency_amount > d.number_max then
      raise exception 'Currency custom value above number_max';
    end if;
  end if;

  if d.data_type in ('SINGLE_SELECT','MULTI_SELECT') then
    perform pg_advisory_xact_lock(
      hashtextextended(new.definition_id::text, 0)
    );

    if exists (
      select 1
      from unnest(new.value_option_keys) k
      where not exists (
        select 1
        from public.crm_custom_field_options o
        where o.organization_id = new.organization_id
          and o.definition_id = new.definition_id
          and o.option_key = k
          and o.status = 'ACTIVE'
      )
    ) then
      raise exception 'Custom value references missing/deprecated option';
    end if;
  end if;

  if d.unique_value then
    perform pg_advisory_xact_lock(
      hashtextextended(new.definition_id::text, 0)
    );

    if exists (
      select 1
      from public.crm_custom_field_values v
      where v.organization_id = new.organization_id
        and v.definition_id = new.definition_id
        and v.state = 'SET'
        and (tg_op = 'INSERT' or v.id <> old.id)
        and (
          (d.data_type in ('TEXT','EMAIL','PHONE','URL') and v.value_text = new.value_text)
          or (d.data_type = 'NUMBER' and v.value_number = new.value_number)
          or (d.data_type = 'DATE' and v.value_date = new.value_date)
          or (d.data_type = 'DATETIME' and v.value_datetime = new.value_datetime)
          or (d.data_type = 'SINGLE_SELECT' and v.value_option_keys = new.value_option_keys)
          or (
            d.data_type = 'CURRENCY'
            and v.value_currency_amount = new.value_currency_amount
            and v.value_currency_code = new.value_currency_code
          )
        )
    ) then
      raise exception 'CRM custom field unique value already exists';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.audit_crm_custom_field_definition()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'CRM_CUSTOM_FIELD_DEFINITION_CREATED';
  elsif old.status = 'ACTIVE' and new.status = 'DEPRECATED' then
    v_action := 'CRM_CUSTOM_FIELD_DEFINITION_DEPRECATED';
  elsif old.status = 'DEPRECATED' and new.status = 'ACTIVE' then
    v_action := 'CRM_CUSTOM_FIELD_DEFINITION_REACTIVATED';
  else
    v_action := 'CRM_CUSTOM_FIELD_DEFINITION_UPDATED';
  end if;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action,
    entity_type, entity_id, before_data, after_data, correlation_id
  ) values (
    new.organization_id,
    case when auth.uid() is null then 'SYSTEM' else 'USER' end,
    coalesce(auth.uid()::text, current_user),
    v_action,
    'crm_custom_field_definitions',
    new.id::text,
    case when tg_op='INSERT' then null else jsonb_strip_nulls(jsonb_build_object(
      'entity_type',old.entity_type,'field_key',old.field_key,'data_type',old.data_type,
      'required',old.required,'sensitivity_class',old.sensitivity_class,
      'searchable',old.searchable,'filterable',old.filterable,
      'unique_value',old.unique_value,'status',old.status,'version',old.version
    )) end,
    jsonb_strip_nulls(jsonb_build_object(
      'entity_type',new.entity_type,'field_key',new.field_key,'data_type',new.data_type,
      'required',new.required,'sensitivity_class',new.sensitivity_class,
      'searchable',new.searchable,'filterable',new.filterable,
      'unique_value',new.unique_value,'status',new.status,'version',new.version
    )),
    'dbtx:' || txid_current()::text
  );
  return new;
end;
$$;

create or replace function public.audit_crm_custom_field_option()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_action text;
begin
  if tg_op='INSERT' then
    v_action := 'CRM_CUSTOM_FIELD_OPTION_CREATED';
  elsif old.status='ACTIVE' and new.status='DEPRECATED' then
    v_action := 'CRM_CUSTOM_FIELD_OPTION_DEPRECATED';
  elsif old.status='DEPRECATED' and new.status='ACTIVE' then
    v_action := 'CRM_CUSTOM_FIELD_OPTION_REACTIVATED';
  else
    v_action := 'CRM_CUSTOM_FIELD_OPTION_UPDATED';
  end if;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action,
    entity_type, entity_id, before_data, after_data, correlation_id
  ) values (
    new.organization_id,
    case when auth.uid() is null then 'SYSTEM' else 'USER' end,
    coalesce(auth.uid()::text,current_user),
    v_action,
    'crm_custom_field_options',
    new.id::text,
    case when tg_op='INSERT' then null else jsonb_build_object(
      'definition_id',old.definition_id,'option_key',old.option_key,
      'position',old.position,'status',old.status,'version',old.version
    ) end,
    jsonb_build_object(
      'definition_id',new.definition_id,'option_key',new.option_key,
      'position',new.position,'status',new.status,'version',new.version
    ),
    'dbtx:' || txid_current()::text
  );
  return new;
end;
$$;

create or replace function public.audit_crm_custom_field_value()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_action text;
begin
  if tg_op='INSERT' then
    v_action := 'CRM_CUSTOM_FIELD_VALUE_CREATED';
  elsif old.state='SET' and new.state='CLEARED' then
    v_action := 'CRM_CUSTOM_FIELD_VALUE_CLEARED';
  elsif old.state='CLEARED' and new.state='SET' then
    v_action := 'CRM_CUSTOM_FIELD_VALUE_RESTORED';
  else
    v_action := 'CRM_CUSTOM_FIELD_VALUE_UPDATED';
  end if;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action,
    entity_type, entity_id, before_data, after_data, correlation_id
  ) values (
    new.organization_id,
    case when auth.uid() is null then 'SYSTEM' else 'USER' end,
    coalesce(auth.uid()::text,current_user),
    v_action,
    'crm_custom_field_values',
    new.id::text,
    case when tg_op='INSERT' then null else jsonb_strip_nulls(jsonb_build_object(
      'definition_id',old.definition_id,'definition_version',old.definition_version,
      'entity_type',old.entity_type,'lead_id',old.lead_id,'deal_id',old.deal_id,
      'state',old.state,'data_type',old.data_type,'version',old.version,
      'has_value',(old.state='SET')
    )) end,
    jsonb_strip_nulls(jsonb_build_object(
      'definition_id',new.definition_id,'definition_version',new.definition_version,
      'entity_type',new.entity_type,'lead_id',new.lead_id,'deal_id',new.deal_id,
      'state',new.state,'data_type',new.data_type,'version',new.version,
      'has_value',(new.state='SET')
    )),
    'dbtx:' || txid_current()::text
  );
  return new;
end;
$$;

drop trigger if exists crm_custom_field_definitions_guard
  on public.crm_custom_field_definitions;
create trigger crm_custom_field_definitions_guard
before insert or update on public.crm_custom_field_definitions
for each row execute function public.guard_crm_custom_field_definition();

drop trigger if exists crm_custom_field_options_guard
  on public.crm_custom_field_options;
create trigger crm_custom_field_options_guard
before insert or update on public.crm_custom_field_options
for each row execute function public.guard_crm_custom_field_option();

drop trigger if exists crm_custom_field_values_guard
  on public.crm_custom_field_values;
create trigger crm_custom_field_values_guard
before insert or update on public.crm_custom_field_values
for each row execute function public.guard_crm_custom_field_value();

drop trigger if exists crm_custom_field_definitions_audit
  on public.crm_custom_field_definitions;
create trigger crm_custom_field_definitions_audit
after insert or update on public.crm_custom_field_definitions
for each row execute function public.audit_crm_custom_field_definition();

drop trigger if exists crm_custom_field_options_audit
  on public.crm_custom_field_options;
create trigger crm_custom_field_options_audit
after insert or update on public.crm_custom_field_options
for each row execute function public.audit_crm_custom_field_option();

drop trigger if exists crm_custom_field_values_audit
  on public.crm_custom_field_values;
create trigger crm_custom_field_values_audit
after insert or update on public.crm_custom_field_values
for each row execute function public.audit_crm_custom_field_value();

alter table public.crm_custom_field_definitions enable row level security;
alter table public.crm_custom_field_options enable row level security;
alter table public.crm_custom_field_values enable row level security;

create policy crm_custom_field_definitions_member_read
on public.crm_custom_field_definitions
for select to authenticated
using (
  public.is_org_member(organization_id)
  and (
    sensitivity_class <> 'SENSITIVE'
    or public.crm_custom_field_is_schema_manager(organization_id)
  )
);

create policy crm_custom_field_definitions_schema_insert
on public.crm_custom_field_definitions
for insert to authenticated
with check (
  public.crm_custom_field_is_schema_manager(organization_id)
  and created_by_user_id = (select auth.uid())
  and updated_by_user_id = (select auth.uid())
);

create policy crm_custom_field_definitions_schema_update
on public.crm_custom_field_definitions
for update to authenticated
using (public.crm_custom_field_is_schema_manager(organization_id))
with check (
  public.crm_custom_field_is_schema_manager(organization_id)
  and updated_by_user_id = (select auth.uid())
);

create policy crm_custom_field_options_member_read
on public.crm_custom_field_options
for select to authenticated
using (
  public.crm_custom_field_can_read_definition(
    organization_id, definition_id
  )
);

create policy crm_custom_field_options_schema_insert
on public.crm_custom_field_options
for insert to authenticated
with check (
  public.crm_custom_field_is_schema_manager(organization_id)
  and created_by_user_id = (select auth.uid())
  and updated_by_user_id = (select auth.uid())
);

create policy crm_custom_field_options_schema_update
on public.crm_custom_field_options
for update to authenticated
using (public.crm_custom_field_is_schema_manager(organization_id))
with check (
  public.crm_custom_field_is_schema_manager(organization_id)
  and updated_by_user_id = (select auth.uid())
);

create policy crm_custom_field_values_governed_read
on public.crm_custom_field_values
for select to authenticated
using (
  public.crm_custom_field_can_read_value(
    organization_id, definition_id, lead_id, deal_id
  )
);

create policy crm_custom_field_values_governed_insert
on public.crm_custom_field_values
for insert to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and updated_by_user_id = (select auth.uid())
  and public.crm_custom_field_can_manage_value(
    organization_id, definition_id, lead_id, deal_id
  )
);

create policy crm_custom_field_values_governed_update
on public.crm_custom_field_values
for update to authenticated
using (
  public.crm_custom_field_can_manage_value(
    organization_id, definition_id, lead_id, deal_id
  )
)
with check (
  updated_by_user_id = (select auth.uid())
  and public.crm_custom_field_can_manage_value(
    organization_id, definition_id, lead_id, deal_id
  )
);

create or replace function public.get_crm_custom_field_definitions(
  p_organization_id uuid,
  p_entity_type text default null,
  p_include_deprecated boolean default false,
  p_limit integer default 50,
  p_after_field_key text default null,
  p_after_id uuid default null
)
returns setof public.crm_custom_field_definitions
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select d.*
  from public.crm_custom_field_definitions d
  where d.organization_id = p_organization_id
    and (p_entity_type is null or d.entity_type = p_entity_type)
    and (p_include_deprecated or d.status = 'ACTIVE')
    and (
      p_after_field_key is null
      or d.field_key > p_after_field_key
      or (
        d.field_key = p_after_field_key
        and p_after_id is not null
        and d.id > p_after_id
      )
    )
  order by d.field_key asc, d.id asc
  limit least(greatest(coalesce(p_limit,50),1),101);
$$;

create or replace function public.get_crm_custom_field_values(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_include_cleared boolean default false,
  p_limit integer default 50,
  p_after_definition_id uuid default null,
  p_after_id uuid default null
)
returns setof public.crm_custom_field_values
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select v.*
  from public.crm_custom_field_values v
  where v.organization_id = p_organization_id
    and v.entity_type = p_entity_type
    and (
      (p_entity_type='LEAD' and v.lead_id=p_entity_id)
      or (p_entity_type='DEAL' and v.deal_id=p_entity_id)
    )
    and (p_include_cleared or v.state='SET')
    and (
      p_after_definition_id is null
      or v.definition_id > p_after_definition_id
      or (
        v.definition_id = p_after_definition_id
        and p_after_id is not null
        and v.id > p_after_id
      )
    )
  order by v.definition_id asc, v.id asc
  limit least(greatest(coalesce(p_limit,50),1),101);
$$;

create or replace function public.find_crm_entities_by_custom_field_exact(
  p_organization_id uuid,
  p_definition_id uuid,
  p_value_text text default null,
  p_value_number numeric default null,
  p_value_boolean boolean default null,
  p_value_date date default null,
  p_value_datetime timestamptz default null,
  p_value_currency_amount numeric default null,
  p_value_currency_code text default null,
  p_option_key text default null,
  p_limit integer default 50,
  p_after_entity_id uuid default null
)
returns table(entity_type text, entity_id uuid, value_id uuid)
language plpgsql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  d public.crm_custom_field_definitions%rowtype;
  v_slots integer;
  v_text text := p_value_text;
  v_currency_code text := p_value_currency_code;
  v_option_key text := p_option_key;
begin
  select * into d
  from public.crm_custom_field_definitions def
  where def.organization_id=p_organization_id
    and def.id=p_definition_id;

  if not found or not public.crm_custom_field_can_read_definition(
    p_organization_id,p_definition_id
  ) then
    return;
  end if;

  if not d.filterable then
    raise exception 'CRM custom field is not filterable';
  end if;

  if d.data_type='EMAIL' and v_text is not null then
    v_text := lower(trim(v_text));
  elsif d.data_type='PHONE' and v_text is not null then
    v_text := regexp_replace(trim(v_text), '[\s\-\(\)]', '', 'g');
  elsif d.data_type in ('TEXT','URL') and v_text is not null then
    v_text := trim(v_text);
  end if;

  if v_currency_code is not null then
    v_currency_code := upper(trim(v_currency_code));
  end if;

  if (p_value_currency_amount is null) <> (v_currency_code is null) then
    raise exception 'CURRENCY exact filter requires amount and currency code together';
  end if;
  if v_option_key is not null then
    v_option_key := lower(trim(v_option_key));
  end if;

  v_slots :=
      (v_text is not null)::int
    + (p_value_number is not null)::int
    + (p_value_boolean is not null)::int
    + (p_value_date is not null)::int
    + (p_value_datetime is not null)::int
    + (p_value_currency_amount is not null)::int
    + (v_option_key is not null)::int;

  if v_slots <> 1 then
    raise exception 'Exact custom-field filter requires one typed query value';
  end if;

  return query
  select
    v.entity_type,
    case when v.entity_type='LEAD' then v.lead_id else v.deal_id end,
    v.id
  from public.crm_custom_field_values v
  where v.organization_id=p_organization_id
    and v.definition_id=p_definition_id
    and v.state='SET'
    and (p_after_entity_id is null or
      (case when v.entity_type='LEAD' then v.lead_id else v.deal_id end) > p_after_entity_id
    )
    and (
      (d.data_type in ('TEXT','LONG_TEXT','EMAIL','PHONE','URL')
        and v.value_text=v_text)
      or (d.data_type='NUMBER' and v.value_number=p_value_number)
      or (d.data_type='BOOLEAN' and v.value_boolean=p_value_boolean)
      or (d.data_type='DATE' and v.value_date=p_value_date)
      or (d.data_type='DATETIME' and v.value_datetime=p_value_datetime)
      or (
        d.data_type='CURRENCY'
        and v.value_currency_amount=p_value_currency_amount
        and v.value_currency_code=v_currency_code
      )
      or (
        d.data_type in ('SINGLE_SELECT','MULTI_SELECT')
        and v_option_key=any(v.value_option_keys)
      )
    )
  order by
    case when v.entity_type='LEAD' then v.lead_id else v.deal_id end asc,
    v.id asc
  limit least(greatest(coalesce(p_limit,50),1),101);
end;
$$;

revoke all on public.crm_custom_field_definitions
  from public, anon, authenticated, service_role;
revoke all on public.crm_custom_field_options
  from public, anon, authenticated, service_role;
revoke all on public.crm_custom_field_values
  from public, anon, authenticated, service_role;

grant select, insert, update on public.crm_custom_field_definitions to authenticated;
grant select, insert, update on public.crm_custom_field_options to authenticated;
grant select, insert, update on public.crm_custom_field_values to authenticated;

revoke all on function public.crm_custom_field_is_schema_manager(uuid)
  from public, anon, service_role;
grant execute on function public.crm_custom_field_is_schema_manager(uuid)
  to authenticated;

revoke all on function public.crm_custom_field_can_read_definition(uuid,uuid)
  from public, anon, service_role;
grant execute on function public.crm_custom_field_can_read_definition(uuid,uuid)
  to authenticated;

revoke all on function public.crm_custom_field_can_read_value(uuid,uuid,uuid,uuid)
  from public, anon, service_role;
grant execute on function public.crm_custom_field_can_read_value(uuid,uuid,uuid,uuid)
  to authenticated;

revoke all on function public.crm_custom_field_can_manage_value(uuid,uuid,uuid,uuid)
  from public, anon, service_role;
grant execute on function public.crm_custom_field_can_manage_value(uuid,uuid,uuid,uuid)
  to authenticated;

revoke all on function public.get_crm_custom_field_definitions(
  uuid,text,boolean,integer,text,uuid
) from public, anon, service_role;
grant execute on function public.get_crm_custom_field_definitions(
  uuid,text,boolean,integer,text,uuid
) to authenticated;

revoke all on function public.get_crm_custom_field_values(
  uuid,text,uuid,boolean,integer,uuid,uuid
) from public, anon, service_role;
grant execute on function public.get_crm_custom_field_values(
  uuid,text,uuid,boolean,integer,uuid,uuid
) to authenticated;

revoke all on function public.find_crm_entities_by_custom_field_exact(
  uuid,uuid,text,numeric,boolean,date,timestamptz,numeric,text,text,integer,uuid
) from public, anon, service_role;
grant execute on function public.find_crm_entities_by_custom_field_exact(
  uuid,uuid,text,numeric,boolean,date,timestamptz,numeric,text,text,integer,uuid
) to authenticated;

revoke all on function public.guard_crm_custom_field_definition()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_crm_custom_field_option()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_crm_custom_field_value()
  from public, anon, authenticated, service_role;
revoke all on function public.audit_crm_custom_field_definition()
  from public, anon, authenticated, service_role;
revoke all on function public.audit_crm_custom_field_option()
  from public, anon, authenticated, service_role;
revoke all on function public.audit_crm_custom_field_value()
  from public, anon, authenticated, service_role;
