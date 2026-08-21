create policy org_member_audit_insert
on public.audit_logs
for insert
to authenticated
with check (
  public.is_org_member(organization_id)
  and (
    actor_type <> 'USER'
    or actor_id = auth.uid()::text
  )
);
