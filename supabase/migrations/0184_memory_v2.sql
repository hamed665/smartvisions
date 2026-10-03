-- 0184: MEMORY-V2
-- Typed memory over canonical CRM/conversation authorities.
-- Conversation/Customer/Relationship/Business memory is compiled from canonical
-- source rows; only derived Working/Episodic/Operational/Agent Learning memory
-- is persisted here. This avoids a second CRM, conversation store or Business Twin.

create table public.memory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  memory_key text not null,
  memory_type text not null check (memory_type in (
    'WORKING','EPISODIC','OPERATIONAL','AGENT_LEARNING'
  )),
  version integer not null check (version>=1),
  payload jsonb not null
    check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=65536),
  state text not null default 'PENDING_REVIEW' check (state in (
    'PENDING_REVIEW','ACTIVE','SUPERSEDED','CORRECTED','EXPIRED','INVALIDATED','REJECTED'
  )),
  source_type text not null check (source_type in (
    'CONVERSATION_MESSAGE','SALES_CONVERSATION','CRM_PERSON','CRM_RELATIONSHIP',
    'CRM_BUSINESS','BUSINESS_TWIN','KNOWLEDGE','CRM_TASK','TIMELINE',
    'OPERATOR','AGENT_RUNTIME','SYSTEM_DERIVED'
  )),
  source_ref text not null check (length(btrim(source_ref)) between 1 and 300),
  source_evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_evidence)='object' and octet_length(source_evidence::text)<=32768),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  observed_at timestamptz not null,
  fresh_until timestamptz,
  sensitivity text not null default 'INTERNAL'
    check (sensitivity in ('PUBLIC','INTERNAL','CONFIDENTIAL')),
  valid_from timestamptz not null,
  valid_until timestamptz,
  expires_at timestamptz,
  person_id uuid references public.crm_people(id) on delete set null,
  business_id uuid references public.businesses(id) on delete set null,
  conversation_id uuid references public.sales_conversations(id) on delete set null,
  supersedes_memory_id uuid references public.memory_items(id) on delete restrict,
  corrected_by_memory_id uuid references public.memory_items(id) on delete restrict,
  correction_reason text,
  invalidation_reason text,
  retrieval_enabled boolean not null default false,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{32}$'),
  created_by_user_id uuid,
  approved_by_user_id uuid,
  approved_at timestamptz,
  rejected_by_user_id uuid,
  rejected_at timestamptz,
  rejection_reason text,
  last_request_key text not null check (length(btrim(last_request_key)) between 8 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,approved_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,rejected_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (memory_key=lower(memory_key) and memory_key ~ '^[a-z][a-z0-9_.:-]{1,159}$'),
  check (fresh_until is null or fresh_until>=observed_at),
  check (valid_until is null or valid_until>=valid_from),
  check (expires_at is null or expires_at>=valid_from),
  check (correction_reason is null or length(btrim(correction_reason)) between 2 and 500),
  check (invalidation_reason is null or length(btrim(invalidation_reason)) between 2 and 500),
  check (
    (supersedes_memory_id is null and correction_reason is null)
    or (supersedes_memory_id is not null and correction_reason is not null)
  ),
  check (corrected_by_memory_id is null or corrected_by_memory_id<>id),
  check (supersedes_memory_id is null or supersedes_memory_id<>id),
  check (
    memory_type<>'WORKING'
    or (expires_at is not null and expires_at<=valid_from+interval '30 days')
  )
);

comment on table public.memory_items is
  'Versioned derived-memory assertions only. Canonical Conversation/Customer/Relationship/Business truth is compiled at read time and never copied here.';

create unique index memory_items_one_active_target_uidx
  on public.memory_items(
    organization_id,memory_key,person_id,business_id,conversation_id
  ) nulls not distinct
  where state='ACTIVE';

create unique index memory_items_target_version_uidx
  on public.memory_items(
    organization_id,memory_key,person_id,business_id,conversation_id,version
  ) nulls not distinct;

create index memory_items_org_state_idx
  on public.memory_items(organization_id,state,updated_at desc);
create index memory_items_org_type_idx
  on public.memory_items(organization_id,memory_type,state,updated_at desc);
create index memory_items_person_idx
  on public.memory_items(person_id) where person_id is not null;
create index memory_items_business_idx
  on public.memory_items(business_id) where business_id is not null;
create index memory_items_conversation_idx
  on public.memory_items(conversation_id) where conversation_id is not null;
create index memory_items_supersedes_idx
  on public.memory_items(supersedes_memory_id) where supersedes_memory_id is not null;
create index memory_items_corrected_by_idx
  on public.memory_items(corrected_by_memory_id) where corrected_by_memory_id is not null;
create index memory_items_created_by_idx
  on public.memory_items(organization_id,created_by_user_id) where created_by_user_id is not null;
create index memory_items_approved_by_idx
  on public.memory_items(organization_id,approved_by_user_id) where approved_by_user_id is not null;
create index memory_items_rejected_by_idx
  on public.memory_items(organization_id,rejected_by_user_id) where rejected_by_user_id is not null;
create index memory_items_expiry_idx
  on public.memory_items(expires_at)
  where state='ACTIVE' and expires_at is not null;
create index memory_items_freshness_idx
  on public.memory_items(fresh_until)
  where state='ACTIVE' and fresh_until is not null;

