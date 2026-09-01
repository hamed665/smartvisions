-- Telegram Owner Assistant executes only confirmed owner mutations through server-side service-role code.
-- Keep browser roles unchanged and grant only the table privileges required by those canonical mutations.

grant update on table public.system_controls to service_role;
grant insert, update on table public.campaigns to service_role;
grant insert on table public.discovery_records to service_role;
grant update on table public.services to service_role;
grant update on table public.service_prices to service_role;
grant update on table public.market_settings to service_role;
