-- Smart Visions AI Business OS 2027
-- FOUNDER-CAPITAL-DILIGENCE-V1.
-- OWNER-governed cap table, dilution assumptions, term-sheet evidence and due-diligence readiness.
-- No valuation, ownership, investor commitment or diligence completion is inferred automatically.

create table if not exists public.founder_cap_table_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','ARCHIVED')),
  holder_type text not null
    check (holder_type in ('FOUNDER','EMPLOYEE','INVESTOR','OPTION_POOL','OTHER')),
  holder_name text not null check (length(trim(holder_name)) between 1 and 240),
  person_id uuid,
  business_id uuid,
  security_type text not null
    check (security_type in ('COMMON','PREFERRED','OPTION_POOL','OTHER')),
  share_class text check (share_class is null or length(trim(share_class)) between 1 and 80),
  issued_units numeric(24,8) not null default 0 check (issued_units >= 0),
  reserved_units numeric(24,8) not null default 0 check (reserved_units >= 0),
  source_type text not null
    check (source_type in ('MANUAL_CONFIRMED','IMPORT_VERIFIED')),
  source_ref text not null check (length(trim(source_ref)) between 1 and 512),
  evidence jsonb not null
    check (
      jsonb_typeof(evidence)='object'
      and evidence <> '{}'::jsonb
      and octet_length(evidence::text) <= 32768
    ),
  notes text check (notes is null or length(notes) <= 4000),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint founder_cap_table_person_fk
    foreign key (organization_id,person_id)
    references public.crm_people(organization_id,id)
    on delete restrict,
  constraint founder_cap_table_business_fk
    foreign key (organization_id,business_id)
    references public.businesses(organization_id,id)
    on delete restrict,
  constraint founder_cap_table_units_check
    check (
      (
        holder_type='OPTION_POOL'
        and security_type='OPTION_POOL'
        and issued_units=0
        and reserved_units>0
        and person_id is null
        and business_id is null
      )
      or
      (
        holder_type<>'OPTION_POOL'
        and security_type<>'OPTION_POOL'
        and issued_units>0
        and reserved_units=0
      )
    )
);

create table if not exists public.founder_dilution_scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fundraising_round_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 160),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','ARCHIVED')),
  currency text not null
    check (currency=upper(trim(currency)) and currency ~ '^[A-Z]{3}$'),
  pre_money_valuation_assumption numeric not null
    check (pre_money_valuation_assumption > 0),
  new_money_amount_assumption numeric not null
    check (new_money_amount_assumption > 0),
  option_pool_top_up_units_assumption numeric(24,8) not null default 0
    check (option_pool_top_up_units_assumption >= 0),
  assumption_source_ref text not null
    check (length(trim(assumption_source_ref)) between 1 and 512),
  assumption_evidence jsonb not null
    check (
      jsonb_typeof(assumption_evidence)='object'
      and assumption_evidence <> '{}'::jsonb
      and octet_length(assumption_evidence::text) <= 32768
    ),
  notes text check (notes is null or length(notes) <= 4000),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint founder_dilution_round_fk
    foreign key (organization_id,fundraising_round_id)
    references public.founder_fundraising_rounds(organization_id,id)
    on delete restrict
);

create table if not exists public.founder_term_sheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fundraising_round_id uuid not null,
  investor_candidate_id uuid,
  crm_deal_id uuid,
  counterparty_name text not null check (length(trim(counterparty_name)) between 1 and 240),
  label text not null check (length(trim(label)) between 1 and 160),
  status text not null default 'RECEIVED'
    check (status in ('DRAFT','RECEIVED','COUNTERED','ACCEPTED','DECLINED','WITHDRAWN')),
  instrument text not null
    check (instrument in ('EQUITY','SAFE','CONVERTIBLE_NOTE','OTHER')),
  currency text not null
    check (currency=upper(trim(currency)) and currency ~ '^[A-Z]{3}$'),
  investment_amount numeric not null check (investment_amount > 0),
  pre_money_valuation numeric check (pre_money_valuation is null or pre_money_valuation > 0),
  valuation_cap numeric check (valuation_cap is null or valuation_cap > 0),
  discount_bps integer check (discount_bps is null or discount_bps between 0 and 10000),
  interest_rate_bps integer check (interest_rate_bps is null or interest_rate_bps between 0 and 10000),
  maturity_months integer check (maturity_months is null or maturity_months between 1 and 120),
  liquidation_preference_multiple numeric
    check (liquidation_preference_multiple is null or (liquidation_preference_multiple > 0 and liquidation_preference_multiple <= 10)),
  participating_preferred boolean,
  board_seat_rights boolean,
  pro_rata_rights boolean,
  information_rights boolean,
  exclusivity_days integer check (exclusivity_days is null or exclusivity_days between 0 and 365),
  source_type text not null
    check (source_type in ('MANUAL_CONFIRMED','IMPORT_VERIFIED')),
  source_ref text not null check (length(trim(source_ref)) between 1 and 512),
  evidence jsonb not null
    check (
      jsonb_typeof(evidence)='object'
      and evidence <> '{}'::jsonb
      and octet_length(evidence::text) <= 32768
    ),
  notes text check (notes is null or length(notes) <= 6000),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint founder_term_sheet_round_fk
    foreign key (organization_id,fundraising_round_id)
    references public.founder_fundraising_rounds(organization_id,id)
    on delete restrict,
  constraint founder_term_sheet_candidate_fk
    foreign key (organization_id,investor_candidate_id)
    references public.founder_investor_research_candidates(organization_id,id)
    on delete restrict,
  constraint founder_term_sheet_deal_fk
    foreign key (organization_id,crm_deal_id)
    references public.crm_deals(organization_id,id)
    on delete restrict
);

