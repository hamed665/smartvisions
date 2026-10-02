\set ON_ERROR_STOP on

-- ORDER-ENGINE disposable controlled acceptance.
-- Reuses canonical Catalog fixtures established earlier in the PostgreSQL 17 CI chain.

insert into public.businesses(id,organization_id,name,country_code)
values (
  '00000000-0000-0000-0000-00000000d801',
  '00000000-0000-0000-0000-00000000c701',
  'ORDER Buyer LLC','OM'
)
on conflict (id) do update set name=excluded.name;

reset role;
set role service_role;

do $direct_order_guard$
begin
  begin
    insert into public.orders(
      id,organization_id,tenant_business_id,buyer_business_id,owner_user_id,
      order_number,source_kind,status,fulfillment_status,country_code,currency,
      subtotal,discount_total,tax_total,total,seller_snapshot,buyer_snapshot,source_evidence,
      created_by_user_id,updated_by_user_id
    ) values (
      '00000000-0000-0000-0000-00000000d899',
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c731',
      '00000000-0000-0000-0000-00000000d801',
      '00000000-0000-0000-0000-00000000c711',
      'O-000000000000D899','DIRECT','CONFIRMED','PENDING','OM','OMR',
      1,0,0,1,'{"name":"Seller"}'::jsonb,'{"businessName":"Buyer"}'::jsonb,'{"source":"tamper"}'::jsonb,
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000c711'
    );
    raise exception 'Direct ORDER-ENGINE mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'ORDER-ENGINE state requires governed command%' then raise; end if;
  end;
end;
$direct_order_guard$;

do $quote_to_order$
declare
  qid uuid:='00000000-0000-0000-0000-00000000d821';
  oid uuid:='00000000-0000-0000-0000-00000000d831';
  oid_replay uuid;
  q public.quotes%rowtype;
  o public.orders%rowtype;
  qline public.quote_line_items%rowtype;
  oline public.order_line_items%rowtype;
  qv public.quote_versions%rowtype;
  v_expected integer;
begin
  perform public.create_quote_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    qid,
    '00000000-0000-0000-0000-00000000c731',
    null,null,
    '00000000-0000-0000-0000-00000000d801',
    null,
    '00000000-0000-0000-0000-00000000c711',
    'OM','OMR',now()+interval '7 days',
    'Accepted Quote becomes immutable Order evidence',
    null,
    jsonb_build_array(jsonb_build_object(
      'subjectKind','VARIANT',
      'variantId','00000000-0000-0000-0000-00000000c781',
      'quantity',2,'discountBps',0,'taxBps',0
    )),
    'order-engine-source-quote-1'
  );

  select * into q from public.quotes where id=qid;
  perform public.submit_quote_review_v1(
    q.organization_id,'00000000-0000-0000-0000-00000000c711',
    qid,q.version,'order-engine-source-review-1'
  );

  select * into q from public.quotes where id=qid;
  perform public.mark_quote_sent_v1(
    q.organization_id,'00000000-0000-0000-0000-00000000c711',
    qid,q.version,'order-engine-source-send-1'
  );

  perform public.record_quote_customer_decision_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    qid,'ACCEPT','MANUAL_CONFIRMED',
    '{"note":"CI accepted source Quote"}'::jsonb,
    'order-engine-source-accept-1'
  );

  select * into q from public.quotes where id=qid;
  if q.status<>'ACCEPTED' then raise exception 'ORDER-ENGINE source Quote was not accepted'; end if;

  oid_replay:=public.create_order_from_quote_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    oid,qid,null,
    '00000000-0000-0000-0000-00000000c711',
    'order-engine-from-quote-1'
  );
  if oid_replay<>oid then raise exception 'ORDER-ENGINE Quote conversion returned wrong Order ID'; end if;

  -- Replay must work after Quote moved to CONVERTED.
  oid_replay:=public.create_order_from_quote_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    oid,qid,null,
    '00000000-0000-0000-0000-00000000c711',
    'order-engine-from-quote-1'
  );
  if oid_replay<>oid then raise exception 'ORDER-ENGINE Quote conversion replay failed'; end if;

  select * into q from public.quotes where id=qid;
  select * into qv from public.quote_versions where quote_id=qid and version_no=q.current_version;
  select * into o from public.orders where id=oid;
  select * into qline from public.quote_line_items where quote_id=qid and version_no=q.current_version and line_no=1;
  select * into oline from public.order_line_items where order_id=oid and line_no=1;

  if q.status<>'CONVERTED' or q.conversion_kind<>'ORDER' or q.conversion_reference<>oid::text then
    raise exception 'ORDER-ENGINE did not atomically record canonical Quote conversion';
  end if;
  if o.source_kind<>'QUOTE' or o.quote_id<>qid or o.quote_version_no<>q.current_version
     or o.total<>qv.total or o.currency<>qv.currency or o.status<>'CONFIRMED'
  then raise exception 'ORDER-ENGINE Quote-derived header snapshot is wrong'; end if;
  if oline.quote_line_item_id<>qline.id or oline.unit_price<>qline.unit_price
     or oline.quantity<>qline.quantity or oline.line_total<>qline.line_total
  then raise exception 'ORDER-ENGINE Quote-derived line snapshot is wrong'; end if;

  if (select count(*) from public.order_line_fulfillment where order_id=oid)<>1 then
    raise exception 'ORDER-ENGINE fulfillment summary was not initialized';
  end if;

  if (
    select count(*) from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000c701'
      and action='ORDER_ENGINE_CREATED' and entity_id=oid::text
      and correlation_id='order-engine-from-quote-1'
  )<>1 then raise exception 'ORDER-ENGINE replay duplicated create audit evidence'; end if;
