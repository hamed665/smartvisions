-- Smart Visions AI Business OS 2027
-- FOUNDER-STRATEGY-MARKET-V1.
-- OWNER-governed strategic goals, key results, persistent sourced market research and board reports.
-- These records never infer business performance, market truth, investor interest or board approval automatically.

create table if not exists public.founder_strategic_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','COMPLETED','CANCELED')),
  category text not null check (category in ('GROWTH','PRODUCT','REVENUE','CUSTOMER','OPERATIONS','FUNDRAISING','TEAM','OTHER')),
  title text not null check (length(trim(title)) between 1 and 240),
  description text check (description is null or length(description) <= 6000),
  horizon text not null default 'QUARTER' check (horizon in ('QUARTER','YEAR','MULTI_YEAR','CUSTOM')),
  start_date date,
  end_date date,
  source_ref text not null check (length(trim(source_ref)) between 1 and 512),
  evidence jsonb not null check (
    jsonb_typeof(evidence)='object' and evidence <> '{}'::jsonb and octet_length(evidence::text) <= 32768
  ),
  notes text check (notes is null or length(notes) <= 4000),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint founder_strategic_goals_dates_check check (start_date is null or end_date is null or end_date >= start_date)
);

create table if not exists public.founder_key_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  goal_id uuid not null,
  status text not null default 'NOT_STARTED' check (status in ('NOT_STARTED','ON_TRACK','AT_RISK','ACHIEVED','CANCELED')),
  metric_name text not null check (length(trim(metric_name)) between 1 and 240),
  unit text check (unit is null or length(trim(unit)) between 1 and 80),
  direction text not null default 'INCREASE' check (direction in ('INCREASE','DECREASE','MAINTAIN','QUALITATIVE')),
  baseline_value numeric,
  target_value numeric,
  current_value numeric,
  due_date date,
  source_ref text not null check (length(trim(source_ref)) between 1 and 512),
  evidence jsonb not null check (
    jsonb_typeof(evidence)='object' and evidence <> '{}'::jsonb and octet_length(evidence::text) <= 32768
  ),
  notes text check (notes is null or length(notes) <= 4000),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint founder_key_results_goal_fk foreign key (organization_id,goal_id)
    references public.founder_strategic_goals(organization_id,id) on delete restrict
);

create table if not exists public.founder_market_research_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'CURRENT' check (status in ('CURRENT','STALE','ARCHIVED')),
  research_type text not null check (research_type in ('MARKET_SIZE','COMPETITOR','PRICING','REGULATION','TREND','INVESTOR','OTHER')),
  title text not null check (length(trim(title)) between 1 and 300),
  claim text not null check (length(trim(claim)) between 1 and 4000),
  geography text check (geography is null or length(trim(geography)) <= 200),
  segment text check (segment is null or length(trim(segment)) <= 240),
  source_url text not null check (source_url ~ '^https?://' and length(source_url) <= 2048),
  source_title text check (source_title is null or length(trim(source_title)) <= 500),
  observed_at timestamptz not null,
  last_verified_at timestamptz not null,
  notes text check (notes is null or length(notes) <= 4000),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id)
);

create table if not exists public.founder_board_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  title text not null check (length(trim(title)) between 1 and 240),
  period_start date not null,
  period_end date not null,
  executive_summary text not null check (length(trim(executive_summary)) between 1 and 12000),
  decisions_needed jsonb not null default '[]'::jsonb check (jsonb_typeof(decisions_needed)='array' and octet_length(decisions_needed::text) <= 32768),
  risks jsonb not null default '[]'::jsonb check (jsonb_typeof(risks)='array' and octet_length(risks::text) <= 32768),
  source_ref text not null check (length(trim(source_ref)) between 1 and 512),
  evidence jsonb not null check (
    jsonb_typeof(evidence)='object' and evidence <> '{}'::jsonb and octet_length(evidence::text) <= 32768
  ),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint founder_board_reports_period_check check (period_end >= period_start)
);