alter table public.memory_items enable row level security;

create policy memory_items_manager_read
on public.memory_items
for select
to authenticated
using (
  exists(
    select 1
    from public.organization_members m
    where m.organization_id=memory_items.organization_id
      and m.user_id=(select auth.uid())
      and m.role in ('OWNER','ADMIN')
  )
);

revoke all on table public.memory_items from public,anon,authenticated,service_role;
grant select on table public.memory_items to authenticated,service_role;
grant insert,update on table public.memory_items to service_role;

create unique index memory_v2_audit_request_uidx
  on public.audit_logs(organization_id,action,entity_type,entity_id,correlation_id)
  where action like 'MEMORY_%' and correlation_id is not null;

create or replace function private.memory_v2_assert_manager(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path=public,pg_catalog
as $memory_manager$
begin
  if p_organization_id is null or p_actor_user_id is null then
    raise exception 'Memory Organization and actor are required';
  end if;
  if not exists(
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id
      and m.user_id=p_actor_user_id
      and m.role in ('OWNER','ADMIN')
  ) then
    raise exception 'Memory mutation requires OWNER or ADMIN';
  end if;
end;
$memory_manager$;

create or replace function private.memory_v2_validate_target(
  p_organization_id uuid,
  p_person_id uuid,
  p_business_id uuid,
  p_conversation_id uuid
)
returns void
language plpgsql
security invoker
set search_path=public,pg_catalog
as $memory_target$
declare
  v_conversation_person_id uuid;
  v_conversation_business_id uuid;
begin
  if p_person_id is not null and not exists(
    select 1 from public.crm_people p
    where p.organization_id=p_organization_id
      and p.id=p_person_id
      and p.status='ACTIVE'
  ) then
    raise exception 'Memory Person target is invalid';
  end if;

  if p_business_id is not null and not exists(
    select 1 from public.businesses b
    where b.organization_id=p_organization_id and b.id=p_business_id
  ) then
    raise exception 'Memory Business target is invalid';
  end if;

  if p_person_id is not null and p_business_id is not null
     and not exists(
       select 1
       from public.crm_person_business_relationships r
       where r.organization_id=p_organization_id
         and r.person_id=p_person_id
         and r.business_id=p_business_id
         and r.status='ACTIVE'
     )
     and not exists(
       select 1
       from public.sales_conversations c
       join public.leads l
         on l.organization_id=c.organization_id and l.id=c.lead_id
       where c.organization_id=p_organization_id
         and c.person_id=p_person_id
         and l.business_id=p_business_id
         and (p_conversation_id is null or c.id=p_conversation_id)
     )
  then
    raise exception 'Memory Person/Business target requires canonical relationship evidence';
  end if;

  if p_conversation_id is not null then
    select c.person_id,l.business_id
      into v_conversation_person_id,v_conversation_business_id
    from public.sales_conversations c
    left join public.leads l
      on l.organization_id=c.organization_id and l.id=c.lead_id
    where c.organization_id=p_organization_id and c.id=p_conversation_id;

    if not found then raise exception 'Memory Conversation target is invalid'; end if;

    if p_person_id is not null
       and v_conversation_person_id is not null
       and v_conversation_person_id<>p_person_id
    then raise exception 'Memory Conversation target conflicts with Person target'; end if;

    if p_business_id is not null
       and v_conversation_business_id is not null
       and v_conversation_business_id<>p_business_id
    then raise exception 'Memory Conversation target conflicts with Business target'; end if;
  end if;
end;
$memory_target$;

create or replace function private.memory_v2_validate_source(
  p_organization_id uuid,
  p_actor_type text,
  p_actor_user_id uuid,
  p_source_type text,
  p_source_ref text,
  p_source_evidence jsonb,
  p_person_id uuid,
  p_business_id uuid,
  p_conversation_id uuid
)
returns void
language plpgsql
security invoker
set search_path=public,pg_catalog
as $memory_source$
declare
  v_type text:=upper(btrim(coalesce(p_source_type,'')));
  v_ref text:=btrim(coalesce(p_source_ref,''));
  v_uuid uuid;
  v_source_person_id uuid;
  v_source_business_id uuid;
  v_source_conversation_id uuid;
begin
  if v_ref='' or length(v_ref)>300 then
    raise exception 'Memory source reference is invalid';
  end if;
  if p_source_evidence is null or jsonb_typeof(p_source_evidence)<>'object'
     or octet_length(p_source_evidence::text)>32768 then
    raise exception 'Memory source evidence is invalid';
  end if;

  if v_type in (
    'CONVERSATION_MESSAGE','SALES_CONVERSATION','CRM_PERSON','CRM_RELATIONSHIP',
    'CRM_BUSINESS','BUSINESS_TWIN','KNOWLEDGE','CRM_TASK'
  ) then
    begin v_uuid:=v_ref::uuid;
    exception when invalid_text_representation then
      raise exception 'Memory source reference must be a UUID for %',v_type;
    end;

    if v_type='CONVERSATION_MESSAGE' then
      select x.conversation_id,c.person_id,l.business_id
        into v_source_conversation_id,v_source_person_id,v_source_business_id
      from public.conversation_messages x
      join public.sales_conversations c
        on c.organization_id=x.organization_id and c.id=x.conversation_id
      left join public.leads l
        on l.organization_id=c.organization_id and l.id=c.lead_id
      where x.organization_id=p_organization_id and x.id=v_uuid;
      if not found then raise exception 'Memory Conversation Message source not found'; end if;
    elsif v_type='SALES_CONVERSATION' then
      select x.id,x.person_id,l.business_id
        into v_source_conversation_id,v_source_person_id,v_source_business_id
      from public.sales_conversations x
      left join public.leads l
        on l.organization_id=x.organization_id and l.id=x.lead_id
      where x.organization_id=p_organization_id and x.id=v_uuid;
      if not found then raise exception 'Memory Sales Conversation source not found'; end if;
    elsif v_type='CRM_PERSON' then
      if not exists(
        select 1 from public.crm_people x
        where x.organization_id=p_organization_id and x.id=v_uuid and x.status='ACTIVE'
      ) then raise exception 'Memory CRM Person source not found'; end if;
      v_source_person_id:=v_uuid;
    elsif v_type='CRM_RELATIONSHIP' then
      select x.person_id,x.business_id
        into v_source_person_id,v_source_business_id
      from public.crm_person_business_relationships x
      where x.organization_id=p_organization_id and x.id=v_uuid and x.status='ACTIVE';
      if not found then raise exception 'Memory CRM Relationship source not found'; end if;
    elsif v_type='CRM_BUSINESS' then
      if not exists(
        select 1 from public.businesses x
        where x.organization_id=p_organization_id and x.id=v_uuid
      ) then raise exception 'Memory CRM Business source not found'; end if;
      v_source_business_id:=v_uuid;
    elsif v_type='BUSINESS_TWIN' then
      if not exists(
        select 1 from public.business_twin_versions x
        where x.organization_id=p_organization_id and x.id=v_uuid
      ) then raise exception 'Memory Business Twin source not found'; end if;
    elsif v_type='KNOWLEDGE' then
      if not exists(
        select 1 from public.knowledge_versions x
        where x.organization_id=p_organization_id and x.id=v_uuid
      ) then raise exception 'Memory Knowledge source not found'; end if;
    elsif v_type='CRM_TASK' then
      select x.person_id,x.business_id,x.conversation_id
        into v_source_person_id,v_source_business_id,v_source_conversation_id
      from public.crm_tasks x
      where x.organization_id=p_organization_id and x.id=v_uuid;
      if not found then raise exception 'Memory CRM Task source not found'; end if;
    end if;

    if p_person_id is not null
       and v_source_person_id is not null
       and p_person_id<>v_source_person_id
    then raise exception 'Memory source conflicts with Person target'; end if;
    if p_business_id is not null
       and v_source_business_id is not null
       and p_business_id<>v_source_business_id
    then raise exception 'Memory source conflicts with Business target'; end if;
    if p_conversation_id is not null
       and v_source_conversation_id is not null
       and p_conversation_id<>v_source_conversation_id
    then raise exception 'Memory source conflicts with Conversation target'; end if;

  elsif v_type='TIMELINE' then
    select x.business_id,x.conversation_id
      into v_source_business_id,v_source_conversation_id
    from public.crm_customer_timeline x
    where x.organization_id=p_organization_id and x.item_id=v_ref;
    if not found then raise exception 'Memory Timeline source not found'; end if;
    if p_business_id is not null
       and v_source_business_id is not null
       and p_business_id<>v_source_business_id
    then raise exception 'Memory Timeline source conflicts with Business target'; end if;
    if p_conversation_id is not null
       and v_source_conversation_id is not null
       and p_conversation_id<>v_source_conversation_id
    then raise exception 'Memory Timeline source conflicts with Conversation target'; end if;

  elsif v_type='OPERATOR' then
    if upper(btrim(coalesce(p_actor_type,'')))<>'USER' or p_actor_user_id is null
       or v_ref<>p_actor_user_id::text
    then raise exception 'Operator Memory source must identify the acting manager'; end if;
  elsif v_type in ('AGENT_RUNTIME','SYSTEM_DERIVED') then
    if upper(btrim(coalesce(p_actor_type,'')))<>'SYSTEM' or p_actor_user_id is not null then
      raise exception 'System Memory source requires SYSTEM actor';
    end if;
    if p_source_evidence='{}'::jsonb then
      raise exception 'System/Agent Memory source requires evidence';
    end if;
  else
    raise exception 'Memory source type is invalid';
  end if;
end;
$memory_source$;

create or replace function public.guard_memory_item_v2_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $memory_guard$
begin
  if current_setting('app.memory_v2_mutation',true) is distinct from 'allowed' then
    raise exception 'Memory item mutation requires governed command';
  end if;
  if tg_op='DELETE' then
    raise exception 'Memory history is immutable; invalidate instead of delete';
  end if;
  if tg_op='UPDATE' then
    new.updated_at:=statement_timestamp();
    if new.organization_id<>old.organization_id
       or new.memory_key<>old.memory_key
       or new.memory_type<>old.memory_type
       or new.version<>old.version
       or new.payload<>old.payload
       or new.source_type<>old.source_type
       or new.source_ref<>old.source_ref
       or new.source_evidence<>old.source_evidence
       or new.confidence<>old.confidence
       or new.observed_at<>old.observed_at
       or new.sensitivity<>old.sensitivity
       or new.valid_from<>old.valid_from
       or new.person_id is distinct from old.person_id
       or new.business_id is distinct from old.business_id
       or new.conversation_id is distinct from old.conversation_id
       or new.supersedes_memory_id is distinct from old.supersedes_memory_id
       or new.correction_reason is distinct from old.correction_reason
       or new.content_hash<>old.content_hash
       or new.created_by_user_id is distinct from old.created_by_user_id
       or new.created_at<>old.created_at
    then
      raise exception 'Memory immutable assertion fields cannot be changed';
    end if;
  end if;
  return new;
end;
$memory_guard$;

create trigger memory_items_governed_mutation
before insert or update or delete on public.memory_items
for each row execute function public.guard_memory_item_v2_mutation();

create or replace function public.stage_memory_item_v2(
  p_organization_id uuid,
  p_actor_type text,
  p_actor_user_id uuid,
  p_memory_key text,
  p_memory_type text,
  p_payload jsonb,
  p_source_type text,
  p_source_ref text,
  p_source_evidence jsonb,
  p_confidence numeric,
  p_observed_at timestamptz,
  p_fresh_until timestamptz,
  p_sensitivity text,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_expires_at timestamptz,
  p_person_id uuid,
  p_business_id uuid,
  p_conversation_id uuid,
  p_supersedes_memory_id uuid,
  p_correction_reason text,
  p_request_key text
)
returns table(memory_id uuid,resolved_version integer,review_state text,unchanged boolean)
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $memory_stage$
declare
  v_actor_type text:=upper(btrim(coalesce(p_actor_type,'')));
  v_key text:=lower(btrim(coalesce(p_memory_key,'')));
  v_type text:=upper(btrim(coalesce(p_memory_type,'')));
  v_source_type text:=upper(btrim(coalesce(p_source_type,'')));
  v_sensitivity text:=upper(btrim(coalesce(p_sensitivity,'')));
  v_observed timestamptz:=coalesce(p_observed_at,statement_timestamp());
  v_valid_from timestamptz:=coalesce(p_valid_from,v_observed);
  v_hash text;
  v_request_hash text;
  v_replay_hash text;
  v_replay_id uuid;
  v_existing public.memory_items%rowtype;
  v_active public.memory_items%rowtype;
  v_next integer;
  v_actor_id text;
begin
  if current_user<>'service_role' then raise exception 'Memory staging is service-only'; end if;

  if v_actor_type='USER' then
    perform private.memory_v2_assert_manager(p_organization_id,p_actor_user_id);
    v_actor_id:=p_actor_user_id::text;
  elsif v_actor_type='SYSTEM' then
    if p_actor_user_id is not null then raise exception 'SYSTEM Memory actor cannot include user id'; end if;
    v_actor_id:=null;
  else
    raise exception 'Memory actor type is invalid';
  end if;

  if v_key !~ '^[a-z][a-z0-9_.:-]{1,159}$' then raise exception 'Memory key is invalid'; end if;
  if v_type not in ('WORKING','EPISODIC','OPERATIONAL','AGENT_LEARNING') then
    raise exception 'Only derived Memory types may be persisted';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_payload='{}'::jsonb
     or octet_length(p_payload::text)>65536 then
    raise exception 'Memory payload is invalid or too large';
  end if;
  if p_confidence is null or p_confidence<0 or p_confidence>1 then
    raise exception 'Memory confidence must be between 0 and 1';
  end if;
  if v_sensitivity not in ('PUBLIC','INTERNAL','CONFIDENTIAL') then
    raise exception 'Memory sensitivity is invalid';
  end if;
  if v_observed>statement_timestamp()+interval '5 minutes' then
    raise exception 'Memory observed_at cannot be materially in the future';
  end if;
  if p_fresh_until is not null and p_fresh_until<v_observed then
    raise exception 'Memory fresh_until precedes observation';
  end if;
  if p_valid_until is not null and p_valid_until<v_valid_from then
    raise exception 'Memory valid_until precedes valid_from';
  end if;
  if p_expires_at is not null and p_expires_at<v_valid_from then
    raise exception 'Memory expires_at precedes valid_from';
  end if;
  if v_type='WORKING' and (
    p_expires_at is null or p_expires_at>v_valid_from+interval '30 days'
  ) then
    raise exception 'Working Memory requires expiry within 30 days';
  end if;
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Memory request key is invalid';
  end if;

  perform private.memory_v2_validate_target(
    p_organization_id,p_person_id,p_business_id,p_conversation_id
  );
  perform private.memory_v2_validate_source(
    p_organization_id,v_actor_type,p_actor_user_id,v_source_type,p_source_ref,p_source_evidence,
    p_person_id,p_business_id,p_conversation_id
  );

  if p_supersedes_memory_id is not null then
    select * into v_active
    from public.memory_items
    where organization_id=p_organization_id and id=p_supersedes_memory_id
    for update;
    if not found or v_active.state<>'ACTIVE' or v_active.memory_key<>v_key
       or v_active.memory_type<>v_type
       or v_active.person_id is distinct from p_person_id
       or v_active.business_id is distinct from p_business_id
       or v_active.conversation_id is distinct from p_conversation_id then
      raise exception 'Memory correction target must be the active matching item and target';
    end if;
    if length(btrim(coalesce(p_correction_reason,''))) not between 2 and 500 then
      raise exception 'Memory correction requires a reason';
    end if;
  elsif p_correction_reason is not null then
    raise exception 'Memory correction reason requires a superseded item';
  end if;

  v_hash:=md5(jsonb_build_object(
    'memoryKey',v_key,'memoryType',v_type,'payload',p_payload,
    'sourceType',v_source_type,'sourceRef',btrim(p_source_ref),
    'sourceEvidence',p_source_evidence,'confidence',p_confidence,
    'observedAt',v_observed,'freshUntil',p_fresh_until,
    'sensitivity',v_sensitivity,'validFrom',v_valid_from,
    'validUntil',p_valid_until,'expiresAt',p_expires_at,
    'personId',p_person_id,'businessId',p_business_id,
    'conversationId',p_conversation_id,'supersedesMemoryId',p_supersedes_memory_id,
    'correctionReason',p_correction_reason
  )::text);
  v_request_hash:=md5(jsonb_build_object('contentHash',v_hash,'actorType',v_actor_type)::text);

  select a.after_data->>'requestHash',(a.after_data->>'memoryId')::uuid
    into v_replay_hash,v_replay_id
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action='MEMORY_ITEM_STAGED'
    and a.entity_type='memory_item'
    and a.entity_id=v_key
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc limit 1;

  if v_replay_hash is not null then
    if v_replay_hash<>v_request_hash then raise exception 'Memory request key conflict'; end if;
    select * into v_existing
    from public.memory_items
    where organization_id=p_organization_id and id=v_replay_id;
    if not found then raise exception 'Memory replay item is missing'; end if;
    return query select v_existing.id,v_existing.version,v_existing.state,true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':memory:'||v_key||':'||
    coalesce(p_person_id::text,'-')||':'||
    coalesce(p_business_id::text,'-')||':'||
    coalesce(p_conversation_id::text,'-'),0
  ));

  select * into v_existing
  from public.memory_items
  where organization_id=p_organization_id
    and memory_key=v_key and state='PENDING_REVIEW' and content_hash=v_hash
    and person_id is not distinct from p_person_id
    and business_id is not distinct from p_business_id
    and conversation_id is not distinct from p_conversation_id
  order by version desc limit 1;

  if v_existing.id is not null then
    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
    ) values (
      p_organization_id,v_actor_type,v_actor_id,'MEMORY_ITEM_STAGED','memory_item',v_key,
      jsonb_build_object(
        'requestHash',v_request_hash,'memoryId',v_existing.id,'version',v_existing.version,
        'state',v_existing.state,'unchanged',true
      ),p_request_key
    );
    return query select v_existing.id,v_existing.version,v_existing.state,true;
    return;
  end if;

  select coalesce(max(m.version),0)+1 into v_next
  from public.memory_items m
  where m.organization_id=p_organization_id
    and m.memory_key=v_key
    and m.person_id is not distinct from p_person_id
    and m.business_id is not distinct from p_business_id
    and m.conversation_id is not distinct from p_conversation_id;

  perform set_config('app.memory_v2_mutation','allowed',true);
  insert into public.memory_items(
    organization_id,memory_key,memory_type,version,payload,state,
    source_type,source_ref,source_evidence,confidence,observed_at,fresh_until,
    sensitivity,valid_from,valid_until,expires_at,
    person_id,business_id,conversation_id,supersedes_memory_id,correction_reason,
    retrieval_enabled,content_hash,created_by_user_id,last_request_key
  ) values (
    p_organization_id,v_key,v_type,v_next,p_payload,'PENDING_REVIEW',
    v_source_type,btrim(p_source_ref),p_source_evidence,p_confidence,v_observed,p_fresh_until,
    v_sensitivity,v_valid_from,p_valid_until,p_expires_at,
    p_person_id,p_business_id,p_conversation_id,p_supersedes_memory_id,
    nullif(btrim(coalesce(p_correction_reason,'')),''),
    false,v_hash,case when v_actor_type='USER' then p_actor_user_id else null end,p_request_key
  ) returning * into v_existing;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,v_actor_type,v_actor_id,'MEMORY_ITEM_STAGED','memory_item',v_key,
    jsonb_build_object(
      'requestHash',v_request_hash,'memoryId',v_existing.id,'version',v_existing.version,
      'memoryType',v_existing.memory_type,'state',v_existing.state,'unchanged',false,
      'sourceType',v_existing.source_type,'confidence',v_existing.confidence,
      'supersedesMemoryId',v_existing.supersedes_memory_id
    ),p_request_key
  );

  return query select v_existing.id,v_existing.version,v_existing.state,false;
