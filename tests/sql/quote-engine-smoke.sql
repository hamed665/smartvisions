\set ON_ERROR_STOP on

-- QUOTE-ENGINE disposable controlled acceptance. Reuses CATALOG-V2 CI fixtures only.

insert into public.businesses(id,organization_id,name,country_code)
values (
  '00000000-0000-0000-0000-00000000d801',
  '00000000-0000-0000-0000-00000000c701',
  'QUOTE Buyer LLC','OM'
)
on conflict (id) do update set name=excluded.name;

insert into public.approval_rules(
  organization_id,action_key,requires_approval,config,mode,
  expiry_minutes,escalation_minutes,allow_delegation,reviewer_roles,delegation_roles,updated_at
) values
(
  '00000000-0000-0000-0000-00000000c701','CUSTOM_QUOTE',true,'{}'::jsonb,'STRICT',
  1440,240,false,array['OWNER']::text[],'{}'::text[],now()
),
(
  '00000000-0000-0000-0000-00000000c701','DISCOUNT_ABOVE_AUTO',true,'{}'::jsonb,'STRICT',
  1440,240,false,array['OWNER']::text[],'{}'::text[],now()
)
on conflict (organization_id,action_key) do update set
  requires_approval=excluded.requires_approval,
  mode=excluded.mode,
  expiry_minutes=excluded.expiry_minutes,
  escalation_minutes=excluded.escalation_minutes,
  allow_delegation=excluded.allow_delegation,
  reviewer_roles=excluded.reviewer_roles,
  delegation_roles=excluded.delegation_roles,
  updated_at=now();

reset role;
set role service_role;

do $direct_quote_guard$
begin
  begin
    insert into public.quotes(
      id,organization_id,tenant_business_id,buyer_business_id,owner_user_id,
      quote_number,created_by_user_id,updated_by_user_id
    ) values (
      '00000000-0000-0000-0000-00000000d899',
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c731',
      '00000000-0000-0000-0000-00000000d801',
      '00000000-0000-0000-0000-00000000c711',
      'Q-000000000000D899',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000c711'
    );
    raise exception 'Direct QUOTE-ENGINE mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'QUOTE-ENGINE state requires governed command%' then raise; end if;
  end;
end;
$direct_quote_guard$;

do $service_quote_lifecycle$
declare
  qid uuid;
  qid_replay uuid;
  q public.quotes%rowtype;
  v public.quote_versions%rowtype;
  r public.quote_version_reviews%rowtype;
  projected jsonb;
