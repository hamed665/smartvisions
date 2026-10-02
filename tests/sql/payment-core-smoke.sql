\set ON_ERROR_STOP on

-- PAYMENT-CORE disposable controlled acceptance.
-- Reuses the canonical Invoice fixture created by invoice-engine-smoke.sql.
-- TEST_GATEWAY is CI-only evidence and is never written to Production.

reset role;
set role service_role;

do $payment_core$
declare
  org uuid:='00000000-0000-0000-0000-00000000c701';
  actor uuid:='00000000-0000-0000-0000-00000000c711';
  invoice_id uuid:='00000000-0000-0000-0000-00000000d851';
  intent_id uuid:='00000000-0000-0000-0000-00000000d871';
  link_id uuid:='00000000-0000-0000-0000-00000000d872';
  refund1 uuid:='00000000-0000-0000-0000-00000000d873';
  refund2 uuid:='00000000-0000-0000-0000-00000000d874';
  failed_intent uuid:='00000000-0000-0000-0000-00000000d875';
  expired_intent uuid:='00000000-0000-0000-0000-00000000d876';
  inv public.invoices%rowtype;
  pi public.payment_intents%rowtype;
  amount numeric(18,4);
  partial_refund numeric(18,4);
  remaining_refund numeric(18,4);
  original_credit numeric(18,4);
  result jsonb;
  replayed uuid;
