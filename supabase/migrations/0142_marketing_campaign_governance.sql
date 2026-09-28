-- 0142: MARKETING-CAMPAIGNS governance on the existing canonical campaign/outreach plane.
--
-- Extends public.campaigns rather than creating a second campaign authority.
-- Existing Hunter/Acquisition rows remain HUNTER and retain their legacy runtime.
-- Marketing rows are service-governed, bind to an immutable Segment Snapshot,
-- reuse message_templates/message_variants, and never invoke provider sends.
-- Consent/suppression stays at the canonical send gate. This migration does not
-- fabricate a general Consent authority; MARKETING-CONSENT remains its own WP.

alter table public.campaigns
  add column if not exists campaign_kind text not null default 'HUNTER',
  add column if not exists audience_snapshot_id uuid,
  add column if not exists channel text,
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists scheduled_end_at timestamptz,
  add column if not exists frequency_cap_per_recipient integer,
  add column if not exists budget_cap_minor bigint,
  add column if not exists budget_currency text,
  add column if not exists approval_status text not null default 'NOT_REQUIRED',
  add column if not exists approved_by_user_id uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists created_by_user_id uuid,
  add column if not exists updated_by_user_id uuid,
  add column if not exists last_request_key text,
  add column if not exists version integer not null default 1,
  add column if not exists consent_policy text not null default 'SEND_GATE_REQUIRED';

alter table public.campaigns alter column hunter_type drop not null;
alter table public.campaigns drop constraint if exists campaigns_hunter_type_check;

alter table public.campaigns
  add constraint campaigns_kind_check
    check (campaign_kind in ('HUNTER','MARKETING')),
  add constraint campaigns_hunter_kind_check
    check (
      (campaign_kind='HUNTER' and hunter_type in ('BUSINESS','INTENT'))
      or (campaign_kind='MARKETING' and hunter_type is null)
    ),
  add constraint campaigns_channel_check
    check (
      channel is null
      or channel in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','TELEGRAM')
    ),
  add constraint campaigns_schedule_check
    check (
      scheduled_end_at is null
      or (scheduled_start_at is not null and scheduled_end_at>scheduled_start_at)
    ),
  add constraint campaigns_frequency_cap_check
    check (
      frequency_cap_per_recipient is null
      or frequency_cap_per_recipient between 1 and 100
    ),
  add constraint campaigns_budget_cap_check
    check (budget_cap_minor is null or budget_cap_minor between 1 and 1000000000000),
  add constraint campaigns_budget_currency_check
    check (budget_currency is null or budget_currency ~ '^[A-Z]{3}$'),
  add constraint campaigns_approval_status_check
    check (approval_status in ('NOT_REQUIRED','DRAFT','PENDING','APPROVED','REJECTED')),
  add constraint campaigns_version_check
    check (version>=1),
  add constraint campaigns_request_key_check
    check (
      last_request_key is null
      or (
        length(last_request_key) between 1 and 200
        and last_request_key ~ '^[A-Za-z0-9._:-]+$'
      )
    ),
  add constraint campaigns_consent_policy_check
    check (consent_policy='SEND_GATE_REQUIRED'),
  add constraint campaigns_marketing_contract_check
    check (
      campaign_kind<>'MARKETING'
      or (
        audience_snapshot_id is not null
        and channel is not null
        and country_code is not null
        and length(country_code)=2
        and scheduled_start_at is not null
        and frequency_cap_per_recipient is not null
        and budget_cap_minor is not null
        and budget_currency is not null
        and approval_status<>'NOT_REQUIRED'
        and created_by_user_id is not null
        and updated_by_user_id is not null
      )
    );

alter table public.campaigns
  add constraint campaigns_organization_id_id_key unique (organization_id,id);

