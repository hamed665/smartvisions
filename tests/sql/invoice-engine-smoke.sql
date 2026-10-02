\set ON_ERROR_STOP on

-- INVOICE-ENGINE disposable controlled acceptance.
-- Reuses the canonical test Organization/member/Catalog fixtures from the existing PG17 chain.
-- No Production data is created by this smoke.

reset role;
set role service_role;

do $invoice_fixture$
declare
  oid uuid:='00000000-0000-0000-0000-00000000d841';
  iid uuid:='00000000-0000-0000-0000-00000000d851';
  replay_id uuid;
  o public.orders%rowtype;
  i public.invoices%rowtype;
  ol public.order_line_items%rowtype;
  il public.invoice_line_items%rowtype;
  issued text;
  due_result jsonb;
  automation_result jsonb;
begin
  perform public.create_direct_order_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    oid,
    '00000000-0000-0000-0000-00000000c731',
    null,
    null,
    '00000000-0000-0000-0000-00000000d801',
    null,
    null,
    '00000000-0000-0000-0000-00000000c711',
    'OM',
    'OMR',
    'Due on receipt',
    'Invoice engine CI source Order',
    '{"confirmed":true}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'subjectKind','VARIANT',
      'variantId','00000000-0000-0000-0000-00000000c781',
      'quantity',2,
      'discountBps',0,
      'taxBps',500
    )),
    'invoice-engine-source-order-1'
  );

  select * into o from public.orders
  where organization_id='00000000-0000-0000-0000-00000000c701' and id=oid;

  replay_id:=public.create_invoice_from_order_v1(
    o.organization_id,
    '00000000-0000-0000-0000-00000000c711',
    iid,
    oid,
    current_date-1,
    'invoice-engine-create-1'
  );
  if replay_id<>iid then raise exception 'INVOICE-ENGINE create returned wrong Invoice ID'; end if;

  -- Same command must replay instead of duplicating the commercial document.
  replay_id:=public.create_invoice_from_order_v1(
    o.organization_id,
    '00000000-0000-0000-0000-00000000c711',
    iid,
    oid,
    current_date-1,
    'invoice-engine-create-1'
  );
  if replay_id<>iid then raise exception 'INVOICE-ENGINE create replay failed'; end if;

  -- A second create attempt for the same Order must converge on the existing
  -- canonical Invoice even when a caller presents a fresh candidate UUID.
  replay_id:=public.create_invoice_from_order_v1(
    o.organization_id,
    '00000000-0000-0000-0000-00000000c711',
    '00000000-0000-0000-0000-00000000d859',
    oid,
    current_date-1,
    'invoice-engine-create-converge-1'
  );
  if replay_id<>iid then raise exception 'INVOICE-ENGINE one-Invoice-per-Order convergence failed'; end if;

  select * into i from public.invoices where organization_id=o.organization_id and id=iid;
  select * into ol from public.order_line_items where organization_id=o.organization_id and order_id=oid and line_no=1;
  select * into il from public.invoice_line_items where organization_id=o.organization_id and invoice_id=iid and line_no=1;

  if i.status<>'DRAFT' or i.order_id<>oid or i.total<>o.total or i.tax_total<>o.tax_total
     or i.currency<>o.currency or i.seller_snapshot is distinct from o.seller_snapshot
     or i.buyer_snapshot is distinct from o.buyer_snapshot
  then raise exception 'INVOICE-ENGINE did not preserve immutable Order commercial snapshot'; end if;

  if il.order_line_item_id<>ol.id or il.quantity<>ol.quantity or il.unit_price<>ol.unit_price
     or il.tax_bps<>ol.tax_bps or il.tax_amount<>ol.tax_amount or il.line_total<>ol.line_total
  then raise exception 'INVOICE-ENGINE line snapshot diverged from canonical Order line'; end if;

  begin
    update public.invoices set due_date=current_date+10
    where organization_id=o.organization_id and id=iid;
    raise exception 'Direct INVOICE-ENGINE mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'INVOICE-ENGINE state requires governed command%' then raise; end if;
  end;

  begin
    perform set_config('app.invoice_engine_mutation','allowed',true);
    update public.invoices set paid_total=0.0001
    where organization_id=o.organization_id and id=iid;
    raise exception 'INVOICE-ENGINE paid_total moved before PAYMENT-CORE';
  exception when others then
    perform set_config('app.invoice_engine_mutation','0',true);
    if sqlerrm not like 'INVOICE-ENGINE paid balance is frozen until PAYMENT-CORE%' then raise; end if;
  end;
  perform set_config('app.invoice_engine_mutation','0',true);

  issued:=public.issue_invoice_v1(
    o.organization_id,
    '00000000-0000-0000-0000-00000000c711',
    iid,
    i.version,
    'invoice-engine-issue-1'
  );
  if issued<>'ISSUED' then raise exception 'INVOICE-ENGINE issue failed: %',issued; end if;

  -- Replay must be valid even though the row version advanced.
  issued:=public.issue_invoice_v1(
    o.organization_id,
    '00000000-0000-0000-0000-00000000c711',
    iid,
    i.version,
    'invoice-engine-issue-1'
  );
  if issued<>'ISSUED' then raise exception 'INVOICE-ENGINE issue replay failed: %',issued; end if;

  select * into i from public.invoices where organization_id=o.organization_id and id=iid;
  if i.document_snapshot is null
     or i.document_snapshot->>'documentType'<>'INVOICE'
     or i.document_snapshot->>'orderId'<>oid::text
     or i.document_snapshot->>'paymentExecutionAvailable'<>'false'
     or jsonb_array_length(i.document_snapshot->'lines')<>1
     or jsonb_array_length(i.document_snapshot->'taxBreakdown')<1
  then raise exception 'INVOICE-ENGINE issued document snapshot is incomplete'; end if;

  -- Immutable line evidence is fail-closed twice: service_role has no UPDATE
  -- privilege, and the table trigger rejects non-insert mutations even for a
  -- privileged database owner. The service boundary should stop this first.
  begin
    update public.invoice_line_items set name_snapshot='tamper'
    where organization_id=o.organization_id and invoice_id=iid and line_no=1;
    raise exception 'INVOICE-ENGINE immutable Invoice line unexpectedly changed';
  exception when insufficient_privilege then
    null;
  end;

  automation_result:=public.reconcile_invoice_automation_events(100);
  if coalesce((automation_result->>'processed')::integer,0)<1 then
    raise exception 'INVOICE-ENGINE issued Automation projection did not process';
  end if;
  if not exists(
    select 1 from public.audit_logs
    where organization_id=o.organization_id
      and action='INVOICE_AUTOMATION_EVENT_PROJECTED'
      and entity_id=iid::text
      and after_data->>'triggerKey'='INVOICE_ISSUED'
  ) then raise exception 'INVOICE-ENGINE issued Automation projection evidence missing'; end if;

  due_result:=public.reconcile_due_invoices_v1(100);
  if coalesce((due_result->>'processed')::integer,0)<1 then
    raise exception 'INVOICE-ENGINE overdue reconciliation did not process due Invoice';
  end if;

  select * into i from public.invoices where organization_id=o.organization_id and id=iid;
  if i.status<>'OVERDUE' then raise exception 'INVOICE-ENGINE due Invoice did not become OVERDUE'; end if;

  automation_result:=public.reconcile_invoice_automation_events(100);
  if coalesce((automation_result->>'processed')::integer,0)<1 then
    raise exception 'INVOICE-ENGINE overdue Automation projection did not process';
  end if;
  if not exists(
    select 1 from public.audit_logs
    where organization_id=o.organization_id
      and action='INVOICE_AUTOMATION_EVENT_PROJECTED'
      and entity_id=iid::text
      and after_data->>'triggerKey'='INVOICE_OVERDUE'
  ) then raise exception 'INVOICE-ENGINE overdue Automation projection evidence missing'; end if;
