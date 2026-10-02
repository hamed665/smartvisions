\set ON_ERROR_STOP on
begin;

do $slice8$
declare
  v_destination_def text;
  v_credential_def text;
  v_apply_def text;
  v_disconnect_def text;
  v_health_def text;
  v_start_def text;
begin
  select pg_get_functiondef(p.oid) into v_destination_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='resolve_meta_whatsapp_destination';

  select pg_get_functiondef(p.oid) into v_credential_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='resolve_meta_whatsapp_credential';

  select pg_get_functiondef(p.oid) into v_apply_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname='apply_meta_whatsapp_binding_credential_internal';

  select pg_get_functiondef(p.oid) into v_disconnect_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='disconnect_meta_whatsapp_binding';

  select pg_get_functiondef(p.oid) into v_health_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='mark_meta_whatsapp_binding_health';

  select pg_get_functiondef(p.oid) into v_start_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='start_meta_whatsapp_setup_attempt';

  if v_destination_def is null
     or v_destination_def not like '%MANUAL_DISCONNECTED%'
     or v_destination_def not like '%META_CREDENTIAL_INVALID_OR_REVOKED%'
     or v_destination_def not like '%META_CREDENTIAL_HEALTH_UNCONFIRMED%'
     or v_destination_def not like '%META_PROVIDER_SUBSCRIPTION_MISSING%'
     or v_destination_def not like '%ic.status = ''CONNECTED''%'
  then raise exception 'Meta WhatsApp inbound routing does not fail closed on Slice 8 lifecycle state'; end if;

  if v_credential_def is null
     or v_credential_def not like '%MANUAL_DISCONNECTED%'
     or v_credential_def not like '%META_CREDENTIAL_INVALID_OR_REVOKED%'
     or v_credential_def not like '%META_CREDENTIAL_HEALTH_UNCONFIRMED%'
     or v_credential_def not like '%META_PROVIDER_SUBSCRIPTION_MISSING%'
     or v_credential_def not like '%vault.decrypted_secrets%'
  then raise exception 'Meta WhatsApp outbound credential resolution does not fail closed on Slice 8 lifecycle state'; end if;

  if v_apply_def is null
     or v_apply_def not like '%reconnect WABA identity changed%'
     or v_apply_def not like '%reconnect phone identity changed%'
     or v_apply_def not like '%vault.update_secret%'
     or v_apply_def not like '%version = version + 1%'
     or v_apply_def not like '%last_error_code = null%'
  then raise exception 'same-binding Meta WhatsApp reconnect identity/credential rotation drifted'; end if;

  if v_start_def is null
     or v_start_def not like '%EXISTING_API_RECONNECT%'
     or v_start_def not like '%RECONNECT%'
     or v_start_def like '%FULL_MIGRATION_FROM_BUSINESS_APP%'
  then raise exception 'bounded same-binding reconnect attempt contract drifted'; end if;

  if v_disconnect_def is null
     or v_disconnect_def not like '%Organization OWNER required%'
     or v_disconnect_def not like '%MANUAL_DISCONNECTED%'
     or v_disconnect_def not like '%SUPERSEDED%'
     or v_disconnect_def not like '%lifecycle_status = ''DEGRADED''%'
     or v_disconnect_def not like '%mobile_whatsapp_account_changed%'
     or v_disconnect_def not like '%false%'
  then raise exception 'safe Meta WhatsApp disconnect contract drifted'; end if;

  if v_health_def is null
     or v_health_def not like '%Organization OWNER required%'
     or v_health_def not like '%CREDENTIAL_INVALID%'
     or v_health_def not like '%UNCONFIRMED%'
     or v_health_def not like '%SUBSCRIPTION_MISSING%'
     or v_health_def not like '%META_PROVIDER_SUBSCRIPTION_MISSING%'
     or v_health_def not like '%version = version + 1%'
     or v_health_def not like '%p_expected_version%'
  then raise exception 'Meta WhatsApp credential/subscription health contract drifted'; end if;

  if has_function_privilege('anon',
       'public.disconnect_meta_whatsapp_binding(uuid,uuid,integer,uuid,text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.disconnect_meta_whatsapp_binding(uuid,uuid,integer,uuid,text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.disconnect_meta_whatsapp_binding(uuid,uuid,integer,uuid,text)',
       'EXECUTE')
  then raise exception 'Meta WhatsApp disconnect ACL drifted'; end if;

  if has_function_privilege('anon',
       'public.mark_meta_whatsapp_binding_health(uuid,uuid,integer,text,uuid,text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.mark_meta_whatsapp_binding_health(uuid,uuid,integer,text,uuid,text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.mark_meta_whatsapp_binding_health(uuid,uuid,integer,text,uuid,text)',
       'EXECUTE')
  then raise exception 'Meta WhatsApp health ACL drifted'; end if;

  if has_function_privilege('anon',
       'public.resolve_meta_whatsapp_destination(text,text)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.resolve_meta_whatsapp_destination(text,text)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.resolve_meta_whatsapp_destination(text,text)',
       'EXECUTE')
  then raise exception 'Meta WhatsApp inbound resolver ACL drifted'; end if;

  if has_function_privilege('anon',
       'public.resolve_meta_whatsapp_credential(uuid,uuid,uuid)',
       'EXECUTE')
     or has_function_privilege('authenticated',
       'public.resolve_meta_whatsapp_credential(uuid,uuid,uuid)',
       'EXECUTE')
     or not has_function_privilege('service_role',
       'public.resolve_meta_whatsapp_credential(uuid,uuid,uuid)',
       'EXECUTE')
  then raise exception 'Meta WhatsApp credential resolver ACL drifted'; end if;
