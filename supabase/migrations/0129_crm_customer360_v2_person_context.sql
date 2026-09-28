-- 0129: Person-centric Customer 360 over existing canonical CRM authorities.
--
-- Extends leads / sales_conversations / crm_tasks / crm_deals with explicit,
-- evidence-backed Person context. No Person, Customer, conversation, task, deal,
-- booking, quote, order, invoice, payment, support, consent or document rows are
-- fabricated or backfilled by this migration.
--
-- Missing product modules remain explicit in get_crm_customer360_v2.moduleStatus.
-- Existing business-level timeline truth is reused only for directly Person-linked
-- Lead/Conversation IDs; a Company relationship alone never attributes activity
-- to a Person.

alter table public.leads
  add column if not exists person_id uuid,
  add column if not exists person_link_method text,
  add column if not exists person_link_source_ref text,
  add column if not exists person_link_evidence jsonb,
  add column if not exists person_linked_by_user_id uuid,
  add column if not exists person_linked_at timestamptz;

alter table public.sales_conversations
  add column if not exists person_id uuid,
  add column if not exists person_link_method text,
  add column if not exists person_link_source_ref text,
  add column if not exists person_link_evidence jsonb,
  add column if not exists person_linked_by_user_id uuid,
  add column if not exists person_linked_at timestamptz;

alter table public.crm_tasks
  add column if not exists person_id uuid,
  add column if not exists person_link_method text,
  add column if not exists person_link_source_ref text,
  add column if not exists person_link_evidence jsonb,
  add column if not exists person_linked_by_user_id uuid,
  add column if not exists person_linked_at timestamptz;

alter table public.crm_deals
  add column if not exists person_id uuid,
  add column if not exists person_link_method text,
  add column if not exists person_link_source_ref text,
  add column if not exists person_link_evidence jsonb,
  add column if not exists person_linked_by_user_id uuid,
  add column if not exists person_linked_at timestamptz;

do $customer360_constraints$
declare
  v_table text;
begin
  foreach v_table in array array['leads','sales_conversations','crm_tasks','crm_deals']
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = v_table || '_person_context_person_fk'
        and conrelid = ('public.' || v_table)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (organization_id, person_id) references public.crm_people(organization_id, id) on delete restrict',
        v_table,
        v_table || '_person_context_person_fk'
      );
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = v_table || '_person_context_actor_fk'
        and conrelid = ('public.' || v_table)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (organization_id, person_linked_by_user_id) references public.organization_members(organization_id, user_id) on delete restrict',
        v_table,
        v_table || '_person_context_actor_fk'
      );
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = v_table || '_person_context_contract_check'
        and conrelid = ('public.' || v_table)::regclass
    ) then
      execute format(
        $sql$
        alter table public.%I add constraint %I check (
          (
            person_id is null
            and person_link_method is null
            and person_link_source_ref is null
            and person_link_evidence is null
            and person_linked_by_user_id is null
            and person_linked_at is null
          )
          or
          (
            person_id is not null
            and person_link_method in ('MANUAL_CONFIRMED','PROVIDER_AUTHENTICATED','IMPORT_VERIFIED')
            and nullif(trim(person_link_source_ref), '') is not null
            and length(trim(person_link_source_ref)) <= 512
            and person_link_evidence is not null
            and jsonb_typeof(person_link_evidence) = 'object'
            and person_link_evidence <> '{}'::jsonb
            and octet_length(person_link_evidence::text) <= 8192
            and person_linked_at is not null
            and (
              person_link_method <> 'MANUAL_CONFIRMED'
              or person_linked_by_user_id is not null
            )
          )
        )
        $sql$,
        v_table,
        v_table || '_person_context_contract_check'
      );
    end if;
  end loop;
end;
$customer360_constraints$;

create index if not exists leads_org_person_customer360_idx
  on public.leads(organization_id, person_id, updated_at desc)
  where person_id is not null;
create index if not exists leads_org_person_link_actor_fk_idx
  on public.leads(organization_id, person_linked_by_user_id)
  where person_linked_by_user_id is not null;

create index if not exists sales_conversations_org_person_customer360_idx
  on public.sales_conversations(organization_id, person_id, updated_at desc)
  where person_id is not null;
create index if not exists sales_conversations_org_person_link_actor_fk_idx
  on public.sales_conversations(organization_id, person_linked_by_user_id)
  where person_linked_by_user_id is not null;

create index if not exists crm_tasks_org_person_customer360_idx
  on public.crm_tasks(organization_id, person_id, updated_at desc)
  where person_id is not null;
create index if not exists crm_tasks_org_person_link_actor_fk_idx
  on public.crm_tasks(organization_id, person_linked_by_user_id)
  where person_linked_by_user_id is not null;