end;
$invoice_fixture$;

do $invoice_credit_note$
declare
  iid uuid:='00000000-0000-0000-0000-00000000d851';
  cid uuid:='00000000-0000-0000-0000-00000000d861';
  bad_cid uuid:='00000000-0000-0000-0000-00000000d862';
  line_id uuid;
  original_balance numeric;
  credited numeric;
  current_balance numeric;
  returned uuid;
begin
  select id into line_id
  from public.invoice_line_items
  where organization_id='00000000-0000-0000-0000-00000000c701'
    and invoice_id=iid and line_no=1;

  select balance_due into original_balance
  from public.invoices
  where organization_id='00000000-0000-0000-0000-00000000c701' and id=iid;

  returned:=public.issue_invoice_credit_note_v1(
    '00000000-0000-0000-0000-00000000c701',
    '00000000-0000-0000-0000-00000000c711',
    cid,
    iid,
    'Partial commercial credit for controlled acceptance',
    jsonb_build_array(jsonb_build_object('invoiceLineItemId',line_id,'quantity',1)),
    '{"note":"controlled credit evidence"}'::jsonb,
    'invoice-engine-credit-1'
  );
  if returned<>cid then raise exception 'INVOICE-ENGINE Credit Note returned wrong ID'; end if;

  select credited_total,balance_due into credited,current_balance
  from public.invoices
  where organization_id='00000000-0000-0000-0000-00000000c701' and id=iid;

  if credited<=0 or current_balance<>original_balance-credited then
    raise exception 'INVOICE-ENGINE Credit Note did not reduce commercial balance correctly';
  end if;

  if not exists(
    select 1 from public.invoice_credit_notes
    where organization_id='00000000-0000-0000-0000-00000000c701'
      and id=cid
      and document_snapshot->>'documentType'='CREDIT_NOTE'
      and document_snapshot->>'refundExecutionAvailable'='false'
  ) then raise exception 'INVOICE-ENGINE immutable Credit Note document evidence missing'; end if;

  if not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000c701'
      and action='INVOICE_ENGINE_CREDIT_NOTE_ISSUED'
      and entity_id=cid::text
      and after_data->>'refundTruthCreated'='false'
  ) then raise exception 'INVOICE-ENGINE Credit Note refund-boundary evidence missing'; end if;

  begin
    perform public.issue_invoice_credit_note_v1(
      '00000000-0000-0000-0000-00000000c701',
      '00000000-0000-0000-0000-00000000c711',
      bad_cid,
      iid,
      'Must reject over-credit',
      jsonb_build_array(jsonb_build_object('invoiceLineItemId',line_id,'quantity',2)),
      '{"note":"must fail"}'::jsonb,
      'invoice-engine-over-credit-1'
    );
    raise exception 'INVOICE-ENGINE over-credit unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'INVOICE-ENGINE Credit Note quantity exceeds remaining Invoice line quantity%' then raise; end if;
  end;
