-- Cost Guard runtime needs only read access to guard settings and read/append access to usage events.
-- Keep service_role least-privilege while allowing backend budget enforcement.

grant select on table public.cost_guard_settings to service_role;
grant select, insert on table public.usage_events to service_role;
