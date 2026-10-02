\set ON_ERROR_STOP on

-- PAYMENT-OMAN controlled acceptance. Synthetic credentials exist only inside this
-- disposable PostgreSQL 17 CI transaction and are rolled back.

begin;
reset role;
set role service_role;

do $payment_oman$
declare
  org uuid:='00000000-0000-0000-0000-00000000c701';
  actor uuid:='00000000-0000-0000-0000-00000000c711';
  before_tx bigint;
  tap_result jsonb;
  thawani_result jsonb;
  tap_secret_ref text;
  thawani_secret_ref text;
  thawani_public_ref text;
begin
  select count(*) into before_tx from public.payment_transactions;

  tap_result:=public.configure_oman_payment_provider_v1(
    org,actor,'TAP','TEST','ci-tap-secret','','merchant_ci_oman','payment-oman-config-tap-ci'
  );
  if tap_result->>'status'<>'READY' then raise exception 'Tap config did not remain READY before provider evidence'; end if;

  thawani_result:=public.configure_oman_payment_provider_v1(
    org,actor,'THAWANI','TEST','ci-thawani-secret','ci-thawani-publishable','',
    'payment-oman-config-thawani-ci'
  );
  if thawani_result->>'status'<>'READY' then raise exception 'Thawani config did not remain READY before provider evidence'; end if;

  select config->>'secret_key_ref' into tap_secret_ref
  from public.integration_connections where organization_id=org and provider='TAP' and channel='PAYMENT';
  select config->>'secret_key_ref',config->>'publishable_key_ref' into thawani_secret_ref,thawani_public_ref
  from public.integration_connections where organization_id=org and provider='THAWANI' and channel='PAYMENT';

  if tap_secret_ref is null or thawani_secret_ref is null or thawani_public_ref is null then
    raise exception 'PAYMENT-OMAN did not store Vault references';
  end if;
  if (select config::text from public.integration_connections where organization_id=org and provider='TAP' and channel='PAYMENT')
      like '%ci-tap-secret%' then raise exception 'Tap plaintext secret leaked into integration_connections'; end if;
  if (select config::text from public.integration_connections where organization_id=org and provider='THAWANI' and channel='PAYMENT')
      like '%ci-thawani-secret%' or
     (select config::text from public.integration_connections where organization_id=org and provider='THAWANI' and channel='PAYMENT')
      like '%ci-thawani-publishable%' then raise exception 'Thawani plaintext credential leaked into integration_connections'; end if;

  if public.integration_vault_read_secret(tap_secret_ref)<>'ci-tap-secret'
     or public.integration_vault_read_secret(thawani_secret_ref)<>'ci-thawani-secret'
     or public.integration_vault_read_secret(thawani_public_ref)<>'ci-thawani-publishable'
  then raise exception 'PAYMENT-OMAN Vault references do not resolve controlled credentials'; end if;

  if (select count(*) from public.payment_transactions)<>before_tx then
    raise exception 'PAYMENT-OMAN provider configuration moved money';
  end if;

  if public.record_oman_payment_provider_health_v1(
    org,'TAP',true,'CI controlled provider probe',
    '{"controlledFixture":true,"operation":"PROBE"}'::jsonb,'payment-oman-health-tap-ci'
  )<>'CONNECTED' then raise exception 'Verified provider evidence did not transition Tap to CONNECTED'; end if;

  if (select status from public.integration_connections where organization_id=org and provider='THAWANI' and channel='PAYMENT')<>'READY' then
    raise exception 'Unprobed Thawani provider incorrectly became CONNECTED';
  end if;
end;
$payment_oman$;

reset role;
set role authenticated;

do $payment_oman_acl$
begin
  begin
    perform public.integration_vault_read_secret('secretref://supabase-vault/00000000-0000-0000-0000-000000000000');
    raise exception 'authenticated unexpectedly read Integration Vault';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.configure_oman_payment_provider_v1(
      '00000000-0000-0000-0000-00000000c701','00000000-0000-0000-0000-00000000c711',
      'TAP','TEST','forbidden','','merchant','payment-oman-forbidden'
    );
    raise exception 'authenticated unexpectedly configured PAYMENT-OMAN';
  exception when insufficient_privilege then null;
  end;
end;
$payment_oman_acl$;

reset role;

do $payment_oman_contract$
begin
  if not has_function_privilege('service_role','public.integration_vault_read_secret(text)'::regprocedure,'EXECUTE')
     or not has_function_privilege('service_role','public.configure_oman_payment_provider_v1(uuid,uuid,text,text,text,text,text,text)'::regprocedure,'EXECUTE')
     or not has_function_privilege('service_role','public.record_oman_payment_provider_health_v1(uuid,text,boolean,text,jsonb,text)'::regprocedure,'EXECUTE')
  then raise exception 'service_role lacks PAYMENT-OMAN governed functions'; end if;

  if has_function_privilege('authenticated','public.integration_vault_read_secret(text)'::regprocedure,'EXECUTE')
     or has_function_privilege('authenticated','public.configure_oman_payment_provider_v1(uuid,uuid,text,text,text,text,text,text)'::regprocedure,'EXECUTE')
  then raise exception 'PAYMENT-OMAN trusted functions are exposed to authenticated'; end if;

  if to_regclass('public.tap_payments') is not null
     or to_regclass('public.thawani_payments') is not null
     or to_regclass('public.payment_oman_transactions') is not null
  then raise exception 'PAYMENT-OMAN created a parallel provider ledger'; end if;
end;
$payment_oman_contract$;

rollback;