end;
$memory_stage$;

create or replace function public.approve_memory_item_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_memory_id uuid,
  p_request_key text
)
returns public.memory_items
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $memory_approve$
declare
  v_target public.memory_items%rowtype;
  v_old public.memory_items%rowtype;
  v_result public.memory_items%rowtype;
  v_request_hash text;
  v_replay_hash text;
begin
  if current_user<>'service_role' then raise exception 'Memory approval is service-only'; end if;
  perform private.memory_v2_assert_manager(p_organization_id,p_actor_user_id);
  if p_memory_id is null or length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Memory approval payload is invalid';
  end if;

  v_request_hash:=md5(jsonb_build_object('memoryId',p_memory_id)::text);
  select a.after_data->>'requestHash' into v_replay_hash
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action='MEMORY_ITEM_APPROVED'
    and a.entity_type='memory_item'
    and a.entity_id=p_memory_id::text
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc limit 1;

  if v_replay_hash is not null then
    if v_replay_hash<>v_request_hash then raise exception 'Memory approval request key conflict'; end if;
    select * into v_result from public.memory_items
    where organization_id=p_organization_id and id=p_memory_id;
    return v_result;
  end if;

  select * into v_target
  from public.memory_items
  where organization_id=p_organization_id and id=p_memory_id
  for update;
  if not found then raise exception 'Memory item not found'; end if;
  if v_target.state='ACTIVE' then return v_target; end if;
  if v_target.state<>'PENDING_REVIEW' then raise exception 'Only pending Memory may be approved'; end if;
  if v_target.expires_at is not null and v_target.expires_at<=statement_timestamp() then
    raise exception 'Expired Memory candidate cannot be approved';
  end if;
  if v_target.valid_until is not null and v_target.valid_until<=statement_timestamp() then
    raise exception 'Invalid Memory candidate cannot be approved';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':memory:'||v_target.memory_key||':'||
    coalesce(v_target.person_id::text,'-')||':'||
    coalesce(v_target.business_id::text,'-')||':'||
    coalesce(v_target.conversation_id::text,'-'),0
  ));

  select * into v_old
  from public.memory_items
  where organization_id=p_organization_id
    and memory_key=v_target.memory_key and state='ACTIVE'
    and person_id is not distinct from v_target.person_id
    and business_id is not distinct from v_target.business_id
    and conversation_id is not distinct from v_target.conversation_id
  for update;

  if v_target.supersedes_memory_id is not null then
    if v_old.id is null or v_old.id<>v_target.supersedes_memory_id then
      raise exception 'Memory correction target is no longer active';
    end if;
  end if;

  perform set_config('app.memory_v2_mutation','allowed',true);

  if v_old.id is not null and v_old.id<>v_target.id then
    update public.memory_items
    set state=case when v_target.supersedes_memory_id=v_old.id then 'CORRECTED' else 'SUPERSEDED' end,
        retrieval_enabled=false,
        valid_until=case
          when valid_until is null or valid_until>statement_timestamp() then statement_timestamp()
          else valid_until end,
        corrected_by_memory_id=case when v_target.supersedes_memory_id=v_old.id then v_target.id else corrected_by_memory_id end
    where id=v_old.id;
  end if;

  update public.memory_items
  set state='ACTIVE',retrieval_enabled=true,
      approved_by_user_id=p_actor_user_id,approved_at=statement_timestamp(),
      rejected_by_user_id=null,rejected_at=null,rejection_reason=null,
      last_request_key=p_request_key
  where id=v_target.id
  returning * into v_result;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'MEMORY_ITEM_APPROVED',
    'memory_item',p_memory_id::text,
    case when v_old.id is null then null else jsonb_build_object('previousActiveMemoryId',v_old.id,'previousState',v_old.state) end,
    jsonb_build_object(
      'requestHash',v_request_hash,'memoryKey',v_result.memory_key,'version',v_result.version,
      'state',v_result.state,'supersededMemoryId',v_old.id
    ),p_request_key
  );

  return v_result;
