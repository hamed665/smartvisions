\set ON_ERROR_STOP on

-- FIELD-SERVICE smoke extends canonical Task/Booking/member authorities only.
-- File bytes are not uploaded in CI; private object authorization is tested in
-- TypeScript and Production bucket verification.

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $field_service_seed_task$
declare
  v_person uuid;
  v_booking uuid;
  v_task uuid:='00000000-0000-0000-0000-00000000f501';
begin
  select id into v_person
  from public.crm_people
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and status='ACTIVE'
  order by created_at
  limit 1;
  if v_person is null then raise exception 'FIELD-SERVICE Person fixture missing'; end if;

  select id into v_booking
  from public.bookings
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and person_id=v_person
    and status='COMPLETED'
  order by updated_at desc
  limit 1;

  insert into public.crm_tasks(
    id,organization_id,task_type,title,status,priority,
    assignee_user_id,due_at,source_type,source_id,request_key,
    creator_type,created_by_user_id,metadata
  ) values (
    v_task,'00000000-0000-0000-0000-000000000c01',
    'FIELD_SERVICE','CI field service work order','OPEN','HIGH',
    '00000000-0000-0000-0000-00000000c003',
    coalesce((select starts_at from public.bookings where id=v_booking),now()+interval '1 hour'),
    'MANUAL',null,'field-service-ci-task-1',
    'USER','00000000-0000-0000-0000-00000000c001',
    '{"source":"CI"}'::jsonb
  )
  on conflict (id) do nothing;
end;
$field_service_seed_task$;

reset role;
set role service_role;
select *
from public.link_crm_customer360_person_context(
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c001',
  'TASK',
  '00000000-0000-0000-0000-00000000f501',
  (
    select id
    from public.crm_people
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and status='ACTIVE'
    order by created_at
    limit 1
  ),
  'IMPORT_VERIFIED',
  'field-service-smoke:disposable-ci-fixture',
  '{"source":"FIELD_SERVICE_SMOKE","disposable":true}'::jsonb
);

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $field_service_fixture$
declare
  v_person uuid;
  v_booking uuid;
  v_task uuid:='00000000-0000-0000-0000-00000000f501';
