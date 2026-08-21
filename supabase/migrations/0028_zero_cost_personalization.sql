alter table public.growth_opportunities
  add column if not exists contactability_score integer not null default 0 check (contactability_score between 0 and 100),
  add column if not exists need_score integer not null default 0 check (need_score between 0 and 100),
  add column if not exists service_fit_score integer not null default 0 check (service_fit_score between 0 and 100),
  add column if not exists revenue_potential_score integer not null default 0 check (revenue_potential_score between 0 and 100),
  add column if not exists personalization_fingerprint text[] not null default '{}',
  add column if not exists offer_bundle text[] not null default '{}',
  add column if not exists recommended_angle text,
  add column if not exists message_hooks jsonb not null default '[]'::jsonb,
  add column if not exists social_check_eligible boolean not null default false;

create index if not exists growth_opportunities_personalization_idx
  on public.growth_opportunities(organization_id, social_check_eligible, contactability_score desc, overall_sales_score desc);
