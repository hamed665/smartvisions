\set ON_ERROR_STOP on

create temp table automation_approval_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.usage_events) as usage_count,
  (select count(*) from public.followup_jobs) as followup_count;

grant select on automation_approval_side_effect_baseline to service_role;

insert into auth.users(id)
values ('00000000-0000-0000-0000-00000000c002')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role)
values (
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c002',
  'SALES_MANAGER'
)
on conflict (organization_id,user_id) do update set role=excluded.role;

-- Reuse the disposable Automation CI Organization/OWNER and Lead created by
-- earlier controlled smokes. No Production fixture is involved.
insert into public.approval_rules(
  organization_id,action_key,requires_approval,config,
  mode,expiry_minutes,escalation_minutes,allow_delegation,
  reviewer_roles,delegation_roles
) values (
  '00000000-0000-0000-0000-000000000c01',
  'OUTBOUND_SEND',true,'{}'::jsonb,
  'STRICT',1440,240,true,
  array['OWNER']::text[],
  array['OWNER','ADMIN','SALES_MANAGER']::text[]
)
on conflict (organization_id,action_key) do update
set
  requires_approval=excluded.requires_approval,
  mode=excluded.mode,
  expiry_minutes=excluded.expiry_minutes,
  escalation_minutes=excluded.escalation_minutes,
  allow_delegation=excluded.allow_delegation,
  reviewer_roles=excluded.reviewer_roles,
  delegation_roles=excluded.delegation_roles;

insert into public.sales_conversations(
  id,organization_id,lead_id,channel
) values (
  '00000000-0000-0000-0000-00000000c160',
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c150',
  'WHATSAPP'
)
on conflict (id) do nothing;

insert into public.conversation_messages(
  id,organization_id,conversation_id,lead_id,provider_message_id,
  channel,direction,media_type,original_text,requires_approval,
  approval_reason,status,metadata
) values
(
  '00000000-0000-0000-0000-00000000c170',
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c160',
  '00000000-0000-0000-0000-00000000c150',
  'shadow:auto-approval-ci-approve',
  'WHATSAPP','OUTBOUND','TEXT','approval smoke approve',
  true,'SHADOW_MODE_REVIEW','APPROVAL_REQUIRED',
  '{"source":"SHADOW_MODE"}'::jsonb
),
(
  '00000000-0000-0000-0000-00000000c171',
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c160',
  '00000000-0000-0000-0000-00000000c150',
  'shadow:auto-approval-ci-reject',
  'WHATSAPP','OUTBOUND','TEXT','approval smoke reject',
  true,'SHADOW_MODE_REVIEW','APPROVAL_REQUIRED',
  '{"source":"SHADOW_MODE"}'::jsonb
),
(
  '00000000-0000-0000-0000-00000000c172',
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c160',
  '00000000-0000-0000-0000-00000000c150',
  'shadow:auto-approval-ci-expire',
  'WHATSAPP','OUTBOUND','TEXT','approval smoke expire',
  true,'SHADOW_MODE_REVIEW','APPROVAL_REQUIRED',
  '{"source":"SHADOW_MODE"}'::jsonb
),
(
  '00000000-0000-0000-0000-00000000c173',
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c160',
  '00000000-0000-0000-0000-00000000c150',
  'shadow:auto-approval-ci-escalate',
  'WHATSAPP','OUTBOUND','TEXT','approval smoke escalate',
  true,'SHADOW_MODE_REVIEW','APPROVAL_REQUIRED',
  '{"source":"SHADOW_MODE"}'::jsonb
),
(
  '00000000-0000-0000-0000-00000000c174',
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c160',
  '00000000-0000-0000-0000-00000000c150',
  'shadow:auto-approval-ci-delegate',
  'WHATSAPP','OUTBOUND','TEXT','approval smoke delegate',
  true,'SHADOW_MODE_REVIEW','APPROVAL_REQUIRED',
  '{"source":"SHADOW_MODE"}'::jsonb
);

