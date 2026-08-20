create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.role = 'OWNER'
  );
$$;

-- Control-plane tables are readable by organization members, but only OWNER may mutate them.
-- Runtime/business workflow tables such as leads and campaigns retain their existing role model.

do $$
begin
  -- Existing configuration tables
  drop policy if exists org_member_markets on public.market_settings;
  create policy org_member_markets_read on public.market_settings for select using (public.is_org_member(organization_id));
  create policy org_owner_markets_write on public.market_settings for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_services on public.services;
  create policy org_member_services_read on public.services for select using (public.is_org_member(organization_id));
  create policy org_owner_services_write on public.services for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_prices on public.service_prices;
  create policy org_member_prices_read on public.service_prices for select using (public.is_org_member(organization_id));
  create policy org_owner_prices_write on public.service_prices for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_controls on public.system_controls;
  create policy org_member_controls_read on public.system_controls for select using (public.is_org_member(organization_id));
  create policy org_owner_controls_write on public.system_controls for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_prompts on public.prompt_versions;
  create policy org_member_prompts_read on public.prompt_versions for select using (public.is_org_member(organization_id));
  create policy org_owner_prompts_write on public.prompt_versions for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_knowledge on public.knowledge_versions;
  create policy org_member_knowledge_read on public.knowledge_versions for select using (public.is_org_member(organization_id));
  create policy org_owner_knowledge_write on public.knowledge_versions for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_agent_settings on public.agent_settings;
  create policy org_member_agent_settings_read on public.agent_settings for select using (public.is_org_member(organization_id));
  create policy org_owner_agent_settings_write on public.agent_settings for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_approval_rules on public.approval_rules;
  create policy org_member_approval_rules_read on public.approval_rules for select using (public.is_org_member(organization_id));
  create policy org_owner_approval_rules_write on public.approval_rules for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_locale_profiles on public.locale_profiles;
  create policy org_member_locale_profiles_read on public.locale_profiles for select using (public.is_org_member(organization_id));
  create policy org_owner_locale_profiles_write on public.locale_profiles for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_mailboxes on public.mailboxes;
  create policy org_member_mailboxes_read on public.mailboxes for select using (public.is_org_member(organization_id));
  create policy org_owner_mailboxes_write on public.mailboxes for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_outreach_policies on public.outreach_policies;
  create policy org_member_outreach_policies_read on public.outreach_policies for select using (public.is_org_member(organization_id));
  create policy org_owner_outreach_policies_write on public.outreach_policies for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_portfolio_items on public.portfolio_items;
  create policy org_member_portfolio_items_read on public.portfolio_items for select using (public.is_org_member(organization_id));
  create policy org_owner_portfolio_items_write on public.portfolio_items for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_preview_templates on public.preview_templates;
  create policy org_member_preview_templates_read on public.preview_templates for select using (public.is_org_member(organization_id));
  create policy org_owner_preview_templates_write on public.preview_templates for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  -- Control Center v1 tables
  drop policy if exists org_member_organization_settings on public.organization_settings;
  create policy org_member_organization_settings_read on public.organization_settings for select using (public.is_org_member(organization_id));
  create policy org_owner_organization_settings_write on public.organization_settings for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_message_templates on public.message_templates;
  create policy org_member_message_templates_read on public.message_templates for select using (public.is_org_member(organization_id));
  create policy org_owner_message_templates_write on public.message_templates for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_automation_rules on public.automation_rules;
  create policy org_member_automation_rules_read on public.automation_rules for select using (public.is_org_member(organization_id));
  create policy org_owner_automation_rules_write on public.automation_rules for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

  drop policy if exists org_member_integration_connections on public.integration_connections;
  create policy org_member_integration_connections_read on public.integration_connections for select using (public.is_org_member(organization_id));
  create policy org_owner_integration_connections_write on public.integration_connections for all using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
end $$;
