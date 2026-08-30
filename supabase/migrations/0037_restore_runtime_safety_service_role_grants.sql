grant usage on schema public to service_role;

grant select on table public.system_controls to service_role;
grant select on table public.cost_guard_settings to service_role;
grant select, insert on table public.usage_events to service_role;
