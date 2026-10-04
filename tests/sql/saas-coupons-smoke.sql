\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000f101'),
  ('00000000-0000-0000-0000-00000000f102'),
  ('00000000-0000-0000-0000-00000000f103')
on conflict(id) do nothing;

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-000000000f01','SAAS Coupons Issuer/Fixed'),
  ('00000000-0000-0000-0000-000000000f02','SAAS Coupons Percentage'),
  ('00000000-0000-0000-0000-000000000f03','SAAS Coupons Free Setup'),
  ('00000000-0000-0000-0000-000000000f04','SAAS Coupons Trial')
on conflict(id) do nothing;

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-000000000f01','00000000-0000-0000-0000-00000000f101','OWNER'),
  ('00000000-0000-0000-0000-000000000f01','00000000-0000-0000-0000-00000000f102','ADMIN'),
  ('00000000-0000-0000-0000-000000000f01','00000000-0000-0000-0000-00000000f103','SALES_AGENT')
on conflict do nothing;

insert into public.plans(id,code,name,status,metadata)
values (
  '60000000-0000-0000-0000-000000000f10',
  'SAAS_COUPONS_SMOKE',
  'SaaS Coupons Smoke',
  'DRAFT',
  '{"testOnly":true}'::jsonb
);

insert into public.pricing_versions(
  id,plan_id,version,status,currency,billing_period,
  recurring_amount,setup_fee_amount,ai_cost_multiplier,
  included_units,unit_prices,effective_from
) values (
  '70000000-0000-0000-0000-000000000f11',
  '60000000-0000-0000-0000-000000000f10',
  1,'DRAFT','OMR','MONTHLY',
  20,10,4,'{}'::jsonb,'{}'::jsonb,now()-interval '60 days'
);

update public.plans set status='ACTIVE'
where id='60000000-0000-0000-0000-000000000f10';
update public.pricing_versions set status='ACTIVE'
where id='70000000-0000-0000-0000-000000000f11';

set role service_role;

insert into public.subscriptions(
  id,organization_id,pricing_version_id,status,
  started_at,current_period_start,current_period_end,metadata
) values
  (
    '80000000-0000-0000-0000-000000000f21',
    '00000000-0000-0000-0000-000000000f01',
    '70000000-0000-0000-0000-000000000f11',
    'ACTIVE',now()-interval '32 days',now()-interval '31 days',now()-interval '1 day',
    '{"testOnly":true}'::jsonb
  ),
  (
    '80000000-0000-0000-0000-000000000f22',
    '00000000-0000-0000-0000-000000000f02',
    '70000000-0000-0000-0000-000000000f11',
    'ACTIVE',now()-interval '32 days',now()-interval '31 days',now()-interval '1 day',
    '{"testOnly":true}'::jsonb
  ),
  (
    '80000000-0000-0000-0000-000000000f23',
    '00000000-0000-0000-0000-000000000f03',
    '70000000-0000-0000-0000-000000000f11',
    'ACTIVE',now()-interval '32 days',now()-interval '31 days',now()-interval '1 day',
    '{"testOnly":true}'::jsonb
  ),
  (
    '80000000-0000-0000-0000-000000000f24',
    '00000000-0000-0000-0000-000000000f04',
    '70000000-0000-0000-0000-000000000f11',
    'ACTIVE',now()-interval '32 days',now()-interval '31 days',now()-interval '1 day',
    '{"testOnly":true}'::jsonb
  );

select public.put_saas_billing_profile_v1(
  '00000000-0000-0000-0000-000000000f01','OMR',500,'CI VAT','CI_TAX_EVIDENCE',
  0.4,'CI_COMMERCIAL_RATE',now()-interval '40 days',
  '00000000-0000-0000-0000-00000000f101','saas-coupon-profile-f01'
);
select public.put_saas_billing_profile_v1(
  '00000000-0000-0000-0000-000000000f02','OMR',500,'CI VAT','CI_TAX_EVIDENCE',
  0.4,'CI_COMMERCIAL_RATE',now()-interval '40 days',
  null,'saas-coupon-profile-f02'
);
select public.put_saas_billing_profile_v1(
  '00000000-0000-0000-0000-000000000f03','OMR',500,'CI VAT','CI_TAX_EVIDENCE',
  0.4,'CI_COMMERCIAL_RATE',now()-interval '40 days',
  null,'saas-coupon-profile-f03'
);
select public.put_saas_billing_profile_v1(
  '00000000-0000-0000-0000-000000000f04','OMR',500,'CI VAT','CI_TAX_EVIDENCE',
  0.4,'CI_COMMERCIAL_RATE',now()-interval '40 days',
  null,'saas-coupon-profile-f04'
);

