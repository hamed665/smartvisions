-- 0096: COMM-UNIFIED-INBOX bounded read model + per-user read state.
--
-- Boundaries:
-- - sales_conversations remains canonical Conversation truth.
-- - unified_inbox_conversation_projections remains Communication Plane scope/state only.
-- - this table stores per-user read/open state only; it is not a second inbox or CRM.
-- - SECURITY INVOKER functions inherit the established Unified Inbox RLS boundary.
-- - no provider send, provisioning, Platform token or Shadow Mode change.

create table if not exists public.unified_inbox_user_states (
  organization_id uuid not null,
  user_id uuid not null,
  conversation_id uuid not null references public.sales_conversations(id) on delete cascade,
  last_read_at timestamptz,
  last_opened_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),

  primary key (organization_id, user_id, conversation_id),

  foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id)
    on delete cascade
);

create index if not exists unified_inbox_user_states_conversation_fk_idx
  on public.unified_inbox_user_states(conversation_id);

create index if not exists conversation_messages_unified_inbox_unread_idx
  on public.conversation_messages(organization_id, conversation_id, created_at desc)
  where direction = 'INBOUND'
    and status in ('RECEIVED','SENT');

alter table public.unified_inbox_user_states enable row level security;

create or replace function public.enforce_unified_inbox_user_state_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Unified Inbox user state is retained; DELETE is not permitted';
  end if;

  if coalesce(current_setting('smartvisions.unified_inbox_read_state_command', true), '') <> '1' then
    raise exception 'Unified Inbox user state mutation requires governed command path';
  end if;

  if tg_op = 'UPDATE'
     and (
       new.organization_id is distinct from old.organization_id
       or new.user_id is distinct from old.user_id
       or new.conversation_id is distinct from old.conversation_id
     )
  then
    raise exception 'Unified Inbox user-state identity is immutable';
  end if;

  if not exists (
    select 1
      from public.sales_conversations sc
     where sc.organization_id = new.organization_id
       and sc.id = new.conversation_id
  ) then
    raise exception 'Unified Inbox user state conversation tenant mismatch';
  end if;

  if new.last_read_at is not null
     and new.last_read_at > statement_timestamp() + interval '5 seconds'
  then
    raise exception 'Unified Inbox last_read_at cannot be in the future';
  end if;

  if new.last_opened_at > statement_timestamp() + interval '5 seconds' then
    raise exception 'Unified Inbox last_opened_at cannot be in the future';
  end if;

  new.updated_at := statement_timestamp();
  return new;
end;
$$;

drop trigger if exists unified_inbox_user_state_contract
  on public.unified_inbox_user_states;
create trigger unified_inbox_user_state_contract
before insert or update or delete
on public.unified_inbox_user_states
for each row execute function public.enforce_unified_inbox_user_state_contract();

drop policy if exists unified_inbox_user_states_read
  on public.unified_inbox_user_states;
create policy unified_inbox_user_states_read
on public.unified_inbox_user_states
for select
to authenticated
using (
  user_id = (select auth.uid())
  and public.can_read_unified_inbox_conversation(organization_id, conversation_id)
);

drop policy if exists unified_inbox_user_states_insert
  on public.unified_inbox_user_states;
create policy unified_inbox_user_states_insert
on public.unified_inbox_user_states
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select coalesce(current_setting('smartvisions.unified_inbox_read_state_command', true), '')) = '1'
  and public.can_read_unified_inbox_conversation(organization_id, conversation_id)
);

drop policy if exists unified_inbox_user_states_update
  on public.unified_inbox_user_states;
create policy unified_inbox_user_states_update
on public.unified_inbox_user_states
for update
to authenticated
using (
  user_id = (select auth.uid())
  and (select coalesce(current_setting('smartvisions.unified_inbox_read_state_command', true), '')) = '1'
  and public.can_read_unified_inbox_conversation(organization_id, conversation_id)
)
with check (
  user_id = (select auth.uid())
  and (select coalesce(current_setting('smartvisions.unified_inbox_read_state_command', true), '')) = '1'
  and public.can_read_unified_inbox_conversation(organization_id, conversation_id)
);

create or replace function public.mark_unified_inbox_conversation_read(
  p_organization_id uuid,
  p_conversation_id uuid
)
returns public.unified_inbox_user_states
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_state public.unified_inbox_user_states%rowtype;
begin
  if v_actor is null
     or p_organization_id is null
     or p_conversation_id is null
     or not public.can_read_unified_inbox_conversation(
       p_organization_id,
       p_conversation_id
     )
  then
    raise exception 'Unified Inbox conversation read state not permitted';
  end if;

  perform set_config('smartvisions.unified_inbox_read_state_command', '1', true);

  insert into public.unified_inbox_user_states(
    organization_id,
    user_id,
    conversation_id,
    last_read_at,
    last_opened_at
  ) values (
    p_organization_id,
    v_actor,
    p_conversation_id,
    v_now,
    v_now
  )
  on conflict (organization_id, user_id, conversation_id)
  do update
     set last_read_at = excluded.last_read_at,
         last_opened_at = excluded.last_opened_at
  returning * into v_state;

  perform set_config('smartvisions.unified_inbox_read_state_command', '0', true);
  return v_state;
