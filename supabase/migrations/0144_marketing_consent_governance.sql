-- 0144: MARKETING-CONSENT governance on the existing canonical evidence/suppression plane.
--
-- Canonical permission evidence stays in public.lead_sources. This migration does not
-- create a second Consent or suppression store. public.suppression_list remains the
-- canonical DNC/suppression authority; Marketing permission events are append-only
-- evidence and are consulted by the canonical send gate.
--
-- No provider send, Campaign transition, Segment mutation or Production fixture is
-- created by this migration.

alter table public.lead_sources
  add column if not exists permission_channel text,
  add column if not exists permission_purpose text,
  add column if not exists permission_action text,
  add column if not exists permission_recipient text,
  add column if not exists legal_basis text,
  add column if not exists preference_center_managed boolean,
  add column if not exists consent_request_key text,
  add column if not exists recorded_by_user_id uuid;

alter table public.lead_sources
  add constraint lead_sources_marketing_permission_shape_check
    check (
      field_name <> 'marketing_permission'
      or (
        permission_channel in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','TELEGRAM')
        and permission_purpose = 'MARKETING'
        and permission_action in ('GRANT','REVOKE')
        and length(permission_recipient) between 3 and 500
        and legal_basis in (
          'EXPLICIT_CONSENT',
          'EXISTING_CUSTOMER',
          'LEGITIMATE_INTEREST',
          'LEGAL_REQUIREMENT',
          'WITHDRAWAL',
          'OTHER_DOCUMENTED_BASIS'
        )
        and preference_center_managed is not null
        and consent_request_key ~ '^[A-Za-z0-9._:-]{1,200}$'
        and source_url is not null
        and length(trim(source_url)) between 1 and 500
        and verified_at is not null
      )
    ),
  add constraint lead_sources_marketing_permission_auxiliary_check
    check (
      field_name = 'marketing_permission'
      or (
        permission_channel is null
        and permission_purpose is null
        and permission_action is null
        and permission_recipient is null
        and legal_basis is null
        and preference_center_managed is null
        and consent_request_key is null
        and recorded_by_user_id is null
      )
    ),
  add constraint lead_sources_marketing_permission_actor_fkey
    foreign key (organization_id,recorded_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict;

create unique index if not exists lead_sources_marketing_consent_request_key_unique
  on public.lead_sources(organization_id,consent_request_key)
  where field_name='marketing_permission' and consent_request_key is not null;

create index if not exists lead_sources_marketing_permission_lookup_idx
  on public.lead_sources(
    organization_id,
    lead_id,
    permission_channel,
    permission_purpose,
    permission_recipient,
    retrieved_at desc,
    id desc
  )
  where field_name='marketing_permission';

create index if not exists lead_sources_marketing_permission_actor_idx
  on public.lead_sources(organization_id,recorded_by_user_id)
  where field_name='marketing_permission' and recorded_by_user_id is not null;

create or replace function public.normalize_marketing_permission_recipient(
  p_channel text,
  p_recipient text
)
returns text
language sql
immutable
security invoker
set search_path=pg_catalog
as $$
  select case upper(trim(coalesce(p_channel,'')))
    when 'EMAIL' then lower(trim(coalesce(p_recipient,'')))
    when 'WHATSAPP' then regexp_replace(coalesce(p_recipient,''),'[^0-9]','','g')
    else trim(coalesce(p_recipient,''))
  end;
$$;

create or replace function public.guard_marketing_permission_evidence()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if tg_op='INSERT' then
    if new.field_name='marketing_permission' and current_user<>'service_role' then
      raise exception 'MARKETING permission evidence requires the trusted server boundary';
    end if;
    return new;
  end if;

  if tg_op='UPDATE' then
    if old.field_name='marketing_permission' or new.field_name='marketing_permission' then
      raise exception 'MARKETING permission evidence is append-only';
    end if;
    return new;
  end if;

  if tg_op='DELETE' and old.field_name='marketing_permission' then
    raise exception 'MARKETING permission evidence is append-only';
  end if;

  return old;
end;
$$;

drop trigger if exists lead_sources_marketing_permission_guard on public.lead_sources;
create trigger lead_sources_marketing_permission_guard
before insert or update or delete on public.lead_sources
for each row execute function public.guard_marketing_permission_evidence();

create or replace function public.record_marketing_permission_event(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_lead_id uuid,
  p_channel text,
  p_purpose text,
  p_action text,
  p_recipient text,
  p_source_type text,
  p_source_reference text,
  p_legal_basis text,
  p_occurred_at timestamptz,
  p_preference_center_managed boolean,
  p_request_key text
)
returns public.lead_sources
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_role text;
  v_channel text:=upper(trim(coalesce(p_channel,'')));
  v_purpose text:=upper(trim(coalesce(p_purpose,'')));
  v_action text:=upper(trim(coalesce(p_action,'')));
  v_recipient text;
  v_source_type text:=upper(trim(coalesce(p_source_type,'')));
  v_source_reference text:=trim(coalesce(p_source_reference,''));
  v_legal_basis text:=upper(trim(coalesce(p_legal_basis,'')));
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_existing public.lead_sources%rowtype;
  v_row public.lead_sources%rowtype;
begin
  if current_user<>'service_role' then
    raise exception 'MARKETING permission mutation requires the trusted server boundary';
  end if;

  if p_actor_user_id is not null then
    select m.role into v_role
    from public.organization_members m
    where m.organization_id=p_organization_id and m.user_id=p_actor_user_id;

    if v_role is null or v_role not in ('OWNER','ADMIN','SALES_MANAGER') then
      raise exception 'MARKETING permission operator mutation requires OWNER, ADMIN or SALES_MANAGER';
    end if;
  elsif v_source_type<>'PREFERENCE_CENTER' then
    raise exception 'MARKETING permission event without a user actor must come from the governed preference center';
  end if;

  if not exists (
    select 1 from public.leads l
    where l.organization_id=p_organization_id and l.id=p_lead_id
  ) then
    raise exception 'MARKETING permission Lead not found';
  end if;

  v_recipient:=public.normalize_marketing_permission_recipient(v_channel,p_recipient);

  if v_channel not in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','TELEGRAM')
     or v_purpose<>'MARKETING'
     or v_action not in ('GRANT','REVOKE')
     or length(v_recipient) not between 3 and 500
     or v_source_type not in (
       'CUSTOMER_MESSAGE',
       'CLICK_TO_MESSAGE',
       'WEBSITE_FORM',
       'SIGNED_PERMISSION',
       'VERBAL_PERMISSION',
       'PREFERENCE_CENTER',
       'PROVIDER_EVENT',
       'OPERATOR'
     )
     or length(v_source_reference) not between 1 and 500
     or v_legal_basis not in (
       'EXPLICIT_CONSENT',
       'EXISTING_CUSTOMER',
       'LEGITIMATE_INTEREST',
       'LEGAL_REQUIREMENT',
       'WITHDRAWAL',
       'OTHER_DOCUMENTED_BASIS'
     )
     or p_occurred_at is null
     or p_occurred_at>now()+interval '5 minutes'
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'MARKETING permission event contract is invalid';
  end if;

  if v_action='GRANT' and v_legal_basis='WITHDRAWAL' then
    raise exception 'A MARKETING permission grant cannot use WITHDRAWAL as its legal basis';
  end if;

  select * into v_existing
  from public.lead_sources s
  where s.organization_id=p_organization_id
    and s.field_name='marketing_permission'
    and s.consent_request_key=v_request_key;

  if found then
    if v_existing.lead_id<>p_lead_id
       or v_existing.permission_channel<>v_channel
       or v_existing.permission_purpose<>v_purpose
       or v_existing.permission_action<>v_action
       or v_existing.permission_recipient<>v_recipient
       or v_existing.source_type<>v_source_type
       or v_existing.source_url<>v_source_reference
       or v_existing.legal_basis<>v_legal_basis
       or v_existing.retrieved_at<>p_occurred_at
       or v_existing.preference_center_managed<>p_preference_center_managed
       or v_existing.recorded_by_user_id is distinct from p_actor_user_id
    then
      raise exception 'MARKETING permission request key conflict';
    end if;
    return v_existing;
  end if;

  insert into public.lead_sources(
    organization_id,
    lead_id,
    field_name,
    value,
    source_type,
    source_url,
    retrieved_at,
    verified_at,
    confidence,
    permission_channel,
    permission_purpose,
    permission_action,
    permission_recipient,
    legal_basis,
    preference_center_managed,
    consent_request_key,
    recorded_by_user_id
  ) values (
    p_organization_id,
    p_lead_id,
    'marketing_permission',
    jsonb_build_object(
      'channel',v_channel,
      'purpose',v_purpose,
      'action',v_action,
      'recipient',v_recipient,
      'legal_basis',v_legal_basis,
      'preference_center_managed',p_preference_center_managed
    ),
    v_source_type,
    v_source_reference,
    p_occurred_at,
    now(),
    1,
    v_channel,
    v_purpose,
    v_action,
    v_recipient,
    v_legal_basis,
    p_preference_center_managed,
    v_request_key,
    p_actor_user_id
  )
  returning * into v_row;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,
    case when p_actor_user_id is null then 'SYSTEM' else 'USER' end,
    coalesce(p_actor_user_id::text,'preference-center'),
    case when v_action='GRANT' then 'MARKETING_PERMISSION_GRANTED' else 'MARKETING_PERMISSION_REVOKED' end,
    'lead_source',
    v_row.id::text,
    jsonb_build_object(
      'lead_id',p_lead_id,
      'channel',v_channel,
      'purpose',v_purpose,
      'action',v_action,
      'source_type',v_source_type,
      'legal_basis',v_legal_basis,
      'preference_center_managed',p_preference_center_managed,
      'provider_send_triggered',false
    )
  );

  return v_row;
