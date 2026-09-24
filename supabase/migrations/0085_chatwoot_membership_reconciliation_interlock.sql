-- 0085: server-recorded Chatwoot AccountUser reconciliation receipts and
-- reverse-role removal interlock.
--
-- This migration does not call Chatwoot. External mutation/reconciliation remains
-- in server-only TypeScript. Only service_role may persist verified observations.
-- Authenticated OWNER commands may consume those observations to activate/archive
-- canonical membership mappings. Scope changes that would make a Business-wide
-- role VIEWER fail closed while a live Account membership still exists.

create table if not exists public.chatwoot_account_membership_reconciliation_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  membership_id uuid not null,
  membership_version integer not null check (membership_version >= 1),
  smart_user_id uuid not null references auth.users(id) on delete restrict,
  chatwoot_account_mapping_id uuid not null,
  chatwoot_user_mapping_id uuid not null,
  chatwoot_account_id integer not null check (chatwoot_account_id > 0),
  chatwoot_user_id integer not null check (chatwoot_user_id > 0),
  prior_chatwoot_account_user_id bigint
    check (prior_chatwoot_account_user_id is null or prior_chatwoot_account_user_id > 0),
  observed_presence text not null
    check (observed_presence in ('PRESENT','ABSENT')),
  observed_account_user_id bigint
    check (observed_account_user_id is null or observed_account_user_id > 0),
  observed_role text
    check (observed_role is null or observed_role in ('administrator','agent')),
  request_key text not null check (length(trim(request_key)) between 1 and 200),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),

  unique (organization_id, request_key),

  foreign key (organization_id, membership_id)
    references public.chatwoot_account_memberships(organization_id, id)
    on delete restrict,
  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict,
  foreign key (organization_id, chatwoot_account_mapping_id)
    references public.chatwoot_account_mappings(organization_id, id)
    on delete restrict,
  check (expires_at > observed_at),
  check (
    (
      observed_presence = 'PRESENT'
      and observed_account_user_id is not null
      and observed_role is not null
    )
    or (
      observed_presence = 'ABSENT'
      and observed_account_user_id is null
      and observed_role is null
    )
  )
);

create index if not exists chatwoot_membership_reconciliation_receipts_membership_idx
  on public.chatwoot_account_membership_reconciliation_receipts(
    organization_id, membership_id, membership_version, observed_at desc
  );

alter table public.chatwoot_account_membership_reconciliation_receipts
  enable row level security;

create or replace function public.enforce_chatwoot_membership_receipt_immutable()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Chatwoot membership reconciliation receipts are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists chatwoot_membership_receipts_immutable
  on public.chatwoot_account_membership_reconciliation_receipts;
create trigger chatwoot_membership_receipts_immutable
before insert or update or delete
on public.chatwoot_account_membership_reconciliation_receipts
for each row execute function public.enforce_chatwoot_membership_receipt_immutable();

create or replace function public.record_chatwoot_account_membership_reconciliation(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_membership_id uuid,
  p_expected_membership_version integer,
  p_chatwoot_account_id integer,
  p_chatwoot_user_id integer,
  p_observed_presence text,
  p_observed_account_user_id bigint,
  p_observed_role text,
  p_request_key text
)
returns public.chatwoot_account_membership_reconciliation_receipts
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
declare
  v_presence text := upper(trim(coalesce(p_observed_presence, '')));
  v_role text := nullif(lower(trim(coalesce(p_observed_role, ''))), '');
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_membership public.chatwoot_account_memberships%rowtype;
  v_account public.chatwoot_account_mappings%rowtype;
  v_user public.chatwoot_user_mappings%rowtype;
  v_payload_hash text;
  v_existing public.chatwoot_account_membership_reconciliation_receipts%rowtype;
  v_created public.chatwoot_account_membership_reconciliation_receipts%rowtype;
  v_now timestamptz := now();