create table if not exists public.founder_due_diligence_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fundraising_round_id uuid,
  category text not null
    check (category in ('CORPORATE','FINANCE','LEGAL','IP','SECURITY','PRODUCT','COMMERCIAL','HR','TAX','OTHER')),
  title text not null check (length(trim(title)) between 1 and 240),
  status text not null default 'MISSING'
    check (status in ('MISSING','REQUESTED','READY','SHARED','NOT_APPLICABLE')),
  sensitivity text not null default 'CONFIDENTIAL'
    check (sensitivity in ('INTERNAL','CONFIDENTIAL','RESTRICTED')),
  evidence_ref text check (evidence_ref is null or length(trim(evidence_ref)) between 1 and 1024),
  last_verified_at timestamptz,
  notes text check (notes is null or length(notes) <= 4000),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint founder_due_diligence_round_fk
    foreign key (organization_id,fundraising_round_id)
    references public.founder_fundraising_rounds(organization_id,id)
    on delete restrict,
  constraint founder_due_diligence_evidence_check
    check (
      status not in ('READY','SHARED')
      or (evidence_ref is not null and last_verified_at is not null)
    )
);

create index if not exists founder_cap_table_org_status_idx
  on public.founder_cap_table_entries(organization_id,status,updated_at desc);
create index if not exists founder_cap_table_person_fk_idx
  on public.founder_cap_table_entries(organization_id,person_id)
  where person_id is not null;
create index if not exists founder_cap_table_business_fk_idx
  on public.founder_cap_table_entries(organization_id,business_id)
  where business_id is not null;
create index if not exists founder_cap_table_created_by_fk_idx
  on public.founder_cap_table_entries(created_by_user_id);
create index if not exists founder_cap_table_updated_by_fk_idx
  on public.founder_cap_table_entries(updated_by_user_id);

create index if not exists founder_dilution_round_status_idx
  on public.founder_dilution_scenarios(organization_id,fundraising_round_id,status,updated_at desc);
create index if not exists founder_dilution_created_by_fk_idx
  on public.founder_dilution_scenarios(created_by_user_id);
create index if not exists founder_dilution_updated_by_fk_idx
  on public.founder_dilution_scenarios(updated_by_user_id);

create index if not exists founder_term_sheets_round_status_idx
  on public.founder_term_sheets(organization_id,fundraising_round_id,status,updated_at desc);
create index if not exists founder_term_sheets_candidate_fk_idx
  on public.founder_term_sheets(organization_id,investor_candidate_id)
  where investor_candidate_id is not null;
create index if not exists founder_term_sheets_deal_fk_idx
  on public.founder_term_sheets(organization_id,crm_deal_id)
  where crm_deal_id is not null;
create index if not exists founder_term_sheets_created_by_fk_idx
  on public.founder_term_sheets(created_by_user_id);
create index if not exists founder_term_sheets_updated_by_fk_idx
  on public.founder_term_sheets(updated_by_user_id);

create index if not exists founder_due_diligence_round_status_idx
  on public.founder_due_diligence_items(organization_id,fundraising_round_id,category,status,updated_at desc);
create index if not exists founder_due_diligence_created_by_fk_idx
  on public.founder_due_diligence_items(created_by_user_id);
create index if not exists founder_due_diligence_updated_by_fk_idx
  on public.founder_due_diligence_items(updated_by_user_id);

create or replace function public.guard_founder_term_sheet_linkage()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $guard_founder_term_sheet_linkage$
declare
  v_candidate_state text;
  v_deal_purpose text;
  v_deal_round uuid;
