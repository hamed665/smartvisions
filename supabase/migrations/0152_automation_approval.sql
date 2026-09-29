-- AUTO-APPROVAL
-- Extends the existing approval_rules + conversation_messages + audit_logs
-- authorities. No second approval engine, request table, queue, outbox,
-- workflow runtime, action gateway or provider-send authority is created.

alter table public.approval_rules
  add column if not exists mode text,
  add column if not exists expiry_minutes integer,
  add column if not exists escalation_minutes integer,
  add column if not exists allow_delegation boolean,
  add column if not exists reviewer_roles text[],
  add column if not exists delegation_roles text[];

update public.approval_rules
set
  mode=coalesce(mode,case when requires_approval then 'STRICT' else 'AUTO' end),
  expiry_minutes=case
    when requires_approval then coalesce(expiry_minutes,1440)
    else null
  end,
  escalation_minutes=case
    when requires_approval then coalesce(escalation_minutes,240)
    else null
  end,
  allow_delegation=coalesce(allow_delegation,requires_approval),
  reviewer_roles=coalesce(
    reviewer_roles,
    case when requires_approval then array['OWNER']::text[] else '{}'::text[] end
  ),
  delegation_roles=coalesce(
    delegation_roles,
    case when requires_approval
      then array['OWNER','ADMIN','SALES_MANAGER']::text[]
      else '{}'::text[]
    end
  );

alter table public.approval_rules
  alter column mode set not null,
  alter column allow_delegation set not null,
  alter column reviewer_roles set not null,
  alter column delegation_roles set not null;

alter table public.approval_rules
  add constraint approval_rules_mode_check
    check (mode in ('AUTO','REVIEW','STRICT')),
  add constraint approval_rules_mode_consistency_check
    check (
      (mode='AUTO'
       and requires_approval=false
       and expiry_minutes is null
       and escalation_minutes is null
       and cardinality(reviewer_roles)=0)
      or
      (mode in ('REVIEW','STRICT')
       and requires_approval=true
       and expiry_minutes between 5 and 10080
       and escalation_minutes between 1 and expiry_minutes
       and cardinality(reviewer_roles) between 1 and 4)
    ),
  add constraint approval_rules_reviewer_roles_check
    check (
      reviewer_roles <@ array['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']::text[]
      and delegation_roles <@ array['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']::text[]
    ),
  add constraint approval_rules_delegation_check
    check (
      (allow_delegation and cardinality(delegation_roles)>0)
      or
      (not allow_delegation)
    );

comment on table public.approval_rules is
  'Canonical approval policy authority. AUTO means no human approval; REVIEW/STRICT require governed review.';

alter table public.conversation_messages
  add column if not exists approval_action_key text,
  add column if not exists approval_policy_mode text,
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approval_escalates_at timestamptz,
  add column if not exists approval_expires_at timestamptz,
  add column if not exists approval_escalated_at timestamptz,
  add column if not exists approval_reviewer_roles text[],
  add column if not exists approval_allow_delegation boolean,
  add column if not exists approval_delegation_roles text[],
  add column if not exists approval_reviewer_user_id uuid,
  add column if not exists approval_delegated_by_user_id uuid,
  add column if not exists approval_delegated_at timestamptz,
  add column if not exists approval_decision text,
  add column if not exists approval_decided_by_user_id uuid,
  add column if not exists approval_decided_at timestamptz,
  add column if not exists approval_denial_reason text;

alter table public.conversation_messages
  add constraint conversation_messages_approval_mode_check
    check (
      approval_policy_mode is null
      or approval_policy_mode in ('AUTO','REVIEW','STRICT')
    ),
  add constraint conversation_messages_approval_decision_check
    check (
      approval_decision is null
      or approval_decision in ('APPROVED','REJECTED','EXPIRED')
    ),
  add constraint conversation_messages_approval_deadline_check
    check (
      approval_escalates_at is null
      or approval_expires_at is null
      or approval_escalates_at <= approval_expires_at
    ),
  add constraint conversation_messages_approval_reason_check
    check (
      approval_denial_reason is null
      or length(btrim(approval_denial_reason)) between 3 and 500
    );

create index conversation_messages_approval_deadline_idx
  on public.conversation_messages(
    organization_id,approval_expires_at,approval_escalates_at,created_at
  )
  where requires_approval=true
    and status in ('APPROVAL_REQUIRED','READY');

