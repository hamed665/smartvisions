\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000c005'),
  ('00000000-0000-0000-0000-00000000c006')
on conflict do nothing;

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-00000000c005','SALES_MANAGER'),
  ('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-00000000c006','ADMIN')
on conflict do nothing;

do $custom_structure$
declare
  v_name text;
begin
  foreach v_name in array array[
    'crm_custom_field_definitions',
    'crm_custom_field_options',
    'crm_custom_field_values'
  ]
  loop
    if not (
      select relrowsecurity
      from pg_class
      where oid=('public.'||v_name)::regclass
    ) then
      raise exception '% RLS is not enabled', v_name;
    end if;

    if has_table_privilege('anon','public.'||v_name,'SELECT')
       or has_table_privilege('service_role','public.'||v_name,'SELECT')
    then
      raise exception '% exposed to anon/service_role', v_name;
    end if;

    if not has_table_privilege('authenticated','public.'||v_name,'SELECT')
       or not has_table_privilege('authenticated','public.'||v_name,'INSERT')
       or not has_table_privilege('authenticated','public.'||v_name,'UPDATE')
    then
      raise exception '% authenticated grants missing', v_name;
    end if;

    if has_table_privilege('authenticated','public.'||v_name,'DELETE') then
      raise exception '% unexpectedly allows DELETE', v_name;
    end if;
  end loop;

  if (
    select p.prosecdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_crm_custom_field_definitions'
    limit 1
  ) then
    raise exception 'Custom-field query unexpectedly SECURITY DEFINER';
  end if;

  if (
    select p.prosecdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='find_crm_entities_by_custom_field_exact'
    limit 1
  ) then
    raise exception 'Custom-field filter unexpectedly SECURITY DEFINER';
  end if;

  if (select count(*) from public.crm_custom_field_definitions) <> 0
     or (select count(*) from public.crm_custom_field_options) <> 0
     or (select count(*) from public.crm_custom_field_values) <> 0
  then
    raise exception 'Custom-field migration fabricated tenant data';
  end if;