end;
$quote_to_order$;

do $direct_order_and_fulfillment$
declare
  oid uuid:='00000000-0000-0000-0000-00000000d832';
  rid uuid:='00000000-0000-0000-0000-00000000d842';
  line_id uuid;
  o public.orders%rowtype;
  v_before numeric;
  v_status text;
  projected jsonb;
begin
  perform public.create_direct_order_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    oid,
    '00000000-0000-0000-0000-00000000c731',
    null,null,
    '00000000-0000-0000-0000-00000000d801',
    null,null,
    '00000000-0000-0000-0000-00000000c711',
    'OM','OMR','Direct canonical-price order',
    'Customer requested immediate direct purchase',
    '{"channel":"CI","confirmed":true}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'subjectKind','VARIANT',
      'variantId','00000000-0000-0000-0000-00000000c781',
      'quantity',2,'discountBps',0,'taxBps',500
    )),
    'order-engine-direct-1'
  );

  select * into o from public.orders where id=oid;
  select id into line_id from public.order_line_items where order_id=oid and line_no=1;
  if o.source_kind<>'DIRECT' or o.total<>52.5 or o.discount_total<>0 or o.tax_total<>2.5 then
    raise exception 'ORDER-ENGINE direct canonical-price totals are wrong: %/%/%',o.total,o.discount_total,o.tax_total;
  end if;

  -- Catalog changes after Order confirmation must not rewrite commercial evidence.
  select unit_price into v_before from public.order_line_items where id=line_id;
  update public.catalog_product_prices set price=31
  where organization_id='00000000-0000-0000-0000-00000000c701'
    and id='00000000-0000-0000-0000-00000000c791';
  if (select unit_price from public.order_line_items where id=line_id)<>v_before then
    raise exception 'ORDER-ENGINE historical line changed after Catalog price edit';
  end if;
  update public.catalog_product_prices set price=25
  where organization_id='00000000-0000-0000-0000-00000000c701'
    and id='00000000-0000-0000-0000-00000000c791';

  if public.record_order_fulfillment_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    oid,o.version,
    jsonb_build_array(jsonb_build_object('orderLineId',line_id,'quantity',1)),
    '{"proof":"ci-partial"}'::jsonb,
    'order-engine-fulfill-partial-1'
  )<>'PROCESSING' then raise exception 'ORDER-ENGINE partial fulfillment failed'; end if;

  -- True network replay after aggregate version changed.
  if public.record_order_fulfillment_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    oid,o.version,
    jsonb_build_array(jsonb_build_object('orderLineId',line_id,'quantity',1)),
    '{"proof":"ci-partial"}'::jsonb,
    'order-engine-fulfill-partial-1'
  )<>'PROCESSING' then raise exception 'ORDER-ENGINE fulfillment replay failed'; end if;

  select * into o from public.orders where id=oid;
  if public.record_order_fulfillment_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    oid,o.version,
    jsonb_build_array(jsonb_build_object('orderLineId',line_id,'quantity',1)),
    '{"proof":"ci-complete"}'::jsonb,
    'order-engine-fulfill-complete-1'
  )<>'COMPLETED' then raise exception 'ORDER-ENGINE full fulfillment failed'; end if;

  select * into o from public.orders where id=oid;
  if o.fulfillment_status<>'FULFILLED' or o.completed_at is null then
    raise exception 'ORDER-ENGINE completed fulfillment state is wrong';
  end if;

  perform public.request_order_return_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    rid,oid,'Customer returned fulfilled item',
    jsonb_build_array(jsonb_build_object('orderLineId',line_id,'quantity',2)),
    '{"request":"ci-return"}'::jsonb,
    'order-engine-return-request-1'
  );

  if public.decide_order_return_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    rid,'APPROVE','CI manager approval',
    '{"decision":"verified"}'::jsonb,
    'order-engine-return-approve-1'
  )<>'APPROVED' then raise exception 'ORDER-ENGINE return approval failed'; end if;

  v_status:=public.receive_order_return_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    rid,'{"receipt":"ci-received"}'::jsonb,
    'order-engine-return-received-1'
  );
  if v_status<>'RETURNED' then raise exception 'ORDER-ENGINE full return did not close Order as RETURNED'; end if;

  if (select returned_quantity from public.order_line_fulfillment where order_line_item_id=line_id)<>2 then
    raise exception 'ORDER-ENGINE returned quantity summary is wrong';
  end if;

  -- Return receipt retry after state change must be safe.
  if public.receive_order_return_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    rid,'{"receipt":"ci-received"}'::jsonb,
    'order-engine-return-received-1'
  )<>'RETURNED' then raise exception 'ORDER-ENGINE return receipt replay failed'; end if;

  projected:=public.reconcile_order_automation_events(100);
  if coalesce((projected->>'processed')::integer,0)<1 then
    raise exception 'ORDER-ENGINE automation projection did not process durable events';
  end if;
