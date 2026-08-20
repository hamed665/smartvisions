create or replace function public.bootstrap_first_owner()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_org_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('smartvisions:first-owner'));

  if exists (select 1 from public.organization_members) then
    return new;
  end if;

  select id into v_org_id
  from public.organizations
  where name = 'Smart Visions'
  order by created_at asc
  limit 1;

  if v_org_id is null then
    raise exception 'Smart Visions organization is not initialized';
  end if;

  insert into public.organization_members(organization_id, user_id, role)
  values (v_org_id, new.id, 'OWNER')
  on conflict (organization_id, user_id) do nothing;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id, after_data
  ) values (
    v_org_id, 'SYSTEM', 'auth-bootstrap', 'FIRST_OWNER_ASSIGNED', 'user', new.id::text,
    jsonb_build_object('role','OWNER')
  );

  return new;
end;
$$;

revoke all on function public.bootstrap_first_owner() from public, anon, authenticated;
grant execute on function public.bootstrap_first_owner() to postgres;

drop trigger if exists on_auth_user_created_assign_first_owner on auth.users;
create trigger on_auth_user_created_assign_first_owner
after insert on auth.users
for each row execute function public.bootstrap_first_owner();
