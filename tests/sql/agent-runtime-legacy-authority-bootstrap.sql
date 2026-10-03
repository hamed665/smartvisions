\set ON_ERROR_STOP on

-- Test-only reconstruction of the canonical legacy Agent persistence authorities
-- carried by long-lived Production from migrations 0004 and 0033. The modern
-- PostgreSQL 17 CI chain starts at the Business OS control-plane lineage, so
-- these tables/columns must exist before later migrations are validated.
-- This file is not a second Agent authority and is never applied to Production.

alter table public.agent_runs
  add column if not exists request_key text,
  add column if not exists result_payload jsonb;

create unique index if not exists agent_runs_org_request_key_uidx
  on public.agent_runs(organization_id,request_key)
  where request_key is not null;

create table if not exists public.agent_outputs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  agent_name text not null,
  confidence numeric not null check (confidence between 0 and 1),
  summary text not null,
  data jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_outputs_run_idx
  on public.agent_outputs(organization_id,run_id);
create index if not exists agent_outputs_run_fk_idx
  on public.agent_outputs(run_id);

create table if not exists public.reply_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  commercial_decision jsonb not null,
  customer_draft text,
  draft_language text,
  relevance_passed boolean not null default false,
  delivery text not null check (delivery in ('SEND','REVIEW','BLOCK')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reply_decisions_org_idx
  on public.reply_decisions(organization_id);
create index if not exists reply_decisions_run_idx
  on public.reply_decisions(run_id);
create index if not exists reply_decisions_approved_by_idx
  on public.reply_decisions(approved_by);

alter table public.agent_outputs enable row level security;
alter table public.reply_decisions enable row level security;

drop policy if exists org_member_agent_outputs on public.agent_outputs;
create policy org_member_agent_outputs
  on public.agent_outputs
  for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists org_member_reply_decisions on public.reply_decisions;
create policy org_member_reply_decisions
  on public.reply_decisions
  for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
