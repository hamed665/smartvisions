drop policy if exists org_member_members on public.organization_members;
create policy org_member_members on public.organization_members
for select to authenticated
using (user_id = (select auth.uid()));

create index if not exists organization_members_user_id_idx on public.organization_members(user_id);
create index if not exists agent_runs_org_idx on public.agent_runs(organization_id);
create index if not exists agent_runs_lead_idx on public.agent_runs(lead_id);
create index if not exists agent_runs_conversation_idx on public.agent_runs(conversation_id);
create index if not exists discovery_records_campaign_idx on public.discovery_records(campaign_id);
create index if not exists followup_jobs_lead_idx on public.followup_jobs(lead_id);
create index if not exists followup_jobs_campaign_idx on public.followup_jobs(campaign_id);
create index if not exists handoff_events_org_idx on public.handoff_events(organization_id);
create index if not exists handoff_events_lead_idx on public.handoff_events(lead_id);
create index if not exists handoff_events_conversation_idx on public.handoff_events(conversation_id);
create index if not exists intent_opportunities_campaign_idx on public.intent_opportunities(campaign_id);
create index if not exists knowledge_versions_created_by_idx on public.knowledge_versions(created_by);
create index if not exists lead_sources_org_idx on public.lead_sources(organization_id);
create index if not exists lead_sources_lead_idx on public.lead_sources(lead_id);
create index if not exists leads_business_idx on public.leads(business_id);
create index if not exists outreach_messages_campaign_idx on public.outreach_messages(campaign_id);
create index if not exists outreach_messages_mailbox_idx on public.outreach_messages(mailbox_id);
create index if not exists outreach_messages_variant_idx on public.outreach_messages(message_variant_id);
create index if not exists portfolio_items_org_idx on public.portfolio_items(organization_id);
create index if not exists preview_events_preview_idx on public.preview_events(preview_id);
create index if not exists previews_approved_by_idx on public.previews(approved_by);
create index if not exists prompt_versions_created_by_idx on public.prompt_versions(created_by);
create index if not exists reply_decisions_org_idx on public.reply_decisions(organization_id);
create index if not exists reply_decisions_run_idx on public.reply_decisions(run_id);
create index if not exists reply_decisions_approved_by_idx on public.reply_decisions(approved_by);
create index if not exists reply_events_org_idx on public.reply_events(organization_id);
create index if not exists reply_events_lead_idx on public.reply_events(lead_id);
create index if not exists reply_events_outreach_message_idx on public.reply_events(outreach_message_id);
create index if not exists whatsapp_events_lead_idx on public.whatsapp_events(lead_id);
create index if not exists whatsapp_events_conversation_idx on public.whatsapp_events(conversation_id);