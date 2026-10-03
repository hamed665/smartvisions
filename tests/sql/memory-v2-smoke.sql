\set ON_ERROR_STOP on

begin;

insert into public.organizations(id,name)
values ('00000000-0000-0000-0000-00000000f801','Memory V2 CI')
on conflict (id) do nothing;

insert into auth.users(id)
values
  ('00000000-0000-0000-0000-00000000f811'),
  ('00000000-0000-0000-0000-00000000f812')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role)
values
  ('00000000-0000-0000-0000-00000000f801','00000000-0000-0000-0000-00000000f811','OWNER'),
  ('00000000-0000-0000-0000-00000000f801','00000000-0000-0000-0000-00000000f812','VIEWER')
on conflict (organization_id,user_id) do update set role=excluded.role;

insert into public.businesses(
  id,organization_id,name,country_code
) values (
  '00000000-0000-0000-0000-00000000f821',
  '00000000-0000-0000-0000-00000000f801',
  'Memory CI Customer Business','OM'
)
on conflict (id) do nothing;

insert into public.crm_identities(
  id,organization_id,identity_type,normalized_value,display_value,status
) values (
  '00000000-0000-0000-0000-00000000f831',
  '00000000-0000-0000-0000-00000000f801',
  'EMAIL','memory-ci@example.test','memory-ci@example.test','ACTIVE'
)
on conflict (id) do nothing;

insert into public.crm_people(
  id,organization_id,created_from_identity_id,display_name,status
) values (
  '00000000-0000-0000-0000-00000000f841',
  '00000000-0000-0000-0000-00000000f801',
  '00000000-0000-0000-0000-00000000f831',
  'Memory CI Person','ACTIVE'
)
on conflict (id) do nothing;

insert into public.businesses(
  id,organization_id,name,country_code
) values (
  '00000000-0000-0000-0000-00000000f822',
  '00000000-0000-0000-0000-00000000f801',
  'Memory CI Second Business','OM'
)
on conflict (id) do nothing;

insert into public.crm_identities(
  id,organization_id,identity_type,normalized_value,display_value,status
) values (
  '00000000-0000-0000-0000-00000000f832',
  '00000000-0000-0000-0000-00000000f801',
  'EMAIL','memory-ci-2@example.test','memory-ci-2@example.test','ACTIVE'
)
on conflict (id) do nothing;

insert into public.crm_people(
  id,organization_id,created_from_identity_id,display_name,status
) values (
  '00000000-0000-0000-0000-00000000f842',
  '00000000-0000-0000-0000-00000000f801',
  '00000000-0000-0000-0000-00000000f832',
  'Memory CI Second Person','ACTIVE'
)
on conflict (id) do nothing;

insert into public.crm_person_business_relationships(
  id,organization_id,person_id,business_id,relationship_type,job_title,
  verification_method,source_ref,evidence,status
) values (
  '00000000-0000-0000-0000-00000000f852',
  '00000000-0000-0000-0000-00000000f801',
  '00000000-0000-0000-0000-00000000f842',
  '00000000-0000-0000-0000-00000000f822',
  'CONTACT',null,'MANUAL_CONFIRMED','memory-ci-relationship-2',
  '{"fixture":true}'::jsonb,'ACTIVE'
)
on conflict (id) do nothing;

insert into public.crm_person_business_relationships(
  id,organization_id,person_id,business_id,relationship_type,job_title,
  verification_method,source_ref,evidence,status
) values (
  '00000000-0000-0000-0000-00000000f851',
  '00000000-0000-0000-0000-00000000f801',
  '00000000-0000-0000-0000-00000000f841',
  '00000000-0000-0000-0000-00000000f821',
  'DECISION_MAKER','Owner','MANUAL_CONFIRMED','memory-ci-relationship',
  '{"fixture":true}'::jsonb,'ACTIVE'
)
on conflict (id) do nothing;

insert into public.sales_conversations(
  id,organization_id,channel,summary,stage,sales_state
) values (
  '00000000-0000-0000-0000-00000000f861',
  '00000000-0000-0000-0000-00000000f801',
  'WHATSAPP','Memory CI conversation','ACTIVE',
  '{"version":1,"objective":"controlled memory smoke"}'::jsonb
)
on conflict (id) do nothing;