begin
  if current_user <> 'service_role' then
    raise exception 'Chatwoot reconciliation receipt is server-only';
  end if;

  if p_expected_membership_version is null
     or p_expected_membership_version < 1
     or p_chatwoot_account_id is null
     or p_chatwoot_account_id <= 0
     or p_chatwoot_user_id is null
     or p_chatwoot_user_id <= 0
     or v_presence not in ('PRESENT','ABSENT')
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Chatwoot reconciliation receipt payload';
  end if;

  if v_presence = 'PRESENT' then
    if p_observed_account_user_id is null
       or p_observed_account_user_id <= 0
       or v_role not in ('administrator','agent')
    then
      raise exception 'PRESENT Chatwoot receipt requires AccountUser ID and role';
    end if;
  else
    if p_observed_account_user_id is not null or v_role is not null then
      raise exception 'ABSENT Chatwoot receipt cannot carry AccountUser identity or role';
    end if;
  end if;

  select *
    into v_membership
    from public.chatwoot_account_memberships
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_membership_id;

  if not found then
    raise exception 'Chatwoot Account membership not found for receipt';
  end if;

  if v_membership.version <> p_expected_membership_version
     or v_membership.status = 'ARCHIVED'
  then
    raise exception 'Chatwoot Account membership version/state changed before receipt';
  end if;

  select *
    into v_account
    from public.chatwoot_account_mappings
   where organization_id = p_organization_id
     and id = v_membership.chatwoot_account_mapping_id
     and tenant_business_id = p_tenant_business_id;

  if not found
     or v_account.status <> 'ACTIVE'
     or v_account.chatwoot_account_id is null
     or v_account.chatwoot_account_id <> p_chatwoot_account_id
  then
    raise exception 'Chatwoot Account mapping identity is not verified for receipt';
  end if;

  select *
    into v_user
    from public.chatwoot_user_mappings
   where id = v_membership.chatwoot_user_mapping_id
     and smart_user_id = v_membership.smart_user_id;

  if not found
     or v_user.status <> 'ACTIVE'
     or v_user.chatwoot_user_id is null
     or v_user.chatwoot_user_id <> p_chatwoot_user_id
  then
    raise exception 'Chatwoot User mapping identity is not verified for receipt';
  end if;

  if v_presence = 'PRESENT'
     and v_membership.chatwoot_account_user_id is not null
     and v_membership.chatwoot_account_user_id <> p_observed_account_user_id
  then
    raise exception 'Chatwoot AccountUser identity drift detected by receipt';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'membershipId', p_membership_id,
    'membershipVersion', p_expected_membership_version,
    'chatwootAccountId', p_chatwoot_account_id,
    'chatwootUserId', p_chatwoot_user_id,
    'priorChatwootAccountUserId', v_membership.chatwoot_account_user_id,
    'observedPresence', v_presence,
    'observedAccountUserId', p_observed_account_user_id,
    'observedRole', v_role
  )::text, 'sha256'), 'hex');

  select *
    into v_existing
    from public.chatwoot_account_membership_reconciliation_receipts
   where organization_id = p_organization_id
     and request_key = v_request_key;

  if found then
    if v_existing.payload_hash <> v_payload_hash then
      raise exception 'reconciliation request key already used with different payload';
    end if;
    return v_existing;
  end if;

  insert into public.chatwoot_account_membership_reconciliation_receipts(
    organization_id,
    tenant_business_id,
    membership_id,
    membership_version,
    smart_user_id,
    chatwoot_account_mapping_id,
    chatwoot_user_mapping_id,
    chatwoot_account_id,
    chatwoot_user_id,
    prior_chatwoot_account_user_id,
    observed_presence,
    observed_account_user_id,
    observed_role,
    request_key,
    payload_hash,
    observed_at,
    expires_at
  ) values (
    p_organization_id,
    p_tenant_business_id,
    p_membership_id,
    p_expected_membership_version,
    v_membership.smart_user_id,
    v_membership.chatwoot_account_mapping_id,
    v_membership.chatwoot_user_mapping_id,
    p_chatwoot_account_id,
    p_chatwoot_user_id,
    v_membership.chatwoot_account_user_id,
    v_presence,
    p_observed_account_user_id,
    v_role,
    v_request_key,
    v_payload_hash,
    v_now,
    v_now + interval '5 minutes'
  )
  returning * into v_created;

  return v_created;
end;
$$;