create index if not exists crm_deals_org_person_customer360_idx
  on public.crm_deals(organization_id, person_id, updated_at desc)
  where person_id is not null;
create index if not exists crm_deals_org_person_link_actor_fk_idx
  on public.crm_deals(organization_id, person_linked_by_user_id)
  where person_linked_by_user_id is not null;

-- Customer 360 merge reconciliation and trusted Person-context mutation need
-- only these Lead/Conversation columns. Production may already grant broader
-- service access for existing runtimes; this migration does not revoke it.
grant select (
  id, organization_id, business_id, person_id
) on public.leads to service_role;
grant update (
  person_id, person_link_method, person_link_source_ref, person_link_evidence,
  person_linked_by_user_id, person_linked_at, updated_at
) on public.leads to service_role;

grant select (
  id, organization_id, lead_id, person_id
) on public.sales_conversations to service_role;
grant update (
  person_id, person_link_method, person_link_source_ref, person_link_evidence,
  person_linked_by_user_id, person_linked_at, updated_at
) on public.sales_conversations to service_role;

-- Keep the historical service_role deny on CRM Tasks/Deals broad access.
-- Customer 360 receives only the columns required by its trusted Person-context
-- mutation path. Existing authenticated policies and module authorities remain
-- unchanged.
grant select (
  id, organization_id, business_id, lead_id, conversation_id, person_id
) on public.crm_tasks to service_role;
grant update (
  person_id, person_link_method, person_link_source_ref, person_link_evidence,
  person_linked_by_user_id, person_linked_at, updated_at
) on public.crm_tasks to service_role;

grant select (
  id, organization_id, business_id, person_id
) on public.crm_deals to service_role;
grant update (
  person_id, person_link_method, person_link_source_ref, person_link_evidence,
  person_linked_by_user_id, person_linked_at, updated_at
) on public.crm_deals to service_role;

create or replace function public.guard_crm_customer360_person_context()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $customer360_person_guard$
begin
  if tg_op = 'INSERT' then
    if new.person_id is not null and current_user <> 'service_role' then
      raise exception 'CRM Customer 360 Person context requires the trusted server boundary';
    end if;
    return new;
  end if;

  if (
    new.person_id is distinct from old.person_id
    or new.person_link_method is distinct from old.person_link_method
    or new.person_link_source_ref is distinct from old.person_link_source_ref
    or new.person_link_evidence is distinct from old.person_link_evidence
    or new.person_linked_by_user_id is distinct from old.person_linked_by_user_id
    or new.person_linked_at is distinct from old.person_linked_at
  ) and current_user <> 'service_role' then
    raise exception 'CRM Customer 360 Person context requires the trusted server boundary';
  end if;

  return new;
end;
$customer360_person_guard$;

create or replace function public.guard_crm_deal_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $deal_guard$
declare
  v_actor uuid := auth.uid();
  v_stage_category text;
  v_stage_active boolean;
  v_pipeline_status text;
