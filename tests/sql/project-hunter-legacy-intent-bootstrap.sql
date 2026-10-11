-- CI-only baseline for a legacy 0002_hunters table.
-- The PG17 smoke chain starts at 0068 and deliberately omits 0002.
-- Never run this bootstrap in Supabase Production.
create table public.intent_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid,
  source_type text not null,
  source_id text,
  source_url text,
  title text,
  body text not null,
  language text,
  country_code text,
  service_hint text,
  budget_amount numeric,
  budget_currency text,
  posted_at timestamptz,
  detected_at timestamptz not null default now(),
  freshness_score integer not null default 0 check (freshness_score between 0 and 100),
  intent_score integer not null default 0 check (intent_score between 0 and 100),
  priority text not null default 'LOW' check (priority in ('URGENT','HIGH','MEDIUM','LOW','SKIP')),
  contactability text not null default 'UNKNOWN' check (contactability in ('ALLOWED','REVIEW','BLOCKED','UNKNOWN')),
  scoring_reasons jsonb not null default '[]'::jsonb,
  unique (organization_id,source_type,source_id)
);
alter table public.intent_opportunities enable row level security;
create policy org_member_intent on public.intent_opportunities for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
grant select,insert,update,delete on public.intent_opportunities to authenticated;
