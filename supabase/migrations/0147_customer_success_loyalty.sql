-- 0147: CUSTOMER-SUCCESS-LOYALTY
--
-- Bounded customer-success slice over existing canonical CRM/Marketing authorities.
-- New persisted truth is limited to non-cash loyalty events and referral records.
-- Account/Person/Task/Campaign/Consent/Deal/Payment authorities remain canonical.
-- No provider send, payment mutation, revenue claim, synthetic Production data, or auto-campaign activation.

alter table public.crm_tasks
  drop constraint if exists crm_tasks_source_type_check;

alter table public.crm_tasks
  add constraint crm_tasks_source_type_check
  check (source_type in (
    'MANUAL','NEXT_ACTION','CUSTOMER_SUCCESS','FOLLOWUP_JOB','HANDOFF_EVENT',
    'REPLY_EVENT','OPERATOR_BRIEF','APPROVAL_REQUEST','OTHER'
  ));

alter table public.campaigns
  add column if not exists customer_success_lifecycle text;

alter table public.campaigns
  add constraint campaigns_customer_success_lifecycle_check
  check (
    customer_success_lifecycle is null
    or (
      campaign_kind='MARKETING'
      and customer_success_lifecycle in ('ONBOARDING','RETENTION','REACTIVATION','LOYALTY','REFERRAL')
    )
  );

create index if not exists campaigns_customer_success_lifecycle_idx
  on public.campaigns(organization_id,customer_success_lifecycle,status,updated_at desc)
  where customer_success_lifecycle is not null;

create table public.customer_loyalty_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null,
  person_id uuid,
  event_type text not null check (event_type in ('EARN','REDEEM','ADJUST','EXPIRE')),
  points_delta integer not null check (points_delta between -1000000000 and 1000000000 and points_delta<>0),
  reward_key text,
  source_type text not null check (source_type in ('MANUAL','REFERRAL','CAMPAIGN','SERVICE_RECOVERY','OTHER')),
  source_ref text not null check (length(trim(source_ref)) between 1 and 512),
  request_key text not null check (request_key ~ '^[A-Za-z0-9._:-]{1,200}$'),
  recorded_by_user_id uuid not null,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=8192),
  created_at timestamptz not null default now(),
  constraint customer_loyalty_events_sign_check check (
    (event_type='EARN' and points_delta>0)
    or (event_type in ('REDEEM','EXPIRE') and points_delta<0)
    or event_type='ADJUST'
  ),
  constraint customer_loyalty_events_reward_key_check check (
    reward_key is null or reward_key ~ '^[A-Za-z0-9._:-]{1,120}$'
  ),
  constraint customer_loyalty_events_business_fk
    foreign key (organization_id,business_id)
    references public.businesses(organization_id,id) on delete restrict,
  constraint customer_loyalty_events_person_fk
    foreign key (organization_id,person_id)
    references public.crm_people(organization_id,id) on delete restrict,
  constraint customer_loyalty_events_actor_fk
    foreign key (organization_id,recorded_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  constraint customer_loyalty_events_request_unique unique (organization_id,request_key),
  constraint customer_loyalty_events_org_id_unique unique (organization_id,id)
);

create index customer_loyalty_events_subject_idx
  on public.customer_loyalty_events(organization_id,business_id,occurred_at desc,id desc);
create index customer_loyalty_events_person_idx
  on public.customer_loyalty_events(organization_id,person_id,occurred_at desc)
  where person_id is not null;
create index customer_loyalty_events_source_idx
  on public.customer_loyalty_events(organization_id,source_type,source_ref)
  where source_type='REFERRAL';

create index customer_loyalty_events_recorded_by_idx
  on public.customer_loyalty_events(organization_id,recorded_by_user_id);

alter table public.customer_loyalty_events enable row level security;
create policy customer_loyalty_events_member_read
  on public.customer_loyalty_events for select to authenticated
  using (public.is_org_member(organization_id));