insert into public.conversation_messages(
  id,organization_id,conversation_id,channel,direction,original_text,status,metadata
) values (
  '00000000-0000-0000-0000-00000000f871',
  '00000000-0000-0000-0000-00000000f801',
  '00000000-0000-0000-0000-00000000f861',
  'WHATSAPP','INBOUND','Please remember the approved follow-up preference.','RECEIVED',
  '{"fixture":true}'::jsonb
)
on conflict (id) do nothing;

reset role;
set role service_role;

select *
from public.link_crm_customer360_person_context(
  '00000000-0000-0000-0000-00000000f801',
  '00000000-0000-0000-0000-00000000f811',
  'CONVERSATION',
  '00000000-0000-0000-0000-00000000f861',
  '00000000-0000-0000-0000-00000000f841',
  'MANUAL_CONFIRMED',
  'memory-ci-conversation',
  '{"fixture":true}'::jsonb
);

insert into public.agent_runs(
  id,organization_id,conversation_id,input_message,status,trace,request_key
) values (
  '00000000-0000-0000-0000-00000000f881',
  '00000000-0000-0000-0000-00000000f801',
  '00000000-0000-0000-0000-00000000f861',
  'Controlled Memory agent source','COMPLETED','{"fixture":true}'::jsonb,
  'memory-agent-run-ci'
)
on conflict (id) do nothing;

do $direct_guard$
begin
  begin
    insert into public.memory_items(
      organization_id,memory_key,memory_type,version,payload,state,
      source_type,source_ref,source_evidence,confidence,observed_at,sensitivity,
      valid_from,retrieval_enabled,content_hash,last_request_key
    ) values (
      '00000000-0000-0000-0000-00000000f801','forbidden.direct','EPISODIC',1,
      '{"text":"forbidden"}'::jsonb,'PENDING_REVIEW','SYSTEM_DERIVED','fixture',
      '{"fixture":true}'::jsonb,0.8,now(),'INTERNAL',now(),false,
      md5('forbidden'),'memory-direct-ci'
    );
    raise exception 'Direct Memory insert unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'Memory item mutation requires governed command%' then raise; end if;
  end;
end;
$direct_guard$;

do $memory_lifecycle$
declare
  staged record;
  replayed record;
  approved public.memory_items%rowtype;
  corrected_candidate record;
  corrected public.memory_items%rowtype;
  agent_candidate record;
  stale_candidate record;
  stale_item public.memory_items%rowtype;
  second_target_candidate record;
  second_target_active public.memory_items%rowtype;
  type_count integer;
  derived_count integer;
  same_key_active_count integer;