create index conversation_messages_approval_reviewer_idx
  on public.conversation_messages(
    organization_id,approval_reviewer_user_id,created_at desc
  )
  where requires_approval=true
    and approval_reviewer_user_id is not null
    and status in ('APPROVAL_REQUIRED','READY');

create unique index audit_logs_message_approval_request_uidx
  on public.audit_logs(organization_id,entity_id,correlation_id)
  where entity_type='conversation_message'
    and action in (
      'MESSAGE_APPROVAL_APPROVED',
      'MESSAGE_APPROVAL_REJECTED',
      'MESSAGE_APPROVAL_DELEGATED',
      'MESSAGE_APPROVAL_ESCALATED',
      'MESSAGE_APPROVAL_EXPIRED'
    )
    and correlation_id is not null;

create or replace function public.prepare_message_approval_request()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_rule public.approval_rules%rowtype;
  v_entering_queue boolean;
begin
  if tg_op='INSERT' then
    v_entering_queue :=
      new.requires_approval
      and new.status in ('APPROVAL_REQUIRED','READY');
  else
    v_entering_queue :=
      new.requires_approval
      and new.status in ('APPROVAL_REQUIRED','READY')
      and (
        old.requires_approval is distinct from true
        or old.status not in ('APPROVAL_REQUIRED','READY')
      );
  end if;

  if not v_entering_queue then
    return new;
  end if;

  new.approval_action_key := coalesce(
    nullif(upper(btrim(new.approval_action_key)),''),
    'OUTBOUND_SEND'
  );

  select * into v_rule
  from public.approval_rules r
  where r.organization_id=new.organization_id
    and r.action_key=new.approval_action_key;

  if not found then
    raise exception 'Approval policy is not configured: %',new.approval_action_key;
  end if;

  if v_rule.mode='AUTO' or not v_rule.requires_approval then
    raise exception 'AUTO approval policy cannot enter human approval queue: %',
      new.approval_action_key;
  end if;

  new.approval_policy_mode := v_rule.mode;
  new.approval_requested_at := now();
  new.approval_escalates_at :=
    now() + make_interval(mins=>v_rule.escalation_minutes);
  new.approval_expires_at :=
    now() + make_interval(mins=>v_rule.expiry_minutes);
  new.approval_escalated_at := null;
  new.approval_reviewer_roles := v_rule.reviewer_roles;
  new.approval_allow_delegation := v_rule.allow_delegation;
  new.approval_delegation_roles := v_rule.delegation_roles;
  new.approval_reviewer_user_id := null;
  new.approval_delegated_by_user_id := null;
  new.approval_delegated_at := null;
  new.approval_decision := null;
  new.approval_decided_by_user_id := null;
  new.approval_decided_at := null;
  new.approval_denial_reason := null;

  return new;
end;
$$;

-- Existing Production approvals predate policy snapshots. Preserve them and
-- start their deadline clocks at migration time rather than retro-expiring them.
update public.conversation_messages m
set
  approval_action_key=coalesce(m.approval_action_key,'OUTBOUND_SEND'),
  approval_policy_mode=coalesce(m.approval_policy_mode,r.mode,'STRICT'),
  approval_requested_at=coalesce(m.approval_requested_at,m.created_at),
  approval_escalates_at=coalesce(
    m.approval_escalates_at,
    now() + make_interval(mins=>coalesce(r.escalation_minutes,240))
  ),
  approval_expires_at=coalesce(
    m.approval_expires_at,
    now() + make_interval(mins=>coalesce(r.expiry_minutes,1440))
  ),
  approval_reviewer_roles=coalesce(
    m.approval_reviewer_roles,r.reviewer_roles,array['OWNER']::text[]
  ),
  approval_allow_delegation=coalesce(
    m.approval_allow_delegation,r.allow_delegation,true
  ),
  approval_delegation_roles=coalesce(
    m.approval_delegation_roles,
    r.delegation_roles,
    array['OWNER','ADMIN','SALES_MANAGER']::text[]
  )
from public.approval_rules r
where m.organization_id=r.organization_id
  and r.action_key='OUTBOUND_SEND'
  and m.requires_approval=true
  and m.status in ('APPROVAL_REQUIRED','READY');