end;
$$;

create or replace function public.get_marketing_permission(
  p_organization_id uuid,
  p_lead_id uuid,
  p_channel text,
  p_purpose text,
  p_recipient text
)
returns table(
  allowed boolean,
  reason text,
  event_id uuid,
  permission_action text,
  legal_basis text,
  source_type text,
  source_reference text,
  occurred_at timestamptz,
  verified_at timestamptz,
  preference_center_managed boolean
)
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  with input as (
    select
      upper(trim(coalesce(p_channel,''))) as channel,
      upper(trim(coalesce(p_purpose,''))) as purpose,
      public.normalize_marketing_permission_recipient(p_channel,p_recipient) as recipient
  ),
  latest as (
    select s.*
    from public.lead_sources s
    cross join input i
    where s.organization_id=p_organization_id
      and s.lead_id=p_lead_id
      and s.field_name='marketing_permission'
      and s.permission_channel=i.channel
      and s.permission_purpose=i.purpose
      and s.permission_recipient=i.recipient
    order by s.retrieved_at desc,s.id desc
    limit 1
  )
  select
    coalesce(l.permission_action='GRANT',false) as allowed,
    case
      when l.id is null then 'NO_PERMISSION_EVIDENCE'
      when l.permission_action='REVOKE' then 'LATEST_PERMISSION_IS_REVOKE'
      when l.verified_at is null then 'PERMISSION_NOT_VERIFIED'
      else 'VERIFIED_PERMISSION'
    end as reason,
    l.id,
    l.permission_action,
    l.legal_basis,
    l.source_type,
    l.source_url,
    l.retrieved_at,
    l.verified_at,
    l.preference_center_managed
  from (select 1) seed
  left join latest l on true;
