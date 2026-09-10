create unique index if not exists outreach_provider_message_unique
  on public.outreach_messages (organization_id, provider_message_id);
