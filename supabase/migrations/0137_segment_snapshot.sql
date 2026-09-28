-- 0137: SEGMENT-SNAPSHOT immutable audience evidence.
--
-- Owns historically reproducible audience membership for an exact immutable
-- crm_segment_versions semantic version. It does NOT create a second Segment
-- evaluator and does not imply consent/send permission.
--
-- Safety:
-- - trusted service-bound creation with explicit operator attribution;
-- - exact Segment semantic version + predicate hash + entity type;
-- - max 10,000 entities per RC snapshot, fail-closed above the bound;
-- - immutable header and members;
-- - deferred integrity check ties member_count/membership_hash to exact rows;
-- - no FK from member entity_id to live CRM entities so retention/deletion cannot
--   silently rewrite historical membership evidence.

create table if not exists public.crm_segment_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  segment_id uuid not null,
  segment_version integer not null check (segment_version >= 1),
  entity_type text not null
    check (entity_type in ('LEAD','PERSON','DEAL','ACCOUNT')),
  predicate_hash text not null check (predicate_hash ~ '^[0-9a-f]{32}$'),
  member_count integer not null check (member_count between 0 and 10000),
  membership_hash text not null check (membership_hash ~ '^[0-9a-f]{32}$'),
  purpose text not null
    check (purpose in ('MANUAL','CAMPAIGN','WORKFLOW','EXPORT','OTHER')),
  source_ref text not null
    check (
      length(source_ref) between 1 and 240
      and source_ref ~ '^[A-Za-z0-9._:/-]+$'
    ),
  request_key text not null
    check (
      length(request_key) between 1 and 200
      and request_key ~ '^[A-Za-z0-9._:-]+$'
    ),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),

  unique (organization_id, id),
  unique (organization_id, request_key),

  foreign key (organization_id, segment_id, segment_version)
    references public.crm_segment_versions(organization_id, segment_id, version)
    on delete restrict,
  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create table if not exists public.crm_segment_snapshot_members (
  organization_id uuid not null,
  snapshot_id uuid not null,
  ordinal integer not null check (ordinal >= 1 and ordinal <= 10000),
  entity_id uuid not null,
  created_at timestamptz not null default now(),

  primary key (organization_id, snapshot_id, entity_id),
  unique (organization_id, snapshot_id, ordinal),

  foreign key (organization_id, snapshot_id)
    references public.crm_segment_snapshots(organization_id, id)
    on delete restrict
);

create index if not exists crm_segment_snapshots_org_created_idx
  on public.crm_segment_snapshots(organization_id, created_at desc, id desc);

create index if not exists crm_segment_snapshots_segment_version_idx
  on public.crm_segment_snapshots(
    organization_id, segment_id, segment_version, created_at desc, id desc
  );

create index if not exists crm_segment_snapshots_created_by_idx
  on public.crm_segment_snapshots(organization_id, created_by_user_id);

create index if not exists crm_segment_snapshot_members_snapshot_ordinal_idx
  on public.crm_segment_snapshot_members(organization_id, snapshot_id, ordinal);

alter table public.crm_segment_snapshots enable row level security;
alter table public.crm_segment_snapshot_members enable row level security;

drop policy if exists crm_segment_snapshots_member_read on public.crm_segment_snapshots;
create policy crm_segment_snapshots_member_read
on public.crm_segment_snapshots
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists crm_segment_snapshot_members_member_read on public.crm_segment_snapshot_members;
create policy crm_segment_snapshot_members_member_read
on public.crm_segment_snapshot_members
for select
to authenticated
using (public.is_org_member(organization_id));

create or replace function public.guard_crm_segment_snapshot_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  raise exception 'CRM Segment Snapshot evidence is immutable';
end;
$$;

drop trigger if exists crm_segment_snapshots_immutable
  on public.crm_segment_snapshots;
create trigger crm_segment_snapshots_immutable
before update or delete on public.crm_segment_snapshots
for each row execute function public.guard_crm_segment_snapshot_immutable();

drop trigger if exists crm_segment_snapshot_members_immutable
  on public.crm_segment_snapshot_members;
create trigger crm_segment_snapshot_members_immutable
before update or delete on public.crm_segment_snapshot_members
for each row execute function public.guard_crm_segment_snapshot_immutable();

