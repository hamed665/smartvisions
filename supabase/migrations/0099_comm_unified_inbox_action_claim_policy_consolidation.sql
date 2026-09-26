-- 0099: COMM-UNIFIED-INBOX action claim RLS policy consolidation.
--
-- Performance-only policy consolidation after 0098. The two legacy/admin and
-- scoped-manager permissive branches are preserved exactly, but expressed as
-- one SELECT policy and one INSERT policy so PostgreSQL evaluates one
-- permissive policy per action.

drop policy if exists chatwoot_bridge_command_claims_admin_read
  on public.chatwoot_bridge_command_claims;
drop policy if exists chatwoot_bridge_command_claims_unified_inbox_read
  on public.chatwoot_bridge_command_claims;

create policy chatwoot_bridge_command_claims_read
on public.chatwoot_bridge_command_claims
for select
to authenticated
using (
  public.chatwoot_bridge_can_read(organization_id)
  or (
    entity_type = 'UNIFIED_INBOX_PROJECTION'
    and public.can_manage_unified_inbox_projection(organization_id, entity_id)
  )
);

drop policy if exists chatwoot_bridge_command_claims_owner_insert
  on public.chatwoot_bridge_command_claims;
drop policy if exists chatwoot_bridge_command_claims_unified_inbox_insert
  on public.chatwoot_bridge_command_claims;

create policy chatwoot_bridge_command_claims_insert
on public.chatwoot_bridge_command_claims
for insert
to authenticated
with check (
  public.chatwoot_bridge_can_manage(organization_id)
  or (
    entity_type = 'UNIFIED_INBOX_PROJECTION'
    and created_by_user_id = (select auth.uid())
    and public.can_manage_unified_inbox_projection(organization_id, entity_id)
  )
);
