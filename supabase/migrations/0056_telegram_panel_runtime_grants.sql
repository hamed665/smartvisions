-- Runtime grants for Telegram Control Center parity.
-- Telegram reuses the existing owner-only Server Actions through a server-side
-- service_role client. Supabase Data API table grants are separate from RLS,
-- so grant only the DML those mapped actions actually need. No DELETE grants.

GRANT SELECT, INSERT, UPDATE ON TABLE public.services TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.service_prices TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.market_settings TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.locale_profiles TO service_role;
GRANT SELECT, UPDATE ON TABLE public.agent_settings TO service_role;
GRANT SELECT, UPDATE ON TABLE public.approval_rules TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.campaigns TO service_role;
GRANT SELECT, UPDATE ON TABLE public.outreach_policies TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.message_templates TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.automation_rules TO service_role;
GRANT SELECT, UPDATE ON TABLE public.integration_connections TO service_role;
GRANT SELECT, UPDATE ON TABLE public.organizations TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_settings TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.knowledge_versions TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.prompt_versions TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.leads TO service_role;
GRANT SELECT, INSERT ON TABLE public.suppression_list TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.portfolio_items TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.preview_templates TO service_role;
GRANT SELECT, UPDATE ON TABLE public.sales_conversations TO service_role;
GRANT SELECT, UPDATE ON TABLE public.mailboxes TO service_role;
GRANT SELECT, UPDATE ON TABLE public.message_variants TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.growth_opportunities TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.website_audits TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.preview_events TO service_role;

-- Identity lookup remains read-only.
GRANT SELECT ON TABLE public.organization_members TO service_role;
