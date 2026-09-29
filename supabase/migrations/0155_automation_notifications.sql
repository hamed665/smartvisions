-- 0155: AUTO-NOTIFICATIONS
-- Notification projection and preference governance over canonical audit/runtime/
-- approval events. This does not create a second event bus, workflow runtime,
-- provider-send authority or notification work queue.

create table public.notification_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  in_app_enabled boolean not null default true,
  telegram_enabled boolean not null default true,
  email_enabled boolean not null default false,
  push_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  minimum_severity text not null default 'MEDIUM'
    check (minimum_severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  escalation_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (organization_id,user_id),
  constraint notification_preferences_member_fk
    foreign key (organization_id,user_id)
    references public.organization_members(organization_id,user_id)
    on delete cascade
);

comment on table public.notification_preferences is
  'Per-member notification delivery preferences only. This table owns no business event or alert truth.';


create table public.notification_projection_checkpoints (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  cutover_at timestamptz not null,
  last_scanned_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check (last_scanned_at>=cutover_at)
);

comment on table public.notification_projection_checkpoints is
  'Internal projection watermark over canonical audit_logs. Existing Organizations start at migration cutover so historical alerts are never replayed on AUTO-NOTIFICATIONS activation.';

insert into public.notification_projection_checkpoints(
  organization_id,cutover_at,last_scanned_at
)
select id,now(),now()
from public.organizations
on conflict(organization_id) do nothing;

create table public.notification_inbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_user_id uuid not null,
  source_audit_log_id uuid not null references public.audit_logs(id) on delete restrict,
  event_key text not null,
  notification_type text not null check (notification_type in (
    'APPROVAL_ESCALATED','APPROVAL_EXPIRED','AUTOMATION_DEAD_LETTER'
  )),
  severity text not null check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  title text not null,
  body text not null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  escalation_level smallint not null default 0 check (escalation_level between 0 and 2),
  escalates_at timestamptz,
  escalated_at timestamptz,
  read_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint notification_inbox_member_fk
    foreign key (organization_id,recipient_user_id)
    references public.organization_members(organization_id,user_id)
    on delete cascade,
  constraint notification_inbox_event_key_check
    check (
      length(event_key) between 8 and 240
      and event_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  constraint notification_inbox_title_check
    check (length(btrim(title)) between 1 and 240),
  constraint notification_inbox_body_check
    check (length(btrim(body)) between 1 and 4000),
  constraint notification_inbox_payload_check
    check (
      jsonb_typeof(payload)='object'
      and octet_length(payload::text)<=32768
    ),
  constraint notification_inbox_ack_check
    check (
      acknowledged_at is null
      or read_at is not null
    ),
  unique (organization_id,recipient_user_id,event_key),
  unique (organization_id,id)
);

comment on table public.notification_inbox is
  'Per-member in-app projection derived from canonical audit/runtime/approval evidence. It is a read model, not event truth or a notification queue.';

create table public.notification_delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  notification_id uuid not null,
  recipient_user_id uuid not null,
  channel text not null check (channel in ('TELEGRAM','EMAIL','PUSH','SMS')),
  escalation_level smallint not null check (escalation_level between 0 and 2),
  status text not null check (status in (
    'SENT','FAILED','BLOCKED_EXTERNAL','SKIPPED','DUPLICATE'
  )),
  provider_message_id text,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_delivery_notification_fk
    foreign key (organization_id,notification_id)
    references public.notification_inbox(organization_id,id)
    on delete cascade,
  constraint notification_delivery_member_fk
    foreign key (organization_id,recipient_user_id)
    references public.organization_members(organization_id,user_id)
    on delete cascade,
  constraint notification_delivery_reason_check
    check (reason is null or length(reason)<=1000),
  constraint notification_delivery_payload_check
    check (
      jsonb_typeof(payload)='object'
      and octet_length(payload::text)<=16384
    ),
  unique (notification_id,channel,escalation_level)
);

comment on table public.notification_delivery_receipts is
  'Terminal delivery evidence for notification projections. It is not a work queue and does not own provider-send authority.';

