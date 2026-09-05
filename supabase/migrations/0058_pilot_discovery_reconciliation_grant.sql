-- Pilot acquisition persists a discovery journal before paid qualification and
-- reconciles that same row after the provider result is durably settled.
-- Keep this grant intentionally minimal: the runtime already has SELECT/INSERT
-- and only needs UPDATE for the reconciliation step.
grant update on table public.discovery_records to service_role;