create table public.customer_referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  referrer_business_id uuid not null,
  referrer_person_id uuid,
  referred_lead_id uuid,
  referred_business_id uuid,
  status text not null default 'RECORDED'
    check (status in ('RECORDED','QUALIFIED','CONVERTED','REWARDED','CANCELED')),
  source_ref text not null check (length(trim(source_ref)) between 1 and 512),
  evidence jsonb not null
    check (jsonb_typeof(evidence)='object' and evidence<>'{}'::jsonb and octet_length(evidence::text)<=8192),
  status_evidence jsonb,
  request_key text not null check (request_key ~ '^[A-Za-z0-9._:-]{1,200}$'),
  recorded_by_user_id uuid not null,
  last_transition_by_user_id uuid,
  occurred_at timestamptz not null,
  last_transition_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_referrals_referred_shape_check
    check (referred_lead_id is not null or referred_business_id is not null),
  constraint customer_referrals_status_evidence_check
    check (
      (last_transition_at is null and last_transition_by_user_id is null and status_evidence is null)
      or (
        last_transition_at is not null
        and last_transition_by_user_id is not null
        and status_evidence is not null
        and jsonb_typeof(status_evidence)='object'
        and status_evidence<>'{}'::jsonb
        and octet_length(status_evidence::text)<=8192
      )
    ),
  constraint customer_referrals_referrer_business_fk
    foreign key (organization_id,referrer_business_id)
    references public.businesses(organization_id,id) on delete restrict,
  constraint customer_referrals_referrer_person_fk
    foreign key (organization_id,referrer_person_id)
    references public.crm_people(organization_id,id) on delete restrict,
  constraint customer_referrals_referred_lead_fk
    foreign key (organization_id,referred_lead_id)
    references public.leads(organization_id,id) on delete restrict,
  constraint customer_referrals_referred_business_fk
    foreign key (organization_id,referred_business_id)
    references public.businesses(organization_id,id) on delete restrict,
  constraint customer_referrals_recorded_actor_fk
    foreign key (organization_id,recorded_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  constraint customer_referrals_transition_actor_fk
    foreign key (organization_id,last_transition_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  constraint customer_referrals_request_unique unique (organization_id,request_key),
  constraint customer_referrals_org_id_unique unique (organization_id,id)
);

create index customer_referrals_referrer_idx
  on public.customer_referrals(organization_id,referrer_business_id,status,updated_at desc);
create index customer_referrals_referred_lead_idx
  on public.customer_referrals(organization_id,referred_lead_id)
  where referred_lead_id is not null;
create index customer_referrals_referred_business_idx
  on public.customer_referrals(organization_id,referred_business_id)
  where referred_business_id is not null;

create index customer_referrals_referrer_person_idx
  on public.customer_referrals(organization_id,referrer_person_id)
  where referrer_person_id is not null;
create index customer_referrals_recorded_by_idx
  on public.customer_referrals(organization_id,recorded_by_user_id);
create index customer_referrals_transition_by_idx
  on public.customer_referrals(organization_id,last_transition_by_user_id)
  where last_transition_by_user_id is not null;

alter table public.customer_referrals enable row level security;
create policy customer_referrals_member_read
  on public.customer_referrals for select to authenticated
  using (public.is_org_member(organization_id));

create or replace function public.guard_customer_loyalty_event_immutable()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  raise exception 'Customer loyalty event is append-only';
end;
$$;

create trigger customer_loyalty_events_immutable_guard
before update or delete on public.customer_loyalty_events
for each row execute function public.guard_customer_loyalty_event_immutable();

create or replace function public.guard_customer_success_task_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if tg_op='INSERT' and new.source_type='CUSTOMER_SUCCESS' and current_user<>'service_role' then
    raise exception 'CUSTOMER_SUCCESS CRM task requires trusted governed materialization';
  end if;

  if tg_op='UPDATE' and old.source_type='CUSTOMER_SUCCESS' then
    if new.source_type is distinct from old.source_type
       or new.source_id is distinct from old.source_id
    then
      raise exception 'CUSTOMER_SUCCESS CRM task provenance is immutable';
    end if;
    if new.metadata->>'customerSuccessAction' is distinct from old.metadata->>'customerSuccessAction'
       or new.metadata->>'acceptedByUserId' is distinct from old.metadata->>'acceptedByUserId'
       or new.metadata->>'sourceBusinessId' is distinct from old.metadata->>'sourceBusinessId'
    then
      raise exception 'CUSTOMER_SUCCESS CRM task acceptance evidence is immutable';
    end if;
  end if;

  return new;
end;
$$;

create trigger crm_tasks_customer_success_guard
before insert or update on public.crm_tasks
for each row execute function public.guard_customer_success_task_mutation();

create or replace function public.get_customer_success_accounts(
  p_organization_id uuid,
  p_business_id uuid default null,
  p_limit integer default 100
)
returns table(
  business_id uuid,
  business_name text,
  account_lifecycle text,
  account_owner_user_id uuid,
  onboarding_state text,
  health_score integer,
  health_status text,
  risk_signals text[],
  last_activity_at timestamptz,
  open_support_case_count bigint,
  sla_breach_count bigint,
  overdue_task_count bigint,
  negative_sentiment_count bigint,
  active_relationship_count bigint,
  loyalty_points_balance bigint,
  referral_count bigint,
  suggested_action_kind text,
  suggested_task_type text,
  suggested_title text,
  suggested_priority text
)
language sql
stable
security invoker
set search_path=public,auth,pg_catalog
as $$
with account_evidence as (
  select
    b.id,
    b.name,
    b.account_lifecycle,
    b.account_owner_user_id,
    greatest(
      coalesce(b.account_lifecycle_updated_at,b.created_at),
      coalesce((select max(l.updated_at) from public.leads l
                where l.organization_id=b.organization_id and l.business_id=b.id),coalesce(b.account_lifecycle_updated_at,b.created_at)),
      coalesce((select max(sc.updated_at)
                from public.sales_conversations sc
                join public.leads l
                  on l.organization_id=sc.organization_id and l.id=sc.lead_id
                where l.organization_id=b.organization_id and l.business_id=b.id),coalesce(b.account_lifecycle_updated_at,b.created_at)),
      coalesce((select max(t.updated_at) from public.crm_tasks t
                where t.organization_id=b.organization_id and t.business_id=b.id),coalesce(b.account_lifecycle_updated_at,b.created_at)),
      coalesce((select max(c.updated_at) from public.crm_support_cases c
                where c.organization_id=b.organization_id and c.business_id=b.id),coalesce(b.account_lifecycle_updated_at,b.created_at)),
      coalesce((select max(r.updated_at) from public.crm_person_business_relationships r
                where r.organization_id=b.organization_id and r.business_id=b.id),coalesce(b.account_lifecycle_updated_at,b.created_at))
    ) as last_activity_at,
    (select count(*) from public.crm_support_cases c
     where c.organization_id=b.organization_id and c.business_id=b.id
       and c.status not in ('RESOLVED','CLOSED')) as open_support_case_count,
    (select count(*) from public.crm_support_cases c
     where c.organization_id=b.organization_id and c.business_id=b.id
       and c.status not in ('RESOLVED','CLOSED')
       and c.resolution_due_at is not null and c.resolution_due_at<now()) as sla_breach_count,
    (select count(*) from public.crm_tasks t
     where t.organization_id=b.organization_id and t.business_id=b.id
       and t.status not in ('DONE','CANCELED')
       and t.due_at is not null and t.due_at<now()) as overdue_task_count,
    (select count(*)
     from public.conversation_messages m
     join public.sales_conversations sc
       on sc.organization_id=m.organization_id and sc.id=m.conversation_id
     join public.leads l
       on l.organization_id=sc.organization_id and l.id=sc.lead_id
     where l.organization_id=b.organization_id and l.business_id=b.id
       and m.created_at>=now()-interval '30 days'
       and m.direction='INBOUND'
       and upper(coalesce(m.sentiment_label,'')) in ('NEGATIVE','VERY_NEGATIVE')) as negative_sentiment_count,
    (select count(*) from public.crm_person_business_relationships r
     where r.organization_id=b.organization_id and r.business_id=b.id and r.status='ACTIVE') as active_relationship_count,
    (select count(*) from public.crm_tasks t
     where t.organization_id=b.organization_id and t.business_id=b.id
       and t.source_type='CUSTOMER_SUCCESS'
       and t.metadata->>'customerSuccessAction'='ONBOARDING'
       and t.status='DONE') as onboarding_done_count,
    (select count(*) from public.crm_tasks t
     where t.organization_id=b.organization_id and t.business_id=b.id
       and t.source_type='CUSTOMER_SUCCESS'
       and t.metadata->>'customerSuccessAction'='ONBOARDING'
       and t.status not in ('DONE','CANCELED')) as onboarding_open_count,
    coalesce((select sum(e.points_delta)::bigint from public.customer_loyalty_events e
              where e.organization_id=b.organization_id and e.business_id=b.id),0::bigint) as loyalty_points_balance,
    (select count(*) from public.customer_referrals r
     where r.organization_id=b.organization_id and r.referrer_business_id=b.id
       and r.status<>'CANCELED') as referral_count
  from public.businesses b
  where b.organization_id=p_organization_id
    and b.account_lifecycle in ('CUSTOMER','FORMER_CUSTOMER')
    and (p_business_id is null or b.id=p_business_id)
), scored as (
  select ae.*,
    case
      when ae.account_lifecycle='FORMER_CUSTOMER' then 20
      else greatest(0,100
        - case when ae.sla_breach_count>0 then 35 else 0 end
        - case when ae.open_support_case_count>0 then 15 else 0 end
        - case when ae.overdue_task_count>0 then 15 else 0 end
        - case when ae.negative_sentiment_count>0 then 20 else 0 end
        - case when ae.last_activity_at<now()-interval '60 days' then 25
               when ae.last_activity_at<now()-interval '30 days' then 10 else 0 end)
    end::integer as computed_health_score,
    case
      when ae.account_lifecycle='FORMER_CUSTOMER' then 'NOT_APPLICABLE'
      when ae.onboarding_done_count>0 then 'COMPLETE'
      when ae.onboarding_open_count>0 then 'IN_PROGRESS'
      else 'NOT_STARTED'
    end as computed_onboarding_state
  from account_evidence ae
)
select
  s.id,
  s.name,
  s.account_lifecycle,
  s.account_owner_user_id,
  s.computed_onboarding_state,
  s.computed_health_score,
  case
    when s.account_lifecycle='FORMER_CUSTOMER' then 'CHURNED'
    when s.computed_health_score<40 then 'CRITICAL'
    when s.computed_health_score<70 then 'AT_RISK'
    else 'HEALTHY'
  end,
  array_remove(array[
    case when s.account_lifecycle='FORMER_CUSTOMER' then 'FORMER_CUSTOMER' end,
    case when s.sla_breach_count>0 then 'SLA_BREACH' end,
    case when s.open_support_case_count>0 then 'OPEN_SUPPORT' end,
    case when s.overdue_task_count>0 then 'OVERDUE_TASK' end,
    case when s.negative_sentiment_count>0 then 'NEGATIVE_SENTIMENT_30D' end,
    case when s.last_activity_at<now()-interval '60 days' then 'INACTIVE_60D'
         when s.last_activity_at<now()-interval '30 days' then 'INACTIVE_30D' end
  ]::text[],null),
  s.last_activity_at,
  s.open_support_case_count,
  s.sla_breach_count,
  s.overdue_task_count,
  s.negative_sentiment_count,
  s.active_relationship_count,
  s.loyalty_points_balance,
  s.referral_count,
  case
    when s.account_lifecycle='FORMER_CUSTOMER' then 'REACTIVATION'
    when s.computed_onboarding_state<>'COMPLETE' then 'ONBOARDING'
    when s.computed_health_score<70 then 'RETENTION_REVIEW'
    else 'NONE'
  end,
  case
    when s.account_lifecycle='FORMER_CUSTOMER' then 'FOLLOW_UP'
    when s.computed_onboarding_state<>'COMPLETE' then 'MEETING'
    when s.computed_health_score<70 then 'REVIEW'
    else 'REVIEW'
  end,
  case
    when s.account_lifecycle='FORMER_CUSTOMER' then 'Plan customer reactivation'
    when s.computed_onboarding_state<>'COMPLETE' then 'Complete customer onboarding'
    when s.computed_health_score<70 then 'Review customer retention risk'
    else 'Customer success review'
  end,
  case
    when s.account_lifecycle='FORMER_CUSTOMER' then 'HIGH'
    when s.computed_health_score<40 then 'URGENT'
    when s.computed_health_score<70 then 'HIGH'
    else 'NORMAL'
  end
from scored s
order by
  case when s.account_lifecycle='FORMER_CUSTOMER' then 0
       when s.computed_health_score<40 then 1
       when s.computed_health_score<70 then 2 else 3 end,
  s.computed_health_score,
  s.last_activity_at,
  s.id
limit greatest(1,least(p_limit,200));
$$;

create or replace function public.get_customer_success_summary(p_organization_id uuid)
returns table(
  customer_account_count bigint,
  former_customer_count bigint,
  open_customer_success_task_count bigint,
  loyalty_event_count bigint,
  loyalty_points_balance bigint,
  referral_count bigint,
  converted_referral_count bigint,
  rewarded_referral_count bigint,
  lifecycle_campaign_count bigint
)
language sql
stable
security invoker
set search_path=public,auth,pg_catalog
as $$
  select
    (select count(*) from public.businesses b
     where b.organization_id=p_organization_id and b.account_lifecycle='CUSTOMER'),
    (select count(*) from public.businesses b
     where b.organization_id=p_organization_id and b.account_lifecycle='FORMER_CUSTOMER'),
    (select count(*) from public.crm_tasks t
     where t.organization_id=p_organization_id and t.source_type='CUSTOMER_SUCCESS'
       and t.status not in ('DONE','CANCELED')),
    (select count(*) from public.customer_loyalty_events e
     where e.organization_id=p_organization_id),
    coalesce((select sum(e.points_delta)::bigint from public.customer_loyalty_events e
              where e.organization_id=p_organization_id),0::bigint),
    (select count(*) from public.customer_referrals r
     where r.organization_id=p_organization_id and r.status<>'CANCELED'),
    (select count(*) from public.customer_referrals r
     where r.organization_id=p_organization_id and r.status in ('CONVERTED','REWARDED')),
    (select count(*) from public.customer_referrals r
     where r.organization_id=p_organization_id and r.status='REWARDED'),
    (select count(*) from public.campaigns c
     where c.organization_id=p_organization_id and c.customer_success_lifecycle is not null);
$$;

create or replace function public.accept_customer_success_task_candidate(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_business_id uuid,
  p_action_kind text,
  p_assignee_user_id uuid,
  p_due_at timestamptz,
  p_reminder_at timestamptz,
  p_request_key text
)
returns table(resolved_task_id uuid,replayed boolean)
language plpgsql
volatile
security invoker
set search_path=public,auth,pg_catalog
as $$
declare
  v_actor_role text;
  v_assignee_role text;
  v_candidate record;
  v_existing record;
  v_task_id uuid;
  v_action text:=upper(trim(coalesce(p_action_kind,'')));
  v_source_id text;
  v_due timestamptz:=coalesce(p_due_at,now()+interval '1 day');
  v_reminder timestamptz:=p_reminder_at;
begin
  if current_user<>'service_role' then
    raise exception 'CUSTOMER_SUCCESS task acceptance requires trusted server boundary';
  end if;

  select role into v_actor_role
  from public.organization_members
  where organization_id=p_organization_id and user_id=p_actor_user_id;
  if v_actor_role not in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT') then
    raise exception 'CUSTOMER_SUCCESS task acceptance requires authorized CRM role';
  end if;

  if p_assignee_user_id is not null then
    select role into v_assignee_role
    from public.organization_members
    where organization_id=p_organization_id and user_id=p_assignee_user_id;
    if v_assignee_role not in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT') then
      raise exception 'CUSTOMER_SUCCESS task assignee is not an authorized CRM member';
    end if;
    if v_actor_role='SALES_AGENT' and p_assignee_user_id<>p_actor_user_id then
      raise exception 'SALES_AGENT may only assign CUSTOMER_SUCCESS task to self';
    end if;
  end if;

  if v_action not in ('ONBOARDING','RETENTION_REVIEW','REACTIVATION')
     or trim(coalesce(p_request_key,'')) !~ '^[A-Za-z0-9._:-]{1,200}$'
     or v_due<now()-interval '5 minutes'
     or (v_reminder is not null and v_reminder>v_due)
  then
    raise exception 'invalid CUSTOMER_SUCCESS task acceptance payload';
  end if;

  select * into v_candidate
  from public.get_customer_success_accounts(p_organization_id,p_business_id,1);
  if not found or v_candidate.suggested_action_kind<>v_action then
    raise exception 'CUSTOMER_SUCCESS candidate is no longer actionable';
  end if;

  v_source_id:=v_action||':'||p_business_id::text;

  select id,source_type,source_id,business_id,assignee_user_id
  into v_existing
  from public.crm_tasks
  where organization_id=p_organization_id and request_key=trim(p_request_key);

  if found then
    if v_existing.source_type<>'CUSTOMER_SUCCESS'
       or v_existing.source_id<>v_source_id
       or v_existing.business_id<>p_business_id
       or v_existing.assignee_user_id is distinct from p_assignee_user_id
    then
      raise exception 'CUSTOMER_SUCCESS task request key was reused with different semantics';
    end if;
    return query select v_existing.id,true;
    return;
  end if;

  if exists (
    select 1 from public.crm_tasks t
    where t.organization_id=p_organization_id
      and t.business_id=p_business_id
      and t.source_type='CUSTOMER_SUCCESS'
      and t.source_id=v_source_id
      and t.status not in ('DONE','CANCELED')
  ) then
    raise exception 'CUSTOMER_SUCCESS candidate already has an active CRM Task';
  end if;

  if v_reminder is null then
    v_reminder:=case when v_due>now()+interval '4 hours' then v_due-interval '4 hours' else null end;
  end if;

  insert into public.crm_tasks(
    organization_id,business_id,task_type,title,status,priority,
    assignee_user_id,due_at,reminder_at,source_type,source_id,
    request_key,creator_type,created_by_user_id,metadata
  ) values (
    p_organization_id,p_business_id,v_candidate.suggested_task_type,v_candidate.suggested_title,
    'OPEN',v_candidate.suggested_priority,p_assignee_user_id,v_due,v_reminder,
    'CUSTOMER_SUCCESS',v_source_id,trim(p_request_key),'SYSTEM',null,
    jsonb_build_object(
      'customerSuccessAction',v_action,
      'acceptedByUserId',p_actor_user_id::text,
      'sourceBusinessId',p_business_id::text,
      'healthScoreAtAcceptance',v_candidate.health_score,
      'riskSignals',to_jsonb(v_candidate.risk_signals)
    )
  ) returning id into v_task_id;

  return query select v_task_id,false;
end;
$$;

create or replace function public.record_customer_referral(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_referrer_business_id uuid,
  p_referrer_person_id uuid,
  p_referred_lead_id uuid,
  p_referred_business_id uuid,
  p_source_ref text,
  p_occurred_at timestamptz,
  p_request_key text,
  p_evidence jsonb
)
returns table(resolved_referral_id uuid,replayed boolean)
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_role text;
  v_lifecycle text;
  v_lead_business uuid;
  v_existing public.customer_referrals%rowtype;
  v_row public.customer_referrals%rowtype;
begin
  if current_user<>'service_role' then
    raise exception 'Customer referral mutation requires trusted server boundary';
  end if;
  select role into v_role from public.organization_members
  where organization_id=p_organization_id and user_id=p_actor_user_id;
  if v_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'Customer referral mutation requires OWNER, ADMIN or SALES_MANAGER';
  end if;

  select account_lifecycle into v_lifecycle from public.businesses
  where organization_id=p_organization_id and id=p_referrer_business_id;
  if v_lifecycle<>'CUSTOMER' then
    raise exception 'Customer referral referrer must be a canonical CUSTOMER Account';
  end if;

  if p_referrer_person_id is not null and not exists (
    select 1 from public.crm_person_business_relationships r
    where r.organization_id=p_organization_id
      and r.person_id=p_referrer_person_id
      and r.business_id=p_referrer_business_id
      and r.status='ACTIVE'
  ) then
    raise exception 'Referral Person must have an ACTIVE relationship to referrer Account';
  end if;

  if p_referred_lead_id is null and p_referred_business_id is null then
    raise exception 'Referral requires canonical referred Lead or Account evidence';
  end if;

  if p_referred_lead_id is not null then
    select business_id into v_lead_business from public.leads
    where organization_id=p_organization_id and id=p_referred_lead_id;
    if v_lead_business is null then raise exception 'Referred Lead not found'; end if;
    if p_referred_business_id is not null and v_lead_business<>p_referred_business_id then
      raise exception 'Referred Lead/Account lineage mismatch';
    end if;
  elsif not exists (
    select 1 from public.businesses
    where organization_id=p_organization_id and id=p_referred_business_id
  ) then
    raise exception 'Referred Account not found';
  end if;

  if p_referred_business_id=p_referrer_business_id or v_lead_business=p_referrer_business_id then
    raise exception 'Customer referral cannot self-refer the same Account';
  end if;

  if p_occurred_at is null or p_occurred_at>now()+interval '5 minutes'
     or length(trim(coalesce(p_source_ref,''))) not between 1 and 512
     or trim(coalesce(p_request_key,'')) !~ '^[A-Za-z0-9._:-]{1,200}$'
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object'
     or p_evidence='{}'::jsonb or octet_length(p_evidence::text)>8192
  then
    raise exception 'invalid Customer referral evidence';
  end if;

  select * into v_existing from public.customer_referrals
  where organization_id=p_organization_id and request_key=trim(p_request_key);
  if found then
    if v_existing.referrer_business_id<>p_referrer_business_id
       or v_existing.referrer_person_id is distinct from p_referrer_person_id
       or v_existing.referred_lead_id is distinct from p_referred_lead_id
       or v_existing.referred_business_id is distinct from p_referred_business_id
       or v_existing.source_ref<>trim(p_source_ref)
    then
      raise exception 'Customer referral request key was reused with different semantics';
    end if;
    return query select v_existing.id,true;
    return;
  end if;

  insert into public.customer_referrals(
    organization_id,referrer_business_id,referrer_person_id,referred_lead_id,referred_business_id,
    status,source_ref,evidence,request_key,recorded_by_user_id,occurred_at
  ) values (
    p_organization_id,p_referrer_business_id,p_referrer_person_id,p_referred_lead_id,p_referred_business_id,
    'RECORDED',trim(p_source_ref),p_evidence,trim(p_request_key),p_actor_user_id,p_occurred_at
  ) returning * into v_row;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'CUSTOMER_REFERRAL_RECORDED',
    'CUSTOMER_REFERRAL',v_row.id::text,
    jsonb_build_object(
      'status','RECORDED',
      'referrerBusinessId',p_referrer_business_id,
      'hasReferredLead',p_referred_lead_id is not null,
      'hasReferredAccount',p_referred_business_id is not null
    )
  );

  return query select v_row.id,false;
