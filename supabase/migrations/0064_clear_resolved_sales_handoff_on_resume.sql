create or replace function public.clear_resolved_sales_handoff_on_resume()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.agent_mode = 'HUMAN'::public.agent_mode
     and new.agent_mode = 'AUTO'::public.agent_mode then
    new.sales_state := coalesce(new.sales_state, '{}'::jsonb)
      || jsonb_build_object(
        'pendingHandoffReasons', '[]'::jsonb,
        'humanConfirmationRequired', false,
        'customQuoteRequired', false,
        'missingRequiredInfo', '[]'::jsonb,
        'nextAction', 'ANSWER'
      );
    new.sales_state_updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.clear_resolved_sales_handoff_on_resume() from public;
revoke all on function public.clear_resolved_sales_handoff_on_resume() from anon;

DROP TRIGGER IF EXISTS sales_conversations_clear_resolved_handoff_on_resume ON public.sales_conversations;
create trigger sales_conversations_clear_resolved_handoff_on_resume
before update of agent_mode on public.sales_conversations
for each row
when (old.agent_mode is distinct from new.agent_mode)
execute function public.clear_resolved_sales_handoff_on_resume();
