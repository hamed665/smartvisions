create table if not exists public.growth_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_region text not null check (service_region in ('MUSCAT_LOCAL','OMAN_REMOTE','INTERNATIONAL_REMOTE')),
  sales_lane text not null check (sales_lane in ('MUSCAT_LOCAL_GROWTH','OMAN_REMOTE_GROWTH','INTERNATIONAL_AI_GROWTH')),
  website_class text not null check (website_class in ('NONE','CONTACT_ONLY','STANDALONE')),
  website_score integer not null default 0 check (website_score between 0 and 100),
  local_content_score integer not null default 0 check (local_content_score between 0 and 100),
  ai_content_score integer not null default 0 check (ai_content_score between 0 and 100),
  overall_sales_score integer not null default 0 check (overall_sales_score between 0 and 100),
  content_check_status text not null default 'PENDING_SOCIAL_CHECK' check (content_check_status in ('NOT_ELIGIBLE','PENDING_SOCIAL_CHECK','READY_FOR_REVIEW')),
  recommended_services text[] not null default '{}',
  routing_reasons jsonb not null default '[]'::jsonb,
  routed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, business_id)
);

create index if not exists growth_opportunities_lane_idx
  on public.growth_opportunities(organization_id, sales_lane, overall_sales_score desc);
create index if not exists growth_opportunities_content_check_idx
  on public.growth_opportunities(organization_id, content_check_status, overall_sales_score desc);

alter table public.growth_opportunities enable row level security;
drop policy if exists org_member_growth_opportunities on public.growth_opportunities;
create policy org_member_growth_opportunities on public.growth_opportunities for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

grant select, insert, update, delete on public.growth_opportunities to authenticated;
