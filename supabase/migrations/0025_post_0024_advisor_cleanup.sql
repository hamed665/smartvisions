drop index if exists public.businesses_org_google_place_uidx;

drop policy if exists org_member_audit_insert on public.audit_logs;
create policy org_member_audit_insert
on public.audit_logs
for insert
to authenticated
with check (
  public.is_org_member(organization_id)
  and (
    actor_type <> 'USER'
    or actor_id = (select auth.uid())::text
  )
);
