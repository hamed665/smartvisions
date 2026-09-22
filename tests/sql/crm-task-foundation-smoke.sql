\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000c003'),
  ('00000000-0000-0000-0000-00000000c004');

insert into public.organization_members(organization_id,user_id,role) values
  (
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c003',
    'SALES_AGENT'
  ),
  (
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c004',
    'VIEWER'
  );

do $task_structure$
begin
  if not (
    select relrowsecurity
    from pg_class
    where oid='public.crm_tasks'::regclass
  ) then
    raise exception 'CRM tasks RLS is not enabled';
  end if;

  if has_table_privilege('anon','public.crm_tasks','SELECT')
     or has_table_privilege('service_role','public.crm_tasks','SELECT')
  then
    raise exception 'CRM task table exposed to anon/service_role';
  end if;

  if not has_table_privilege('authenticated','public.crm_tasks','SELECT')
     or not has_table_privilege('authenticated','public.crm_tasks','INSERT')
     or not has_table_privilege('authenticated','public.crm_tasks','UPDATE')
  then
    raise exception 'authenticated CRM task grants missing';
  end if;

  if has_table_privilege('authenticated','public.crm_tasks','DELETE') then
    raise exception 'CRM tasks unexpectedly allow DELETE';
  end if;

  if (
    select p.prosecdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_crm_tasks'
  ) then
    raise exception 'CRM task query unexpectedly SECURITY DEFINER';
  end if;

  if has_function_privilege(
    'service_role',
    'public.get_crm_tasks(uuid,uuid,uuid,uuid,text,boolean,integer,timestamptz,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role unexpectedly executes CRM task query';
  end if;

  if (select count(*) from public.crm_tasks) <> 0 then
    raise exception 'CRM task migration fabricated tasks from historical activity';
  end if;
end;
$task_structure$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

insert into public.crm_tasks(
  organization_id,business_id,lead_id,conversation_id,
  task_type,title,description,status,priority,
  assignee_user_id,due_at,source_type,source_id,
  request_key,creator_type,created_by_user_id,metadata
) values (
  '00000000-0000-0000-0000-000000000c01',
  '10000000-0000-0000-0000-000000000c01',
  '20000000-0000-0000-0000-000000000c01',
  '30000000-0000-0000-0000-000000000c01',
  'CALL',
  'Call customer',
  'Fixture secret description',
  'OPEN',
  'HIGH',
  null,
  '2026-09-24T08:00:00Z',
  'MANUAL',
  null,
  'fixture-owner-task-1',
  'USER',
  '00000000-0000-0000-0000-00000000c001',
  '{"fixture":true}'::jsonb
);

do $task_owner_create$
declare
  v_task public.crm_tasks%rowtype;
begin
  select * into v_task
  from public.crm_tasks
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and request_key='fixture-owner-task-1';

  if v_task.status <> 'OPEN'
     or v_task.version <> 1
     or v_task.created_by_user_id <> '00000000-0000-0000-0000-00000000c001'
  then
    raise exception 'Owner CRM task creation contract failed';
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where entity_type='crm_tasks'
      and entity_id=v_task.id::text
      and action='CRM_TASK_CREATED'
      and correlation_id like 'dbtx:%'
  ) then
    raise exception 'CRM task create audit missing';
  end if;

  if exists (
    select 1
    from public.audit_logs
    where entity_type='crm_tasks'
      and entity_id=v_task.id::text
      and (
        coalesce(before_data::text,'') ilike '%Call customer%'
        or coalesce(after_data::text,'') ilike '%Call customer%'
        or coalesce(before_data::text,'') ilike '%Fixture secret description%'
        or coalesce(after_data::text,'') ilike '%Fixture secret description%'
      )
  ) then
    raise exception 'CRM task audit copied task title/description';
  end if;
end;
$task_owner_create$;