create or replace function public.guard_message_approval_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if old.requires_approval
     and old.status in ('APPROVAL_REQUIRED','READY')
     and coalesce(current_setting('app.message_approval_mutation',true),'')<>'allowed'
     and (
       new.requires_approval is distinct from old.requires_approval
       or new.status is distinct from old.status
       or new.processed_at is distinct from old.processed_at
       or new.approval_reason is distinct from old.approval_reason
       or new.approval_action_key is distinct from old.approval_action_key
       or new.approval_policy_mode is distinct from old.approval_policy_mode
       or new.approval_requested_at is distinct from old.approval_requested_at
       or new.approval_escalates_at is distinct from old.approval_escalates_at
       or new.approval_expires_at is distinct from old.approval_expires_at
       or new.approval_escalated_at is distinct from old.approval_escalated_at
       or new.approval_reviewer_roles is distinct from old.approval_reviewer_roles
       or new.approval_allow_delegation is distinct from old.approval_allow_delegation
       or new.approval_delegation_roles is distinct from old.approval_delegation_roles
       or new.approval_reviewer_user_id is distinct from old.approval_reviewer_user_id
       or new.approval_delegated_by_user_id is distinct from old.approval_delegated_by_user_id
       or new.approval_delegated_at is distinct from old.approval_delegated_at
       or new.approval_decision is distinct from old.approval_decision
       or new.approval_decided_by_user_id is distinct from old.approval_decided_by_user_id
       or new.approval_decided_at is distinct from old.approval_decided_at
       or new.approval_denial_reason is distinct from old.approval_denial_reason
     )
  then
    raise exception 'Pending message approval must use governed approval commands';
  end if;

  return new;
end;
$$;

drop trigger if exists conversation_messages_prepare_approval
  on public.conversation_messages;
create trigger conversation_messages_prepare_approval
before insert or update of requires_approval,status,approval_action_key
on public.conversation_messages
for each row execute function public.prepare_message_approval_request();

drop trigger if exists conversation_messages_approval_mutation_guard
  on public.conversation_messages;
create trigger conversation_messages_approval_mutation_guard
before update on public.conversation_messages
for each row execute function public.guard_message_approval_mutation();

-- Clean installs must not depend on historical Production table grants.
-- Approval commands get only the message columns they read/mutate.
grant select (
  id,organization_id,requires_approval,status,approval_policy_mode,
  approval_expires_at,approval_reviewer_user_id,approval_reviewer_roles,
  approval_allow_delegation,approval_delegation_roles,
  approval_escalates_at,approval_escalated_at,created_at
) on public.conversation_messages to service_role;

grant update (
  requires_approval,status,approval_reason,processed_at,
  approval_escalated_at,approval_reviewer_user_id,
  approval_delegated_by_user_id,approval_delegated_at,
  approval_decision,approval_decided_by_user_id,approval_decided_at,
  approval_denial_reason
) on public.conversation_messages to service_role;

grant select (
  organization_id,user_id,role
) on public.organization_members to service_role;

grant select (
  organization_id,action,entity_type,entity_id,
  correlation_id,after_data,created_at
) on public.audit_logs to service_role;

grant insert (
  organization_id,actor_type,actor_id,action,
  entity_type,entity_id,after_data,correlation_id
) on public.audit_logs to service_role;