end;
$memory_approve$;

create or replace function public.reject_memory_item_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_memory_id uuid,
  p_reason text,
  p_request_key text
)
returns public.memory_items
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $memory_reject$
declare
  v_result public.memory_items%rowtype;
  v_reason text:=btrim(coalesce(p_reason,''));
begin
  if current_user<>'service_role' then raise exception 'Memory rejection is service-only'; end if;
  perform private.memory_v2_assert_manager(p_organization_id,p_actor_user_id);
  if p_memory_id is null or length(v_reason) not between 2 and 500
     or length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Memory rejection payload is invalid';
  end if;

  select * into v_result
  from public.memory_items
  where organization_id=p_organization_id and id=p_memory_id
  for update;
  if not found then raise exception 'Memory item not found'; end if;
  if v_result.state='REJECTED' then return v_result; end if;
  if v_result.state<>'PENDING_REVIEW' then raise exception 'Only pending Memory may be rejected'; end if;

  perform set_config('app.memory_v2_mutation','allowed',true);
  update public.memory_items
  set state='REJECTED',retrieval_enabled=false,
      rejected_by_user_id=p_actor_user_id,rejected_at=statement_timestamp(),
      rejection_reason=v_reason,last_request_key=p_request_key
  where id=p_memory_id
  returning * into v_result;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'MEMORY_ITEM_REJECTED',
    'memory_item',p_memory_id::text,
    jsonb_build_object('memoryKey',v_result.memory_key,'version',v_result.version,'reason',v_reason),
    p_request_key
  );
  return v_result;