end;
$slice8$;


-- Controlled transactional behavior proof. Everything below rolls back and never
-- touches Production/customer data. It exercises the actual same-binding lifecycle,
-- not merely the text of the SQL functions.
insert into auth.users(id)
values ('00000000-0000-4000-8000-000000016901');

insert into public.organizations(id,name)
values ('10000000-0000-4000-8000-000000016901','Slice 8 smoke org');

insert into public.organization_members(organization_id,user_id,role)
values (
  '10000000-0000-4000-8000-000000016901',
  '00000000-0000-4000-8000-000000016901',
  'OWNER'
);

insert into public.brands(id,organization_id,name,slug)
values (
  '20000000-0000-4000-8000-000000016901',
  '10000000-0000-4000-8000-000000016901',
  'Slice 8 smoke brand',
  'slice8-smoke-brand'
);

insert into public.tenant_businesses(id,organization_id,brand_id,name,slug,status)
values (
  '30000000-0000-4000-8000-000000016901',
  '10000000-0000-4000-8000-000000016901',
  '20000000-0000-4000-8000-000000016901',
  'Slice 8 smoke business',
  'slice8-smoke-business',
  'ACTIVE'
);

insert into public.integration_connections(
  id,organization_id,provider,channel,enabled,status,account_label
) values (
  '40000000-0000-4000-8000-000000016901',
  '10000000-0000-4000-8000-000000016901',
  'META','WHATSAPP',true,'CONNECTED','Slice 8 smoke Meta'
);

set local smartvisions.chatwoot_bridge_command = '1';

insert into public.communication_channel_bindings(
  id,organization_id,tenant_business_id,branch_id,integration_connection_id,
  channel,status,version,last_request_key,last_verified_at,last_error_code,
  created_by_user_id,updated_by_user_id,
  provider,provider_account_id,provider_destination_id,provider_destination_label
) values (
  '50000000-0000-4000-8000-000000016901',
  '10000000-0000-4000-8000-000000016901',
  '30000000-0000-4000-8000-000000016901',
  null,
  '40000000-0000-4000-8000-000000016901',
  'WHATSAPP','ACTIVE',1,'slice8-binding-created',null,null,
  '00000000-0000-4000-8000-000000016901',
  '00000000-0000-4000-8000-000000016901',
  'META','waba-slice8','phone-slice8','+96890000008'
);

do $slice8_behavior$
declare
  v_attempt public.communication_channel_setup_attempts%rowtype;
  v_binding public.communication_channel_bindings%rowtype;
  v_count integer;
