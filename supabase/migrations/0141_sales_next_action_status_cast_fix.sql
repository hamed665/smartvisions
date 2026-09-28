-- Smart Visions AI Business OS 2027
-- SALES-NEXT-ACTION Production runtime hotfix
--
-- Production verification of 0140 exposed an enum/text UNION mismatch:
-- public.leads.status is lead_status while the derived queue return contract
-- exposes source_status as text. Keep the same canonical read model and cast
-- each branch explicitly. No data mutation, seed or new authority.

create or replace function public.get_crm_next_actions(
  p_organization_id uuid,
  p_stale_hours integer default 72,
  p_assignee_user_id uuid default null,
  p_limit integer default 100
)
returns table(
  candidate_key text,
  candidate_kind text,
  source_entity_type text,
  source_entity_id uuid,
  task_id uuid,
  business_id uuid,
  lead_id uuid,
  deal_id uuid,
  suggested_task_type text,
  title text,
  reason_code text,
  priority text,
  priority_score integer,
  assignee_user_id uuid,
  recommended_due_at timestamptz,
  recommended_reminder_at timestamptz,
  last_activity_at timestamptz,
  source_status text,
  accepted boolean,
  model_suggestion jsonb,
  model_suggested_at timestamptz
)
language plpgsql
stable
security invoker
set search_path=public,auth,pg_catalog
as $next_action_queue$
begin
  if p_stale_hours<1 or p_stale_hours>720 then
    raise exception 'stale hours must be between 1 and 720';
  end if;
  if p_limit<1 or p_limit>200 then
    raise exception 'next action limit must be between 1 and 200';
  end if;

  return query
  with task_queue as (
    select
      'TASK:'||t.id::text as candidate_key,
      case
        when t.reminder_at is not null
          and t.reminder_at<=now()
          and t.reminder_acknowledged_at is null
        then 'TASK_REMINDER_DUE'
        when t.due_at is not null and t.due_at<now() then 'TASK_OVERDUE'
        when t.status='BLOCKED' then 'TASK_BLOCKED'
        else 'TASK_OPEN'
      end as candidate_kind,
      'TASK'::text as source_entity_type,
      t.id as source_entity_id,
      t.id as task_id,
      t.business_id,
      t.lead_id,
      t.deal_id,
      t.task_type as suggested_task_type,
      t.title,
      case
        when t.reminder_at is not null
          and t.reminder_at<=now()
          and t.reminder_acknowledged_at is null
        then 'REMINDER_DUE'
        when t.due_at is not null and t.due_at<now() then 'TASK_OVERDUE'
        when t.status='BLOCKED' then 'TASK_BLOCKED'
        else 'OPEN_TASK'
      end as reason_code,
      t.priority,
      case
        when t.reminder_at is not null
          and t.reminder_at<=now()
          and t.reminder_acknowledged_at is null
        then 100
        when t.due_at is not null and t.due_at<now() then
          case t.priority when 'URGENT' then 99 when 'HIGH' then 97 when 'NORMAL' then 95 else 93 end
        when t.priority='URGENT' then 92
        when t.priority='HIGH' then 88
        when t.status='BLOCKED' then 75
        else 65
      end as priority_score,
      t.assignee_user_id,
      t.due_at as recommended_due_at,
      t.reminder_at as recommended_reminder_at,
      t.updated_at as last_activity_at,
      t.status::text as source_status,
      true as accepted,
      t.next_action_model_suggestion as model_suggestion,
      t.next_action_model_suggested_at as model_suggested_at
    from public.crm_tasks t
    where t.organization_id=p_organization_id
      and t.status not in ('DONE','CANCELED')
      and (p_assignee_user_id is null or t.assignee_user_id=p_assignee_user_id)
  ),
  lead_activity as (
    select
      l.id,
      l.business_id,
      l.status,
      greatest(
        l.updated_at,
        coalesce((
          select max(greatest(sc.updated_at,coalesce(sc.last_message_at,sc.updated_at)))
          from public.sales_conversations sc
          where sc.organization_id=l.organization_id
            and sc.lead_id=l.id
        ),l.updated_at),
        coalesce((
          select max(t2.updated_at)
          from public.crm_tasks t2
          where t2.organization_id=l.organization_id
            and t2.lead_id=l.id
        ),l.updated_at)
      ) as last_activity_at
    from public.leads l
    where l.organization_id=p_organization_id
      and l.status not in ('WON','LOST','DO_NOT_CONTACT')
      and not exists (
        select 1
        from public.crm_deals d
        where d.organization_id=l.organization_id
          and d.lead_id=l.id
          and d.state='OPEN'
      )
      and not exists (
        select 1
        from public.crm_tasks t
        where t.organization_id=l.organization_id
          and t.lead_id=l.id
          and t.status not in ('DONE','CANCELED')
      )
  ),
  lead_queue as (
    select
      'LEAD:'||la.id::text||':STALE' as candidate_key,
      'LEAD_STALE'::text as candidate_kind,
      'LEAD'::text as source_entity_type,
      la.id as source_entity_id,
      null::uuid as task_id,
      la.business_id,
      la.id as lead_id,
      null::uuid as deal_id,
      case
        when la.status in ('CONTACTED','REPLIED','INTERESTED','HOT','HUMAN')
        then 'FOLLOW_UP'
        else 'REVIEW'
      end as suggested_task_type,
      case
        when la.status in ('CONTACTED','REPLIED','INTERESTED','HOT','HUMAN')
        then 'Follow up stale Lead'
        else 'Review stale Lead'
      end as title,
      'LEAD_STALE'::text as reason_code,
      case
        when la.status in ('HOT','HUMAN','REPLIED','INTERESTED') then 'HIGH'
        else 'NORMAL'
      end as priority,
      case
        when la.status in ('HOT','HUMAN') then 84
        when la.status in ('REPLIED','INTERESTED') then 80
        when la.status in ('READY_TO_CONTACT','QUALIFIED','CONTACTED') then 72
        else 60
      end as priority_score,
      null::uuid as assignee_user_id,
      now()+case
        when la.status in ('HOT','HUMAN','REPLIED','INTERESTED') then interval '8 hours'
        else interval '24 hours'
      end as recommended_due_at,
      now()+case
        when la.status in ('HOT','HUMAN','REPLIED','INTERESTED') then interval '6 hours'
        else interval '20 hours'
      end as recommended_reminder_at,
      la.last_activity_at,
      la.status::text as source_status,
      false as accepted,
      null::jsonb as model_suggestion,
      null::timestamptz as model_suggested_at
    from lead_activity la
    where la.last_activity_at<now()-make_interval(hours=>p_stale_hours)
      and p_assignee_user_id is null
  ),
  deal_activity as (
    select
      d.id,
      d.business_id,
      d.lead_id,
      d.owner_user_id,
      d.state,
      d.expected_close_at,
      greatest(
        d.updated_at,
        coalesce((
          select max(t2.updated_at)
          from public.crm_tasks t2
          where t2.organization_id=d.organization_id
            and t2.deal_id=d.id
        ),d.updated_at)
      ) as last_activity_at
    from public.crm_deals d
    where d.organization_id=p_organization_id
      and d.state='OPEN'
      and (p_assignee_user_id is null or d.owner_user_id=p_assignee_user_id)
      and not exists (
        select 1
        from public.crm_tasks t
        where t.organization_id=d.organization_id
          and t.deal_id=d.id
          and t.status not in ('DONE','CANCELED')
      )
  ),
  deal_queue as (
    select
      'DEAL:'||da.id::text||':'||
        case when da.expected_close_at is not null and da.expected_close_at<now()
          then 'CLOSE_OVERDUE' else 'STALE' end as candidate_key,
      case when da.expected_close_at is not null and da.expected_close_at<now()
        then 'DEAL_CLOSE_OVERDUE' else 'DEAL_STALE' end as candidate_kind,
      'DEAL'::text as source_entity_type,
      da.id as source_entity_id,
      null::uuid as task_id,
      da.business_id,
      da.lead_id,
      da.id as deal_id,
      case when da.expected_close_at is not null and da.expected_close_at<now()
        then 'REVIEW' else 'FOLLOW_UP' end as suggested_task_type,
      case when da.expected_close_at is not null and da.expected_close_at<now()
        then 'Review overdue Deal close'
        else 'Follow up stale Deal'
      end as title,
      case when da.expected_close_at is not null and da.expected_close_at<now()
        then 'DEAL_CLOSE_OVERDUE' else 'DEAL_STALE' end as reason_code,
      'HIGH'::text as priority,
      case when da.expected_close_at is not null and da.expected_close_at<now()
        then 94 else 82 end as priority_score,
      da.owner_user_id as assignee_user_id,
      now()+case when da.expected_close_at is not null and da.expected_close_at<now()
        then interval '4 hours' else interval '12 hours' end as recommended_due_at,
      now()+case when da.expected_close_at is not null and da.expected_close_at<now()
        then interval '2 hours' else interval '10 hours' end as recommended_reminder_at,
      da.last_activity_at,
      da.state::text as source_status,
      false as accepted,
      null::jsonb as model_suggestion,
      null::timestamptz as model_suggested_at
    from deal_activity da
    where (
      da.expected_close_at is not null and da.expected_close_at<now()
    ) or (
      da.last_activity_at<now()-make_interval(hours=>p_stale_hours)
    )
  ),
  combined as (
    select * from task_queue
    union all
    select * from lead_queue
    union all
    select * from deal_queue
  )
  select
    q.candidate_key,
    q.candidate_kind,
    q.source_entity_type,
    q.source_entity_id,
    q.task_id,
    q.business_id,
    q.lead_id,
    q.deal_id,
    q.suggested_task_type,
    q.title,
    q.reason_code,
    q.priority,
    q.priority_score,
    q.assignee_user_id,
    q.recommended_due_at,
    q.recommended_reminder_at,
    q.last_activity_at,
    q.source_status,
    q.accepted,
    q.model_suggestion,
    q.model_suggested_at
  from combined q
  order by q.priority_score desc,q.last_activity_at asc,q.candidate_key
  limit p_limit;
end;
$next_action_queue$;

comment on function public.get_crm_next_actions(uuid,integer,uuid,integer) is
  'Derived human action queue over canonical Tasks, Leads, Deals and Conversation activity. source_status is normalized to text across enum/text sources; read-only with no send or workflow side effect.';
