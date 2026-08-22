create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  provider_message_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, provider, provider_event_id)
);

create index if not exists email_events_message_idx
  on public.email_events(organization_id, provider_message_id, created_at desc)
  where provider_message_id is not null;

create index if not exists email_events_type_idx
  on public.email_events(organization_id, event_type, created_at desc);

alter table public.email_events enable row level security;

create policy org_member_email_events on public.email_events for select
using (public.is_org_member(organization_id));
