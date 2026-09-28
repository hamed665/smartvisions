\set ON_ERROR_STOP on

create temp table customer_success_side_effect_baseline as
select
  (select count(*) from public.outreach_messages) as outreach_count,
  (select count(*) from public.conversation_messages) as message_count,
  (select count(*) from public.usage_events) as usage_count;

grant select on customer_success_side_effect_baseline to service_role;

set role service_role;

-- Promote only a disposable CI Account through the canonical Account authority.
select *
from public.set_crm_account_lifecycle_manual(
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c001',
  '10000000-0000-0000-0000-000000000c02',
  'CUSTOMER',
  'Customer Success controlled smoke',
  '{"marker":"customer-success-private"}'::jsonb
);

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $customer_success_derived_onboarding$
declare
  v_row record;
begin
  select * into v_row
  from public.get_customer_success_accounts(
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c02',
    1
  );

  if v_row.business_id is null
     or v_row.account_lifecycle<>'CUSTOMER'
     or v_row.onboarding_state<>'NOT_STARTED'
     or v_row.health_score<0
     or v_row.health_score>100
     or v_row.suggested_action_kind<>'ONBOARDING'
  then
    raise exception 'Customer Success explainable onboarding/health derivation failed: %',to_jsonb(v_row);
  end if;

  begin
    insert into public.crm_tasks(
      organization_id,business_id,task_type,title,status,priority,
      assignee_user_id,source_type,source_id,request_key,creator_type,created_by_user_id,metadata
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c02',
      'MEETING','Fabricated Customer Success task','OPEN','NORMAL',
      '00000000-0000-0000-0000-00000000c001',
      'CUSTOMER_SUCCESS','ONBOARDING:10000000-0000-0000-0000-000000000c02',
      'customer-success-direct-fabrication','USER',
      '00000000-0000-0000-0000-00000000c001','{}'::jsonb
    );
    raise exception 'Browser fabricated CUSTOMER_SUCCESS Task directly';
  exception when others then
    if sqlerrm not like 'CUSTOMER_SUCCESS CRM task requires trusted governed materialization%'
       and sqlerrm not like 'new row violates row-level security policy%'
       and sqlerrm not like 'permission denied for table crm_tasks%'
    then raise; end if;
  end;
end;
$customer_success_derived_onboarding$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

create temp table customer_success_results(
  task_id uuid,
  referral_id uuid
);
grant select,insert,update on customer_success_results to service_role,authenticated;

do $customer_success_task_acceptance$
declare
  v_first uuid;
  v_second uuid;
  v_replayed boolean;
begin
  select resolved_task_id,replayed into v_first,v_replayed
  from public.accept_customer_success_task_candidate(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c02',
    'ONBOARDING',
    '00000000-0000-0000-0000-00000000c001',
    null,null,
    'customer-success-onboarding-accept'
  );
  if v_first is null or v_replayed then
    raise exception 'Customer Success onboarding Task was not materialized';
  end if;

  select resolved_task_id,replayed into v_second,v_replayed
  from public.accept_customer_success_task_candidate(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c02',
    'ONBOARDING',
    '00000000-0000-0000-0000-00000000c001',
    null,null,
    'customer-success-onboarding-accept'
  );
  if v_second is distinct from v_first or not v_replayed then
    raise exception 'Customer Success Task replay failed';
  end if;

  insert into customer_success_results(task_id) values(v_first);
end;
$customer_success_task_acceptance$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $customer_success_task_provenance$
declare
  v_task uuid;
begin
  select task_id into v_task from customer_success_results limit 1;
  if not exists (
    select 1 from public.crm_tasks
    where id=v_task
      and source_type='CUSTOMER_SUCCESS'
      and source_id='ONBOARDING:10000000-0000-0000-0000-000000000c02'
      and creator_type='SYSTEM'
      and created_by_user_id is null
      and metadata->>'acceptedByUserId'='00000000-0000-0000-0000-00000000c001'
  ) then
    raise exception 'Customer Success Task provenance is incorrect under authenticated RLS';
  end if;
end;
$customer_success_task_provenance$;

update public.crm_tasks
set status='DONE',completion_note='Controlled onboarding complete'
where id=(select task_id from customer_success_results limit 1);

do $customer_success_onboarding_completed$
declare
  v_row record;