do $policy_snapshot_and_direct_mutation_guard$
begin
  if exists(
    select 1 from public.conversation_messages
    where id in (
      '00000000-0000-0000-0000-00000000c170',
      '00000000-0000-0000-0000-00000000c171',
      '00000000-0000-0000-0000-00000000c172',
      '00000000-0000-0000-0000-00000000c173',
      '00000000-0000-0000-0000-00000000c174'
    )
      and (
        approval_action_key<>'OUTBOUND_SEND'
        or approval_policy_mode<>'STRICT'
        or approval_requested_at is null
        or approval_escalates_at is null
        or approval_expires_at is null
        or approval_reviewer_roles<>array['OWNER']::text[]
      )
  ) then
    raise exception 'Approval policy snapshot was not prepared';
  end if;

  begin
    update public.conversation_messages
    set status='APPROVED',requires_approval=false
    where id='00000000-0000-0000-0000-00000000c170';
    raise exception 'Pending approval allowed direct mutation';
  exception when others then
    if sqlerrm not like 'Pending message approval must use governed approval commands%' then
      raise;
    end if;
  end;
end;
$policy_snapshot_and_direct_mutation_guard$;

set role service_role;

do $approve_reject_and_replay$
declare
  v_result jsonb;
begin
  v_result:=public.decide_message_approval(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c170',
    'APPROVE',null,'approval-ci-approve-0001'
  );
  if v_result->>'decision'<>'APPROVED'
     or coalesce((v_result->>'replayed')::boolean,false)
  then
    raise exception 'Approval command failed';
  end if;

  v_result:=public.decide_message_approval(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c170',
    'APPROVE',null,'approval-ci-approve-0001'
  );
  if coalesce((v_result->>'replayed')::boolean,false) is distinct from true then
    raise exception 'Approval replay failed';
  end if;

  begin
    perform public.decide_message_approval(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      '00000000-0000-0000-0000-00000000c171',
      'REJECT',null,'approval-ci-reject-invalid'
    );
    raise exception 'Reject without denial reason was accepted';
  exception when others then
    if sqlerrm not like 'Message approval decision payload is invalid%' then
      raise;
    end if;
  end;

  v_result:=public.decide_message_approval(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c171',
    'REJECT','Unsafe commercial promise','approval-ci-reject-0001'
  );
  if v_result->>'decision'<>'REJECTED' then
    raise exception 'Reject command failed';
  end if;

  if not exists(
    select 1 from public.conversation_messages
    where id='00000000-0000-0000-0000-00000000c171'
      and status='BLOCKED'
      and requires_approval=false
      and approval_denial_reason='Unsafe commercial promise'
  ) then
    raise exception 'Denial reason was not persisted';
  end if;
end;
$approve_reject_and_replay$;

do $delegate_and_assigned_reviewer$
declare
  v_result jsonb;
begin
  v_result:=public.delegate_message_approval(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c174',
    '00000000-0000-0000-0000-00000000c002',
    'approval-ci-delegate-0001'
  );
  if v_result->>'decision'<>'DELEGATED'
     or v_result->>'reviewerUserId'<>'00000000-0000-0000-0000-00000000c002'
  then
    raise exception 'Approval delegation failed';
  end if;

  v_result:=public.delegate_message_approval(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c174',
    '00000000-0000-0000-0000-00000000c002',
    'approval-ci-delegate-0001'
  );
  if coalesce((v_result->>'replayed')::boolean,false) is distinct from true then
    raise exception 'Approval delegation replay failed';
  end if;

  v_result:=public.decide_message_approval(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c002',
    '00000000-0000-0000-0000-00000000c174',
    'APPROVE',null,'approval-ci-delegate-approve-0001'
  );
  if v_result->>'decision'<>'APPROVED'
     or v_result->>'reviewerUserId'<>'00000000-0000-0000-0000-00000000c002'
  then
    raise exception 'Assigned delegated reviewer could not decide approval';
  end if;
end;
$delegate_and_assigned_reviewer$;

reset role;

