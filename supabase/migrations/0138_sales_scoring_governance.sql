-- 0138: SALES-SCORING governance over canonical public.leads.
--
-- This migration deliberately does not create a second score store. Canonical accepted
-- CRM Lead score truth remains on public.leads.opportunity_score / intent_score /
-- score_reasons. It adds governed fit + engagement dimensions, provenance, explicit
-- manual override, non-authoritative model suggestions and audited/idempotent mutation.
--
-- Existing Production Leads are not rescored or backfilled. New governance fields stay
-- NULL/revision 0 until real evidence is written through the governed contract.

alter table public.leads
  add column if not exists fit_score integer,
  add column if not exists engagement_score integer,
  add column if not exists scoring_source text,
  add column if not exists scoring_policy_version text,
  add column if not exists scoring_evidence jsonb,
  add column if not exists scoring_revision integer not null default 0,
  add column if not exists scoring_updated_at timestamptz,
  add column if not exists scoring_updated_by_user_id uuid,
  add column if not exists manual_score_override integer,
  add column if not exists manual_score_override_reason text,
  add column if not exists manual_score_override_by_user_id uuid,
  add column if not exists manual_score_override_at timestamptz,
  add column if not exists manual_score_override_expires_at timestamptz,
  add column if not exists model_score_suggestion jsonb,
  add column if not exists model_score_suggested_at timestamptz;