begin
  select * into v_row
  from public.get_customer_success_accounts(
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c02',
    1
  );
  if v_row.onboarding_state<>'COMPLETE' then
    raise exception 'Completed canonical CRM Task did not close onboarding state';
  end if;

  begin
    insert into public.customer_loyalty_events(
      organization_id,business_id,event_type,points_delta,source_type,source_ref,
      request_key,recorded_by_user_id,occurred_at
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c02',
      'EARN',10,'MANUAL','browser-fabrication','customer-loyalty-browser-fabrication',
      '00000000-0000-0000-0000-00000000c001',now()
    );
    raise exception 'Browser inserted loyalty event directly';
  exception when others then
    if sqlerrm not like 'permission denied for table customer_loyalty_events%'
       and sqlerrm not like 'new row violates row-level security policy%'
    then raise; end if;
  end;
end;
$customer_success_onboarding_completed$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $customer_loyalty_ledger$
declare
  v_event uuid;
  v_balance bigint;
  v_replayed boolean;
begin
  select resolved_event_id,balance_after,replayed into v_event,v_balance,v_replayed
  from public.record_customer_loyalty_event(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c02',
    null,'EARN',100,'WELCOME_100','MANUAL','controlled-smoke',now(),
    'customer-loyalty-earn-100','{"controlled":true}'::jsonb
  );
  if v_balance<>100 or v_replayed then raise exception 'Loyalty EARN failed'; end if;

  select resolved_event_id,balance_after,replayed into v_event,v_balance,v_replayed
  from public.record_customer_loyalty_event(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c02',
    null,'EARN',100,'WELCOME_100','MANUAL','controlled-smoke',now(),
    'customer-loyalty-earn-100','{"controlled":true}'::jsonb
  );
  if v_balance<>100 or not v_replayed then raise exception 'Loyalty replay failed'; end if;

  select balance_after into v_balance
  from public.record_customer_loyalty_event(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c02',
    null,'REDEEM',-30,'WELCOME_REDEEM','MANUAL','controlled-redeem',now(),
    'customer-loyalty-redeem-30','{}'::jsonb
  );
  if v_balance<>70 then raise exception 'Loyalty REDEEM balance failed'; end if;

  begin
    perform * from public.record_customer_loyalty_event(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      '10000000-0000-0000-0000-000000000c02',
      null,'REDEEM',-1000,null,'MANUAL','overdraft-test',now(),
      'customer-loyalty-overdraft','{}'::jsonb
    );
    raise exception 'Loyalty ledger allowed negative balance';
  exception when others then
    if sqlerrm not like 'Customer loyalty balance cannot become negative%' then raise; end if;
  end;
end;
$customer_loyalty_ledger$;

do $customer_referral_lifecycle$
declare
  v_referral uuid;
  v_status text;
  v_replayed boolean;
  v_balance bigint;
begin
  select resolved_referral_id,replayed into v_referral,v_replayed
  from public.record_customer_referral(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c02',
    null,
    '20000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    'controlled-referral-source',
    now()-interval '1 day',
    'customer-referral-controlled',
    '{"marker":"referral-private-evidence"}'::jsonb
  );
  if v_referral is null or v_replayed then raise exception 'Referral record failed'; end if;

  select resolved_status into v_status
  from public.transition_customer_referral(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_referral,'QUALIFY','{"evidence":"controlled qualification"}'::jsonb
  );
  if v_status<>'QUALIFIED' then raise exception 'Referral qualification failed'; end if;

  select resolved_status into v_status
  from public.transition_customer_referral(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_referral,'CONVERT','{"evidence":"canonical Deal check"}'::jsonb
  );
  if v_status<>'CONVERTED' then raise exception 'Referral canonical conversion failed'; end if;

  select balance_after into v_balance
  from public.record_customer_loyalty_event(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    '10000000-0000-0000-0000-000000000c02',
    null,'EARN',25,'REFERRAL_REWARD','REFERRAL',v_referral::text,now(),
    'customer-referral-loyalty-reward','{}'::jsonb
  );
  if v_balance<>95 then raise exception 'Referral loyalty reward ledger failed'; end if;

  select resolved_status into v_status
  from public.transition_customer_referral(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_referral,'REWARD','{"evidence":"loyalty ledger verified"}'::jsonb
  );
  if v_status<>'REWARDED' then raise exception 'Referral reward transition failed'; end if;

  update customer_success_results set referral_id=v_referral where task_id is not null;
end;
$customer_referral_lifecycle$;

do $customer_success_campaign_classification$
declare
  v_campaign uuid;
  v_status text;
  v_lifecycle text;
  v_replayed boolean;
