create table if not exists public.voice_transcriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.sales_conversations(id) on delete set null,
  provider_message_id text not null,
  media_id text not null,
  provider text not null default 'META_WHATSAPP',
  mime_type text,
  status text not null default 'PROCESSING' check (status in ('PROCESSING','SUCCEEDED','FAILED')),
  model text,
  transcript text,
  detected_language text,
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  estimated_cost_usd numeric not null default 0 check (estimated_cost_usd >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, provider_message_id),
  unique (organization_id, media_id)
);

create index if not exists voice_transcriptions_lead_idx
  on public.voice_transcriptions(organization_id, lead_id, created_at desc);
create index if not exists voice_transcriptions_status_idx
  on public.voice_transcriptions(organization_id, status, created_at desc);

alter table public.voice_transcriptions enable row level security;

drop policy if exists org_member_voice_transcriptions on public.voice_transcriptions;
create policy org_member_voice_transcriptions on public.voice_transcriptions for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
