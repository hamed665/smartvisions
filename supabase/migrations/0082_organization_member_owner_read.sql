-- Smart Visions AI Business OS 2027
-- SECTION COMMUNICATION / COMM-TENANT-BRIDGE / Slice C3B read boundary.
-- #208 resolves a target member with an authenticated Organization OWNER.
-- The foundation policy is self-read only, so add the minimum missing OWNER
-- read policy without changing mutation authority.

drop policy if exists organization_members_owner_read
  on public.organization_members;

create policy organization_members_owner_read
  on public.organization_members
  for select
  to authenticated
  using (public.is_org_owner(organization_id));
