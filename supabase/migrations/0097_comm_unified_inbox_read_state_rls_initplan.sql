-- 0097: COMM-UNIFIED-INBOX read-state RLS initPlan hardening.
--
-- Performance-only policy hardening. Authorization semantics remain unchanged:
-- authenticated users can mutate only their own readable conversation state,
-- and only through the governed read-state command path.

create or replace function public.unified_inbox_read_state_command_enabled()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(
    current_setting('smartvisions.unified_inbox_read_state_command', true),
    ''
  ) = '1'
$$;

revoke all on function public.unified_inbox_read_state_command_enabled()
  from public, anon, service_role;
grant execute on function public.unified_inbox_read_state_command_enabled()
  to authenticated;

drop policy if exists unified_inbox_user_states_insert
  on public.unified_inbox_user_states;
create policy unified_inbox_user_states_insert
on public.unified_inbox_user_states
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.unified_inbox_read_state_command_enabled())
  and public.can_read_unified_inbox_conversation(organization_id, conversation_id)
);

drop policy if exists unified_inbox_user_states_update
  on public.unified_inbox_user_states;
create policy unified_inbox_user_states_update
on public.unified_inbox_user_states
for update
to authenticated
using (
  user_id = (select auth.uid())
  and (select public.unified_inbox_read_state_command_enabled())
  and public.can_read_unified_inbox_conversation(organization_id, conversation_id)
)
with check (
  user_id = (select auth.uid())
  and (select public.unified_inbox_read_state_command_enabled())
  and public.can_read_unified_inbox_conversation(organization_id, conversation_id)
);