create index notification_inbox_recipient_unread_idx
  on public.notification_inbox(
    organization_id,recipient_user_id,created_at desc
  )
  where acknowledged_at is null;

create index notification_inbox_escalation_idx
  on public.notification_inbox(
    organization_id,escalates_at,created_at
  )
  where acknowledged_at is null and escalation_level<2;

create index notification_delivery_recipient_idx
  on public.notification_delivery_receipts(
    organization_id,recipient_user_id,created_at desc
  );

alter table public.notification_preferences enable row level security;
alter table public.notification_projection_checkpoints enable row level security;
alter table public.notification_inbox enable row level security;
alter table public.notification_delivery_receipts enable row level security;

create policy notification_preferences_self_read
on public.notification_preferences
for select
to authenticated
using (
  user_id=(select auth.uid())
  and public.is_org_member(organization_id)
);

create policy notification_projection_checkpoints_service
on public.notification_projection_checkpoints
for all
to service_role
using (true)
with check (true);

create policy notification_inbox_recipient_read
on public.notification_inbox
for select
to authenticated
using (
  recipient_user_id=(select auth.uid())
  and public.is_org_member(organization_id)
);

create policy notification_delivery_recipient_read
on public.notification_delivery_receipts
for select
to authenticated
using (
  recipient_user_id=(select auth.uid())
  and public.is_org_member(organization_id)
);

revoke all on table public.notification_preferences
  from public,anon,authenticated,service_role;
revoke all on table public.notification_projection_checkpoints
  from public,anon,authenticated,service_role;
revoke all on table public.notification_inbox
  from public,anon,authenticated,service_role;
revoke all on table public.notification_delivery_receipts
  from public,anon,authenticated,service_role;

grant select on table public.notification_preferences,
  public.notification_inbox,
  public.notification_delivery_receipts
  to authenticated,service_role;
grant insert,update on table public.notification_preferences,
  public.notification_inbox,
  public.notification_delivery_receipts
  to service_role;
grant select,insert,update on table public.notification_projection_checkpoints
  to service_role;

create or replace function public.guard_notification_projection_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if current_user<>'service_role'
     or coalesce(current_setting('app.notification_projection_mutation',true),'')<>'allowed'
  then
    raise exception 'Notification projection state requires the governed notification boundary';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger notification_preferences_mutation_guard
before insert or update or delete on public.notification_preferences
for each row execute function public.guard_notification_projection_mutation();

create trigger notification_projection_checkpoints_mutation_guard
before insert or update or delete on public.notification_projection_checkpoints
for each row execute function public.guard_notification_projection_mutation();

create trigger notification_inbox_mutation_guard
before insert or update or delete on public.notification_inbox
for each row execute function public.guard_notification_projection_mutation();

create trigger notification_delivery_mutation_guard
before insert or update or delete on public.notification_delivery_receipts
for each row execute function public.guard_notification_projection_mutation();

create or replace function public.notification_severity_rank(p_severity text)
returns integer
language sql
immutable
security invoker
set search_path=public,pg_catalog
as $$
  select case upper(coalesce(p_severity,''))
    when 'LOW' then 1
    when 'MEDIUM' then 2
    when 'HIGH' then 3
    when 'CRITICAL' then 4
    else 0
  end;
$$;

