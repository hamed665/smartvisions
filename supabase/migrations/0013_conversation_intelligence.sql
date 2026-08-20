alter table public.sales_conversations
  add column if not exists stage text not null default 'NEW' check (stage in ('NEW','ACTIVE','CLOSING','WAITING_CUSTOMER','UNANSWERED','HOT','NEEDS_HUMAN','FOLLOW_UP_DUE','WON','LOST','DO_NOT_CONTACT','SPAM','PAUSED')),
  add column if not exists priority integer not null default 50 check (priority between 0 and 100),
  add column if not exists unread_count integer not null default 0 check (unread_count >= 0),
  add column if not exists awaiting_party text not null default 'NONE' check (awaiting_party in ('NONE','CUSTOMER','US','HUMAN')),
  add column if not exists requires_human boolean not null default false,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_outbound_at timestamptz,
  add column if not exists detected_language text,
  add column if not exists detected_dialect text,
  add column if not exists persian_summary text,
  add column if not exists intent_label text,
  add column if not exists sentiment_label text,
  add column if not exists stage_reason text;

create index if not exists sales_conversations_stage_idx
  on public.sales_conversations(organization_id, stage, priority desc, updated_at desc);
create index if not exists sales_conversations_unanswered_idx
  on public.sales_conversations(organization_id, requires_human, unread_count desc, updated_at desc);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.sales_conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  provider_message_id text,
  channel text not null check (channel in ('EMAIL','WHATSAPP','INSTAGRAM','WEB','OTHER')),
  direction text not null check (direction in ('INBOUND','OUTBOUND')),
  media_type text not null default 'TEXT' check (media_type in ('TEXT','VOICE','AUDIO','IMAGE','VIDEO','DOCUMENT','OTHER')),
  original_text text,
  transcript text,
  detected_language text,
  detected_dialect text,
  persian_translation text,
  persian_summary text,
  intent_label text,
  sentiment_label text,
  confidence numeric check (confidence is null or confidence between 0 and 1),
  reply_language text,
  reply_dialect text,
  requires_approval boolean not null default false,
  approval_reason text,
  status text not null default 'RECEIVED' check (status in ('RECEIVED','PROCESSING','READY','APPROVAL_REQUIRED','APPROVED','SENT','FAILED','BLOCKED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  sent_at timestamptz
);

create unique index if not exists conversation_messages_provider_unique
  on public.conversation_messages(organization_id, channel, provider_message_id)
  where provider_message_id is not null;
create index if not exists conversation_messages_thread_idx
  on public.conversation_messages(organization_id, conversation_id, created_at desc);
create index if not exists conversation_messages_approval_idx
  on public.conversation_messages(organization_id, requires_approval, status, created_at desc);

create table if not exists public.operator_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.sales_conversations(id) on delete cascade,
  message_id uuid references public.conversation_messages(id) on delete cascade,
  brief_type text not null check (brief_type in ('INBOUND','OUTBOUND_PREVIEW','HOT_LEAD','HANDOFF','DAILY_REPORT')),
  language text not null default 'fa',
  title text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  requires_action boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists operator_briefs_conversation_idx
  on public.operator_briefs(organization_id, conversation_id, created_at desc);
create index if not exists operator_briefs_action_idx
  on public.operator_briefs(organization_id, requires_action, created_at desc);

alter table public.conversation_messages enable row level security;
alter table public.operator_briefs enable row level security;

create policy org_member_conversation_messages on public.conversation_messages
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy org_member_operator_briefs on public.operator_briefs
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

grant select, insert, update, delete on public.conversation_messages to authenticated;
grant select, insert, update, delete on public.operator_briefs to authenticated;