begin
  qid:=public.create_quote_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000d811',
    '00000000-0000-0000-0000-00000000c731',
    '00000000-0000-0000-0000-00000000c741',
    null,
    '00000000-0000-0000-0000-00000000d801',
    null,
    '00000000-0000-0000-0000-00000000c711',
    'OM','OMR',now()+interval '14 days',
    'Payment due after accepted commercial terms',
    'CI governed Quote',
    jsonb_build_array(jsonb_build_object(
      'subjectKind','SERVICE',
      'serviceId','catalog_ci_service',
      'quantity',2,
      'discountBps',600,
      'taxBps',500,
      'description','Canonical service scope'
    )),
    'quote-engine-create-service-1'
  );

  if qid<>'00000000-0000-0000-0000-00000000d811' then
    raise exception 'QUOTE-ENGINE returned wrong Quote ID';
  end if;

  qid_replay:=public.create_quote_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000d811',
    '00000000-0000-0000-0000-00000000c731',
    '00000000-0000-0000-0000-00000000c741',
    null,
    '00000000-0000-0000-0000-00000000d801',
    null,
    '00000000-0000-0000-0000-00000000c711',
    'OM','OMR',(select valid_until from public.quote_versions where quote_id=qid and version_no=1),
    'Payment due after accepted commercial terms',
    'CI governed Quote',
    jsonb_build_array(jsonb_build_object(
      'subjectKind','SERVICE',
      'serviceId','catalog_ci_service',
      'quantity',2,
      'discountBps',600,
      'taxBps',500,
      'description','Canonical service scope'
    )),
    'quote-engine-create-service-1'
  );
  if qid_replay<>qid then raise exception 'QUOTE-ENGINE create replay failed'; end if;

  select * into q from public.quotes where id=qid;
  select * into v from public.quote_versions where quote_id=qid and version_no=1;
  select * into r from public.quote_version_reviews where quote_id=qid and version_no=1;

  if q.status<>'DRAFT' or q.current_version<>1 or q.version<>2 then
    raise exception 'QUOTE-ENGINE initial aggregate state is wrong';
  end if;
  if v.subtotal<>200 or v.discount_total<>12 or v.tax_total<>9.4 or v.total<>197.4 then
    raise exception 'QUOTE-ENGINE deterministic totals are wrong: %/%/%/%',
      v.subtotal,v.discount_total,v.tax_total,v.total;
  end if;
  if r.status<>'PENDING'
     or not ('CUSTOM_QUOTE'=any(r.approval_action_keys))
     or not ('DISCOUNT_ABOVE_AUTO'=any(r.approval_action_keys))
     or not ('MANUAL_TAX'=any(r.review_flags))
     or not ('OWNER'=any(r.reviewer_roles))
  then
    raise exception 'QUOTE-ENGINE approval policy snapshot is wrong';
  end if;

  if (select unit_price from public.quote_line_items where quote_id=qid and line_no=1)<>100 then
    raise exception 'QUOTE-ENGINE did not snapshot canonical Service price';
  end if;

  if (select document_snapshot ? 'notes' from public.quote_versions where quote_id=qid and version_no=1)
     or (select document_snapshot::text like '%servicePriceId%' from public.quote_versions where quote_id=qid and version_no=1)
     or (select document_snapshot::text like '%approvalActionKeys%' from public.quote_versions where quote_id=qid and version_no=1)
  then
    raise exception 'QUOTE-ENGINE customer document snapshot leaked internal-only metadata';
  end if;

  update public.service_prices set price=110
  where organization_id='00000000-0000-0000-0000-00000000c701'
    and service_id='catalog_ci_service' and country_code='OM' and currency='OMR';
  if (select unit_price from public.quote_line_items where quote_id=qid and line_no=1)<>100 then
    raise exception 'QUOTE-ENGINE historical price changed after Catalog price edit';
  end if;
  update public.service_prices set price=100
  where organization_id='00000000-0000-0000-0000-00000000c701'
    and service_id='catalog_ci_service' and country_code='OM' and currency='OMR';

  begin
    perform public.create_quote_version_v1(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      qid,99,'OM','OMR',now()+interval '15 days',null,null,
      jsonb_build_array(jsonb_build_object('subjectKind','SERVICE','serviceId','catalog_ci_service','quantity',1)),
      'quote-engine-stale-version-1'
    );
    raise exception 'Stale QUOTE-ENGINE version unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'QUOTE-ENGINE Quote version changed%' then raise; end if;
  end;

  if public.submit_quote_review_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    qid,2,'quote-engine-review-submit-1'
  )<>'REVIEW' then raise exception 'QUOTE-ENGINE review submit failed'; end if;

  if public.decide_quote_review_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    qid,'APPROVE','CI owner approval','quote-engine-review-approve-1'
  )<>'APPROVED' then raise exception 'QUOTE-ENGINE approval failed'; end if;

  select * into q from public.quotes where id=qid;
  if public.mark_quote_sent_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    qid,q.version,'quote-engine-send-1'
  )<>'SENT' then raise exception 'QUOTE-ENGINE send transition failed'; end if;

  if public.record_quote_viewed_v1(
    '00000000-0000-0000-0000-00000000c701',qid,
    '{"portalSession":"ci-verified"}'::jsonb,'quote-engine-viewed-1'
  )<>'VIEWED' then raise exception 'QUOTE-ENGINE viewed transition failed'; end if;

  if public.record_quote_customer_decision_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    qid,'ACCEPT','MANUAL_CONFIRMED',
    '{"confirmation":"signed acceptance captured in CI"}'::jsonb,
    'quote-engine-accepted-1'
  )<>'ACCEPTED' then raise exception 'QUOTE-ENGINE acceptance failed'; end if;

  if not exists(
    select 1 from public.quote_lifecycle_events
    where quote_id=qid and transition='ACCEPTED'
  ) then raise exception 'QUOTE-ENGINE acceptance event evidence missing'; end if;

  -- Network retries after later lifecycle changes must return the original result, not fail on new state.
  if public.submit_quote_review_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    qid,2,'quote-engine-review-submit-1'
  )<>'REVIEW' then raise exception 'QUOTE-ENGINE review retry is not idempotent'; end if;

  if public.decide_quote_review_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    qid,'APPROVE','CI owner approval','quote-engine-review-approve-1'
  )<>'APPROVED' then raise exception 'QUOTE-ENGINE approval retry is not idempotent'; end if;

  if public.mark_quote_sent_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    qid,q.version,'quote-engine-send-1'
  )<>'SENT' then raise exception 'QUOTE-ENGINE send retry is not idempotent'; end if;

  if public.record_quote_viewed_v1(
    '00000000-0000-0000-0000-00000000c701',qid,
    '{"portalSession":"ci-verified"}'::jsonb,'quote-engine-viewed-1'
  )<>'VIEWED' then raise exception 'QUOTE-ENGINE viewed retry is not idempotent'; end if;

  if public.record_quote_customer_decision_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    qid,'ACCEPT','MANUAL_CONFIRMED',
    '{"confirmation":"signed acceptance captured in CI"}'::jsonb,
    'quote-engine-accepted-1'
  )<>'ACCEPTED' then raise exception 'QUOTE-ENGINE decision retry is not idempotent'; end if;

  projected:=public.reconcile_quote_automation_events(100);
  if coalesce((projected->>'processed')::integer,0)<1 then
    raise exception 'QUOTE-ENGINE acceptance did not project to Automation Runtime';
  end if;

  if public.record_quote_conversion_v1(
    '00000000-0000-0000-0000-00000000c701',qid,
    'EXTERNAL_ORDER','ci-order-evidence-1',
    '{"verified":true,"note":"No Order truth created by QUOTE-ENGINE"}'::jsonb,
    'quote-engine-convert-1'
  )<>'CONVERTED' then raise exception 'QUOTE-ENGINE conversion evidence failed'; end if;

  if public.record_quote_conversion_v1(
    '00000000-0000-0000-0000-00000000c701',qid,
    'EXTERNAL_ORDER','ci-order-evidence-1',
    '{"verified":true,"note":"No Order truth created by QUOTE-ENGINE"}'::jsonb,
    'quote-engine-convert-1'
  )<>'CONVERTED' then raise exception 'QUOTE-ENGINE conversion retry is not idempotent'; end if;

  select * into q from public.quotes where id=qid;
  if q.status<>'CONVERTED'
     or q.conversion_reference<>'ci-order-evidence-1'
     or q.accepted_at is null or q.converted_at is null
  then raise exception 'QUOTE-ENGINE final conversion state is wrong'; end if;

  if (
    select count(*) from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000c701'
      and action='QUOTE_ENGINE_CREATED'
      and entity_id=qid::text
      and correlation_id='quote-engine-create-service-1'
  )<>1 then raise exception 'QUOTE-ENGINE replay duplicated create audit evidence'; end if;
