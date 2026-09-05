alter function public.release_human_takeover(uuid, uuid) security invoker;

revoke all on function public.release_human_takeover(uuid, uuid) from public;
revoke all on function public.release_human_takeover(uuid, uuid) from anon;
grant execute on function public.release_human_takeover(uuid, uuid) to authenticated;