select public.generate_saas_billing_statement_v1(
  '00000000-0000-0000-0000-000000000f01',
  '80000000-0000-0000-0000-000000000f21',
  '82000000-0000-0000-0000-000000000f31',
  'saas-coupon-statement-f01'
);
select public.generate_saas_billing_statement_v1(
  '00000000-0000-0000-0000-000000000f02',
  '80000000-0000-0000-0000-000000000f22',
  '82000000-0000-0000-0000-000000000f32',
  'saas-coupon-statement-f02'
);
select public.generate_saas_billing_statement_v1(
  '00000000-0000-0000-0000-000000000f03',
  '80000000-0000-0000-0000-000000000f23',
  '82000000-0000-0000-0000-000000000f33',
  'saas-coupon-statement-f03'
);
select public.generate_saas_billing_statement_v1(
  '00000000-0000-0000-0000-000000000f04',
  '80000000-0000-0000-0000-000000000f24',
  '82000000-0000-0000-0000-000000000f34',
  'saas-coupon-statement-f04'
);

do $snapshot_bridge$
begin
  if exists(
    select 1 from public.saas_billing_statements
    where id in (
      '82000000-0000-0000-0000-000000000f31',
      '82000000-0000-0000-0000-000000000f32',
      '82000000-0000-0000-0000-000000000f33',
      '82000000-0000-0000-0000-000000000f34'
    )
      and source_snapshot->>'discountAuthority'<>'SAAS_COUPONS_V1'
  ) then
    raise exception 'SAAS-COUPONS statement snapshot bridge is incomplete';
  end if;
end;
$snapshot_bridge$;

select public.create_saas_coupon_v1(
  '83000000-0000-0000-0000-000000000f41',
  '00000000-0000-0000-0000-000000000f01',
  'FIX5','Fixed five','FIXED',5,'OMR',null,null,
  now()-interval '1 day',now()+interval '30 days',
  10,1,1,
  '[{"type":"ALL"}]'::jsonb,
  '[{"type":"ORGANIZATION","id":"00000000-0000-0000-0000-000000000f01"}]'::jsonb,
  '00000000-0000-0000-0000-00000000f101',
  'saas-coupon-create-fix5'
);
select public.activate_saas_coupon_v1(
  '83000000-0000-0000-0000-000000000f41',
  'saas-coupon-activate-fix5'
);

select public.create_saas_coupon_v1(
  '83000000-0000-0000-0000-000000000f42',
  '00000000-0000-0000-0000-000000000f01',
  'PCT50','Platform half off','PERCENTAGE',null,null,5000,null,
  now()-interval '1 day',now()+interval '30 days',
  null,null,1,
  '[{"type":"COMPONENT","value":"PLATFORM"}]'::jsonb,
  '[{"type":"ORGANIZATION","id":"00000000-0000-0000-0000-000000000f02"}]'::jsonb,
  '00000000-0000-0000-0000-00000000f101',
  'saas-coupon-create-pct50'
);
select public.activate_saas_coupon_v1(
  '83000000-0000-0000-0000-000000000f42',
  'saas-coupon-activate-pct50'
);