alter table public.campaigns
  add constraint campaigns_marketing_snapshot_fkey
    foreign key (organization_id,audience_snapshot_id)
    references public.crm_segment_snapshots(organization_id,id)
    on delete restrict,
  add constraint campaigns_approved_actor_fkey
    foreign key (organization_id,approved_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict,
  add constraint campaigns_created_actor_fkey
    foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict,
  add constraint campaigns_updated_actor_fkey
    foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict;

create unique index if not exists campaigns_org_request_key_unique
  on public.campaigns(organization_id,last_request_key)
  where last_request_key is not null;

create index if not exists campaigns_marketing_state_idx
  on public.campaigns(organization_id,campaign_kind,status,approval_status,updated_at desc);

create index if not exists campaigns_audience_snapshot_idx
  on public.campaigns(organization_id,audience_snapshot_id)
  where audience_snapshot_id is not null;

create index if not exists campaigns_approved_actor_idx
  on public.campaigns(organization_id,approved_by_user_id)
  where approved_by_user_id is not null;

create index if not exists campaigns_created_actor_idx
  on public.campaigns(organization_id,created_by_user_id)
  where created_by_user_id is not null;

create index if not exists campaigns_updated_actor_idx
  on public.campaigns(organization_id,updated_by_user_id)
  where updated_by_user_id is not null;

alter table public.message_templates
  drop constraint if exists message_templates_channel_check;
alter table public.message_templates
  add constraint message_templates_channel_check
    check (channel in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','TELEGRAM','OTHER')),
  add constraint message_templates_organization_id_id_key unique (organization_id,id);

alter table public.message_variants
  add constraint message_variants_organization_id_id_key unique (organization_id,id);

alter table public.message_variants
  add column if not exists campaign_id uuid,
  add column if not exists message_template_id uuid,
  add column if not exists allocation_bps integer,
  add column if not exists is_control boolean not null default false,
  add column if not exists variant_version integer not null default 1;

alter table public.message_variants
  add constraint message_variants_campaign_fkey
    foreign key (organization_id,campaign_id)
    references public.campaigns(organization_id,id)
    on delete cascade,
  add constraint message_variants_template_fkey
    foreign key (organization_id,message_template_id)
    references public.message_templates(organization_id,id)
    on delete restrict,
  add constraint message_variants_allocation_check
    check (allocation_bps is null or allocation_bps between 1 and 10000),
  add constraint message_variants_version_check
    check (variant_version>=1),
  add constraint message_variants_marketing_link_check
    check (
      campaign_id is null
      or (message_template_id is not null and allocation_bps is not null)
    );

create unique index if not exists message_variants_campaign_key_unique
  on public.message_variants(organization_id,campaign_id,variant_key)
  where campaign_id is not null;

create unique index if not exists message_variants_campaign_control_unique
  on public.message_variants(organization_id,campaign_id)
  where campaign_id is not null and is_control=true;

create index if not exists message_variants_campaign_idx
  on public.message_variants(organization_id,campaign_id,enabled)
  where campaign_id is not null;

create index if not exists message_variants_template_idx
  on public.message_variants(organization_id,message_template_id)
  where message_template_id is not null;

create table if not exists public.marketing_campaign_conversion_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null,
  message_variant_id uuid,
  deal_id uuid not null,
  evidence_note text not null,
  request_key text not null
    check (
      length(request_key) between 1 and 200
      and request_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  recorded_by_user_id uuid not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id,request_key),
  unique (organization_id,campaign_id,deal_id,request_key),
  foreign key (organization_id,campaign_id)
    references public.campaigns(organization_id,id)
    on delete restrict,
  foreign key (organization_id,message_variant_id)
    references public.message_variants(organization_id,id)
    on delete restrict,
  foreign key (organization_id,deal_id)
    references public.crm_deals(organization_id,id)
    on delete restrict,
  foreign key (organization_id,recorded_by_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict
);

create index if not exists marketing_campaign_conversion_campaign_idx
  on public.marketing_campaign_conversion_evidence(organization_id,campaign_id,occurred_at desc);

alter table public.marketing_campaign_conversion_evidence enable row level security;

drop policy if exists marketing_campaign_conversion_member_read
  on public.marketing_campaign_conversion_evidence;
create policy marketing_campaign_conversion_member_read
on public.marketing_campaign_conversion_evidence
for select
to authenticated
using (public.is_org_member(organization_id));

create or replace function public.guard_marketing_campaign_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if (
    (tg_op='INSERT' and new.campaign_kind='MARKETING')
    or (tg_op='UPDATE' and (old.campaign_kind='MARKETING' or new.campaign_kind='MARKETING'))
    or (tg_op='DELETE' and old.campaign_kind='MARKETING')
  ) and current_user<>'service_role' then
    raise exception 'MARKETING campaign mutation requires the trusted server boundary';
  end if;

  if tg_op='UPDATE' and old.campaign_kind is distinct from new.campaign_kind then
    raise exception 'Campaign kind is immutable';
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists campaigns_marketing_guard on public.campaigns;
create trigger campaigns_marketing_guard
before insert or update or delete on public.campaigns
for each row execute function public.guard_marketing_campaign_mutation();

create or replace function public.guard_marketing_campaign_variant_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_template public.message_templates%rowtype;
begin
  if (
    (tg_op='INSERT' and new.campaign_id is not null)
    or (tg_op='UPDATE' and (old.campaign_id is not null or new.campaign_id is not null))
    or (tg_op='DELETE' and old.campaign_id is not null)
  ) and current_user<>'service_role' then
    raise exception 'MARKETING campaign variant mutation requires the trusted server boundary';
  end if;

  if tg_op='DELETE' then return old; end if;
  if new.campaign_id is null then return new; end if;

  select * into v_campaign
  from public.campaigns c
  where c.organization_id=new.organization_id and c.id=new.campaign_id;

  if not found or v_campaign.campaign_kind<>'MARKETING' then
    raise exception 'Message variant campaign must reference a MARKETING campaign';
  end if;

  select * into v_template
  from public.message_templates t
  where t.organization_id=new.organization_id and t.id=new.message_template_id;

  if not found or not v_template.enabled or v_template.channel<>v_campaign.channel then
    raise exception 'Message variant template must be enabled and match campaign channel';
  end if;

  if v_campaign.status='RUNNING' then
    raise exception 'RUNNING MARKETING campaign variants are immutable; pause first';
  end if;

  return new;
end;
$$;

drop trigger if exists message_variants_marketing_guard on public.message_variants;
create trigger message_variants_marketing_guard
before insert or update or delete on public.message_variants
for each row execute function public.guard_marketing_campaign_variant_mutation();

create or replace function public.guard_marketing_campaign_conversion_immutable()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  raise exception 'MARKETING campaign conversion evidence is append-only';
end;
$$;

drop trigger if exists marketing_campaign_conversion_immutable
  on public.marketing_campaign_conversion_evidence;
create trigger marketing_campaign_conversion_immutable
before update or delete on public.marketing_campaign_conversion_evidence
for each row execute function public.guard_marketing_campaign_conversion_immutable();

create or replace function public.create_marketing_campaign(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_name text,
  p_country_code text,
  p_audience_snapshot_id uuid,
  p_channel text,
  p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz,
  p_frequency_cap_per_recipient integer,
  p_budget_cap_minor bigint,
  p_budget_currency text,
  p_request_key text
)
returns public.campaigns
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_role text;
  v_snapshot public.crm_segment_snapshots%rowtype;
  v_existing public.campaigns%rowtype;
  v_campaign public.campaigns%rowtype;
  v_name text:=trim(coalesce(p_name,''));
  v_country text:=upper(trim(coalesce(p_country_code,'')));
  v_channel text:=upper(trim(coalesce(p_channel,'')));
  v_currency text:=upper(trim(coalesce(p_budget_currency,'')));
  v_request_key text:=trim(coalesce(p_request_key,''));
begin
  if current_user<>'service_role' then
    raise exception 'MARKETING campaign creation requires the trusted server boundary';
  end if;

  select m.role into v_role
  from public.organization_members m
  where m.organization_id=p_organization_id and m.user_id=p_actor_user_id;

  if v_role is null or v_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'MARKETING campaign creation requires OWNER, ADMIN or SALES_MANAGER';
  end if;

  if length(v_name) not between 1 and 160
     or v_country !~ '^[A-Z]{2}$'
     or v_channel not in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','TELEGRAM')
     or p_scheduled_start_at is null
     or (p_scheduled_end_at is not null and p_scheduled_end_at<=p_scheduled_start_at)
     or p_frequency_cap_per_recipient not between 1 and 100
     or p_budget_cap_minor not between 1 and 1000000000000
     or v_currency !~ '^[A-Z]{3}$'
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'MARKETING campaign contract is invalid';
  end if;

  select * into v_snapshot
  from public.crm_segment_snapshots s
  where s.organization_id=p_organization_id and s.id=p_audience_snapshot_id;

  if not found or v_snapshot.purpose<>'CAMPAIGN' or v_snapshot.entity_type<>'LEAD' then
    raise exception 'MARKETING campaign requires an immutable LEAD Segment Snapshot with CAMPAIGN purpose';
  end if;

  if v_snapshot.member_count<1 then
    raise exception 'MARKETING campaign audience Snapshot cannot be empty';
  end if;

  select * into v_existing
  from public.campaigns c
  where c.organization_id=p_organization_id and c.last_request_key=v_request_key;

  if found then
    if v_existing.campaign_kind<>'MARKETING'
       or v_existing.name<>v_name
       or v_existing.country_code<>v_country
       or v_existing.audience_snapshot_id<>p_audience_snapshot_id
       or v_existing.channel<>v_channel
       or v_existing.scheduled_start_at<>p_scheduled_start_at
       or v_existing.scheduled_end_at is distinct from p_scheduled_end_at
       or v_existing.frequency_cap_per_recipient<>p_frequency_cap_per_recipient
       or v_existing.budget_cap_minor<>p_budget_cap_minor
       or v_existing.budget_currency<>v_currency
    then
      raise exception 'MARKETING campaign request key conflict';
    end if;
    return v_existing;
  end if;

  insert into public.campaigns(
    organization_id,name,hunter_type,country_code,city,industry,target_count,status,config,
    campaign_kind,audience_snapshot_id,channel,scheduled_start_at,scheduled_end_at,
    frequency_cap_per_recipient,budget_cap_minor,budget_currency,approval_status,
    created_by_user_id,updated_by_user_id,last_request_key,version,consent_policy
  ) values (
    p_organization_id,v_name,null,v_country,null,null,v_snapshot.member_count,'DRAFT','{}'::jsonb,
    'MARKETING',p_audience_snapshot_id,v_channel,p_scheduled_start_at,p_scheduled_end_at,
    p_frequency_cap_per_recipient,p_budget_cap_minor,v_currency,'DRAFT',
    p_actor_user_id,p_actor_user_id,v_request_key,1,'SEND_GATE_REQUIRED'
  )
  returning * into v_campaign;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'MARKETING_CAMPAIGN_CREATED',
    'campaign',v_campaign.id::text,
    jsonb_build_object(
      'audience_snapshot_id',p_audience_snapshot_id,
      'segment_version',v_snapshot.segment_version,
      'member_count',v_snapshot.member_count,
      'channel',v_channel,
      'scheduled_start_at',p_scheduled_start_at,
      'scheduled_end_at',p_scheduled_end_at,
      'frequency_cap_per_recipient',p_frequency_cap_per_recipient,
      'budget_cap_minor',p_budget_cap_minor,
      'budget_currency',v_currency,
      'consent_policy','SEND_GATE_REQUIRED',
      'provider_send_triggered',false
    )
  );

  return v_campaign;
end;
$$;

create or replace function public.upsert_marketing_campaign_variant(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_campaign_id uuid,
  p_message_template_id uuid,
  p_variant_key text,
  p_strategy text,
  p_allocation_bps integer,
  p_is_control boolean
)
returns public.message_variants
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_role text;
  v_campaign public.campaigns%rowtype;
  v_variant public.message_variants%rowtype;
  v_key text:=upper(trim(coalesce(p_variant_key,'')));
  v_strategy text:=lower(trim(coalesce(p_strategy,'')));
begin
  if current_user<>'service_role' then
    raise exception 'MARKETING campaign variant mutation requires the trusted server boundary';
  end if;

  select m.role into v_role
  from public.organization_members m
  where m.organization_id=p_organization_id and m.user_id=p_actor_user_id;
  if v_role is null or v_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'MARKETING campaign variant mutation requires OWNER, ADMIN or SALES_MANAGER';
  end if;

  select * into v_campaign
  from public.campaigns c
  where c.organization_id=p_organization_id and c.id=p_campaign_id and c.campaign_kind='MARKETING';
  if not found then raise exception 'MARKETING campaign not found'; end if;
  if v_campaign.status='RUNNING' then raise exception 'Pause MARKETING campaign before changing variants'; end if;

  if v_key !~ '^[A-Z0-9_-]{1,40}$'
     or v_strategy not in ('problem_first','opportunity_first','direct_idea')
     or p_allocation_bps not between 1 and 10000
  then
    raise exception 'MARKETING campaign variant contract is invalid';
  end if;

  insert into public.message_variants(
    organization_id,country_code,industry,service_id,variant_key,strategy,
    enabled,sample_size,campaign_id,message_template_id,allocation_bps,is_control,variant_version
  ) values (
    p_organization_id,v_campaign.country_code,coalesce(v_campaign.industry,'MARKETING'),
    null,v_key,v_strategy,true,50,p_campaign_id,p_message_template_id,
    p_allocation_bps,coalesce(p_is_control,false),1
  )
  on conflict (organization_id,campaign_id,variant_key) where campaign_id is not null
  do update set
    message_template_id=excluded.message_template_id,
    strategy=excluded.strategy,
    allocation_bps=excluded.allocation_bps,
    is_control=excluded.is_control,
    enabled=true,
    variant_version=public.message_variants.variant_version+1,
    updated_at=now()
  returning * into v_variant;

  update public.campaigns
  set version=version+1,updated_by_user_id=p_actor_user_id,updated_at=now()
  where organization_id=p_organization_id and id=p_campaign_id;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'MARKETING_CAMPAIGN_VARIANT_UPSERTED',
    'message_variant',v_variant.id::text,
    jsonb_build_object(
      'campaign_id',p_campaign_id,
      'template_id',p_message_template_id,
      'variant_key',v_key,
      'strategy',v_strategy,
      'allocation_bps',p_allocation_bps,
      'is_control',coalesce(p_is_control,false),
      'provider_send_triggered',false
    )
  );

  return v_variant;
