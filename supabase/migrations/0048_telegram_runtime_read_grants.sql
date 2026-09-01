-- Telegram Owner Assistant reads canonical status/before-state data through server-side service-role code.
-- Keep browser roles unchanged and grant only the read privileges required by existing Telegram flows.

grant select on table public.campaigns to service_role;
grant select on table public.market_settings to service_role;
grant select on table public.discovery_records to service_role;