create or replace function public.validate_crm_segment_snapshot_integrity()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_snapshot_id uuid;
  v_organization_id uuid;
  v_snapshot public.crm_segment_snapshots%rowtype;
  v_actual_count integer;
  v_min_ordinal integer;
  v_max_ordinal integer;
  v_actual_hash text;
  v_version_hash text;
  v_segment_entity_type text;
begin
  v_snapshot_id := case
    when tg_table_name='crm_segment_snapshots' then new.id
    else new.snapshot_id
  end;
  v_organization_id := new.organization_id;

  select *
    into v_snapshot
  from public.crm_segment_snapshots s
  where s.organization_id=v_organization_id
    and s.id=v_snapshot_id;

  if not found then
    raise exception 'CRM Segment Snapshot header is missing';
  end if;

  select v.predicate_hash, s.entity_type
    into v_version_hash, v_segment_entity_type
  from public.crm_segment_versions v
  join public.crm_segments s
    on s.organization_id=v.organization_id
   and s.id=v.segment_id
  where v.organization_id=v_snapshot.organization_id
    and v.segment_id=v_snapshot.segment_id
    and v.version=v_snapshot.segment_version;

  if not found
     or v_snapshot.predicate_hash<>v_version_hash
     or v_snapshot.entity_type<>v_segment_entity_type
  then
    raise exception 'CRM Segment Snapshot semantic-version evidence is inconsistent';
  end if;

  select
    count(*)::integer,
    min(m.ordinal),
    max(m.ordinal),
    md5(
      v_snapshot.entity_type || ':' ||
      v_snapshot.segment_version::text || ':' ||
      coalesce(string_agg(m.entity_id::text, ',' order by m.ordinal), '')
    )
  into
    v_actual_count,
    v_min_ordinal,
    v_max_ordinal,
    v_actual_hash
  from public.crm_segment_snapshot_members m
  where m.organization_id=v_snapshot.organization_id
    and m.snapshot_id=v_snapshot.id;

  if v_snapshot.member_count<>v_actual_count
     or v_snapshot.membership_hash<>v_actual_hash
     or (
       v_actual_count>0
       and (v_min_ordinal<>1 or v_max_ordinal<>v_actual_count)
     )
  then
    raise exception 'CRM Segment Snapshot member evidence is inconsistent';
  end if;

  return null;
end;
$$;

drop trigger if exists crm_segment_snapshots_integrity
  on public.crm_segment_snapshots;
create constraint trigger crm_segment_snapshots_integrity
after insert on public.crm_segment_snapshots
deferrable initially deferred
for each row execute function public.validate_crm_segment_snapshot_integrity();

drop trigger if exists crm_segment_snapshot_members_integrity
  on public.crm_segment_snapshot_members;
create constraint trigger crm_segment_snapshot_members_integrity
after insert on public.crm_segment_snapshot_members
deferrable initially deferred
for each row execute function public.validate_crm_segment_snapshot_integrity();

create or replace function public.create_crm_segment_snapshot(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_segment_id uuid,
  p_segment_version integer default null,
  p_purpose text default 'MANUAL',
  p_source_ref text default null,
  p_request_key text default null
)
returns public.crm_segment_snapshots
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_actor_role text;
  v_segment public.crm_segments%rowtype;
  v_definition public.crm_segment_versions%rowtype;
  v_version integer;
  v_purpose text:=upper(trim(coalesce(p_purpose,'')));
  v_source_ref text:=trim(coalesce(p_source_ref,''));
  v_request_key text:=trim(coalesce(p_request_key,''));
  v_existing public.crm_segment_snapshots%rowtype;
  v_snapshot public.crm_segment_snapshots%rowtype;
  v_ids uuid[];
  v_member_count integer;
  v_membership_hash text;