exception
  when others then
    perform set_config('smartvisions.unified_inbox_read_state_command', '0', true);
    raise;
end;
$$;

create or replace function public.list_unified_inbox_conversations(
  p_organization_id uuid,
  p_limit integer default 40,
  p_before_activity timestamptz default null,
  p_before_conversation_id uuid default null,
  p_stage text default null,
  p_channel text default null,
  p_requires_human boolean default null,
  p_unread_only boolean default false,
  p_query text default null,
  p_branch_id uuid default null,
  p_team_id uuid default null,
  p_label text default null,
  p_chatwoot_status text default null
)
returns table(
  conversation_id uuid,
  lead_id uuid,
  customer_name text,
  channel text,
  stage text,
  priority integer,
  unread_count bigint,
  requires_human boolean,
  agent_mode text,
  detected_language text,
  detected_dialect text,
  persian_summary text,
  intent_label text,
  sentiment_label text,
  stage_reason text,
  activity_at timestamptz,
  tenant_business_id uuid,
  branch_id uuid,
  department_id uuid,
  team_id uuid,
  chatwoot_status text,
  labels text[],
  chatwoot_assignee_user_id bigint,
  last_read_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := coalesce(p_limit, 40);
  v_stage text := nullif(upper(trim(coalesce(p_stage, ''))), '');
  v_channel text := nullif(upper(trim(coalesce(p_channel, ''))), '');
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_label text := nullif(trim(coalesce(p_label, '')), '');
  v_chatwoot_status text := nullif(lower(trim(coalesce(p_chatwoot_status, ''))), '');
  v_pattern text;
begin
  if v_actor is null
     or p_organization_id is null
     or not public.is_org_member(p_organization_id)
  then
    raise exception 'Unified Inbox list requires Organization membership';
  end if;

  if v_limit not between 1 and 100
     or (p_before_activity is null) <> (p_before_conversation_id is null)
     or (v_stage is not null and (length(v_stage) > 40 or v_stage !~ '^[A-Z0-9_:-]+$'))
     or (v_channel is not null and (length(v_channel) > 40 or v_channel !~ '^[A-Z0-9_:-]+$'))
     or (v_query is not null and length(v_query) > 100)
     or (v_label is not null and length(v_label) > 120)
     or (
       v_chatwoot_status is not null
       and (
         length(v_chatwoot_status) > 40
         or v_chatwoot_status !~ '^[a-z0-9_:-]+$'
       )
     )
  then
    raise exception 'invalid Unified Inbox list filter';
  end if;

  if v_query is not null then
    v_pattern := '%' ||
      replace(
        replace(
          replace(v_query, E'\\', E'\\\\'),
          '%', E'\\%'
        ),
        '_', E'\\_'
      ) || '%';
  end if;

  return query
  with base as (
    select
      sc.id as conversation_id,
      sc.lead_id,
      b.name as customer_name,
      sc.channel,
      sc.stage,
      sc.priority,
      sc.requires_human,
      sc.agent_mode::text as agent_mode,
      sc.detected_language,
      sc.detected_dialect,
      sc.persian_summary,
      sc.intent_label,
      sc.sentiment_label,
      sc.stage_reason,
      coalesce(
        greatest(p.last_activity_at, sc.last_message_at),
        p.last_activity_at,
        sc.last_message_at,
        sc.updated_at,
        sc.created_at
      ) as activity_at,
      p.tenant_business_id,
      p.branch_id,
      p.department_id,
      p.team_id,
      p.chatwoot_status,
      coalesce(p.labels, '{}'::text[]) as labels,
      p.chatwoot_assignee_user_id,
      us.last_read_at,
      (
        select count(*)
          from public.conversation_messages cm
         where cm.organization_id = sc.organization_id
           and cm.conversation_id = sc.id
           and cm.direction = 'INBOUND'
           and cm.status in ('RECEIVED','SENT')
           and cm.created_at > coalesce(us.last_read_at, 'epoch'::timestamptz)
      ) as unread_count
    from public.sales_conversations sc
    left join public.leads l
      on l.organization_id = sc.organization_id
     and l.id = sc.lead_id
    left join public.businesses b
      on b.organization_id = sc.organization_id
     and b.id = l.business_id
    left join public.unified_inbox_conversation_projections p
      on p.organization_id = sc.organization_id
     and p.conversation_id = sc.id
     and p.lifecycle_status in ('ACTIVE','DEGRADED')
    left join public.unified_inbox_user_states us
      on us.organization_id = sc.organization_id
     and us.user_id = v_actor
     and us.conversation_id = sc.id
    where sc.organization_id = p_organization_id
  ),
  filtered as (
    select *
      from base x
     where (v_stage is null or upper(x.stage) = v_stage)
       and (v_channel is null or upper(x.channel) = v_channel)
       and (p_requires_human is null or x.requires_human = p_requires_human)
       and (not coalesce(p_unread_only, false) or x.unread_count > 0)
       and (p_branch_id is null or x.branch_id = p_branch_id)
       and (p_team_id is null or x.team_id = p_team_id)
       and (v_label is null or v_label = any(x.labels))
       and (
         v_chatwoot_status is null
         or x.chatwoot_status = v_chatwoot_status
       )
       and (
         v_query is null
         or coalesce(x.customer_name, '') ilike v_pattern escape E'\\'
         or coalesce(x.persian_summary, '') ilike v_pattern escape E'\\'
         or coalesce(x.intent_label, '') ilike v_pattern escape E'\\'
         or x.conversation_id::text ilike v_pattern escape E'\\'
       )
       and (
         p_before_activity is null
         or x.activity_at < p_before_activity
         or (
           x.activity_at = p_before_activity
           and x.conversation_id < p_before_conversation_id
         )
       )
  )
  select
    x.conversation_id,
    x.lead_id,
    x.customer_name,
    x.channel,
    x.stage,
    x.priority,
    x.unread_count,
    x.requires_human,
    x.agent_mode,
    x.detected_language,
    x.detected_dialect,
    x.persian_summary,
    x.intent_label,
    x.sentiment_label,
    x.stage_reason,
    x.activity_at,
    x.tenant_business_id,
    x.branch_id,
    x.department_id,
    x.team_id,
    x.chatwoot_status,
    x.labels,
    x.chatwoot_assignee_user_id,
    x.last_read_at
  from filtered x
  order by x.activity_at desc, x.conversation_id desc
  limit v_limit + 1;
end;
$$;

create or replace function public.get_unified_inbox_counters(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null
     or p_organization_id is null
     or not public.is_org_member(p_organization_id)
  then
    raise exception 'Unified Inbox counters require Organization membership';
  end if;

  with base as (
    select
      sc.id,
      sc.stage,
      sc.requires_human,
      exists (
        select 1
          from public.conversation_messages cm
          left join public.unified_inbox_user_states us
            on us.organization_id = sc.organization_id
           and us.user_id = v_actor
           and us.conversation_id = sc.id
         where cm.organization_id = sc.organization_id
           and cm.conversation_id = sc.id
           and cm.direction = 'INBOUND'
           and cm.status in ('RECEIVED','SENT')
           and cm.created_at > coalesce(us.last_read_at, 'epoch'::timestamptz)
      ) as has_unread
    from public.sales_conversations sc
    where sc.organization_id = p_organization_id
  ),
  stages as (
    select stage, count(*)::bigint as count
      from base
     group by stage
  ),
  stage_json as (
    select coalesce(jsonb_object_agg(stage, count), '{}'::jsonb) as value
      from stages
  ),
  totals as (
    select
      count(*)::bigint as total,
      count(*) filter (where has_unread)::bigint as unread,
      count(*) filter (where requires_human)::bigint as human
    from base
  )
  select jsonb_build_object(
    'total', totals.total,
    'unread', totals.unread,
    'human', totals.human,
    'stages', stage_json.value
  )
  into v_result
  from totals cross join stage_json;

  return coalesce(
    v_result,
    jsonb_build_object(
      'total', 0,
      'unread', 0,
      'human', 0,
      'stages', '{}'::jsonb
    )
  );
end;
$$;

revoke all on table public.unified_inbox_user_states
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.unified_inbox_user_states
  to authenticated;
grant select on table public.unified_inbox_user_states
  to service_role;

revoke all on function public.enforce_unified_inbox_user_state_contract()
  from public, anon, authenticated, service_role;

revoke all on function public.mark_unified_inbox_conversation_read(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.mark_unified_inbox_conversation_read(uuid, uuid)
  to authenticated;

revoke all on function public.list_unified_inbox_conversations(
  uuid, integer, timestamptz, uuid, text, text, boolean, boolean, text,
  uuid, uuid, text, text
) from public, anon, service_role;
grant execute on function public.list_unified_inbox_conversations(
  uuid, integer, timestamptz, uuid, text, text, boolean, boolean, text,
  uuid, uuid, text, text
) to authenticated;

revoke all on function public.get_unified_inbox_counters(uuid)
  from public, anon, service_role;
grant execute on function public.get_unified_inbox_counters(uuid)
  to authenticated;
