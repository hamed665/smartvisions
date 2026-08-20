-- Keep organization membership checks invoker-safe and avoid recursive membership RLS.
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists(
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

drop policy if exists org_member_members on public.organization_members;
create policy org_member_members on public.organization_members
for select
to authenticated
using (user_id = auth.uid());