end;
$$;

create or replace function public.transition_customer_referral(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_referral_id uuid,
  p_action text,
  p_evidence jsonb
)
returns table(resolved_referral_id uuid,resolved_status text,replayed boolean)
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_role text;
  v_row public.customer_referrals%rowtype;
  v_action text:=upper(trim(coalesce(p_action,'')));
  v_target text;
begin
  if current_user<>'service_role' then
    raise exception 'Customer referral transition requires trusted server boundary';
  end if;
  select role into v_role from public.organization_members
  where organization_id=p_organization_id and user_id=p_actor_user_id;
  if v_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'Customer referral transition requires OWNER, ADMIN or SALES_MANAGER';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb
     or octet_length(p_evidence::text)>8192 then
    raise exception 'Customer referral transition requires bounded evidence';
  end if;

  select * into v_row from public.customer_referrals
  where organization_id=p_organization_id and id=p_referral_id for update;
  if not found then raise exception 'Customer referral not found'; end if;

  v_target:=case v_action
    when 'QUALIFY' then 'QUALIFIED'
    when 'CONVERT' then 'CONVERTED'
    when 'REWARD' then 'REWARDED'
    when 'CANCEL' then 'CANCELED'
    else null end;
  if v_target is null then raise exception 'Unsupported Customer referral transition'; end if;

  if v_row.status=v_target then
    return query select v_row.id,v_row.status,true;
    return;
  end if;

  if v_target='QUALIFIED' and v_row.status<>'RECORDED' then
    raise exception 'Referral QUALIFY requires RECORDED state';
  elsif v_target='CONVERTED' then
    if v_row.status<>'QUALIFIED' then
      raise exception 'Referral CONVERT requires QUALIFIED state';
    end if;
    if not exists (
      select 1 from public.crm_deals d
      where d.organization_id=p_organization_id and d.state='WON'
        and d.won_at>=v_row.occurred_at
        and (
          (v_row.referred_lead_id is not null and d.lead_id=v_row.referred_lead_id)
          or (v_row.referred_business_id is not null and d.business_id=v_row.referred_business_id)
        )
    ) then
      raise exception 'Referral conversion requires canonical WON Deal evidence';
    end if;
  elsif v_target='REWARDED' then
    if v_row.status<>'CONVERTED' then
      raise exception 'Referral REWARD requires CONVERTED state';
    end if;
    if not exists (
      select 1 from public.customer_loyalty_events e
      where e.organization_id=p_organization_id
        and e.business_id=v_row.referrer_business_id
        and e.source_type='REFERRAL'
        and e.source_ref=v_row.id::text
        and e.points_delta>0
    ) then
      raise exception 'Referral reward requires canonical loyalty EARN evidence';
    end if;
  elsif v_target='CANCELED' and v_row.status not in ('RECORDED','QUALIFIED') then
    raise exception 'Only RECORDED or QUALIFIED referral may be canceled';
  end if;

  update public.customer_referrals
  set status=v_target,
      status_evidence=p_evidence,
      last_transition_by_user_id=p_actor_user_id,
      last_transition_at=now(),
      updated_at=now()
  where id=v_row.id
  returning * into v_row;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'CUSTOMER_REFERRAL_TRANSITIONED',
    'CUSTOMER_REFERRAL',v_row.id::text,
    jsonb_build_object('fromStatus',case v_target
      when 'QUALIFIED' then 'RECORDED'
      when 'CONVERTED' then 'QUALIFIED'
      when 'REWARDED' then 'CONVERTED'
      else 'RECORDED_OR_QUALIFIED' end),
    jsonb_build_object('toStatus',v_target)
  );

  return query select v_row.id,v_row.status,false;
