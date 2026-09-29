\set ON_ERROR_STOP on

-- Production has this canonical Telegram owner-delivery authority from the
-- long-lived pre-modern migration lineage. The compact CI chain omits it, so
-- reconstruct only its durable evidence contract in this disposable database.
create table if not exists public.telegram_notification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_key text not null,
  notification_type text not null,
  entity_type text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PROCESSING'
    check (status in ('PROCESSING','SENT','FAILED')),
  telegram_message_id bigint,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (organization_id,event_key)
);

create temp table automation_notification_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as message_count,
  (select count(*) from public.usage_events) as usage_count,
  (select count(*) from public.followup_jobs) as followup_count,
  (select count(*) from public.telegram_notification_events) as telegram_count;

grant select on automation_notification_side_effect_baseline to service_role;

-- Keep this smoke self-contained while reusing the canonical disposable Automation org.
insert into auth.users(id)
values
  ('00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-00000000c002')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role)
values
  (
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    'OWNER'
  ),
  (
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c002',
    'SALES_MANAGER'
  )
on conflict (organization_id,user_id) do update set role=excluded.role;

-- Historical evidence before the Organization cutover must never be replayed.
insert into public.audit_logs(
  id,organization_id,actor_type,actor_id,action,entity_type,entity_id,
  after_data,correlation_id,created_at
) values (
  '00000000-0000-0000-0000-00000000c189',
  '00000000-0000-0000-0000-000000000c01',
  'SYSTEM','automation_runtime','AUTOMATION_RUN_DEAD_LETTER',
  'automation_run','historical-run',
  '{"actionKey":"GENERATE_PREVIEW","compensationRequired":0}'::jsonb,
  'automation-notification-historical',
  (select created_at-interval '1 second' from public.organizations where id='00000000-0000-0000-0000-000000000c01')
)
on conflict (id) do nothing;

-- Same timestamp on two source events proves (created_at,id) pagination is lossless.
insert into public.audit_logs(
  id,organization_id,actor_type,actor_id,action,entity_type,entity_id,
  after_data,correlation_id,created_at
) values
(
  '00000000-0000-0000-0000-00000000c190',
  '00000000-0000-0000-0000-000000000c01',
  'SYSTEM',null,'MESSAGE_APPROVAL_ESCALATED',
  'conversation_message','00000000-0000-0000-0000-00000000c170',
  '{"policyMode":"STRICT"}'::jsonb,
  'approval-notification-escalated',
  now()
),
(
  '00000000-0000-0000-0000-00000000c191',
  '00000000-0000-0000-0000-000000000c01',
  'SYSTEM','automation_runtime','AUTOMATION_RUN_DEAD_LETTER',
  'automation_run','runtime-notification-run',
  '{"failedActionId":"00000000-0000-0000-0000-00000000c181","actionKey":"GENERATE_PREVIEW","attemptCount":3,"compensationRequired":1}'::jsonb,
  'automation-notification-dead-letter',
  now()
)
on conflict (id) do nothing;

set role service_role;

do $lossless_projection$
declare
  v_first jsonb;
  v_second jsonb;
  v_third jsonb;
begin
  v_first:=public.project_automation_notifications(
    '00000000-0000-0000-0000-000000000c01',1
  );
  v_second:=public.project_automation_notifications(
    '00000000-0000-0000-0000-000000000c01',1
  );
  v_third:=public.project_automation_notifications(
    '00000000-0000-0000-0000-000000000c01',1
  );

  if (v_first->>'scanned')::integer<>1
     or (v_second->>'scanned')::integer<>1
     or (v_third->>'scanned')::integer<>0
  then
    raise exception 'Notification projection cursor skipped or replayed source events';
  end if;

  if (select count(*) from public.notification_inbox
      where organization_id='00000000-0000-0000-0000-000000000c01')<>3
  then
    raise exception 'Expected two approval recipients plus one OWNER DLQ projection';
  end if;

  if exists(
    select 1 from public.notification_inbox
    where source_audit_log_id='00000000-0000-0000-0000-00000000c189'
  ) then
    raise exception 'Historical pre-cutover audit evidence was replayed';
  end if;

  if not exists(
    select 1 from public.notification_inbox
    where source_audit_log_id='00000000-0000-0000-0000-00000000c191'
      and recipient_user_id='00000000-0000-0000-0000-00000000c001'
      and notification_type='AUTOMATION_DEAD_LETTER'
      and severity='CRITICAL'
  ) then
    raise exception 'Runtime DLQ projection is missing';
  end if;
end;
$lossless_projection$;

do $default_telegram_boundary$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.get_notification_delivery_candidates(
    '00000000-0000-0000-0000-000000000c01','TELEGRAM',100
  );

  if v_count<>2 then
    raise exception 'Default Telegram delivery must target only the OWNER notifications';
  end if;
end;
$default_telegram_boundary$;

select public.set_notification_preferences(
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c001',
  true,false,true,false,false,'CRITICAL',true
);

do $preference_and_delivery_boundary$
declare
  v_email uuid;