do $task_duplicate_request$
begin
  begin
    insert into public.crm_tasks(
      organization_id,title,status,priority,source_type,request_key,
      creator_type,created_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      'Duplicate',
      'OPEN',
      'NORMAL',
      'MANUAL',
      'fixture-owner-task-1',
      'USER',
      '00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Duplicate CRM task request_key unexpectedly inserted';
  exception
    when unique_violation then null;
  end;
end;
$task_duplicate_request$;

do $task_lineage$
begin
  begin
    insert into public.crm_tasks(
      organization_id,business_id,lead_id,title,status,priority,source_type,
      request_key,creator_type,created_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c02',
      '20000000-0000-0000-0000-000000000c01',
      'Bad lineage',
      'OPEN',
      'NORMAL',
      'MANUAL',
      'fixture-bad-lineage',
      'USER',
      '00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Mismatched Business/Lead lineage unexpectedly inserted';
  exception
    when foreign_key_violation then null;
  end;
end;
$task_lineage$;

do $task_source_spoof$
begin
  begin
    insert into public.crm_tasks(
      organization_id,title,status,priority,source_type,source_id,
      request_key,creator_type,created_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      'Spoof source',
      'OPEN',
      'NORMAL',
      'OPERATOR_BRIEF',
      'fake-source',
      'fixture-source-spoof',
      'USER',
      '00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Authenticated user spoofed trusted CRM task source';
  exception
    when insufficient_privilege then null;
  end;
end;
$task_source_spoof$;

update public.crm_tasks
set status='DONE', completion_note='Completed'
where organization_id='00000000-0000-0000-0000-000000000c01'
  and request_key='fixture-owner-task-1'
  and version=1;

do $task_done$
declare
  v_task public.crm_tasks%rowtype;
begin
  select * into v_task
  from public.crm_tasks
  where request_key='fixture-owner-task-1';

  if v_task.status <> 'DONE'
     or v_task.version <> 2
     or v_task.completed_at is null
     or v_task.completed_by_user_id <> '00000000-0000-0000-0000-00000000c001'
  then
    raise exception 'CRM task DONE transition evidence failed';
  end if;
end;
$task_done$;

update public.crm_tasks
set status='OPEN'
where organization_id='00000000-0000-0000-0000-000000000c01'
  and request_key='fixture-owner-task-1'
  and version=2;

do $task_reopen$
declare
  v_task public.crm_tasks%rowtype;
begin
  select * into v_task
  from public.crm_tasks
  where request_key='fixture-owner-task-1';

  if v_task.status <> 'OPEN'
     or v_task.version <> 3
     or v_task.completed_at is not null
     or v_task.completed_by_user_id is not null
  then
    raise exception 'CRM task reopen did not clear completion evidence';
  end if;
end;
$task_reopen$;

insert into public.crm_tasks(
  organization_id,title,status,priority,source_type,request_key,
  creator_type,created_by_user_id
) values (
  '00000000-0000-0000-0000-000000000c01',
  'Cancel fixture',
  'OPEN',
  'NORMAL',
  'MANUAL',
  'fixture-cancel-task',
  'USER',
  '00000000-0000-0000-0000-00000000c001'
);

update public.crm_tasks
set status='CANCELED'
where organization_id='00000000-0000-0000-0000-000000000c01'
  and request_key='fixture-cancel-task';

do $task_cancel_terminal$
begin
  begin
    update public.crm_tasks
    set status='OPEN'
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and request_key='fixture-cancel-task';
    raise exception 'Canceled CRM task unexpectedly reopened';
  exception
    when others then
      if sqlerrm not like 'CANCELED CRM task is terminal%' then
        raise;
      end if;
  end;
end;
$task_cancel_terminal$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c003',false);

insert into public.crm_tasks(
  organization_id,title,status,priority,assignee_user_id,
  source_type,request_key,creator_type,created_by_user_id
) values (
  '00000000-0000-0000-0000-000000000c01',
  'Agent self task',
  'OPEN',
  'NORMAL',
  '00000000-0000-0000-0000-00000000c003',
  'MANUAL',
  'fixture-agent-self',
  'USER',
  '00000000-0000-0000-0000-00000000c003'
);

do $task_agent_scope$
begin
  begin
    insert into public.crm_tasks(
      organization_id,title,status,priority,assignee_user_id,
      source_type,request_key,creator_type,created_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      'Agent assigning owner',
      'OPEN',
      'NORMAL',
      '00000000-0000-0000-0000-00000000c001',
      'MANUAL',
      'fixture-agent-other',
      'USER',
      '00000000-0000-0000-0000-00000000c003'
    );
    raise exception 'Sales Agent unexpectedly assigned CRM task to another member';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.crm_tasks
    set assignee_user_id='00000000-0000-0000-0000-00000000c001'
    where request_key='fixture-agent-self';
    raise exception 'Sales Agent unexpectedly reassigned CRM task';
  exception
    when insufficient_privilege then null;
  end;
end;
$task_agent_scope$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c004',false);

do $task_viewer$
begin
  if not exists (
    select 1 from public.crm_tasks
    where organization_id='00000000-0000-0000-0000-000000000c01'
  ) then
    raise exception 'Viewer cannot read CRM tasks';
  end if;

  begin
    insert into public.crm_tasks(
      organization_id,title,status,priority,source_type,request_key,
      creator_type,created_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      'Viewer write',
      'OPEN',
      'NORMAL',
      'MANUAL',
      'fixture-viewer-write',
      'USER',
      '00000000-0000-0000-0000-00000000c004'
    );
    raise exception 'Viewer unexpectedly inserted CRM task';
  exception
    when insufficient_privilege then null;
  end;
end;
$task_viewer$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $task_query_rls$
begin
  if not exists (
    select 1
    from public.get_crm_tasks(
      '00000000-0000-0000-0000-000000000c01',
      null,null,null,null,true,50,null,null
    )
  ) then
    raise exception 'Owner CRM task query returned no rows';
  end if;

  if exists (
    select 1
    from public.get_crm_tasks(
      '00000000-0000-0000-0000-000000000d01',
      null,null,null,null,true,50,null,null
    )
  ) then
    raise exception 'CRM task query leaked another tenant';
  end if;
end;
$task_query_rls$;

reset role;
select set_config('request.jwt.claim.sub','',false);
