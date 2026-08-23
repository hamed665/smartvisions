-- Restore explicit server-side API privileges for email operational tables.
-- Browser roles are unchanged: anon remains revoked and authenticated remains governed by RLS.

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.mailboxes to service_role;
grant select, insert, update, delete on table public.outreach_messages to service_role;
grant select, insert, update, delete on table public.email_events to service_role;
grant select, insert, update, delete on table public.integration_connections to service_role;
grant select, insert, update, delete on table public.audit_logs to service_role;
grant select, insert, update, delete on table public.usage_events to service_role;

-- Keep future server-only operational tables usable by the service role without
-- broadening browser access. Existing authenticated/anon defaults remain intact.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
