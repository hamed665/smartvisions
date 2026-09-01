-- Telegram Owner Control Plane: least-privilege access to canonical configuration already used by Growth OS.
-- Browser roles and safety controls are unchanged.

grant select, update on table public.locale_profiles to service_role;
grant select, update on table public.agent_settings to service_role;
grant select, update on table public.cost_guard_settings to service_role;
grant select on table public.outreach_policies to service_role;
grant select on table public.approval_rules to service_role;
