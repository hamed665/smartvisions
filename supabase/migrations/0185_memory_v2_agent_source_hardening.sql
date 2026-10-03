-- 0185: MEMORY-V2 canonical Agent Runtime provenance hardening
-- 0184 is already applied in Production and remains immutable in source.
-- This migration tightens the existing Memory source validator only.
-- No second Memory store, agent-learning table, queue, audit authority or agent runtime is created.

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
  elsif v_type='AGENT_RUNTIME' then
    if upper(btrim(coalesce(p_actor_type,'')))<>'SYSTEM' or p_actor_user_id is not null then
      raise exception 'Agent Runtime Memory source requires SYSTEM actor';
    end if;
    if p_source_evidence='{}'::jsonb then
      raise exception 'Agent Runtime Memory source requires evidence';
    end if;
    begin v_uuid:=v_ref::uuid;
    exception when invalid_text_representation then
      raise exception 'Memory Agent Runtime source reference must be a UUID';
    end;

    select a.conversation_id,
           coalesce(c.person_id,l.person_id),
           l.business_id
      into v_source_conversation_id,v_source_person_id,v_source_business_id
    from public.agent_runs a
    left join public.sales_conversations c
      on c.organization_id=a.organization_id and c.id=a.conversation_id
    left join public.leads l
      on l.organization_id=a.organization_id
     and l.id=coalesce(a.lead_id,c.lead_id)
    where a.organization_id=p_organization_id and a.id=v_uuid;

    if not found then raise exception 'Memory Agent Runtime source not found'; end if;
    if p_conversation_id is not null
       and v_source_conversation_id is distinct from p_conversation_id
    then raise exception 'Memory Agent Runtime source conflicts with Conversation target'; end if;
    if p_person_id is not null
       and v_source_person_id is not null
       and v_source_person_id<>p_person_id
    then raise exception 'Memory Agent Runtime source conflicts with Person target'; end if;
    if p_business_id is not null
       and v_source_business_id is not null
       and v_source_business_id<>p_business_id
    then raise exception 'Memory Agent Runtime source conflicts with Business target'; end if;
  elsif v_type='SYSTEM_DERIVED' then
    if upper(btrim(coalesce(p_actor_type,'')))<>'SYSTEM' or p_actor_user_id is not null then
      raise exception 'System Memory source requires SYSTEM actor';
    end if;
    if p_source_evidence='{}'::jsonb then
      raise exception 'System Memory source requires evidence';
    end if;
  else
    raise exception 'Memory source type is invalid';
  end if;
end;
$memory_source$;

revoke all on function private.memory_v2_validate_source(
  uuid,text,uuid,text,text,jsonb,uuid,uuid,uuid
) from public,anon,authenticated,service_role;

grant execute on function private.memory_v2_validate_source(
  uuid,text,uuid,text,text,jsonb,uuid,uuid,uuid
) to service_role;

comment on function private.memory_v2_validate_source(
  uuid,text,uuid,text,text,jsonb,uuid,uuid,uuid
) is 'Validates Memory V2 source provenance and target consistency. AGENT_RUNTIME references must resolve to canonical agent_runs in the same Organization.';