end;
$direct_order_and_fulfillment$;

do $direct_discount_rejection$
begin
  begin
    perform public.create_direct_order_v1(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      '00000000-0000-0000-0000-00000000d833',
      '00000000-0000-0000-0000-00000000c731',
      null,null,'00000000-0000-0000-0000-00000000d801',null,null,
      '00000000-0000-0000-0000-00000000c711',
      'OM','OMR',null,'Attempt direct discount',
      '{"confirmed":true}'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'subjectKind','VARIANT','variantId','00000000-0000-0000-0000-00000000c781',
        'quantity',1,'discountBps',100,'taxBps',0
      )),
      'order-engine-direct-discount-1'
    );
    raise exception 'ORDER-ENGINE direct discount unexpectedly bypassed Quote governance';
  exception when others then
    if sqlerrm not like 'ORDER-ENGINE direct line %discounts require governed Quote flow%' then raise; end if;
  end;
end;
$direct_discount_rejection$;

do $cancel_unfulfilled_order$
declare oid uuid:='00000000-0000-0000-0000-00000000d834'; o public.orders%rowtype;
begin
  perform public.create_direct_order_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    oid,'00000000-0000-0000-0000-00000000c731',
    null,null,'00000000-0000-0000-0000-00000000d801',null,null,
    '00000000-0000-0000-0000-00000000c711',
    'OM','OMR',null,'CI cancellation fixture','{"confirmed":true}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'subjectKind','VARIANT','variantId','00000000-0000-0000-0000-00000000c781',
      'quantity',1,'discountBps',0,'taxBps',0
    )),
    'order-engine-cancel-create-1'
  );
  select * into o from public.orders where id=oid;
  if public.cancel_order_v1(
    o.organization_id,'00000000-0000-0000-0000-00000000c711',oid,o.version,
    'Customer cancelled before fulfillment','{"confirmed":true}'::jsonb,
    'order-engine-cancel-1'
  )<>'CANCELLED' then raise exception 'ORDER-ENGINE cancellation failed'; end if;

  if public.cancel_order_v1(
    o.organization_id,'00000000-0000-0000-0000-00000000c711',oid,o.version,
    'Customer cancelled before fulfillment','{"confirmed":true}'::jsonb,
    'order-engine-cancel-1'
  )<>'CANCELLED' then raise exception 'ORDER-ENGINE cancellation replay failed'; end if;