begin
  if new.investor_candidate_id is not null then
    select record_state into v_candidate_state
    from public.founder_investor_research_candidates
    where organization_id=new.organization_id
      and id=new.investor_candidate_id;

    if v_candidate_state is null then
      raise exception 'Founder term sheet investor candidate not found';
    end if;
    if v_candidate_state<>'CRM_CONFIRMED' then
      raise exception 'Founder term sheet requires CRM_CONFIRMED investor candidate when linked';
    end if;
  end if;

  if new.crm_deal_id is not null then
    select deal_purpose,fundraising_round_id
      into v_deal_purpose,v_deal_round
    from public.crm_deals
    where organization_id=new.organization_id
      and id=new.crm_deal_id;

    if v_deal_purpose is null then
      raise exception 'Founder term sheet fundraising deal not found';
    end if;
    if v_deal_purpose<>'FUNDRAISING' then
      raise exception 'Founder term sheet can link only to FUNDRAISING deals';
    end if;
    if v_deal_round is distinct from new.fundraising_round_id then
      raise exception 'Founder term sheet deal must belong to the same fundraising round';
    end if;
  end if;

  return new;
end;
$guard_founder_term_sheet_linkage$;

drop trigger if exists founder_term_sheets_linkage_guard on public.founder_term_sheets;
create trigger founder_term_sheets_linkage_guard
before insert or update of organization_id,fundraising_round_id,investor_candidate_id,crm_deal_id
on public.founder_term_sheets
for each row execute function public.guard_founder_term_sheet_linkage();

create or replace function public.guard_founder_capital_diligence_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $guard_founder_capital_diligence_update$
begin
  if auth.uid() is null then
    raise exception 'Founder capital/diligence update requires authenticated OWNER';
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Founder capital/diligence identity fields are immutable';
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by_user_id := auth.uid();
  return new;
end;
$guard_founder_capital_diligence_update$;

drop trigger if exists founder_cap_table_update_guard on public.founder_cap_table_entries;
create trigger founder_cap_table_update_guard
before update on public.founder_cap_table_entries
for each row execute function public.guard_founder_capital_diligence_update();

drop trigger if exists founder_dilution_update_guard on public.founder_dilution_scenarios;
create trigger founder_dilution_update_guard
before update on public.founder_dilution_scenarios
for each row execute function public.guard_founder_capital_diligence_update();

drop trigger if exists founder_term_sheet_update_guard on public.founder_term_sheets;
create trigger founder_term_sheet_update_guard
before update on public.founder_term_sheets
for each row execute function public.guard_founder_capital_diligence_update();

drop trigger if exists founder_due_diligence_update_guard on public.founder_due_diligence_items;
create trigger founder_due_diligence_update_guard
before update on public.founder_due_diligence_items
for each row execute function public.guard_founder_capital_diligence_update();

create or replace function public.audit_founder_capital_diligence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $audit_founder_capital_diligence$
declare
  v_before jsonb;
  v_after jsonb;
begin
  v_before := case when tg_op='UPDATE' then
    jsonb_build_object('version',old.version,'status',to_jsonb(old)->>'status')
  else null end;

  v_after := jsonb_strip_nulls(jsonb_build_object(
    'version',new.version,
    'status',to_jsonb(new)->>'status',
    'holder_type',to_jsonb(new)->>'holder_type',
    'security_type',to_jsonb(new)->>'security_type',
    'fundraising_round_id',to_jsonb(new)->>'fundraising_round_id',
    'instrument',to_jsonb(new)->>'instrument',
    'category',to_jsonb(new)->>'category'
  ));

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data
  ) values (
    new.organization_id,
    'USER',
    auth.uid()::text,
    'FOUNDER_' || upper(tg_table_name) || '_' || tg_op,
    tg_table_name,
    new.id::text,
    v_before,
    v_after
  );
  return new;
end;
$audit_founder_capital_diligence$;

drop trigger if exists founder_cap_table_audit on public.founder_cap_table_entries;
create trigger founder_cap_table_audit
after insert or update on public.founder_cap_table_entries
for each row execute function public.audit_founder_capital_diligence_mutation();

drop trigger if exists founder_dilution_audit on public.founder_dilution_scenarios;
create trigger founder_dilution_audit
after insert or update on public.founder_dilution_scenarios
for each row execute function public.audit_founder_capital_diligence_mutation();

drop trigger if exists founder_term_sheet_audit on public.founder_term_sheets;
create trigger founder_term_sheet_audit
after insert or update on public.founder_term_sheets
for each row execute function public.audit_founder_capital_diligence_mutation();

