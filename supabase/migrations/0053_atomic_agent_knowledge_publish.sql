-- Make owner-managed Knowledge/Prompt publishing atomic and establish a small
-- Smart Visions knowledge baseline without duplicating canonical pricing/locale data.

-- Normalize any pre-existing duplicate active versions before enforcing the invariant.
with ranked as (
  select id,
         row_number() over (
           partition by organization_id, knowledge_key
           order by version desc, created_at desc, id desc
         ) as rn
  from public.knowledge_versions
  where active
)
update public.knowledge_versions k
   set active = false
  from ranked r
 where k.id = r.id
   and r.rn > 1;

with ranked as (
  select id,
         row_number() over (
           partition by organization_id, agent_name
           order by version desc, created_at desc, id desc
         ) as rn
  from public.prompt_versions
  where active
)
update public.prompt_versions p
   set active = false
  from ranked r
 where p.id = r.id
   and r.rn > 1;

create unique index if not exists knowledge_versions_one_active_uidx
  on public.knowledge_versions (organization_id, knowledge_key)
  where active;

create unique index if not exists prompt_versions_one_active_uidx
  on public.prompt_versions (organization_id, agent_name)
  where active;

create or replace function public.publish_knowledge_version(
  p_organization_id uuid,
  p_knowledge_key text,
  p_payload jsonb
)
returns table(id uuid, version integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_key text := trim(coalesce(p_knowledge_key, ''));
  v_version integer;
  v_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organizationId is required';
  end if;
  if not public.is_org_owner(p_organization_id) then
    raise exception 'OWNER role is required to publish knowledge';
  end if;
  if v_key = '' or length(v_key) > 120 then
    raise exception 'knowledge key must be 1..120 characters';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or p_payload = '{}'::jsonb then
    raise exception 'knowledge payload must be a non-empty JSON object';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':knowledge:' || v_key, 0));

  select coalesce(max(k.version), 0) + 1
    into v_version
    from public.knowledge_versions k
   where k.organization_id = p_organization_id
     and k.knowledge_key = v_key;

  update public.knowledge_versions
     set active = false
   where organization_id = p_organization_id
     and knowledge_key = v_key
     and active;

  insert into public.knowledge_versions (
    organization_id,
    knowledge_key,
    version,
    payload,
    active,
    created_by
  ) values (
    p_organization_id,
    v_key,
    v_version,
    p_payload,
    true,
    auth.uid()
  ) returning knowledge_versions.id into v_id;

  insert into public.audit_logs (
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    p_organization_id,
    'USER',
    auth.uid()::text,
    'PUBLISH_KNOWLEDGE_VERSION',
    'knowledge',
    v_id::text,
    jsonb_build_object('knowledge_key', v_key, 'version', v_version)
  );

  return query select v_id, v_version;
end;
$$;

