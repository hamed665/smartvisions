\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $task_v2_create$
declare
  v_deal uuid;
  v_task uuid;
begin
  select id into v_deal
  from public.crm_deals
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and request_key='fixture-deal-manual';

  if v_deal is null then
    raise exception 'Task v2 Deal fixture is missing';
  end if;

  insert into public.crm_tasks(
    organization_id,business_id,lead_id,deal_id,
    task_type,title,description,status,priority,
    assignee_user_id,due_at,reminder_at,
    source_type,source_id,request_key,creator_type,created_by_user_id,metadata
  ) values (
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    '20000000-0000-0000-0000-000000000c01',
    v_deal,
    'FOLLOW_UP',
    'Task v2 fixture title',
    'Task v2 private description',
    'OPEN',
    'HIGH',
    '00000000-0000-0000-0000-00000000c001',
    now() - interval '1 hour',
    now() - interval '30 minutes',
    'MANUAL',
    null,
    'fixture-task-v2-deal-reminder',
    'USER',
    '00000000-0000-0000-0000-00000000c001',
    '{}'::jsonb
  )
  returning id into v_task;

  if not exists (
    select 1 from public.get_crm_tasks_v2(
      '00000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c01',
      '20000000-0000-0000-0000-000000000c01',
      v_deal,
      null,
      '00000000-0000-0000-0000-00000000c001',
      'OPEN',
      true,
      true,
      false,
      50,
      null,
      null
    ) t
    where t.id=v_task and t.is_overdue and t.reminder_due
  ) then
    raise exception 'Task v2 overdue/reminder read model failed';
  end if;
end;
$task_v2_create$;

do $task_v2_deal_lineage$
declare
  v_other_deal uuid;
begin
  select id into v_other_deal
  from public.crm_deals
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and request_key='fixture-lead-conversion';

  begin
    insert into public.crm_tasks(
      organization_id,business_id,deal_id,title,status,priority,
      source_type,request_key,creator_type,created_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c01',
      v_other_deal,
      'Bad Deal lineage',
      'OPEN',
      'NORMAL',
      'MANUAL',
      'fixture-task-v2-bad-deal',
      'USER',
      '00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Task v2 accepted mismatched Deal/Business lineage';
  exception
    when others then
      if sqlerrm not like 'CRM task Deal must match task Business%' then
        raise;
      end if;
  end;
end;
$task_v2_deal_lineage$;

do $task_v2_reminder$
declare
  v_task uuid;
  v_replayed boolean;
begin
  select id into v_task
  from public.crm_tasks
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and request_key='fixture-task-v2-deal-reminder';

  select replayed into v_replayed
  from public.acknowledge_crm_task_reminder(
    '00000000-0000-0000-0000-000000000c01',
    v_task
  );
  if v_replayed then
    raise exception 'Task v2 first reminder acknowledgement replayed unexpectedly';
  end if;

  select replayed into v_replayed
  from public.acknowledge_crm_task_reminder(
    '00000000-0000-0000-0000-000000000c01',
    v_task
  );
  if not v_replayed then
    raise exception 'Task v2 reminder acknowledgement is not idempotent';
  end if;

  if exists (
    select 1 from public.crm_tasks_v2
    where id=v_task and reminder_due
  ) then
    raise exception 'Acknowledged Task v2 reminder remained due';
  end if;

  update public.crm_tasks
  set reminder_at = now() + interval '2 hours'
  where id=v_task;

  if not exists (
    select 1 from public.crm_tasks
    where id=v_task
      and reminder_acknowledged_at is null
      and reminder_at > now()
  ) then
    raise exception 'Task v2 reminder reschedule did not reopen acknowledgement state';
  end if;
end;
$task_v2_reminder$;

do $task_v2_activity$
declare
  v_task uuid;
begin
  select id into v_task
  from public.crm_tasks
  where request_key='fixture-task-v2-deal-reminder';

  if (
    select count(*)
    from public.get_crm_task_activity_v2(
      '00000000-0000-0000-0000-000000000c01',
      v_task,
      50,
      null,
      null
    )
  ) < 3 then
    raise exception 'Task v2 immutable activity history is incomplete';
  end if;

  if not exists (
    select 1
    from public.crm_task_activity_v2
    where task_id=v_task
      and action='CRM_TASK_REMINDER_CHANGED'
  ) then
    raise exception 'Task v2 reminder activity evidence missing';
  end if;

  if exists (
    select 1
    from public.audit_logs
    where entity_type='crm_tasks'
      and entity_id=v_task::text
      and (
        coalesce(before_data::text,'') ilike '%Task v2 fixture title%'
        or coalesce(after_data::text,'') ilike '%Task v2 fixture title%'
        or coalesce(before_data::text,'') ilike '%Task v2 private description%'
        or coalesce(after_data::text,'') ilike '%Task v2 private description%'
      )
  ) then
    raise exception 'Task v2 audit copied Task title/description';
  end if;
end;
$task_v2_activity$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c002',false);

do $task_v2_cross_tenant$
begin
  if exists (
    select 1
    from public.get_crm_tasks_v2(
      '00000000-0000-0000-0000-000000000c01',
      null,null,null,null,null,null,
      false,false,true,50,null,null
    )
  ) then
    raise exception 'Task v2 leaked another Organization';
  end if;
end;
$task_v2_cross_tenant$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $task_v2_security$
begin
  if (
    select bool_or(p.prosecdef)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'get_crm_tasks_v2',
        'get_crm_task_activity_v2',
        'acknowledge_crm_task_reminder'
      )
  ) then
    raise exception 'Task v2 function unexpectedly uses SECURITY DEFINER';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_crm_tasks_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,boolean,boolean,boolean,integer,timestamptz,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.get_crm_task_activity_v2(uuid,uuid,integer,timestamptz,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.acknowledge_crm_task_reminder(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Task v2 authenticated function grants missing';
  end if;

  if has_function_privilege(
    'service_role',
    'public.get_crm_tasks_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,boolean,boolean,boolean,integer,timestamptz,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role unexpectedly executes Task v2 user read';
  end if;
end;
$task_v2_security$;

reset role;