create or replace function private.chatwoot_membership_receipt_evidence(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_membership_id uuid,
  p_membership_version integer,
  p_receipt_id uuid,
  p_required_presence text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_receipt public.chatwoot_account_membership_reconciliation_receipts%rowtype;
begin
  if auth.uid() is null
     or not exists (
       select 1
       from public.organization_members m
       where m.organization_id = p_organization_id
         and m.user_id = auth.uid()
         and m.role = 'OWNER'
     )
  then
    raise exception 'current Organization OWNER required for Chatwoot reconciliation evidence';
  end if;

  select *
    into v_receipt
    from public.chatwoot_account_membership_reconciliation_receipts r
   where r.id = p_receipt_id
     and r.organization_id = p_organization_id
     and r.tenant_business_id = p_tenant_business_id
     and r.membership_id = p_membership_id
     and r.membership_version = p_membership_version
     and r.observed_presence = upper(trim(p_required_presence))
     and r.expires_at >= now();

  if not found then
    raise exception 'fresh Chatwoot reconciliation receipt not found';
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'observed_presence', v_receipt.observed_presence,
    'observed_account_user_id', v_receipt.observed_account_user_id,
    'observed_role', v_receipt.observed_role,
    'observed_at', v_receipt.observed_at,
    'prior_chatwoot_account_user_id', v_receipt.prior_chatwoot_account_user_id
  ));
end;
$$;

create or replace function public.activate_chatwoot_account_membership_verified(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_membership_id uuid,
  p_expected_version integer,
  p_receipt_id uuid,
  p_request_key text
)
returns public.chatwoot_account_memberships
language plpgsql
security invoker
set search_path = public, auth, private, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_current public.chatwoot_account_memberships%rowtype;
  v_updated public.chatwoot_account_memberships%rowtype;
  v_evidence jsonb;
  v_account_user_id bigint;
  v_observed_role text;
  v_canonical_role text;
  v_chatwoot_role text;
  v_payload_hash text;
  v_claim record;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot Account membership mutation not permitted';
  end if;

  if p_expected_version is null
     or p_expected_version < 1
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid verified Account membership activation payload';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_current
    from public.chatwoot_account_memberships
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_membership_id
   for update;

  if not found then
    raise exception 'Chatwoot Account membership not found';
  end if;

  v_evidence := private.chatwoot_membership_receipt_evidence(
    p_organization_id,
    p_tenant_business_id,
    p_membership_id,
    p_expected_version,
    p_receipt_id,
    'PRESENT'
  );

  v_account_user_id := (v_evidence->>'observed_account_user_id')::bigint;
  v_observed_role := v_evidence->>'observed_role';

  v_canonical_role := private.chatwoot_business_wide_role(
    p_organization_id,
    p_tenant_business_id,
    v_current.smart_user_id
  );

  if v_canonical_role = 'VIEWER' then
    raise exception 'VIEWER cannot have a live Chatwoot Account membership';
  end if;

  v_chatwoot_role := case
    when v_canonical_role = 'OWNER' then 'administrator'
    else 'agent'
  end;

  if v_observed_role <> v_chatwoot_role then
    raise exception 'reconciled external Chatwoot role does not match canonical projection';
  end if;

  if v_current.chatwoot_account_user_id is not null
     and v_current.chatwoot_account_user_id <> v_account_user_id
  then
    raise exception 'Chatwoot AccountUser ID cannot be replaced in-place';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'membershipId', p_membership_id,
    'expectedVersion', p_expected_version,
    'receiptId', p_receipt_id,
    'effectiveSmartRole', v_canonical_role,
    'chatwootRole', v_chatwoot_role
  )::text, 'sha256'), 'hex');

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'SET_ACCOUNT_MEMBERSHIP_STATE',
      'CHATWOOT_ACCOUNT_MEMBERSHIP',
      p_membership_id,
      p_expected_version + 1,
      v_payload_hash
    );

  if not v_claim.is_new then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_current;
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'Chatwoot Account membership version conflict; current version is %',
      v_current.version;
  end if;

  update public.chatwoot_account_memberships
     set chatwoot_account_user_id = v_account_user_id,
         effective_smart_role = v_canonical_role,
         chatwoot_role = v_chatwoot_role,
         status = 'ACTIVE',
         version = version + 1,
         last_request_key = v_request_key,
         last_verified_at = (v_evidence->>'observed_at')::timestamptz,
         last_error_code = null,
         updated_by_user_id = v_actor
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_membership_id
     and version = p_expected_version
  returning * into v_updated;

  if not found then
    raise exception 'Chatwoot Account membership changed concurrently';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_updated;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

