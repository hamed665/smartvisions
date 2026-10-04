\set ON_ERROR_STOP on

do $$
declare
  v record;
begin
  select
    action_key,tool_key,authority_key,permission_key,scope_type,
    cost_class,side_effect_class,approval_requirement,availability,
    required_work_packages,metadata,input_schema,output_schema
  into v
  from public.tool_action_registry
  where action_key='DELIVER_DATA_EXPORT';

  if not found then
    raise exception 'DELIVER_DATA_EXPORT registry contract is missing';
  end if;
  if v.tool_key<>'ANALYTICS_EXPORT'
     or v.authority_key<>'ANALYTICS_EXPORT_COMPOSER'
     or v.permission_key<>'REPORT_EXPORT'
     or v.scope_type<>'AUTOMATION_RULE'
  then
    raise exception 'DATA-EXPORTS registry authority contract is invalid';
  end if;
  if v.cost_class<>'PROVIDER_METERED'
     or v.side_effect_class<>'EXTERNAL_PROVIDER'
     or v.approval_requirement<>'NONE'
     or v.availability<>'AVAILABLE'
  then
    raise exception 'DATA-EXPORTS runtime contract is invalid';
  end if;
  if cardinality(v.required_work_packages)<>0 then
    raise exception 'DATA-EXPORTS scheduled delivery should be activated by DATA-REPORTING';
  end if;
  if v.metadata->>'scheduleAuthority'<>'SCHEDULE_DUE'
     or v.metadata->>'recipientAuthority'<>'organization_settings.notification_email'
     or v.metadata->>'scheduleProducer'<>'DATA_REPORTING_RECONCILER'
     or coalesce((v.metadata->>'googleSheetsPublishing')::boolean,true)<>false
  then
    raise exception 'DATA-EXPORTS authority metadata is invalid';
  end if;
  if v.input_schema#>>'{properties,format,type}'<>'string'
     or v.input_schema#>>'{properties,days,type}'<>'integer'
     or v.output_schema#>>'{properties,providerMessageId,type}'<>'string'
  then
    raise exception 'DATA-EXPORTS action schema contract is invalid';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind in ('r','p','m')
      and c.relname in (
        'data_exports','analytics_exports','report_exports',
        'export_queue','export_jobs','export_facts'
      )
  ) then
    raise exception 'DATA-EXPORTS created a forbidden parallel export truth/queue table';
  end if;
end
$$;
