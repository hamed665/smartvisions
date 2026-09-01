-- Agent runtime context hydration reads these canonical control-plane tables server-side.
-- Keep browser roles unchanged and grant only the least-required read privilege.

grant select on table public.knowledge_versions to service_role;
grant select on table public.prompt_versions to service_role;
grant select on table public.services to service_role;
grant select on table public.service_prices to service_role;