alter table public.leads
  add constraint leads_fit_score_check
    check (fit_score is null or fit_score between 0 and 100),
  add constraint leads_engagement_score_check
    check (engagement_score is null or engagement_score between 0 and 100),
  add constraint leads_scoring_revision_check
    check (scoring_revision >= 0),
  add constraint leads_scoring_source_check
    check (
      scoring_source is null
      or scoring_source in (
        'HUNTER_NO_WEBSITE_V1',
        'HUNTER_SERVICE_FIT_V1',
        'CRM_INTENT_V1',
        'CRM_DETERMINISTIC_V1',
        'CRM_ENGAGEMENT_V1'
      )
    ),
  add constraint leads_scoring_policy_version_check
    check (
      scoring_policy_version is null
      or (
        length(scoring_policy_version) between 1 and 80
        and scoring_policy_version ~ '^[A-Za-z0-9._:-]+$'
      )
    ),
  add constraint leads_scoring_evidence_check
    check (
      scoring_evidence is null
      or (
        jsonb_typeof(scoring_evidence)='object'
        and octet_length(scoring_evidence::text) <= 8192
      )
    ),
  add constraint leads_manual_score_override_check
    check (manual_score_override is null or manual_score_override between 0 and 100),
  add constraint leads_manual_score_override_contract_check
    check (
      (
        manual_score_override is null
        and manual_score_override_reason is null
        and manual_score_override_by_user_id is null
        and manual_score_override_at is null
        and manual_score_override_expires_at is null
      )
      or
      (
        manual_score_override is not null
        and nullif(trim(manual_score_override_reason),'') is not null
        and length(trim(manual_score_override_reason)) <= 240
        and manual_score_override_by_user_id is not null
        and manual_score_override_at is not null
        and (
          manual_score_override_expires_at is null
          or manual_score_override_expires_at > manual_score_override_at
        )
      )
    ),
  add constraint leads_model_score_suggestion_contract_check
    check (
      (
        model_score_suggestion is null
        and model_score_suggested_at is null
      )
      or
      (
        model_score_suggestion is not null
        and model_score_suggested_at is not null
        and jsonb_typeof(model_score_suggestion)='object'
        and octet_length(model_score_suggestion::text) <= 8192
      )
    ),
  add constraint leads_scoring_updated_by_user_fk
    foreign key (organization_id, scoring_updated_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  add constraint leads_manual_score_override_by_user_fk
    foreign key (organization_id, manual_score_override_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict;

alter table public.leads
  add constraint leads_score_reasons_governance_check
  check (
    jsonb_typeof(score_reasons)='array'
    and jsonb_array_length(score_reasons) <= 50
    and octet_length(score_reasons::text) <= 16384
  ) not valid;
alter table public.leads validate constraint leads_score_reasons_governance_check;

create index if not exists leads_scoring_updated_by_fk_idx
  on public.leads(organization_id, scoring_updated_by_user_id)
  where scoring_updated_by_user_id is not null;

create index if not exists leads_manual_override_by_fk_idx
  on public.leads(organization_id, manual_score_override_by_user_id)
  where manual_score_override_by_user_id is not null;

create index if not exists leads_manual_override_expiry_idx
  on public.leads(organization_id, manual_score_override_expires_at)
  where manual_score_override is not null;

create unique index if not exists audit_logs_crm_lead_scoring_request_idx
  on public.audit_logs(organization_id, action, entity_id, correlation_id)
  where entity_type='lead'
    and action in (
      'CRM_LEAD_DETERMINISTIC_SCORE_RECORDED',
      'CRM_LEAD_ENGAGEMENT_RECOMPUTED',
      'CRM_LEAD_SCORE_OVERRIDE_SET',
      'CRM_LEAD_SCORE_OVERRIDE_CLEARED',
      'CRM_LEAD_MODEL_SCORE_SUGGESTED'
    )
    and correlation_id is not null;

create or replace function public.crm_lead_effective_opportunity_score(
  p_opportunity_score integer,
  p_manual_override integer,
  p_manual_override_expires_at timestamptz,
  p_as_of timestamptz default now()
)
returns integer
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select case
    when p_manual_override is not null
      and (
        p_manual_override_expires_at is null
        or p_manual_override_expires_at > p_as_of
      )
      then p_manual_override
    else p_opportunity_score
  end;
$$;

create or replace function public.crm_assert_lead_scoring_actor(
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
    raise exception 'CRM Lead scoring mutation requires the trusted server boundary';
  end if;

  select m.role
    into v_role
  from public.organization_members m
  where m.organization_id=p_organization_id
    and m.user_id=p_actor_user_id;

  if v_role is null
     or v_role not in ('OWNER','ADMIN','SALES_MANAGER')
  then
    raise exception 'CRM Lead scoring mutation requires OWNER, ADMIN or SALES_MANAGER';
  end if;

  return v_role;
end;
$$;

create or replace function public.crm_lead_scoring_replay(
  p_organization_id uuid,
  p_action text,
  p_lead_id uuid,
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
  select a.after_data
    into v_after
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action=p_action
    and a.entity_type='lead'
    and a.entity_id=p_lead_id::text
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc
  limit 1;

  if not found then return null; end if;

  if coalesce(v_after->>'request_hash','')<>p_request_hash then
    raise exception 'CRM Lead scoring request key conflict';
  end if;

  return (v_after - 'request_hash') || jsonb_build_object('replayed',true);
end;
$$;

create or replace function public.guard_crm_lead_scoring_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_has_scoring_content boolean;
begin
  if jsonb_typeof(new.score_reasons)<>'array'
     or jsonb_array_length(new.score_reasons)>50
     or octet_length(new.score_reasons::text)>16384
     or exists (
       select 1
       from jsonb_array_elements(new.score_reasons) e
       where jsonb_typeof(e)<>'string'
          or length(e#>>'{}')>500
     )
  then
    raise exception 'CRM Lead scoring reasons are invalid';
  end if;

  if new.scoring_evidence is not null
     and (
       jsonb_typeof(new.scoring_evidence)<>'object'
       or octet_length(new.scoring_evidence::text)>8192
     )
  then
    raise exception 'CRM Lead scoring evidence is invalid';
  end if;

  if tg_op='INSERT' then
    v_has_scoring_content :=
      new.opportunity_score<>0
      or new.intent_score<>0
      or new.score_reasons<>'[]'::jsonb
      or new.fit_score is not null
      or new.engagement_score is not null
      or new.scoring_source is not null
      or new.scoring_policy_version is not null
      or new.scoring_evidence is not null
      or new.scoring_revision<>0;

    if v_has_scoring_content then
      if current_user<>'service_role' then
        raise exception 'Scored CRM Lead creation requires the trusted server boundary';
      end if;
      if new.scoring_source is null
         or new.scoring_policy_version is null
         or new.scoring_evidence is null
         or new.scoring_revision<1
         or new.scoring_updated_at is null
      then
        raise exception 'Scored CRM Lead creation requires provenance';
      end if;
    end if;

    if new.manual_score_override is not null
       or new.model_score_suggestion is not null
    then
      raise exception 'CRM Lead override/model suggestion must use governed mutation functions';
    end if;

    return new;
  end if;

  if
    new.opportunity_score is distinct from old.opportunity_score
    or new.intent_score is distinct from old.intent_score
    or new.score_reasons is distinct from old.score_reasons
    or new.fit_score is distinct from old.fit_score
    or new.engagement_score is distinct from old.engagement_score
    or new.scoring_source is distinct from old.scoring_source
    or new.scoring_policy_version is distinct from old.scoring_policy_version
    or new.scoring_evidence is distinct from old.scoring_evidence
    or new.scoring_revision is distinct from old.scoring_revision
    or new.scoring_updated_at is distinct from old.scoring_updated_at
    or new.scoring_updated_by_user_id is distinct from old.scoring_updated_by_user_id
    or new.manual_score_override is distinct from old.manual_score_override
    or new.manual_score_override_reason is distinct from old.manual_score_override_reason
    or new.manual_score_override_by_user_id is distinct from old.manual_score_override_by_user_id
    or new.manual_score_override_at is distinct from old.manual_score_override_at
    or new.manual_score_override_expires_at is distinct from old.manual_score_override_expires_at
    or new.model_score_suggestion is distinct from old.model_score_suggestion
    or new.model_score_suggested_at is distinct from old.model_score_suggested_at
  then
    if coalesce(current_setting('app.crm_lead_scoring_mutation',true),'')<>'allowed' then
      raise exception 'CRM Lead scoring fields require the governed scoring mutation boundary';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists leads_scoring_governance_guard on public.leads;
create trigger leads_scoring_governance_guard
before insert or update on public.leads
for each row execute function public.guard_crm_lead_scoring_mutation();

create or replace function public.get_crm_lead_scoring(
  p_organization_id uuid,
  p_lead_id uuid
)
returns table(
  lead_id uuid,
  opportunity_score integer,
  effective_score integer,
  fit_score integer,
  intent_score integer,
  engagement_score integer,
  score_reasons jsonb,
  scoring_source text,
  scoring_policy_version text,
  scoring_evidence jsonb,
  scoring_revision integer,
  scoring_updated_at timestamptz,
  scoring_updated_by_user_id uuid,
  manual_score_override integer,
  manual_score_override_reason text,
  manual_score_override_by_user_id uuid,
  manual_score_override_at timestamptz,
  manual_score_override_expires_at timestamptz,
  override_active boolean,
  model_score_suggestion jsonb,
  model_score_suggested_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select
    l.id,
    l.opportunity_score,
    public.crm_lead_effective_opportunity_score(
      l.opportunity_score,
      l.manual_score_override,
      l.manual_score_override_expires_at,
      now()
    ),
    l.fit_score,
    l.intent_score,
    l.engagement_score,
    l.score_reasons,
    l.scoring_source,
    l.scoring_policy_version,
    l.scoring_evidence,
    l.scoring_revision,
    l.scoring_updated_at,
    l.scoring_updated_by_user_id,
    l.manual_score_override,
    l.manual_score_override_reason,
    l.manual_score_override_by_user_id,
    l.manual_score_override_at,
    l.manual_score_override_expires_at,
    (
      l.manual_score_override is not null
      and (
        l.manual_score_override_expires_at is null
        or l.manual_score_override_expires_at>now()
      )
    ),
    l.model_score_suggestion,
    l.model_score_suggested_at
  from public.leads l
  where l.organization_id=p_organization_id
    and l.id=p_lead_id;
$$;

create or replace function public.record_crm_lead_deterministic_score(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_opportunity_score integer,
  p_fit_score integer,
  p_intent_score integer,
  p_engagement_score integer,
  p_score_reasons jsonb,
  p_scoring_source text,
  p_policy_version text,
  p_evidence jsonb,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_result jsonb;
  v_request_hash text;
  v_source text:=upper(trim(coalesce(p_scoring_source,'')));
  v_policy text:=trim(coalesce(p_policy_version,''));
  v_request_key text:=trim(coalesce(p_request_key,''));
begin
  perform public.crm_assert_lead_scoring_actor(p_organization_id,p_actor_user_id);

  if p_opportunity_score is null
     or p_opportunity_score not between 0 and 100
     or p_intent_score is null
     or p_intent_score not between 0 and 100
     or (p_fit_score is not null and p_fit_score not between 0 and 100)
     or (p_engagement_score is not null and p_engagement_score not between 0 and 100)
     or jsonb_typeof(p_score_reasons)<>'array'
     or jsonb_array_length(p_score_reasons)>50
     or octet_length(p_score_reasons::text)>16384
     or exists (
       select 1 from jsonb_array_elements(p_score_reasons) e
       where jsonb_typeof(e)<>'string' or length(e#>>'{}')>500
     )
     or jsonb_typeof(p_evidence)<>'object'
     or octet_length(p_evidence::text)>8192
     or v_source not in (
       'HUNTER_NO_WEBSITE_V1',
       'HUNTER_SERVICE_FIT_V1',
       'CRM_INTENT_V1',
       'CRM_DETERMINISTIC_V1',
       'CRM_ENGAGEMENT_V1'
     )
     or v_policy !~ '^[A-Za-z0-9._:-]{1,80}$'
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
     or p_expected_revision is null
     or p_expected_revision<0
  then
    raise exception 'CRM Lead deterministic scoring payload is invalid';
  end if;

  v_request_hash:=md5(
    concat_ws('|',
      p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
      p_opportunity_score::text,coalesce(p_fit_score::text,''),
      p_intent_score::text,coalesce(p_engagement_score::text,''),
      md5(p_score_reasons::text),v_source,v_policy,md5(p_evidence::text),
      p_expected_revision::text
    )
  );

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_DETERMINISTIC_SCORE_RECORDED',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set opportunity_score=p_opportunity_score,
      fit_score=p_fit_score,
      intent_score=p_intent_score,
      engagement_score=p_engagement_score,
      score_reasons=p_score_reasons,
      scoring_source=v_source,
      scoring_policy_version=v_policy,
      scoring_evidence=p_evidence,
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      model_score_suggestion=null,
      model_score_suggested_at=null,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',public.crm_lead_effective_opportunity_score(
      v_lead.opportunity_score,v_lead.manual_score_override,
      v_lead.manual_score_override_expires_at,now()
    ),
    'fitScore',v_lead.fit_score,
    'intentScore',v_lead.intent_score,
    'engagementScore',v_lead.engagement_score,
    'revision',v_lead.scoring_revision,
    'source',v_lead.scoring_source,
    'policyVersion',v_lead.scoring_policy_version,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_DETERMINISTIC_SCORE_RECORDED','lead',p_lead_id::text,
    jsonb_build_object('revision',p_expected_revision),
    v_result,
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

create or replace function public.recompute_crm_lead_engagement(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_result jsonb;
  v_request_hash text;
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_conversation_count integer:=0;
  v_inbound_conversation_count integer:=0;
  v_read_receipt_count integer:=0;
  v_active_conversation_count integer:=0;
  v_latest_inbound_at timestamptz;
  v_engagement integer:=0;
  v_reasons jsonb:='[]'::jsonb;
  v_engagement_evidence jsonb;
begin
  perform public.crm_assert_lead_scoring_actor(p_organization_id,p_actor_user_id);

  if v_request_key !~ '^[A-Za-z0-9._:-]{1,200}
    raise exception 'CRM Lead engagement recompute payload is invalid';
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    p_expected_revision::text,'CRM_ENGAGEMENT_V1'
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_ENGAGEMENT_RECOMPUTED',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;

  select
    count(*)::integer,
    count(*) filter (where c.last_inbound_at is not null)::integer,
    count(*) filter (
      where c.stage in ('ACTIVE','CLOSING','FOLLOW_UP_DUE','NEEDS_HUMAN','HOT')
    )::integer,
    max(c.last_inbound_at)
  into
    v_conversation_count,
    v_inbound_conversation_count,
    v_active_conversation_count,
    v_latest_inbound_at
  from public.sales_conversations c
  where c.organization_id=p_organization_id
    and c.lead_id=p_lead_id;

  select count(*)::integer
    into v_read_receipt_count
  from public.conversation_messages m
  where m.organization_id=p_organization_id
    and m.lead_id=p_lead_id
    and m.read_at is not null;

  if v_inbound_conversation_count>0 then
    v_engagement:=v_engagement+40;
    v_reasons:=v_reasons||jsonb_build_array('INBOUND_CONVERSATION_EVIDENCE');
  end if;
  if v_lead.status::text in ('REPLIED','INTERESTED','HOT','HUMAN','WON') then
    v_engagement:=v_engagement+30;
    v_reasons:=v_reasons||jsonb_build_array('CRM_STAGE_RESPONSE_EVIDENCE');
  end if;
  if v_read_receipt_count>0 then
    v_engagement:=v_engagement+20;
    v_reasons:=v_reasons||jsonb_build_array('PROVIDER_READ_RECEIPT_EVIDENCE');
  end if;
  if v_active_conversation_count>0 then
    v_engagement:=v_engagement+10;
    v_reasons:=v_reasons||jsonb_build_array('ACTIVE_CONVERSATION_EVIDENCE');
  end if;
  v_engagement:=least(100,greatest(0,v_engagement));

  v_engagement_evidence:=jsonb_build_object(
    'policyVersion','crm-engagement-v1',
    'conversationCount',v_conversation_count,
    'inboundConversationCount',v_inbound_conversation_count,
    'readReceiptCount',v_read_receipt_count,
    'activeConversationCount',v_active_conversation_count,
    'latestInboundAt',v_latest_inbound_at,
    'reasonCodes',v_reasons
  );

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set engagement_score=v_engagement,
      scoring_evidence=coalesce(scoring_evidence,'{}'::jsonb)
        || jsonb_build_object('engagement',v_engagement_evidence),
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',public.crm_lead_effective_opportunity_score(
      v_lead.opportunity_score,v_lead.manual_score_override,
      v_lead.manual_score_override_expires_at,now()
    ),
    'fitScore',v_lead.fit_score,
    'intentScore',v_lead.intent_score,
    'engagementScore',v_lead.engagement_score,
    'revision',v_lead.scoring_revision,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_ENGAGEMENT_RECOMPUTED','lead',p_lead_id::text,
    jsonb_build_object('revision',p_expected_revision),
    v_result || jsonb_build_object(
      'evidenceCounts',jsonb_build_object(
        'conversations',v_conversation_count,
        'inboundConversations',v_inbound_conversation_count,
        'readReceipts',v_read_receipt_count,
        'activeConversations',v_active_conversation_count
      )
    ),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

create or replace function public.set_crm_lead_score_override(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_override_score integer,
  p_reason text,
  p_expires_at timestamptz,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_result jsonb;
  v_reason text:=trim(coalesce(p_reason,''));
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_request_hash text;
begin
  perform public.crm_assert_lead_scoring_actor(p_organization_id,p_actor_user_id);

  if p_override_score is null
     or p_override_score not between 0 and 100
     or length(v_reason) not between 1 and 240
     or (p_expires_at is not null and p_expires_at<=now())
     or p_expected_revision is null
     or p_expected_revision<0
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    p_override_score::text,md5(v_reason),coalesce(p_expires_at::text,''),
    p_expected_revision::text
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_SCORE_OVERRIDE_SET',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set manual_score_override=p_override_score,
      manual_score_override_reason=v_reason,
      manual_score_override_by_user_id=p_actor_user_id,
      manual_score_override_at=now(),
      manual_score_override_expires_at=p_expires_at,
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',public.crm_lead_effective_opportunity_score(
      v_lead.opportunity_score,v_lead.manual_score_override,
      v_lead.manual_score_override_expires_at,now()
    ),
    'overrideScore',v_lead.manual_score_override,
    'overrideExpiresAt',v_lead.manual_score_override_expires_at,
    'revision',v_lead.scoring_revision,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_SCORE_OVERRIDE_SET','lead',p_lead_id::text,
    jsonb_build_object(
      'effectiveScore',public.crm_lead_effective_opportunity_score(
        v_lead.opportunity_score,null,null,now()
      ),
      'revision',p_expected_revision
    ),
    v_result || jsonb_build_object('reason_present',true),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

create or replace function public.clear_crm_lead_score_override(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_reason text,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_result jsonb;
  v_reason text:=trim(coalesce(p_reason,''));
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_request_hash text;
begin
  perform public.crm_assert_lead_scoring_actor(p_organization_id,p_actor_user_id);

  if length(v_reason) not between 1 and 240
     or p_expected_revision is null
     or p_expected_revision<0
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'CRM Lead score override clear payload is invalid';
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    md5(v_reason),p_expected_revision::text
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_SCORE_OVERRIDE_CLEARED',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;
  if v_lead.manual_score_override is null then
    raise exception 'CRM Lead score override is not active';
  end if;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set manual_score_override=null,
      manual_score_override_reason=null,
      manual_score_override_by_user_id=null,
      manual_score_override_at=null,
      manual_score_override_expires_at=null,
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',v_lead.opportunity_score,
    'overrideScore',null,
    'revision',v_lead.scoring_revision,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_SCORE_OVERRIDE_CLEARED','lead',p_lead_id::text,
    jsonb_build_object('overrideWasActive',true,'revision',p_expected_revision),
    v_result || jsonb_build_object('reason_present',true),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

create or replace function public.record_crm_lead_model_score_suggestion(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_suggestion jsonb,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_result jsonb;
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_request_hash text;
  v_key text;
  v_score_key text;
  v_score integer;
begin
  perform public.crm_assert_lead_scoring_actor(p_organization_id,p_actor_user_id);

  if jsonb_typeof(p_suggestion)<>'object'
     or octet_length(p_suggestion::text)>8192
     or p_expected_revision is null
     or p_expected_revision<0
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'CRM Lead model score suggestion payload is invalid';
  end if;

  for v_key in select jsonb_object_keys(p_suggestion) loop
    if v_key not in (
      'opportunityScore','fitScore','intentScore','engagementScore',
      'reasons','provider','model','modelVersion','sourceRunId'
    ) then
      raise exception 'CRM Lead model score suggestion contains unsupported fields';
    end if;
  end loop;

  if nullif(trim(p_suggestion->>'provider'),'') is null
     or length(p_suggestion->>'provider')>80
     or nullif(trim(p_suggestion->>'model'),'') is null
     or length(p_suggestion->>'model')>160
     or nullif(trim(p_suggestion->>'modelVersion'),'') is null
     or length(p_suggestion->>'modelVersion')>80
     or not (
       p_suggestion ? 'opportunityScore'
       or p_suggestion ? 'fitScore'
       or p_suggestion ? 'intentScore'
       or p_suggestion ? 'engagementScore'
     )
  then
    raise exception 'CRM Lead model score suggestion provenance is invalid';
  end if;

  foreach v_score_key in array array[
    'opportunityScore','fitScore','intentScore','engagementScore'
  ] loop
    if p_suggestion ? v_score_key then
      if (p_suggestion->>v_score_key) !~ '^[0-9]{1,3}$' then
        raise exception 'CRM Lead model score suggestion score is invalid';
      end if;
      v_score:=(p_suggestion->>v_score_key)::integer;
      if v_score not between 0 and 100 then
        raise exception 'CRM Lead model score suggestion score is invalid';
      end if;
    end if;
  end loop;

  if p_suggestion ? 'sourceRunId'
     and (
       length(p_suggestion->>'sourceRunId')<1
       or length(p_suggestion->>'sourceRunId')>160
     )
  then
    raise exception 'CRM Lead model score suggestion sourceRunId is invalid';
  end if;

  if p_suggestion ? 'reasons' then
    if jsonb_typeof(p_suggestion->'reasons')<>'array'
       or jsonb_array_length(p_suggestion->'reasons')>20
       or exists (
         select 1 from jsonb_array_elements(p_suggestion->'reasons') e
         where jsonb_typeof(e)<>'string' or length(e#>>'{}')>240
       )
    then
      raise exception 'CRM Lead model score suggestion reasons are invalid';
    end if;
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    md5(p_suggestion::text),p_expected_revision::text
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_MODEL_SCORE_SUGGESTED',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set model_score_suggestion=p_suggestion,
      model_score_suggested_at=now(),
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',public.crm_lead_effective_opportunity_score(
      v_lead.opportunity_score,v_lead.manual_score_override,
      v_lead.manual_score_override_expires_at,now()
    ),
    'revision',v_lead.scoring_revision,
    'suggestionAdvisoryOnly',true,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_MODEL_SCORE_SUGGESTED','lead',p_lead_id::text,
    jsonb_build_object('revision',p_expected_revision),
    v_result || jsonb_build_object(
      'provider',p_suggestion->>'provider',
      'model',p_suggestion->>'model',
      'modelVersion',p_suggestion->>'modelVersion',
      'hasReasons',p_suggestion ? 'reasons'
    ),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

revoke all on function public.crm_lead_effective_opportunity_score(
  integer,integer,timestamptz,timestamptz
) from public,anon;
grant execute on function public.crm_lead_effective_opportunity_score(
  integer,integer,timestamptz,timestamptz
) to authenticated,service_role;

revoke all on function public.get_crm_lead_scoring(uuid,uuid)
  from public,anon,service_role;
grant execute on function public.get_crm_lead_scoring(uuid,uuid)
  to authenticated;

revoke all on function public.crm_assert_lead_scoring_actor(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.crm_assert_lead_scoring_actor(uuid,uuid)
  to service_role;

revoke all on function public.crm_lead_scoring_replay(uuid,text,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.crm_lead_scoring_replay(uuid,text,uuid,text,text)
  to service_role;

revoke all on function public.record_crm_lead_deterministic_score(
  uuid,uuid,uuid,integer,integer,integer,integer,jsonb,text,text,jsonb,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.record_crm_lead_deterministic_score(
  uuid,uuid,uuid,integer,integer,integer,integer,jsonb,text,text,jsonb,integer,text
) to service_role;

revoke all on function public.recompute_crm_lead_engagement(
  uuid,uuid,uuid,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.recompute_crm_lead_engagement(
  uuid,uuid,uuid,integer,text
) to service_role;

revoke all on function public.set_crm_lead_score_override(
  uuid,uuid,uuid,integer,text,timestamptz,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.set_crm_lead_score_override(
  uuid,uuid,uuid,integer,text,timestamptz,integer,text
) to service_role;

revoke all on function public.clear_crm_lead_score_override(
  uuid,uuid,uuid,text,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.clear_crm_lead_score_override(
  uuid,uuid,uuid,text,integer,text
) to service_role;

revoke all on function public.record_crm_lead_model_score_suggestion(
  uuid,uuid,uuid,jsonb,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.record_crm_lead_model_score_suggestion(
  uuid,uuid,uuid,jsonb,integer,text
) to service_role;

revoke all on function public.guard_crm_lead_scoring_mutation()
  from public,anon,authenticated,service_role;

comment on column public.leads.opportunity_score is
  'Canonical deterministic accepted Lead opportunity score (0..100). Model suggestions never overwrite it.';
comment on column public.leads.fit_score is
  'Optional evidence-backed fit dimension (0..100); NULL means not yet measured, not zero.';
comment on column public.leads.engagement_score is
  'Optional deterministic engagement dimension (0..100); NULL means not yet measured.';
comment on column public.leads.manual_score_override is
  'Explicit operator override used only for effective score while active; deterministic base opportunity_score is preserved.';
comment on column public.leads.model_score_suggestion is
  'Non-authoritative bounded model suggestion with provider/model/version provenance; never silently accepted.';

     or p_expected_revision is null
     or p_expected_revision<0 then
    raise exception 'CRM Lead engagement recompute payload is invalid';
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    p_expected_revision::text,'CRM_ENGAGEMENT_V1'
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_ENGAGEMENT_RECOMPUTED',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;

  select
    count(*)::integer,
    count(*) filter (where c.last_inbound_at is not null)::integer,
    count(*) filter (
      where c.stage in ('ACTIVE','CLOSING','FOLLOW_UP_DUE','NEEDS_HUMAN','HOT')
    )::integer,
    max(c.last_inbound_at)
  into
    v_conversation_count,
    v_inbound_conversation_count,
    v_active_conversation_count,
    v_latest_inbound_at
  from public.sales_conversations c
  where c.organization_id=p_organization_id
    and c.lead_id=p_lead_id;

  select count(*)::integer
    into v_read_receipt_count
  from public.conversation_messages m
  where m.organization_id=p_organization_id
    and m.lead_id=p_lead_id
    and m.read_at is not null;

  if v_inbound_conversation_count>0 then
    v_engagement:=v_engagement+40;
    v_reasons:=v_reasons||jsonb_build_array('INBOUND_CONVERSATION_EVIDENCE');
  end if;
  if v_lead.status::text in ('REPLIED','INTERESTED','HOT','HUMAN','WON') then
    v_engagement:=v_engagement+30;
    v_reasons:=v_reasons||jsonb_build_array('CRM_STAGE_RESPONSE_EVIDENCE');
  end if;
  if v_read_receipt_count>0 then
    v_engagement:=v_engagement+20;
    v_reasons:=v_reasons||jsonb_build_array('PROVIDER_READ_RECEIPT_EVIDENCE');
  end if;
  if v_active_conversation_count>0 then
    v_engagement:=v_engagement+10;
    v_reasons:=v_reasons||jsonb_build_array('ACTIVE_CONVERSATION_EVIDENCE');
  end if;
  v_engagement:=least(100,greatest(0,v_engagement));

  v_engagement_evidence:=jsonb_build_object(
    'policyVersion','crm-engagement-v1',
    'conversationCount',v_conversation_count,
    'inboundConversationCount',v_inbound_conversation_count,
    'readReceiptCount',v_read_receipt_count,
    'activeConversationCount',v_active_conversation_count,
    'latestInboundAt',v_latest_inbound_at,
    'reasonCodes',v_reasons
  );

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set engagement_score=v_engagement,
      scoring_evidence=coalesce(scoring_evidence,'{}'::jsonb)
        || jsonb_build_object('engagement',v_engagement_evidence),
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',public.crm_lead_effective_opportunity_score(
      v_lead.opportunity_score,v_lead.manual_score_override,
      v_lead.manual_score_override_expires_at,now()
    ),
    'fitScore',v_lead.fit_score,
    'intentScore',v_lead.intent_score,
    'engagementScore',v_lead.engagement_score,
    'revision',v_lead.scoring_revision,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_ENGAGEMENT_RECOMPUTED','lead',p_lead_id::text,
    jsonb_build_object('revision',p_expected_revision),
    v_result || jsonb_build_object(
      'evidenceCounts',jsonb_build_object(
        'conversations',v_conversation_count,
        'inboundConversations',v_inbound_conversation_count,
        'readReceipts',v_read_receipt_count,
        'activeConversations',v_active_conversation_count
      )
    ),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

create or replace function public.set_crm_lead_score_override(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_override_score integer,
  p_reason text,
  p_expires_at timestamptz,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_result jsonb;
  v_reason text:=trim(coalesce(p_reason,''));
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_request_hash text;
begin
  perform public.crm_assert_lead_scoring_actor(p_organization_id,p_actor_user_id);

  if p_override_score not between 0 and 100
     or length(v_reason) not between 1 and 240
     or (p_expires_at is not null and p_expires_at<=now())
     or p_expected_revision<0
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'CRM Lead score override payload is invalid';
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    p_override_score::text,md5(v_reason),coalesce(p_expires_at::text,''),
    p_expected_revision::text
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_SCORE_OVERRIDE_SET',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set manual_score_override=p_override_score,
      manual_score_override_reason=v_reason,
      manual_score_override_by_user_id=p_actor_user_id,
      manual_score_override_at=now(),
      manual_score_override_expires_at=p_expires_at,
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',public.crm_lead_effective_opportunity_score(
      v_lead.opportunity_score,v_lead.manual_score_override,
      v_lead.manual_score_override_expires_at,now()
    ),
    'overrideScore',v_lead.manual_score_override,
    'overrideExpiresAt',v_lead.manual_score_override_expires_at,
    'revision',v_lead.scoring_revision,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_SCORE_OVERRIDE_SET','lead',p_lead_id::text,
    jsonb_build_object(
      'effectiveScore',public.crm_lead_effective_opportunity_score(
        v_lead.opportunity_score,null,null,now()
      ),
      'revision',p_expected_revision
    ),
    v_result || jsonb_build_object('reason_present',true),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

create or replace function public.clear_crm_lead_score_override(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_reason text,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_result jsonb;
  v_reason text:=trim(coalesce(p_reason,''));
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_request_hash text;
begin
  perform public.crm_assert_lead_scoring_actor(p_organization_id,p_actor_user_id);

  if length(v_reason) not between 1 and 240
     or p_expected_revision<0
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'CRM Lead score override clear payload is invalid';
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    md5(v_reason),p_expected_revision::text
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_SCORE_OVERRIDE_CLEARED',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;
  if v_lead.manual_score_override is null then
    raise exception 'CRM Lead score override is not active';
  end if;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set manual_score_override=null,
      manual_score_override_reason=null,
      manual_score_override_by_user_id=null,
      manual_score_override_at=null,
      manual_score_override_expires_at=null,
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',v_lead.opportunity_score,
    'overrideScore',null,
    'revision',v_lead.scoring_revision,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_SCORE_OVERRIDE_CLEARED','lead',p_lead_id::text,
    jsonb_build_object('overrideWasActive',true,'revision',p_expected_revision),
    v_result || jsonb_build_object('reason_present',true),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

create or replace function public.record_crm_lead_model_score_suggestion(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_suggestion jsonb,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_result jsonb;
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_request_hash text;
  v_key text;
  v_score_key text;
  v_score integer;
begin
  perform public.crm_assert_lead_scoring_actor(p_organization_id,p_actor_user_id);

  if jsonb_typeof(p_suggestion)<>'object'
     or octet_length(p_suggestion::text)>8192
     or p_expected_revision<0
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'CRM Lead model score suggestion payload is invalid';
  end if;

  for v_key in select jsonb_object_keys(p_suggestion) loop
    if v_key not in (
      'opportunityScore','fitScore','intentScore','engagementScore',
      'reasons','provider','model','modelVersion','sourceRunId'
    ) then
      raise exception 'CRM Lead model score suggestion contains unsupported fields';
    end if;
  end loop;

  if nullif(trim(p_suggestion->>'provider'),'') is null
     or length(p_suggestion->>'provider')>80
     or nullif(trim(p_suggestion->>'model'),'') is null
     or length(p_suggestion->>'model')>160
     or nullif(trim(p_suggestion->>'modelVersion'),'') is null
     or length(p_suggestion->>'modelVersion')>80
     or not (
       p_suggestion ? 'opportunityScore'
       or p_suggestion ? 'fitScore'
       or p_suggestion ? 'intentScore'
       or p_suggestion ? 'engagementScore'
     )
  then
    raise exception 'CRM Lead model score suggestion provenance is invalid';
  end if;

  foreach v_score_key in array array[
    'opportunityScore','fitScore','intentScore','engagementScore'
  ] loop
    if p_suggestion ? v_score_key then
      if (p_suggestion->>v_score_key) !~ '^[0-9]{1,3}$' then
        raise exception 'CRM Lead model score suggestion score is invalid';
      end if;
      v_score:=(p_suggestion->>v_score_key)::integer;
      if v_score not between 0 and 100 then
        raise exception 'CRM Lead model score suggestion score is invalid';
      end if;
    end if;
  end loop;

  if p_suggestion ? 'sourceRunId'
     and (
       length(p_suggestion->>'sourceRunId')<1
       or length(p_suggestion->>'sourceRunId')>160
     )
  then
    raise exception 'CRM Lead model score suggestion sourceRunId is invalid';
  end if;

  if p_suggestion ? 'reasons' then
    if jsonb_typeof(p_suggestion->'reasons')<>'array'
       or jsonb_array_length(p_suggestion->'reasons')>20
       or exists (
         select 1 from jsonb_array_elements(p_suggestion->'reasons') e
         where jsonb_typeof(e)<>'string' or length(e#>>'{}')>240
       )
    then
      raise exception 'CRM Lead model score suggestion reasons are invalid';
    end if;
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    md5(p_suggestion::text),p_expected_revision::text
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_MODEL_SCORE_SUGGESTED',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set model_score_suggestion=p_suggestion,
      model_score_suggested_at=now(),
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',public.crm_lead_effective_opportunity_score(
      v_lead.opportunity_score,v_lead.manual_score_override,
      v_lead.manual_score_override_expires_at,now()
    ),
    'revision',v_lead.scoring_revision,
    'suggestionAdvisoryOnly',true,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_MODEL_SCORE_SUGGESTED','lead',p_lead_id::text,
    jsonb_build_object('revision',p_expected_revision),
    v_result || jsonb_build_object(
      'provider',p_suggestion->>'provider',
      'model',p_suggestion->>'model',
      'modelVersion',p_suggestion->>'modelVersion',
      'hasReasons',p_suggestion ? 'reasons'
    ),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

revoke all on function public.crm_lead_effective_opportunity_score(
  integer,integer,timestamptz,timestamptz
) from public,anon;
grant execute on function public.crm_lead_effective_opportunity_score(
  integer,integer,timestamptz,timestamptz
) to authenticated,service_role;

revoke all on function public.get_crm_lead_scoring(uuid,uuid)
  from public,anon,service_role;
grant execute on function public.get_crm_lead_scoring(uuid,uuid)
  to authenticated;

revoke all on function public.crm_assert_lead_scoring_actor(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.crm_assert_lead_scoring_actor(uuid,uuid)
  to service_role;

revoke all on function public.crm_lead_scoring_replay(uuid,text,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.crm_lead_scoring_replay(uuid,text,uuid,text,text)
  to service_role;

revoke all on function public.record_crm_lead_deterministic_score(
  uuid,uuid,uuid,integer,integer,integer,integer,jsonb,text,text,jsonb,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.record_crm_lead_deterministic_score(
  uuid,uuid,uuid,integer,integer,integer,integer,jsonb,text,text,jsonb,integer,text
) to service_role;

revoke all on function public.recompute_crm_lead_engagement(
  uuid,uuid,uuid,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.recompute_crm_lead_engagement(
  uuid,uuid,uuid,integer,text
) to service_role;

revoke all on function public.set_crm_lead_score_override(
  uuid,uuid,uuid,integer,text,timestamptz,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.set_crm_lead_score_override(
  uuid,uuid,uuid,integer,text,timestamptz,integer,text
) to service_role;

revoke all on function public.clear_crm_lead_score_override(
  uuid,uuid,uuid,text,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.clear_crm_lead_score_override(
  uuid,uuid,uuid,text,integer,text
) to service_role;

revoke all on function public.record_crm_lead_model_score_suggestion(
  uuid,uuid,uuid,jsonb,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.record_crm_lead_model_score_suggestion(
  uuid,uuid,uuid,jsonb,integer,text
) to service_role;

revoke all on function public.guard_crm_lead_scoring_mutation()
  from public,anon,authenticated,service_role;

comment on column public.leads.opportunity_score is
  'Canonical deterministic accepted Lead opportunity score (0..100). Model suggestions never overwrite it.';
comment on column public.leads.fit_score is
  'Optional evidence-backed fit dimension (0..100); NULL means not yet measured, not zero.';
comment on column public.leads.engagement_score is
  'Optional deterministic engagement dimension (0..100); NULL means not yet measured.';
comment on column public.leads.manual_score_override is
  'Explicit operator override used only for effective score while active; deterministic base opportunity_score is preserved.';
comment on column public.leads.model_score_suggestion is
  'Non-authoritative bounded model suggestion with provider/model/version provenance; never silently accepted.';

  then
    raise exception 'CRM Lead score override payload is invalid';
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    p_override_score::text,md5(v_reason),coalesce(p_expires_at::text,''),
    p_expected_revision::text
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_SCORE_OVERRIDE_SET',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set manual_score_override=p_override_score,
      manual_score_override_reason=v_reason,
      manual_score_override_by_user_id=p_actor_user_id,
      manual_score_override_at=now(),
      manual_score_override_expires_at=p_expires_at,
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',public.crm_lead_effective_opportunity_score(
      v_lead.opportunity_score,v_lead.manual_score_override,
      v_lead.manual_score_override_expires_at,now()
    ),
    'overrideScore',v_lead.manual_score_override,
    'overrideExpiresAt',v_lead.manual_score_override_expires_at,
    'revision',v_lead.scoring_revision,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_SCORE_OVERRIDE_SET','lead',p_lead_id::text,
    jsonb_build_object(
      'effectiveScore',public.crm_lead_effective_opportunity_score(
        v_lead.opportunity_score,null,null,now()
      ),
      'revision',p_expected_revision
    ),
    v_result || jsonb_build_object('reason_present',true),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

create or replace function public.clear_crm_lead_score_override(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_reason text,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_result jsonb;
  v_reason text:=trim(coalesce(p_reason,''));
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_request_hash text;
begin
  perform public.crm_assert_lead_scoring_actor(p_organization_id,p_actor_user_id);

  if length(v_reason) not between 1 and 240
     or p_expected_revision<0
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'CRM Lead score override clear payload is invalid';
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    md5(v_reason),p_expected_revision::text
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_SCORE_OVERRIDE_CLEARED',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;
  if v_lead.manual_score_override is null then
    raise exception 'CRM Lead score override is not active';
  end if;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set manual_score_override=null,
      manual_score_override_reason=null,
      manual_score_override_by_user_id=null,
      manual_score_override_at=null,
      manual_score_override_expires_at=null,
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',v_lead.opportunity_score,
    'overrideScore',null,
    'revision',v_lead.scoring_revision,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_SCORE_OVERRIDE_CLEARED','lead',p_lead_id::text,
    jsonb_build_object('overrideWasActive',true,'revision',p_expected_revision),
    v_result || jsonb_build_object('reason_present',true),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

create or replace function public.record_crm_lead_model_score_suggestion(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_suggestion jsonb,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_result jsonb;
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_request_hash text;
  v_key text;
  v_score_key text;
  v_score integer;
begin
  perform public.crm_assert_lead_scoring_actor(p_organization_id,p_actor_user_id);

  if jsonb_typeof(p_suggestion)<>'object'
     or octet_length(p_suggestion::text)>8192
     or p_expected_revision<0
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'CRM Lead model score suggestion payload is invalid';
  end if;

  for v_key in select jsonb_object_keys(p_suggestion) loop
    if v_key not in (
      'opportunityScore','fitScore','intentScore','engagementScore',
      'reasons','provider','model','modelVersion','sourceRunId'
    ) then
      raise exception 'CRM Lead model score suggestion contains unsupported fields';
    end if;
  end loop;

  if nullif(trim(p_suggestion->>'provider'),'') is null
     or length(p_suggestion->>'provider')>80
     or nullif(trim(p_suggestion->>'model'),'') is null
     or length(p_suggestion->>'model')>160
     or nullif(trim(p_suggestion->>'modelVersion'),'') is null
     or length(p_suggestion->>'modelVersion')>80
     or not (
       p_suggestion ? 'opportunityScore'
       or p_suggestion ? 'fitScore'
       or p_suggestion ? 'intentScore'
       or p_suggestion ? 'engagementScore'
     )
  then
    raise exception 'CRM Lead model score suggestion provenance is invalid';
  end if;

  foreach v_score_key in array array[
    'opportunityScore','fitScore','intentScore','engagementScore'
  ] loop
    if p_suggestion ? v_score_key then
      if (p_suggestion->>v_score_key) !~ '^[0-9]{1,3}$' then
        raise exception 'CRM Lead model score suggestion score is invalid';
      end if;
      v_score:=(p_suggestion->>v_score_key)::integer;
      if v_score not between 0 and 100 then
        raise exception 'CRM Lead model score suggestion score is invalid';
      end if;
    end if;
  end loop;

  if p_suggestion ? 'sourceRunId'
     and (
       length(p_suggestion->>'sourceRunId')<1
       or length(p_suggestion->>'sourceRunId')>160
     )
  then
    raise exception 'CRM Lead model score suggestion sourceRunId is invalid';
  end if;

  if p_suggestion ? 'reasons' then
    if jsonb_typeof(p_suggestion->'reasons')<>'array'
       or jsonb_array_length(p_suggestion->'reasons')>20
       or exists (
         select 1 from jsonb_array_elements(p_suggestion->'reasons') e
         where jsonb_typeof(e)<>'string' or length(e#>>'{}')>240
       )
    then
      raise exception 'CRM Lead model score suggestion reasons are invalid';
    end if;
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    md5(p_suggestion::text),p_expected_revision::text
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_MODEL_SCORE_SUGGESTED',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set model_score_suggestion=p_suggestion,
      model_score_suggested_at=now(),
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',public.crm_lead_effective_opportunity_score(
      v_lead.opportunity_score,v_lead.manual_score_override,
      v_lead.manual_score_override_expires_at,now()
    ),
    'revision',v_lead.scoring_revision,
    'suggestionAdvisoryOnly',true,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_MODEL_SCORE_SUGGESTED','lead',p_lead_id::text,
    jsonb_build_object('revision',p_expected_revision),
    v_result || jsonb_build_object(
      'provider',p_suggestion->>'provider',
      'model',p_suggestion->>'model',
      'modelVersion',p_suggestion->>'modelVersion',
      'hasReasons',p_suggestion ? 'reasons'
    ),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

revoke all on function public.crm_lead_effective_opportunity_score(
  integer,integer,timestamptz,timestamptz
) from public,anon;
grant execute on function public.crm_lead_effective_opportunity_score(
  integer,integer,timestamptz,timestamptz
) to authenticated,service_role;

revoke all on function public.get_crm_lead_scoring(uuid,uuid)
  from public,anon,service_role;
grant execute on function public.get_crm_lead_scoring(uuid,uuid)
  to authenticated;

revoke all on function public.crm_assert_lead_scoring_actor(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.crm_assert_lead_scoring_actor(uuid,uuid)
  to service_role;

revoke all on function public.crm_lead_scoring_replay(uuid,text,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.crm_lead_scoring_replay(uuid,text,uuid,text,text)
  to service_role;

revoke all on function public.record_crm_lead_deterministic_score(
  uuid,uuid,uuid,integer,integer,integer,integer,jsonb,text,text,jsonb,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.record_crm_lead_deterministic_score(
  uuid,uuid,uuid,integer,integer,integer,integer,jsonb,text,text,jsonb,integer,text
) to service_role;

revoke all on function public.recompute_crm_lead_engagement(
  uuid,uuid,uuid,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.recompute_crm_lead_engagement(
  uuid,uuid,uuid,integer,text
) to service_role;

revoke all on function public.set_crm_lead_score_override(
  uuid,uuid,uuid,integer,text,timestamptz,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.set_crm_lead_score_override(
  uuid,uuid,uuid,integer,text,timestamptz,integer,text
) to service_role;

revoke all on function public.clear_crm_lead_score_override(
  uuid,uuid,uuid,text,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.clear_crm_lead_score_override(
  uuid,uuid,uuid,text,integer,text
) to service_role;

revoke all on function public.record_crm_lead_model_score_suggestion(
  uuid,uuid,uuid,jsonb,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.record_crm_lead_model_score_suggestion(
  uuid,uuid,uuid,jsonb,integer,text
) to service_role;

revoke all on function public.guard_crm_lead_scoring_mutation()
  from public,anon,authenticated,service_role;

comment on column public.leads.opportunity_score is
  'Canonical deterministic accepted Lead opportunity score (0..100). Model suggestions never overwrite it.';
comment on column public.leads.fit_score is
  'Optional evidence-backed fit dimension (0..100); NULL means not yet measured, not zero.';
comment on column public.leads.engagement_score is
  'Optional deterministic engagement dimension (0..100); NULL means not yet measured.';
comment on column public.leads.manual_score_override is
  'Explicit operator override used only for effective score while active; deterministic base opportunity_score is preserved.';
comment on column public.leads.model_score_suggestion is
  'Non-authoritative bounded model suggestion with provider/model/version provenance; never silently accepted.';

     or p_expected_revision is null
     or p_expected_revision<0 then
    raise exception 'CRM Lead engagement recompute payload is invalid';
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    p_expected_revision::text,'CRM_ENGAGEMENT_V1'
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_ENGAGEMENT_RECOMPUTED',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;

  select
    count(*)::integer,
    count(*) filter (where c.last_inbound_at is not null)::integer,
    count(*) filter (
      where c.stage in ('ACTIVE','CLOSING','FOLLOW_UP_DUE','NEEDS_HUMAN','HOT')
    )::integer,
    max(c.last_inbound_at)
  into
    v_conversation_count,
    v_inbound_conversation_count,
    v_active_conversation_count,
    v_latest_inbound_at
  from public.sales_conversations c
  where c.organization_id=p_organization_id
    and c.lead_id=p_lead_id;

  select count(*)::integer
    into v_read_receipt_count
  from public.conversation_messages m
  where m.organization_id=p_organization_id
    and m.lead_id=p_lead_id
    and m.read_at is not null;

  if v_inbound_conversation_count>0 then
    v_engagement:=v_engagement+40;
    v_reasons:=v_reasons||jsonb_build_array('INBOUND_CONVERSATION_EVIDENCE');
  end if;
  if v_lead.status::text in ('REPLIED','INTERESTED','HOT','HUMAN','WON') then
    v_engagement:=v_engagement+30;
    v_reasons:=v_reasons||jsonb_build_array('CRM_STAGE_RESPONSE_EVIDENCE');
  end if;
  if v_read_receipt_count>0 then
    v_engagement:=v_engagement+20;
    v_reasons:=v_reasons||jsonb_build_array('PROVIDER_READ_RECEIPT_EVIDENCE');
  end if;
  if v_active_conversation_count>0 then
    v_engagement:=v_engagement+10;
    v_reasons:=v_reasons||jsonb_build_array('ACTIVE_CONVERSATION_EVIDENCE');
  end if;
  v_engagement:=least(100,greatest(0,v_engagement));

  v_engagement_evidence:=jsonb_build_object(
    'policyVersion','crm-engagement-v1',
    'conversationCount',v_conversation_count,
    'inboundConversationCount',v_inbound_conversation_count,
    'readReceiptCount',v_read_receipt_count,
    'activeConversationCount',v_active_conversation_count,
    'latestInboundAt',v_latest_inbound_at,
    'reasonCodes',v_reasons
  );

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set engagement_score=v_engagement,
      scoring_evidence=coalesce(scoring_evidence,'{}'::jsonb)
        || jsonb_build_object('engagement',v_engagement_evidence),
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',public.crm_lead_effective_opportunity_score(
      v_lead.opportunity_score,v_lead.manual_score_override,
      v_lead.manual_score_override_expires_at,now()
    ),
    'fitScore',v_lead.fit_score,
    'intentScore',v_lead.intent_score,
    'engagementScore',v_lead.engagement_score,
    'revision',v_lead.scoring_revision,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_ENGAGEMENT_RECOMPUTED','lead',p_lead_id::text,
    jsonb_build_object('revision',p_expected_revision),
    v_result || jsonb_build_object(
      'evidenceCounts',jsonb_build_object(
        'conversations',v_conversation_count,
        'inboundConversations',v_inbound_conversation_count,
        'readReceipts',v_read_receipt_count,
        'activeConversations',v_active_conversation_count
      )
    ),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

create or replace function public.set_crm_lead_score_override(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_override_score integer,
  p_reason text,
  p_expires_at timestamptz,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_result jsonb;
  v_reason text:=trim(coalesce(p_reason,''));
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_request_hash text;
begin
  perform public.crm_assert_lead_scoring_actor(p_organization_id,p_actor_user_id);

  if p_override_score not between 0 and 100
     or length(v_reason) not between 1 and 240
     or (p_expires_at is not null and p_expires_at<=now())
     or p_expected_revision<0
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'CRM Lead score override payload is invalid';
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    p_override_score::text,md5(v_reason),coalesce(p_expires_at::text,''),
    p_expected_revision::text
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_SCORE_OVERRIDE_SET',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set manual_score_override=p_override_score,
      manual_score_override_reason=v_reason,
      manual_score_override_by_user_id=p_actor_user_id,
      manual_score_override_at=now(),
      manual_score_override_expires_at=p_expires_at,
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',public.crm_lead_effective_opportunity_score(
      v_lead.opportunity_score,v_lead.manual_score_override,
      v_lead.manual_score_override_expires_at,now()
    ),
    'overrideScore',v_lead.manual_score_override,
    'overrideExpiresAt',v_lead.manual_score_override_expires_at,
    'revision',v_lead.scoring_revision,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_SCORE_OVERRIDE_SET','lead',p_lead_id::text,
    jsonb_build_object(
      'effectiveScore',public.crm_lead_effective_opportunity_score(
        v_lead.opportunity_score,null,null,now()
      ),
      'revision',p_expected_revision
    ),
    v_result || jsonb_build_object('reason_present',true),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

create or replace function public.clear_crm_lead_score_override(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_reason text,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_result jsonb;
  v_reason text:=trim(coalesce(p_reason,''));
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_request_hash text;
begin
  perform public.crm_assert_lead_scoring_actor(p_organization_id,p_actor_user_id);

  if length(v_reason) not between 1 and 240
     or p_expected_revision<0
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'CRM Lead score override clear payload is invalid';
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    md5(v_reason),p_expected_revision::text
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_SCORE_OVERRIDE_CLEARED',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;
  if v_lead.manual_score_override is null then
    raise exception 'CRM Lead score override is not active';
  end if;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set manual_score_override=null,
      manual_score_override_reason=null,
      manual_score_override_by_user_id=null,
      manual_score_override_at=null,
      manual_score_override_expires_at=null,
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',v_lead.opportunity_score,
    'overrideScore',null,
    'revision',v_lead.scoring_revision,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_SCORE_OVERRIDE_CLEARED','lead',p_lead_id::text,
    jsonb_build_object('overrideWasActive',true,'revision',p_expected_revision),
    v_result || jsonb_build_object('reason_present',true),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

create or replace function public.record_crm_lead_model_score_suggestion(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_suggestion jsonb,
  p_expected_revision integer,
  p_request_key text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_lead public.leads%rowtype;
  v_result jsonb;
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_request_hash text;
  v_key text;
  v_score_key text;
  v_score integer;
begin
  perform public.crm_assert_lead_scoring_actor(p_organization_id,p_actor_user_id);

  if jsonb_typeof(p_suggestion)<>'object'
     or octet_length(p_suggestion::text)>8192
     or p_expected_revision<0
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'CRM Lead model score suggestion payload is invalid';
  end if;

  for v_key in select jsonb_object_keys(p_suggestion) loop
    if v_key not in (
      'opportunityScore','fitScore','intentScore','engagementScore',
      'reasons','provider','model','modelVersion','sourceRunId'
    ) then
      raise exception 'CRM Lead model score suggestion contains unsupported fields';
    end if;
  end loop;

  if nullif(trim(p_suggestion->>'provider'),'') is null
     or length(p_suggestion->>'provider')>80
     or nullif(trim(p_suggestion->>'model'),'') is null
     or length(p_suggestion->>'model')>160
     or nullif(trim(p_suggestion->>'modelVersion'),'') is null
     or length(p_suggestion->>'modelVersion')>80
     or not (
       p_suggestion ? 'opportunityScore'
       or p_suggestion ? 'fitScore'
       or p_suggestion ? 'intentScore'
       or p_suggestion ? 'engagementScore'
     )
  then
    raise exception 'CRM Lead model score suggestion provenance is invalid';
  end if;

  foreach v_score_key in array array[
    'opportunityScore','fitScore','intentScore','engagementScore'
  ] loop
    if p_suggestion ? v_score_key then
      if (p_suggestion->>v_score_key) !~ '^[0-9]{1,3}$' then
        raise exception 'CRM Lead model score suggestion score is invalid';
      end if;
      v_score:=(p_suggestion->>v_score_key)::integer;
      if v_score not between 0 and 100 then
        raise exception 'CRM Lead model score suggestion score is invalid';
      end if;
    end if;
  end loop;

  if p_suggestion ? 'sourceRunId'
     and (
       length(p_suggestion->>'sourceRunId')<1
       or length(p_suggestion->>'sourceRunId')>160
     )
  then
    raise exception 'CRM Lead model score suggestion sourceRunId is invalid';
  end if;

  if p_suggestion ? 'reasons' then
    if jsonb_typeof(p_suggestion->'reasons')<>'array'
       or jsonb_array_length(p_suggestion->'reasons')>20
       or exists (
         select 1 from jsonb_array_elements(p_suggestion->'reasons') e
         where jsonb_typeof(e)<>'string' or length(e#>>'{}')>240
       )
    then
      raise exception 'CRM Lead model score suggestion reasons are invalid';
    end if;
  end if;

  v_request_hash:=md5(concat_ws('|',
    p_organization_id::text,p_actor_user_id::text,p_lead_id::text,
    md5(p_suggestion::text),p_expected_revision::text
  ));

  v_result:=public.crm_lead_scoring_replay(
    p_organization_id,'CRM_LEAD_MODEL_SCORE_SUGGESTED',
    p_lead_id,v_request_key,v_request_hash
  );
  if v_result is not null then return v_result; end if;

  select * into v_lead
  from public.leads l
  where l.organization_id=p_organization_id and l.id=p_lead_id
  for update;
  if not found then raise exception 'CRM Lead scoring target was not found'; end if;
  if v_lead.scoring_revision<>p_expected_revision then
    raise exception 'CRM Lead scoring version conflict';
  end if;

  perform set_config('app.crm_lead_scoring_mutation','allowed',true);

  update public.leads
  set model_score_suggestion=p_suggestion,
      model_score_suggested_at=now(),
      scoring_revision=scoring_revision+1,
      scoring_updated_at=now(),
      scoring_updated_by_user_id=p_actor_user_id,
      updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id
  returning * into v_lead;

  v_result:=jsonb_build_object(
    'leadId',v_lead.id,
    'opportunityScore',v_lead.opportunity_score,
    'effectiveScore',public.crm_lead_effective_opportunity_score(
      v_lead.opportunity_score,v_lead.manual_score_override,
      v_lead.manual_score_override_expires_at,now()
    ),
    'revision',v_lead.scoring_revision,
    'suggestionAdvisoryOnly',true,
    'request_hash',v_request_hash,
    'replayed',false
  );

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    before_data,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'CRM_LEAD_MODEL_SCORE_SUGGESTED','lead',p_lead_id::text,
    jsonb_build_object('revision',p_expected_revision),
    v_result || jsonb_build_object(
      'provider',p_suggestion->>'provider',
      'model',p_suggestion->>'model',
      'modelVersion',p_suggestion->>'modelVersion',
      'hasReasons',p_suggestion ? 'reasons'
    ),
    v_request_key
  );

  return v_result - 'request_hash';
end;
$$;

revoke all on function public.crm_lead_effective_opportunity_score(
  integer,integer,timestamptz,timestamptz
) from public,anon;
grant execute on function public.crm_lead_effective_opportunity_score(
  integer,integer,timestamptz,timestamptz
) to authenticated,service_role;

revoke all on function public.get_crm_lead_scoring(uuid,uuid)
  from public,anon,service_role;
grant execute on function public.get_crm_lead_scoring(uuid,uuid)
  to authenticated;

revoke all on function public.crm_assert_lead_scoring_actor(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.crm_assert_lead_scoring_actor(uuid,uuid)
  to service_role;

revoke all on function public.crm_lead_scoring_replay(uuid,text,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.crm_lead_scoring_replay(uuid,text,uuid,text,text)
  to service_role;

revoke all on function public.record_crm_lead_deterministic_score(
  uuid,uuid,uuid,integer,integer,integer,integer,jsonb,text,text,jsonb,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.record_crm_lead_deterministic_score(
  uuid,uuid,uuid,integer,integer,integer,integer,jsonb,text,text,jsonb,integer,text
) to service_role;

revoke all on function public.recompute_crm_lead_engagement(
  uuid,uuid,uuid,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.recompute_crm_lead_engagement(
  uuid,uuid,uuid,integer,text
) to service_role;

revoke all on function public.set_crm_lead_score_override(
  uuid,uuid,uuid,integer,text,timestamptz,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.set_crm_lead_score_override(
  uuid,uuid,uuid,integer,text,timestamptz,integer,text
) to service_role;

revoke all on function public.clear_crm_lead_score_override(
  uuid,uuid,uuid,text,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.clear_crm_lead_score_override(
  uuid,uuid,uuid,text,integer,text
) to service_role;

revoke all on function public.record_crm_lead_model_score_suggestion(
  uuid,uuid,uuid,jsonb,integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.record_crm_lead_model_score_suggestion(
  uuid,uuid,uuid,jsonb,integer,text
) to service_role;

revoke all on function public.guard_crm_lead_scoring_mutation()
  from public,anon,authenticated,service_role;

comment on column public.leads.opportunity_score is
  'Canonical deterministic accepted Lead opportunity score (0..100). Model suggestions never overwrite it.';
comment on column public.leads.fit_score is
  'Optional evidence-backed fit dimension (0..100); NULL means not yet measured, not zero.';
comment on column public.leads.engagement_score is
  'Optional deterministic engagement dimension (0..100); NULL means not yet measured.';
comment on column public.leads.manual_score_override is
  'Explicit operator override used only for effective score while active; deterministic base opportunity_score is preserved.';
comment on column public.leads.model_score_suggestion is
  'Non-authoritative bounded model suggestion with provider/model/version provenance; never silently accepted.';