begin
  -- Customer 360 may attach/correct Person context on historical Deals without
  -- reopening or mutating commercial truth. This exception is deliberately
  -- restricted to service_role and to rows where every non-context field is
  -- byte-for-byte unchanged (apart from version/updated_at maintained here).
  if tg_op = 'UPDATE'
     and current_user = 'service_role'
     and (
       new.person_id is distinct from old.person_id
       or new.person_link_method is distinct from old.person_link_method
       or new.person_link_source_ref is distinct from old.person_link_source_ref
       or new.person_link_evidence is distinct from old.person_link_evidence
       or new.person_linked_by_user_id is distinct from old.person_linked_by_user_id
       or new.person_linked_at is distinct from old.person_linked_at
     )
     and (
       to_jsonb(new) - array[
         'person_id','person_link_method','person_link_source_ref',
         'person_link_evidence','person_linked_by_user_id','person_linked_at',
         'version','updated_at'
       ]
     ) = (
       to_jsonb(old) - array[
         'person_id','person_link_method','person_link_source_ref',
         'person_link_evidence','person_linked_by_user_id','person_linked_at',
         'version','updated_at'
       ]
     )
  then
    new.version := old.version + 1;
    new.updated_at := now();
    return new;
  end if;

  select s.category, s.is_active, p.status
    into v_stage_category, v_stage_active, v_pipeline_status
  from public.crm_pipeline_stages s
  join public.crm_pipelines p
    on p.organization_id = s.organization_id
   and p.id = s.pipeline_id
  where s.organization_id = new.organization_id
    and s.id = new.stage_id
    and s.pipeline_id = new.pipeline_id;

  if v_stage_category is null then
    raise exception 'CRM deal stage/pipeline not found';
  end if;
  if not v_stage_active or v_pipeline_status <> 'ACTIVE' then
    raise exception 'CRM deal requires ACTIVE pipeline and stage';
  end if;

  if tg_op = 'INSERT' then
    if new.creator_type = 'USER' then
      if v_actor is null or new.created_by_user_id is distinct from v_actor then
        raise exception 'CRM deal USER creator must match auth.uid()';
      end if;
    end if;

    if v_stage_category = 'OPEN' then
      new.state := 'OPEN';
      new.won_at := null;
      new.lost_at := null;
      new.lost_reason := null;
    elsif v_stage_category = 'WON' then
      new.state := 'WON';
      new.won_at := now();
      new.lost_at := null;
      new.lost_reason := null;
    else
      if nullif(trim(new.lost_reason), '') is null then
        raise exception 'CRM LOST deal requires lost_reason';
      end if;
      new.state := 'LOST';
      new.won_at := null;
      new.lost_at := now();
    end if;

    new.version := 1;
    new.updated_at := now();
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.business_id is distinct from old.business_id
     or new.lead_id is distinct from old.lead_id
     or new.pipeline_id is distinct from old.pipeline_id
     or new.source_type is distinct from old.source_type
     or new.source_id is distinct from old.source_id
     or new.request_key is distinct from old.request_key
     or new.creator_type is distinct from old.creator_type
     or new.created_by_user_id is distinct from old.created_by_user_id
  then
    raise exception 'CRM deal tenant/scope/source/creator is immutable';
  end if;

  if old.state in ('WON','LOST') then
    if new.stage_id is distinct from old.stage_id then
      raise exception 'terminal CRM deal stage is immutable';
    end if;
    if new.amount is distinct from old.amount
       or new.currency is distinct from old.currency
       or new.owner_user_id is distinct from old.owner_user_id
       or new.expected_close_at is distinct from old.expected_close_at
       or new.lost_reason is distinct from old.lost_reason
    then
      raise exception 'terminal CRM deal commercial truth is immutable';
    end if;
  end if;

  if new.stage_id is distinct from old.stage_id then
    if v_stage_category = 'OPEN' then
      new.state := 'OPEN';
      new.won_at := null;
      new.lost_at := null;
      new.lost_reason := null;
    elsif v_stage_category = 'WON' then
      new.state := 'WON';
      new.won_at := now();
      new.lost_at := null;
      new.lost_reason := null;
    elsif v_stage_category = 'LOST' then
      if nullif(trim(new.lost_reason), '') is null then
        raise exception 'CRM LOST deal requires lost_reason';
      end if;
      new.state := 'LOST';
      new.won_at := null;
      new.lost_at := now();
    end if;
  else
    new.state := old.state;
    new.won_at := old.won_at;
    new.lost_at := old.lost_at;
    if old.state <> 'LOST' then
      new.lost_reason := null;
    end if;
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$deal_guard$;

drop trigger if exists leads_customer360_person_context_guard on public.leads;
create trigger leads_customer360_person_context_guard
before insert or update on public.leads
for each row execute function public.guard_crm_customer360_person_context();

drop trigger if exists sales_conversations_customer360_person_context_guard on public.sales_conversations;
create trigger sales_conversations_customer360_person_context_guard
before insert or update on public.sales_conversations
for each row execute function public.guard_crm_customer360_person_context();

drop trigger if exists crm_tasks_customer360_person_context_guard on public.crm_tasks;
create trigger crm_tasks_customer360_person_context_guard
before insert or update on public.crm_tasks
for each row execute function public.guard_crm_customer360_person_context();

drop trigger if exists crm_deals_customer360_person_context_guard on public.crm_deals;
create trigger crm_deals_customer360_person_context_guard
before insert or update on public.crm_deals
for each row execute function public.guard_crm_customer360_person_context();

