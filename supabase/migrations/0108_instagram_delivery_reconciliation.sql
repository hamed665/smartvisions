-- 0108: Provider delivery/read reconciliation fields and service-only Instagram receipt command.
-- Generic message fields avoid a second Instagram status store; instagram_events remains the durable provider journal.

alter table public.conversation_messages
  add column if not exists provider_delivery_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz;

alter table public.conversation_messages
  drop constraint if exists conversation_messages_provider_delivery_status_check;
alter table public.conversation_messages
  add constraint conversation_messages_provider_delivery_status_check
  check (provider_delivery_status is null or provider_delivery_status in ('ACCEPTED','DELIVERED','READ','FAILED'));

create index if not exists conversation_messages_provider_delivery_lookup_idx
  on public.conversation_messages (organization_id, channel, provider_message_id)
  where provider_message_id is not null;

create or replace function public.reconcile_instagram_message_receipt(
  p_organization_id uuid,
  p_provider_message_id text,
  p_receipt_type text,
  p_occurred_at timestamptz
)
returns table(message_id uuid, delivery_status text, changed boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_id uuid;
  v_current text;
  v_next text := upper(trim(coalesce(p_receipt_type,'')));
  v_changed boolean := false;
  v_at timestamptz := coalesce(p_occurred_at, now());
begin
  if length(trim(coalesce(p_provider_message_id,''))) not between 1 and 500 then
    raise exception 'provider message id required';
  end if;
  if v_next not in ('DELIVERED','READ') then
    raise exception 'unsupported Instagram receipt type';
  end if;

  select cm.id, cm.provider_delivery_status into v_id, v_current
    from public.conversation_messages cm
   where cm.organization_id=p_organization_id
     and cm.channel='INSTAGRAM'
     and cm.direction='OUTBOUND'
     and cm.provider_message_id=trim(p_provider_message_id)
   for update;

  if v_id is null then
    return;
  end if;

  -- Status is monotonic: READ > DELIVERED > ACCEPTED/null.
  if v_next='READ' and coalesce(v_current,'') <> 'READ' then
    update public.conversation_messages
       set provider_delivery_status='READ',
           delivered_at=coalesce(delivered_at,v_at),
           read_at=coalesce(read_at,v_at),
           processed_at=now()
     where id=v_id and organization_id=p_organization_id;
    v_changed := true;
    v_current := 'READ';
  elsif v_next='DELIVERED' and coalesce(v_current,'') not in ('DELIVERED','READ') then
    update public.conversation_messages
       set provider_delivery_status='DELIVERED',
           delivered_at=coalesce(delivered_at,v_at),
           processed_at=now()
     where id=v_id and organization_id=p_organization_id;
    v_changed := true;
    v_current := 'DELIVERED';
  end if;

  return query select v_id, v_current, v_changed;
end;
$$;

revoke all on function public.reconcile_instagram_message_receipt(uuid,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.reconcile_instagram_message_receipt(uuid,text,text,timestamptz)
  to service_role;