$$;

create or replace function public.get_marketing_preferences(
  p_organization_id uuid,
  p_lead_id uuid default null,
  p_limit integer default 200
)
returns table(
  event_id uuid,
  lead_id uuid,
  permission_channel text,
  permission_purpose text,
  permission_recipient text,
  permission_action text,
  allowed boolean,
  legal_basis text,
  source_type text,
  source_reference text,
  occurred_at timestamptz,
  verified_at timestamptz,
  preference_center_managed boolean,
  recorded_by_user_id uuid
)
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  select
    x.id,
    x.lead_id,
    x.permission_channel,
    x.permission_purpose,
    x.permission_recipient,
    x.permission_action,
    x.permission_action='GRANT' as allowed,
    x.legal_basis,
    x.source_type,
    x.source_url,
    x.retrieved_at,
    x.verified_at,
    x.preference_center_managed,
    x.recorded_by_user_id
  from (
    select distinct on (
      s.lead_id,
      s.permission_channel,
      s.permission_purpose,
      s.permission_recipient
    ) s.*
    from public.lead_sources s
    where s.organization_id=p_organization_id
      and s.field_name='marketing_permission'
      and (p_lead_id is null or s.lead_id=p_lead_id)
    order by
      s.lead_id,
      s.permission_channel,
      s.permission_purpose,
      s.permission_recipient,
      s.retrieved_at desc,
      s.id desc
  ) x
  order by x.retrieved_at desc,x.id desc
  limit least(greatest(coalesce(p_limit,200),1),500);
$$;

comment on function public.record_marketing_permission_event(
  uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz,boolean,text
) is
  'Append-only MARKETING permission evidence on canonical lead_sources. Does not mutate suppression or invoke provider sends.';

comment on function public.get_marketing_permission(uuid,uuid,text,text,text) is
  'Effective latest MARKETING permission evidence for an exact Lead/channel/purpose/recipient. Suppression remains a separate mandatory send-gate authority.';

revoke all on function public.normalize_marketing_permission_recipient(text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.normalize_marketing_permission_recipient(text,text)
  to authenticated,service_role;

revoke all on function public.record_marketing_permission_event(
  uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz,boolean,text
) from public,anon,authenticated,service_role;
grant execute on function public.record_marketing_permission_event(
  uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz,boolean,text
) to service_role;

revoke all on function public.get_marketing_permission(uuid,uuid,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.get_marketing_permission(uuid,uuid,text,text,text)
  to authenticated,service_role;

revoke all on function public.get_marketing_preferences(uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_marketing_preferences(uuid,uuid,integer)
  to authenticated,service_role;

grant select on public.lead_sources to service_role;
grant insert on public.lead_sources to service_role;
grant select on public.organization_members to service_role;
grant select on public.leads to service_role;
grant insert on public.audit_logs to service_role;
