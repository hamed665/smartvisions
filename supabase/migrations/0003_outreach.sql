create table public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  address text not null,
  sending_domain text not null,
  enabled boolean not null default true,
  daily_limit integer not null default 20 check (daily_limit > 0),
  sent_today integer not null default 0 check (sent_today >= 0),
  warmup_status text not null default 'NOT_STARTED',
  health_status text not null default 'UNKNOWN',
  bounce_rate numeric not null default 0 check (bounce_rate between 0 and 1),
  complaint_rate numeric not null default 0 check (complaint_rate between 0 and 1),
  reply_rate numeric not null default 0 check (reply_rate between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, address)
);

create table public.outreach_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  country_code text not null,
  enabled boolean not null default true,
  send_window_start time not null default '09:00',
  send_window_end time not null default '19:00',
  business_days integer[] not null default array[1,2,3,4,5],
  max_emails_per_day integer not null default 50 check (max_emails_per_day > 0),
  max_emails_per_mailbox integer not null default 20 check (max_emails_per_mailbox > 0),
  max_followups integer not null default 2 check (max_followups between 0 and 10),
  followup_delays_days integer[] not null default array[3,7],
  manual_review_required boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (organization_id, country_code)
);

create table public.message_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  country_code text not null,
  industry text,
  service_id text,
  variant_key text not null,
  strategy text not null,
  enabled boolean not null default true,
  sample_size integer not null default 0,
  sent_count integer not null default 0,
  reply_count integer not null default 0,
  positive_count integer not null default 0,
  hot_count integer not null default 0,
  won_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, country_code, industry, service_id, variant_key)
);

create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  mailbox_id uuid references public.mailboxes(id) on delete set null,
  message_variant_id uuid references public.message_variants(id) on delete set null,
  channel text not null default 'EMAIL',
  direction text not null check (direction in ('OUTBOUND','INBOUND')),
  status text not null default 'DRAFT',
  provider_message_id text,
  provider_thread_id text,
  subject text,
  body text not null,
  locale text,
  dialect text,
  tone_profile text,
  message_variant text,
  idempotency_key text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  received_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index outreach_idempotency_unique
  on public.outreach_messages(organization_id, idempotency_key)
  where idempotency_key is not null;

create index outreach_lead_created_idx on public.outreach_messages(organization_id, lead_id, created_at desc);
create index outreach_scheduled_idx on public.outreach_messages(organization_id, status, scheduled_at) where scheduled_at is not null;

create table public.followup_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  sequence integer not null check (sequence > 0),
  scheduled_at timestamptz not null,
  status text not null default 'PENDING',
  stop_reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, lead_id, campaign_id, sequence)
);

create index followup_due_idx on public.followup_jobs(organization_id, status, scheduled_at);

create table public.reply_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  outreach_message_id uuid references public.outreach_messages(id) on delete cascade,
  category text not null,
  signals jsonb not null default '{}'::jsonb,
  intent_score integer not null default 0 check (intent_score between 0 and 100),
  hot boolean not null default false,
  stop_followups boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.locale_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  country_code text not null,
  primary_locale text not null,
  fallback_locale text,
  dialect text,
  tone_profile text not null,
  dialect_intensity numeric not null default 0 check (dialect_intensity between 0 and 1),
  max_first_touch_words integer not null default 80,
  max_reply_words integer not null default 120,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (organization_id, country_code)
);

alter table public.mailboxes enable row level security;
alter table public.outreach_policies enable row level security;
alter table public.message_variants enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.followup_jobs enable row level security;
alter table public.reply_events enable row level security;
alter table public.locale_profiles enable row level security;

create policy org_member_mailboxes on public.mailboxes for all
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_outreach_policies on public.outreach_policies for all
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_message_variants on public.message_variants for all
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_outreach on public.outreach_messages for all
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_followups on public.followup_jobs for all
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_reply_events on public.reply_events for all
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_locale_profiles on public.locale_profiles for all
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
