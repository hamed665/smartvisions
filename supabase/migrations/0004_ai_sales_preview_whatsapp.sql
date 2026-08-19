create table public.sales_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  channel text not null check (channel in ('EMAIL','WHATSAPP','INSTAGRAM','WEB','OTHER')),
  agent_mode public.agent_mode not null default 'AUTO',
  summary text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sales_conversations_lead_idx on public.sales_conversations(organization_id, lead_id, updated_at desc);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  conversation_id uuid references public.sales_conversations(id) on delete cascade,
  input_message text not null,
  routed_agents jsonb not null default '[]'::jsonb,
  status text not null default 'COMPLETED',
  trace jsonb not null default '{}'::jsonb,
  prompt_version integer,
  knowledge_version integer,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.agent_outputs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  agent_name text not null,
  confidence numeric not null check (confidence between 0 and 1),
  summary text not null,
  data jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index agent_outputs_run_idx on public.agent_outputs(organization_id, run_id);

create table public.reply_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  commercial_decision jsonb not null,
  customer_draft text,
  draft_language text,
  relevance_passed boolean not null default false,
  delivery text not null check (delivery in ('SEND','REVIEW','BLOCK')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.handoff_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  conversation_id uuid references public.sales_conversations(id) on delete cascade,
  from_mode public.agent_mode not null,
  to_mode public.agent_mode not null,
  reasons jsonb not null default '[]'::jsonb,
  actor_type text not null default 'SYSTEM',
  actor_id text,
  created_at timestamptz not null default now()
);

create table public.preview_templates (
  id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vertical text not null,
  name text not null,
  active boolean not null default true,
  quality_tier text not null default 'PREMIUM',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create table public.previews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  template_id text,
  public_token uuid not null default gen_random_uuid() unique,
  vertical text not null,
  status text not null default 'GENERATED' check (status in ('GENERATED','QUALITY_FAILED','APPROVED','SENT','VIEWED','EXPIRED','ARCHIVED')),
  payload jsonb not null,
  quality_score integer not null check (quality_score between 0 and 100),
  quality_checks jsonb not null default '{}'::jsonb,
  quality_blockers jsonb not null default '[]'::jsonb,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  sent_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index previews_lead_idx on public.previews(organization_id, lead_id, created_at desc);
create index previews_status_idx on public.previews(organization_id, status, created_at desc);

create table public.preview_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  preview_id uuid not null references public.previews(id) on delete cascade,
  event_type text not null check (event_type in ('OFFERED','ACCEPTED','GENERATED','QUALITY_FAILED','APPROVED','SENT','VIEWED','HOT','WON')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index preview_events_idx on public.preview_events(organization_id, preview_id, created_at);

create table public.whatsapp_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  conversation_id uuid references public.sales_conversations(id) on delete cascade,
  provider_message_id text not null,
  direction text not null check (direction in ('INBOUND','OUTBOUND','STATUS')),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, provider_message_id, direction, event_type)
);

alter table public.sales_conversations enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_outputs enable row level security;
alter table public.reply_decisions enable row level security;
alter table public.handoff_events enable row level security;
alter table public.preview_templates enable row level security;
alter table public.previews enable row level security;
alter table public.preview_events enable row level security;
alter table public.whatsapp_events enable row level security;

create policy org_member_sales_conversations on public.sales_conversations for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_agent_runs on public.agent_runs for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_agent_outputs on public.agent_outputs for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_reply_decisions on public.reply_decisions for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_handoff_events on public.handoff_events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_preview_templates on public.preview_templates for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_previews on public.previews for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_preview_events on public.preview_events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy org_member_whatsapp_events on public.whatsapp_events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
