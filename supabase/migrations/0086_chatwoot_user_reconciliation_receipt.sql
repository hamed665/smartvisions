-- 0086: server-recorded Chatwoot User identity receipts.
-- External User create/update/reconciliation remains in server-only TypeScript.
-- Authenticated callers cannot declare an external Chatwoot User ID as verified.

create table if not exists public.chatwoot_user_reconciliation_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  user_mapping_id uuid not null references public.chatwoot_user_mappings(id) on delete restrict,
  mapping_version integer not null check (mapping_version >= 1),
  smart_user_id uuid not null references auth.users(id) on delete restrict,
  observed_chatwoot_user_id integer not null check (observed_chatwoot_user_id > 0),
  observed_email text not null check (
    length(trim(observed_email)) between 3 and 320
    and observed_email = lower(trim(observed_email))
  ),
  request_key text not null check (length(trim(request_key)) between 1 and 200),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),

  unique (organization_id, request_key),

  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict,
  check (expires_at > observed_at)
);

create index if not exists chatwoot_user_reconciliation_receipts_mapping_idx
  on public.chatwoot_user_reconciliation_receipts(
    user_mapping_id, mapping_version, observed_at desc
  );

alter table public.chatwoot_user_reconciliation_receipts enable row level security;

create or replace function public.enforce_chatwoot_user_receipt_immutable()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Chatwoot User reconciliation receipts are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists chatwoot_user_reconciliation_receipts_immutable
  on public.chatwoot_user_reconciliation_receipts;
create trigger chatwoot_user_reconciliation_receipts_immutable
before insert or update or delete
on public.chatwoot_user_reconciliation_receipts
for each row execute function public.enforce_chatwoot_user_receipt_immutable();

create or replace function public.record_chatwoot_user_reconciliation(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_user_mapping_id uuid,
  p_expected_mapping_version integer,
  p_smart_user_id uuid,
  p_observed_chatwoot_user_id integer,
  p_observed_email text,
  p_request_key text
)
returns public.chatwoot_user_reconciliation_receipts
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
declare
  v_email text := lower(trim(coalesce(p_observed_email, '')));
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_mapping public.chatwoot_user_mappings%rowtype;
  v_payload_hash text;
  v_existing public.chatwoot_user_reconciliation_receipts%rowtype;
  v_created public.chatwoot_user_reconciliation_receipts%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if p_expected_mapping_version is null
     or p_expected_mapping_version < 1
     or p_observed_chatwoot_user_id is null
     or p_observed_chatwoot_user_id <= 0
     or length(v_email) not between 3 and 320
     or position('@' in v_email) <= 1
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Chatwoot User reconciliation receipt payload';
  end if;

  if not exists (
    select 1
    from public.tenant_businesses b
    join public.brands br
      on br.organization_id = b.organization_id
     and br.id = b.brand_id
    where b.organization_id = p_organization_id
      and b.id = p_tenant_business_id
      and b.status = 'ACTIVE'
      and br.status = 'ACTIVE'
  ) then
    raise exception 'ACTIVE tenant Business lineage required for User receipt';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_smart_user_id
  ) then
    raise exception 'Smart user is not an Organization member for User receipt';
  end if;

  select *
    into v_mapping
    from public.chatwoot_user_mappings
   where id = p_user_mapping_id
     and smart_user_id = p_smart_user_id;

  if not found then
    raise exception 'Chatwoot User mapping not found for receipt';
  end if;

  if v_mapping.version <> p_expected_mapping_version
     or v_mapping.status = 'ARCHIVED'
  then
    raise exception 'Chatwoot User mapping version/state changed before receipt';
  end if;

  if v_mapping.chatwoot_user_id is not null
     and v_mapping.chatwoot_user_id <> p_observed_chatwoot_user_id
  then
    raise exception 'Chatwoot User identity drift detected by receipt';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'userMappingId', p_user_mapping_id,
    'mappingVersion', p_expected_mapping_version,
    'smartUserId', p_smart_user_id,
    'observedChatwootUserId', p_observed_chatwoot_user_id,
    'observedEmail', v_email
  )::text, 'sha256'), 'hex');

  select *
    into v_existing
    from public.chatwoot_user_reconciliation_receipts
   where organization_id = p_organization_id
     and request_key = v_request_key;

  if found then
    if v_existing.payload_hash <> v_payload_hash then
      raise exception 'User reconciliation request key already used with different payload';
    end if;
    return v_existing;
  end if;

  insert into public.chatwoot_user_reconciliation_receipts(
    organization_id,
    tenant_business_id,
    user_mapping_id,
    mapping_version,
    smart_user_id,
    observed_chatwoot_user_id,
    observed_email,
    request_key,
    payload_hash,
    observed_at,
    expires_at
  ) values (
    p_organization_id,
    p_tenant_business_id,
    p_user_mapping_id,
    p_expected_mapping_version,
    p_smart_user_id,
    p_observed_chatwoot_user_id,
    v_email,
    v_request_key,
    v_payload_hash,
    v_now,
    v_now + interval '5 minutes'
  )
  returning * into v_created;

  return v_created;