create or replace function public.link_crm_customer360_person_context(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_person_id uuid,
  p_verification_method text,
  p_source_ref text,
  p_evidence jsonb
)
returns table (
  resolved_entity_type text,
  resolved_entity_id uuid,
  resolved_person_id uuid,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $customer360_person_link$
declare
  v_actor_role text;
  v_person_status text;
  v_business_id uuid;
  v_current_person_id uuid;
begin
  if current_user <> 'service_role' then
    raise exception 'CRM Customer 360 Person link requires the trusted server boundary';
  end if;

  p_entity_type := upper(trim(coalesce(p_entity_type, '')));
  if p_entity_type not in ('LEAD','CONVERSATION','TASK','DEAL') then
    raise exception 'CRM Customer 360 entity type is invalid';
  end if;
  if p_verification_method not in ('MANUAL_CONFIRMED','PROVIDER_AUTHENTICATED','IMPORT_VERIFIED') then
    raise exception 'CRM Customer 360 Person verification method is invalid';
  end if;
  if nullif(trim(p_source_ref), '') is null or length(trim(p_source_ref)) > 512 then
    raise exception 'CRM Customer 360 Person source reference is required';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or p_evidence = '{}'::jsonb then
    raise exception 'CRM Customer 360 Person link requires non-empty evidence';
  end if;
  if octet_length(p_evidence::text) > 8192 then
    raise exception 'CRM Customer 360 Person link evidence exceeds the bounded limit';
  end if;

  if p_actor_user_id is not null then
    select m.role
      into v_actor_role
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id;

    if v_actor_role is null then
      raise exception 'CRM Customer 360 Person link actor is not an Organization member';
    end if;
  end if;

  if p_verification_method = 'MANUAL_CONFIRMED'
     and (
       p_actor_user_id is null
       or v_actor_role not in ('OWNER','ADMIN','SALES_MANAGER')
     )
  then
    raise exception 'CRM Customer 360 manual Person link requires a resolution role';
  end if;

  select p.status
    into v_person_status
  from public.crm_people p
  where p.organization_id = p_organization_id
    and p.id = p_person_id
  for update;

  if v_person_status is null or v_person_status <> 'ACTIVE' then
    raise exception 'CRM Customer 360 Person link requires an active same-Organization Person';
  end if;

  case p_entity_type
    when 'LEAD' then
      select l.business_id, l.person_id
        into v_business_id, v_current_person_id
      from public.leads l
      where l.organization_id = p_organization_id
        and l.id = p_entity_id
      for update;
    when 'CONVERSATION' then
      select l.business_id, c.person_id
        into v_business_id, v_current_person_id
      from public.sales_conversations c
      left join public.leads l
        on l.organization_id = c.organization_id
       and l.id = c.lead_id
      where c.organization_id = p_organization_id
        and c.id = p_entity_id
      for update of c;
    when 'TASK' then
      select
        coalesce(t.business_id, l.business_id, cl.business_id),
        t.person_id
        into v_business_id, v_current_person_id
      from public.crm_tasks t
      left join public.leads l
        on l.organization_id = t.organization_id
       and l.id = t.lead_id
      left join public.sales_conversations c
        on c.organization_id = t.organization_id
       and c.id = t.conversation_id
      left join public.leads cl
        on cl.organization_id = c.organization_id
       and cl.id = c.lead_id
      where t.organization_id = p_organization_id
        and t.id = p_entity_id
      for update of t;
    when 'DEAL' then
      select d.business_id, d.person_id
        into v_business_id, v_current_person_id
      from public.crm_deals d
      where d.organization_id = p_organization_id
        and d.id = p_entity_id
      for update;
  end case;

  if not found then
    raise exception 'CRM Customer 360 entity was not found in the Organization';
  end if;

  if v_current_person_id = p_person_id then
    return query select p_entity_type, p_entity_id, p_person_id, true;
    return;
  end if;
  if v_current_person_id is not null then
    raise exception 'CRM Customer 360 entity already belongs to another Person';
  end if;

  if v_business_id is not null
     and not exists (
       select 1
       from public.crm_person_business_relationships r
       where r.organization_id = p_organization_id
         and r.person_id = p_person_id
         and r.business_id = v_business_id
         and r.status = 'ACTIVE'
     )
  then
    raise exception 'CRM Customer 360 Person link requires an active Person-Company relationship for entity Business context';
  end if;

  case p_entity_type
    when 'LEAD' then
      update public.leads
         set person_id = p_person_id,
             person_link_method = p_verification_method,
             person_link_source_ref = trim(p_source_ref),
             person_link_evidence = p_evidence,
             person_linked_by_user_id = p_actor_user_id,
             person_linked_at = now(),
             updated_at = now()
       where organization_id = p_organization_id
         and id = p_entity_id;
    when 'CONVERSATION' then
      update public.sales_conversations
         set person_id = p_person_id,
             person_link_method = p_verification_method,
             person_link_source_ref = trim(p_source_ref),
             person_link_evidence = p_evidence,
             person_linked_by_user_id = p_actor_user_id,
             person_linked_at = now(),
             updated_at = now()
       where organization_id = p_organization_id
         and id = p_entity_id;
    when 'TASK' then
      update public.crm_tasks
         set person_id = p_person_id,
             person_link_method = p_verification_method,
             person_link_source_ref = trim(p_source_ref),
             person_link_evidence = p_evidence,
             person_linked_by_user_id = p_actor_user_id,
             person_linked_at = now(),
             updated_at = now()
       where organization_id = p_organization_id
         and id = p_entity_id;
    when 'DEAL' then
      update public.crm_deals
         set person_id = p_person_id,
             person_link_method = p_verification_method,
             person_link_source_ref = trim(p_source_ref),
             person_link_evidence = p_evidence,
             person_linked_by_user_id = p_actor_user_id,
             person_linked_at = now(),
             updated_at = now()
       where organization_id = p_organization_id
         and id = p_entity_id;
  end case;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data, correlation_id
  ) values (
    p_organization_id,
    case when p_actor_user_id is null then 'SYSTEM' else 'USER' end,
    coalesce(p_actor_user_id::text, 'service_role'),
    'CRM_CUSTOMER360_PERSON_LINKED',
    'crm_customer360_' || lower(p_entity_type),
    p_entity_id::text,
    null,
    jsonb_build_object(
      'person_id', p_person_id::text,
      'verification_method', p_verification_method,
      'source_present', true,
      'evidence_present', true
    ),
    'dbtx:' || txid_current()::text
  );

  return query select p_entity_type, p_entity_id, p_person_id, false;
