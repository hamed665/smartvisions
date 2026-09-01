-- Keep Telegram runtime tables server-only and least-privilege.
-- Supabase default privileges may grant service_role broader table rights on newly created tables,
-- so explicitly narrow them after creation.

revoke all on table public.telegram_command_runs from service_role;
revoke all on table public.telegram_notification_events from service_role;

grant select, insert, update on table public.telegram_command_runs to service_role;
grant select, insert, update on table public.telegram_notification_events to service_role;

revoke all on table public.telegram_command_runs from anon, authenticated;
revoke all on table public.telegram_notification_events from anon, authenticated;