create or replace function public.message_approval_replay(
  p_organization_id uuid,
  p_message_id uuid,
  p_request_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_after jsonb;
begin
  select a.after_data into v_after
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.entity_type='conversation_message'
    and a.entity_id=p_message_id::text
    and a.correlation_id=p_request_key
    and a.action in (
      'MESSAGE_APPROVAL_APPROVED',
      'MESSAGE_APPROVAL_REJECTED',
      'MESSAGE_APPROVAL_DELEGATED'
    )
  order by a.created_at desc
  limit 1;

  if v_after is null then return null; end if;

  if coalesce(v_after->>'requestHash','')<>p_request_hash then
    raise exception 'Message approval request key conflict';
  end if;

  return (v_after - 'requestHash') || jsonb_build_object('replayed',true);
end;
$$;

create or replace function public.message_approval_actor_role(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns text
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_role text;
begin
  if current_user<>'service_role' then
    raise exception 'Message approval mutation requires trusted server boundary';
  end if;

  select m.role into v_role
  from public.organization_members m
  where m.organization_id=p_organization_id
    and m.user_id=p_actor_user_id;

  if v_role is null then
    raise exception 'Approval reviewer is not a member of the Organization';
  end if;

  return v_role;
end;
$$;

create or replace function public.can_review_message_approval(
  p_organization_id uuid,
  p_message_id uuid,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_role text;
  v_requires_approval boolean;
  v_status text;
  v_policy_mode text;
  v_expires_at timestamptz;
  v_reviewer_user_id uuid;
  v_reviewer_roles text[];
begin
  v_role := public.message_approval_actor_role(
    p_organization_id,p_actor_user_id
  );

  select
    m.requires_approval,m.status,m.approval_policy_mode,
    m.approval_expires_at,m.approval_reviewer_user_id,
    m.approval_reviewer_roles
  into
    v_requires_approval,v_status,v_policy_mode,
    v_expires_at,v_reviewer_user_id,v_reviewer_roles
  from public.conversation_messages m
  where m.organization_id=p_organization_id
    and m.id=p_message_id;

  if not found
     or not v_requires_approval
     or v_status not in ('APPROVAL_REQUIRED','READY')
     or v_policy_mode not in ('REVIEW','STRICT')
     or v_expires_at is null
     or v_expires_at<=now()
  then
    return false;
  end if;

  if v_role='OWNER' then return true; end if;

  if v_reviewer_user_id is not null then
    return v_reviewer_user_id=p_actor_user_id;
  end if;

  return v_role=any(coalesce(v_reviewer_roles,'{}'::text[]));
end;
$$;

create or replace function public.decide_message_approval(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_message_id uuid,
  p_decision text,
  p_reason text,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_message_id uuid;
  v_approval_expires_at timestamptz;
  v_approval_decision text;
  v_message_status text;
  v_policy_mode text;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_request_key text := btrim(coalesce(p_request_key,''));
  v_request_hash text;
  v_replay jsonb;
  v_action text;
  v_status text;
  v_result jsonb;
begin
  perform public.message_approval_actor_role(
    p_organization_id,p_actor_user_id
  );

  if v_decision not in ('APPROVE','REJECT')
     or length(v_request_key) not between 8 and 200
     or (v_decision='REJECT' and (
       v_reason is null or length(v_reason) not between 3 and 500
     ))
     or (v_decision='APPROVE' and v_reason is not null)
  then
    raise exception 'Message approval decision payload is invalid';
  end if;

  v_request_hash := md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_message_id::text,
    v_decision,coalesce(v_reason,'')
  ));

  v_replay := public.message_approval_replay(
    p_organization_id,p_message_id,v_request_key,v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text||':'||p_message_id::text,
      0
    )
  );

  select m.id,m.approval_expires_at
  into v_message_id,v_approval_expires_at
  from public.conversation_messages m
  where m.organization_id=p_organization_id
    and m.id=p_message_id
  for update;

  if not found then raise exception 'Approval message was not found'; end if;

  if not public.can_review_message_approval(
    p_organization_id,p_message_id,p_actor_user_id
  ) then
    if v_approval_expires_at is not null
       and v_approval_expires_at<=now()
    then
      raise exception 'Approval request has expired';
    end if;
    raise exception 'Approval reviewer is not permitted for this request';
  end if;

  v_action := case
    when v_decision='APPROVE' then 'MESSAGE_APPROVAL_APPROVED'
    else 'MESSAGE_APPROVAL_REJECTED'
  end;
  v_status := case
    when v_decision='APPROVE' then 'APPROVED'
    else 'BLOCKED'
  end;

  perform set_config('app.message_approval_mutation','allowed',true);

  update public.conversation_messages
  set
    requires_approval=false,
    status=v_status,
    approval_reason=case
      when v_decision='APPROVE' then null
      else v_reason
    end,
    processed_at=now(),
    approval_decision=case
      when v_decision='APPROVE' then 'APPROVED'
      else 'REJECTED'
    end,
    approval_decided_by_user_id=p_actor_user_id,
    approval_decided_at=now(),
    approval_denial_reason=case
      when v_decision='REJECT' then v_reason
      else null
    end
  where organization_id=p_organization_id
    and id=p_message_id
  returning id,approval_decision,status,approval_policy_mode
  into v_message_id,v_approval_decision,v_message_status,v_policy_mode;

  perform set_config('app.message_approval_mutation','0',true);

  v_result := jsonb_build_object(
    'messageId',v_message_id,
    'decision',v_approval_decision,
    'status',v_message_status,
    'reviewerUserId',p_actor_user_id,
    'policyMode',v_policy_mode,
    'replayed',false,
    'requestHash',v_request_hash
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,v_action,
    'conversation_message',p_message_id::text,
    v_result,v_request_key
  );

  return v_result - 'requestHash';
exception
  when others then
    perform set_config('app.message_approval_mutation','0',true);
    raise;
end;
$$;

create or replace function public.delegate_message_approval(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_message_id uuid,
  p_delegate_to_user_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_actor_role text;
  v_target_role text;
  v_message_id uuid;
  v_allow_delegation boolean;
  v_delegation_roles text[];
  v_request_key text := btrim(coalesce(p_request_key,''));
  v_request_hash text;
  v_replay jsonb;
  v_result jsonb;
begin
  v_actor_role := public.message_approval_actor_role(
    p_organization_id,p_actor_user_id
  );

  if p_delegate_to_user_id is null
     or p_delegate_to_user_id=p_actor_user_id
     or length(v_request_key) not between 8 and 200
  then
    raise exception 'Approval delegation payload is invalid';
  end if;

  v_request_hash := md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_message_id::text,
    p_delegate_to_user_id::text
  ));

  v_replay := public.message_approval_replay(
    p_organization_id,p_message_id,v_request_key,v_request_hash
  );
  if v_replay is not null then return v_replay; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text||':'||p_message_id::text,
      0
    )
  );

  select m.id,m.approval_allow_delegation,m.approval_delegation_roles
  into v_message_id,v_allow_delegation,v_delegation_roles
  from public.conversation_messages m
  where m.organization_id=p_organization_id
    and m.id=p_message_id
  for update;

  if not found then raise exception 'Approval message was not found'; end if;

  if not public.can_review_message_approval(
    p_organization_id,p_message_id,p_actor_user_id
  )
     or v_actor_role not in ('OWNER','ADMIN')
     or not coalesce(v_allow_delegation,false)
  then
    raise exception 'Approval delegation is not permitted';
  end if;

  select m.role into v_target_role
  from public.organization_members m
  where m.organization_id=p_organization_id
    and m.user_id=p_delegate_to_user_id;

  if v_target_role is null
     or not (
       v_target_role=any(
         coalesce(v_delegation_roles,'{}'::text[])
       )
     )
  then
    raise exception 'Approval delegate is not eligible';
  end if;

  perform set_config('app.message_approval_mutation','allowed',true);

  update public.conversation_messages
  set
    approval_reviewer_user_id=p_delegate_to_user_id,
    approval_delegated_by_user_id=p_actor_user_id,
    approval_delegated_at=now()
  where organization_id=p_organization_id
    and id=p_message_id
  returning id into v_message_id;

  perform set_config('app.message_approval_mutation','0',true);

  v_result := jsonb_build_object(
    'messageId',v_message_id,
    'decision','DELEGATED',
    'reviewerUserId',p_delegate_to_user_id,
    'delegatedByUserId',p_actor_user_id,
    'replayed',false,
    'requestHash',v_request_hash
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'MESSAGE_APPROVAL_DELEGATED','conversation_message',
    p_message_id::text,v_result,v_request_key
  );

  return v_result - 'requestHash';
