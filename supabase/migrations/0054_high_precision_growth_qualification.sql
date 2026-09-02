alter table public.growth_opportunities
  add column if not exists prospect_tier text not null default 'SKIP' check (prospect_tier in ('A','B','C','SKIP')),
  add column if not exists qualification_score integer not null default 0 check (qualification_score between 0 and 100),
  add column if not exists qualification_confidence integer not null default 0 check (qualification_confidence between 0 and 100),
  add column if not exists primary_offer_family text,
  add column if not exists primary_service_id text,
  add column if not exists secondary_offer_family text,
  add column if not exists secondary_service_id text,
  add column if not exists should_contact boolean not null default false,
  add column if not exists catalog_ready boolean not null default false,
  add column if not exists qualification_reasons jsonb not null default '[]'::jsonb,
  add column if not exists evidence_gaps jsonb not null default '[]'::jsonb;

alter table public.growth_opportunities
  drop constraint if exists growth_opportunities_cheapest_next_action_check;

alter table public.growth_opportunities
  add constraint growth_opportunities_cheapest_next_action_check
  check (cheapest_next_action in ('SKIP','CONTACT_READY','SOCIAL_CHECK','WEBSITE_EVIDENCE','EVIDENCE_READY','CATALOG_SETUP'));

create index if not exists growth_opportunities_precision_queue_idx
  on public.growth_opportunities(
    organization_id,
    should_contact,
    prospect_tier,
    qualification_score desc,
    personalization_priority_score desc
  );

create index if not exists growth_opportunities_offer_family_idx
  on public.growth_opportunities(organization_id, primary_offer_family, prospect_tier, qualification_score desc);