end;
$service_quote_lifecycle$;

do $variant_quote_snapshot$
declare qid uuid; r public.quote_version_reviews%rowtype;
begin
  qid:=public.create_quote_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000d812',
    '00000000-0000-0000-0000-00000000c731',
    null,null,
    '00000000-0000-0000-0000-00000000d801',
    null,
    '00000000-0000-0000-0000-00000000c711',
    'OM','OMR',now()+interval '7 days',null,null,
    jsonb_build_array(jsonb_build_object(
      'subjectKind','VARIANT',
      'variantId','00000000-0000-0000-0000-00000000c781',
      'quantity',3,'discountBps',0,'taxBps',0
    )),
    'quote-engine-create-variant-1'
  );

  if (select total from public.quote_versions where quote_id=qid and version_no=1)<>75 then
    raise exception 'QUOTE-ENGINE Variant total is wrong';
  end if;
  if (select product_price_id from public.quote_line_items where quote_id=qid and line_no=1)
     <>'00000000-0000-0000-0000-00000000c791'::uuid
  then raise exception 'QUOTE-ENGINE Variant is not anchored to canonical Product price'; end if;

  select * into r from public.quote_version_reviews where quote_id=qid and version_no=1;
  if r.status<>'NOT_REQUIRED' then raise exception 'QUOTE-ENGINE clean canonical price unexpectedly required approval'; end if;

  if public.create_quote_version_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    qid,1,'OM','OMR',
    (select valid_until from public.quote_versions where quote_id=qid and version_no=1),
    null,null,
    jsonb_build_array(jsonb_build_object(
      'subjectKind','VARIANT',
      'variantId','00000000-0000-0000-0000-00000000c781',
      'quantity',3,'discountBps',0,'taxBps',0
    )),
    'quote-engine-create-variant-1:v1'
  )<>1 then raise exception 'QUOTE-ENGINE version retry is not idempotent'; end if;

  begin
    perform public.create_quote_v1(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000d813',
      '00000000-0000-0000-0000-00000000c731',
      null,null,
      '00000000-0000-0000-0000-00000000d801',
      null,
      '00000000-0000-0000-0000-00000000c711',
      'OM','OMR',now()+interval '7 days',null,null,
      jsonb_build_array(jsonb_build_object(
        'subjectKind','VARIANT',
        'variantId','00000000-0000-0000-0000-00000000c781',
        'quantity',1,'discountBps',2500,'taxBps',0
      )),
      'quote-engine-below-minimum-1'
    );
    raise exception 'QUOTE-ENGINE below-minimum Product discount unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'QUOTE-ENGINE Variant discount breaches configured minimum%' then raise; end if;
  end;