end;
$$;

create or replace function public.record_customer_loyalty_event(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_business_id uuid,
  p_person_id uuid,
  p_event_type text,
  p_points_delta integer,
  p_reward_key text,
  p_source_type text,
  p_source_ref text,
  p_occurred_at timestamptz,
  p_request_key text,
  p_metadata jsonb
)
returns table(resolved_event_id uuid,balance_after bigint,replayed boolean)
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_role text;
  v_lifecycle text;
  v_event_type text:=upper(trim(coalesce(p_event_type,'')));
  v_source_type text:=upper(trim(coalesce(p_source_type,'')));
  v_existing public.customer_loyalty_events%rowtype;
  v_row public.customer_loyalty_events%rowtype;
  v_balance bigint;
begin
  if current_user<>'service_role' then
    raise exception 'Customer loyalty mutation requires trusted server boundary';
  end if;
  select role into v_role from public.organization_members
  where organization_id=p_organization_id and user_id=p_actor_user_id;
  if v_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'Customer loyalty mutation requires OWNER, ADMIN or SALES_MANAGER';
  end if;
  select account_lifecycle into v_lifecycle from public.businesses
  where organization_id=p_organization_id and id=p_business_id;
  if v_lifecycle<>'CUSTOMER' then
    raise exception 'Customer loyalty subject must be a canonical CUSTOMER Account';
  end if;
  if p_person_id is not null and not exists (
    select 1 from public.crm_person_business_relationships r
    where r.organization_id=p_organization_id and r.business_id=p_business_id
      and r.person_id=p_person_id and r.status='ACTIVE'
  ) then
    raise exception 'Loyalty Person must have ACTIVE relationship to Customer Account';
  end if;

  if v_event_type not in ('EARN','REDEEM','ADJUST','EXPIRE')
     or v_source_type not in ('MANUAL','REFERRAL','CAMPAIGN','SERVICE_RECOVERY','OTHER')
     or p_points_delta is null or p_points_delta=0
     or p_points_delta not between -1000000000 and 1000000000
     or (v_event_type='EARN' and p_points_delta<=0)
     or (v_event_type in ('REDEEM','EXPIRE') and p_points_delta>=0)
     or p_occurred_at is null or p_occurred_at>now()+interval '5 minutes'
     or trim(coalesce(p_request_key,'')) !~ '^[A-Za-z0-9._:-]{1,200}$'
     or length(trim(coalesce(p_source_ref,''))) not between 1 and 512
     or (p_reward_key is not null and trim(p_reward_key) !~ '^[A-Za-z0-9._:-]{1,120}$')
     or p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>8192
  then
    raise exception 'invalid Customer loyalty event';
  end if;

  select * into v_existing from public.customer_loyalty_events
  where organization_id=p_organization_id and request_key=trim(p_request_key);
  if found then
    if v_existing.business_id<>p_business_id
       or v_existing.person_id is distinct from p_person_id
       or v_existing.event_type<>v_event_type
       or v_existing.points_delta<>p_points_delta
       or v_existing.reward_key is distinct from nullif(trim(coalesce(p_reward_key,'')),'')
       or v_existing.source_type<>v_source_type
       or v_existing.source_ref<>trim(p_source_ref)
    then
      raise exception 'Customer loyalty request key was reused with different semantics';
    end if;
    select coalesce(sum(points_delta),0)::bigint into v_balance
    from public.customer_loyalty_events
    where organization_id=p_organization_id and business_id=p_business_id;
    return query select v_existing.id,v_balance,true;
    return;
  end if;

  if v_source_type='REFERRAL' and not exists (
    select 1 from public.customer_referrals r
    where r.organization_id=p_organization_id
      and r.id::text=trim(p_source_ref)
      and r.referrer_business_id=p_business_id
      and r.status='CONVERTED'
  ) then
    raise exception 'Referral loyalty EARN requires CONVERTED referral evidence';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_business_id::text,0));
  select coalesce(sum(points_delta),0)::bigint into v_balance
  from public.customer_loyalty_events
  where organization_id=p_organization_id and business_id=p_business_id;

  if v_balance+p_points_delta<0 then
    raise exception 'Customer loyalty balance cannot become negative';
  end if;

  insert into public.customer_loyalty_events(
    organization_id,business_id,person_id,event_type,points_delta,reward_key,
    source_type,source_ref,request_key,recorded_by_user_id,occurred_at,metadata
  ) values (
    p_organization_id,p_business_id,p_person_id,v_event_type,p_points_delta,
    nullif(trim(coalesce(p_reward_key,'')),''),
    v_source_type,trim(p_source_ref),trim(p_request_key),p_actor_user_id,p_occurred_at,p_metadata
  ) returning * into v_row;

  v_balance:=v_balance+p_points_delta;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'CUSTOMER_LOYALTY_EVENT_RECORDED',
    'CUSTOMER_LOYALTY_EVENT',v_row.id::text,
    jsonb_build_object(
      'eventType',v_event_type,
      'pointsDelta',p_points_delta,
      'balanceAfter',v_balance,
      'sourceType',v_source_type,
      'rewardKey',v_row.reward_key
    )
  );

  return query select v_row.id,v_balance,false;