end;
$$;

create or replace function public.transition_marketing_campaign(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_campaign_id uuid,
  p_action text
)
returns public.campaigns
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_role text;
  v_campaign public.campaigns%rowtype;
  v_action text:=upper(trim(coalesce(p_action,'')));
  v_variant_count integer;
  v_allocation integer;
  v_control_count integer;
  v_shadow boolean;
begin
  if current_user<>'service_role' then
    raise exception 'MARKETING campaign transition requires the trusted server boundary';
  end if;

  select m.role into v_role
  from public.organization_members m
  where m.organization_id=p_organization_id and m.user_id=p_actor_user_id;
  if v_role is null or v_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'MARKETING campaign transition requires OWNER, ADMIN or SALES_MANAGER';
  end if;

  select * into v_campaign
  from public.campaigns c
  where c.organization_id=p_organization_id and c.id=p_campaign_id and c.campaign_kind='MARKETING'
  for update;
  if not found then raise exception 'MARKETING campaign not found'; end if;

  select count(*)::integer,coalesce(sum(allocation_bps),0)::integer,
         count(*) filter (where is_control)::integer
    into v_variant_count,v_allocation,v_control_count
  from public.message_variants v
  where v.organization_id=p_organization_id and v.campaign_id=p_campaign_id and v.enabled;

  if v_action in ('SUBMIT','START','RESUME') then
    if v_variant_count<1 or v_allocation<>10000 or v_control_count<>1 then
      raise exception 'MARKETING campaign requires enabled variants totaling 10000 bps with exactly one control';
    end if;
  end if;

  if v_action='SUBMIT' then
    if v_campaign.status<>'DRAFT' or v_campaign.approval_status not in ('DRAFT','REJECTED') then
      raise exception 'MARKETING campaign cannot be submitted from current state';
    end if;
    update public.campaigns
    set approval_status='PENDING',approved_by_user_id=null,approved_at=null,
        updated_by_user_id=p_actor_user_id,version=version+1,updated_at=now()
    where organization_id=p_organization_id and id=p_campaign_id;
  elsif v_action='APPROVE' then
    if v_role not in ('OWNER','ADMIN') or v_campaign.status<>'DRAFT' or v_campaign.approval_status<>'PENDING' then
      raise exception 'MARKETING campaign approval requires OWNER/ADMIN and PENDING state';
    end if;
    update public.campaigns
    set approval_status='APPROVED',approved_by_user_id=p_actor_user_id,approved_at=now(),
        updated_by_user_id=p_actor_user_id,version=version+1,updated_at=now()
    where organization_id=p_organization_id and id=p_campaign_id;
  elsif v_action='REJECT' then
    if v_role not in ('OWNER','ADMIN') or v_campaign.approval_status<>'PENDING' then
      raise exception 'MARKETING campaign rejection requires OWNER/ADMIN and PENDING state';
    end if;
    update public.campaigns
    set approval_status='REJECTED',approved_by_user_id=null,approved_at=null,status='DRAFT',
        updated_by_user_id=p_actor_user_id,version=version+1,updated_at=now()
    where organization_id=p_organization_id and id=p_campaign_id;
  elsif v_action in ('START','RESUME') then
    if v_campaign.approval_status<>'APPROVED'
       or (v_action='START' and v_campaign.status<>'DRAFT')
       or (v_action='RESUME' and v_campaign.status<>'PAUSED')
       or now()<v_campaign.scheduled_start_at
       or (v_campaign.scheduled_end_at is not null and now()>=v_campaign.scheduled_end_at)
    then
      raise exception 'MARKETING campaign is not eligible to run';
    end if;

    select sc.shadow_mode into v_shadow
    from public.system_controls sc
    where sc.organization_id=p_organization_id;
    if coalesce(v_shadow,false)<>true then
      raise exception 'MARKETING campaign RC activation requires Shadow Mode ON';
    end if;

    update public.campaigns
    set status='RUNNING',updated_by_user_id=p_actor_user_id,version=version+1,updated_at=now()
    where organization_id=p_organization_id and id=p_campaign_id;
  elsif v_action='PAUSE' then
    if v_campaign.status<>'RUNNING' then raise exception 'Only RUNNING MARKETING campaign can be paused'; end if;
    update public.campaigns
    set status='PAUSED',updated_by_user_id=p_actor_user_id,version=version+1,updated_at=now()
    where organization_id=p_organization_id and id=p_campaign_id;
  elsif v_action='COMPLETE' then
    if v_campaign.status not in ('RUNNING','PAUSED') then
      raise exception 'Only active MARKETING campaign can be completed';
    end if;
    update public.campaigns
    set status='COMPLETED',updated_by_user_id=p_actor_user_id,version=version+1,updated_at=now()
    where organization_id=p_organization_id and id=p_campaign_id;
  else
    raise exception 'Unsupported MARKETING campaign transition';
  end if;

  select * into v_campaign
  from public.campaigns c where c.organization_id=p_organization_id and c.id=p_campaign_id;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'MARKETING_CAMPAIGN_'||v_action,
    'campaign',p_campaign_id::text,
    jsonb_build_object(
      'status',v_campaign.status,
      'approval_status',v_campaign.approval_status,
      'version',v_campaign.version,
      'consent_policy',v_campaign.consent_policy,
      'provider_send_triggered',false
    )
  );

  return v_campaign;