end;
$variant_quote_snapshot$;


-- Operational validity: due Quotes must transition to EXPIRED through the existing runtime reconciler.
select public.create_quote_v1(
  '00000000-0000-0000-0000-00000000c701',
  '00000000-0000-0000-0000-00000000c711',
  '00000000-0000-0000-0000-00000000d814',
  '00000000-0000-0000-0000-00000000c731',
  null,null,
  '00000000-0000-0000-0000-00000000d801',
  null,
  '00000000-0000-0000-0000-00000000c711',
  'OM','OMR',clock_timestamp()+interval '1 second',null,null,
  jsonb_build_array(jsonb_build_object(
    'subjectKind','VARIANT',
    'variantId','00000000-0000-0000-0000-00000000c781',
    'quantity',1,'discountBps',0,'taxBps',0
  )),
  'quote-engine-expiry-create-1'
);
select pg_sleep(1.2);
select public.reconcile_due_quotes_v1(100);

do $quote_expiry_reconciler$
begin
  if (select status from public.quotes where id='00000000-0000-0000-0000-00000000d814')<>'EXPIRED' then
    raise exception 'QUOTE-ENGINE due Quote was not expired';
  end if;
  if not exists(
    select 1 from public.quote_lifecycle_events
    where quote_id='00000000-0000-0000-0000-00000000d814'
      and transition='EXPIRED'
  ) then raise exception 'QUOTE-ENGINE expiry lifecycle evidence is missing'; end if;
end;
$quote_expiry_reconciler$;

do $immutability_and_acl$
begin
  begin
    update public.quote_versions
    set notes='tamper'
    where id=(select id from public.quote_versions limit 1);
    raise exception 'QUOTE-ENGINE immutable version unexpectedly changed';
  exception when others then
    if sqlerrm not like 'QUOTE-ENGINE immutable evidence cannot be changed%' then raise; end if;
  end;

  if has_function_privilege(
    'authenticated',
    'public.create_quote_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,jsonb,text)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'Authenticated role can execute trusted QUOTE-ENGINE mutation RPC'; end if;

  if not has_function_privilege(
    'service_role',
    'public.create_quote_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,jsonb,text)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'service_role cannot execute QUOTE-ENGINE mutation RPC'; end if;

  if has_function_privilege(
    'authenticated',
    'public.reconcile_due_quotes_v1(integer)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'Authenticated role can execute QUOTE-ENGINE expiry reconciler'; end if;

  if not has_function_privilege(
    'service_role',
    'public.reconcile_due_quotes_v1(integer)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'service_role cannot execute QUOTE-ENGINE expiry reconciler'; end if;

  if (select availability from public.automation_trigger_catalog where trigger_key='QUOTE_ACCEPTED')<>'AVAILABLE' then
    raise exception 'QUOTE_ACCEPTED trigger was not activated after canonical producer implementation';
  end if;

  if public.automation_trigger_expected_condition_subject('QUOTE_ACCEPTED')<>'QUOTE' then
    raise exception 'QUOTE_ACCEPTED trigger does not resolve canonical QUOTE subject scope';
  end if;
end;
$immutability_and_acl$;

reset role;

do $rls_presence$
begin
  if exists(
    select 1
    from (values
      ('quotes'),('quote_versions'),('quote_line_items'),('quote_version_reviews'),('quote_lifecycle_events')
    ) x(name)
    where not exists(
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=x.name and c.relrowsecurity
    )
  ) then raise exception 'QUOTE-ENGINE exposed table is missing RLS'; end if;
end;
$rls_presence$;