begin
  select * into v_attempt
    from public.start_meta_whatsapp_setup_attempt(
      '10000000-0000-4000-8000-000000016901',
      '50000000-0000-4000-8000-000000016901',
      1,
      'EXISTING_API_RECONNECT',
      'RECONNECT',
      '00000000-0000-4000-8000-000000016901',
      'slice8-reconnect-v1'
    );

  if v_attempt.communication_channel_binding_id <> '50000000-0000-4000-8000-000000016901'
     or v_attempt.binding_version <> 1
     or v_attempt.connection_mode <> 'EXISTING_API_RECONNECT'
     or v_attempt.purpose <> 'RECONNECT'
     or v_attempt.status <> 'STARTED'
  then
    raise exception 'reconnect did not create bounded attempt on the existing binding';
  end if;

  select * into v_binding
    from public.mark_meta_whatsapp_binding_health(
      '10000000-0000-4000-8000-000000016901',
      '50000000-0000-4000-8000-000000016901',
      1,
      'VERIFIED',
      '00000000-0000-4000-8000-000000016901',
      'slice8-health-v1'
    );

  if v_binding.id <> '50000000-0000-4000-8000-000000016901'
     or v_binding.version <> 2
     or v_binding.last_error_code is not null
     or v_binding.last_verified_at is null
  then
    raise exception 'version-bound health evidence did not stay on the same binding';
  end if;

  begin
    perform public.mark_meta_whatsapp_binding_health(
      '10000000-0000-4000-8000-000000016901',
      '50000000-0000-4000-8000-000000016901',
      1,
      'UNCONFIRMED',
      '00000000-0000-4000-8000-000000016901',
      'slice8-stale-health-v1'
    );
    raise exception 'stale health evidence unexpectedly mutated the newer binding';
  exception
    when others then
      if sqlerrm='stale health evidence unexpectedly mutated the newer binding' then
        raise;
      end if;
      if position('not health-checkable' in sqlerrm)=0 then
        raise;
      end if;
  end;

  select * into v_binding
    from public.disconnect_meta_whatsapp_binding(
      '10000000-0000-4000-8000-000000016901',
      '50000000-0000-4000-8000-000000016901',
      2,
      '00000000-0000-4000-8000-000000016901',
      'slice8-disconnect-v2'
    );

  if v_binding.id <> '50000000-0000-4000-8000-000000016901'
     or v_binding.version <> 3
     or v_binding.last_error_code <> 'MANUAL_DISCONNECTED'
  then
    raise exception 'safe disconnect did not block provider actions on the same binding';
  end if;

  if not exists (
    select 1
      from public.communication_channel_setup_attempts
     where id=v_attempt.id
       and status='SUPERSEDED'
  ) then
    raise exception 'disconnect did not supersede the in-flight reconnect attempt';
  end if;

  select * into v_binding
    from public.disconnect_meta_whatsapp_binding(
      '10000000-0000-4000-8000-000000016901',
      '50000000-0000-4000-8000-000000016901',
      2,
      '00000000-0000-4000-8000-000000016901',
      'slice8-disconnect-replay'
    );

  if v_binding.version <> 3 or v_binding.last_error_code <> 'MANUAL_DISCONNECTED' then
    raise exception 'disconnect replay was not idempotent';
  end if;

  select count(*) into v_count
    from public.audit_logs
   where organization_id='10000000-0000-4000-8000-000000016901'
     and action='META_WHATSAPP_BINDING_DISCONNECTED'
     and entity_id='50000000-0000-4000-8000-000000016901';

  if v_count <> 1 then
    raise exception 'disconnect replay produced duplicate canonical disconnect audit';
  end if;

  select * into v_attempt
    from public.start_meta_whatsapp_setup_attempt(
      '10000000-0000-4000-8000-000000016901',
      '50000000-0000-4000-8000-000000016901',
      3,
      'EXISTING_API_RECONNECT',
      'RECONNECT',
      '00000000-0000-4000-8000-000000016901',
      'slice8-reconnect-v3'
    );

  if v_attempt.communication_channel_binding_id <> '50000000-0000-4000-8000-000000016901'
     or v_attempt.binding_version <> 3
     or v_attempt.status <> 'STARTED'
  then
    raise exception 'post-disconnect reconnect did not reuse the same canonical binding';
  end if;

  select count(*) into v_count
    from public.communication_channel_bindings
   where organization_id='10000000-0000-4000-8000-000000016901'
     and channel='WHATSAPP';

  if v_count <> 1 then
    raise exception 'Slice 8 lifecycle created a parallel WhatsApp binding';
  end if;
end;
$slice8_behavior$;

rollback;
