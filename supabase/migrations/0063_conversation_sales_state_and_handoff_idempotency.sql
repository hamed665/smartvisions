alter table public.sales_conversations
  add column if not exists sales_state jsonb not null default '{}'::jsonb,
  add column if not exists sales_state_updated_at timestamptz;

alter table public.handoff_events
  add column if not exists request_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sales_conversations'::regclass
      and conname = 'sales_conversations_sales_state_object_check'
  ) then
    alter table public.sales_conversations
      add constraint sales_conversations_sales_state_object_check
      check (jsonb_typeof(sales_state) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.handoff_events'::regclass
      and conname = 'handoff_events_request_key_length_check'
  ) then
    alter table public.handoff_events
      add constraint handoff_events_request_key_length_check
      check (request_key is null or length(request_key) between 8 and 240);
  end if;
end
$$;

create unique index if not exists handoff_events_request_key_unique
  on public.handoff_events(organization_id, request_key)
  where request_key is not null;

create index if not exists handoff_events_conversation_recent_idx
  on public.handoff_events(organization_id, conversation_id, created_at desc);