end;
$memory_reject$;

create or replace function public.invalidate_memory_item_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_memory_id uuid,
  p_reason text,
  p_request_key text
)
returns public.memory_items
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $memory_invalidate$
declare
  v_result public.memory_items%rowtype;
  v_reason text:=btrim(coalesce(p_reason,''));
begin
  if current_user<>'service_role' then raise exception 'Memory invalidation is service-only'; end if;
  perform private.memory_v2_assert_manager(p_organization_id,p_actor_user_id);
  if p_memory_id is null or length(v_reason) not between 2 and 500
     or length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Memory invalidation payload is invalid';
  end if;

  select * into v_result
  from public.memory_items
  where organization_id=p_organization_id and id=p_memory_id
  for update;
  if not found then raise exception 'Memory item not found'; end if;
  if v_result.state='INVALIDATED' then return v_result; end if;
  if v_result.state<>'ACTIVE' then raise exception 'Only active Memory may be invalidated'; end if;

  perform set_config('app.memory_v2_mutation','allowed',true);
  update public.memory_items
  set state='INVALIDATED',retrieval_enabled=false,
      valid_until=case
        when valid_until is null or valid_until>statement_timestamp() then statement_timestamp()
        else valid_until end,
      invalidation_reason=v_reason,last_request_key=p_request_key
  where id=p_memory_id
  returning * into v_result;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'MEMORY_ITEM_INVALIDATED',
    'memory_item',p_memory_id::text,
    jsonb_build_object('memoryKey',v_result.memory_key,'version',v_result.version,'reason',v_reason),
    p_request_key
  );
  return v_result;