begin
  if exists(
    select 1
    from public.get_notification_delivery_candidates(
      '00000000-0000-0000-0000-000000000c01','TELEGRAM',100
    )
  ) then
    raise exception 'OWNER Telegram preference did not disable Telegram candidates';
  end if;

  select notification_id into v_email
  from public.get_notification_delivery_candidates(
    '00000000-0000-0000-0000-000000000c01','EMAIL',100
  );

  if v_email is null then
    raise exception 'CRITICAL OWNER email candidate was not produced';
  end if;

  perform public.record_notification_delivery(
    '00000000-0000-0000-0000-000000000c01',
    v_email,'EMAIL',0,'SENT','provider-notification-ci',null,
    '{"controlledTest":true}'::jsonb
  );

  if exists(
    select 1
    from public.get_notification_delivery_candidates(
      '00000000-0000-0000-0000-000000000c01','EMAIL',100
    )
  ) then
    raise exception 'Sent notification delivery was not deduplicated';
  end if;
end;
$preference_and_delivery_boundary$;

do $direct_mutation_guard$
declare
  v_notification uuid;
begin
  select id into v_notification
  from public.notification_inbox
  where organization_id='00000000-0000-0000-0000-000000000c01'
  order by created_at,id
  limit 1;

  begin
    update public.notification_inbox
    set acknowledged_at=now()
    where id=v_notification;
    raise exception 'Notification projection allowed direct mutation';
  exception when others then
    if sqlerrm not like 'Notification projection state requires the governed notification boundary%' then
      raise;
    end if;
  end;
end;
$direct_mutation_guard$;

do $prepare_escalation$
declare
  v_notification uuid;
begin
  select id into v_notification
  from public.notification_inbox
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and recipient_user_id='00000000-0000-0000-0000-00000000c002'
    and notification_type='APPROVAL_ESCALATED'
  limit 1;

  perform set_config('app.notification_projection_mutation','allowed',true);
  update public.notification_inbox
  set escalates_at=now()-interval '1 minute'
  where id=v_notification;
  perform set_config('app.notification_projection_mutation','0',true);
end;
$prepare_escalation$;

do $escalation_and_ack$
declare
  v_notification uuid;
  v_result jsonb;
begin
  select id into v_notification
  from public.notification_inbox
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and recipient_user_id='00000000-0000-0000-0000-00000000c002'
    and notification_type='APPROVAL_ESCALATED'
  limit 1;

  v_result:=public.reconcile_notification_escalations(
    '00000000-0000-0000-0000-000000000c01',100
  );

  if (v_result->>'escalated')::integer<>1 then
    raise exception 'Due notification did not escalate exactly once';
  end if;

  if not exists(
    select 1 from public.notification_inbox
    where id=v_notification
      and escalation_level=1
      and escalated_at is not null
  ) then
    raise exception 'Escalation state was not persisted';
  end if;

  if not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and action='NOTIFICATION_ESCALATED'
      and entity_id=v_notification::text
  ) then
    raise exception 'Escalation audit evidence was not written';
  end if;

  perform public.mark_notification_state(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c002',
    v_notification,'ACKNOWLEDGE'
  );

  if not exists(
    select 1 from public.notification_inbox
    where id=v_notification
      and read_at is not null
      and acknowledged_at is not null
      and escalates_at is null
  ) then
    raise exception 'Acknowledgement did not stop escalation';
  end if;

  v_result:=public.reconcile_notification_escalations(
    '00000000-0000-0000-0000-000000000c01',100
  );
  if (v_result->>'escalated')::integer<>0 then
    raise exception 'Acknowledged notification escalated again';
  end if;
end;
$escalation_and_ack$;

reset role;

-- Preference-aware RLS: OWNER chose CRITICAL, so only the DLQ row is visible.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);
set role authenticated;

do $owner_rls$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.notification_inbox
  where organization_id='00000000-0000-0000-0000-000000000c01';

  if v_count<>1 then
    raise exception 'OWNER notification RLS/preference filter returned % rows, expected 1',v_count;
  end if;

  if has_function_privilege(
       'authenticated',
       'public.set_notification_preferences(uuid,uuid,boolean,boolean,boolean,boolean,boolean,text,boolean)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.mark_notification_state(uuid,uuid,uuid,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.project_automation_notifications(uuid,integer)',
       'EXECUTE'
     )
  then
    raise exception 'Trusted notification mutation is browser executable';
  end if;

  if has_table_privilege('authenticated','public.notification_inbox','INSERT')
     or has_table_privilege('authenticated','public.notification_inbox','UPDATE')
     or has_table_privilege('authenticated','public.notification_inbox','DELETE')
  then
    raise exception 'Authenticated browser can mutate notification projection directly';
  end if;
end;
$owner_rls$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $security_and_side_effects$
declare
  v_base automation_notification_side_effect_baseline%rowtype;
begin
  if exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'set_notification_preferences',
        'mark_notification_state',
        'project_automation_notifications',
        'reconcile_notification_escalations',
        'get_notification_delivery_candidates',
        'record_notification_delivery'
      )
      and p.prosecdef
  ) then
    raise exception 'Notification boundary unexpectedly uses SECURITY DEFINER';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='notification_inbox'
  ) then
    raise exception 'Notification inbox RLS is not enabled';
  end if;

  select * into v_base from automation_notification_side_effect_baseline;
  if (select count(*) from public.outreach_messages)<>v_base.outreach_count
     or (select count(*) from public.conversation_messages)<>v_base.message_count
     or (select count(*) from public.usage_events)<>v_base.usage_count
     or (select count(*) from public.followup_jobs)<>v_base.followup_count
     or (select count(*) from public.telegram_notification_events)<>v_base.telegram_count
  then
    raise exception 'AUTO-NOTIFICATIONS SQL acceptance caused provider/runtime side effects';
  end if;
end;
$security_and_side_effects$;