create index if not exists founder_strategic_goals_org_status_idx on public.founder_strategic_goals(organization_id,status,category,updated_at desc);
create index if not exists founder_strategic_goals_created_by_fk_idx on public.founder_strategic_goals(created_by_user_id);
create index if not exists founder_strategic_goals_updated_by_fk_idx on public.founder_strategic_goals(updated_by_user_id);
create index if not exists founder_key_results_goal_status_idx on public.founder_key_results(organization_id,goal_id,status,updated_at desc);
create index if not exists founder_key_results_created_by_fk_idx on public.founder_key_results(created_by_user_id);
create index if not exists founder_key_results_updated_by_fk_idx on public.founder_key_results(updated_by_user_id);
create index if not exists founder_market_research_org_type_idx on public.founder_market_research_items(organization_id,status,research_type,last_verified_at desc);
create index if not exists founder_market_research_created_by_fk_idx on public.founder_market_research_items(created_by_user_id);
create index if not exists founder_market_research_updated_by_fk_idx on public.founder_market_research_items(updated_by_user_id);
create index if not exists founder_board_reports_org_period_idx on public.founder_board_reports(organization_id,status,period_end desc);
create index if not exists founder_board_reports_created_by_fk_idx on public.founder_board_reports(created_by_user_id);
create index if not exists founder_board_reports_updated_by_fk_idx on public.founder_board_reports(updated_by_user_id);

create or replace function public.guard_founder_strategy_market_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $guard$
begin
  if auth.uid() is null then raise exception 'Founder strategy/market update requires authenticated OWNER'; end if;
  if new.organization_id is distinct from old.organization_id
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Founder strategy/market identity fields are immutable';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by_user_id := auth.uid();
  return new;
end;
$guard$;

create or replace function public.audit_founder_strategy_market_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $audit$
declare
  v_before jsonb;
  v_after jsonb;
begin
  v_before := case when tg_op='UPDATE' then jsonb_build_object('version',old.version,'status',to_jsonb(old)->>'status') else null end;
  v_after := jsonb_strip_nulls(jsonb_build_object(
    'version',new.version,'status',to_jsonb(new)->>'status','category',to_jsonb(new)->>'category',
    'research_type',to_jsonb(new)->>'research_type','goal_id',to_jsonb(new)->>'goal_id'
  ));
  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data)
  values (
    new.organization_id,'USER',auth.uid()::text,
    'FOUNDER_' || upper(tg_table_name) || '_' || tg_op,
    tg_table_name,new.id::text,v_before,v_after
  );
  return new;
end;
$audit$;

drop trigger if exists founder_strategic_goals_update_guard on public.founder_strategic_goals;
create trigger founder_strategic_goals_update_guard before update on public.founder_strategic_goals for each row execute function public.guard_founder_strategy_market_update();
drop trigger if exists founder_key_results_update_guard on public.founder_key_results;
create trigger founder_key_results_update_guard before update on public.founder_key_results for each row execute function public.guard_founder_strategy_market_update();
drop trigger if exists founder_market_research_update_guard on public.founder_market_research_items;
create trigger founder_market_research_update_guard before update on public.founder_market_research_items for each row execute function public.guard_founder_strategy_market_update();
drop trigger if exists founder_board_reports_update_guard on public.founder_board_reports;
create trigger founder_board_reports_update_guard before update on public.founder_board_reports for each row execute function public.guard_founder_strategy_market_update();

drop trigger if exists founder_strategic_goals_audit on public.founder_strategic_goals;
create trigger founder_strategic_goals_audit after insert or update on public.founder_strategic_goals for each row execute function public.audit_founder_strategy_market_mutation();
drop trigger if exists founder_key_results_audit on public.founder_key_results;
create trigger founder_key_results_audit after insert or update on public.founder_key_results for each row execute function public.audit_founder_strategy_market_mutation();
drop trigger if exists founder_market_research_audit on public.founder_market_research_items;
create trigger founder_market_research_audit after insert or update on public.founder_market_research_items for each row execute function public.audit_founder_strategy_market_mutation();
drop trigger if exists founder_board_reports_audit on public.founder_board_reports;
create trigger founder_board_reports_audit after insert or update on public.founder_board_reports for each row execute function public.audit_founder_strategy_market_mutation();