end;
$memory_invalidate$;

create or replace function public.get_memory_context_v2(
  p_organization_id uuid,
  p_person_id uuid default null,
  p_business_id uuid default null,
  p_conversation_id uuid default null,
  p_include_stale boolean default false,
  p_include_expired boolean default false,
  p_limit integer default 100
)
returns table(
  memory_key text,
  memory_type text,
  version integer,
  payload jsonb,
  source_type text,
  source_ref text,
  source_evidence jsonb,
  confidence numeric,
  observed_at timestamptz,
  fresh_until timestamptz,
  freshness_state text,
  sensitivity text,
  valid_from timestamptz,
  valid_until timestamptz,
  expires_at timestamptz,
  validity_state text,
  correction_semantics text,
  memory_id uuid,
  person_id uuid,
  business_id uuid,
  conversation_id uuid
)
language sql
stable
security invoker
set search_path=public,pg_catalog
as $memory_context$
  with canonical as (
    select
      '_canonical_conversation:'||c.id::text as memory_key,
      'CONVERSATION'::text as memory_type,
      1 as version,
      jsonb_build_object(
        'summary',c.summary,
        'salesState',c.sales_state,
        'stage',c.stage,
        'intentLabel',c.intent_label,
        'sentimentLabel',c.sentiment_label,
        'lastMessageAt',c.last_message_at,
        'requiresHuman',c.requires_human
      ) as payload,
      'SALES_CONVERSATION'::text as source_type,
      c.id::text as source_ref,
      jsonb_build_object('canonicalTable','sales_conversations','sourceManaged',true) as source_evidence,
      1.0000::numeric as confidence,
      c.updated_at as observed_at,
      null::timestamptz as fresh_until,
      'SOURCE_MANAGED'::text as freshness_state,
      'INTERNAL'::text as sensitivity,
      c.created_at as valid_from,
      null::timestamptz as valid_until,
      null::timestamptz as expires_at,
      'ACTIVE'::text as validity_state,
      'CANONICAL_SOURCE_UPDATE'::text as correction_semantics,
      null::uuid as memory_id,
      c.person_id,
      l.business_id,
      c.id as conversation_id
    from public.sales_conversations c
    left join public.leads l
      on l.organization_id=c.organization_id and l.id=c.lead_id
    where c.organization_id=p_organization_id
      and p_conversation_id is not null and c.id=p_conversation_id

    union all

    select
      '_canonical_customer:'||p.id::text,
      'CUSTOMER',1,
      jsonb_build_object(
        'displayName',p.display_name,'status',p.status,
        'firstSeenAt',p.first_seen_at,'lastSeenAt',p.last_seen_at
      ),
      'CRM_PERSON',p.id::text,
      jsonb_build_object('canonicalTable','crm_people','sourceManaged',true),
      1.0000::numeric,p.updated_at,null,'SOURCE_MANAGED','CONFIDENTIAL',
      p.created_at,null,null,'ACTIVE','CANONICAL_SOURCE_UPDATE',
      null::uuid,p.id,null::uuid,null::uuid
    from public.crm_people p
    where p.organization_id=p_organization_id
      and p_person_id is not null and p.id=p_person_id and p.status='ACTIVE'

    union all

    select
      '_canonical_relationship:'||r.id::text,
      'RELATIONSHIP',1,
      jsonb_build_object(
        'relationshipType',r.relationship_type,'jobTitle',r.job_title,
        'businessId',r.business_id,'status',r.status,
        'verificationMethod',r.verification_method
      ),
      'CRM_RELATIONSHIP',r.id::text,
      jsonb_build_object(
        'canonicalTable','crm_person_business_relationships',
        'sourceManaged',true,'sourceRef',r.source_ref
      ),
      1.0000::numeric,r.updated_at,null,'SOURCE_MANAGED','CONFIDENTIAL',
      r.created_at,null,null,'ACTIVE','CANONICAL_SOURCE_UPDATE',
      null::uuid,r.person_id,r.business_id,null::uuid
    from public.crm_person_business_relationships r
    where r.organization_id=p_organization_id
      and p_person_id is not null and r.person_id=p_person_id
      and r.status='ACTIVE'
      and (p_business_id is null or r.business_id=p_business_id)

    union all

    select
      '_canonical_business:'||b.id::text,
      'BUSINESS',1,
      jsonb_build_object(
        'name',b.name,'countryCode',b.country_code,'city',b.city,
        'category',b.category,'accountLifecycle',b.account_lifecycle
      ),
      'CRM_BUSINESS',b.id::text,
      jsonb_build_object('canonicalTable','businesses','sourceManaged',true),
      1.0000::numeric,b.updated_at,null,'SOURCE_MANAGED','INTERNAL',
      b.created_at,null,null,'ACTIVE','CANONICAL_SOURCE_UPDATE',
      null::uuid,null::uuid,b.id,null::uuid
    from public.businesses b
    where b.organization_id=p_organization_id
      and p_business_id is not null and b.id=p_business_id
  ),
  derived as (
    select
      m.memory_key,m.memory_type,m.version,m.payload,m.source_type,m.source_ref,
      m.source_evidence,m.confidence,m.observed_at,m.fresh_until,
      case
        when m.fresh_until is null then 'UNBOUNDED'
        when m.fresh_until<statement_timestamp() then 'STALE'
        else 'FRESH'
      end as freshness_state,
      m.sensitivity,m.valid_from,m.valid_until,m.expires_at,
      case
        when m.expires_at is not null and m.expires_at<=statement_timestamp() then 'EXPIRED'
        when m.valid_until is not null and m.valid_until<=statement_timestamp() then 'EXPIRED'
        when m.valid_from>statement_timestamp() then 'NOT_YET_VALID'
        else 'ACTIVE'
      end as validity_state,
      'VERSIONED_MEMORY_CORRECTION'::text as correction_semantics,
      m.id as memory_id,m.person_id,m.business_id,m.conversation_id
    from public.memory_items m
    where m.organization_id=p_organization_id
      and m.state='ACTIVE' and m.retrieval_enabled=true
      and (m.person_id is null or m.person_id=p_person_id)
      and (m.business_id is null or m.business_id=p_business_id)
      and (m.conversation_id is null or m.conversation_id=p_conversation_id)
      and m.valid_from<=statement_timestamp()
      and (
        p_include_stale
        or m.fresh_until is null
        or m.fresh_until>=statement_timestamp()
      )
      and (
        p_include_expired
        or (
          (m.valid_until is null or m.valid_until>statement_timestamp())
          and (m.expires_at is null or m.expires_at>statement_timestamp())
        )
      )
  )
  select *
  from (
    select * from canonical
    union all
    select * from derived
  ) all_memory
  order by
    case memory_type
      when 'CONVERSATION' then 1
      when 'CUSTOMER' then 2
      when 'RELATIONSHIP' then 3
      when 'BUSINESS' then 4
      when 'WORKING' then 5
      when 'EPISODIC' then 6
      when 'OPERATIONAL' then 7
      else 8
    end,
    observed_at desc,
    memory_key
  limit greatest(1,least(coalesce(p_limit,100),200));