end;
$cancel_unfulfilled_order$;

reset role;

do $immutability_trigger$
begin
  perform set_config('app.order_engine_mutation','allowed',true);
  begin
    update public.order_line_items set description='tamper' where id=(select id from public.order_line_items limit 1);
    raise exception 'ORDER-ENGINE immutable line unexpectedly changed';
  exception when others then
    if sqlerrm not like 'ORDER-ENGINE immutable evidence cannot be changed%' then raise; end if;
  end;
  perform set_config('app.order_engine_mutation','0',true);
end;
$immutability_trigger$;

set role service_role;

do $order_acl_and_catalog$
begin
  if has_table_privilege('authenticated','public.orders','INSERT')
     or has_table_privilege('authenticated','public.order_line_fulfillment','UPDATE')
  then raise exception 'Authenticated role has direct ORDER-ENGINE mutation privilege'; end if;

  if has_function_privilege(
    'authenticated',
    'public.create_order_from_quote_v1(uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'Authenticated role can execute trusted ORDER-ENGINE mutation RPC'; end if;

  if not has_function_privilege(
    'service_role',
    'public.create_order_from_quote_v1(uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'service_role cannot execute ORDER-ENGINE mutation RPC'; end if;

  if has_function_privilege(
    'authenticated',
    'public.reconcile_order_automation_events(integer)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'Authenticated role can execute ORDER-ENGINE automation reconciler'; end if;

  if (select availability from public.automation_trigger_catalog where trigger_key='ORDER_CREATED')<>'AVAILABLE'
     or (select availability from public.automation_trigger_catalog where trigger_key='ORDER_STATUS_CHANGED')<>'AVAILABLE'
  then raise exception 'ORDER automation triggers were not activated'; end if;

  if public.automation_trigger_expected_condition_subject('ORDER_CREATED')<>'ORDER'
     or public.automation_trigger_expected_condition_subject('ORDER_STATUS_CHANGED')<>'ORDER'
  then raise exception 'ORDER automation trigger subject is wrong'; end if;
end;
$order_acl_and_catalog$;

reset role;

do $rls_presence$
begin
  if exists(
    select 1
    from (values
      ('orders'),('order_line_items'),('order_line_fulfillment'),
      ('order_returns'),('order_return_lines'),('order_lifecycle_events')
    ) x(name)
    where not exists(
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=x.name and c.relrowsecurity
    )
  ) then raise exception 'ORDER-ENGINE exposed table is missing RLS'; end if;
end;
$rls_presence$;