end;
$invoice_credit_note$;

do $invoice_catalog_acl_rls$
declare v360 jsonb;
begin
  if (select availability from public.automation_trigger_catalog where trigger_key='INVOICE_ISSUED')<>'AVAILABLE'
     or (select availability from public.automation_trigger_catalog where trigger_key='INVOICE_OVERDUE')<>'AVAILABLE'
  then raise exception 'INVOICE-ENGINE Automation triggers were not activated'; end if;

  if public.automation_trigger_expected_condition_subject('INVOICE_ISSUED')<>'INVOICE'
     or public.automation_trigger_expected_condition_subject('INVOICE_OVERDUE')<>'INVOICE'
  then raise exception 'INVOICE-ENGINE Automation trigger subject is wrong'; end if;

  if has_table_privilege('authenticated','public.invoices','INSERT')
     or has_table_privilege('authenticated','public.invoices','UPDATE')
     or has_table_privilege('authenticated','public.invoice_credit_notes','INSERT')
  then raise exception 'Authenticated role has direct INVOICE-ENGINE mutation privilege'; end if;

  if not has_table_privilege('authenticated','public.invoices','SELECT')
     or not has_table_privilege('authenticated','public.invoice_credit_notes','SELECT')
  then raise exception 'Authenticated role lacks scoped INVOICE-ENGINE read privilege'; end if;

  if has_function_privilege(
    'authenticated',
    'public.create_invoice_from_order_v1(uuid,uuid,uuid,uuid,date,text)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.issue_invoice_credit_note_v1(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.reconcile_due_invoices_v1(integer)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'Authenticated role can execute trusted INVOICE-ENGINE mutation/reconciler'; end if;

  if not has_function_privilege(
    'service_role',
    'public.create_invoice_from_order_v1(uuid,uuid,uuid,uuid,date,text)'::regprocedure,
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.reconcile_invoice_automation_events(integer)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'service_role lacks INVOICE-ENGINE governed execution'; end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_crm_customer360_v5(uuid,uuid,integer)'::regprocedure,
    'EXECUTE'
  ) then raise exception 'Authenticated role cannot execute Customer360 V5'; end if;

  if exists(
    select 1
    from (values
      ('invoices'),('invoice_line_items'),('invoice_credit_notes'),
      ('invoice_credit_note_line_items'),('invoice_lifecycle_events')
    ) x(name)
    where not exists(
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=x.name and c.relrowsecurity
    )
  ) then raise exception 'INVOICE-ENGINE exposed table is missing RLS'; end if;

  if to_regclass('public.invoice_lines_order_line_fk_idx') is null
     or to_regclass('public.invoice_credit_lines_note_invoice_fk_idx') is null
     or to_regclass('public.invoice_credit_lines_invoice_line_fk_idx') is null
     or to_regclass('public.invoice_events_credit_note_fk_idx') is null
  then raise exception 'INVOICE-ENGINE composite FK covering indexes are missing'; end if;

  -- Person fixture is not required for this Business-buyer Invoice, but the V5 RPC
  -- must exist and compose V4 without replacing CRM authority.
  if to_regprocedure('public.get_crm_customer360_v5(uuid,uuid,integer)') is null then
    raise exception 'INVOICE-ENGINE Customer360 V5 function is missing';
  end if;
end;
$invoice_catalog_acl_rls$;

reset role;
