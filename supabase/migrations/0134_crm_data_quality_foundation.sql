-- 0134: CRM data-quality foundation over existing canonical CRM authorities.
--
-- Scope:
-- - read-only deterministic quality scan over existing People/Identity/Business truth;
-- - bounded, atomic verified Contact import into the existing identity/person graph;
-- - idempotent import receipts that contain counts/hash only, never raw imported PII;
-- - no automatic merges, fuzzy matching, second CRM store, or destructive retention.
--
-- Retention execution remains policy-gated until an Organization-approved retention
-- contract exists. This slice intentionally avoids irreversible deletion.

create table if not exists public.crm_data_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_key text not null,
  content_hash text not null,
  row_count integer not null,
  created_people_count integer not null default 0,
  linked_relationship_count integer not null default 0,
  status text not null default 'APPLIED',
  requested_by_user_id uuid not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique (organization_id, request_key),
  foreign key (organization_id, requested_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  check (length(request_key) between 1 and 200),
  check (length(content_hash) = 32),
  check (row_count between 1 and 100),
  check (created_people_count between 0 and row_count),
  check (linked_relationship_count between 0 and row_count),
  check (status in ('APPLIED')),
  check (jsonb_typeof(summary) = 'object'),
  check (octet_length(summary::text) <= 8192)
);

create index if not exists crm_data_import_batches_org_created_idx
  on public.crm_data_import_batches(organization_id, created_at desc, id);

create index if not exists crm_data_import_batches_requested_by_idx
  on public.crm_data_import_batches(requested_by_user_id);

alter table public.crm_data_import_batches enable row level security;

drop policy if exists crm_data_import_batches_member_read on public.crm_data_import_batches;
create policy crm_data_import_batches_member_read
on public.crm_data_import_batches
for select
to authenticated
using (public.is_org_member(organization_id));

revoke all on public.crm_data_import_batches from public, anon, authenticated, service_role;
grant select on public.crm_data_import_batches to authenticated;
grant select, insert on public.crm_data_import_batches to service_role;