end;
$$;

create or replace function private.chatwoot_user_receipt_evidence(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_user_mapping_id uuid,
  p_mapping_version integer,
  p_smart_user_id uuid,
  p_receipt_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_receipt public.chatwoot_user_reconciliation_receipts%rowtype;
begin
  if auth.uid() is null
     or not exists (
       select 1
       from public.organization_members owner_member
       where owner_member.organization_id = p_organization_id
         and owner_member.user_id = auth.uid()
         and owner_member.role = 'OWNER'
     )
  then
    raise exception 'current Organization OWNER required for User reconciliation evidence';
  end if;

  if not exists (
    select 1
    from public.tenant_businesses b
    join public.brands br
      on br.organization_id = b.organization_id
     and br.id = b.brand_id
    where b.organization_id = p_organization_id
      and b.id = p_tenant_business_id
      and b.status = 'ACTIVE'
      and br.status = 'ACTIVE'
  ) then
    raise exception 'ACTIVE tenant Business lineage required for User evidence';
  end if;

  select *
    into v_receipt
    from public.chatwoot_user_reconciliation_receipts r
   where r.id = p_receipt_id
     and r.organization_id = p_organization_id
     and r.tenant_business_id = p_tenant_business_id
     and r.user_mapping_id = p_user_mapping_id
     and r.mapping_version = p_mapping_version
     and r.smart_user_id = p_smart_user_id
     and r.expires_at >= now();

  if not found then
    raise exception 'fresh Chatwoot User reconciliation receipt not found';
  end if;

  return jsonb_build_object(
    'observed_chatwoot_user_id', v_receipt.observed_chatwoot_user_id,
    'observed_email', v_receipt.observed_email,
    'observed_at', v_receipt.observed_at
  );
end;
$$;

create or replace function public.activate_chatwoot_user_mapping_verified(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_smart_user_id uuid,
  p_mapping_id uuid,
  p_expected_version integer,
  p_receipt_id uuid,
  p_request_key text
)
returns public.chatwoot_user_mappings
language plpgsql
security invoker
set search_path = public, auth, private, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_current public.chatwoot_user_mappings%rowtype;
  v_updated public.chatwoot_user_mappings%rowtype;
  v_evidence jsonb;
  v_observed_user_id integer;
  v_payload_hash text;
  v_claim record;
  v_canonical_role text;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot User mapping mutation not permitted';
  end if;

  if p_expected_version is null
     or p_expected_version < 1
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid verified Chatwoot User activation payload';
  end if;

  v_canonical_role := private.chatwoot_business_wide_role(
    p_organization_id,
    p_tenant_business_id,
    p_smart_user_id
  );

  if v_canonical_role = 'VIEWER' then
    raise exception 'VIEWER does not require a Chatwoot User mapping';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_current
    from public.chatwoot_user_mappings
   where id = p_mapping_id
     and smart_user_id = p_smart_user_id
   for update;

  if not found then
    raise exception 'Chatwoot User mapping not found';
  end if;

  v_evidence := private.chatwoot_user_receipt_evidence(
    p_organization_id,
    p_tenant_business_id,
    p_mapping_id,
    p_expected_version,
    p_smart_user_id,
    p_receipt_id
  );

  v_observed_user_id := (v_evidence->>'observed_chatwoot_user_id')::integer;

  if v_current.chatwoot_user_id is not null
     and v_current.chatwoot_user_id <> v_observed_user_id
  then
    raise exception 'Chatwoot User ID cannot be replaced in-place';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'smartUserId', p_smart_user_id,
    'mappingId', p_mapping_id,
    'expectedVersion', p_expected_version,
    'receiptId', p_receipt_id,
    'chatwootUserId', v_observed_user_id
  )::text, 'sha256'), 'hex');

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'SET_USER_MAPPING_STATE',
      'CHATWOOT_USER_MAPPING',
      p_mapping_id,
      p_expected_version + 1,
      v_payload_hash
    );

  if not v_claim.is_new then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_current;
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'Chatwoot User mapping version conflict; current version is %',
      v_current.version;
  end if;

  update public.chatwoot_user_mappings
     set chatwoot_user_id = v_observed_user_id,
         status = 'ACTIVE',
         version = version + 1,
         last_request_key = v_request_key,
         last_verified_at = (v_evidence->>'observed_at')::timestamptz,
         last_error_code = null,
         updated_by_user_id = v_actor
   where id = p_mapping_id
     and smart_user_id = p_smart_user_id
     and version = p_expected_version
  returning * into v_updated;

  if not found then
    raise exception 'Chatwoot User mapping changed concurrently';
  end if;

  insert into public.audit_logs(
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
    'USER',
    v_actor::text,
    'CHATWOOT_USER_MAPPING_ACTIVATED_VERIFIED',
    'chatwoot_user_mappings',
    p_mapping_id::text,
    jsonb_build_object(
      'status', v_current.status,
      'version', v_current.version,
      'chatwoot_user_id', v_current.chatwoot_user_id
    ),
    jsonb_build_object(
      'status', v_updated.status,
      'version', v_updated.version,
      'chatwoot_user_id', v_updated.chatwoot_user_id,
      'last_verified_at', v_updated.last_verified_at,
      'tenant_business_id', p_tenant_business_id
    )
  );

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_updated;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