begin
  if current_user<>'service_role' then
    raise exception 'CRM Segment Snapshot creation requires the trusted server boundary';
  end if;

  select m.role
    into v_actor_role
  from public.organization_members m
  where m.organization_id=p_organization_id
    and m.user_id=p_actor_user_id;

  if v_actor_role is null
     or v_actor_role not in ('OWNER','ADMIN','SALES_MANAGER')
  then
    raise exception 'CRM Segment Snapshot creation requires OWNER, ADMIN or SALES_MANAGER';
  end if;

  if v_purpose not in ('MANUAL','CAMPAIGN','WORKFLOW','EXPORT','OTHER')
     or v_source_ref !~ '^[A-Za-z0-9._:/-]{1,240}$'
     or v_request_key !~ '^[A-Za-z0-9._:-]{1,200}$'
  then
    raise exception 'CRM Segment Snapshot creation evidence is invalid';
  end if;

  select *
    into v_segment
  from public.crm_segments s
  where s.organization_id=p_organization_id
    and s.id=p_segment_id;

  if not found then
    raise exception 'CRM Segment not found';
  end if;
  if v_segment.status<>'ACTIVE' then
    raise exception 'Archived CRM Segment cannot be snapshotted';
  end if;

  v_version:=coalesce(p_segment_version,v_segment.current_definition_version);
  if v_version<1 or v_version>v_segment.current_definition_version then
    raise exception 'CRM Segment Snapshot version is invalid';
  end if;

  select *
    into v_definition
  from public.crm_segment_versions v
  where v.organization_id=p_organization_id
    and v.segment_id=p_segment_id
    and v.version=v_version;

  if not found then
    raise exception 'CRM Segment Snapshot definition version not found';
  end if;

  select *
    into v_existing
  from public.crm_segment_snapshots s
  where s.organization_id=p_organization_id
    and s.request_key=v_request_key;

  if found then
    if v_existing.segment_id<>p_segment_id
       or v_existing.segment_version<>v_version
       or v_existing.purpose<>v_purpose
       or v_existing.source_ref<>v_source_ref
    then
      raise exception 'CRM Segment Snapshot request key conflict';
    end if;
    return v_existing;
  end if;

  perform public.crm_validate_segment_v2_predicate_node(
    p_organization_id,
    v_segment.entity_type,
    v_definition.predicate_tree,
    0
  );

  if v_segment.entity_type='LEAD' then
    select coalesce(array_agg(q.id order by q.id),array[]::uuid[])
      into v_ids
    from (
      select l.id
      from public.leads l
      where l.organization_id=p_organization_id
        and public.crm_segment_predicate_matches_v2(
          p_organization_id,'LEAD',l.id,v_definition.predicate_tree
        )
      order by l.id
      limit 10001
    ) q;
  elsif v_segment.entity_type='PERSON' then
    select coalesce(array_agg(q.id order by q.id),array[]::uuid[])
      into v_ids
    from (
      select p.id
      from public.crm_people p
      where p.organization_id=p_organization_id
        and public.crm_segment_predicate_matches_v2(
          p_organization_id,'PERSON',p.id,v_definition.predicate_tree
        )
      order by p.id
      limit 10001
    ) q;
  elsif v_segment.entity_type='DEAL' then
    select coalesce(array_agg(q.id order by q.id),array[]::uuid[])
      into v_ids
    from (
      select d.id
      from public.crm_deals d
      where d.organization_id=p_organization_id
        and public.crm_segment_predicate_matches_v2(
          p_organization_id,'DEAL',d.id,v_definition.predicate_tree
        )
      order by d.id
      limit 10001
    ) q;
  else
    select coalesce(array_agg(q.id order by q.id),array[]::uuid[])
      into v_ids
    from (
      select b.id
      from public.businesses b
      where b.organization_id=p_organization_id
        and public.crm_segment_predicate_matches_v2(
          p_organization_id,'ACCOUNT',b.id,v_definition.predicate_tree
        )
      order by b.id
      limit 10001
    ) q;
  end if;

  v_member_count:=coalesce(cardinality(v_ids),0);
  if v_member_count>10000 then
    raise exception 'CRM Segment Snapshot exceeds the 10000-member RC safety limit';
  end if;

  v_membership_hash:=md5(
    v_segment.entity_type || ':' ||
    v_version::text || ':' ||
    coalesce(array_to_string(v_ids,','),'')
  );

  insert into public.crm_segment_snapshots(
    organization_id,
    segment_id,
    segment_version,
    entity_type,
    predicate_hash,
    member_count,
    membership_hash,
    purpose,
    source_ref,
    request_key,
    created_by_user_id
  ) values (
    p_organization_id,
    p_segment_id,
    v_version,
    v_segment.entity_type,
    v_definition.predicate_hash,
    v_member_count,
    v_membership_hash,
    v_purpose,
    v_source_ref,
    v_request_key,
    p_actor_user_id
  )
  returning * into v_snapshot;

  if v_member_count>0 then
    insert into public.crm_segment_snapshot_members(
      organization_id,snapshot_id,ordinal,entity_id
    )
    select
      p_organization_id,
      v_snapshot.id,
      ordinality::integer,
      entity_id
    from unnest(v_ids) with ordinality as frozen(entity_id,ordinality);
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,
    'USER',
    p_actor_user_id::text,
    'CRM_SEGMENT_SNAPSHOT_CREATED',
    'crm_segment_snapshot',
    v_snapshot.id::text,
    jsonb_build_object(
      'segment_id',p_segment_id,
      'segment_version',v_version,
      'segment_entity_type',v_segment.entity_type,
      'predicate_hash',v_definition.predicate_hash,
      'member_count',v_member_count,
      'membership_hash',v_membership_hash,
      'purpose',v_purpose,
      'source_ref_present',true,
      'request_key_present',true
    )
  );

  return v_snapshot;
