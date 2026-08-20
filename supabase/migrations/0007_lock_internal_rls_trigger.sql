-- The dashboard-created automatic RLS event trigger is internal infrastructure.
-- It must never be executable by API roles.
revoke all on function public.rls_auto_enable() from public;
revoke all on function public.rls_auto_enable() from anon;
revoke all on function public.rls_auto_enable() from authenticated;