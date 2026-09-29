-- AUTO-CONDITION-ENGINE
-- Typed deterministic condition evaluation over the existing canonical
-- automation_rules.conditions definition. This adds no second workflow/rules
-- engine, customer fact store, queue, outbox or arbitrary SQL/eval surface.

create table public.automation_condition_fact_catalog (
  fact_key text primary key,
  subject_type text not null check (subject_type in (
    'LEAD','DEAL','TASK','ACCOUNT','CONVERSATION','SEGMENT_SNAPSHOT','CASE'
  )),
  data_type text not null check (data_type in (
    'TEXT','NUMBER','BOOLEAN','UUID','TIMESTAMP'
  )),
  operators text[] not null,
  nullable boolean not null default false,
  description text not null,
  created_at timestamptz not null default now(),
  constraint automation_condition_fact_key_check
    check (fact_key ~ '^[A-Z][A-Z0-9_]*([.][A-Z][A-Z0-9_]*)+$'),
  constraint automation_condition_operator_count_check
    check (cardinality(operators) between 1 and 13),
  constraint automation_condition_operator_allowlist_check
    check (operators <@ array[
      'EQ','NEQ','IN','NOT_IN','GT','GTE','LT','LTE','BETWEEN',
      'BEFORE','AFTER','IS_SET','IS_NOT_SET'
    ]::text[])
);

comment on table public.automation_condition_fact_catalog is
  'System-owned metadata for typed workflow-condition facts. Facts remain owned by canonical domain tables; this table stores no customer or workflow-runtime fact values.';

create index automation_condition_fact_catalog_subject_idx
  on public.automation_condition_fact_catalog(subject_type,fact_key);

insert into public.automation_condition_fact_catalog
  (fact_key,subject_type,data_type,operators,nullable,description)