create or replace function public.mark_chatwoot_account_membership_degraded(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_membership_id uuid,
  p_expected_version integer,
  p_last_error_code text,
  p_request_key text
)
returns public.chatwoot_account_memberships
language plpgsql
security invoker
set search_path = public, auth, private, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_error_code text := upper(trim(coalesce(p_last_error_code, '')));
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_current public.chatwoot_account_memberships%rowtype;
  v_updated public.chatwoot_account_memberships%rowtype;
  v_payload_hash text;
  v_claim record;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot Account membership mutation not permitted';
  end if;

  if p_expected_version is null
     or p_expected_version < 1
     or length(v_error_code) not between 1 and 120
     or v_error_code !~ '^[A-Z0-9_:.-]+$'
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Account membership degraded payload';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_current
    from public.chatwoot_account_memberships
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_membership_id
   for update;

  if not found then
    raise exception 'Chatwoot Account membership not found';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'membershipId', p_membership_id,
    'expectedVersion', p_expected_version,
    'status', 'DEGRADED',
    'lastErrorCode', v_error_code
  )::text, 'sha256'), 'hex');

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'SET_ACCOUNT_MEMBERSHIP_STATE',
      'CHATWOOT_ACCOUNT_MEMBERSHIP',
      p_membership_id,
      p_expected_version + 1,
      v_payload_hash
    );

  if not v_claim.is_new then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_current;
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'Chatwoot Account membership version conflict; current version is %',
      v_current.version;
  end if;

  update public.chatwoot_account_memberships
     set status = 'DEGRADED',
         version = version + 1,
         last_request_key = v_request_key,
         last_error_code = v_error_code,
         updated_by_user_id = v_actor
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_membership_id
     and version = p_expected_version
  returning * into v_updated;

  if not found then
    raise exception 'Chatwoot Account membership changed concurrently';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_updated;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

create or replace function public.archive_chatwoot_account_membership_verified(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_membership_id uuid,
  p_expected_version integer,
  p_receipt_id uuid,
  p_request_key text
)
returns public.chatwoot_account_memberships
language plpgsql
security invoker
set search_path = public, auth, private, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_current public.chatwoot_account_memberships%rowtype;
  v_updated public.chatwoot_account_memberships%rowtype;
  v_evidence jsonb;
  v_payload_hash text;
  v_claim record;
begin
  if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then
    raise exception 'Chatwoot Account membership mutation not permitted';
  end if;

  if p_expected_version is null
     or p_expected_version < 1
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid verified Account membership archive payload';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '1', true);

  select *
    into v_current
    from public.chatwoot_account_memberships
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_membership_id
   for update;

  if not found then
    raise exception 'Chatwoot Account membership not found';
  end if;

  v_evidence := private.chatwoot_membership_receipt_evidence(
    p_organization_id,
    p_tenant_business_id,
    p_membership_id,
    p_expected_version,
    p_receipt_id,
    'ABSENT'
  );

  if v_current.chatwoot_account_user_id is not null
     and (v_evidence->>'prior_chatwoot_account_user_id')::bigint
         is distinct from v_current.chatwoot_account_user_id
  then
    raise exception 'removal receipt does not match canonical AccountUser identity';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'tenantBusinessId', p_tenant_business_id,
    'membershipId', p_membership_id,
    'expectedVersion', p_expected_version,
    'receiptId', p_receipt_id,
    'status', 'ARCHIVED'
  )::text, 'sha256'), 'hex');

  select *
    into v_claim
    from public.claim_chatwoot_bridge_command(
      p_organization_id,
      v_request_key,
      'SET_ACCOUNT_MEMBERSHIP_STATE',
      'CHATWOOT_ACCOUNT_MEMBERSHIP',
      p_membership_id,
      p_expected_version + 1,
      v_payload_hash
    );

  if not v_claim.is_new then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    return v_current;
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'Chatwoot Account membership version conflict; current version is %',
      v_current.version;
  end if;

  update public.chatwoot_account_memberships
     set status = 'ARCHIVED',
         version = version + 1,
         last_request_key = v_request_key,
         last_verified_at = (v_evidence->>'observed_at')::timestamptz,
         last_error_code = null,
         updated_by_user_id = v_actor
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and id = p_membership_id
     and version = p_expected_version
  returning * into v_updated;

  if not found then
    raise exception 'Chatwoot Account membership changed concurrently';
  end if;

  perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
  return v_updated;