exception
  when others then
    perform set_config('app.message_approval_mutation','0',true);
    raise;
end;
$$;

create or replace function public.reconcile_due_message_approvals(
  p_organization_id uuid,
  p_limit integer default 100
)
returns table(expired_count integer,escalated_count integer)
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_row record;
  v_expired integer := 0;
  v_escalated integer := 0;
  v_key text;
begin
  if current_user<>'service_role'
     or p_organization_id is null
     or p_limit not between 1 and 500
  then
    raise exception 'Approval deadline reconciliation is not permitted';
  end if;

  for v_row in
    select
      m.id,m.approval_expires_at,m.approval_escalates_at,
      m.approval_escalated_at,m.approval_policy_mode,
      m.approval_reviewer_user_id,m.created_at
    from public.conversation_messages m
    where m.organization_id=p_organization_id
      and m.requires_approval=true
      and m.status in ('APPROVAL_REQUIRED','READY')
      and (
        m.approval_expires_at<=now()
        or (
          m.approval_escalates_at<=now()
          and m.approval_escalated_at is null
        )
      )
    order by m.approval_expires_at nulls last,m.created_at,m.id
    limit p_limit
    for update skip locked
  loop
    if v_row.approval_expires_at is not null
       and v_row.approval_expires_at<=now()
    then
      perform set_config('app.message_approval_mutation','allowed',true);

      update public.conversation_messages
      set
        requires_approval=false,
        status='BLOCKED',
        approval_reason='APPROVAL_EXPIRED',
        processed_at=now(),
        approval_decision='EXPIRED',
        approval_decided_by_user_id=null,
        approval_decided_at=now(),
        approval_denial_reason='Approval expired before decision'
      where id=v_row.id;

      perform set_config('app.message_approval_mutation','0',true);

      v_key := 'approval-expire:'||v_row.id::text||':'||
        extract(epoch from v_row.approval_expires_at)::bigint::text;

      insert into public.audit_logs(
        organization_id,actor_type,actor_id,action,entity_type,entity_id,
        after_data,correlation_id
      ) values (
        p_organization_id,'SYSTEM',null,'MESSAGE_APPROVAL_EXPIRED',
        'conversation_message',v_row.id::text,
        jsonb_build_object(
          'messageId',v_row.id,
          'decision','EXPIRED',
          'policyMode',v_row.approval_policy_mode
        ),
        v_key
      )
      on conflict do nothing;

      v_expired := v_expired+1;
    elsif v_row.approval_escalates_at is not null
       and v_row.approval_escalates_at<=now()
       and v_row.approval_escalated_at is null
    then
      perform set_config('app.message_approval_mutation','allowed',true);

      update public.conversation_messages
      set approval_escalated_at=now()
      where id=v_row.id
        and approval_escalated_at is null;

      perform set_config('app.message_approval_mutation','0',true);

      v_key := 'approval-escalate:'||v_row.id::text||':'||
        extract(epoch from v_row.approval_escalates_at)::bigint::text;

      insert into public.audit_logs(
        organization_id,actor_type,actor_id,action,entity_type,entity_id,
        after_data,correlation_id
      ) values (
        p_organization_id,'SYSTEM',null,'MESSAGE_APPROVAL_ESCALATED',
        'conversation_message',v_row.id::text,
        jsonb_build_object(
          'messageId',v_row.id,
          'policyMode',v_row.approval_policy_mode,
          'reviewerUserId',v_row.approval_reviewer_user_id
        ),
        v_key
      )
      on conflict do nothing;

      v_escalated := v_escalated+1;
    end if;
  end loop;

  return query select v_expired,v_escalated;
