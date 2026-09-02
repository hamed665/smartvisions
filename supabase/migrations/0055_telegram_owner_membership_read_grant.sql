-- Telegram panel parity executes existing Control Center Server Actions through
-- a service-role Supabase client, and resolves the single canonical OWNER from
-- organization_members before entering the server-only operator context.
--
-- Supabase Data API table grants are separate from RLS. Keep this privilege
-- deliberately minimal: Telegram needs to read OWNER membership only; it must
-- not mutate organization membership through this path.

grant select on table public.organization_members to service_role;