select public.create_saas_coupon_v1(
  '83000000-0000-0000-0000-000000000f43',
  '00000000-0000-0000-0000-000000000f01',
  'FREESETUP','Free setup','FREE_SETUP',null,null,null,null,
  now()-interval '1 day',now()+interval '30 days',
  null,null,1,
  '[{"type":"COMPONENT","value":"SETUP"}]'::jsonb,
  '[{"type":"ORGANIZATION","id":"00000000-0000-0000-0000-000000000f03"}]'::jsonb,
  '00000000-0000-0000-0000-00000000f101',
  'saas-coupon-create-free-setup'
);
select public.activate_saas_coupon_v1(
  '83000000-0000-0000-0000-000000000f43',
  'saas-coupon-activate-free-setup'
);

select public.create_saas_coupon_v1(
  '83000000-0000-0000-0000-000000000f45',
  '00000000-0000-0000-0000-000000000f01',
  'BADTRIAL','Invalid partial trial','TRIAL',null,null,null,1,
  now()-interval '1 day',now()+interval '30 days',
  null,null,null,
  '[{"type":"COMPONENT","value":"PLATFORM"}]'::jsonb,
  '[{"type":"ORGANIZATION","id":"00000000-0000-0000-0000-000000000f04"}]'::jsonb,
  '00000000-0000-0000-0000-00000000f101',
  'saas-coupon-create-bad-trial'
);

do $trial_scope_guard$
begin
  begin
    perform public.activate_saas_coupon_v1(
      '83000000-0000-0000-0000-000000000f45',
      'saas-coupon-activate-bad-trial'
    );
    raise exception 'partial-scope TRIAL unexpectedly activated';
  exception when others then
    if sqlerrm not like 'SAAS-COUPONS TRIAL must target the full billing statement%' then
      raise;
    end if;
  end;
end;
$trial_scope_guard$;

select public.create_saas_coupon_v1(
  '83000000-0000-0000-0000-000000000f44',
  '00000000-0000-0000-0000-000000000f01',
  'TRIAL1','One billing period trial','TRIAL',null,null,null,1,
  now()-interval '1 day',now()+interval '30 days',
  null,null,null,
  '[{"type":"ALL"}]'::jsonb,
  '[{"type":"ORGANIZATION","id":"00000000-0000-0000-0000-000000000f04"}]'::jsonb,
  '00000000-0000-0000-0000-00000000f101',
  'saas-coupon-create-trial1'
);
select public.activate_saas_coupon_v1(
  '83000000-0000-0000-0000-000000000f44',
  'saas-coupon-activate-trial1'
);

do $target_isolation$
begin
  begin
    perform public.apply_saas_coupon_to_statement_v1(
      '00000000-0000-0000-0000-000000000f02',
      '82000000-0000-0000-0000-000000000f32',
      'FIX5','saas-coupon-wrong-target'
    );
    raise exception 'target-mismatched coupon unexpectedly applied';
  exception when others then
    if sqlerrm not like 'SAAS-COUPONS Organization target is not eligible%' then
      raise;
    end if;
  end;
end;
$target_isolation$;

select public.apply_saas_coupon_to_statement_v1(
  '00000000-0000-0000-0000-000000000f01',
  '82000000-0000-0000-0000-000000000f31',
  'FIX5','saas-coupon-apply-fix5'
);
select public.apply_saas_coupon_to_statement_v1(
  '00000000-0000-0000-0000-000000000f02',
  '82000000-0000-0000-0000-000000000f32',
  'PCT50','saas-coupon-apply-pct50'
);
select public.apply_saas_coupon_to_statement_v1(
  '00000000-0000-0000-0000-000000000f03',
  '82000000-0000-0000-0000-000000000f33',
  'FREESETUP','saas-coupon-apply-free-setup'
);
select public.apply_saas_coupon_to_statement_v1(
  '00000000-0000-0000-0000-000000000f04',
  '82000000-0000-0000-0000-000000000f34',
  'TRIAL1','saas-coupon-apply-trial1'
);

do $coupon_totals$
declare
  s public.saas_billing_statements%rowtype;
