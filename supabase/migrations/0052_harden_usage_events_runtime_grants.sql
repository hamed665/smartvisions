-- Existing project-level/default grants had expanded usage_events beyond the
-- least privileges documented in migrations 0019/0021. Restore the canonical
-- contract before atomic settlement relies on this ledger.

revoke update, delete, truncate, references, trigger
  on table public.usage_events from authenticated;

revoke update, delete, truncate, references, trigger
  on table public.usage_events from service_role;

-- Operator clients can read and append usage evidence. RLS continues to enforce
-- organization membership/owner insertion rules.
grant select, insert on table public.usage_events to authenticated;

-- Backend provider runtimes can read/append the ledger and settle only the
-- accounting fields of a reservation they already created.
grant select, insert on table public.usage_events to service_role;
grant update (cost_usd, input_tokens, output_tokens, units, metadata)
  on table public.usage_events to service_role;