begin
  select * into inv from public.invoices where organization_id=org and id=invoice_id;
  if inv.status<>'OVERDUE' or inv.balance_due<=0 then
    raise exception 'PAYMENT-CORE requires the issued/overdue Invoice fixture with collectible balance';
  end if;
  amount:=inv.balance_due;
  original_credit:=inv.credited_total;

  replayed:=public.create_payment_intent_v1(
    org,actor,intent_id,invoice_id,amount,'payment-core-intent-1'
  );
  if replayed<>intent_id then raise exception 'PAYMENT-CORE create returned wrong Intent ID'; end if;

  replayed:=public.create_payment_intent_v1(
    org,actor,intent_id,invoice_id,amount,'payment-core-intent-1'
  );
  if replayed<>intent_id then raise exception 'PAYMENT-CORE create replay failed'; end if;

  begin
    update public.payment_intents set status='PAID' where organization_id=org and id=intent_id;
    raise exception 'Direct PAYMENT-CORE mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'PAYMENT-CORE state requires governed command%' then raise; end if;
  end;

  perform public.record_payment_link_v1(
    org,link_id,intent_id,'TEST_GATEWAY','link-controlled-1',
    'https://payments.example.test/controlled-1',statement_timestamp()+interval '30 minutes',
    '{"controlledFixture":true,"providerAcceptedLink":true}'::jsonb,
    'payment-core-link-1'
  );

  select * into inv from public.invoices where organization_id=org and id=invoice_id;
  if inv.paid_total<>0 then raise exception 'PAYMENT-CORE Payment Link incorrectly changed paid_total'; end if;

  perform public.mark_payment_intent_reconciliation_required_v1(
    org,intent_id,'TEST_GATEWAY','Controlled ambiguous request outcome',
    '{"controlledFixture":true,"httpOutcome":"timeout"}'::jsonb,
    'payment-core-ambiguous-1'
  );

  select * into pi from public.payment_intents where organization_id=org and id=intent_id;
  select * into inv from public.invoices where organization_id=org and id=invoice_id;
  if pi.status<>'RECONCILIATION_REQUIRED' or inv.paid_total<>0 then
    raise exception 'PAYMENT-CORE ambiguous result did not stay unsettled';
  end if;

  result:=public.record_payment_provider_event_v1(
    org,intent_id,null,'TEST_GATEWAY','evt-controlled-capture-1','CAPTURED','charge-controlled-1',
    amount,inv.currency,'EXPLICIT_RECONCILIATION',
    '{"controlledFixture":true,"source":"provider-readback","verified":true}'::jsonb,
    '{"outcome":"captured","controlledFixture":true}'::jsonb,
    'payment-core-provider-capture-1'
  );
  if coalesce((result->>'replayed')::boolean,true) then
    raise exception 'PAYMENT-CORE first capture was reported as replay';
  end if;

  result:=public.record_payment_provider_event_v1(
    org,intent_id,null,'TEST_GATEWAY','evt-controlled-capture-1','CAPTURED','charge-controlled-1',
    amount,inv.currency,'EXPLICIT_RECONCILIATION',
    '{"controlledFixture":true,"source":"provider-readback","verified":true}'::jsonb,
    '{"outcome":"captured","controlledFixture":true}'::jsonb,
    'payment-core-provider-capture-replay'
  );
  if coalesce((result->>'replayed')::boolean,false) is not true then
    raise exception 'PAYMENT-CORE duplicate provider event did not replay';
  end if;

  select * into pi from public.payment_intents where organization_id=org and id=intent_id;
  select * into inv from public.invoices where organization_id=org and id=invoice_id;
  if pi.status<>'PAID' or pi.captured_total<>amount or inv.paid_total<>amount or inv.balance_due<>0 then
    raise exception 'PAYMENT-CORE capture settlement projection is wrong';
  end if;
  if (select count(*) from public.payment_transactions where organization_id=org and payment_intent_id=intent_id and transaction_type='CAPTURED')<>1 then
    raise exception 'PAYMENT-CORE duplicate callback created duplicate transaction';
  end if;

  begin
    perform public.create_payment_intent_v1(
      org,actor,'00000000-0000-0000-0000-00000000d879',invoice_id,0.0001,'payment-core-overpay-1'
    );
    raise exception 'PAYMENT-CORE over-settlement Intent unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'PAYMENT-CORE Invoice has no collectible balance%' then raise; end if;
  end;

  partial_refund:=round(amount/2.0,4);
  if partial_refund<=0 or partial_refund>=amount then raise exception 'PAYMENT-CORE fixture amount cannot prove partial refund'; end if;
  remaining_refund:=amount-partial_refund;

  perform public.request_payment_refund_v1(
    org,actor,refund1,intent_id,partial_refund,'Controlled partial refund request',
    '{"controlledFixture":true,"reasonEvidence":"operator-confirmed"}'::jsonb,
    'payment-core-refund-request-1'
  );

  select * into inv from public.invoices where organization_id=org and id=invoice_id;
  if inv.paid_total<>amount or inv.credited_total<>original_credit then
    raise exception 'PAYMENT-CORE Refund request moved money or rewrote Credit Note truth';
  end if;

  result:=public.record_payment_provider_event_v1(
    org,intent_id,refund1,'TEST_GATEWAY','evt-controlled-refund-1','REFUNDED','refund-controlled-1',
    partial_refund,inv.currency,'VERIFIED_WEBHOOK',
    '{"controlledFixture":true,"signatureVerified":true}'::jsonb,
    '{"outcome":"refunded","controlledFixture":true}'::jsonb,
    'payment-core-provider-refund-1'
  );

  select * into pi from public.payment_intents where organization_id=org and id=intent_id;
  select * into inv from public.invoices where organization_id=org and id=invoice_id;
  if pi.status<>'PARTIALLY_REFUNDED' or pi.refunded_total<>partial_refund
     or inv.paid_total<>amount-partial_refund or inv.credited_total<>original_credit
  then raise exception 'PAYMENT-CORE partial refund projection is wrong'; end if;

  perform public.request_payment_refund_v1(
    org,actor,refund2,intent_id,remaining_refund,'Controlled remaining refund request',
    '{"controlledFixture":true,"reasonEvidence":"operator-confirmed"}'::jsonb,
    'payment-core-refund-request-2'
  );

  perform public.record_payment_provider_event_v1(
    org,intent_id,refund2,'TEST_GATEWAY','evt-controlled-refund-2','REFUNDED','refund-controlled-2',
    remaining_refund,inv.currency,'EXPLICIT_RECONCILIATION',
    '{"controlledFixture":true,"source":"provider-readback","verified":true}'::jsonb,
    '{"outcome":"refunded","controlledFixture":true}'::jsonb,
    'payment-core-provider-refund-2'
  );

  select * into pi from public.payment_intents where organization_id=org and id=intent_id;
  select * into inv from public.invoices where organization_id=org and id=invoice_id;
  if pi.status<>'REFUNDED' or pi.refunded_total<>pi.captured_total
     or inv.paid_total<>0 or inv.credited_total<>original_credit
  then raise exception 'PAYMENT-CORE full refund projection or Credit Note separation is wrong'; end if;

  perform public.create_payment_intent_v1(
    org,actor,failed_intent,invoice_id,inv.balance_due,'payment-core-failed-intent-1'
  );
  perform public.mark_payment_intent_reconciliation_required_v1(
    org,failed_intent,'TEST_GATEWAY','Controlled timeout requiring reconciliation',
    '{"controlledFixture":true,"httpOutcome":"timeout"}'::jsonb,
    'payment-core-failed-ambiguous-1'
  );
  perform public.record_payment_provider_event_v1(
    org,failed_intent,null,'TEST_GATEWAY','evt-controlled-failed-1','FAILED','charge-controlled-failed-1',
    0,inv.currency,'EXPLICIT_RECONCILIATION',
    '{"controlledFixture":true,"source":"provider-readback","verified":true}'::jsonb,
    '{"outcome":"failed","controlledFixture":true}'::jsonb,
    'payment-core-provider-failed-1'
  );
  select * into pi from public.payment_intents where organization_id=org and id=failed_intent;
  if pi.status<>'FAILED' then raise exception 'PAYMENT-CORE failed reconciliation did not become FAILED'; end if;

  perform public.create_payment_intent_v1(
    org,actor,expired_intent,invoice_id,inv.balance_due,'payment-core-expired-intent-1'
  );
  perform public.record_payment_provider_event_v1(
    org,expired_intent,null,'TEST_GATEWAY','evt-controlled-expired-1','EXPIRED','charge-controlled-expired-1',
    0,inv.currency,'EXPLICIT_RECONCILIATION',
    '{"controlledFixture":true,"source":"provider-readback","verified":true}'::jsonb,
    '{"outcome":"expired","controlledFixture":true}'::jsonb,
    'payment-core-provider-expired-1'
  );
  select * into pi from public.payment_intents where organization_id=org and id=expired_intent;
  if pi.status<>'EXPIRED' then raise exception 'PAYMENT-CORE expired event did not become EXPIRED'; end if;

  begin
    perform public.record_payment_provider_event_v1(
      org,expired_intent,null,'TEST_GATEWAY','evt-unverified-1','CAPTURED','charge-unverified-1',
      inv.balance_due,inv.currency,'UNVERIFIED',
      '{"controlledFixture":true}'::jsonb,'{"outcome":"captured"}'::jsonb,
      'payment-core-unverified-1'
    );
    raise exception 'PAYMENT-CORE accepted unverified provider success';
  exception when others then
    if sqlerrm not like 'PAYMENT-CORE verified provider event contract is invalid%' then raise; end if;
  end;
