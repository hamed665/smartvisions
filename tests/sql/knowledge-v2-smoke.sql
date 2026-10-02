\set ON_ERROR_STOP on

begin;

insert into public.organizations(id,name)
values ('00000000-0000-0000-0000-00000000f701','Knowledge V2 CI')
on conflict (id) do nothing;

insert into auth.users(id)
values
  ('00000000-0000-0000-0000-00000000f711'),
  ('00000000-0000-0000-0000-00000000f712')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role)
values
  ('00000000-0000-0000-0000-00000000f701','00000000-0000-0000-0000-00000000f711','OWNER'),
  ('00000000-0000-0000-0000-00000000f701','00000000-0000-0000-0000-00000000f712','VIEWER')
on conflict (organization_id,user_id) do update set role=excluded.role;

reset role;
set role service_role;

do $direct_source_guard$
begin
  begin
    insert into public.knowledge_sources(
      organization_id,source_key,source_type,title,scope_type,sensitivity,status,
      refresh_policy,metadata,version,last_request_key,created_by_user_id,updated_by_user_id
    ) values (
      '00000000-0000-0000-0000-00000000f701','forbidden_direct','FAQ','Forbidden',
      'ORGANIZATION','INTERNAL','ACTIVE','MANUAL','{}'::jsonb,1,'direct-source-ci',
      '00000000-0000-0000-0000-00000000f711','00000000-0000-0000-0000-00000000f711'
    );
    raise exception 'Direct Knowledge Source insert unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Knowledge Source mutation requires governed command%' then raise; end if;
  end;
end;
$direct_source_guard$;

do $source_and_review_contract$
declare
  s public.knowledge_sources%rowtype;
  replayed public.knowledge_sources%rowtype;
  staged record;
  staged_again record;
  changed record;
  approved public.knowledge_versions%rowtype;
  rejected public.knowledge_versions%rowtype;
  active_before uuid;
  resolved_count integer;
begin
  select * into s from public.configure_knowledge_source_v2(
    '00000000-0000-0000-0000-00000000f701',
    '00000000-0000-0000-0000-00000000f711',
    'support_faq','FAQ','Support FAQ',null,'ORGANIZATION',null,null,
    'INTERNAL','ACTIVE','INTERVAL',60,'{"owner":"support"}'::jsonb,
    null,'knowledge-source-ci-1'
  );
  if s.version<>1 or s.source_key<>'support_faq' or s.stale_after_at is null then
    raise exception 'Knowledge Source first configuration/freshness contract failed';
  end if;

  select * into replayed from public.configure_knowledge_source_v2(
    '00000000-0000-0000-0000-00000000f701',
    '00000000-0000-0000-0000-00000000f711',
    'support_faq','FAQ','Support FAQ',null,'ORGANIZATION',null,null,
    'INTERNAL','ACTIVE','INTERVAL',60,'{"owner":"support"}'::jsonb,
    null,'knowledge-source-ci-1'
  );
  if replayed.id<>s.id or replayed.version<>1 then
    raise exception 'Knowledge Source request replay changed state';
  end if;

  select * into staged from public.stage_knowledge_version_v2(
    '00000000-0000-0000-0000-00000000f701',
    '00000000-0000-0000-0000-00000000f711',
    s.id,'support_faq','{"text":"Approved answer candidate one."}'::jsonb,
    '{"ingestion":"CI_FIXTURE"}'::jsonb,1,null,null,'knowledge-stage-ci-1'
  );
  if staged.resolved_version<>1 or staged.approval_state<>'PENDING_REVIEW' or staged.unchanged then
    raise exception 'External Knowledge ingestion did not stage reviewable v1';
  end if;

  if exists(
    select 1 from public.knowledge_versions
    where organization_id='00000000-0000-0000-0000-00000000f701'
      and knowledge_key='support_faq' and active
  ) then raise exception 'Staged Knowledge silently became active'; end if;

  if exists(
    select 1 from public.get_knowledge_context_v2(
      '00000000-0000-0000-0000-00000000f701',null,null,false,20
    ) where knowledge_key='support_faq'
  ) then raise exception 'Pending Knowledge leaked into retrieval'; end if;

  select * into staged_again from public.stage_knowledge_version_v2(
    '00000000-0000-0000-0000-00000000f701',
    '00000000-0000-0000-0000-00000000f711',
    s.id,'support_faq','{"text":"Approved answer candidate one."}'::jsonb,
    '{"ingestion":"CI_FIXTURE"}'::jsonb,2,null,null,'knowledge-stage-ci-2'
  );
  if staged_again.version_id<>staged.version_id or not staged_again.unchanged then
    raise exception 'Identical pending refresh manufactured another Knowledge version';
  end if;

  select * into approved from public.approve_knowledge_version_v2(
    '00000000-0000-0000-0000-00000000f701',
    '00000000-0000-0000-0000-00000000f711',
    staged.version_id,'knowledge-approve-ci-1'
  );
  if not approved.active or approved.approval_status<>'APPROVED' then
    raise exception 'Knowledge approval did not activate v1';
  end if;
  active_before:=approved.id;

  select count(*) into resolved_count
  from public.get_knowledge_context_v2(
    '00000000-0000-0000-0000-00000000f701',null,null,false,20
  ) where knowledge_key='support_faq';
  if resolved_count<>1 then raise exception 'Approved fresh Knowledge did not resolve'; end if;

  select * into changed from public.stage_knowledge_version_v2(
    '00000000-0000-0000-0000-00000000f701',
    '00000000-0000-0000-0000-00000000f711',
    s.id,'support_faq','{"text":"Conflicting candidate two."}'::jsonb,
    '{"ingestion":"CI_FIXTURE"}'::jsonb,3,null,null,'knowledge-stage-ci-3'
  );
  if changed.resolved_version<>2 then raise exception 'Changed source did not create Knowledge v2'; end if;
  if not exists(
    select 1 from public.knowledge_versions
    where id=changed.version_id and approval_status='PENDING_REVIEW'
      and conflict_state='POTENTIAL' and active=false
  ) then raise exception 'Conflicting source change was not review-gated'; end if;
  if not exists(select 1 from public.knowledge_versions where id=active_before and active=true) then
    raise exception 'Pending conflicting change displaced approved truth';
  end if;

  select * into rejected from public.reject_knowledge_version_v2(
    '00000000-0000-0000-0000-00000000f701',
    '00000000-0000-0000-0000-00000000f711',
    changed.version_id,'Contradicts approved source','knowledge-reject-ci-1'
  );
  if rejected.approval_status<>'REJECTED' or rejected.retrieval_enabled then
    raise exception 'Knowledge rejection contract failed';
  end if;
