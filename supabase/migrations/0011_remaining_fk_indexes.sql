create index if not exists agent_outputs_run_fk_idx on public.agent_outputs(run_id);
create index if not exists outreach_messages_lead_fk_idx on public.outreach_messages(lead_id);
create index if not exists previews_lead_fk_idx on public.previews(lead_id);
create index if not exists sales_conversations_lead_fk_idx on public.sales_conversations(lead_id);
create index if not exists website_audits_business_fk_idx on public.website_audits(business_id);