end;
$payment_core$;

do $payment_core_automation_acl$
declare result jsonb;
begin
  if exists(
    select 1 from public.automation_trigger_catalog
    where trigger_key in ('PAYMENT_INTENT','PAYMENT_CAPTURED','PAYMENT_FAILED','PAYMENT_REFUNDED')
      and availability<>'AVAILABLE'
  ) then raise exception 'PAYMENT-CORE Automation triggers were not activated'; end if;

  if public.automation_trigger_expected_condition_subject('PAYMENT_CAPTURED')<>'PAYMENT'
     or public.automation_trigger_expected_condition_subject('PAYMENT_REFUNDED')<>'PAYMENT'
  then raise exception 'PAYMENT-CORE Automation trigger subject is wrong'; end if;

  result:=public.reconcile_payment_automation_events(100);
  if coalesce((result->>'processed')::integer,0)<6 then
    raise exception 'PAYMENT-CORE Automation projection did not process controlled evidence: %',result;
  end if;

  if not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000c701'
      and action='PAYMENT_AUTOMATION_EVENT_PROJECTED'
      and after_data->>'triggerKey'='PAYMENT_CAPTURED'
  ) or not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000c701'
      and action='PAYMENT_AUTOMATION_EVENT_PROJECTED'
      and after_data->>'triggerKey'='PAYMENT_REFUNDED'
  ) then raise exception 'PAYMENT-CORE Automation evidence is missing'; end if;

  if has_table_privilege('authenticated','public.payment_intents','INSERT')
     or has_table_privilege('authenticated','public.payment_intents','UPDATE')
     or has_table_privilege('authenticated','public.payment_refunds','INSERT')
     or has_table_privilege('authenticated','public.payment_transactions','INSERT')
  then raise exception 'Authenticated role has direct PAYMENT-CORE mutation privilege'; end if;

  if not has_table_privilege('authenticated','public.payment_intents','SELECT')
     or not has_table_privilege('authenticated','public.payment_transactions','SELECT')
     or not has_table_privilege('authenticated','public.payment_refunds','SELECT')
  then raise exception 'Authenticated role lacks scoped PAYMENT-CORE read privilege'; end if;

  if has_function_privilege(
    'authenticated','public.create_payment_intent_v1(uuid,uuid,uuid,uuid,numeric,text)'::regprocedure,'EXECUTE'
  ) or has_function_privilege(
    'authenticated','public.record_payment_provider_event_v1(uuid,uuid,uuid,text,text,text,text,numeric,text,text,jsonb,jsonb,text)'::regprocedure,'EXECUTE'
  ) or has_function_privilege(
    'authenticated','public.request_payment_refund_v1(uuid,uuid,uuid,uuid,numeric,text,jsonb,text)'::regprocedure,'EXECUTE'
  ) then raise exception 'Authenticated role can execute trusted PAYMENT-CORE mutation'; end if;

  if not has_function_privilege(
    'service_role','public.record_payment_provider_event_v1(uuid,uuid,uuid,text,text,text,text,numeric,text,text,jsonb,jsonb,text)'::regprocedure,'EXECUTE'
  ) or not has_function_privilege(
    'service_role','public.reconcile_payment_automation_events(integer)'::regprocedure,'EXECUTE'
  ) then raise exception 'service_role lacks PAYMENT-CORE governed execution'; end if;

  if not has_function_privilege(
    'authenticated','public.get_crm_customer360_v6(uuid,uuid,integer)'::regprocedure,'EXECUTE'
  ) then raise exception 'Authenticated role cannot execute Customer360 V6'; end if;

  if exists(
    select 1 from (values
      ('payment_intents'),('payment_links'),('payment_refunds'),
      ('payment_provider_events'),('payment_transactions')
    ) x(name)
    where not exists(
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=x.name and c.relrowsecurity
    )
  ) then raise exception 'PAYMENT-CORE exposed table is missing RLS'; end if;

  if to_regclass('public.payment_provider_events_refund_fk_idx') is null
     or to_regclass('public.payment_transactions_refund_fk_idx') is null
     or to_regclass('public.payment_intents_invoice_idx') is null
  then raise exception 'PAYMENT-CORE composite FK covering indexes are missing'; end if;

  if to_regprocedure('public.get_crm_customer360_v6(uuid,uuid,integer)') is null then
    raise exception 'PAYMENT-CORE Customer360 V6 function is missing';
  end if;
end;
$payment_core_automation_acl$;

reset role;