create or replace function public.set_notification_preferences(
  p_organization_id uuid,
  p_user_id uuid,
  p_in_app_enabled boolean,
  p_telegram_enabled boolean,
  p_email_enabled boolean,
  p_push_enabled boolean,
  p_sms_enabled boolean,
  p_minimum_severity text,
  p_escalation_enabled boolean
)
returns public.notification_preferences
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_row public.notification_preferences%rowtype;
  v_severity text:=upper(btrim(coalesce(p_minimum_severity,'')));
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_user_id is null
     or v_severity not in ('LOW','MEDIUM','HIGH','CRITICAL')
  then
    raise exception 'Notification preference payload is invalid';
  end if;

  if not exists(
    select 1
    from public.organization_members m
    where m.organization_id=p_organization_id
      and m.user_id=p_user_id
  ) then
    raise exception 'Notification preference user is not an Organization member';
  end if;

  perform set_config('app.notification_projection_mutation','allowed',true);

  insert into public.notification_preferences(
    organization_id,user_id,
    in_app_enabled,telegram_enabled,email_enabled,push_enabled,sms_enabled,
    minimum_severity,escalation_enabled,updated_at
  ) values (
    p_organization_id,p_user_id,
    coalesce(p_in_app_enabled,true),
    coalesce(p_telegram_enabled,false),
    coalesce(p_email_enabled,false),
    coalesce(p_push_enabled,false),
    coalesce(p_sms_enabled,false),
    v_severity,
    coalesce(p_escalation_enabled,true),
    now()
  )
  on conflict(organization_id,user_id) do update
  set
    in_app_enabled=excluded.in_app_enabled,
    telegram_enabled=excluded.telegram_enabled,
    email_enabled=excluded.email_enabled,
    push_enabled=excluded.push_enabled,
    sms_enabled=excluded.sms_enabled,
    minimum_severity=excluded.minimum_severity,
    escalation_enabled=excluded.escalation_enabled,
    updated_at=now()
  returning * into v_row;

  perform set_config('app.notification_projection_mutation','0',true);
  return v_row;
exception
  when others then
    perform set_config('app.notification_projection_mutation','0',true);
    raise;
end;
$$;

create or replace function public.mark_notification_state(
  p_organization_id uuid,
  p_user_id uuid,
  p_notification_id uuid,
  p_action text
)
returns public.notification_inbox
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_action text:=upper(btrim(coalesce(p_action,'')));
  v_row public.notification_inbox%rowtype;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_user_id is null
     or p_notification_id is null
     or v_action not in ('READ','ACKNOWLEDGE')
  then
    raise exception 'Notification state payload is invalid';
  end if;

  select * into v_row
  from public.notification_inbox n
  where n.organization_id=p_organization_id
    and n.recipient_user_id=p_user_id
    and n.id=p_notification_id
  for update;

  if not found then
    raise exception 'Notification was not found for recipient';
  end if;

  perform set_config('app.notification_projection_mutation','allowed',true);

  update public.notification_inbox
  set
    read_at=coalesce(read_at,now()),
    acknowledged_at=case
      when v_action='ACKNOWLEDGE' then coalesce(acknowledged_at,now())
      else acknowledged_at
    end,
    escalates_at=case
      when v_action='ACKNOWLEDGE' then null
      else escalates_at
    end,
    updated_at=now()
  where id=p_notification_id
  returning * into v_row;

  perform set_config('app.notification_projection_mutation','0',true);
  return v_row;
exception
  when others then
    perform set_config('app.notification_projection_mutation','0',true);
    raise;
end;
$$;