end;
$$;

create or replace function public.set_marketing_campaign_customer_success_lifecycle(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_campaign_id uuid,
  p_lifecycle text
)
returns table(resolved_campaign_id uuid,resolved_lifecycle text,replayed boolean)
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_role text;
  v_campaign public.campaigns%rowtype;
  v_before_lifecycle text;
  v_lifecycle text:=nullif(upper(trim(coalesce(p_lifecycle,''))),'');
begin
  if current_user<>'service_role' then
    raise exception 'Customer-success Campaign classification requires trusted server boundary';
  end if;
  select role into v_role from public.organization_members
  where organization_id=p_organization_id and user_id=p_actor_user_id;
  if v_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'Customer-success Campaign classification requires OWNER, ADMIN or SALES_MANAGER';
  end if;
  if v_lifecycle is not null and v_lifecycle not in ('ONBOARDING','RETENTION','REACTIVATION','LOYALTY','REFERRAL') then
    raise exception 'invalid Customer-success lifecycle Campaign classification';
  end if;

  select * into v_campaign from public.campaigns
  where organization_id=p_organization_id and id=p_campaign_id for update;
  if not found or v_campaign.campaign_kind<>'MARKETING' then
    raise exception 'Customer-success lifecycle requires canonical MARKETING Campaign';
  end if;
  if v_campaign.status in ('RUNNING','COMPLETED','FAILED') then
    raise exception 'Pause or draft Campaign before changing Customer-success lifecycle';
  end if;
  if v_campaign.customer_success_lifecycle is not distinct from v_lifecycle then
    return query select v_campaign.id,v_campaign.customer_success_lifecycle,true;
    return;
  end if;

  v_before_lifecycle:=v_campaign.customer_success_lifecycle;

  update public.campaigns
  set customer_success_lifecycle=v_lifecycle,
      updated_by_user_id=p_actor_user_id,
      version=version+1,
      updated_at=now()
  where id=v_campaign.id
  returning * into v_campaign;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'MARKETING_CAMPAIGN_CUSTOMER_SUCCESS_CLASSIFIED',
    'CAMPAIGN',v_campaign.id::text,
    jsonb_build_object('customerSuccessLifecycle',v_before_lifecycle),
    jsonb_build_object('customerSuccessLifecycle',v_campaign.customer_success_lifecycle)
  );

  return query select v_campaign.id,v_campaign.customer_success_lifecycle,false;