begin
  select id into v_person
  from public.crm_people
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and status='ACTIVE'
  order by created_at
  limit 1;

  select id into v_booking
  from public.bookings
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and person_id=v_person
    and status='COMPLETED'
  order by updated_at desc
  limit 1;

  if not exists(
    select 1 from public.crm_tasks
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and id=v_task
      and person_id=v_person
      and person_link_method='IMPORT_VERIFIED'
  ) then
    raise exception 'FIELD-SERVICE Task Person context was not linked through Customer 360';
  end if;

  insert into public.field_service_work_orders(
    task_id,organization_id,booking_id,location_source,location_reference,
    location_snapshot,requires_customer_signoff
  ) values (
    v_task,'00000000-0000-0000-0000-000000000c01',v_booking,
    'CUSTOMER_CONFIRMED','ci:customer-confirmed',
    '{"formattedAddress":"CI service location","source":"CI"}'::jsonb,true
  )
  on conflict (task_id) do nothing;

  insert into public.field_service_checklist_items(
    organization_id,task_id,position,label,required
  ) values
    ('00000000-0000-0000-0000-000000000c01',v_task,1,'Required safety check',true),
    ('00000000-0000-0000-0000-000000000c01',v_task,2,'Optional note',false)
  on conflict (organization_id,task_id,position) do nothing;

  begin
    update public.crm_tasks set status='DONE' where id=v_task;
    raise exception 'Incomplete Field Service task was allowed to complete';
  exception when others then
    if sqlerrm not like 'Field Service completion summary is required%'
       and sqlerrm not like 'Required Field Service checklist is incomplete%'
    then raise; end if;
  end;

  update public.field_service_checklist_items
  set completed_at=now(),
      completed_by_user_id='00000000-0000-0000-0000-00000000c001',
      completion_note='Verified in CI'
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and task_id=v_task and position=1;

  insert into public.field_service_material_usage(
    organization_id,task_id,material_name,quantity,unit,
    source_reference,note,created_by_user_id
  ) values (
    '00000000-0000-0000-0000-000000000c01',v_task,
    'CI consumable',2,'pcs','ci:material','Usage evidence only',
    '00000000-0000-0000-0000-00000000c001'
  );

  insert into public.field_service_evidence(
    id,organization_id,task_id,evidence_type,object_path,filename,
    content_type,size_bytes,caption,uploaded_by_user_id
  ) values (
    '00000000-0000-0000-0000-00000000f511',
    '00000000-0000-0000-0000-000000000c01',v_task,'PHOTO',
    '00000000-0000-0000-0000-000000000c01/00000000-0000-0000-0000-00000000f501/00000000-0000-0000-0000-00000000f511/proof.jpg',
    'proof.jpg','image/jpeg',1024,'CI completion photo',
    '00000000-0000-0000-0000-00000000c001'
  );

  insert into public.field_service_signoffs(
    organization_id,task_id,signer_name,signoff_method,
    acceptance_text,recorded_by_user_id
  ) values (
    '00000000-0000-0000-0000-000000000c01',v_task,
    'CI Customer','TYPED_NAME',
    'Customer confirms the described Field Service work was completed.',
    '00000000-0000-0000-0000-00000000c001'
  );

  update public.field_service_work_orders
  set completion_summary='CI Field Service work completed with required evidence.'
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and task_id=v_task;

  update public.crm_tasks set status='DONE' where id=v_task;

  if not exists(
    select 1 from public.crm_tasks
    where id=v_task and status='DONE' and completed_at is not null
  ) then raise exception 'Field Service canonical Task did not complete'; end if;

  begin
    update public.crm_tasks set status='OPEN' where id=v_task;
    raise exception 'Completed Field Service task was reopened';
  exception when others then
    if sqlerrm not like 'Completed Field Service work order is terminal%' then raise; end if;
  end;

  if not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and entity_type='field_service'
      and entity_id=v_task::text
  ) then raise exception 'Field Service audit evidence is missing'; end if;
end;
$field_service_fixture$;

reset role;

do $field_service_security$
declare
  v_missing text;
begin
  if exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'field_service_task_can_manage','guard_field_service_work_order',
        'guard_field_service_checklist_item','guard_field_service_task_completion',
        'guard_field_service_signoff','audit_field_service_mutation'
      )
      and p.prosecdef
  ) then raise exception 'FIELD-SERVICE unexpectedly uses SECURITY DEFINER'; end if;

  if not (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'public.field_service_work_orders'::regclass,
      'public.field_service_checklist_items'::regclass,
      'public.field_service_material_usage'::regclass,
      'public.field_service_evidence'::regclass,
      'public.field_service_signoffs'::regclass
    )
  ) then raise exception 'FIELD-SERVICE RLS is not enabled'; end if;

  select string_agg(expected,', ' order by expected)
  into v_missing
  from unnest(array[
    'field_service_work_orders_booking_idx',
    'field_service_work_orders_branch_idx',
    'field_service_work_orders_support_case_idx',
    'field_service_checklist_completed_by_idx',
    'field_service_material_task_idx',
    'field_service_material_created_by_idx',
    'field_service_evidence_task_idx',
    'field_service_evidence_uploaded_by_idx',
    'field_service_signoffs_evidence_idx',
    'field_service_signoffs_recorded_by_idx'
  ]::text[]) expected
  where not exists(
    select 1 from pg_indexes where schemaname='public' and indexname=expected
  );

  if v_missing is not null then raise exception 'FIELD-SERVICE covering indexes missing: %',v_missing; end if;

  if has_table_privilege('anon','public.field_service_work_orders','SELECT')
     or has_table_privilege('anon','public.field_service_evidence','SELECT')
  then raise exception 'Anonymous FIELD-SERVICE data access is available'; end if;
end;
$field_service_security$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c003',false);
do $field_service_assignee_boundary$
begin
  if not public.field_service_task_can_manage(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000f501'
  ) then raise exception 'Assigned technician cannot manage own Field Service task'; end if;
end;
$field_service_assignee_boundary$;

reset role;
select set_config('request.jwt.claim.sub','',false);