begin
  select * into staged from public.stage_memory_item_v2(
    '00000000-0000-0000-0000-00000000f801','USER',
    '00000000-0000-0000-0000-00000000f811',
    'customer.followup_window','WORKING',
    '{"text":"Follow up tomorrow afternoon."}'::jsonb,
    'CONVERSATION_MESSAGE','00000000-0000-0000-0000-00000000f871',
    '{"reason":"explicit customer request"}'::jsonb,0.95,now(),now()+interval '12 hours',
    'CONFIDENTIAL',now(),null,now()+interval '24 hours',
    '00000000-0000-0000-0000-00000000f841',
    '00000000-0000-0000-0000-00000000f821',
    '00000000-0000-0000-0000-00000000f861',
    null,null,'memory-stage-ci-1'
  );
  if staged.resolved_version<>1 or staged.review_state<>'PENDING_REVIEW' or staged.unchanged then
    raise exception 'Memory first stage contract failed';
  end if;

  select * into replayed from public.stage_memory_item_v2(
    '00000000-0000-0000-0000-00000000f801','USER',
    '00000000-0000-0000-0000-00000000f811',
    'customer.followup_window','WORKING',
    '{"text":"Follow up tomorrow afternoon."}'::jsonb,
    'CONVERSATION_MESSAGE','00000000-0000-0000-0000-00000000f871',
    '{"reason":"explicit customer request"}'::jsonb,0.95,now(),now()+interval '12 hours',
    'CONFIDENTIAL',now(),null,now()+interval '24 hours',
    '00000000-0000-0000-0000-00000000f841',
    '00000000-0000-0000-0000-00000000f821',
    '00000000-0000-0000-0000-00000000f861',
    null,null,'memory-stage-ci-1'
  );
  if replayed.memory_id<>staged.memory_id or not replayed.unchanged then
    raise exception 'Memory request replay changed candidate';
  end if;

  select count(*) into derived_count
  from public.get_memory_context_v2(
    '00000000-0000-0000-0000-00000000f801',
    '00000000-0000-0000-0000-00000000f841',
    '00000000-0000-0000-0000-00000000f821',
    '00000000-0000-0000-0000-00000000f861',
    false,false,100
  ) where memory_type='WORKING';
  if derived_count<>0 then raise exception 'Pending Memory leaked into retrieval'; end if;

  select * into approved from public.approve_memory_item_v2(
    '00000000-0000-0000-0000-00000000f801',
    '00000000-0000-0000-0000-00000000f811',
    staged.memory_id,'memory-approve-ci-1'
  );
  if approved.state<>'ACTIVE' or not approved.retrieval_enabled then
    raise exception 'Memory approval did not activate retrieval';
  end if;

  select count(distinct memory_type) into type_count
  from public.get_memory_context_v2(
    '00000000-0000-0000-0000-00000000f801',
    '00000000-0000-0000-0000-00000000f841',
    '00000000-0000-0000-0000-00000000f821',
    '00000000-0000-0000-0000-00000000f861',
    false,false,100
  )
  where memory_type in ('CONVERSATION','CUSTOMER','RELATIONSHIP','BUSINESS','WORKING');
  if type_count<>5 then
    raise exception 'Typed Memory resolver did not compose canonical + derived memory, got % types',type_count;
  end if;

  select * into corrected_candidate from public.stage_memory_item_v2(
    '00000000-0000-0000-0000-00000000f801','USER',
    '00000000-0000-0000-0000-00000000f811',
    'customer.followup_window','WORKING',
    '{"text":"Correction: follow up tomorrow morning."}'::jsonb,
    'OPERATOR','00000000-0000-0000-0000-00000000f811',
    '{"correction":true}'::jsonb,1.0,now(),null,
    'CONFIDENTIAL',now(),null,now()+interval '24 hours',
    '00000000-0000-0000-0000-00000000f841',
    '00000000-0000-0000-0000-00000000f821',
    '00000000-0000-0000-0000-00000000f861',
    approved.id,'Customer corrected the requested follow-up window',
    'memory-correct-stage-ci-1'
  );
  select * into corrected from public.approve_memory_item_v2(
    '00000000-0000-0000-0000-00000000f801',
    '00000000-0000-0000-0000-00000000f811',
    corrected_candidate.memory_id,'memory-correct-approve-ci-1'
  );
  if corrected.version<>2 or corrected.state<>'ACTIVE' then
    raise exception 'Memory correction did not activate v2';
  end if;
  if not exists(
    select 1 from public.memory_items
    where id=approved.id and state='CORRECTED'
      and corrected_by_memory_id=corrected.id and retrieval_enabled=false
  ) then raise exception 'Corrected Memory history was not retained'; end if;

  select * into agent_candidate from public.stage_memory_item_v2(
    '00000000-0000-0000-0000-00000000f801','SYSTEM',null,
    'agent.learning.objection_pattern','AGENT_LEARNING',
    '{"text":"Candidate learning from repeated objection pattern."}'::jsonb,
    'AGENT_RUNTIME','00000000-0000-0000-0000-00000000f881',
    '{"evaluation":"controlled","sourceConversationId":"00000000-0000-0000-0000-00000000f861"}'::jsonb,
    0.70,now(),now()+interval '7 days','INTERNAL',now(),null,now()+interval '30 days',
    '00000000-0000-0000-0000-00000000f841',
    '00000000-0000-0000-0000-00000000f821',
    '00000000-0000-0000-0000-00000000f861',
    null,null,'memory-agent-stage-ci-1'
  );
  if agent_candidate.review_state<>'PENDING_REVIEW' then
    raise exception 'Agent learning bypassed review';
  end if;

  begin
    perform public.stage_memory_item_v2(
      '00000000-0000-0000-0000-00000000f801','SYSTEM',null,
      'agent.learning.invalid_source','AGENT_LEARNING',
      '{"text":"must fail without a canonical run"}'::jsonb,
      'AGENT_RUNTIME','00000000-0000-0000-0000-00000000f899',
      '{"evaluation":"controlled"}'::jsonb,
      0.60,now(),now()+interval '1 day','INTERNAL',now(),null,now()+interval '7 days',
      '00000000-0000-0000-0000-00000000f841',
      '00000000-0000-0000-0000-00000000f821',
      '00000000-0000-0000-0000-00000000f861',
      null,null,'memory-agent-missing-ci'
    );
    raise exception 'Agent Memory accepted a missing canonical agent run';
  exception when others then
    if sqlerrm not like 'Memory Agent Runtime source not found%' then raise; end if;
  end;

  select * into stale_candidate from public.stage_memory_item_v2(
    '00000000-0000-0000-0000-00000000f801','SYSTEM',null,
    'ops.stale.example','EPISODIC',
    '{"text":"Historical observation with expired freshness."}'::jsonb,
    'SYSTEM_DERIVED','memory-stale-ci',
    '{"fixture":true}'::jsonb,0.6,now()-interval '2 days',now()-interval '1 day',
    'INTERNAL',now()-interval '2 days',null,now()+interval '5 days',
    null,'00000000-0000-0000-0000-00000000f821',null,
    null,null,'memory-stale-stage-ci-1'
  );
  select * into stale_item from public.approve_memory_item_v2(
    '00000000-0000-0000-0000-00000000f801',
    '00000000-0000-0000-0000-00000000f811',
    stale_candidate.memory_id,'memory-stale-approve-ci-1'
  );
  if exists(
    select 1 from public.get_memory_context_v2(
      '00000000-0000-0000-0000-00000000f801',null,
      '00000000-0000-0000-0000-00000000f821',null,false,false,100
    ) where memory_id=stale_item.id
  ) then raise exception 'Stale Memory leaked into default retrieval'; end if;
  if not exists(
    select 1 from public.get_memory_context_v2(
      '00000000-0000-0000-0000-00000000f801',null,
      '00000000-0000-0000-0000-00000000f821',null,true,false,100
    ) where memory_id=stale_item.id and freshness_state='STALE'
  ) then raise exception 'Explicit stale Memory retrieval did not work'; end if;

  begin
    perform public.stage_memory_item_v2(
      '00000000-0000-0000-0000-00000000f801','USER',
      '00000000-0000-0000-0000-00000000f811',
      'working.too_long','WORKING','{"text":"too long"}'::jsonb,
      'OPERATOR','00000000-0000-0000-0000-00000000f811','{}'::jsonb,
      0.5,now(),null,'INTERNAL',now(),null,now()+interval '31 days',
      null,null,null,null,null,'memory-working-expiry-ci'
    );
    raise exception 'Working Memory accepted expiry beyond 30 days';
  exception when others then
    if sqlerrm not like 'Working Memory requires expiry within 30 days%' then raise; end if;
  end;

  select * into second_target_candidate from public.stage_memory_item_v2(
    '00000000-0000-0000-0000-00000000f801','USER',
    '00000000-0000-0000-0000-00000000f811',
    'customer.followup_window','WORKING',
    '{"text":"Second customer prefers next-week follow-up."}'::jsonb,
    'OPERATOR','00000000-0000-0000-0000-00000000f811',
    '{"fixture":"second-target"}'::jsonb,0.9,now(),now()+interval '12 hours',
    'CONFIDENTIAL',now(),null,now()+interval '24 hours',
    '00000000-0000-0000-0000-00000000f842',
    '00000000-0000-0000-0000-00000000f822',
    null,null,null,'memory-second-target-stage-ci'
  );
  select * into second_target_active from public.approve_memory_item_v2(
    '00000000-0000-0000-0000-00000000f801',
    '00000000-0000-0000-0000-00000000f811',
    second_target_candidate.memory_id,'memory-second-target-approve-ci'
  );

  if second_target_active.version<>1 then
    raise exception 'Second Memory target should start at v1, got %',second_target_active.version;
  end if;

  select count(*) into same_key_active_count
  from public.memory_items
  where organization_id='00000000-0000-0000-0000-00000000f801'
    and memory_key='customer.followup_window' and state='ACTIVE';
  if same_key_active_count<>2 then
    raise exception 'Target-aware Memory identity failed; expected 2 active target variants, got %',same_key_active_count;
  end if;

  begin
    perform public.stage_memory_item_v2(
      '00000000-0000-0000-0000-00000000f801','USER',
      '00000000-0000-0000-0000-00000000f811',
      'source.target.mismatch','EPISODIC',
      '{"text":"must fail"}'::jsonb,
      'CONVERSATION_MESSAGE','00000000-0000-0000-0000-00000000f871',
      '{"fixture":"mismatch"}'::jsonb,0.8,now(),null,
      'CONFIDENTIAL',now(),null,now()+interval '24 hours',
      '00000000-0000-0000-0000-00000000f842',
      '00000000-0000-0000-0000-00000000f822',
      null,null,null,'memory-source-mismatch-ci'
    );
    raise exception 'Memory accepted source evidence from a different Person target';
  exception when others then
    if sqlerrm not like 'Memory source conflicts with Person target%' then raise; end if;
  end;

  perform public.invalidate_memory_item_v2(
    '00000000-0000-0000-0000-00000000f801',
    '00000000-0000-0000-0000-00000000f811',
    corrected.id,'No longer applicable','memory-invalidate-ci-1'
  );
  if exists(
    select 1 from public.get_memory_context_v2(
      '00000000-0000-0000-0000-00000000f801',
      '00000000-0000-0000-0000-00000000f841',
      '00000000-0000-0000-0000-00000000f821',
      '00000000-0000-0000-0000-00000000f861',
      false,false,100
    ) where memory_id=corrected.id
  ) then raise exception 'Invalidated Memory remained retrievable'; end if;
