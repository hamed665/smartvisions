# Telegram panel parity runtime grants

The Telegram owner assistant invokes the same Control Center Server Actions under a server-only OWNER operator context. Supabase Data API table grants are separate from RLS, so the service-role client needs explicit access to the tables touched by those mapped actions.

Migration `0056_telegram_panel_runtime_grants.sql` grants only SELECT/INSERT/UPDATE where needed. It grants no DELETE privilege and keeps `organization_members` read-only for owner identity lookup.

This avoids piecemeal permission failures such as `/rescore` reaching the canonical action but failing on `website_audits` or `growth_opportunities` after confirmation.