-- Force controlled deadline conditions only in the disposable CI database.
select set_config('app.message_approval_mutation','allowed',false);
update public.conversation_messages
set approval_expires_at=now()-interval '1 minute',
    approval_escalates_at=now()-interval '2 minutes'
where id='00000000-0000-0000-0000-00000000c172';

update public.conversation_messages
set approval_escalates_at=now()-interval '1 minute',
    approval_expires_at=now()+interval '1 hour'
where id='00000000-0000-0000-0000-00000000c173';
select set_config('app.message_approval_mutation','0',false);

set role service_role;

do $deadline_reconciliation$
declare
  v_expired integer;
  v_escalated integer;
begin
  select expired_count,escalated_count
  into v_expired,v_escalated
  from public.reconcile_due_message_approvals(
    '00000000-0000-0000-0000-000000000c01',100
  );

  if v_expired<1 or v_escalated<1 then
    raise exception 'Approval deadline reconciliation did not process expiry/escalation';
  end if;

  if not exists(
    select 1 from public.conversation_messages
    where id='00000000-0000-0000-0000-00000000c172'
      and status='BLOCKED'
      and approval_decision='EXPIRED'
      and approval_denial_reason='Approval expired before decision'
  ) then
    raise exception 'Expired approval was not fail-closed';
  end if;

  if not exists(
    select 1 from public.conversation_messages
    where id='00000000-0000-0000-0000-00000000c173'
      and approval_escalated_at is not null
      and requires_approval=true
  ) then
    raise exception 'Approval escalation was not recorded';
  end if;
end;
$deadline_reconciliation$;

reset role;

do $approval_contract_and_security$
declare
  v_base automation_approval_side_effect_baseline%rowtype;
begin
  if not exists(
    select 1 from public.approval_rules
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and action_key='OUTBOUND_SEND'
      and mode='STRICT'
      and requires_approval=true
  ) then
    raise exception 'STRICT approval rule contract is missing';
  end if;

  if not exists(
    select 1 from public.tool_action_registry
    where action_key='SEND_FOLLOWUP'
      and availability='AVAILABLE'
      and approval_requirement='REQUIRED'
      and approval_policy_key='OUTBOUND_SEND'
      and cardinality(required_work_packages)=0
  ) then
    raise exception 'SEND_FOLLOWUP approval/runtime contract was not closed correctly';
  end if;

  if not has_column_privilege('service_role','public.conversation_messages','approval_policy_mode','SELECT')
     or not has_column_privilege('service_role','public.conversation_messages','approval_expires_at','SELECT')
     or not has_column_privilege('service_role','public.conversation_messages','approval_decision','UPDATE')
     or not has_column_privilege('service_role','public.conversation_messages','approval_reviewer_user_id','UPDATE')
     or not has_column_privilege('service_role','public.organization_members','role','SELECT')
     or not has_column_privilege('service_role','public.audit_logs','correlation_id','SELECT')
     or not has_column_privilege('service_role','public.audit_logs','correlation_id','INSERT')
  then
    raise exception 'Approval service-role column grants are incomplete';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.decide_message_approval(uuid,uuid,uuid,text,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.delegate_message_approval(uuid,uuid,uuid,uuid,text)',
       'EXECUTE'
     )
  then
    raise exception 'Trusted approval mutation is browser executable';
  end if;

  if exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'decide_message_approval','delegate_message_approval',
        'reconcile_due_message_approvals','message_approval_replay',
        'message_approval_actor_role','can_review_message_approval'
      )
      and p.prosecdef
  ) then
    raise exception 'Approval boundary unexpectedly uses SECURITY DEFINER';
  end if;

  select * into v_base from automation_approval_side_effect_baseline;
  if (select count(*) from public.outreach_messages)<>v_base.outreach_count
     or (select count(*) from public.usage_events)<>v_base.usage_count
     or (select count(*) from public.followup_jobs)<>v_base.followup_count
  then
    raise exception 'AUTO-APPROVAL caused outbound/runtime side effects';
  end if;
end;
$approval_contract_and_security$;

reset role;