end;
$customer360_person_link$;

create or replace function public.unlink_crm_customer360_person_context(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_expected_person_id uuid,
  p_reason text,
  p_evidence jsonb
)
returns table (
  resolved_entity_type text,
  resolved_entity_id uuid,
  resolved_person_id uuid,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $customer360_person_unlink$
declare
  v_actor_role text;
  v_current_person_id uuid;
begin
  if current_user <> 'service_role' then
    raise exception 'CRM Customer 360 Person unlink requires the trusted server boundary';
  end if;

  p_entity_type := upper(trim(coalesce(p_entity_type, '')));
  if p_entity_type not in ('LEAD','CONVERSATION','TASK','DEAL') then
    raise exception 'CRM Customer 360 entity type is invalid';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) > 500 then
    raise exception 'CRM Customer 360 Person unlink reason is required';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or p_evidence = '{}'::jsonb then
    raise exception 'CRM Customer 360 Person unlink requires non-empty evidence';
  end if;
  if octet_length(p_evidence::text) > 8192 then
    raise exception 'CRM Customer 360 Person unlink evidence exceeds the bounded limit';
  end if;

  select m.role
    into v_actor_role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = p_actor_user_id;

  if v_actor_role is null or v_actor_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'CRM Customer 360 Person unlink requires a resolution role';
  end if;

  case p_entity_type
    when 'LEAD' then
      select l.person_id into v_current_person_id
      from public.leads l
      where l.organization_id = p_organization_id and l.id = p_entity_id
      for update;
    when 'CONVERSATION' then
      select c.person_id into v_current_person_id
      from public.sales_conversations c
      where c.organization_id = p_organization_id and c.id = p_entity_id
      for update;
    when 'TASK' then
      select t.person_id into v_current_person_id
      from public.crm_tasks t
      where t.organization_id = p_organization_id and t.id = p_entity_id
      for update;
    when 'DEAL' then
      select d.person_id into v_current_person_id
      from public.crm_deals d
      where d.organization_id = p_organization_id and d.id = p_entity_id
      for update;
  end case;

  if not found then
    raise exception 'CRM Customer 360 entity was not found in the Organization';
  end if;

  if v_current_person_id is null then
    return query select p_entity_type, p_entity_id, p_expected_person_id, true;
    return;
  end if;
  if v_current_person_id is distinct from p_expected_person_id then
    raise exception 'CRM Customer 360 Person unlink expected Person does not match current binding';
  end if;

  case p_entity_type
    when 'LEAD' then
      update public.leads
         set person_id = null,
             person_link_method = null,
             person_link_source_ref = null,
             person_link_evidence = null,
             person_linked_by_user_id = null,
             person_linked_at = null,
             updated_at = now()
       where organization_id = p_organization_id and id = p_entity_id;
    when 'CONVERSATION' then
      update public.sales_conversations
         set person_id = null,
             person_link_method = null,
             person_link_source_ref = null,
             person_link_evidence = null,
             person_linked_by_user_id = null,
             person_linked_at = null,
             updated_at = now()
       where organization_id = p_organization_id and id = p_entity_id;
    when 'TASK' then
      update public.crm_tasks
         set person_id = null,
             person_link_method = null,
             person_link_source_ref = null,
             person_link_evidence = null,
             person_linked_by_user_id = null,
             person_linked_at = null,
             updated_at = now()
       where organization_id = p_organization_id and id = p_entity_id;
    when 'DEAL' then
      update public.crm_deals
         set person_id = null,
             person_link_method = null,
             person_link_source_ref = null,
             person_link_evidence = null,
             person_linked_by_user_id = null,
             person_linked_at = null,
             updated_at = now()
       where organization_id = p_organization_id and id = p_entity_id;
  end case;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data, correlation_id
  ) values (
    p_organization_id,
    'USER',
    p_actor_user_id::text,
    'CRM_CUSTOMER360_PERSON_UNLINKED',
    'crm_customer360_' || lower(p_entity_type),
    p_entity_id::text,
    jsonb_build_object('person_id', p_expected_person_id::text),
    jsonb_build_object(
      'reason_present', true,
      'evidence_present', true
    ),
    'dbtx:' || txid_current()::text
  );

  return query select p_entity_type, p_entity_id, p_expected_person_id, false;