create or replace function public.publish_prompt_version(
  p_organization_id uuid,
  p_agent_name text,
  p_prompt_text text
)
returns table(id uuid, version integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_agent text := trim(coalesce(p_agent_name, ''));
  v_prompt text := trim(coalesce(p_prompt_text, ''));
  v_version integer;
  v_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organizationId is required';
  end if;
  if not public.is_org_owner(p_organization_id) then
    raise exception 'OWNER role is required to publish prompts';
  end if;
  if v_agent = '' or length(v_agent) > 80 then
    raise exception 'agent name must be 1..80 characters';
  end if;
  if v_prompt = '' then
    raise exception 'prompt text is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':prompt:' || v_agent, 0));

  select coalesce(max(p.version), 0) + 1
    into v_version
    from public.prompt_versions p
   where p.organization_id = p_organization_id
     and p.agent_name = v_agent;

  update public.prompt_versions
     set active = false
   where organization_id = p_organization_id
     and agent_name = v_agent
     and active;

  insert into public.prompt_versions (
    organization_id,
    agent_name,
    version,
    prompt_text,
    active,
    created_by
  ) values (
    p_organization_id,
    v_agent,
    v_version,
    v_prompt,
    true,
    auth.uid()
  ) returning prompt_versions.id into v_id;

  insert into public.audit_logs (
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    p_organization_id,
    'USER',
    auth.uid()::text,
    'PUBLISH_PROMPT_VERSION',
    'prompt',
    v_id::text,
    jsonb_build_object('agent_name', v_agent, 'version', v_version)
  );

  return query select v_id, v_version;
end;
$$;

revoke all on function public.publish_knowledge_version(uuid, text, jsonb) from public;
revoke all on function public.publish_knowledge_version(uuid, text, jsonb) from anon;
revoke all on function public.publish_knowledge_version(uuid, text, jsonb) from authenticated;
revoke all on function public.publish_knowledge_version(uuid, text, jsonb) from service_role;
grant execute on function public.publish_knowledge_version(uuid, text, jsonb) to authenticated;

revoke all on function public.publish_prompt_version(uuid, text, text) from public;
revoke all on function public.publish_prompt_version(uuid, text, text) from anon;
revoke all on function public.publish_prompt_version(uuid, text, text) from authenticated;
revoke all on function public.publish_prompt_version(uuid, text, text) from service_role;
grant execute on function public.publish_prompt_version(uuid, text, text) to authenticated;

-- Seed only when the canonical Smart Visions organization does not already have
-- an owner-managed version for the key. This is intentionally process/brand
-- guidance only: Services, Pricing and Locale remain authoritative elsewhere.
do $$
declare
  v_org_id uuid;
  v_brand_id uuid;
  v_process_id uuid;
begin
  select id
    into strict v_org_id
    from public.organizations
   where name = 'Smart Visions';

  if not exists (
    select 1 from public.knowledge_versions
     where organization_id = v_org_id
       and knowledge_key = 'smartvisions_brand_positioning'
  ) then
    insert into public.knowledge_versions (
      organization_id, knowledge_key, version, payload, active, created_by
    ) values (
      v_org_id,
      'smartvisions_brand_positioning',
      1,
      jsonb_build_object(
        'text',
        $knowledge$Smart Visions should present AI as a practical part of business growth and sales workflows, not as novelty for its own sake. Start from the customer's actual business problem and desired outcome. Prefer the smallest useful solution that fits the stated need over a broad bundle. Be transparent when information is unknown or a capability is outside verified scope. Do not guarantee business results.$knowledge$
      ),
      true,
      null
    ) returning id into v_brand_id;
  end if;

  if not exists (
    select 1 from public.knowledge_versions
     where organization_id = v_org_id
       and knowledge_key = 'smartvisions_customer_journey'
  ) then
    insert into public.knowledge_versions (
      organization_id, knowledge_key, version, payload, active, created_by
    ) values (
      v_org_id,
      'smartvisions_customer_journey',
      1,
      jsonb_build_object(
        'text',
        $knowledge$Use a consultative sales sequence: understand the current problem and desired outcome; identify the smallest relevant fit from canonical Services; answer the customer's question directly; use canonical market Pricing and configured discount rules whenever commercial terms are requested; suggest a Smart Preview only when real interest makes it useful; treat a Preview as supporting evidence, never as a substitute for verified scope; and escalate custom commercial terms, exceptional discounts, payment or contract questions, complaints, or low-confidence cases to a human. Never claim portfolio proof unless approved evidence is present.$knowledge$
      ),
      true,
      null
    ) returning id into v_process_id;
  end if;

  if v_brand_id is not null or v_process_id is not null then
    insert into public.audit_logs (
      organization_id,
      actor_type,
      actor_id,
      action,
      entity_type,
      entity_id,
      after_data
    ) values (
      v_org_id,
      'SYSTEM',
      null,
      'SEED_AGENT_KNOWLEDGE_BASELINE',
      'knowledge',
      null,
      jsonb_build_object(
        'knowledge_keys', jsonb_build_array(
          'smartvisions_brand_positioning',
          'smartvisions_customer_journey'
        )
      )
    );
  end if;
end $$;