end;
$custom_structure$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $required_creation_guard$
begin
  begin
    insert into public.crm_custom_field_definitions(
      organization_id,entity_type,field_key,label,data_type,required,
      last_request_key,created_by_user_id,updated_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      'LEAD','required_now','Required now','TEXT',true,
      'custom-def-required-now',
      '00000000-0000-0000-0000-00000000c001',
      '00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Required LEAD field unexpectedly created with existing uncovered Leads';
  exception when others then
    if sqlerrm not like 'Required custom field cannot be created while existing entities lack values%' then
      raise;
    end if;
  end;
end;
$required_creation_guard$;

insert into public.crm_custom_field_definitions(
  organization_id,entity_type,field_key,label,data_type,required,
  sensitivity_class,searchable,filterable,unique_value,
  last_request_key,created_by_user_id,updated_by_user_id
) values
(
  '00000000-0000-0000-0000-000000000c01',
  'LEAD','external_ref','External Ref','TEXT',false,
  'INTERNAL',true,true,true,
  'custom-def-external-ref',
  '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-00000000c001'
),
(
  '00000000-0000-0000-0000-000000000c01',
  'LEAD','region','Region','SINGLE_SELECT',false,
  'INTERNAL',false,true,false,
  'custom-def-region',
  '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-00000000c001'
),
(
  '00000000-0000-0000-0000-000000000c01',
  'LEAD','secret_note','Secret Note','TEXT',false,
  'SENSITIVE',false,false,false,
  'custom-def-secret',
  '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-00000000c001'
),
(
  '00000000-0000-0000-0000-000000000c01',
  'DEAL','contract_code','Contract Code','TEXT',false,
  'INTERNAL',true,true,true,
  'custom-def-contract',
  '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-00000000c001'
);

insert into public.crm_custom_field_options(
  organization_id,definition_id,option_key,label,position,status,
  last_request_key,created_by_user_id,updated_by_user_id
)
select
  d.organization_id,d.id,x.option_key,x.label,x.position,'ACTIVE',
  'custom-opt-'||x.option_key,
  '00000000-0000-0000-0000-00000000c001',
  '00000000-0000-0000-0000-00000000c001'
from public.crm_custom_field_definitions d
cross join (
  values ('muscat','Muscat',1),('dubai','Dubai',2)
) as x(option_key,label,position)
where d.organization_id='00000000-0000-0000-0000-000000000c01'
  and d.field_key='region';

do $invalid_option_type$
declare
  v_def uuid;
begin
  select id into v_def
  from public.crm_custom_field_definitions
  where field_key='external_ref'
    and organization_id='00000000-0000-0000-0000-000000000c01';

  begin
    insert into public.crm_custom_field_options(
      organization_id,definition_id,option_key,label,position,
      last_request_key,created_by_user_id,updated_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      v_def,'bad','Bad',1,'custom-opt-bad',
      '00000000-0000-0000-0000-00000000c001',
      '00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Option unexpectedly created on non-select field';
  exception when others then
    if sqlerrm not like 'Options are only valid for select custom fields%' then
      raise;
    end if;
  end;
end;
$invalid_option_type$;

do $create_values$
declare
  v_ref uuid;
  v_region uuid;
  v_secret uuid;
begin
  select id into v_ref from public.crm_custom_field_definitions
   where organization_id='00000000-0000-0000-0000-000000000c01'
     and field_key='external_ref';
  select id into v_region from public.crm_custom_field_definitions
   where organization_id='00000000-0000-0000-0000-000000000c01'
     and field_key='region';
  select id into v_secret from public.crm_custom_field_definitions
   where organization_id='00000000-0000-0000-0000-000000000c01'
     and field_key='secret_note';

  insert into public.crm_custom_field_values(
    organization_id,definition_id,definition_version,entity_type,data_type,
    lead_id,state,value_text,version,last_request_key,
    created_by_user_id,updated_by_user_id
  ) values
  (
    '00000000-0000-0000-0000-000000000c01',v_ref,1,'LEAD','TEXT',
    '20000000-0000-0000-0000-000000000c01','SET','REF-001',1,'custom-value-ref-1',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c001'
  ),
  (
    '00000000-0000-0000-0000-000000000c01',v_region,1,'LEAD','SINGLE_SELECT',
    '20000000-0000-0000-0000-000000000c01','SET',null,1,'custom-value-region-1',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c001'
  ),
  (
    '00000000-0000-0000-0000-000000000c01',v_secret,1,'LEAD','TEXT',
    '20000000-0000-0000-0000-000000000c01','SET','private-fixture-secret',1,'custom-value-secret-1',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c001'
  );

  update public.crm_custom_field_values
  set value_option_keys=array['muscat'],
      updated_by_user_id='00000000-0000-0000-0000-00000000c001',
      last_request_key='custom-value-region-1-set'
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and definition_id=v_region
    and lead_id='20000000-0000-0000-0000-000000000c01';
end;
$create_values$;

do $unique_guard$
declare
  v_ref uuid;
begin
  select id into v_ref
  from public.crm_custom_field_definitions
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and field_key='external_ref';

  begin
    insert into public.crm_custom_field_values(
      organization_id,definition_id,definition_version,entity_type,data_type,
      lead_id,state,value_text,last_request_key,
      created_by_user_id,updated_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',v_ref,1,'LEAD','TEXT',
      '20000000-0000-0000-0000-000000000c02','SET','REF-001','custom-value-ref-duplicate',
      '00000000-0000-0000-0000-00000000c001',
      '00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Unique custom value duplicate unexpectedly inserted';
  exception when others then
    if sqlerrm not like 'CRM custom field unique value already exists%' then
      raise;
    end if;
  end;
end;
$unique_guard$;

do $cross_tenant_binding$
declare
  v_ref uuid;
begin
  select id into v_ref
  from public.crm_custom_field_definitions
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and field_key='external_ref';

  begin
    insert into public.crm_custom_field_values(
      organization_id,definition_id,definition_version,entity_type,data_type,
      lead_id,state,value_text,last_request_key,
      created_by_user_id,updated_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',v_ref,1,'LEAD','TEXT',
      '20000000-0000-0000-0000-000000000d01','SET','REF-CROSS','custom-value-cross',
      '00000000-0000-0000-0000-00000000c001',
      '00000000-0000-0000-0000-00000000c001'
    );
    raise exception 'Cross-tenant Lead custom value unexpectedly inserted';
  exception
    when foreign_key_violation then null;
  end;
end;
$cross_tenant_binding$;

do $option_deprecation_guard$
declare
  v_region uuid;
begin
  select id into v_region
  from public.crm_custom_field_definitions
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and field_key='region';

  begin
    update public.crm_custom_field_options
    set status='DEPRECATED',
        updated_by_user_id='00000000-0000-0000-0000-00000000c001',
        last_request_key='custom-opt-muscat-deprecate'
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and definition_id=v_region
      and option_key='muscat';
    raise exception 'Referenced select option unexpectedly deprecated';
  exception when others then
    if sqlerrm not like 'Cannot deprecate custom field option while values/defaults reference it%' then
      raise;
    end if;
  end;
end;
$option_deprecation_guard$;

do $required_evolution$
declare
  v_region uuid;
begin
  select id into v_region
  from public.crm_custom_field_definitions
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and field_key='region';

  begin
    update public.crm_custom_field_definitions
    set required=true,
        updated_by_user_id='00000000-0000-0000-0000-00000000c001',
        last_request_key='custom-def-region-required-early'
    where id=v_region;
    raise exception 'Required custom field activated with uncovered Leads';
  exception when others then
    if sqlerrm not like 'Required custom field cannot activate while % entities lack SET values%' then
      raise;
    end if;
  end;

  insert into public.crm_custom_field_values(
    organization_id,definition_id,definition_version,entity_type,data_type,
    lead_id,state,value_option_keys,last_request_key,
    created_by_user_id,updated_by_user_id
  ) values (
    '00000000-0000-0000-0000-000000000c01',v_region,1,'LEAD','SINGLE_SELECT',
    '20000000-0000-0000-0000-000000000c02','SET',array['dubai'],'custom-value-region-2',
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-00000000c001'
  );

  update public.crm_custom_field_definitions
  set required=true,
      updated_by_user_id='00000000-0000-0000-0000-00000000c001',
      last_request_key='custom-def-region-required-ok'
  where id=v_region;

  if not exists (
    select 1 from public.crm_custom_field_definitions
    where id=v_region and required and version=2
  ) then
    raise exception 'Required custom-field evolution did not persist';
  end if;
end;
$required_evolution$;

do $clear_optional_and_audit_redaction$
declare
  v_ref uuid;
  v_value uuid;
begin
  select id into v_ref
  from public.crm_custom_field_definitions
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and field_key='external_ref';

  select id into v_value
  from public.crm_custom_field_values
  where definition_id=v_ref
    and lead_id='20000000-0000-0000-0000-000000000c01';

  update public.crm_custom_field_values
  set state='CLEARED',
      updated_by_user_id='00000000-0000-0000-0000-00000000c001',
      last_request_key='custom-value-ref-1-clear'
  where id=v_value;

  if not exists (
    select 1 from public.crm_custom_field_values
    where id=v_value and state='CLEARED' and value_text is null
      and cleared_at is not null
      and cleared_by_user_id='00000000-0000-0000-0000-00000000c001'
  ) then
    raise exception 'Optional custom field clear contract failed';
  end if;

  if exists (
    select 1
    from public.audit_logs
    where entity_type='crm_custom_field_values'
      and (
        coalesce(before_data::text,'') ilike '%REF-001%'
        or coalesce(after_data::text,'') ilike '%REF-001%'
        or coalesce(before_data::text,'') ilike '%private-fixture-secret%'
        or coalesce(after_data::text,'') ilike '%private-fixture-secret%'
      )
  ) then
    raise exception 'Custom-field audit leaked raw value';
  end if;
end;
$clear_optional_and_audit_redaction$;

do $exact_filter$
declare
  v_region uuid;
  v_count integer;
begin
  select id into v_region
  from public.crm_custom_field_definitions
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and field_key='region';

  select count(*) into v_count
  from public.find_crm_entities_by_custom_field_exact(
    '00000000-0000-0000-0000-000000000c01',
    v_region,
    null,null,null,null,null,null,null,
    'muscat',
    50,null
  );

  if v_count <> 1 then
    raise exception 'Exact select custom-field filter expected 1 row, got %', v_count;
  end if;
end;
$exact_filter$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c004',false);

do $viewer_sensitive_read$
begin
  if not exists (
    select 1
    from public.crm_custom_field_definitions
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and field_key='region'
  ) then
    raise exception 'Viewer cannot read ordinary custom-field definition';
  end if;

  if exists (
    select 1
    from public.crm_custom_field_definitions
    where organization_id='00000000-0000-0000-0000-000000000c01'
      and field_key='secret_note'
  ) then
    raise exception 'Viewer can read SENSITIVE custom-field definition';
  end if;

  if exists (
    select 1
    from public.crm_custom_field_values v
    join public.crm_custom_field_definitions d
      on d.organization_id=v.organization_id and d.id=v.definition_id
    where d.field_key='secret_note'
  ) then
    raise exception 'Viewer can read SENSITIVE custom-field value';
  end if;

  update public.crm_custom_field_definitions
  set label='Viewer mutation',
      updated_by_user_id='00000000-0000-0000-0000-00000000c004',
      last_request_key='viewer-mutates-def'
  where field_key='region';

  if found then
    raise exception 'Viewer unexpectedly updated custom-field definition';
  end if;
end;
$viewer_sensitive_read$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c003',false);

do $sales_agent_lead_denied_deal_owned_allowed$
declare
  v_region uuid;
  v_contract uuid;
  v_agent_deal uuid;
begin
  select id into v_region
  from public.crm_custom_field_definitions
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and field_key='region';

  begin
    insert into public.crm_custom_field_values(
      organization_id,definition_id,definition_version,entity_type,data_type,
      lead_id,state,value_option_keys,last_request_key,
      created_by_user_id,updated_by_user_id
    ) values (
      '00000000-0000-0000-0000-000000000c01',v_region,2,'LEAD','SINGLE_SELECT',
      '20000000-0000-0000-0000-000000000c01','SET',array['muscat'],'agent-lead-write',
      '00000000-0000-0000-0000-00000000c003',
      '00000000-0000-0000-0000-00000000c003'
    );
    raise exception 'Sales Agent unexpectedly wrote Lead custom field';
  exception when insufficient_privilege then null;
  end;

  select id into v_contract
  from public.crm_custom_field_definitions
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and field_key='contract_code';

  select id into v_agent_deal
  from public.crm_deals
  where organization_id='00000000-0000-0000-0000-000000000c01'
    and request_key='fixture-agent-deal';

  insert into public.crm_custom_field_values(
    organization_id,definition_id,definition_version,entity_type,data_type,
    deal_id,state,value_text,last_request_key,
    created_by_user_id,updated_by_user_id
  ) values (
    '00000000-0000-0000-0000-000000000c01',v_contract,1,'DEAL','TEXT',
    v_agent_deal,'SET','AGENT-C-1','agent-deal-custom',
    '00000000-0000-0000-0000-00000000c003',
    '00000000-0000-0000-0000-00000000c003'
  );

  if not exists (
    select 1 from public.crm_custom_field_values
    where definition_id=v_contract and deal_id=v_agent_deal and value_text='AGENT-C-1'
  ) then
    raise exception 'Sales Agent could not write owned Deal custom field';
  end if;
end;
$sales_agent_lead_denied_deal_owned_allowed$;

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c005',false);

do $sales_manager_values_not_schema$
begin
  update public.crm_custom_field_definitions
  set label='Manager mutation',
      updated_by_user_id='00000000-0000-0000-0000-00000000c005',
      last_request_key='manager-mutates-def'
  where field_key='region';

  if found then
    raise exception 'Sales Manager unexpectedly updated schema definition';
  end if;
end;
$sales_manager_values_not_schema$;

reset role;
select set_config('request.jwt.claim.sub','',false);