end;
$customer360_person_unlink$;

create or replace function public.reconcile_crm_customer360_person_merge()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $customer360_person_merge$
begin
  if old.status = 'ACTIVE'
     and new.status = 'MERGED'
     and new.merged_into_person_id is not null
  then
    update public.leads
       set person_id = new.merged_into_person_id,
           updated_at = now()
     where organization_id = new.organization_id
       and person_id = old.id;

    update public.sales_conversations
       set person_id = new.merged_into_person_id,
           updated_at = now()
     where organization_id = new.organization_id
       and person_id = old.id;

    update public.crm_tasks
       set person_id = new.merged_into_person_id,
           updated_at = now()
     where organization_id = new.organization_id
       and person_id = old.id;

    update public.crm_deals
       set person_id = new.merged_into_person_id,
           updated_at = now()
     where organization_id = new.organization_id
       and person_id = old.id;
  end if;

  return new;
end;
$customer360_person_merge$;

drop trigger if exists crm_people_customer360_merge_reconcile on public.crm_people;
create trigger crm_people_customer360_merge_reconcile
after update of status, merged_into_person_id on public.crm_people
for each row execute function public.reconcile_crm_customer360_person_merge();

create or replace function public.get_crm_customer360_v2(
  p_organization_id uuid,
  p_person_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $customer360_read$
declare
  v_person public.crm_people%rowtype;
  v_result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'CRM Customer 360 limit must be between 1 and 100';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'CRM Customer 360 read requires Organization membership';
  end if;

  select p.* into v_person
  from public.crm_people p
  where p.organization_id = p_organization_id
    and p.id = p_person_id;

  if not found then
    raise exception 'CRM Customer 360 Person was not found';
  end if;

  select jsonb_build_object(
    'person', jsonb_build_object(
      'id', v_person.id,
      'displayName', v_person.display_name,
      'status', v_person.status,
      'mergedIntoPersonId', v_person.merged_into_person_id,
      'firstSeenAt', v_person.first_seen_at,
      'lastSeenAt', v_person.last_seen_at,
      'createdAt', v_person.created_at,
      'updatedAt', v_person.updated_at
    ),
    'identities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'identityId', q.id,
        'identityType', q.identity_type,
        'displayValue', q.display_value,
        'identityStatus', q.identity_status,
        'linkStatus', q.link_status,
        'verificationMethod', q.verification_method,
        'sourceRef', q.source_ref,
        'firstSeenAt', q.first_seen_at,
        'lastSeenAt', q.last_seen_at
      ) order by q.last_seen_at desc, q.id)
      from (
        select
          i.id,
          i.identity_type,
          i.display_value,
          i.status as identity_status,
          l.status as link_status,
          l.verification_method,
          l.source_ref,
          l.first_seen_at,
          l.last_seen_at
        from public.crm_person_identity_links l
        join public.crm_identities i
          on i.organization_id = l.organization_id
         and i.id = l.identity_id
        where l.organization_id = p_organization_id
          and l.person_id = p_person_id
          and l.status <> 'RETIRED'
        order by l.last_seen_at desc, i.id
        limit p_limit
      ) q
    ), '[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'relationshipId', q.id,
        'businessId', q.business_id,
        'businessName', q.business_name,
        'countryCode', q.country_code,
        'city', q.city,
        'category', q.category,
        'relationshipType', q.relationship_type,
        'jobTitle', q.job_title,
        'verificationMethod', q.verification_method,
        'status', q.status,
        'firstSeenAt', q.first_seen_at,
        'lastSeenAt', q.last_seen_at
      ) order by q.last_seen_at desc, q.id)
      from (
        select
          r.id,
          r.business_id,
          b.name as business_name,
          b.country_code,
          b.city,
          b.category,
          r.relationship_type,
          r.job_title,
          r.verification_method,
          r.status,
          r.first_seen_at,
          r.last_seen_at
        from public.crm_person_business_relationships r
        join public.businesses b
          on b.organization_id = r.organization_id
         and b.id = r.business_id
        where r.organization_id = p_organization_id
          and r.person_id = p_person_id
        order by r.last_seen_at desc, r.id
        limit p_limit
      ) q
    ), '[]'::jsonb),
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'businessId', l.business_id,
        'status', l.status,
        'opportunityScore', l.opportunity_score,
        'intentScore', l.intent_score,
        'agentMode', l.agent_mode,
        'recommendedOffer', l.recommended_offer,
        'personLinkMethod', l.person_link_method,
        'personLinkSourceRef', l.person_link_source_ref,
        'personLinkedAt', l.person_linked_at,
        'updatedAt', l.updated_at
      ) order by l.updated_at desc, l.id)
      from (
        select *
        from public.leads
        where organization_id = p_organization_id
          and person_id = p_person_id
        order by updated_at desc, id
        limit p_limit
      ) l
    ), '[]'::jsonb),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'leadId', c.lead_id,
        'channel', c.channel,
        'stage', c.stage,
        'agentMode', c.agent_mode,
        'summary', c.summary,
        'lastMessageAt', c.last_message_at,
        'requiresHuman', c.requires_human,
        'detectedLanguage', c.detected_language,
        'detectedDialect', c.detected_dialect,
        'intentLabel', c.intent_label,
        'sentimentLabel', c.sentiment_label,
        'personLinkMethod', c.person_link_method,
        'personLinkSourceRef', c.person_link_source_ref,
        'personLinkedAt', c.person_linked_at,
        'updatedAt', c.updated_at
      ) order by c.updated_at desc, c.id)
      from (
        select *
        from public.sales_conversations
        where organization_id = p_organization_id
          and person_id = p_person_id
        order by updated_at desc, id
        limit p_limit
      ) c
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'businessId', t.business_id,
        'leadId', t.lead_id,
        'conversationId', t.conversation_id,
        'taskType', t.task_type,
        'title', t.title,
        'status', t.status,
        'priority', t.priority,
        'assigneeUserId', t.assignee_user_id,
        'dueAt', t.due_at,
        'personLinkMethod', t.person_link_method,
        'personLinkSourceRef', t.person_link_source_ref,
        'personLinkedAt', t.person_linked_at,
        'updatedAt', t.updated_at
      ) order by t.updated_at desc, t.id)
      from (
        select *
        from public.crm_tasks
        where organization_id = p_organization_id
          and person_id = p_person_id
        order by updated_at desc, id
        limit p_limit
      ) t
    ), '[]'::jsonb),
    'deals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'businessId', d.business_id,
        'leadId', d.lead_id,
        'pipelineId', d.pipeline_id,
        'stageId', d.stage_id,
        'title', d.title,
        'state', d.state,
        'amount', d.amount,
        'currency', d.currency,
        'expectedCloseAt', d.expected_close_at,
        'ownerUserId', d.owner_user_id,
        'personLinkMethod', d.person_link_method,
        'personLinkSourceRef', d.person_link_source_ref,
        'personLinkedAt', d.person_linked_at,
        'updatedAt', d.updated_at
      ) order by d.updated_at desc, d.id)
      from (
        select *
        from public.crm_deals
        where organization_id = p_organization_id
          and person_id = p_person_id
        order by updated_at desc, id
        limit p_limit
      ) d
    ), '[]'::jsonb),
    'activityTimeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'itemId', x.item_id,
        'businessId', x.business_id,
        'leadId', x.lead_id,
        'conversationId', x.conversation_id,
        'source', x.source,
        'kind', x.kind,
        'visibility', x.visibility,
        'channel', x.channel,
        'direction', x.direction,
        'status', x.status,
        'deliveryStatus', x.delivery_status,
        'occurredAt', x.occurred_at,
        'title', x.title,
        'summary', x.summary
      ) order by x.occurred_at desc, x.item_id desc)
      from (
        select t.*
        from public.crm_customer_timeline t
        where t.organization_id = p_organization_id
          and (
            exists (
              select 1 from public.leads l
              where l.organization_id = p_organization_id
                and l.id = t.lead_id
                and l.person_id = p_person_id
            )
            or exists (
              select 1 from public.sales_conversations c
              where c.organization_id = p_organization_id
                and c.id = t.conversation_id
                and c.person_id = p_person_id
            )
          )
        order by t.occurred_at desc, t.item_id desc
        limit p_limit
      ) x
    ), '[]'::jsonb),
    'linkCandidates', jsonb_build_object(
      'leads', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entityType', 'LEAD',
          'entityId', q.id,
          'businessId', q.business_id,
          'label', coalesce(q.business_name, q.id::text),
          'updatedAt', q.updated_at
        ) order by q.updated_at desc, q.id)
        from (
          select l.id, l.business_id, b.name as business_name, l.updated_at
          from public.leads l
          left join public.businesses b
            on b.organization_id = l.organization_id
           and b.id = l.business_id
          where l.organization_id = p_organization_id
            and l.person_id is null
            and l.business_id is not null
            and exists (
              select 1
              from public.crm_person_business_relationships r
              where r.organization_id = p_organization_id
                and r.person_id = p_person_id
                and r.business_id = l.business_id
                and r.status = 'ACTIVE'
            )
          order by l.updated_at desc, l.id
          limit p_limit
        ) q
      ), '[]'::jsonb),
      'conversations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entityType', 'CONVERSATION',
          'entityId', q.id,
          'businessId', q.business_id,
          'label', q.channel || ' · ' || q.id::text,
          'updatedAt', q.updated_at
        ) order by q.updated_at desc, q.id)
        from (
          select c.id, l.business_id, c.channel, c.updated_at
          from public.sales_conversations c
          join public.leads l
            on l.organization_id = c.organization_id
           and l.id = c.lead_id
          where c.organization_id = p_organization_id
            and c.person_id is null
            and exists (
              select 1
              from public.crm_person_business_relationships r
              where r.organization_id = p_organization_id
                and r.person_id = p_person_id
                and r.business_id = l.business_id
                and r.status = 'ACTIVE'
            )
          order by c.updated_at desc, c.id
          limit p_limit
        ) q
      ), '[]'::jsonb),
      'tasks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entityType', 'TASK',
          'entityId', q.id,
          'businessId', q.business_id,
          'label', q.title,
          'updatedAt', q.updated_at
        ) order by q.updated_at desc, q.id)
        from (
          select
            t.id,
            coalesce(t.business_id, l.business_id, cl.business_id) as business_id,
            t.title,
            t.updated_at
          from public.crm_tasks t
          left join public.leads l
            on l.organization_id = t.organization_id
           and l.id = t.lead_id
          left join public.sales_conversations c
            on c.organization_id = t.organization_id
           and c.id = t.conversation_id
          left join public.leads cl
            on cl.organization_id = c.organization_id
           and cl.id = c.lead_id
          where t.organization_id = p_organization_id
            and t.person_id is null
            and exists (
              select 1
              from public.crm_person_business_relationships r
              where r.organization_id = p_organization_id
                and r.person_id = p_person_id
                and r.business_id = coalesce(t.business_id, l.business_id, cl.business_id)
                and r.status = 'ACTIVE'
            )
          order by t.updated_at desc, t.id
          limit p_limit
        ) q
      ), '[]'::jsonb),
      'deals', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entityType', 'DEAL',
          'entityId', q.id,
          'businessId', q.business_id,
          'label', q.title,
          'updatedAt', q.updated_at
        ) order by q.updated_at desc, q.id)
        from (
          select d.id, d.business_id, d.title, d.updated_at
          from public.crm_deals d
          where d.organization_id = p_organization_id
            and d.person_id is null
            and exists (
              select 1
              from public.crm_person_business_relationships r
              where r.organization_id = p_organization_id
                and r.person_id = p_person_id
                and r.business_id = d.business_id
                and r.status = 'ACTIVE'
            )
          order by d.updated_at desc, d.id
          limit p_limit
        ) q
      ), '[]'::jsonb)
    ),
    'moduleStatus', jsonb_build_object(
      'conversations', 'IMPLEMENTED',
      'tasks', 'IMPLEMENTED',
      'deals', 'IMPLEMENTED',
      'notes', 'CANONICAL_LINK_PENDING',
      'bookings', 'MODULE_NOT_IMPLEMENTED',
      'quotes', 'MODULE_NOT_IMPLEMENTED',
      'orders', 'MODULE_NOT_IMPLEMENTED',
      'invoices', 'MODULE_NOT_IMPLEMENTED',
      'payments', 'MODULE_NOT_IMPLEMENTED',
      'supportCases', 'MODULE_NOT_IMPLEMENTED',
      'documents', 'MODULE_NOT_IMPLEMENTED',
      'consent', 'MODULE_NOT_IMPLEMENTED'
    )
  )
  into v_result;

  return v_result;
