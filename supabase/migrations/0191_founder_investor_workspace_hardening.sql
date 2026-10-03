-- Smart Visions AI Business OS 2027
-- FOUNDER-INVESTOR-WORKSPACE-V1 hardening.
-- Makes CRM purpose/round linkage immutable and makes OWNER confirmation identity authoritative.

create or replace function public.guard_founder_crm_pipeline_purpose()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $guard_founder_pipeline_purpose$
begin
  if tg_op='UPDATE' and new.pipeline_purpose is distinct from old.pipeline_purpose then
    raise exception 'CRM pipeline purpose is immutable';
  end if;
  return new;
end;
$guard_founder_pipeline_purpose$;

drop trigger if exists crm_pipelines_founder_purpose_guard on public.crm_pipelines;
create trigger crm_pipelines_founder_purpose_guard
before update of pipeline_purpose on public.crm_pipelines
for each row execute function public.guard_founder_crm_pipeline_purpose();

create or replace function public.guard_founder_fundraising_deal_purpose()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $guard_fundraising_deal$
declare
  v_pipeline_purpose text;
begin
  if tg_op='UPDATE'
     and (
       new.deal_purpose is distinct from old.deal_purpose
       or new.fundraising_round_id is distinct from old.fundraising_round_id
     )
  then
    raise exception 'CRM deal purpose and fundraising round are immutable';
  end if;

  select p.pipeline_purpose
    into v_pipeline_purpose
  from public.crm_pipelines p
  where p.organization_id=new.organization_id
    and p.id=new.pipeline_id;

  if v_pipeline_purpose is null then
    raise exception 'CRM pipeline not found for deal purpose validation';
  end if;

  if v_pipeline_purpose is distinct from new.deal_purpose then
    raise exception 'Deal purpose must match pipeline purpose';
  end if;

  if new.deal_purpose='SALES' and new.fundraising_round_id is not null then
    raise exception 'SALES deal cannot reference a fundraising round';
  end if;

  if new.deal_purpose='FUNDRAISING' and new.fundraising_round_id is null then
    raise exception 'FUNDRAISING deal requires a fundraising round';
  end if;

  return new;
end;
$guard_fundraising_deal$;

create or replace function public.guard_founder_investor_candidate_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $guard_investor_candidate$
begin
  if new.organization_id is distinct from old.organization_id
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at
     or new.source_url is distinct from old.source_url then
    raise exception 'Investor research candidate identity/source fields are immutable';
  end if;

  if old.record_state='CRM_CONFIRMED'
     and (
       new.record_state is distinct from old.record_state
       or new.business_id is distinct from old.business_id
       or new.person_id is distinct from old.person_id
       or new.confirmation_method is distinct from old.confirmation_method
       or new.confirmed_by_user_id is distinct from old.confirmed_by_user_id
       or new.confirmed_at is distinct from old.confirmed_at
     )
  then
    raise exception 'CRM-confirmed investor identity linkage is immutable';
  end if;

  if old.record_state='DISCOVERED_EXTERNAL' and new.record_state='CRM_CONFIRMED' then
    if auth.uid() is null then
      raise exception 'Investor CRM confirmation requires authenticated OWNER';
    end if;
    new.confirmed_by_user_id := auth.uid();
    new.confirmed_at := now();
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by_user_id := auth.uid();
  return new;
end;
$guard_investor_candidate$;

revoke all on function public.guard_founder_crm_pipeline_purpose()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_founder_fundraising_deal_purpose()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_founder_investor_candidate_update()
  from public,anon,authenticated,service_role;