end;
$source_and_review_contract$;

do $manual_publish_contract$
declare
  v1 record;
  replayed record;
begin
  select * into v1 from public.publish_manual_knowledge_v2(
    '00000000-0000-0000-0000-00000000f701',
    '00000000-0000-0000-0000-00000000f711',
    'owner_policy','{"text":"Owner approved policy."}'::jsonb,'knowledge-manual-ci-1'
  );
  if v1.resolved_version<>1 or v1.unchanged then raise exception 'Manual Knowledge publish failed'; end if;

  select * into replayed from public.publish_manual_knowledge_v2(
    '00000000-0000-0000-0000-00000000f701',
    '00000000-0000-0000-0000-00000000f711',
    'owner_policy','{"text":"Owner approved policy."}'::jsonb,'knowledge-manual-ci-2'
  );
  if replayed.version_id<>v1.version_id or not replayed.unchanged then
    raise exception 'Unchanged manual Knowledge manufactured a new version';
  end if;
end;
$manual_publish_contract$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000f712',false);

do $viewer_rls_contract$
declare
  v_versions integer;
  v_sources integer;
begin
  select count(*) into v_versions
  from public.knowledge_versions
  where organization_id='00000000-0000-0000-0000-00000000f701';

  if v_versions<>2 then
    raise exception 'Viewer should see only the two active approved Knowledge rows, got %',v_versions;
  end if;

  select count(*) into v_sources
  from public.knowledge_sources
  where organization_id='00000000-0000-0000-0000-00000000f701';
  if v_sources<>0 then raise exception 'Viewer can inspect manager-only Knowledge Source provenance'; end if;

  if has_table_privilege('authenticated','public.knowledge_versions','INSERT')
     or has_table_privilege('authenticated','public.knowledge_versions','UPDATE')
     or has_table_privilege('authenticated','public.knowledge_versions','DELETE')
     or has_table_privilege('authenticated','public.knowledge_sources','INSERT')
     or has_table_privilege('authenticated','public.knowledge_sources','UPDATE')
  then raise exception 'Authenticated browser can directly mutate Knowledge V2 tables'; end if;

  if has_function_privilege(
    'authenticated',
    'public.stage_knowledge_version_v2(uuid,uuid,uuid,text,jsonb,jsonb,integer,text,text,text)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.approve_knowledge_version_v2(uuid,uuid,uuid,text)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.publish_manual_knowledge_v2(uuid,uuid,text,jsonb,text)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'Trusted Knowledge V2 mutation leaked to authenticated'; end if;
end;
$viewer_rls_contract$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $authority_contract$
begin
  if to_regprocedure('public.publish_knowledge_version(uuid,text,jsonb)') is not null
     and has_function_privilege(
       'authenticated',
       to_regprocedure('public.publish_knowledge_version(uuid,text,jsonb)'),
       'EXECUTE'
     )
  then raise exception 'Legacy Knowledge publisher remains browser executable'; end if;

  if not has_function_privilege(
    'service_role',
    'public.get_knowledge_context_v2(uuid,uuid,uuid,boolean,integer)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'Canonical Knowledge V2 retrieval is not service executable'; end if;

  if to_regclass('public.knowledge_items') is not null
     or to_regclass('public.knowledge_vectors') is not null
     or to_regclass('public.knowledge_ingestion_queue') is not null
  then raise exception 'KNOWLEDGE-V2 created a parallel Knowledge authority/queue'; end if;
end;
$authority_contract$;

rollback;
