-- Keep one member SELECT policy per control-plane table and split OWNER writes by command.
-- This avoids overlapping permissive SELECT policies while preserving owner-only mutations.

-- market_settings
drop policy if exists org_owner_markets_write on public.market_settings;
create policy org_owner_markets_insert on public.market_settings for insert with check (public.is_org_owner(organization_id));
create policy org_owner_markets_update on public.market_settings for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_markets_delete on public.market_settings for delete using (public.is_org_owner(organization_id));

-- services
drop policy if exists org_owner_services_write on public.services;
create policy org_owner_services_insert on public.services for insert with check (public.is_org_owner(organization_id));
create policy org_owner_services_update on public.services for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_services_delete on public.services for delete using (public.is_org_owner(organization_id));

-- service_prices
drop policy if exists org_owner_prices_write on public.service_prices;
create policy org_owner_prices_insert on public.service_prices for insert with check (public.is_org_owner(organization_id));
create policy org_owner_prices_update on public.service_prices for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_prices_delete on public.service_prices for delete using (public.is_org_owner(organization_id));

-- system_controls
drop policy if exists org_owner_controls_write on public.system_controls;
create policy org_owner_controls_insert on public.system_controls for insert with check (public.is_org_owner(organization_id));
create policy org_owner_controls_update on public.system_controls for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_controls_delete on public.system_controls for delete using (public.is_org_owner(organization_id));

-- prompt_versions
drop policy if exists org_owner_prompts_write on public.prompt_versions;
create policy org_owner_prompts_insert on public.prompt_versions for insert with check (public.is_org_owner(organization_id));
create policy org_owner_prompts_update on public.prompt_versions for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_prompts_delete on public.prompt_versions for delete using (public.is_org_owner(organization_id));

-- knowledge_versions
drop policy if exists org_owner_knowledge_write on public.knowledge_versions;
create policy org_owner_knowledge_insert on public.knowledge_versions for insert with check (public.is_org_owner(organization_id));
create policy org_owner_knowledge_update on public.knowledge_versions for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_knowledge_delete on public.knowledge_versions for delete using (public.is_org_owner(organization_id));

-- agent_settings
drop policy if exists org_owner_agent_settings_write on public.agent_settings;
create policy org_owner_agent_settings_insert on public.agent_settings for insert with check (public.is_org_owner(organization_id));
create policy org_owner_agent_settings_update on public.agent_settings for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_agent_settings_delete on public.agent_settings for delete using (public.is_org_owner(organization_id));

-- approval_rules
drop policy if exists org_owner_approval_rules_write on public.approval_rules;
create policy org_owner_approval_rules_insert on public.approval_rules for insert with check (public.is_org_owner(organization_id));
create policy org_owner_approval_rules_update on public.approval_rules for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_approval_rules_delete on public.approval_rules for delete using (public.is_org_owner(organization_id));

-- locale_profiles
drop policy if exists org_owner_locale_profiles_write on public.locale_profiles;
create policy org_owner_locale_profiles_insert on public.locale_profiles for insert with check (public.is_org_owner(organization_id));
create policy org_owner_locale_profiles_update on public.locale_profiles for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_locale_profiles_delete on public.locale_profiles for delete using (public.is_org_owner(organization_id));

-- mailboxes
drop policy if exists org_owner_mailboxes_write on public.mailboxes;
create policy org_owner_mailboxes_insert on public.mailboxes for insert with check (public.is_org_owner(organization_id));
create policy org_owner_mailboxes_update on public.mailboxes for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_mailboxes_delete on public.mailboxes for delete using (public.is_org_owner(organization_id));

-- outreach_policies
drop policy if exists org_owner_outreach_policies_write on public.outreach_policies;
create policy org_owner_outreach_policies_insert on public.outreach_policies for insert with check (public.is_org_owner(organization_id));
create policy org_owner_outreach_policies_update on public.outreach_policies for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_outreach_policies_delete on public.outreach_policies for delete using (public.is_org_owner(organization_id));

-- portfolio_items
drop policy if exists org_owner_portfolio_items_write on public.portfolio_items;
create policy org_owner_portfolio_items_insert on public.portfolio_items for insert with check (public.is_org_owner(organization_id));
create policy org_owner_portfolio_items_update on public.portfolio_items for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_portfolio_items_delete on public.portfolio_items for delete using (public.is_org_owner(organization_id));

-- preview_templates
drop policy if exists org_owner_preview_templates_write on public.preview_templates;
create policy org_owner_preview_templates_insert on public.preview_templates for insert with check (public.is_org_owner(organization_id));
create policy org_owner_preview_templates_update on public.preview_templates for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_preview_templates_delete on public.preview_templates for delete using (public.is_org_owner(organization_id));

-- organization_settings
drop policy if exists org_owner_organization_settings_write on public.organization_settings;
create policy org_owner_organization_settings_insert on public.organization_settings for insert with check (public.is_org_owner(organization_id));
create policy org_owner_organization_settings_update on public.organization_settings for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_organization_settings_delete on public.organization_settings for delete using (public.is_org_owner(organization_id));

-- message_templates
drop policy if exists org_owner_message_templates_write on public.message_templates;
create policy org_owner_message_templates_insert on public.message_templates for insert with check (public.is_org_owner(organization_id));
create policy org_owner_message_templates_update on public.message_templates for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_message_templates_delete on public.message_templates for delete using (public.is_org_owner(organization_id));

-- automation_rules
drop policy if exists org_owner_automation_rules_write on public.automation_rules;
create policy org_owner_automation_rules_insert on public.automation_rules for insert with check (public.is_org_owner(organization_id));
create policy org_owner_automation_rules_update on public.automation_rules for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_automation_rules_delete on public.automation_rules for delete using (public.is_org_owner(organization_id));

-- integration_connections
drop policy if exists org_owner_integration_connections_write on public.integration_connections;
create policy org_owner_integration_connections_insert on public.integration_connections for insert with check (public.is_org_owner(organization_id));
create policy org_owner_integration_connections_update on public.integration_connections for update using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy org_owner_integration_connections_delete on public.integration_connections for delete using (public.is_org_owner(organization_id));