end;
$memory_lifecycle$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000f812',false);

do $viewer_contract$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.memory_items
  where organization_id='00000000-0000-0000-0000-00000000f801';
  if v_count<>0 then raise exception 'Viewer can inspect manager-only Memory registry'; end if;

  if has_table_privilege('authenticated','public.memory_items','INSERT')
     or has_table_privilege('authenticated','public.memory_items','UPDATE')
     or has_table_privilege('authenticated','public.memory_items','DELETE')
  then raise exception 'Authenticated browser can directly mutate Memory V2'; end if;

  if has_function_privilege(
    'authenticated',
    'public.stage_memory_item_v2(uuid,text,uuid,text,text,jsonb,text,text,jsonb,numeric,timestamptz,timestamptz,text,timestamptz,timestamptz,timestamptz,uuid,uuid,uuid,uuid,text,text)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated','public.approve_memory_item_v2(uuid,uuid,uuid,text)'::regprocedure,'EXECUTE'
  ) or has_function_privilege(
    'authenticated','public.get_memory_context_v2(uuid,uuid,uuid,uuid,boolean,boolean,integer)'::regprocedure,'EXECUTE'
  ) then raise exception 'Trusted Memory V2 functions leaked to authenticated'; end if;
end;
$viewer_contract$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $authority_contract$
begin
  if not has_function_privilege(
    'service_role',
    'public.get_memory_context_v2(uuid,uuid,uuid,uuid,boolean,boolean,integer)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'Memory V2 resolver is not service executable'; end if;

  if to_regclass('public.memory_conversations') is not null
     or to_regclass('public.memory_customers') is not null
     or to_regclass('public.memory_businesses') is not null
     or to_regclass('public.memory_vectors') is not null
     or to_regclass('public.agent_learning') is not null
  then raise exception 'MEMORY-V2 created a parallel canonical/learning authority'; end if;
end;
$authority_contract$;

rollback;