end;
$$;

-- AUTO-APPROVAL is now satisfied for SEND_FOLLOWUP. Durable execution remains
-- dependency-gated on AUTO-RUNTIME.
update public.tool_action_registry
set
  required_work_packages=array['AUTO-RUNTIME']::text[],
  description='Provider-bound follow-up through the existing approved-send policy. Approval is governed; publication remains blocked until durable Automation runtime exists.'
where action_key='SEND_FOLLOWUP'
  and availability='DEPENDENCY_PENDING';

revoke all on function public.message_approval_replay(uuid,uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.message_approval_actor_role(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.can_review_message_approval(uuid,uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.decide_message_approval(uuid,uuid,uuid,text,text,text)
  from public,anon,authenticated;
revoke all on function public.delegate_message_approval(uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.reconcile_due_message_approvals(uuid,integer)
  from public,anon,authenticated;

grant execute on function public.message_approval_replay(uuid,uuid,text,text)
  to service_role;
grant execute on function public.message_approval_actor_role(uuid,uuid)
  to service_role;
grant execute on function public.can_review_message_approval(uuid,uuid,uuid)
  to service_role;
grant execute on function public.decide_message_approval(uuid,uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.delegate_message_approval(uuid,uuid,uuid,uuid,text)
  to service_role;
grant execute on function public.reconcile_due_message_approvals(uuid,integer)
  to service_role;

revoke all on function public.prepare_message_approval_request()
  from public,anon,authenticated,service_role;
revoke all on function public.guard_message_approval_mutation()
  from public,anon,authenticated,service_role;
