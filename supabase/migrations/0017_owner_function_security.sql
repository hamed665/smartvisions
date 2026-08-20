create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists(
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.role = 'OWNER'
  );
$$;