create or replace function public.project_automation_notifications(
  p_organization_id uuid,
  p_limit integer default 200
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_event record;
  v_member record;
  v_reviewer uuid;
  v_type text;
  v_severity text;
  v_title text;
  v_body text;
  v_roles text[];
  v_payload jsonb;
  v_from timestamptz;
  v_until timestamptz:=now();
  v_projected integer:=0;
  v_duplicates integer:=0;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_limit not between 1 and 500
  then
    raise exception 'Automation notification projection is not permitted';
  end if;

  perform set_config('app.notification_projection_mutation','allowed',true);

  select c.last_scanned_at into v_from
  from public.notification_projection_checkpoints c
  where c.organization_id=p_organization_id
  for update;

  if not found then
    select o.created_at into v_from
    from public.organizations o
    where o.id=p_organization_id;

    if v_from is null then
      raise exception 'Automation notification Organization was not found';
    end if;

    insert into public.notification_projection_checkpoints(
      organization_id,cutover_at,last_scanned_at,updated_at
    ) values (
      p_organization_id,v_from,v_from,now()
    );
  end if;

  for v_event in
    select a.*
    from public.audit_logs a
    where a.organization_id=p_organization_id
      and a.created_at>v_from
      and a.created_at<=v_until
      and a.action in (
        'MESSAGE_APPROVAL_ESCALATED',
        'MESSAGE_APPROVAL_EXPIRED',
        'AUTOMATION_RUN_DEAD_LETTER'
      )
    order by a.created_at,a.id
    limit p_limit
  loop
    v_reviewer:=null;

    if v_event.action='MESSAGE_APPROVAL_ESCALATED' then
      v_type:='APPROVAL_ESCALATED';
      v_severity:='HIGH';
      v_title:='Approval needs attention';
      v_body:='A governed approval reached its escalation deadline and still needs a reviewer.';
      v_roles:=array['OWNER','ADMIN','SALES_MANAGER']::text[];

      select m.approval_reviewer_user_id into v_reviewer
      from public.conversation_messages m
      where m.organization_id=p_organization_id
        and m.id::text=v_event.entity_id
      limit 1;

    elsif v_event.action='MESSAGE_APPROVAL_EXPIRED' then
      v_type:='APPROVAL_EXPIRED';
      v_severity:='HIGH';
      v_title:='Approval expired';
      v_body:='A governed approval expired without a decision and failed closed.';
      v_roles:=array['OWNER','ADMIN','SALES_MANAGER']::text[];

    else
      v_type:='AUTOMATION_DEAD_LETTER';
      v_severity:='CRITICAL';
      v_title:='Automation run requires attention';
      v_body:=case
        when coalesce((v_event.after_data->>'compensationRequired')::integer,0)>0
          then 'An Automation run entered dead-letter state and prior side effects require compensation review.'
        else 'An Automation run entered dead-letter state and requires operator review.'
      end;
      v_roles:=array['OWNER','ADMIN']::text[];
    end if;

    v_payload:=jsonb_strip_nulls(jsonb_build_object(
      'sourceAction',v_event.action,
      'sourceAuditLogId',v_event.id,
      'correlationId',v_event.correlation_id,
      'actionKey',v_event.after_data->>'actionKey',
      'failedActionId',v_event.after_data->>'failedActionId',
      'attemptCount',v_event.after_data->>'attemptCount',
      'compensationRequired',v_event.after_data->>'compensationRequired',
      'decision',v_event.after_data->>'decision',
      'policyMode',v_event.after_data->>'policyMode'
    ));

    for v_member in
      select m.user_id,m.role
      from public.organization_members m
      where m.organization_id=p_organization_id
        and (
          m.role=any(v_roles)
          or (v_reviewer is not null and m.user_id=v_reviewer)
        )
      order by m.user_id
    loop
      insert into public.notification_inbox(
        organization_id,recipient_user_id,source_audit_log_id,event_key,
        notification_type,severity,title,body,entity_type,entity_id,payload,
        escalation_level,escalates_at,created_at,updated_at
      ) values (
        p_organization_id,v_member.user_id,v_event.id,
        'audit:'||v_event.id::text,
        v_type,v_severity,v_title,v_body,
        v_event.entity_type,v_event.entity_id,v_payload,
        0,
        case
          when v_severity='CRITICAL' then v_event.created_at+interval '5 minutes'
          when v_severity='HIGH' then v_event.created_at+interval '15 minutes'
          else null
        end,
        v_event.created_at,now()
      )
      on conflict(organization_id,recipient_user_id,event_key) do nothing;

      if found then
        v_projected:=v_projected+1;
      else
        v_duplicates:=v_duplicates+1;
      end if;
    end loop;
  end loop;

  update public.notification_projection_checkpoints
  set last_scanned_at=v_until,updated_at=now()
  where organization_id=p_organization_id;

  perform set_config('app.notification_projection_mutation','0',true);

  return jsonb_build_object(
    'projected',v_projected,
    'duplicates',v_duplicates,
    'scannedFrom',v_from,
    'scannedThrough',v_until
  );
exception
  when others then
    perform set_config('app.notification_projection_mutation','0',true);
    raise;
end;
$$;

create or replace function public.reconcile_notification_escalations(
  p_organization_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_row record;
  v_level smallint;
  v_count integer:=0;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_limit not between 1 and 500
  then
    raise exception 'Notification escalation reconciliation is not permitted';
  end if;

  perform set_config('app.notification_projection_mutation','allowed',true);

  for v_row in
    select n.*
    from public.notification_inbox n
    left join public.notification_preferences p
      on p.organization_id=n.organization_id
     and p.user_id=n.recipient_user_id
    where n.organization_id=p_organization_id
      and n.acknowledged_at is null
      and n.severity in ('HIGH','CRITICAL')
      and n.escalation_level<2
      and n.escalates_at is not null
      and n.escalates_at<=now()
      and coalesce(p.escalation_enabled,true)
    order by n.escalates_at,n.created_at,n.id
    limit p_limit
    for update of n skip locked
  loop
    v_level:=v_row.escalation_level+1;

    update public.notification_inbox
    set
      escalation_level=v_level,
      escalated_at=now(),
      escalates_at=case
        when v_level>=2 then null
        when v_row.severity='CRITICAL' then now()+interval '10 minutes'
        else now()+interval '30 minutes'
      end,
      updated_at=now()
    where id=v_row.id;

    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,
      after_data,correlation_id,causation_id
    ) values (
      p_organization_id,'SYSTEM','automation_notifications',
      'NOTIFICATION_ESCALATED','notification',v_row.id::text,
      jsonb_build_object(
        'notificationId',v_row.id,
        'notificationType',v_row.notification_type,
        'severity',v_row.severity,
        'escalationLevel',v_level,
        'recipientUserId',v_row.recipient_user_id
      ),
      'notification-escalation:'||v_row.id::text||':'||v_level::text,
      'audit:'||v_row.source_audit_log_id::text
    );

    v_count:=v_count+1;
  end loop;

  perform set_config('app.notification_projection_mutation','0',true);
  return jsonb_build_object('escalated',v_count);
exception
  when others then
    perform set_config('app.notification_projection_mutation','0',true);
    raise;
end;
$$;

create or replace function public.get_notification_delivery_candidates(
  p_organization_id uuid,
  p_channel text,
  p_limit integer default 100
)
returns table(
  notification_id uuid,
  recipient_user_id uuid,
  member_role text,
  event_key text,
  notification_type text,
  severity text,
  title text,
  body text,
  entity_type text,
  entity_id text,
  payload jsonb,
  escalation_level smallint
)
language plpgsql
stable
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_channel text:=upper(btrim(coalesce(p_channel,'')));
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or v_channel not in ('TELEGRAM','EMAIL','PUSH','SMS')
     or p_limit not between 1 and 500
  then
    raise exception 'Notification delivery candidate request is not permitted';
  end if;

  return query
  select
    n.id,
    n.recipient_user_id,
    m.role,
    n.event_key,
    n.notification_type,
    n.severity,
    n.title,
    n.body,
    n.entity_type,
    n.entity_id,
    n.payload,
    n.escalation_level
  from public.notification_inbox n
  join public.organization_members m
    on m.organization_id=n.organization_id
   and m.user_id=n.recipient_user_id
  left join public.notification_preferences p
    on p.organization_id=n.organization_id
   and p.user_id=n.recipient_user_id
  where n.organization_id=p_organization_id
    and n.acknowledged_at is null
    and public.notification_severity_rank(n.severity)>=
      public.notification_severity_rank(coalesce(p.minimum_severity,'MEDIUM'))
    and case v_channel
      when 'TELEGRAM' then
        m.role='OWNER' and coalesce(p.telegram_enabled,m.role='OWNER')
      when 'EMAIL' then coalesce(p.email_enabled,false)
      when 'PUSH' then coalesce(p.push_enabled,false)
      when 'SMS' then coalesce(p.sms_enabled,false)
      else false
    end
    and not exists(
      select 1
      from public.notification_delivery_receipts d
      where d.notification_id=n.id
        and d.channel=v_channel
        and d.escalation_level=n.escalation_level
    )
  order by
    public.notification_severity_rank(n.severity) desc,
    n.created_at,
    n.id
  limit p_limit;
end;
$$;

create or replace function public.record_notification_delivery(
  p_organization_id uuid,
  p_notification_id uuid,
  p_channel text,
  p_escalation_level integer,
  p_status text,
  p_provider_message_id text default null,
  p_reason text default null,
  p_payload jsonb default '{}'::jsonb
)
returns public.notification_delivery_receipts
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_channel text:=upper(btrim(coalesce(p_channel,'')));
  v_status text:=upper(btrim(coalesce(p_status,'')));
  v_notification public.notification_inbox%rowtype;
  v_row public.notification_delivery_receipts%rowtype;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_notification_id is null
     or v_channel not in ('TELEGRAM','EMAIL','PUSH','SMS')
     or p_escalation_level not between 0 and 2
     or v_status not in ('SENT','FAILED','BLOCKED_EXTERNAL','SKIPPED','DUPLICATE')
     or p_payload is null
     or jsonb_typeof(p_payload)<>'object'
     or octet_length(p_payload::text)>16384
     or (p_reason is not null and length(p_reason)>1000)
  then
    raise exception 'Notification delivery receipt payload is invalid';
  end if;

  select * into v_notification
  from public.notification_inbox n
  where n.organization_id=p_organization_id
    and n.id=p_notification_id;

  if not found then
    raise exception 'Notification delivery target was not found';
  end if;

  if v_notification.escalation_level<>p_escalation_level then
    raise exception 'Notification delivery escalation level is stale';
  end if;

  perform set_config('app.notification_projection_mutation','allowed',true);

  insert into public.notification_delivery_receipts(
    organization_id,notification_id,recipient_user_id,
    channel,escalation_level,status,provider_message_id,
    reason,payload,sent_at,updated_at
  ) values (
    p_organization_id,p_notification_id,v_notification.recipient_user_id,
    v_channel,p_escalation_level,v_status,
    nullif(btrim(coalesce(p_provider_message_id,'')),''),
    nullif(left(btrim(coalesce(p_reason,'')),1000),''),
    p_payload,
    case when v_status in ('SENT','DUPLICATE') then now() else null end,
    now()
  )
  on conflict(notification_id,channel,escalation_level) do update
  set
    status=excluded.status,
    provider_message_id=excluded.provider_message_id,
    reason=excluded.reason,
    payload=excluded.payload,
    sent_at=excluded.sent_at,
    updated_at=now()
  returning * into v_row;

  perform set_config('app.notification_projection_mutation','0',true);
  return v_row;
exception
  when others then
    perform set_config('app.notification_projection_mutation','0',true);
    raise;
end;
$$;

revoke all on function public.guard_notification_projection_mutation()
  from public,anon,authenticated,service_role;
revoke all on function public.notification_severity_rank(text)
  from public,anon,authenticated;
revoke all on function public.set_notification_preferences(
  uuid,uuid,boolean,boolean,boolean,boolean,boolean,text,boolean
) from public,anon,authenticated;
revoke all on function public.mark_notification_state(uuid,uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.project_automation_notifications(uuid,integer)
  from public,anon,authenticated;
revoke all on function public.reconcile_notification_escalations(uuid,integer)
  from public,anon,authenticated;
revoke all on function public.get_notification_delivery_candidates(uuid,text,integer)
  from public,anon,authenticated;
revoke all on function public.record_notification_delivery(
  uuid,uuid,text,integer,text,text,text,jsonb
) from public,anon,authenticated;

grant execute on function public.notification_severity_rank(text)
  to service_role;
grant execute on function public.set_notification_preferences(
  uuid,uuid,boolean,boolean,boolean,boolean,boolean,text,boolean
) to service_role;
grant execute on function public.mark_notification_state(uuid,uuid,uuid,text)
  to service_role;
grant execute on function public.project_automation_notifications(uuid,integer)
  to service_role;
grant execute on function public.reconcile_notification_escalations(uuid,integer)
  to service_role;
grant execute on function public.get_notification_delivery_candidates(uuid,text,integer)
  to service_role;
grant execute on function public.record_notification_delivery(
  uuid,uuid,text,integer,text,text,text,jsonb
) to service_role;