create or replace function public.get_crm_data_quality_summary(
  p_organization_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $crm_dq_summary$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 250);
  v_result jsonb;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'CRM data-quality read requires Organization membership';
  end if;

  with
  person_conflicts as (
    select
      i.id as entity_id,
      'IDENTITY_PERSON_CONFLICT'::text as issue_type,
      'HIGH'::text as severity,
      jsonb_build_object(
        'identityId', i.id,
        'identityType', i.identity_type,
        'personCount', count(distinct l.person_id)
      ) as detail,
      max(l.updated_at) as detected_at
    from public.crm_identities i
    join public.crm_person_identity_links l
      on l.organization_id = i.organization_id
     and l.identity_id = i.id
     and l.status <> 'RETIRED'
    join public.crm_people p
      on p.organization_id = l.organization_id
     and p.id = l.person_id
    where i.organization_id = p_organization_id
      and i.status = 'ACTIVE'
      and p.status = 'ACTIVE'
    group by i.id, i.identity_type
    having count(distinct l.person_id) > 1
  ),
  business_conflicts as (
    select
      i.id as entity_id,
      'IDENTITY_BUSINESS_CONFLICT'::text as issue_type,
      'HIGH'::text as severity,
      jsonb_build_object(
        'identityId', i.id,
        'identityType', i.identity_type,
        'businessCount', count(distinct l.business_id)
      ) as detail,
      max(l.updated_at) as detected_at
    from public.crm_identities i
    join public.crm_identity_links l
      on l.organization_id = i.organization_id
     and l.identity_id = i.id
     and l.status <> 'RETIRED'
    where i.organization_id = p_organization_id
      and i.status = 'ACTIVE'
    group by i.id, i.identity_type
    having count(distinct l.business_id) > 1
       or bool_or(l.status = 'CONFLICTED')
  ),
  people_without_identity as (
    select
      p.id as entity_id,
      'PERSON_WITHOUT_ACTIVE_IDENTITY'::text as issue_type,
      'HIGH'::text as severity,
      jsonb_build_object('personId', p.id) as detail,
      p.updated_at as detected_at
    from public.crm_people p
    where p.organization_id = p_organization_id
      and p.status = 'ACTIVE'
      and not exists (
        select 1
        from public.crm_person_identity_links l
        join public.crm_identities i
          on i.organization_id = l.organization_id
         and i.id = l.identity_id
         and i.status = 'ACTIVE'
        where l.organization_id = p.organization_id
          and l.person_id = p.id
          and l.status = 'ACTIVE'
      )
  ),
  malformed_identity as (
    select
      i.id as entity_id,
      'IDENTITY_NORMALIZATION_MISMATCH'::text as issue_type,
      'MEDIUM'::text as severity,
      jsonb_build_object(
        'identityId', i.id,
        'identityType', i.identity_type,
        'valueFingerprint', md5(i.normalized_value)
      ) as detail,
      i.updated_at as detected_at
    from public.crm_identities i
    where i.organization_id = p_organization_id
      and i.status = 'ACTIVE'
      and (
        (i.identity_type = 'EMAIL' and (
          i.normalized_value <> lower(trim(i.normalized_value))
          or i.normalized_value !~ '^[^[:space:]@]+@[^[:space:]@]+$'
        ))
        or
        (i.identity_type in ('PHONE','WHATSAPP') and (
          i.normalized_value !~ '^[0-9]{8,32}$'
        ))
        or
        (i.identity_type = 'INSTAGRAM' and (
          i.normalized_value <> lower(trim(i.normalized_value))
          or i.normalized_value !~ '^[a-z0-9._]{1,64}$'
        ))
      )
  ),
  business_email_duplicates as (
    select
      min(b.id) as entity_id,
      'BUSINESS_EMAIL_DUPLICATE'::text as issue_type,
      'MEDIUM'::text as severity,
      jsonb_build_object(
        'businessIds', jsonb_agg(b.id order by b.id),
        'valueFingerprint', md5(lower(trim(b.email))),
        'count', count(*)
      ) as detail,
      max(b.updated_at) as detected_at
    from public.businesses b
    where b.organization_id = p_organization_id
      and nullif(trim(b.email), '') is not null
    group by lower(trim(b.email))
    having count(*) > 1
  ),
  business_phone_duplicates as (
    select
      min(b.id) as entity_id,
      'BUSINESS_PHONE_DUPLICATE'::text as issue_type,
      'MEDIUM'::text as severity,
      jsonb_build_object(
        'businessIds', jsonb_agg(b.id order by b.id),
        'valueFingerprint', md5(regexp_replace(b.phone, '[^0-9]', '', 'g')),
        'count', count(*)
      ) as detail,
      max(b.updated_at) as detected_at
    from public.businesses b
    where b.organization_id = p_organization_id
      and length(regexp_replace(coalesce(b.phone, ''), '[^0-9]', '', 'g')) >= 8
    group by regexp_replace(b.phone, '[^0-9]', '', 'g')
    having count(*) > 1
  ),
  business_domain_duplicates as (
    select
      min(b.id) as entity_id,
      'BUSINESS_DOMAIN_DUPLICATE'::text as issue_type,
      'LOW'::text as severity,
      jsonb_build_object(
        'businessIds', jsonb_agg(b.id order by b.id),
        'domainFingerprint', md5(lower(trim(to_jsonb(b) ->> 'dedupe_domain'))),
        'count', count(*)
      ) as detail,
      max(b.updated_at) as detected_at
    from public.businesses b
    where b.organization_id = p_organization_id
      and nullif(trim(to_jsonb(b) ->> 'dedupe_domain'), '') is not null
    group by lower(trim(to_jsonb(b) ->> 'dedupe_domain'))
    having count(*) > 1
  ),
  issues as (
    select * from person_conflicts
    union all select * from business_conflicts
    union all select * from people_without_identity
    union all select * from malformed_identity
    union all select * from business_email_duplicates
    union all select * from business_phone_duplicates
    union all select * from business_domain_duplicates
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'people', (select count(*) from public.crm_people where organization_id = p_organization_id),
      'activePeople', (select count(*) from public.crm_people where organization_id = p_organization_id and status = 'ACTIVE'),
      'identities', (select count(*) from public.crm_identities where organization_id = p_organization_id),
      'activeIdentities', (select count(*) from public.crm_identities where organization_id = p_organization_id and status = 'ACTIVE'),
      'businesses', (select count(*) from public.businesses where organization_id = p_organization_id),
      'identityConflicts', (
        select count(*) from issues
        where issue_type in ('IDENTITY_PERSON_CONFLICT','IDENTITY_BUSINESS_CONFLICT')
      ),
      'highSeverityIssues', (select count(*) from issues where severity = 'HIGH'),
      'mediumSeverityIssues', (select count(*) from issues where severity = 'MEDIUM'),
      'lowSeverityIssues', (select count(*) from issues where severity = 'LOW')
    ),
    'issues', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entityId', entity_id,
          'issueType', issue_type,
          'severity', severity,
          'detail', detail,
          'detectedAt', detected_at
        )
        order by
          case severity when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end,
          detected_at desc,
          entity_id
      )
      from (
        select *
        from issues
        order by
          case severity when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end,
          detected_at desc,
          entity_id
        limit v_limit
      ) limited
    ), '[]'::jsonb),
    'retention', jsonb_build_object(
      'status', 'DEFERRED_WITH_REASON',
      'reason', 'Irreversible CRM retention/purge requires an Organization-approved legal/business retention contract; no automatic delete is permitted by this slice.'
    )
  )
  into v_result;

  return v_result;