create or replace function public.mark_chatwoot_user_mapping_degraded(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_smart_user_id uuid,
  p_mapping_id uuid,
  p_expected_version integer,
  p_last_error_code text,
  p_request_key text
)
returns public.chatwoot_user_mappings
language plpgsql
security invoker
set search_path = public, auth, private, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_error_code text := upper(trim(coalesce(p_last_error_code, '')));
  v_current public.chatwoot_user_mappings%rowtype;
  v_updated public.chatwoot_user_mappings%rowtype;
  v_payload_hash text;
  v_claim record;
  v_canonical_role text;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot User mapping mutation not permitted';
  end if;

  if p_expected_version is null
     or p_expected_version < 1
     or length(v_error_code) not between 1 and 120
     or v_error_code !~ '^[A-Z0-9_:.-]+$'
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Chatwoot User degraded payload';
  end if;

  v_canonical_role := private.chatwoot_business_wide_role(
    p_organization_id,
    p_tenant_business_id,
    p_smart_user_id
  );

  if v_canonical_role = 'VIEWER' then
    raise exception 'VIEWER does not require a Chatwoot User mapping';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_current
    from public.chatwoot_user_mappings
   where id = p_mapping_id
     and smart_user_id = p_smart_user_id
   for update;

  if not found then
    raise exception 'Chatwoot User mapping not found';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'smartUserId', p_smart_user_id,
    'mappingId', p_mapping_id,
    'expectedVersion', p_expected_version,
    'status', 'DEGRADED',
    'lastErrorCode', v_error_code
  )::text, 'sha256'), 'hex');

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'SET_USER_MAPPING_STATE',
      'CHATWOOT_USER_MAPPING',
      p_mapping_id,
      p_expected_version + 1,
      v_payload_hash
    );

  if not v_claim.is_new then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_current;
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'Chatwoot User mapping version conflict; current version is %',
      v_current.version;
  end if;

  update public.chatwoot_user_mappings
     set status = 'DEGRADED',
         version = version + 1,
         last_request_key = v_request_key,
         last_error_code = v_error_code,
         updated_by_user_id = v_actor
   where id = p_mapping_id
     and smart_user_id = p_smart_user_id
     and version = p_expected_version
  returning * into v_updated;

  if not found then
    raise exception 'Chatwoot User mapping changed concurrently';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_updated;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

-- Caller-declared external User identity from 0084 is no longer executable.
revoke all on function public.set_chatwoot_user_mapping_state(
  uuid, uuid, uuid, uuid, integer, text, integer, text, text
) from public, anon, authenticated, service_role;

revoke all on table public.chatwoot_user_reconciliation_receipts
  from public, anon, authenticated, service_role;
grant select, insert on table public.chatwoot_user_reconciliation_receipts
  to service_role;

revoke all on function public.enforce_chatwoot_user_receipt_immutable()
  from public, anon, authenticated, service_role;

revoke all on function public.record_chatwoot_user_reconciliation(
  uuid, uuid, uuid, integer, uuid, integer, text, text
) from public, anon, authenticated;
grant execute on function public.record_chatwoot_user_reconciliation(
  uuid, uuid, uuid, integer, uuid, integer, text, text
) to service_role;

revoke all on function private.chatwoot_user_receipt_evidence(
  uuid, uuid, uuid, integer, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function private.chatwoot_user_receipt_evidence(
  uuid, uuid, uuid, integer, uuid, uuid
) to authenticated;

revoke all on function public.activate_chatwoot_user_mapping_verified(
  uuid, uuid, uuid, uuid, integer, uuid, text
) from public, anon, service_role;
grant execute on function public.activate_chatwoot_user_mapping_verified(
  uuid, uuid, uuid, uuid, integer, uuid, text
) to authenticated;

revoke all on function public.mark_chatwoot_user_mapping_degraded(
  uuid, uuid, uuid, uuid, integer, text, text
) from public, anon, service_role;
grant execute on function public.mark_chatwoot_user_mapping_degraded(
  uuid, uuid, uuid, uuid, integer, text, text
) to authenticated;