begin
  select * into s from public.saas_billing_statements
  where id='82000000-0000-0000-0000-000000000f31';
  if s.subtotal<>30 or s.discount_total<>5 or s.tax_total<>1.25 or s.total<>26.25 then
    raise exception 'FIXED coupon totals are incorrect: %',row_to_json(s);
  end if;

  select * into s from public.saas_billing_statements
  where id='82000000-0000-0000-0000-000000000f32';
  if s.subtotal<>30 or s.discount_total<>10 or s.tax_total<>1 or s.total<>21 then
    raise exception 'PERCENTAGE coupon totals are incorrect: %',row_to_json(s);
  end if;

  select * into s from public.saas_billing_statements
  where id='82000000-0000-0000-0000-000000000f33';
  if s.subtotal<>30 or s.discount_total<>10 or s.tax_total<>1 or s.total<>21 then
    raise exception 'FREE_SETUP coupon totals are incorrect: %',row_to_json(s);
  end if;

  select * into s from public.saas_billing_statements
  where id='82000000-0000-0000-0000-000000000f34';
  if s.subtotal<>30 or s.discount_total<>30 or s.tax_total<>0 or s.total<>0 then
    raise exception 'TRIAL coupon totals are incorrect: %',row_to_json(s);
  end if;
end;
$coupon_totals$;

do $coupon_evidence$
declare
  v_count integer;
  v_id uuid;
begin
  select count(*) into v_count
  from public.saas_coupon_redemptions;
  if v_count<>4 then
    raise exception 'expected 4 coupon redemptions, found %',v_count;
  end if;

  if exists(
    select 1
    from public.saas_coupon_redemptions r
    where r.evidence->>'paymentCollectionExecuted'<>'false'
  ) then
    raise exception 'coupon redemption claimed payment collection';
  end if;

  if not exists(
    select 1 from public.saas_billing_line_items
    where statement_id='82000000-0000-0000-0000-000000000f31'
      and component='DISCOUNT'
      and direction='CREDIT'
      and source_type='SAAS_COUPON_REDEMPTION'
      and amount=5
  ) then
    raise exception 'FIXED coupon discount line is missing';
  end if;

  v_id:=public.apply_saas_coupon_to_statement_v1(
    '00000000-0000-0000-0000-000000000f01',
    '82000000-0000-0000-0000-000000000f31',
    'FIX5','saas-coupon-apply-fix5'
  );

  if v_id is distinct from (
    select id from public.saas_coupon_redemptions
    where organization_id='00000000-0000-0000-0000-000000000f01'
      and request_key='saas-coupon-apply-fix5'
  ) then
    raise exception 'coupon redemption idempotency did not converge';
  end if;
end;
$coupon_evidence$;

select public.finalize_saas_billing_statement_v1(
  '00000000-0000-0000-0000-000000000f01',
  '82000000-0000-0000-0000-000000000f31',
  'saas-coupon-finalize-f01'
);

do $finalized_coupon_statement$
declare
  s public.saas_billing_statements%rowtype;
begin
  select * into s from public.saas_billing_statements
  where id='82000000-0000-0000-0000-000000000f31';

  if s.status<>'FINALIZED'
     or s.discount_total<>5
     or s.tax_total<>1.25
     or s.total<>26.25
  then
    raise exception 'coupon finalization totals are incorrect: %',row_to_json(s);
  end if;

  begin
    perform public.apply_saas_coupon_to_statement_v1(
      '00000000-0000-0000-0000-000000000f01',
      s.id,'FIX5','saas-coupon-apply-after-final'
    );
    raise exception 'coupon unexpectedly applied to FINALIZED statement';
  exception when others then
    if sqlerrm not like 'SAAS-COUPONS can apply only to DRAFT billing statement%' then
      raise;
    end if;
  end;
end;
$finalized_coupon_statement$;

select set_config('app.saas_coupon_mutation','allowed',true);
select set_config('app.saas_billing_mutation','allowed',true);