begin
  select id,status into v_campaign,v_status
  from public.campaigns
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and last_request_key='marketing-campaign-create';

  if v_campaign is null then raise exception 'Controlled MARKETING Campaign fixture missing'; end if;

  if v_status='RUNNING' then
    perform public.transition_marketing_campaign(
      '00000000-0000-0000-0000-000000000c01',
      '00000000-0000-0000-0000-00000000c001',
      v_campaign,'PAUSE'
    );
  end if;

  select resolved_lifecycle,replayed into v_lifecycle,v_replayed
  from public.set_marketing_campaign_customer_success_lifecycle(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_campaign,'REACTIVATION'
  );
  if v_lifecycle<>'REACTIVATION' or v_replayed then
    raise exception 'Lifecycle Campaign classification failed';
  end if;

  select resolved_lifecycle,replayed into v_lifecycle,v_replayed
  from public.set_marketing_campaign_customer_success_lifecycle(
    '00000000-0000-0000-0000-000000000c01',
    '00000000-0000-0000-0000-00000000c001',
    v_campaign,'REACTIVATION'
  );
  if v_lifecycle<>'REACTIVATION' or not v_replayed then
    raise exception 'Lifecycle Campaign classification replay failed';
  end if;
end;
$customer_success_campaign_classification$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $customer_success_read_and_security$
declare
  v_summary record;
begin
  select * into v_summary
  from public.get_customer_success_summary('00000000-0000-0000-0000-000000000c01');

  if v_summary.customer_account_count<1
     or v_summary.loyalty_points_balance<>95
     or v_summary.referral_count<1
     or v_summary.rewarded_referral_count<1
     or v_summary.lifecycle_campaign_count<1
  then
    raise exception 'Customer Success summary is incomplete: %',to_jsonb(v_summary);
  end if;

  if has_function_privilege(
       'authenticated',
       'public.accept_customer_success_task_candidate(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.record_customer_loyalty_event(uuid,uuid,uuid,uuid,text,integer,text,text,text,timestamptz,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.record_customer_referral(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.transition_customer_referral(uuid,uuid,uuid,text,jsonb)',
       'EXECUTE'
     )
  then
    raise exception 'Customer Success trusted mutation RPC is browser-executable';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.get_customer_success_accounts(uuid,uuid,integer)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.get_customer_success_summary(uuid)',
       'EXECUTE'
     )
  then
    raise exception 'Customer Success authenticated read grants are incomplete';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'get_customer_success_accounts','get_customer_success_summary',
        'accept_customer_success_task_candidate','record_customer_loyalty_event',
        'record_customer_referral','transition_customer_referral',
        'set_marketing_campaign_customer_success_lifecycle'
      )
      and p.prosecdef
  ) then
    raise exception 'Customer Success function unexpectedly uses SECURITY DEFINER';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='customer_loyalty_events'
  ) or not (
    select c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='customer_referrals'
  ) then
    raise exception 'Customer Success RLS is not enabled';
  end if;
end;
$customer_success_read_and_security$;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $customer_success_audit_privacy$
begin
  if not exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and action='CUSTOMER_LOYALTY_EVENT_RECORDED'
  ) or not exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and action='CUSTOMER_REFERRAL_TRANSITIONED'
  ) then
    raise exception 'Customer Success audit evidence is incomplete';
  end if;

  if exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and (
        coalesce(before_data::text,'') ilike '%referral-private-evidence%'
        or coalesce(after_data::text,'') ilike '%referral-private-evidence%'
      )
  ) then
    raise exception 'Customer Success audit leaked raw referral evidence';
  end if;
end;
$customer_success_audit_privacy$;

do $customer_success_no_send_side_effect$
declare
  v_base customer_success_side_effect_baseline%rowtype;
begin
  select * into v_base from customer_success_side_effect_baseline;
  if (select count(*) from public.outreach_messages)<>v_base.outreach_count
     or (select count(*) from public.conversation_messages)<>v_base.message_count
     or (select count(*) from public.usage_events)<>v_base.usage_count
  then
    raise exception 'Customer Success controlled operations caused outbound/provider usage side effects';
  end if;
end;
$customer_success_no_send_side_effect$;

-- Restore the shared Account fixture through the canonical Account authority.
select *
from public.set_crm_account_lifecycle_manual(
  '00000000-0000-0000-0000-000000000c01',
  '00000000-0000-0000-0000-00000000c001',
  '10000000-0000-0000-0000-000000000c02',
  'UNCLASSIFIED',
  'Restore Customer Success controlled smoke',
  '{"restore":true}'::jsonb
);

reset role;