alter table public.founder_strategic_goals enable row level security;
alter table public.founder_key_results enable row level security;
alter table public.founder_market_research_items enable row level security;
alter table public.founder_board_reports enable row level security;

create policy founder_strategic_goals_owner_read on public.founder_strategic_goals for select to authenticated using (public.is_org_owner(organization_id));
create policy founder_strategic_goals_owner_insert on public.founder_strategic_goals for insert to authenticated with check (
  public.is_org_owner(organization_id) and created_by_user_id=(select auth.uid()) and updated_by_user_id=(select auth.uid())
);
create policy founder_strategic_goals_owner_update on public.founder_strategic_goals for update to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id) and updated_by_user_id=(select auth.uid()));

create policy founder_key_results_owner_read on public.founder_key_results for select to authenticated using (public.is_org_owner(organization_id));
create policy founder_key_results_owner_insert on public.founder_key_results for insert to authenticated with check (
  public.is_org_owner(organization_id) and created_by_user_id=(select auth.uid()) and updated_by_user_id=(select auth.uid())
);
create policy founder_key_results_owner_update on public.founder_key_results for update to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id) and updated_by_user_id=(select auth.uid()));

create policy founder_market_research_owner_read on public.founder_market_research_items for select to authenticated using (public.is_org_owner(organization_id));
create policy founder_market_research_owner_insert on public.founder_market_research_items for insert to authenticated with check (
  public.is_org_owner(organization_id) and created_by_user_id=(select auth.uid()) and updated_by_user_id=(select auth.uid())
);
create policy founder_market_research_owner_update on public.founder_market_research_items for update to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id) and updated_by_user_id=(select auth.uid()));

create policy founder_board_reports_owner_read on public.founder_board_reports for select to authenticated using (public.is_org_owner(organization_id));
create policy founder_board_reports_owner_insert on public.founder_board_reports for insert to authenticated with check (
  public.is_org_owner(organization_id) and created_by_user_id=(select auth.uid()) and updated_by_user_id=(select auth.uid())
);
create policy founder_board_reports_owner_update on public.founder_board_reports for update to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id) and updated_by_user_id=(select auth.uid()));

revoke all on public.founder_strategic_goals from public,anon,authenticated,service_role;
revoke all on public.founder_key_results from public,anon,authenticated,service_role;
revoke all on public.founder_market_research_items from public,anon,authenticated,service_role;
revoke all on public.founder_board_reports from public,anon,authenticated,service_role;

grant select,insert,update on public.founder_strategic_goals to authenticated;
grant select,insert,update on public.founder_key_results to authenticated;
grant select,insert,update on public.founder_market_research_items to authenticated;
grant select,insert,update on public.founder_board_reports to authenticated;

grant select on public.founder_strategic_goals to service_role;
grant select on public.founder_key_results to service_role;
grant select on public.founder_market_research_items to service_role;
grant select on public.founder_board_reports to service_role;

revoke all on function public.guard_founder_strategy_market_update() from public,anon,authenticated,service_role;
revoke all on function public.audit_founder_strategy_market_mutation() from public,anon,authenticated,service_role;

comment on table public.founder_strategic_goals is 'OWNER-only strategic goal authority. Status is explicit OWNER input, not model-inferred company performance.';
comment on table public.founder_key_results is 'OWNER-only key-result authority. Current values are OWNER-provided evidence and are not inferred from unrelated system counts.';
comment on table public.founder_market_research_items is 'OWNER-only persistent external research evidence with mandatory source URL and verification timestamp.';
comment on table public.founder_board_reports is 'OWNER-only board-report authority. PUBLISHED means OWNER-published in Founder OS and does not imply external board approval.';