$memory_context$;

revoke all on function public.guard_memory_item_v2_mutation() from public,anon,authenticated,service_role;
revoke all on function private.memory_v2_assert_manager(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.memory_v2_validate_target(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.memory_v2_validate_source(uuid,text,uuid,text,text,jsonb,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.stage_memory_item_v2(
  uuid,text,uuid,text,text,jsonb,text,text,jsonb,numeric,timestamptz,timestamptz,
  text,timestamptz,timestamptz,timestamptz,uuid,uuid,uuid,uuid,text,text
) from public,anon,authenticated,service_role;
revoke all on function public.approve_memory_item_v2(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.reject_memory_item_v2(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.invalidate_memory_item_v2(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_memory_context_v2(uuid,uuid,uuid,uuid,boolean,boolean,integer)
  from public,anon,authenticated,service_role;

grant execute on function private.memory_v2_assert_manager(uuid,uuid) to service_role;
grant execute on function private.memory_v2_validate_target(uuid,uuid,uuid,uuid) to service_role;
grant execute on function private.memory_v2_validate_source(uuid,text,uuid,text,text,jsonb,uuid,uuid,uuid) to service_role;
grant execute on function public.stage_memory_item_v2(
  uuid,text,uuid,text,text,jsonb,text,text,jsonb,numeric,timestamptz,timestamptz,
  text,timestamptz,timestamptz,timestamptz,uuid,uuid,uuid,uuid,text,text
) to service_role;
grant execute on function public.approve_memory_item_v2(uuid,uuid,uuid,text) to service_role;
grant execute on function public.reject_memory_item_v2(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.invalidate_memory_item_v2(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.get_memory_context_v2(uuid,uuid,uuid,uuid,boolean,boolean,integer)
  to service_role;

comment on function public.get_memory_context_v2(uuid,uuid,uuid,uuid,boolean,boolean,integer) is
  'Typed Memory V2 resolver. Conversation/Customer/Relationship/Business memory is compiled from canonical sources; stored memory contains derived Working/Episodic/Operational/Agent Learning assertions only.';
comment on function public.stage_memory_item_v2(
  uuid,text,uuid,text,text,jsonb,text,text,jsonb,numeric,timestamptz,timestamptz,
  text,timestamptz,timestamptz,timestamptz,uuid,uuid,uuid,uuid,text,text
) is
  'Stages derived memory for explicit review. Agent/System learning cannot silently become active memory.';
