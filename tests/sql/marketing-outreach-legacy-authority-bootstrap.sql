-- Test-only historical authority bootstrap for CI.
--
-- Production already has these canonical tables from migrations 0002, 0003 and 0015.
-- The modern PostgreSQL 17 CI chain starts at the Business OS foundation and therefore
-- omits those legacy migrations. Recreate only the authorities needed to verify modern
-- migrations against the real long-lived Production lineage.
--
-- Never apply this file to Production.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  hunter_type text not null check (hunter_type in ('BUSINESS','INTENT')),
  country_code text,
  city text,
  industry text,
  target_count integer check (target_count is null or target_count > 0),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','RUNNING','PAUSED','COMPLETED','FAILED')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_status_idx
  on public.campaigns(organization_id,status);

create table if not exists public.mailboxes (
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
  unique (organization_id,address)
);

create table if not exists public.outreach_policies (
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
  unique (organization_id,country_code)
);

create table if not exists public.message_variants (
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
  unique (organization_id,country_code,industry,service_id,variant_key)
);

-- Production carries this Lead field from the pre-Business-OS lineage.
-- The compact Customer 360 bootstrap intentionally does not reproduce every
-- legacy Lead column, so restore only the field needed by late-migration parity.
alter table public.leads
  add column if not exists recommended_offer text;

create table if not exists public.outreach_messages (
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

-- customer-360-timeline-bootstrap intentionally carries a compact outreach_messages
-- projection. Normalize only the nullable historical columns needed by modern
-- migrations; never replace that existing canonical test authority.
alter table public.outreach_messages
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists mailbox_id uuid references public.mailboxes(id) on delete set null,
  add column if not exists message_variant_id uuid references public.message_variants(id) on delete set null,
  add column if not exists idempotency_key text,
  add column if not exists locale text,
  add column if not exists dialect text,
  add column if not exists tone_profile text,
  add column if not exists message_variant text;

create unique index if not exists outreach_idempotency_unique
  on public.outreach_messages(organization_id,idempotency_key)
  where idempotency_key is not null;
create index if not exists outreach_lead_created_idx
  on public.outreach_messages(organization_id,lead_id,created_at desc);
create index if not exists outreach_scheduled_idx
  on public.outreach_messages(organization_id,status,scheduled_at)
  where scheduled_at is not null;

create table if not exists public.followup_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  sequence integer not null check (sequence > 0),
  scheduled_at timestamptz not null,
  status text not null default 'PENDING',
  stop_reason text,
  created_at timestamptz not null default now(),
  unique (organization_id,lead_id,campaign_id,sequence)
);

-- The Customer 360 bootstrap already creates followup_jobs without the legacy
-- campaign link. Restore that nullable linkage for Production-lineage parity.
alter table public.followup_jobs
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

create index if not exists followup_due_idx
  on public.followup_jobs(organization_id,status,scheduled_at);

create table if not exists public.reply_events (
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

create table if not exists public.locale_profiles (
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
  unique (organization_id,country_code)
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('EMAIL','WHATSAPP','INSTAGRAM','OTHER')),
  purpose text not null default 'FIRST_TOUCH',
  country_code text,
  language text not null default 'en',
  subject text,
  body text not null,
  enabled boolean not null default true,
  is_default boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists message_templates_lookup_idx
  on public.message_templates(organization_id,channel,purpose,country_code,enabled);

create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  field_name text not null,
  value jsonb,
  source_type text not null,
  source_url text,
  retrieved_at timestamptz not null,
  verified_at timestamptz,
  confidence numeric check (confidence is null or (confidence>=0 and confidence<=1))
);

create index if not exists lead_sources_lead_idx on public.lead_sources(lead_id);
create index if not exists lead_sources_org_idx on public.lead_sources(organization_id);
alter table public.lead_sources enable row level security;
drop policy if exists org_member_sources on public.lead_sources;
create policy org_member_sources on public.lead_sources for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
grant select,insert,update,delete on public.lead_sources to authenticated,service_role;

alter table public.campaigns enable row level security;
alter table public.mailboxes enable row level security;
alter table public.outreach_policies enable row level security;
alter table public.message_variants enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.followup_jobs enable row level security;
alter table public.reply_events enable row level security;
alter table public.locale_profiles enable row level security;
alter table public.message_templates enable row level security;

drop policy if exists org_member_campaigns on public.campaigns;
create policy org_member_campaigns on public.campaigns for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists org_member_mailboxes on public.mailboxes;
create policy org_member_mailboxes on public.mailboxes for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists org_member_outreach_policies on public.outreach_policies;
create policy org_member_outreach_policies on public.outreach_policies for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists org_member_message_variants on public.message_variants;
create policy org_member_message_variants on public.message_variants for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists org_member_outreach on public.outreach_messages;
create policy org_member_outreach on public.outreach_messages for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists org_member_followups on public.followup_jobs;
create policy org_member_followups on public.followup_jobs for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists org_member_reply_events on public.reply_events;
create policy org_member_reply_events on public.reply_events for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists org_member_locale_profiles on public.locale_profiles;
create policy org_member_locale_profiles on public.locale_profiles for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists org_member_message_templates on public.message_templates;
create policy org_member_message_templates on public.message_templates for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

grant select,insert,update,delete on
  public.campaigns,
  public.mailboxes,
  public.outreach_policies,
  public.message_variants,
  public.outreach_messages,
  public.followup_jobs,
  public.reply_events,
  public.locale_profiles,
  public.message_templates
to authenticated,service_role;

do $legacy_marketing_baseline$
begin
  if to_regclass('public.campaigns') is null
     or to_regclass('public.message_templates') is null
     or to_regclass('public.message_variants') is null
     or to_regclass('public.outreach_messages') is null
     or to_regclass('public.followup_jobs') is null
     or to_regclass('public.reply_events') is null
  then
    raise exception 'Historical marketing/outreach authority baseline is incomplete';
  end if;
end;
$legacy_marketing_baseline$;