drop trigger if exists founder_due_diligence_audit on public.founder_due_diligence_items;
create trigger founder_due_diligence_audit
after insert or update on public.founder_due_diligence_items
for each row execute function public.audit_founder_capital_diligence_mutation();

alter table public.founder_cap_table_entries enable row level security;
alter table public.founder_dilution_scenarios enable row level security;
alter table public.founder_term_sheets enable row level security;
alter table public.founder_due_diligence_items enable row level security;

create policy founder_cap_table_owner_read
on public.founder_cap_table_entries for select to authenticated
using (public.is_org_owner(organization_id));
create policy founder_cap_table_owner_insert
on public.founder_cap_table_entries for insert to authenticated
with check (
  public.is_org_owner(organization_id)
  and created_by_user_id=(select auth.uid())
  and updated_by_user_id=(select auth.uid())
);
create policy founder_cap_table_owner_update
on public.founder_cap_table_entries for update to authenticated
using (public.is_org_owner(organization_id))
with check (
  public.is_org_owner(organization_id)
  and updated_by_user_id=(select auth.uid())
);

create policy founder_dilution_owner_read
on public.founder_dilution_scenarios for select to authenticated
using (public.is_org_owner(organization_id));
create policy founder_dilution_owner_insert
on public.founder_dilution_scenarios for insert to authenticated
with check (
  public.is_org_owner(organization_id)
  and created_by_user_id=(select auth.uid())
  and updated_by_user_id=(select auth.uid())
);
create policy founder_dilution_owner_update
on public.founder_dilution_scenarios for update to authenticated
using (public.is_org_owner(organization_id))
with check (
  public.is_org_owner(organization_id)
  and updated_by_user_id=(select auth.uid())
);

create policy founder_term_sheets_owner_read
on public.founder_term_sheets for select to authenticated
using (public.is_org_owner(organization_id));
create policy founder_term_sheets_owner_insert
on public.founder_term_sheets for insert to authenticated
with check (
  public.is_org_owner(organization_id)
  and created_by_user_id=(select auth.uid())
  and updated_by_user_id=(select auth.uid())
);
create policy founder_term_sheets_owner_update
on public.founder_term_sheets for update to authenticated
using (public.is_org_owner(organization_id))
with check (
  public.is_org_owner(organization_id)
  and updated_by_user_id=(select auth.uid())
);

create policy founder_due_diligence_owner_read
on public.founder_due_diligence_items for select to authenticated
using (public.is_org_owner(organization_id));
create policy founder_due_diligence_owner_insert
on public.founder_due_diligence_items for insert to authenticated
with check (
  public.is_org_owner(organization_id)
  and created_by_user_id=(select auth.uid())
  and updated_by_user_id=(select auth.uid())
);
create policy founder_due_diligence_owner_update
on public.founder_due_diligence_items for update to authenticated
using (public.is_org_owner(organization_id))
with check (
  public.is_org_owner(organization_id)
  and updated_by_user_id=(select auth.uid())
);

revoke all on public.founder_cap_table_entries from public,anon,authenticated,service_role;
revoke all on public.founder_dilution_scenarios from public,anon,authenticated,service_role;
revoke all on public.founder_term_sheets from public,anon,authenticated,service_role;
revoke all on public.founder_due_diligence_items from public,anon,authenticated,service_role;

grant select,insert,update on public.founder_cap_table_entries to authenticated;
grant select,insert,update on public.founder_dilution_scenarios to authenticated;
grant select,insert,update on public.founder_term_sheets to authenticated;
grant select,insert,update on public.founder_due_diligence_items to authenticated;

grant select on public.founder_cap_table_entries to service_role;
grant select on public.founder_dilution_scenarios to service_role;
grant select on public.founder_term_sheets to service_role;
grant select on public.founder_due_diligence_items to service_role;

revoke all on function public.guard_founder_term_sheet_linkage()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_founder_capital_diligence_update()
  from public,anon,authenticated,service_role;
revoke all on function public.audit_founder_capital_diligence_mutation()
  from public,anon,authenticated,service_role;

comment on table public.founder_cap_table_entries is
  'OWNER-only cap-table evidence. Ownership percentages are DERIVED from ACTIVE confirmed units and are not inferred from CRM or fundraising amounts.';
comment on table public.founder_dilution_scenarios is
  'OWNER-only financing scenario assumptions. Scenario dilution is DERIVED and never recorded as observed ownership.';
comment on table public.founder_term_sheets is
  'OWNER-only term-sheet evidence. Terms are user/import-provided evidence, not model-invented offers or investor commitment.';
comment on table public.founder_due_diligence_items is
  'OWNER-only due-diligence/data-room readiness checklist. READY/SHARED requires an explicit evidence reference and verification timestamp.';