end;
$$;

revoke all on public.customer_loyalty_events from anon,authenticated;
revoke all on public.customer_referrals from anon,authenticated;
grant select on public.customer_loyalty_events to authenticated,service_role;
grant select on public.customer_referrals to authenticated,service_role;
-- The Customer Success read model needs only two CRM Task columns not already
-- granted to the trusted runtime by SALES-NEXT-ACTION. Keep this column-scoped.
grant select(due_at,metadata) on public.crm_tasks to service_role;
grant insert on public.customer_loyalty_events to service_role;
grant insert,update on public.customer_referrals to service_role;

revoke all on function public.guard_customer_loyalty_event_immutable() from public,anon,authenticated,service_role;
revoke all on function public.guard_customer_success_task_mutation() from public,anon,authenticated,service_role;

revoke all on function public.get_customer_success_accounts(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_customer_success_accounts(uuid,uuid,integer) to authenticated,service_role;

revoke all on function public.get_customer_success_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_customer_success_summary(uuid) to authenticated,service_role;

revoke all on function public.accept_customer_success_task_candidate(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,text)
  from public,anon,authenticated,service_role;
grant execute on function public.accept_customer_success_task_candidate(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,text)
  to service_role;

revoke all on function public.record_customer_referral(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.record_customer_referral(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,text,jsonb)
  to service_role;

revoke all on function public.transition_customer_referral(uuid,uuid,uuid,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.transition_customer_referral(uuid,uuid,uuid,text,jsonb)
  to service_role;

revoke all on function public.record_customer_loyalty_event(uuid,uuid,uuid,uuid,text,integer,text,text,text,timestamptz,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.record_customer_loyalty_event(uuid,uuid,uuid,uuid,text,integer,text,text,text,timestamptz,text,jsonb)
  to service_role;

revoke all on function public.set_marketing_campaign_customer_success_lifecycle(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.set_marketing_campaign_customer_success_lifecycle(uuid,uuid,uuid,text)
  to service_role;

comment on table public.customer_loyalty_events is
  'Append-only non-cash promotional loyalty points evidence. Not billing credit, money, payment, revenue, or stored value.';
comment on table public.customer_referrals is
  'Governed referral evidence linked to canonical Customer Accounts/People/Leads. Conversion requires canonical WON Deal evidence.';
comment on function public.get_customer_success_accounts(uuid,uuid,integer) is
  'Explainable bounded Customer Success read model over canonical Account/Task/Support/Conversation truth. No hidden AI score or send side effect.';
comment on column public.campaigns.customer_success_lifecycle is
  'Optional lifecycle classification on the canonical MARKETING Campaign. Classification never sends or bypasses consent/approval.';
