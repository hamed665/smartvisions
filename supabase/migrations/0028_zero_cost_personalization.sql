alter table public.growth_opportunities
  add column if not exists contactability_score integer not null default 0 check (contactability_score between 0 and 100),
  add column if not exists need_score integer not null default 0 check (need_score between 0 and 100),
  add column if not exists service_fit_score integer not null default 0 check (service_fit_score between 0 and 100),
  add column if not exists revenue_potential_score integer not null default 0 check (revenue_potential_score between 0 and 100),
  add column if not exists personalization_priority_score integer not null default 0 check (personalization_priority_score between 0 and 100),
  add column if not exists personalization_fingerprint text[] not null default '{}',
  add column if not exists offer_bundle text[] not null default '{}',
  add column if not exists recommended_angle text,
  add column if not exists message_hooks jsonb not null default '[]'::jsonb,
  add column if not exists social_check_eligible boolean not null default false,
  add column if not exists cheapest_next_action text not null default 'SKIP' check (cheapest_next_action in ('SKIP','CONTACT_READY','SOCIAL_CHECK','WEBSITE_EVIDENCE','EVIDENCE_READY')),
  add column if not exists next_action_reason text,
  add column if not exists next_action_can_spend_money boolean not null default false,
  add column if not exists digital_presence_evidence jsonb not null default '{}'::jsonb;

create index if not exists growth_opportunities_personalization_idx
  on public.growth_opportunities(organization_id, social_check_eligible, contactability_score desc, overall_sales_score desc);

create index if not exists growth_opportunities_next_action_idx
  on public.growth_opportunities(organization_id, cheapest_next_action, personalization_priority_score desc);