end;
$crm_dq_summary$;

create or replace function public.apply_crm_verified_contact_import(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_request_key text,
  p_rows jsonb
)
returns table (
  batch_id uuid,
  imported_rows integer,
  created_people integer,
  linked_relationships integer,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $crm_dq_import$
declare
  v_actor_role text;
  v_row_count integer;
  v_content_hash text;
  v_batch_id uuid := gen_random_uuid();
  v_existing public.crm_data_import_batches%rowtype;
  v_row jsonb;
  v_client_key text;
  v_business_id uuid;
  v_identity_type text;
  v_normalized_value text;
  v_display_value text;
  v_display_name text;
  v_relationship_type text;
  v_job_title text;
  v_identity_id uuid;
  v_ambiguous boolean;
  v_person_id uuid;
  v_created boolean;
  v_relationship_id uuid;
  v_created_people integer := 0;
  v_linked_relationships integer := 0;
begin
  if current_user <> 'service_role' then
    raise exception 'CRM verified import requires the trusted server boundary';
  end if;

  select role into v_actor_role
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = p_actor_user_id;

  if v_actor_role is null or v_actor_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'CRM verified import requires OWNER, ADMIN or SALES_MANAGER';
  end if;

  if nullif(trim(p_request_key), '') is null or length(trim(p_request_key)) > 200 then
    raise exception 'CRM verified import request key is invalid';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'CRM verified import rows must be a JSON array';
  end if;

  v_row_count := jsonb_array_length(p_rows);
  if v_row_count < 1 or v_row_count > 100 then
    raise exception 'CRM verified import supports 1 to 100 rows per batch';
  end if;
  if octet_length(p_rows::text) > 262144 then
    raise exception 'CRM verified import payload exceeds 256 KiB';
  end if;

  v_content_hash := md5(p_rows::text);

  select *
    into v_existing
  from public.crm_data_import_batches
  where organization_id = p_organization_id
    and request_key = trim(p_request_key)
  for update;

  if found then
    if v_existing.content_hash <> v_content_hash then
      raise exception 'CRM verified import request key was reused with different content';
    end if;
    return query select
      v_existing.id,
      v_existing.row_count,
      v_existing.created_people_count,
      v_existing.linked_relationship_count,
      true;
    return;
  end if;

  if exists (
    select 1
    from (
      select
        nullif(trim(value ->> 'clientRowKey'), '') as client_row_key,
        count(*) as row_count
      from jsonb_array_elements(p_rows)
      group by nullif(trim(value ->> 'clientRowKey'), '')
    ) keys
    where keys.client_row_key is null or keys.row_count > 1
  ) then
    raise exception 'CRM verified import clientRowKey values must be unique and non-empty';
  end if;

  if exists (
    select 1
    from (
      select
        nullif(value ->> 'businessId', '') as business_id,
        upper(trim(coalesce(value ->> 'identityType', ''))) as identity_type,
        trim(coalesce(value ->> 'normalizedValue', '')) as normalized_value,
        count(*) as row_count
      from jsonb_array_elements(p_rows)
      group by
        nullif(value ->> 'businessId', ''),
        upper(trim(coalesce(value ->> 'identityType', ''))),
        trim(coalesce(value ->> 'normalizedValue', ''))
    ) duplicates
    where duplicates.row_count > 1
  ) then
    raise exception 'CRM verified import contains duplicate Business/identity rows';
  end if;

  for v_row in
    select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'CRM verified import row must be an object';
    end if;

    v_client_key := nullif(trim(v_row ->> 'clientRowKey'), '');
    if v_client_key is null or length(v_client_key) > 120 then
      raise exception 'CRM verified import clientRowKey is invalid';
    end if;

    begin
      v_business_id := nullif(v_row ->> 'businessId', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'CRM verified import businessId is invalid';
    end;
    if v_business_id is null then
      raise exception 'CRM verified import businessId is required';
    end if;

    if not exists (
      select 1 from public.businesses
      where organization_id = p_organization_id and id = v_business_id
    ) then
      raise exception 'CRM verified import Business is not in the Organization';
    end if;

    v_identity_type := upper(trim(coalesce(v_row ->> 'identityType', '')));
    v_normalized_value := nullif(trim(v_row ->> 'normalizedValue'), '');
    v_display_value := nullif(trim(v_row ->> 'displayValue'), '');
    v_display_name := nullif(trim(v_row ->> 'displayName'), '');
    v_relationship_type := upper(trim(coalesce(v_row ->> 'relationshipType', 'CONTACT')));
    v_job_title := nullif(trim(v_row ->> 'jobTitle'), '');

    if v_identity_type not in ('EMAIL','PHONE','WHATSAPP','INSTAGRAM') then
      raise exception 'CRM verified import identityType is invalid';
    end if;
    if v_normalized_value is null or length(v_normalized_value) > 512 then
      raise exception 'CRM verified import normalizedValue is invalid';
    end if;
    if v_identity_type = 'EMAIL' and (
      v_normalized_value <> lower(v_normalized_value)
      or v_normalized_value !~ '^[^[:space:]@]+@[^[:space:]@]+$'
    ) then
      raise exception 'CRM verified import EMAIL value is not canonical';
    end if;
    if v_identity_type in ('PHONE','WHATSAPP')
       and v_normalized_value !~ '^[0-9]{8,32}$' then
      raise exception 'CRM verified import PHONE/WHATSAPP value is not canonical';
    end if;
    if v_identity_type = 'INSTAGRAM' and (
      v_normalized_value <> lower(v_normalized_value)
      or v_normalized_value !~ '^[a-z0-9._]{1,64}$'
    ) then
      raise exception 'CRM verified import INSTAGRAM value is not canonical';
    end if;

    if v_display_value is not null and length(v_display_value) > 512 then
      raise exception 'CRM verified import displayValue is too long';
    end if;
    if v_display_name is not null and length(v_display_name) > 200 then
      raise exception 'CRM verified import displayName is too long';
    end if;
    if v_relationship_type not in (
      'CONTACT','OWNER','EMPLOYEE','DECISION_MAKER','BILLING_CONTACT','OTHER'
    ) then
      raise exception 'CRM verified import relationshipType is invalid';
    end if;
    if v_job_title is not null and length(v_job_title) > 200 then
      raise exception 'CRM verified import jobTitle is too long';
    end if;

  end loop;

  -- Validation has completed for the complete batch before canonical mutation.
  -- Any later exception rolls back the entire function call atomically.
  for v_row in
    select value from jsonb_array_elements(p_rows)
  loop
    v_client_key := trim(v_row ->> 'clientRowKey');
    v_business_id := (v_row ->> 'businessId')::uuid;
    v_identity_type := upper(trim(v_row ->> 'identityType'));
    v_normalized_value := trim(v_row ->> 'normalizedValue');
    v_display_value := nullif(trim(v_row ->> 'displayValue'), '');
    v_display_name := nullif(trim(v_row ->> 'displayName'), '');
    v_relationship_type := upper(trim(coalesce(v_row ->> 'relationshipType', 'CONTACT')));
    v_job_title := nullif(trim(v_row ->> 'jobTitle'), '');

    select resolved_identity_id, ambiguous
      into v_identity_id, v_ambiguous
    from public.record_crm_business_identity(
      p_organization_id,
      v_business_id,
      v_identity_type,
      v_normalized_value,
      coalesce(v_display_value, v_normalized_value),
      'IMPORT',
      'dq-import:' || v_batch_id::text || ':' || v_client_key,
      'VERIFIED',
      jsonb_build_object(
        'import_batch_id', v_batch_id::text,
        'client_row_key', v_client_key,
        'verified_import', true
      )
    );

    if v_ambiguous then
      raise exception 'CRM verified import identity is ambiguous across Businesses';
    end if;

    select resolved_person_id, created, resolved_relationship_id
      into v_person_id, v_created, v_relationship_id
    from public.create_or_resolve_crm_person_from_verified_identity(
      p_organization_id,
      p_actor_user_id,
      v_identity_id,
      v_display_name,
      'IMPORT_VERIFIED',
      'dq-import:' || v_batch_id::text || ':' || v_client_key,
      jsonb_build_object(
        'import_batch_id', v_batch_id::text,
        'client_row_key', v_client_key,
        'verified_import', true
      ),
      v_business_id,
      v_relationship_type,
      v_job_title,
      'IMPORT_VERIFIED',
      'dq-import:' || v_batch_id::text || ':' || v_client_key,
      jsonb_build_object(
        'import_batch_id', v_batch_id::text,
        'client_row_key', v_client_key,
        'verified_import', true
      )
    );

    if v_created then
      v_created_people := v_created_people + 1;
    end if;
    if v_relationship_id is not null then
      v_linked_relationships := v_linked_relationships + 1;
    end if;
  end loop;

  insert into public.crm_data_import_batches(
    id,
    organization_id,
    request_key,
    content_hash,
    row_count,
    created_people_count,
    linked_relationship_count,
    status,
    requested_by_user_id,
    summary,
    completed_at
  ) values (
    v_batch_id,
    p_organization_id,
    trim(p_request_key),
    v_content_hash,
    v_row_count,
    v_created_people,
    v_linked_relationships,
    'APPLIED',
    p_actor_user_id,
    jsonb_build_object(
      'row_count', v_row_count,
      'created_people_count', v_created_people,
      'linked_relationship_count', v_linked_relationships,
      'raw_pii_stored', false
    ),
    now()
  );

  insert into public.audit_logs(
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    correlation_id
  ) values (
    p_organization_id,
    'USER',
    p_actor_user_id::text,
    'CRM_DATA_VERIFIED_IMPORT_APPLIED',
    'crm_data_import_batches',
    v_batch_id::text,
    null,
    jsonb_build_object(
      'row_count', v_row_count,
      'created_people_count', v_created_people,
      'linked_relationship_count', v_linked_relationships,
      'request_key_present', true,
      'content_hash_present', true
    ),
    'dbtx:' || txid_current()::text
  );

  return query select
    v_batch_id,
    v_row_count,
    v_created_people,
    v_linked_relationships,
    false;
end;
$crm_dq_import$;

revoke all on function public.get_crm_data_quality_summary(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_crm_data_quality_summary(uuid, integer)
  to authenticated;

revoke all on function public.apply_crm_verified_contact_import(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_crm_verified_contact_import(uuid, uuid, text, jsonb)
  to service_role;

comment on table public.crm_data_import_batches is
  'Idempotency/audit receipt for bounded verified CRM Contact imports. Stores counts/hash only, never raw imported PII.';
comment on function public.get_crm_data_quality_summary(uuid, integer) is
  'Read-only Organization-scoped deterministic CRM quality scan. It never auto-merges or mutates canonical CRM truth.';
comment on function public.apply_crm_verified_contact_import(uuid, uuid, text, jsonb) is
  'Atomic bounded verified Contact import into existing canonical CRM identity/person/business relationship authorities.';
