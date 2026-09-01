create table if not exists public.telegram_command_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  update_id bigint not null,
  chat_id text not null,
  user_id text not null,
  message_id bigint,
  raw_text text,
  command_type text,
  command_payload jsonb not null default '{}'::jsonb,
  status text not null default 'PROCESSING' check (status in ('PROCESSING','PENDING_CONFIRMATION','COMPLETED','REJECTED','FAILED')),
  confirmation_token uuid unique,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  unique (organization_id, update_id)
);

create index if not exists telegram_command_runs_chat_created_idx
  on public.telegram_command_runs (organization_id, chat_id, created_at desc);
create index if not exists telegram_command_runs_confirmation_idx
  on public.telegram_command_runs (organization_id, confirmation_token)
  where confirmation_token is not null and status = 'PENDING_CONFIRMATION';

create table if not exists public.telegram_notification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_key text not null,
  notification_type text not null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PROCESSING' check (status in ('PROCESSING','SENT','FAILED')),
  telegram_message_id bigint,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (organization_id, event_key)
);

create index if not exists telegram_notification_events_created_idx
  on public.telegram_notification_events (organization_id, created_at desc);

alter table public.telegram_command_runs enable row level security;
alter table public.telegram_notification_events enable row level security;

revoke all on table public.telegram_command_runs from anon, authenticated;
revoke all on table public.telegram_notification_events from anon, authenticated;

grant select, insert, update on table public.telegram_command_runs to service_role;
grant select, insert, update on table public.telegram_notification_events to service_role;