values
  ('LEAD.STATUS','LEAD','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical Lead status.'),
  ('LEAD.OPPORTUNITY_SCORE','LEAD','NUMBER',array['EQ','NEQ','GT','GTE','LT','LTE','BETWEEN'],false,'Canonical accepted Lead opportunity score.'),
  ('LEAD.INTENT_SCORE','LEAD','NUMBER',array['EQ','NEQ','GT','GTE','LT','LTE','BETWEEN'],false,'Canonical accepted Lead intent score.'),
  ('LEAD.FIT_SCORE','LEAD','NUMBER',array['EQ','NEQ','GT','GTE','LT','LTE','BETWEEN','IS_SET','IS_NOT_SET'],true,'Canonical accepted Lead fit score when present.'),
  ('LEAD.ENGAGEMENT_SCORE','LEAD','NUMBER',array['EQ','NEQ','GT','GTE','LT','LTE','BETWEEN','IS_SET','IS_NOT_SET'],true,'Canonical accepted Lead engagement score when present.'),
  ('LEAD.BUSINESS_ID','LEAD','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Account/Business linkage on Lead.'),
  ('LEAD.PERSON_ID','LEAD','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Person linkage on Lead.'),
  ('LEAD.AGENT_MODE','LEAD','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical Lead agent mode.'),
  ('LEAD.RECOMMENDED_OFFER','LEAD','TEXT',array['EQ','NEQ','IS_SET','IS_NOT_SET'],true,'Governed recommended offer text; exact comparison only.'),
  ('LEAD.CREATED_AT','LEAD','TIMESTAMP',array['BEFORE','AFTER','BETWEEN'],false,'Lead creation timestamp.'),
  ('LEAD.UPDATED_AT','LEAD','TIMESTAMP',array['BEFORE','AFTER','BETWEEN'],false,'Lead update timestamp.'),

  ('DEAL.STATE','DEAL','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical Deal state.'),
  ('DEAL.AMOUNT','DEAL','NUMBER',array['EQ','NEQ','GT','GTE','LT','LTE','BETWEEN','IS_SET','IS_NOT_SET'],true,'Canonical Deal amount; not payment/revenue truth.'),
  ('DEAL.CURRENCY','DEAL','TEXT',array['EQ','NEQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Deal currency.'),
  ('DEAL.BUSINESS_ID','DEAL','UUID',array['EQ','IN','NOT_IN'],false,'Canonical Account/Business linkage on Deal.'),
  ('DEAL.OWNER_USER_ID','DEAL','UUID',array['EQ','IN','NOT_IN'],false,'Canonical Deal owner.'),
  ('DEAL.TEAM_ID','DEAL','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Team assignment on Deal.'),
  ('DEAL.PERSON_ID','DEAL','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Person linkage on Deal.'),
  ('DEAL.EXPECTED_CLOSE_AT','DEAL','TIMESTAMP',array['BEFORE','AFTER','BETWEEN','IS_SET','IS_NOT_SET'],true,'Canonical expected close timestamp.'),

  ('TASK.STATUS','TASK','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical CRM Task status.'),
  ('TASK.ASSIGNEE_USER_ID','TASK','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical CRM Task assignee.'),
  ('TASK.DUE_AT','TASK','TIMESTAMP',array['BEFORE','AFTER','BETWEEN','IS_SET','IS_NOT_SET'],true,'Canonical CRM Task due timestamp.'),
  ('TASK.DEAL_ID','TASK','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Deal linkage on Task.'),
  ('TASK.LEAD_ID','TASK','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Lead linkage on Task.'),
  ('TASK.PERSON_ID','TASK','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Person linkage on Task.'),

  ('ACCOUNT.ACCOUNT_LIFECYCLE','ACCOUNT','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical Account lifecycle.'),
  ('ACCOUNT.COUNTRY_CODE','ACCOUNT','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical Account country code.'),
  ('ACCOUNT.CITY','ACCOUNT','TEXT',array['EQ','NEQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Account city.'),
  ('ACCOUNT.CATEGORY','ACCOUNT','TEXT',array['EQ','NEQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Account category.'),
  ('ACCOUNT.OWNER_USER_ID','ACCOUNT','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Account owner.'),
  ('ACCOUNT.PARENT_BUSINESS_ID','ACCOUNT','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical external Account hierarchy parent.'),
  ('ACCOUNT.CREATED_AT','ACCOUNT','TIMESTAMP',array['BEFORE','AFTER','BETWEEN'],false,'Account creation timestamp.'),
  ('ACCOUNT.UPDATED_AT','ACCOUNT','TIMESTAMP',array['BEFORE','AFTER','BETWEEN'],false,'Account update timestamp.'),

  ('CONVERSATION.CHANNEL','CONVERSATION','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical sales conversation channel.'),
  ('CONVERSATION.STAGE','CONVERSATION','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical sales conversation stage.'),
  ('CONVERSATION.PRIORITY','CONVERSATION','NUMBER',array['EQ','NEQ','GT','GTE','LT','LTE','BETWEEN'],false,'Canonical sales conversation priority.'),
  ('CONVERSATION.UNREAD_COUNT','CONVERSATION','NUMBER',array['EQ','NEQ','GT','GTE','LT','LTE','BETWEEN'],false,'Canonical unread count.'),
  ('CONVERSATION.AWAITING_PARTY','CONVERSATION','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical awaiting-party state.'),
  ('CONVERSATION.REQUIRES_HUMAN','CONVERSATION','BOOLEAN',array['EQ'],false,'Canonical human-attention requirement.'),
  ('CONVERSATION.LAST_INBOUND_AT','CONVERSATION','TIMESTAMP',array['BEFORE','AFTER','BETWEEN','IS_SET','IS_NOT_SET'],true,'Last canonical inbound timestamp.'),
  ('CONVERSATION.LAST_OUTBOUND_AT','CONVERSATION','TIMESTAMP',array['BEFORE','AFTER','BETWEEN','IS_SET','IS_NOT_SET'],true,'Last canonical outbound timestamp.'),
  ('CONVERSATION.INTENT_LABEL','CONVERSATION','TEXT',array['EQ','NEQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Bounded conversation intent label.'),
  ('CONVERSATION.SENTIMENT_LABEL','CONVERSATION','TEXT',array['EQ','NEQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Bounded conversation sentiment label.'),
  ('CONVERSATION.LEAD_ID','CONVERSATION','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Lead linkage on Conversation.'),
  ('CONVERSATION.PERSON_ID','CONVERSATION','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Person linkage on Conversation.'),

  ('SEGMENT_SNAPSHOT.SEGMENT_ID','SEGMENT_SNAPSHOT','UUID',array['EQ','IN','NOT_IN'],false,'Canonical Segment identity on immutable Snapshot.'),
  ('SEGMENT_SNAPSHOT.SEGMENT_VERSION','SEGMENT_SNAPSHOT','NUMBER',array['EQ','NEQ','GT','GTE','LT','LTE','BETWEEN'],false,'Immutable Segment semantic version.'),
  ('SEGMENT_SNAPSHOT.ENTITY_TYPE','SEGMENT_SNAPSHOT','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical Segment Snapshot entity type.'),
  ('SEGMENT_SNAPSHOT.MEMBER_COUNT','SEGMENT_SNAPSHOT','NUMBER',array['EQ','NEQ','GT','GTE','LT','LTE','BETWEEN'],false,'Immutable Snapshot member count.'),
  ('SEGMENT_SNAPSHOT.PURPOSE','SEGMENT_SNAPSHOT','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical Snapshot purpose.'),
  ('SEGMENT_SNAPSHOT.CREATED_AT','SEGMENT_SNAPSHOT','TIMESTAMP',array['BEFORE','AFTER','BETWEEN'],false,'Snapshot creation timestamp.'),

  ('CASE.STATUS','CASE','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical Support Case status.'),
  ('CASE.PRIORITY','CASE','TEXT',array['EQ','NEQ','IN','NOT_IN'],false,'Canonical Support Case priority.'),
  ('CASE.ASSIGNEE_USER_ID','CASE','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Support Case assignee.'),
  ('CASE.ESCALATION_LEVEL','CASE','NUMBER',array['EQ','NEQ','GT','GTE','LT','LTE','BETWEEN'],false,'Canonical Support Case escalation level.'),
  ('CASE.CSAT_SCORE','CASE','NUMBER',array['EQ','NEQ','GT','GTE','LT','LTE','BETWEEN','IS_SET','IS_NOT_SET'],true,'Canonical Support Case CSAT score when present.'),
  ('CASE.BUSINESS_ID','CASE','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Account/Business linkage on Case.'),
  ('CASE.PERSON_ID','CASE','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Person linkage on Case.'),
  ('CASE.CONVERSATION_ID','CASE','UUID',array['EQ','IN','NOT_IN','IS_SET','IS_NOT_SET'],true,'Canonical Conversation linkage on Case.'),
  ('CASE.FIRST_RESPONSE_DUE_AT','CASE','TIMESTAMP',array['BEFORE','AFTER','BETWEEN','IS_SET','IS_NOT_SET'],true,'Canonical first-response SLA timestamp.'),
  ('CASE.RESOLUTION_DUE_AT','CASE','TIMESTAMP',array['BEFORE','AFTER','BETWEEN','IS_SET','IS_NOT_SET'],true,'Canonical resolution SLA timestamp.');

alter table public.automation_condition_fact_catalog enable row level security;

create policy automation_condition_fact_catalog_authenticated_read
on public.automation_condition_fact_catalog
for select
to authenticated
using (true);

revoke all on table public.automation_condition_fact_catalog
  from public,anon,authenticated,service_role;
grant select on table public.automation_condition_fact_catalog
  to authenticated,service_role;

create or replace function public.automation_condition_valid_uuid_text(p_value text)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
begin
  perform p_value::uuid;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.automation_condition_valid_timestamptz_text(p_value text)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
begin
  perform p_value::timestamptz;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.validate_automation_condition_node(
  p_node jsonb,
  p_depth integer default 0
)
returns integer
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_kind text;
  v_op text;
  v_fact text;
  v_type text;
  v_ops text[];
  v_nullable boolean;
  v_has_value boolean;
  v_child jsonb;
  v_item jsonb;
  v_leaves integer := 0;
  v_min numeric;
  v_max numeric;
  v_from timestamptz;
  v_to timestamptz;
begin
  if p_depth > 4 then
    raise exception 'Automation condition depth exceeds 4';
  end if;
  if p_node is null or jsonb_typeof(p_node) <> 'object' then
    raise exception 'Automation condition node must be an object';
  end if;

  v_kind := upper(coalesce(p_node->>'kind',''));

  if v_kind = 'GROUP' then
    if (p_node - array['kind','op','children']::text[]) <> '{}'::jsonb then
      raise exception 'Automation condition GROUP contains unsupported keys';
    end if;
    if upper(coalesce(p_node->>'op','')) not in ('AND','OR') then
      raise exception 'Automation condition GROUP op must be AND or OR';
    end if;
    if jsonb_typeof(p_node->'children') <> 'array'
       or jsonb_array_length(p_node->'children') not between 1 and 8
    then
      raise exception 'Automation condition GROUP children must contain 1..8 nodes';
    end if;

    for v_child in select value from jsonb_array_elements(p_node->'children') x(value)
    loop
      v_leaves := v_leaves + public.validate_automation_condition_node(v_child,p_depth+1);
      if v_leaves > 20 then
        raise exception 'Automation conditions exceed 20 leaves';
      end if;
    end loop;
    return v_leaves;
  end if;

  if v_kind <> 'PREDICATE' then
    raise exception 'Automation condition kind must be GROUP or PREDICATE';
  end if;
  if (p_node - array['kind','fact','operator','value']::text[]) <> '{}'::jsonb then
    raise exception 'Automation condition PREDICATE contains unsupported keys';
  end if;

  v_fact := upper(coalesce(p_node->>'fact',''));
  v_op := upper(coalesce(p_node->>'operator',''));
  v_has_value := (p_node ? 'value') and p_node->'value' <> 'null'::jsonb;

  select data_type,operators,nullable
    into v_type,v_ops,v_nullable
    from public.automation_condition_fact_catalog
   where fact_key=v_fact;

  if not found then
    raise exception 'Automation condition fact is not cataloged: %',v_fact;
  end if;
  if not (v_op = any(v_ops)) then
    raise exception 'Automation condition operator % is not allowed for %',v_op,v_fact;
  end if;

  if v_op in ('IS_SET','IS_NOT_SET') then
    if not v_nullable then
      raise exception 'Automation condition set-state operator requires a nullable fact: %',v_fact;
    end if;
    if p_node ? 'value' then
      raise exception 'Automation condition set-state operator cannot include value';
    end if;
    return 1;
  end if;

  if not v_has_value then
    raise exception 'Automation condition operator % requires a value',v_op;
  end if;

  if v_type='TEXT' then
    if v_op in ('EQ','NEQ') then
      if jsonb_typeof(p_node->'value') <> 'string' then
        raise exception 'Automation TEXT condition requires a string';
      end if;
    elsif v_op in ('IN','NOT_IN') then
      if jsonb_typeof(p_node->'value') <> 'array'
         or jsonb_array_length(p_node->'value') not between 1 and 20
      then
        raise exception 'Automation TEXT list requires 1..20 strings';
      end if;
      for v_item in select value from jsonb_array_elements(p_node->'value') x(value)
      loop
        if jsonb_typeof(v_item) <> 'string' then
          raise exception 'Automation TEXT list contains a non-string value';
        end if;
      end loop;
    else
      raise exception 'Automation TEXT operator contract is invalid';
    end if;
    return 1;
  end if;

  if v_type='NUMBER' then
    if v_op in ('EQ','NEQ','GT','GTE','LT','LTE') then
      if jsonb_typeof(p_node->'value') <> 'number' then
        raise exception 'Automation NUMBER condition requires a number';
      end if;
    elsif v_op='BETWEEN' then
      if jsonb_typeof(p_node->'value') <> 'array'
         or jsonb_array_length(p_node->'value') <> 2
         or jsonb_typeof(p_node->'value'->0) <> 'number'
         or jsonb_typeof(p_node->'value'->1) <> 'number'
      then
        raise exception 'Automation NUMBER BETWEEN requires two numbers';
      end if;
      v_min := (p_node->'value'->>0)::numeric;
      v_max := (p_node->'value'->>1)::numeric;
      if v_min > v_max then
        raise exception 'Automation NUMBER BETWEEN lower bound exceeds upper bound';
      end if;
    else
      raise exception 'Automation NUMBER operator contract is invalid';
    end if;
    return 1;
  end if;

  if v_type='BOOLEAN' then
    if v_op <> 'EQ' or jsonb_typeof(p_node->'value') <> 'boolean' then
      raise exception 'Automation BOOLEAN condition supports EQ boolean only';
    end if;
    return 1;
  end if;

  if v_type='UUID' then
    if v_op='EQ' then
      if jsonb_typeof(p_node->'value') <> 'string'
         or not public.automation_condition_valid_uuid_text(p_node->>'value')
      then
        raise exception 'Automation UUID condition requires a UUID string';
      end if;
    elsif v_op in ('IN','NOT_IN') then
      if jsonb_typeof(p_node->'value') <> 'array'
         or jsonb_array_length(p_node->'value') not between 1 and 20
      then
        raise exception 'Automation UUID list requires 1..20 UUID strings';
      end if;
      for v_item in select value from jsonb_array_elements(p_node->'value') x(value)
      loop
        if jsonb_typeof(v_item) <> 'string'
           or not public.automation_condition_valid_uuid_text(v_item #>> '{}')
        then
          raise exception 'Automation UUID list contains an invalid UUID';
        end if;
      end loop;
    else
      raise exception 'Automation UUID operator contract is invalid';
    end if;
    return 1;
  end if;

  if v_type='TIMESTAMP' then
    if v_op in ('BEFORE','AFTER') then
      if jsonb_typeof(p_node->'value') <> 'string'
         or not public.automation_condition_valid_timestamptz_text(p_node->>'value')
      then
        raise exception 'Automation TIMESTAMP condition requires an ISO timestamp';
      end if;
    elsif v_op='BETWEEN' then
      if jsonb_typeof(p_node->'value') <> 'array'
         or jsonb_array_length(p_node->'value') <> 2
         or jsonb_typeof(p_node->'value'->0) <> 'string'
         or jsonb_typeof(p_node->'value'->1) <> 'string'
         or not public.automation_condition_valid_timestamptz_text(p_node->'value'->>0)
         or not public.automation_condition_valid_timestamptz_text(p_node->'value'->>1)
      then
        raise exception 'Automation TIMESTAMP BETWEEN requires two valid timestamps';
      end if;
      v_from := (p_node->'value'->>0)::timestamptz;
      v_to := (p_node->'value'->>1)::timestamptz;
      if v_from > v_to then
        raise exception 'Automation TIMESTAMP BETWEEN lower bound exceeds upper bound';
      end if;
    else
      raise exception 'Automation TIMESTAMP operator contract is invalid';
    end if;
    return 1;
  end if;

  raise exception 'Automation condition data type is unsupported';
end;
$$;

create or replace function public.automation_condition_node_subject_types(p_node jsonb)
returns text[]
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_kind text := upper(coalesce(p_node->>'kind',''));
  v_child jsonb;
  v_fact text;
  v_subject text;
  v_subjects text[] := array[]::text[];
begin
  if v_kind='PREDICATE' then
    v_fact := upper(coalesce(p_node->>'fact',''));
    select subject_type into v_subject
      from public.automation_condition_fact_catalog
     where fact_key=v_fact;
    if v_subject is null then
      raise exception 'Automation condition fact is not cataloged: %',v_fact;
    end if;
    return array[v_subject];
  end if;

  if v_kind='GROUP' then
    for v_child in select value from jsonb_array_elements(p_node->'children') x(value)
    loop
      v_subjects := v_subjects || public.automation_condition_node_subject_types(v_child);
    end loop;
    select coalesce(array_agg(distinct x order by x),array[]::text[])
      into v_subjects
      from unnest(v_subjects) u(x);
    return v_subjects;
  end if;

  raise exception 'Automation condition kind must be GROUP or PREDICATE';
end;
$$;

create or replace function public.validate_automation_conditions(p_conditions jsonb)
returns integer
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_node jsonb;
  v_leaves integer := 0;
  v_subjects text[] := array[]::text[];
begin
  if p_conditions is null or jsonb_typeof(p_conditions) <> 'array' then
    raise exception 'Automation conditions must be a JSON array';
  end if;
  if jsonb_array_length(p_conditions) > 8 then
    raise exception 'Automation conditions top level exceeds 8 nodes';
  end if;

  for v_node in select value from jsonb_array_elements(p_conditions) x(value)
  loop
    v_leaves := v_leaves + public.validate_automation_condition_node(v_node,0);
    if v_leaves > 20 then
      raise exception 'Automation conditions exceed 20 leaves';
    end if;
    v_subjects := v_subjects || public.automation_condition_node_subject_types(v_node);
  end loop;

  select coalesce(array_agg(distinct x order by x),array[]::text[])
    into v_subjects
    from unnest(v_subjects) u(x);

  if cardinality(v_subjects) > 1 then
    raise exception 'Automation conditions must target one canonical subject type';
  end if;

  return v_leaves;
end;
$$;

create or replace function public.automation_conditions_subject_type(p_conditions jsonb)
returns text
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_node jsonb;
  v_subjects text[] := array[]::text[];
begin
  perform public.validate_automation_conditions(p_conditions);

  for v_node in select value from jsonb_array_elements(p_conditions) x(value)
  loop
    v_subjects := v_subjects || public.automation_condition_node_subject_types(v_node);
  end loop;

  select coalesce(array_agg(distinct x order by x),array[]::text[])
    into v_subjects
    from unnest(v_subjects) u(x);

  if cardinality(v_subjects)=0 then return null; end if;
  return v_subjects[1];
end;
$$;

create or replace function public.automation_trigger_expected_condition_subject(p_trigger_key text)
returns text
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select case family
    when 'MESSAGE' then 'CONVERSATION'
    when 'CUSTOMER' then 'ACCOUNT'
    when 'LEAD' then 'LEAD'
    when 'DEAL' then 'DEAL'
    when 'TASK' then 'TASK'
    when 'SEGMENT' then 'SEGMENT_SNAPSHOT'
    when 'CASE' then 'CASE'
    else null
  end
  from public.automation_trigger_catalog
  where trigger_key=upper(trim(p_trigger_key));
$$;

create or replace function public.enforce_automation_rule_condition_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_actual_subject text;
  v_expected_subject text;
begin
  perform public.validate_automation_conditions(new.conditions);
  v_actual_subject := public.automation_conditions_subject_type(new.conditions);

  if v_actual_subject is not null then
    v_expected_subject := public.automation_trigger_expected_condition_subject(new.trigger_key);
    if v_expected_subject is null then
      raise exception 'Automation trigger does not support canonical subject conditions yet: %',new.trigger_key;
    end if;
    if v_actual_subject <> v_expected_subject then
      raise exception 'Automation condition subject % does not match trigger subject %',
        v_actual_subject,v_expected_subject;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists automation_rules_condition_contract_guard
  on public.automation_rules;
create trigger automation_rules_condition_contract_guard
before insert or update of trigger_key,conditions on public.automation_rules
for each row execute function public.enforce_automation_rule_condition_contract();

drop trigger if exists automation_rule_versions_condition_contract_guard
  on public.automation_rule_versions;
create trigger automation_rule_versions_condition_contract_guard
before insert on public.automation_rule_versions
for each row execute function public.enforce_automation_rule_condition_contract();

create or replace function public.automation_condition_subject_facts(
  p_organization_id uuid,
  p_subject_type text,
  p_subject_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_subject text := upper(trim(coalesce(p_subject_type,'')));
  v_facts jsonb;
begin
  if v_subject='LEAD' then
    select jsonb_build_object(
      'LEAD.STATUS',l.status::text,
      'LEAD.OPPORTUNITY_SCORE',l.opportunity_score,
      'LEAD.INTENT_SCORE',l.intent_score,
      'LEAD.FIT_SCORE',l.fit_score,
      'LEAD.ENGAGEMENT_SCORE',l.engagement_score,
      'LEAD.BUSINESS_ID',l.business_id,
      'LEAD.PERSON_ID',l.person_id,
      'LEAD.AGENT_MODE',l.agent_mode::text,
      'LEAD.RECOMMENDED_OFFER',l.recommended_offer,
      'LEAD.CREATED_AT',l.created_at,
      'LEAD.UPDATED_AT',l.updated_at
    ) into v_facts
    from public.leads l
    where l.organization_id=p_organization_id and l.id=p_subject_id;

  elsif v_subject='DEAL' then
    select jsonb_build_object(
      'DEAL.STATE',d.state,
      'DEAL.AMOUNT',d.amount,
      'DEAL.CURRENCY',d.currency,
      'DEAL.BUSINESS_ID',d.business_id,
      'DEAL.OWNER_USER_ID',d.owner_user_id,
      'DEAL.TEAM_ID',d.team_id,
      'DEAL.PERSON_ID',d.person_id,
      'DEAL.EXPECTED_CLOSE_AT',d.expected_close_at
    ) into v_facts
    from public.crm_deals d
    where d.organization_id=p_organization_id and d.id=p_subject_id;

  elsif v_subject='TASK' then
    select jsonb_build_object(
      'TASK.STATUS',t.status,
      'TASK.ASSIGNEE_USER_ID',t.assignee_user_id,
      'TASK.DUE_AT',t.due_at,
      'TASK.DEAL_ID',t.deal_id,
      'TASK.LEAD_ID',t.lead_id,
      'TASK.PERSON_ID',t.person_id
    ) into v_facts
    from public.crm_tasks t
    where t.organization_id=p_organization_id and t.id=p_subject_id;

  elsif v_subject='ACCOUNT' then
    select jsonb_build_object(
      'ACCOUNT.ACCOUNT_LIFECYCLE',b.account_lifecycle,
      'ACCOUNT.COUNTRY_CODE',b.country_code,
      'ACCOUNT.CITY',b.city,
      'ACCOUNT.CATEGORY',b.category,
      'ACCOUNT.OWNER_USER_ID',b.account_owner_user_id,
      'ACCOUNT.PARENT_BUSINESS_ID',b.parent_business_id,
      'ACCOUNT.CREATED_AT',b.created_at,
      'ACCOUNT.UPDATED_AT',b.updated_at
    ) into v_facts
    from public.businesses b
    where b.organization_id=p_organization_id and b.id=p_subject_id;

  elsif v_subject='CONVERSATION' then
    select jsonb_build_object(
      'CONVERSATION.CHANNEL',c.channel,
      'CONVERSATION.STAGE',c.stage,
      'CONVERSATION.PRIORITY',c.priority,
      'CONVERSATION.UNREAD_COUNT',c.unread_count,
      'CONVERSATION.AWAITING_PARTY',c.awaiting_party,
      'CONVERSATION.REQUIRES_HUMAN',c.requires_human,
      'CONVERSATION.LAST_INBOUND_AT',c.last_inbound_at,
      'CONVERSATION.LAST_OUTBOUND_AT',c.last_outbound_at,
      'CONVERSATION.INTENT_LABEL',c.intent_label,
      'CONVERSATION.SENTIMENT_LABEL',c.sentiment_label,
      'CONVERSATION.LEAD_ID',c.lead_id,
      'CONVERSATION.PERSON_ID',c.person_id
    ) into v_facts
    from public.sales_conversations c
    where c.organization_id=p_organization_id and c.id=p_subject_id;

  elsif v_subject='SEGMENT_SNAPSHOT' then
    select jsonb_build_object(
      'SEGMENT_SNAPSHOT.SEGMENT_ID',s.segment_id,
      'SEGMENT_SNAPSHOT.SEGMENT_VERSION',s.segment_version,
      'SEGMENT_SNAPSHOT.ENTITY_TYPE',s.entity_type,
      'SEGMENT_SNAPSHOT.MEMBER_COUNT',s.member_count,
      'SEGMENT_SNAPSHOT.PURPOSE',s.purpose,
      'SEGMENT_SNAPSHOT.CREATED_AT',s.created_at
    ) into v_facts
    from public.crm_segment_snapshots s
    where s.organization_id=p_organization_id and s.id=p_subject_id;

  elsif v_subject='CASE' then
    select jsonb_build_object(
      'CASE.STATUS',s.status,
      'CASE.PRIORITY',s.priority,
      'CASE.ASSIGNEE_USER_ID',s.assignee_user_id,
      'CASE.ESCALATION_LEVEL',s.escalation_level,
      'CASE.CSAT_SCORE',s.csat_score,
      'CASE.BUSINESS_ID',s.business_id,
      'CASE.PERSON_ID',s.person_id,
      'CASE.CONVERSATION_ID',s.conversation_id,
      'CASE.FIRST_RESPONSE_DUE_AT',s.first_response_due_at,
      'CASE.RESOLUTION_DUE_AT',s.resolution_due_at
    ) into v_facts
    from public.crm_support_cases s
    where s.organization_id=p_organization_id and s.id=p_subject_id;

  else
    raise exception 'Automation condition subject type is unsupported: %',v_subject;
  end if;

  if v_facts is null then
    raise exception 'Automation condition subject was not found in Organization';
  end if;

  return v_facts;
end;
$$;

create or replace function public.automation_condition_predicate_matches(
  p_facts jsonb,
  p_node jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_fact text := upper(p_node->>'fact');
  v_op text := upper(p_node->>'operator');
  v_type text;
  v_actual jsonb;
  v_actual_text text;
  v_actual_number numeric;
  v_actual_ts timestamptz;
begin
  select data_type into v_type
    from public.automation_condition_fact_catalog
   where fact_key=v_fact;
  if v_type is null then
    raise exception 'Automation condition fact is not cataloged: %',v_fact;
  end if;

  v_actual := p_facts->v_fact;

  if v_op='IS_SET' then
    return v_actual is not null and v_actual <> 'null'::jsonb;
  end if;
  if v_op='IS_NOT_SET' then
    return v_actual is null or v_actual = 'null'::jsonb;
  end if;
  if v_actual is null or v_actual='null'::jsonb then
    return false;
  end if;

  if v_type='TEXT' then
    v_actual_text := v_actual #>> '{}';
    if v_op='EQ' then return v_actual_text=(p_node->>'value'); end if;
    if v_op='NEQ' then return v_actual_text<>(p_node->>'value'); end if;
    if v_op='IN' then
      return exists(
        select 1 from jsonb_array_elements_text(p_node->'value') x(value)
        where x.value=v_actual_text
      );
    end if;
    if v_op='NOT_IN' then
      return not exists(
        select 1 from jsonb_array_elements_text(p_node->'value') x(value)
        where x.value=v_actual_text
      );
    end if;
  end if;

  if v_type='NUMBER' then
    v_actual_number := (v_actual #>> '{}')::numeric;
    if v_op='EQ' then return v_actual_number=(p_node->>'value')::numeric; end if;
    if v_op='NEQ' then return v_actual_number<>(p_node->>'value')::numeric; end if;
    if v_op='GT' then return v_actual_number>(p_node->>'value')::numeric; end if;
    if v_op='GTE' then return v_actual_number>=(p_node->>'value')::numeric; end if;
    if v_op='LT' then return v_actual_number<(p_node->>'value')::numeric; end if;
    if v_op='LTE' then return v_actual_number<=(p_node->>'value')::numeric; end if;
    if v_op='BETWEEN' then
      return v_actual_number between
        (p_node->'value'->>0)::numeric and (p_node->'value'->>1)::numeric;
    end if;
  end if;

  if v_type='BOOLEAN' then
    if v_op='EQ' then
      return (v_actual #>> '{}')::boolean=(p_node->>'value')::boolean;
    end if;
  end if;

  if v_type='UUID' then
    v_actual_text := v_actual #>> '{}';
    if v_op='EQ' then return v_actual_text=(p_node->>'value'); end if;
    if v_op='IN' then
      return exists(
        select 1 from jsonb_array_elements_text(p_node->'value') x(value)
        where x.value=v_actual_text
      );
    end if;
    if v_op='NOT_IN' then
      return not exists(
        select 1 from jsonb_array_elements_text(p_node->'value') x(value)
        where x.value=v_actual_text
      );
    end if;
  end if;

  if v_type='TIMESTAMP' then
    v_actual_ts := (v_actual #>> '{}')::timestamptz;
    if v_op='BEFORE' then return v_actual_ts<(p_node->>'value')::timestamptz; end if;
    if v_op='AFTER' then return v_actual_ts>(p_node->>'value')::timestamptz; end if;
    if v_op='BETWEEN' then
      return v_actual_ts between
        (p_node->'value'->>0)::timestamptz and
        (p_node->'value'->>1)::timestamptz;
    end if;
  end if;

  raise exception 'Automation condition operator evaluation is unsupported';
end;
$$;

create or replace function public.automation_condition_node_matches(
  p_facts jsonb,
  p_node jsonb,
  p_depth integer default 0
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_kind text := upper(p_node->>'kind');
  v_group_op text;
  v_child jsonb;
begin
  if p_depth > 4 then
    raise exception 'Automation condition depth exceeds 4';
  end if;

  if v_kind='PREDICATE' then
    return public.automation_condition_predicate_matches(p_facts,p_node);
  end if;

  if v_kind='GROUP' then
    v_group_op := upper(p_node->>'op');

    if v_group_op='AND' then
      for v_child in select value from jsonb_array_elements(p_node->'children') x(value)
      loop
        if not public.automation_condition_node_matches(p_facts,v_child,p_depth+1) then
          return false;
        end if;
      end loop;
      return true;
    end if;

    if v_group_op='OR' then
      for v_child in select value from jsonb_array_elements(p_node->'children') x(value)
      loop
        if public.automation_condition_node_matches(p_facts,v_child,p_depth+1) then
          return true;
        end if;
      end loop;
      return false;
    end if;
  end if;

  raise exception 'Automation condition node evaluation is invalid';
end;
$$;

create or replace function public.evaluate_automation_conditions(
  p_organization_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_conditions jsonb
)
returns table(
  matched boolean,
  leaf_count integer,
  resolved_subject_type text,
  resolved_subject_id uuid
)
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_subject text := upper(trim(coalesce(p_subject_type,'')));
  v_condition_subject text;
  v_facts jsonb;
  v_node jsonb;
  v_leaves integer;
  v_matched boolean := true;
begin
  v_leaves := public.validate_automation_conditions(p_conditions);
  v_condition_subject := public.automation_conditions_subject_type(p_conditions);

  if v_condition_subject is not null and v_condition_subject<>v_subject then
    raise exception 'Automation evaluation subject does not match condition subject';
  end if;

  v_facts := public.automation_condition_subject_facts(
    p_organization_id,v_subject,p_subject_id
  );

  for v_node in select value from jsonb_array_elements(p_conditions) x(value)
  loop
    if not public.automation_condition_node_matches(v_facts,v_node,0) then
      v_matched := false;
      exit;
    end if;
  end loop;

  return query select v_matched,v_leaves,v_subject,p_subject_id;
end;
$$;

revoke all on function public.automation_condition_valid_uuid_text(text)
  from public,anon,authenticated;
revoke all on function public.automation_condition_valid_timestamptz_text(text)
  from public,anon,authenticated;
revoke all on function public.validate_automation_condition_node(jsonb,integer)
  from public,anon,authenticated;
revoke all on function public.automation_condition_node_subject_types(jsonb)
  from public,anon,authenticated;
revoke all on function public.validate_automation_conditions(jsonb)
  from public,anon,authenticated;
revoke all on function public.automation_conditions_subject_type(jsonb)
  from public,anon,authenticated;
revoke all on function public.automation_trigger_expected_condition_subject(text)
  from public,anon,authenticated;
revoke all on function public.automation_condition_subject_facts(uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function public.automation_condition_predicate_matches(jsonb,jsonb)
  from public,anon,authenticated;
revoke all on function public.automation_condition_node_matches(jsonb,jsonb,integer)
  from public,anon,authenticated;
revoke all on function public.evaluate_automation_conditions(uuid,text,uuid,jsonb)
  from public,anon,authenticated;

grant execute on function public.automation_condition_valid_uuid_text(text)
  to service_role;
grant execute on function public.automation_condition_valid_timestamptz_text(text)
  to service_role;
grant execute on function public.validate_automation_condition_node(jsonb,integer)
  to service_role;
grant execute on function public.automation_condition_node_subject_types(jsonb)
  to service_role;
grant execute on function public.validate_automation_conditions(jsonb)
  to service_role;
grant execute on function public.automation_conditions_subject_type(jsonb)
  to service_role;
grant execute on function public.automation_trigger_expected_condition_subject(text)
  to service_role;
grant execute on function public.automation_condition_subject_facts(uuid,text,uuid)
  to service_role;
grant execute on function public.automation_condition_predicate_matches(jsonb,jsonb)
  to service_role;
grant execute on function public.automation_condition_node_matches(jsonb,jsonb,integer)
  to service_role;
grant execute on function public.evaluate_automation_conditions(uuid,text,uuid,jsonb)
  to service_role;

revoke all on function public.enforce_automation_rule_condition_contract()
  from public,anon,authenticated,service_role;

comment on function public.evaluate_automation_conditions(uuid,text,uuid,jsonb) is
  'Deterministic bounded automation condition evaluation over explicit Organization-scoped canonical subject facts. No arbitrary SQL/eval and no provider/runtime side effects.';