end;
$$;

create or replace function public.get_crm_segment_snapshots(
  p_organization_id uuid,
  p_segment_id uuid default null,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns setof public.crm_segment_snapshots
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select s.*
  from public.crm_segment_snapshots s
  where s.organization_id=p_organization_id
    and (p_segment_id is null or s.segment_id=p_segment_id)
    and (
      p_before_created_at is null
      or s.created_at<p_before_created_at
      or (
        s.created_at=p_before_created_at
        and p_before_id is not null
        and s.id<p_before_id
      )
    )
  order by s.created_at desc,s.id desc
  limit least(greatest(coalesce(p_limit,50),1),101);
$$;

create or replace function public.get_crm_segment_snapshot_members(
  p_organization_id uuid,
  p_snapshot_id uuid,
  p_limit integer default 100,
  p_after_ordinal integer default null
)
returns table(
  ordinal integer,
  entity_id uuid
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select m.ordinal,m.entity_id
  from public.crm_segment_snapshot_members m
  where m.organization_id=p_organization_id
    and m.snapshot_id=p_snapshot_id
    and (p_after_ordinal is null or m.ordinal>p_after_ordinal)
  order by m.ordinal
  limit least(greatest(coalesce(p_limit,100),1),101);
$$;

revoke all on public.crm_segment_snapshots
  from public,anon,authenticated,service_role;
revoke all on public.crm_segment_snapshot_members
  from public,anon,authenticated,service_role;

grant select on public.crm_segment_snapshots to authenticated;
grant select on public.crm_segment_snapshot_members to authenticated;
grant select,insert on public.crm_segment_snapshots to service_role;
grant select,insert on public.crm_segment_snapshot_members to service_role;

revoke all on function public.create_crm_segment_snapshot(
  uuid,uuid,uuid,integer,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.create_crm_segment_snapshot(
  uuid,uuid,uuid,integer,text,text,text
) to service_role;

revoke all on function public.get_crm_segment_snapshots(
  uuid,uuid,integer,timestamptz,uuid
) from public,anon,service_role;
grant execute on function public.get_crm_segment_snapshots(
  uuid,uuid,integer,timestamptz,uuid
) to authenticated;

revoke all on function public.get_crm_segment_snapshot_members(
  uuid,uuid,integer,integer
) from public,anon,service_role;
grant execute on function public.get_crm_segment_snapshot_members(
  uuid,uuid,integer,integer
) to authenticated;

grant execute on function public.crm_validate_segment_v2_predicate_node(
  uuid,text,jsonb,integer
) to service_role;
grant execute on function public.crm_segment_predicate_matches_v2(
  uuid,text,uuid,jsonb
) to service_role;

revoke all on function public.guard_crm_segment_snapshot_immutable()
  from public,anon,authenticated,service_role;
revoke all on function public.validate_crm_segment_snapshot_integrity()
  from public,anon,authenticated,service_role;

comment on table public.crm_segment_snapshots is
  'Immutable audience snapshot header for an exact canonical Segment semantic version. Snapshot membership is not consent or send permission.';
comment on table public.crm_segment_snapshot_members is
  'Immutable exact entity IDs frozen for a Segment Snapshot. Entity IDs intentionally do not FK to live CRM entities so later retention cannot rewrite historical membership.';
comment on function public.create_crm_segment_snapshot(uuid,uuid,uuid,integer,text,text,text) is
  'Trusted bounded Segment Snapshot creation. Freezes <=10000 exact entity IDs from one immutable Segment version with membership integrity hash and audit evidence.';