exception
  when others then
    perform set_config('smartvisions.chatwoot_bridge_command', '0', true);
    raise;
end;
$$;

-- Compute whether a BRAND/BUSINESS assignment mutation is safe with respect to
-- live Chatwoot Account-wide memberships. Narrower scopes do not authorize an
-- Account-wide membership and are ignored here.
create or replace function private.member_scope_chatwoot_reduction_safe(
  p_organization_id uuid,
  p_assignment_id uuid,
  p_user_id uuid,
  p_scope_type text,
  p_brand_id uuid,
  p_tenant_business_id uuid,
  p_new_role text,
  p_new_attributes jsonb,
  p_is_delete boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_role text;
  v_business record;
  v_business_role text;
  v_brand_role text;
  v_effective_role text;
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
    raise exception 'current Organization OWNER required for scope interlock';
  end if;

  if p_scope_type not in ('BRAND','BUSINESS') then
    return true;
  end if;

  select m.role
    into v_org_role
    from public.organization_members m
   where m.organization_id = p_organization_id
     and m.user_id = p_user_id;

  if not found then
    raise exception 'target Organization member missing during scope interlock';
  end if;

  if v_org_role = 'OWNER' then
    return true;
  end if;

  for v_business in
    select b.id, b.brand_id
      from public.tenant_businesses b
      join public.brands br
        on br.organization_id = b.organization_id
       and br.id = b.brand_id
     where b.organization_id = p_organization_id
       and b.status = 'ACTIVE'
       and br.status = 'ACTIVE'
       and (
         (p_scope_type = 'BUSINESS' and b.id = p_tenant_business_id)
         or
         (p_scope_type = 'BRAND' and b.brand_id = p_brand_id)
       )
  loop
    v_business_role := null;
    v_brand_role := null;

    if p_scope_type = 'BUSINESS'
       and v_business.id = p_tenant_business_id
       and not p_is_delete
       and coalesce(p_new_attributes, '{}'::jsonb) = '{}'::jsonb
    then
      v_business_role := p_new_role;
    else
      select msa.role
        into v_business_role
        from public.member_scope_assignments msa
       where msa.organization_id = p_organization_id
         and msa.user_id = p_user_id
         and msa.scope_type = 'BUSINESS'
         and msa.tenant_business_id = v_business.id
         and msa.id <> p_assignment_id
         and msa.attributes = '{}'::jsonb
       limit 1;
    end if;

    if p_scope_type = 'BRAND'
       and v_business.brand_id = p_brand_id
       and not p_is_delete
       and coalesce(p_new_attributes, '{}'::jsonb) = '{}'::jsonb
    then
      v_brand_role := p_new_role;
    else
      select msa.role
        into v_brand_role
        from public.member_scope_assignments msa
       where msa.organization_id = p_organization_id
         and msa.user_id = p_user_id
         and msa.scope_type = 'BRAND'
         and msa.brand_id = v_business.brand_id
         and msa.id <> p_assignment_id
         and msa.attributes = '{}'::jsonb
       limit 1;
    end if;

    v_effective_role := coalesce(v_business_role, v_brand_role, v_org_role);

    if v_effective_role = 'VIEWER'
       and exists (
         select 1
           from public.chatwoot_account_memberships cm
          where cm.organization_id = p_organization_id
            and cm.tenant_business_id = v_business.id
            and cm.smart_user_id = p_user_id
            and cm.status in ('PROVISIONING','ACTIVE','DEGRADED')
       )
    then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.enforce_member_scope_chatwoot_reduction_interlock()
returns trigger
language plpgsql
security invoker
set search_path = private, pg_catalog
as $$
declare
  v_safe boolean;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.scope_type not in ('BRAND','BUSINESS') then
      return new;
    end if;

    v_safe := private.member_scope_chatwoot_reduction_safe(
      new.organization_id,
      new.id,
      new.user_id,
      new.scope_type,
      new.brand_id,
      new.tenant_business_id,
      new.role,
      new.attributes,
      false
    );
  else
    if old.scope_type not in ('BRAND','BUSINESS') then
      if tg_op = 'DELETE' then
        return old;
      end if;
      return new;
    end if;

    v_safe := private.member_scope_chatwoot_reduction_safe(
      old.organization_id,
      old.id,
      old.user_id,
      old.scope_type,
      old.brand_id,
      old.tenant_business_id,
      case when tg_op = 'DELETE' then null else new.role end,
      case when tg_op = 'DELETE' then null else new.attributes end,
      tg_op = 'DELETE'
    );
  end if;

  if not v_safe then
    raise exception 'archive verified Chatwoot Account membership before reducing Business-wide authority to VIEWER';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists member_scope_assignments_chatwoot_reduction_insert_interlock
  on public.member_scope_assignments;
create trigger member_scope_assignments_chatwoot_reduction_insert_interlock
before insert
on public.member_scope_assignments
for each row execute function public.enforce_member_scope_chatwoot_reduction_interlock();

drop trigger if exists member_scope_assignments_chatwoot_reduction_update_interlock
  on public.member_scope_assignments;
create trigger member_scope_assignments_chatwoot_reduction_update_interlock
before update of role, attributes
on public.member_scope_assignments
for each row execute function public.enforce_member_scope_chatwoot_reduction_interlock();

drop trigger if exists member_scope_assignments_chatwoot_reduction_delete_interlock
  on public.member_scope_assignments;
create trigger member_scope_assignments_chatwoot_reduction_delete_interlock
before delete
on public.member_scope_assignments
for each row execute function public.enforce_member_scope_chatwoot_reduction_interlock();

-- Caller-declared external verification from 0084 is no longer an executable API.
revoke all on function public.set_chatwoot_account_membership_state(
  uuid, uuid, uuid, integer, text, bigint, text, text, text
) from public, anon, authenticated, service_role;

revoke all on table public.chatwoot_account_membership_reconciliation_receipts
  from public, anon, authenticated, service_role;
grant select, insert on table public.chatwoot_account_membership_reconciliation_receipts
  to service_role;

revoke all on function public.enforce_chatwoot_membership_receipt_immutable()
  from public, anon, authenticated, service_role;

revoke all on function public.record_chatwoot_account_membership_reconciliation(
  uuid, uuid, uuid, integer, integer, integer, text, bigint, text, text
) from public, anon, authenticated;
grant execute on function public.record_chatwoot_account_membership_reconciliation(
  uuid, uuid, uuid, integer, integer, integer, text, bigint, text, text
) to service_role;

revoke all on function private.chatwoot_membership_receipt_evidence(
  uuid, uuid, uuid, integer, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function private.chatwoot_membership_receipt_evidence(
  uuid, uuid, uuid, integer, uuid, text
) to authenticated;

revoke all on function private.member_scope_chatwoot_reduction_safe(
  uuid, uuid, uuid, text, uuid, uuid, text, jsonb, boolean
) from public, anon, authenticated, service_role;
grant execute on function private.member_scope_chatwoot_reduction_safe(
  uuid, uuid, uuid, text, uuid, uuid, text, jsonb, boolean
) to authenticated;

revoke all on function public.enforce_member_scope_chatwoot_reduction_interlock()
  from public, anon, authenticated, service_role;

revoke all on function public.activate_chatwoot_account_membership_verified(
  uuid, uuid, uuid, integer, uuid, text
) from public, anon, service_role;
grant execute on function public.activate_chatwoot_account_membership_verified(
  uuid, uuid, uuid, integer, uuid, text
) to authenticated;

revoke all on function public.mark_chatwoot_account_membership_degraded(
  uuid, uuid, uuid, integer, text, text
) from public, anon, service_role;
grant execute on function public.mark_chatwoot_account_membership_degraded(
  uuid, uuid, uuid, integer, text, text
) to authenticated;

revoke all on function public.archive_chatwoot_account_membership_verified(
  uuid, uuid, uuid, integer, uuid, text
) from public, anon, service_role;
grant execute on function public.archive_chatwoot_account_membership_verified(
  uuid, uuid, uuid, integer, uuid, text
) to authenticated;