do $discount_authority_guard$
begin
  begin
    insert into public.saas_billing_line_items(
      organization_id,statement_id,line_no,component,direction,meter_key,
      quantity,included_quantity,billable_quantity,unit_price,amount,
      source_type,source_id,evidence
    ) values (
      '00000000-0000-0000-0000-000000000f02',
      '82000000-0000-0000-0000-000000000f32',
      99,'DISCOUNT','CREDIT','ROGUE.DISCOUNT',
      1,0,1,1,1,'MANUAL','rogue','{}'::jsonb
    );
    raise exception 'non-coupon DISCOUNT line unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'SAAS-COUPONS is the only DISCOUNT line authority%' then
      raise;
    end if;
  end;

  begin
    update public.saas_billing_line_items
    set amount=1
    where statement_id='82000000-0000-0000-0000-000000000f32'
      and component='DISCOUNT';
    raise exception 'coupon DISCOUNT line mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'SAAS-COUPONS discount line evidence is immutable%' then
      raise;
    end if;
  end;
end;
$discount_authority_guard$;

do $immutable_coupon_evidence$
begin
  begin
    update public.saas_coupon_redemptions
    set discount_amount=1
    where organization_id='00000000-0000-0000-0000-000000000f01';
    raise exception 'coupon redemption mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'SAAS-COUPONS redemption evidence is immutable%' then
      raise;
    end if;
  end;

  begin
    update public.saas_coupons
    set name='Mutated'
    where id='83000000-0000-0000-0000-000000000f41';
    raise exception 'ACTIVE coupon contract mutation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'SAAS-COUPONS active commercial contract is immutable except retirement%' then
      raise;
    end if;
  end;
end;
$immutable_coupon_evidence$;

select set_config('app.saas_billing_mutation','0',true);
select set_config('app.saas_coupon_mutation','0',true);

reset role;
set role authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000f101',false);
do $owner_coupon_read$
begin
  if not exists(
    select 1 from public.saas_coupon_redemptions
    where organization_id='00000000-0000-0000-0000-000000000f01'
  ) then
    raise exception 'OWNER cannot read own coupon redemption';
  end if;

  if not exists(
    select 1 from public.saas_coupons
    where id='83000000-0000-0000-0000-000000000f41'
  ) then
    raise exception 'OWNER cannot read redeemed coupon definition';
  end if;
end;
$owner_coupon_read$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000f102',false);
do $admin_coupon_read$
begin
  if not exists(
    select 1 from public.saas_coupon_redemptions
    where organization_id='00000000-0000-0000-0000-000000000f01'
  ) then
    raise exception 'ADMIN cannot read own coupon redemption';
  end if;
end;
$admin_coupon_read$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000f103',false);
do $sales_coupon_denied$
begin
  if exists(
    select 1 from public.saas_coupon_redemptions
    where organization_id='00000000-0000-0000-0000-000000000f01'
  ) then
    raise exception 'SALES_AGENT can read coupon redemption';
  end if;

  if exists(
    select 1 from public.saas_coupons
    where id='83000000-0000-0000-0000-000000000f41'
  ) then
    raise exception 'SALES_AGENT can read coupon definition';
  end if;
end;
$sales_coupon_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $coupon_privileges$
begin
  if has_function_privilege(
    'authenticated',
    'public.create_saas_coupon_v1(uuid,uuid,text,text,text,numeric,text,integer,integer,timestamptz,timestamptz,integer,integer,integer,jsonb,jsonb,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated browser can create platform coupon';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.activate_saas_coupon_v1(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated browser can activate platform coupon';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.apply_saas_coupon_to_statement_v1(uuid,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated browser can apply platform coupon';
  end if;

  if has_table_privilege('authenticated','public.saas_coupon_scopes','SELECT')
     or has_table_privilege('authenticated','public.saas_coupon_targets','SELECT')
  then
    raise exception 'authenticated browser can inspect internal coupon scopes/targets directly';
  end if;
end;
$coupon_privileges$;

do $coupon_audit_evidence$
begin
  if not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000f01'
      and action='SAAS_COUPON_CREATED'
      and entity_id='83000000-0000-0000-0000-000000000f41'
  ) or not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000f01'
      and action='SAAS_COUPON_ACTIVATED'
      and entity_id='83000000-0000-0000-0000-000000000f41'
  ) or not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-0000-0000-000000000f01'
      and action='SAAS_COUPON_REDEEMED'
  ) then
    raise exception 'SAAS-COUPONS audit evidence is incomplete';
  end if;
end;
$coupon_audit_evidence$;

rollback;