end;
$$;

create or replace function public.record_marketing_campaign_conversion(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_campaign_id uuid,
  p_message_variant_id uuid,
  p_deal_id uuid,
  p_evidence_note text,
  p_occurred_at timestamptz,
  p_request_key text
)
returns public.marketing_campaign_conversion_evidence
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_role text;
  v_campaign public.campaigns%rowtype;
  v_existing public.marketing_campaign_conversion_evidence%rowtype;
  v_row public.marketing_campaign_conversion_evidence%rowtype;
  v_note text:=trim(coalesce(p_evidence_note,''));
  v_request_key text:=trim(coalesce(p_request_key,''));
begin
  if current_user<>'service_role' then
    raise exception 'MARKETING conversion evidence requires the trusted server boundary';
  end if;

  select m.role into v_role
  from public.organization_members m
  where m.organization_id=p_organization_id and m.user_id=p_actor_user_id;
  if v_role is null or v_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'MARKETING conversion evidence requires OWNER, ADMIN or SALES_MANAGER';
  end if;

  select * into v_campaign
  from public.campaigns c
  where c.organization_id=p_organization_id and c.id=p_campaign_id and c.campaign_kind='MARKETING';
  if not found then raise exception 'MARKETING campaign not found'; end if;

  if not exists (
    select 1 from public.crm_deals d
    where d.organization_id=p_organization_id and d.id=p_deal_id
  ) then
    raise exception 'Conversion evidence Deal not found';
  end if;

  if p_message_variant_id is not null and not exists (
    select 1 from public.message_variants v
    where v.organization_id=p_organization_id
      and v.id=p_message_variant_id
      and v.campaign_id=p_campaign_id
  ) then
    raise exception 'Conversion evidence variant does not belong to campaign';
  end if;

  if length(v_note) not between 1 and 500
     or p_occurred_at is null
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'Conversion evidence contract is invalid';
  end if;

  select * into v_existing
  from public.marketing_campaign_conversion_evidence e
  where e.organization_id=p_organization_id and e.request_key=v_request_key;
  if found then
    if v_existing.campaign_id<>p_campaign_id
       or v_existing.message_variant_id is distinct from p_message_variant_id
       or v_existing.deal_id<>p_deal_id
       or v_existing.evidence_note<>v_note
       or v_existing.occurred_at<>p_occurred_at
    then
      raise exception 'MARKETING conversion evidence request key conflict';
    end if;
    return v_existing;
  end if;

  insert into public.marketing_campaign_conversion_evidence(
    organization_id,campaign_id,message_variant_id,deal_id,evidence_note,
    request_key,recorded_by_user_id,occurred_at
  ) values (
    p_organization_id,p_campaign_id,p_message_variant_id,p_deal_id,v_note,
    v_request_key,p_actor_user_id,p_occurred_at
  )
  returning * into v_row;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'MARKETING_CAMPAIGN_CONVERSION_EVIDENCE_RECORDED',
    'marketing_campaign_conversion_evidence',v_row.id::text,
    jsonb_build_object(
      'campaign_id',p_campaign_id,
      'message_variant_id',p_message_variant_id,
      'deal_id',p_deal_id,
      'occurred_at',p_occurred_at,
      'attribution_claimed',false,
      'provider_send_triggered',false
    )
  );

  return v_row;