end;
$customer360_read$;

revoke all on function public.guard_crm_customer360_person_context()
  from public, anon, authenticated, service_role;
revoke all on function public.reconcile_crm_customer360_person_merge()
  from public, anon, authenticated, service_role;

revoke all on function public.link_crm_customer360_person_context(
  uuid, uuid, text, uuid, uuid, text, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.link_crm_customer360_person_context(
  uuid, uuid, text, uuid, uuid, text, text, jsonb
) to service_role;

revoke all on function public.unlink_crm_customer360_person_context(
  uuid, uuid, text, uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.unlink_crm_customer360_person_context(
  uuid, uuid, text, uuid, uuid, text, jsonb
) to service_role;

revoke all on function public.get_crm_customer360_v2(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_crm_customer360_v2(uuid, uuid, integer)
  to authenticated;

comment on function public.link_crm_customer360_person_context(uuid, uuid, text, uuid, uuid, text, text, jsonb) is
  'Trusted evidence-backed Person binding onto existing Lead/Conversation/Task/Deal authorities. No entity fabrication.';
comment on function public.unlink_crm_customer360_person_context(uuid, uuid, text, uuid, uuid, text, jsonb) is
  'Trusted governed correction path for explicit Customer 360 Person bindings.';
comment on function public.get_crm_customer360_v2(uuid, uuid, integer) is
  'Person-centric Customer 360 read model over canonical direct Person links; missing modules stay explicit and no Company-only activity is attributed to a Person.';