end;
$$;

create or replace function public.get_marketing_campaigns(
  p_organization_id uuid,
  p_limit integer default 100
)
returns table(
  campaign_id uuid,
  campaign_name text,
  campaign_status text,
  approval_status text,
  country_code text,
  channel text,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  audience_snapshot_id uuid,
  segment_id uuid,
  segment_version integer,
  audience_member_count integer,
  frequency_cap_per_recipient integer,
  budget_cap_minor bigint,
  budget_currency text,
  variant_count integer,
  allocation_bps integer,
  control_variant_count integer,
  outbound_count bigint,
  response_count bigint,
  conversion_evidence_count bigint,
  ready_to_start boolean,
  readiness_issues text[],
  version integer,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  with base as (
    select
      c.*,
      s.segment_id,
      s.segment_version,
      s.member_count as audience_member_count,
      coalesce(v.variant_count,0) as variant_count,
      coalesce(v.allocation_bps,0) as allocation_bps,
      coalesce(v.control_variant_count,0) as control_variant_count,
      coalesce(o.outbound_count,0) as outbound_count,
      coalesce(r.response_count,0) as response_count,
      coalesce(x.conversion_evidence_count,0) as conversion_evidence_count
    from public.campaigns c
    join public.crm_segment_snapshots s
      on s.organization_id=c.organization_id and s.id=c.audience_snapshot_id
    left join lateral (
      select
        count(*)::integer as variant_count,
        coalesce(sum(mv.allocation_bps),0)::integer as allocation_bps,
        count(*) filter (where mv.is_control)::integer as control_variant_count
      from public.message_variants mv
      where mv.organization_id=c.organization_id
        and mv.campaign_id=c.id
        and mv.enabled
    ) v on true
    left join lateral (
      select count(*)::bigint as outbound_count
      from public.outreach_messages om
      where om.organization_id=c.organization_id
        and om.campaign_id=c.id
        and om.direction='OUTBOUND'
    ) o on true
    left join lateral (
      select count(distinct re.id)::bigint as response_count
      from public.reply_events re
      join public.outreach_messages om
        on om.organization_id=re.organization_id
       and om.id=re.outreach_message_id
      where om.organization_id=c.organization_id
        and om.campaign_id=c.id
    ) r on true
    left join lateral (
      select count(*)::bigint as conversion_evidence_count
      from public.marketing_campaign_conversion_evidence ce
      where ce.organization_id=c.organization_id and ce.campaign_id=c.id
    ) x on true
    where c.organization_id=p_organization_id and c.campaign_kind='MARKETING'
  )
  select
    b.id,
    b.name,
    b.status,
    b.approval_status,
    b.country_code,
    b.channel,
    b.scheduled_start_at,
    b.scheduled_end_at,
    b.audience_snapshot_id,
    b.segment_id,
    b.segment_version,
    b.audience_member_count,
    b.frequency_cap_per_recipient,
    b.budget_cap_minor,
    b.budget_currency,
    b.variant_count,
    b.allocation_bps,
    b.control_variant_count,
    b.outbound_count,
    b.response_count,
    b.conversion_evidence_count,
    (
      b.approval_status='APPROVED'
      and b.variant_count>=1
      and b.allocation_bps=10000
      and b.control_variant_count=1
      and now()>=b.scheduled_start_at
      and (b.scheduled_end_at is null or now()<b.scheduled_end_at)
    ) as ready_to_start,
    array_remove(array[
      case when b.approval_status<>'APPROVED' then 'APPROVAL_REQUIRED' end,
      case when b.variant_count<1 then 'VARIANT_REQUIRED' end,
      case when b.allocation_bps<>10000 then 'VARIANT_ALLOCATION_MUST_TOTAL_10000_BPS' end,
      case when b.control_variant_count<>1 then 'EXACTLY_ONE_CONTROL_VARIANT_REQUIRED' end,
      case when now()<b.scheduled_start_at then 'SCHEDULE_NOT_STARTED' end,
      case when b.scheduled_end_at is not null and now()>=b.scheduled_end_at then 'SCHEDULE_EXPIRED' end,
      'CONSENT_AND_SUPPRESSION_ENFORCED_AT_CANONICAL_SEND_GATE'
    ],null)::text[] as readiness_issues,
    b.version,
    b.updated_at
  from base b
  order by b.updated_at desc,b.id desc
  limit least(greatest(coalesce(p_limit,100),1),200);
$$;

revoke all on public.marketing_campaign_conversion_evidence
  from public,anon,authenticated,service_role;
grant select on public.marketing_campaign_conversion_evidence to authenticated;
grant select,insert on public.marketing_campaign_conversion_evidence to service_role;

revoke all on function public.create_marketing_campaign(
  uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,integer,bigint,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.create_marketing_campaign(
  uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,integer,bigint,text,text
) to service_role;

revoke all on function public.upsert_marketing_campaign_variant(
  uuid,uuid,uuid,uuid,text,text,integer,boolean
) from public,anon,authenticated,service_role;
grant execute on function public.upsert_marketing_campaign_variant(
  uuid,uuid,uuid,uuid,text,text,integer,boolean
) to service_role;

revoke all on function public.transition_marketing_campaign(
  uuid,uuid,uuid,text
) from public,anon,authenticated,service_role;
grant execute on function public.transition_marketing_campaign(
  uuid,uuid,uuid,text
) to service_role;

revoke all on function public.record_marketing_campaign_conversion(
  uuid,uuid,uuid,uuid,uuid,text,timestamptz,text
) from public,anon,authenticated,service_role;
grant execute on function public.record_marketing_campaign_conversion(
  uuid,uuid,uuid,uuid,uuid,text,timestamptz,text
) to service_role;

revoke all on function public.get_marketing_campaigns(uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_marketing_campaigns(uuid,integer)
  to authenticated,service_role;

grant select on public.crm_segment_snapshots to service_role;
grant select on public.message_templates to service_role;
grant select,insert,update on public.message_variants to service_role;
grant select,insert,update on public.campaigns to service_role;
grant select on public.crm_deals to service_role;
grant select on public.organization_members to service_role;
grant insert on public.audit_logs to service_role;
