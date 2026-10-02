-- 0177: INVOICE-ENGINE
-- Canonical immutable commercial Invoice/Credit Note evidence over ORDER-ENGINE.
-- PAYMENT-CORE remains the only future payment/refund transaction authority.

create table public.invoices (
  id uuid primary key,
  organization_id uuid not null,
  tenant_business_id uuid not null,
  branch_id uuid,
  order_id uuid not null,
  person_id uuid,
  buyer_business_id uuid,
  deal_id uuid,
  booking_id uuid,
  quote_id uuid,
  owner_user_id uuid not null,
  invoice_number text not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','ISSUED','OVERDUE','VOID')),
  country_code text not null,
  currency text not null,
  terms_snapshot text,
  due_date date not null,
  subtotal numeric(18,4) not null check (subtotal>=0),
  discount_total numeric(18,4) not null check (discount_total>=0),
  tax_total numeric(18,4) not null check (tax_total>=0),
  total numeric(18,4) not null check (total>=0),
  paid_total numeric(18,4) not null default 0 check (paid_total>=0),
  credited_total numeric(18,4) not null default 0 check (credited_total>=0),
  balance_due numeric(18,4) generated always as (
    greatest(total-paid_total-credited_total,0::numeric)
  ) stored,
  settlement_status text generated always as (
    case
      when total-paid_total-credited_total<=0 then 'SETTLED'
      when paid_total>0 or credited_total>0 then 'PARTIAL'
      else 'OPEN'
    end
  ) stored,
  seller_snapshot jsonb not null,
  buyer_snapshot jsonb not null,
  source_evidence jsonb not null,
  document_snapshot jsonb,
  version integer not null default 1 check (version>=1),
  issued_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  void_evidence jsonb,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,invoice_number),
  unique (organization_id,order_id),
  foreign key (organization_id) references public.organizations(id) on delete cascade,
  foreign key (organization_id,tenant_business_id)
    references public.tenant_businesses(organization_id,id) on delete restrict,
  foreign key (organization_id,branch_id)
    references public.branches(organization_id,id) on delete restrict,
  foreign key (organization_id,order_id)
    references public.orders(organization_id,id) on delete restrict,
  foreign key (organization_id,person_id)
    references public.crm_people(organization_id,id) on delete restrict,
  foreign key (organization_id,buyer_business_id)
    references public.businesses(organization_id,id) on delete restrict,
  foreign key (organization_id,deal_id)
    references public.crm_deals(organization_id,id) on delete restrict,
  foreign key (organization_id,booking_id)
    references public.bookings(organization_id,id) on delete restrict,
  foreign key (organization_id,quote_id)
    references public.quotes(organization_id,id) on delete restrict,
  foreign key (organization_id,owner_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (invoice_number ~ '^I-[A-Z0-9]{16}$'),
  check (country_code=upper(btrim(country_code)) and country_code ~ '^[A-Z]{2}$'),
  check (currency=upper(btrim(currency)) and currency ~ '^[A-Z]{3}$'),
  check (person_id is not null or buyer_business_id is not null),
  check (terms_snapshot is null or length(btrim(terms_snapshot)) between 1 and 12000),
  check (jsonb_typeof(seller_snapshot)='object' and seller_snapshot<>'{}'::jsonb and octet_length(seller_snapshot::text)<=16384),
  check (jsonb_typeof(buyer_snapshot)='object' and buyer_snapshot<>'{}'::jsonb and octet_length(buyer_snapshot::text)<=16384),
  check (jsonb_typeof(source_evidence)='object' and source_evidence<>'{}'::jsonb and octet_length(source_evidence::text)<=32768),
  check (document_snapshot is null or (jsonb_typeof(document_snapshot)='object' and document_snapshot<>'{}'::jsonb and octet_length(document_snapshot::text)<=262144)),
  check (void_evidence is null or (jsonb_typeof(void_evidence)='object' and void_evidence<>'{}'::jsonb and octet_length(void_evidence::text)<=16384)),
  check (discount_total<=subtotal),
  check (total=subtotal-discount_total+tax_total),
  check (paid_total+credited_total<=total),
  check ((status='DRAFT' and issued_at is null) or status<>'DRAFT'),
  check ((status in ('ISSUED','OVERDUE') and issued_at is not null and document_snapshot is not null) or status not in ('ISSUED','OVERDUE')),
  check ((status='VOID' and voided_at is not null and void_reason is not null and void_evidence is not null) or status<>'VOID'),
  check (void_reason is null or length(btrim(void_reason)) between 3 and 1000)
);
comment on table public.invoices is
  'Canonical INVOICE-ENGINE aggregate. Payment/refund transaction truth remains owned by PAYMENT-CORE.';

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  order_id uuid not null,
  order_line_item_id uuid not null,
  line_no integer not null check (line_no between 1 and 500),
  subject_kind text not null check (subject_kind in ('SERVICE','PRODUCT','VARIANT')),
  service_id text,
  product_id uuid,
  variant_id uuid,
  service_price_id uuid,
  product_price_id uuid,
  name_snapshot text not null,
  sku_snapshot text,
  description text,
  quantity numeric(18,4) not null check (quantity>0 and quantity<=1000000),
  unit_price numeric(18,4) not null check (unit_price>=0),
  discount_bps integer not null default 0 check (discount_bps between 0 and 10000),
  discount_amount numeric(18,4) not null check (discount_amount>=0),
  tax_bps integer not null default 0 check (tax_bps between 0 and 10000),
  tax_amount numeric(18,4) not null check (tax_amount>=0),
  line_subtotal numeric(18,4) not null check (line_subtotal>=0),
  line_total numeric(18,4) not null check (line_total>=0),
  created_at timestamptz not null default now(),
  unique (organization_id,id,invoice_id),
  unique (organization_id,invoice_id,line_no),
  unique (organization_id,order_line_item_id,invoice_id),
  foreign key (organization_id,invoice_id)
    references public.invoices(organization_id,id) on delete restrict,
  foreign key (organization_id,order_line_item_id,order_id)
    references public.order_line_items(organization_id,id,order_id) on delete restrict,
  foreign key (organization_id,service_id)
    references public.services(organization_id,id) on delete restrict,
  foreign key (organization_id,product_id)
    references public.catalog_products(organization_id,id) on delete restrict,
  foreign key (organization_id,variant_id)
    references public.catalog_product_variants(organization_id,id) on delete restrict,
  foreign key (organization_id,service_price_id)
    references public.service_prices(organization_id,id) on delete restrict,
  foreign key (organization_id,product_price_id)
    references public.catalog_product_prices(organization_id,id) on delete restrict,
  check (length(btrim(name_snapshot)) between 1 and 240),
  check (sku_snapshot is null or length(btrim(sku_snapshot)) between 1 and 80),
  check (description is null or length(btrim(description)) between 1 and 2000),
  check (
    (subject_kind='SERVICE'
      and service_id is not null and service_price_id is not null
      and product_id is null and variant_id is null and product_price_id is null)
    or
    (subject_kind='PRODUCT'
      and service_id is null and service_price_id is null
      and product_id is not null and variant_id is null and product_price_id is not null)
    or
    (subject_kind='VARIANT'
      and service_id is null and service_price_id is null
      and product_id is not null and variant_id is not null and product_price_id is not null)
  ),
  check (discount_amount<=line_subtotal),
  check (line_total=line_subtotal-discount_amount+tax_amount)
);
comment on table public.invoice_line_items is
  'Immutable invoice line snapshots copied from canonical ORDER-ENGINE evidence.';

create table public.invoice_credit_notes (
  id uuid primary key,
  organization_id uuid not null,
  invoice_id uuid not null,
  credit_note_number text not null,
  status text not null default 'ISSUED' check (status='ISSUED'),
  reason text not null,
  subtotal numeric(18,4) not null check (subtotal>=0),
  discount_total numeric(18,4) not null check (discount_total>=0),
  tax_total numeric(18,4) not null check (tax_total>=0),
  total numeric(18,4) not null check (total>0),
  seller_snapshot jsonb not null,
  buyer_snapshot jsonb not null,
  evidence jsonb not null,
  document_snapshot jsonb not null,
  issued_by_user_id uuid not null,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id,id,invoice_id),
  unique (organization_id,credit_note_number),
  foreign key (organization_id,invoice_id)
    references public.invoices(organization_id,id) on delete restrict,
  foreign key (organization_id,issued_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (credit_note_number ~ '^CN-[A-Z0-9]{16}$'),
  check (length(btrim(reason)) between 3 and 2000),
  check (jsonb_typeof(seller_snapshot)='object' and seller_snapshot<>'{}'::jsonb and octet_length(seller_snapshot::text)<=16384),
  check (jsonb_typeof(buyer_snapshot)='object' and buyer_snapshot<>'{}'::jsonb and octet_length(buyer_snapshot::text)<=16384),
  check (jsonb_typeof(evidence)='object' and evidence<>'{}'::jsonb and octet_length(evidence::text)<=16384),
  check (jsonb_typeof(document_snapshot)='object' and document_snapshot<>'{}'::jsonb and octet_length(document_snapshot::text)<=262144),
  check (discount_total<=subtotal),
  check (total=subtotal-discount_total+tax_total)
);
comment on table public.invoice_credit_notes is
  'Immutable commercial credit-note evidence. It reduces Invoice balance but never executes a money refund.';

create table public.invoice_credit_note_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  credit_note_id uuid not null,
  invoice_line_item_id uuid not null,
  line_no integer not null check (line_no between 1 and 500),
  credited_quantity numeric(18,4) not null check (credited_quantity>0),
  name_snapshot text not null,
  sku_snapshot text,
  unit_price numeric(18,4) not null check (unit_price>=0),
  discount_bps integer not null check (discount_bps between 0 and 10000),
  tax_bps integer not null check (tax_bps between 0 and 10000),
  line_subtotal numeric(18,4) not null check (line_subtotal>=0),
  discount_amount numeric(18,4) not null check (discount_amount>=0),
  tax_amount numeric(18,4) not null check (tax_amount>=0),
  line_total numeric(18,4) not null check (line_total>0),
  created_at timestamptz not null default now(),
  unique (organization_id,id,credit_note_id),
  unique (organization_id,credit_note_id,line_no),
  foreign key (organization_id,credit_note_id,invoice_id)
    references public.invoice_credit_notes(organization_id,id,invoice_id) on delete restrict,
  foreign key (organization_id,invoice_line_item_id,invoice_id)
    references public.invoice_line_items(organization_id,id,invoice_id) on delete restrict,
  check (length(btrim(name_snapshot)) between 1 and 240),
  check (sku_snapshot is null or length(btrim(sku_snapshot)) between 1 and 80),
  check (discount_amount<=line_subtotal),
  check (line_total=line_subtotal-discount_amount+tax_amount)
);
comment on table public.invoice_credit_note_line_items is
  'Immutable quantity/amount credit evidence tied to one immutable Invoice line.';

create table public.invoice_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  credit_note_id uuid,
  event_type text not null check (event_type in ('CREATED','ISSUED','OVERDUE','VOIDED','CREDIT_NOTE_ISSUED')),
  from_status text,
  to_status text,
  actor_type text not null check (actor_type in ('USER','SYSTEM')),
  actor_user_id uuid,
  request_key text not null,
  request_hash text not null,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (organization_id,request_key),
  foreign key (organization_id,invoice_id)
    references public.invoices(organization_id,id) on delete restrict,
  foreign key (organization_id,credit_note_id,invoice_id)
    references public.invoice_credit_notes(organization_id,id,invoice_id) on delete restrict,
  foreign key (organization_id,actor_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (length(btrim(request_key)) between 8 and 240),
  check (length(request_hash)=32),
  check (jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=32768),
  check ((actor_type='USER' and actor_user_id is not null) or actor_type='SYSTEM')
);
comment on table public.invoice_lifecycle_events is
  'Immutable INVOICE-ENGINE lifecycle/credit evidence and Automation event source.';

create index invoices_business_idx on public.invoices(organization_id,tenant_business_id);
create index invoices_branch_idx on public.invoices(organization_id,branch_id) where branch_id is not null;
create index invoices_person_idx on public.invoices(organization_id,person_id) where person_id is not null;
create index invoices_buyer_idx on public.invoices(organization_id,buyer_business_id) where buyer_business_id is not null;
create index invoices_deal_idx on public.invoices(organization_id,deal_id) where deal_id is not null;
create index invoices_booking_idx on public.invoices(organization_id,booking_id) where booking_id is not null;
create index invoices_quote_idx on public.invoices(organization_id,quote_id) where quote_id is not null;
create index invoices_owner_idx on public.invoices(organization_id,owner_user_id);
create index invoices_creator_idx on public.invoices(organization_id,created_by_user_id);
create index invoices_updater_idx on public.invoices(organization_id,updated_by_user_id);
create index invoices_due_idx on public.invoices(organization_id,status,due_date,id)
  where status='ISSUED';
create index invoice_lines_order_line_fk_idx
  on public.invoice_line_items(organization_id,order_line_item_id,order_id);
create index invoice_lines_service_idx on public.invoice_line_items(organization_id,service_id) where service_id is not null;
create index invoice_lines_product_idx on public.invoice_line_items(organization_id,product_id) where product_id is not null;
create index invoice_lines_variant_idx on public.invoice_line_items(organization_id,variant_id) where variant_id is not null;
create index invoice_lines_service_price_idx on public.invoice_line_items(organization_id,service_price_id) where service_price_id is not null;
create index invoice_lines_product_price_idx on public.invoice_line_items(organization_id,product_price_id) where product_price_id is not null;
create index invoice_credit_notes_invoice_idx on public.invoice_credit_notes(organization_id,invoice_id,issued_at desc,id);
create index invoice_credit_notes_issuer_idx on public.invoice_credit_notes(organization_id,issued_by_user_id);
create index invoice_credit_lines_note_invoice_fk_idx
  on public.invoice_credit_note_line_items(organization_id,credit_note_id,invoice_id);
create index invoice_credit_lines_invoice_line_fk_idx
  on public.invoice_credit_note_line_items(organization_id,invoice_line_item_id,invoice_id);
create index invoice_events_invoice_idx on public.invoice_lifecycle_events(organization_id,invoice_id,occurred_at,id);
create index invoice_events_credit_note_fk_idx
  on public.invoice_lifecycle_events(organization_id,credit_note_id,invoice_id) where credit_note_id is not null;
create index invoice_events_actor_idx on public.invoice_lifecycle_events(organization_id,actor_user_id) where actor_user_id is not null;

alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.invoice_credit_notes enable row level security;
alter table public.invoice_credit_note_line_items enable row level security;
alter table public.invoice_lifecycle_events enable row level security;

create policy invoices_member_read on public.invoices for select to authenticated
  using (public.is_org_member(organization_id));
create policy invoice_lines_member_read on public.invoice_line_items for select to authenticated
  using (public.is_org_member(organization_id));
create policy invoice_credit_notes_member_read on public.invoice_credit_notes for select to authenticated
  using (public.is_org_member(organization_id));
create policy invoice_credit_lines_member_read on public.invoice_credit_note_line_items for select to authenticated
  using (public.is_org_member(organization_id));
create policy invoice_events_member_read on public.invoice_lifecycle_events for select to authenticated
  using (public.is_org_member(organization_id));

revoke all on table
  public.invoices,public.invoice_line_items,public.invoice_credit_notes,
  public.invoice_credit_note_line_items,public.invoice_lifecycle_events
from public,anon,authenticated,service_role;

grant select on table
  public.invoices,public.invoice_line_items,public.invoice_credit_notes,
  public.invoice_credit_note_line_items,public.invoice_lifecycle_events
to authenticated;

grant select,insert,update on table public.invoices to service_role;
grant select,insert on table
  public.invoice_line_items,public.invoice_credit_notes,
  public.invoice_credit_note_line_items,public.invoice_lifecycle_events
to service_role;

create or replace function public.guard_invoice_engine_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if coalesce(current_setting('app.invoice_engine_mutation',true),'')<>'allowed' then
    raise exception 'INVOICE-ENGINE state requires governed command';
  end if;

  if tg_table_name in ('invoice_line_items','invoice_credit_notes','invoice_credit_note_line_items','invoice_lifecycle_events')
     and tg_op<>'INSERT'
  then
    raise exception 'INVOICE-ENGINE immutable commercial evidence cannot be changed';
  end if;

  if tg_table_name='invoices' then
    if tg_op='DELETE' then
      raise exception 'INVOICE-ENGINE Invoice cannot be deleted';
    end if;
    if tg_op='UPDATE' then
      if row(
        new.organization_id,new.tenant_business_id,new.branch_id,new.order_id,new.person_id,
        new.buyer_business_id,new.deal_id,new.booking_id,new.quote_id,new.owner_user_id,
        new.invoice_number,new.country_code,new.currency,new.terms_snapshot,new.due_date,
        new.subtotal,new.discount_total,new.tax_total,new.total,new.seller_snapshot,
        new.buyer_snapshot,new.source_evidence,new.created_by_user_id,new.created_at
      ) is distinct from row(
        old.organization_id,old.tenant_business_id,old.branch_id,old.order_id,old.person_id,
        old.buyer_business_id,old.deal_id,old.booking_id,old.quote_id,old.owner_user_id,
        old.invoice_number,old.country_code,old.currency,old.terms_snapshot,old.due_date,
        old.subtotal,old.discount_total,old.tax_total,old.total,old.seller_snapshot,
        old.buyer_snapshot,old.source_evidence,old.created_by_user_id,old.created_at
      ) then
        raise exception 'INVOICE-ENGINE immutable commercial source cannot be rewritten';
      end if;
      if old.document_snapshot is not null and new.document_snapshot is distinct from old.document_snapshot then
        raise exception 'INVOICE-ENGINE issued document snapshot is immutable';
      end if;
      if new.paid_total is distinct from old.paid_total then
        raise exception 'INVOICE-ENGINE paid balance is frozen until PAYMENT-CORE owns governed settlement projection';
      end if;
      if new.credited_total<old.credited_total then
        raise exception 'INVOICE-ENGINE credited balance evidence cannot decrease';
      end if;
    end if;
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger invoices_guard before insert or update or delete on public.invoices
for each row execute function public.guard_invoice_engine_mutation();
create trigger invoice_lines_guard before insert or update or delete on public.invoice_line_items
for each row execute function public.guard_invoice_engine_mutation();
create trigger invoice_credit_notes_guard before insert or update or delete on public.invoice_credit_notes
for each row execute function public.guard_invoice_engine_mutation();
create trigger invoice_credit_lines_guard before insert or update or delete on public.invoice_credit_note_line_items
for each row execute function public.guard_invoice_engine_mutation();
create trigger invoice_events_guard before insert or update or delete on public.invoice_lifecycle_events
for each row execute function public.guard_invoice_engine_mutation();

create unique index invoice_engine_audit_request_uidx
  on public.audit_logs(organization_id,action,entity_type,entity_id,correlation_id)
  where action like 'INVOICE_ENGINE_%' and correlation_id is not null;

create unique index invoice_automation_projection_uidx
  on public.audit_logs(organization_id,action,correlation_id)
  where action='INVOICE_AUTOMATION_EVENT_PROJECTED' and correlation_id is not null;

create or replace function private.invoice_engine_actor_role(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns text
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  select m.role
  from public.organization_members m
  where m.organization_id=p_organization_id and m.user_id=p_actor_user_id
  limit 1
$$;

create or replace function private.invoice_engine_assert_manage(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_owner_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare v_role text;
begin
  if p_organization_id is null or p_actor_user_id is null or p_owner_user_id is null then
    raise exception 'INVOICE-ENGINE Organization, actor and owner are required';
  end if;
  v_role:=private.invoice_engine_actor_role(p_organization_id,p_actor_user_id);
  if v_role not in ('OWNER','ADMIN','SALES_MANAGER')
     and not (v_role='SALES_AGENT' and p_owner_user_id=p_actor_user_id)
  then
    raise exception 'INVOICE-ENGINE mutation is not permitted for actor';
  end if;
end;
$$;

create or replace function private.invoice_engine_assert_manager(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare v_role text;
begin
  v_role:=private.invoice_engine_actor_role(p_organization_id,p_actor_user_id);
  if v_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'INVOICE-ENGINE manager permission is required';
  end if;
end;
$$;

create or replace function private.invoice_engine_is_replay(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_request_key text,
  p_request_hash text
)
returns boolean
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare v_hash text;
begin
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'INVOICE-ENGINE request key is invalid';
  end if;
  select a.after_data->>'requestHash' into v_hash
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action=p_action
    and a.entity_type=p_entity_type
    and a.entity_id=p_entity_id
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc
  limit 1;
  if v_hash is null then return false; end if;
  if v_hash<>p_request_hash then raise exception 'INVOICE-ENGINE request key conflict'; end if;
  return true;
end;
$$;

create or replace function private.invoice_engine_event(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_credit_note_id uuid,
  p_event_type text,
  p_from_status text,
  p_to_status text,
  p_actor_type text,
  p_actor_user_id uuid,
  p_request_key text,
  p_request_hash text,
  p_evidence jsonb
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare v_id uuid; v_hash text;
begin
  insert into public.invoice_lifecycle_events(
    organization_id,invoice_id,credit_note_id,event_type,from_status,to_status,
    actor_type,actor_user_id,request_key,request_hash,evidence
  ) values (
    p_organization_id,p_invoice_id,p_credit_note_id,p_event_type,p_from_status,p_to_status,
    p_actor_type,p_actor_user_id,p_request_key,p_request_hash,coalesce(p_evidence,'{}'::jsonb)
  )
  on conflict (organization_id,request_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id,request_hash into v_id,v_hash
    from public.invoice_lifecycle_events
    where organization_id=p_organization_id and request_key=p_request_key;
    if v_hash is distinct from p_request_hash then
      raise exception 'INVOICE-ENGINE lifecycle request key conflict';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.create_invoice_from_order_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_invoice_id uuid,
  p_order_id uuid,
  p_due_date date,
  p_request_key text
)
returns uuid
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  o public.orders%rowtype;
  v_number text;
  v_hash text;
  v_now timestamptz:=statement_timestamp();
  v_event uuid;
  v_existing uuid;
begin
  if p_invoice_id is null or p_order_id is null or p_due_date is null then
    raise exception 'INVOICE-ENGINE Invoice, Order and due date are required';
  end if;
  v_hash:=md5(jsonb_build_object('invoiceId',p_invoice_id,'orderId',p_order_id,'dueDate',p_due_date)::text);

  if private.invoice_engine_is_replay(
    p_organization_id,'INVOICE_ENGINE_CREATED','invoice',p_invoice_id::text,p_request_key,v_hash
  ) then return p_invoice_id; end if;

  select * into o
  from public.orders
  where organization_id=p_organization_id and id=p_order_id
  for update;
  if not found then raise exception 'INVOICE-ENGINE Order not found'; end if;

  perform private.invoice_engine_assert_manage(p_organization_id,p_actor_user_id,o.owner_user_id);

  if o.status='CANCELLED' then
    raise exception 'INVOICE-ENGINE cancelled Order cannot be invoiced';
  end if;

  select id into v_existing
  from public.invoices
  where organization_id=p_organization_id and order_id=p_order_id;
  if v_existing is not null then
    -- One canonical Invoice per Order. Repeated create requests converge on the
    -- existing aggregate instead of manufacturing a parallel commercial document.
    return v_existing;
  end if;

  v_number:='I-'||upper(right(replace(p_invoice_id::text,'-',''),16));

  perform set_config('app.invoice_engine_mutation','allowed',true);

  insert into public.invoices(
    id,organization_id,tenant_business_id,branch_id,order_id,person_id,buyer_business_id,
    deal_id,booking_id,quote_id,owner_user_id,invoice_number,status,country_code,currency,
    terms_snapshot,due_date,subtotal,discount_total,tax_total,total,paid_total,credited_total,
    seller_snapshot,buyer_snapshot,source_evidence,version,created_by_user_id,updated_by_user_id,
    created_at,updated_at
  ) values (
    p_invoice_id,p_organization_id,o.tenant_business_id,o.branch_id,o.id,o.person_id,o.buyer_business_id,
    o.deal_id,o.booking_id,o.quote_id,o.owner_user_id,v_number,'DRAFT',o.country_code,o.currency,
    o.terms_snapshot,p_due_date,o.subtotal,o.discount_total,o.tax_total,o.total,0,0,
    o.seller_snapshot,o.buyer_snapshot,
    jsonb_build_object(
      'source','ORDER','orderId',o.id,'orderNumber',o.order_number,'orderStatus',o.status,
      'orderVersion',o.version,'confirmedAt',o.confirmed_at
    ),
    1,p_actor_user_id,p_actor_user_id,v_now,v_now
  );

  insert into public.invoice_line_items(
    organization_id,invoice_id,order_id,order_line_item_id,line_no,subject_kind,
    service_id,product_id,variant_id,service_price_id,product_price_id,
    name_snapshot,sku_snapshot,description,quantity,unit_price,discount_bps,
    discount_amount,tax_bps,tax_amount,line_subtotal,line_total,created_at
  )
  select
    ol.organization_id,p_invoice_id,ol.order_id,ol.id,ol.line_no,ol.subject_kind,
    ol.service_id,ol.product_id,ol.variant_id,ol.service_price_id,ol.product_price_id,
    ol.name_snapshot,ol.sku_snapshot,ol.description,ol.quantity,ol.unit_price,ol.discount_bps,
    ol.discount_amount,ol.tax_bps,ol.tax_amount,ol.line_subtotal,ol.line_total,v_now
  from public.order_line_items ol
  where ol.organization_id=p_organization_id and ol.order_id=p_order_id
  order by ol.line_no;

  if not found then raise exception 'INVOICE-ENGINE source Order has no line items'; end if;

  v_event:=private.invoice_engine_event(
    p_organization_id,p_invoice_id,null,'CREATED',null,'DRAFT','USER',p_actor_user_id,
    'ie:'||md5(p_request_key||':created'),v_hash,
    jsonb_build_object('orderId',o.id,'orderNumber',o.order_number,'invoiceNumber',v_number)
  );

  perform set_config('app.invoice_engine_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,
    correlation_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'INVOICE_ENGINE_CREATED','invoice',p_invoice_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'invoiceNumber',v_number,'orderId',o.id,'lifecycleEventId',v_event,
      'paymentTruthCreated',false,'refundTruthCreated',false
    ),
    p_request_key,o.tenant_business_id,o.branch_id
  );
  return p_invoice_id;
exception when others then
  perform set_config('app.invoice_engine_mutation','0',true);
  raise;
end;
$$;

create or replace function public.issue_invoice_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_invoice_id uuid,
  p_expected_version integer,
  p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  i public.invoices%rowtype;
  v_hash text;
  v_now timestamptz:=statement_timestamp();
  v_lines jsonb;
  v_tax jsonb;
  v_document jsonb;
  v_event uuid;
  v_order_number text;
  v_order_status text;
  v_status text;
begin
  select * into i from public.invoices
  where organization_id=p_organization_id and id=p_invoice_id
  for update;
  if not found then raise exception 'INVOICE-ENGINE Invoice not found'; end if;

  perform private.invoice_engine_assert_manage(p_organization_id,p_actor_user_id,i.owner_user_id);
  v_hash:=md5(jsonb_build_object('invoiceId',p_invoice_id,'expectedVersion',p_expected_version)::text);

  if private.invoice_engine_is_replay(
    p_organization_id,'INVOICE_ENGINE_ISSUED','invoice',p_invoice_id::text,p_request_key,v_hash
  ) then
    select status into v_status
    from public.invoices
    where organization_id=p_organization_id and id=p_invoice_id;
    return v_status;
  end if;

  if p_expected_version is null or p_expected_version<>i.version then
    raise exception 'INVOICE-ENGINE Invoice version changed';
  end if;
  if i.status<>'DRAFT' then raise exception 'INVOICE-ENGINE only Draft Invoice can be issued'; end if;

  select o.order_number,o.status into v_order_number,v_order_status
  from public.orders o
  where o.organization_id=p_organization_id and o.id=i.order_id;

  if v_order_status='CANCELLED' then
    raise exception 'INVOICE-ENGINE cancelled source Order cannot be issued';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'lineNo',l.line_no,'invoiceLineItemId',l.id,'orderLineItemId',l.order_line_item_id,
    'subjectKind',l.subject_kind,'name',l.name_snapshot,'sku',l.sku_snapshot,
    'description',l.description,'quantity',l.quantity,'unitPrice',l.unit_price,
    'discountBps',l.discount_bps,'discountAmount',l.discount_amount,
    'taxBps',l.tax_bps,'taxAmount',l.tax_amount,'lineSubtotal',l.line_subtotal,'lineTotal',l.line_total
  ) order by l.line_no),'[]'::jsonb)
  into v_lines
  from public.invoice_line_items l
  where l.organization_id=p_organization_id and l.invoice_id=p_invoice_id;

  if jsonb_array_length(v_lines)=0 then raise exception 'INVOICE-ENGINE Invoice has no line items'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'taxBps',x.tax_bps,'taxableAmount',x.taxable_amount,'taxAmount',x.tax_amount,'grossAmount',x.gross_amount
  ) order by x.tax_bps),'[]'::jsonb)
  into v_tax
  from (
    select tax_bps,
      round(sum(line_subtotal-discount_amount),4) as taxable_amount,
      round(sum(tax_amount),4) as tax_amount,
      round(sum(line_total),4) as gross_amount
    from public.invoice_line_items
    where organization_id=p_organization_id and invoice_id=p_invoice_id
    group by tax_bps
  ) x;

  v_document:=jsonb_build_object(
    'documentType','INVOICE','invoiceId',i.id,'invoiceNumber',i.invoice_number,
    'orderId',i.order_id,'orderNumber',v_order_number,
    'issuedAt',v_now,'dueDate',i.due_date,'countryCode',i.country_code,'currency',i.currency,
    'seller',i.seller_snapshot,'buyer',i.buyer_snapshot,'terms',i.terms_snapshot,
    'subtotal',i.subtotal,'discountTotal',i.discount_total,'taxTotal',i.tax_total,'total',i.total,
    'taxBreakdown',v_tax,'lines',v_lines,
    'paymentExecutionAvailable',false,'refundExecutionAvailable',false
  );

  perform set_config('app.invoice_engine_mutation','allowed',true);

  update public.invoices
  set status='ISSUED',document_snapshot=v_document,issued_at=v_now,
      version=version+1,updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and id=p_invoice_id;

  v_event:=private.invoice_engine_event(
    p_organization_id,p_invoice_id,null,'ISSUED','DRAFT','ISSUED','USER',p_actor_user_id,
    'ie:'||md5(p_request_key||':issued'),v_hash,
    jsonb_build_object('invoiceNumber',i.invoice_number,'dueDate',i.due_date,'total',i.total,'currency',i.currency)
  );

  perform set_config('app.invoice_engine_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,
    correlation_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'INVOICE_ENGINE_ISSUED','invoice',p_invoice_id::text,
    jsonb_build_object('requestHash',v_hash,'lifecycleEventId',v_event,'documentSnapshotPersisted',true),
    p_request_key,i.tenant_business_id,i.branch_id
  );
  return 'ISSUED';
exception when others then
  perform set_config('app.invoice_engine_mutation','0',true);
  raise;
end;
$$;

create or replace function public.void_invoice_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_invoice_id uuid,
  p_expected_version integer,
  p_reason text,
  p_evidence jsonb,
  p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  i public.invoices%rowtype;
  v_hash text;
  v_now timestamptz:=statement_timestamp();
  v_event uuid;
begin
  if length(btrim(coalesce(p_reason,''))) not between 3 and 1000
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb
  then raise exception 'INVOICE-ENGINE void reason/evidence is required'; end if;

  select * into i from public.invoices
  where organization_id=p_organization_id and id=p_invoice_id
  for update;
  if not found then raise exception 'INVOICE-ENGINE Invoice not found'; end if;

  perform private.invoice_engine_assert_manager(p_organization_id,p_actor_user_id);
  v_hash:=md5(jsonb_build_object(
    'invoiceId',p_invoice_id,'expectedVersion',p_expected_version,
    'reason',btrim(p_reason),'evidence',p_evidence
  )::text);

  if private.invoice_engine_is_replay(
    p_organization_id,'INVOICE_ENGINE_VOIDED','invoice',p_invoice_id::text,p_request_key,v_hash
  ) then return 'VOID'; end if;

  if p_expected_version is null or p_expected_version<>i.version then
    raise exception 'INVOICE-ENGINE Invoice version changed';
  end if;
  if i.status not in ('DRAFT','ISSUED','OVERDUE') then
    raise exception 'INVOICE-ENGINE Invoice cannot be voided from current state';
  end if;
  if i.paid_total<>0 or i.credited_total<>0 then
    raise exception 'INVOICE-ENGINE settled/credited Invoice cannot be voided';
  end if;

  perform set_config('app.invoice_engine_mutation','allowed',true);
  update public.invoices
  set status='VOID',voided_at=v_now,void_reason=btrim(p_reason),void_evidence=p_evidence,
      version=version+1,updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and id=p_invoice_id;

  v_event:=private.invoice_engine_event(
    p_organization_id,p_invoice_id,null,'VOIDED',i.status,'VOID','USER',p_actor_user_id,
    'ie:'||md5(p_request_key||':voided'),v_hash,
    jsonb_build_object('reason',btrim(p_reason),'evidence',p_evidence)
  );
  perform set_config('app.invoice_engine_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,
    correlation_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'INVOICE_ENGINE_VOIDED','invoice',p_invoice_id::text,
    jsonb_build_object('requestHash',v_hash,'lifecycleEventId',v_event,'reason',btrim(p_reason)),
    p_request_key,i.tenant_business_id,i.branch_id
  );
  return 'VOID';
exception when others then
  perform set_config('app.invoice_engine_mutation','0',true);
  raise;
end;
$$;

create or replace function public.issue_invoice_credit_note_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_credit_note_id uuid,
  p_invoice_id uuid,
  p_reason text,
  p_lines jsonb,
  p_evidence jsonb,
  p_request_key text
)
returns uuid
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  i public.invoices%rowtype;
  l public.invoice_line_items%rowtype;
  x jsonb;
  v_hash text;
  v_now timestamptz:=statement_timestamp();
  v_number text;
  v_qty numeric(18,4);
  v_prev_qty numeric(18,4);
  v_prev_subtotal numeric(18,4);
  v_prev_discount numeric(18,4);
  v_prev_tax numeric(18,4);
  v_prev_total numeric(18,4);
  v_remaining_qty numeric(18,4);
  v_sub numeric(18,4);
  v_discount numeric(18,4);
  v_tax numeric(18,4);
  v_total numeric(18,4);
  v_subtotal_total numeric(18,4):=0;
  v_discount_total numeric(18,4):=0;
  v_tax_total numeric(18,4):=0;
  v_credit_total numeric(18,4):=0;
  v_resolved jsonb:='[]'::jsonb;
  v_line_no integer:=0;
  v_document jsonb;
  v_event uuid;
begin
  if p_credit_note_id is null or p_invoice_id is null then
    raise exception 'INVOICE-ENGINE Credit Note and Invoice are required';
  end if;
  if length(btrim(coalesce(p_reason,''))) not between 3 and 2000
     or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 500
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb
  then raise exception 'INVOICE-ENGINE Credit Note reason, lines and evidence are required'; end if;

  if (
    select count(*)<>count(distinct value->>'invoiceLineItemId')
    from jsonb_array_elements(p_lines)
  ) then raise exception 'INVOICE-ENGINE Credit Note line IDs must be unique'; end if;

  select * into i from public.invoices
  where organization_id=p_organization_id and id=p_invoice_id
  for update;
  if not found then raise exception 'INVOICE-ENGINE Invoice not found'; end if;

  perform private.invoice_engine_assert_manager(p_organization_id,p_actor_user_id);

  v_hash:=md5(jsonb_build_object(
    'creditNoteId',p_credit_note_id,'invoiceId',p_invoice_id,'reason',btrim(p_reason),
    'lines',p_lines,'evidence',p_evidence
  )::text);

  if private.invoice_engine_is_replay(
    p_organization_id,'INVOICE_ENGINE_CREDIT_NOTE_ISSUED','invoice_credit_note',
    p_credit_note_id::text,p_request_key,v_hash
  ) then return p_credit_note_id; end if;

  if i.status not in ('ISSUED','OVERDUE') then
    raise exception 'INVOICE-ENGINE Credit Note requires issued/non-void Invoice';
  end if;

  for x in select value from jsonb_array_elements(p_lines)
  loop
    if coalesce(x->>'invoiceLineItemId','')='' then
      raise exception 'INVOICE-ENGINE Credit Note line reference is required';
    end if;
    begin
      v_qty:=(x->>'quantity')::numeric;
    exception when others then
      raise exception 'INVOICE-ENGINE Credit Note quantity is invalid';
    end;
    if v_qty<=0 then raise exception 'INVOICE-ENGINE Credit Note quantity must be positive'; end if;

    select * into l
    from public.invoice_line_items
    where organization_id=p_organization_id and invoice_id=p_invoice_id
      and id=(x->>'invoiceLineItemId')::uuid;
    if not found then raise exception 'INVOICE-ENGINE Credit Note line does not belong to Invoice'; end if;

    select
      coalesce(sum(cl.credited_quantity),0),
      coalesce(sum(cl.line_subtotal),0),
      coalesce(sum(cl.discount_amount),0),
      coalesce(sum(cl.tax_amount),0),
      coalesce(sum(cl.line_total),0)
    into v_prev_qty,v_prev_subtotal,v_prev_discount,v_prev_tax,v_prev_total
    from public.invoice_credit_note_line_items cl
    join public.invoice_credit_notes cn
      on cn.organization_id=cl.organization_id and cn.id=cl.credit_note_id
    where cl.organization_id=p_organization_id
      and cl.invoice_id=p_invoice_id and cl.invoice_line_item_id=l.id
      and cn.status='ISSUED';

    v_remaining_qty:=l.quantity-v_prev_qty;
    if v_qty>v_remaining_qty then
      raise exception 'INVOICE-ENGINE Credit Note quantity exceeds remaining Invoice line quantity';
    end if;

    if v_qty=v_remaining_qty then
      v_sub:=l.line_subtotal-v_prev_subtotal;
      v_discount:=l.discount_amount-v_prev_discount;
      v_tax:=l.tax_amount-v_prev_tax;
      v_total:=l.line_total-v_prev_total;
    else
      v_sub:=round(v_qty*l.unit_price,4);
      v_discount:=round(v_sub*l.discount_bps/10000.0,4);
      v_tax:=round((v_sub-v_discount)*l.tax_bps/10000.0,4);
      v_total:=v_sub-v_discount+v_tax;
    end if;

    if v_total<=0 then raise exception 'INVOICE-ENGINE Credit Note line total must be positive'; end if;

    v_line_no:=v_line_no+1;
    v_resolved:=v_resolved||jsonb_build_array(jsonb_build_object(
      'lineNo',v_line_no,'invoiceLineItemId',l.id,'creditedQuantity',v_qty,
      'name',l.name_snapshot,'sku',l.sku_snapshot,'unitPrice',l.unit_price,
      'discountBps',l.discount_bps,'taxBps',l.tax_bps,
      'lineSubtotal',v_sub,'discountAmount',v_discount,'taxAmount',v_tax,'lineTotal',v_total
    ));
    v_subtotal_total:=v_subtotal_total+v_sub;
    v_discount_total:=v_discount_total+v_discount;
    v_tax_total:=v_tax_total+v_tax;
    v_credit_total:=v_credit_total+v_total;
  end loop;

  if v_credit_total<=0 or v_credit_total>i.balance_due then
    raise exception 'INVOICE-ENGINE Credit Note exceeds current Invoice balance';
  end if;

  v_number:='CN-'||upper(right(replace(p_credit_note_id::text,'-',''),16));
  v_document:=jsonb_build_object(
    'documentType','CREDIT_NOTE','creditNoteId',p_credit_note_id,'creditNoteNumber',v_number,
    'invoiceId',i.id,'invoiceNumber',i.invoice_number,'issuedAt',v_now,'currency',i.currency,
    'reason',btrim(p_reason),'seller',i.seller_snapshot,'buyer',i.buyer_snapshot,
    'subtotal',v_subtotal_total,'discountTotal',v_discount_total,
    'taxTotal',v_tax_total,'total',v_credit_total,'lines',v_resolved,
    'refundExecutionAvailable',false
  );

  perform set_config('app.invoice_engine_mutation','allowed',true);

  insert into public.invoice_credit_notes(
    id,organization_id,invoice_id,credit_note_number,status,reason,
    subtotal,discount_total,tax_total,total,seller_snapshot,buyer_snapshot,
    evidence,document_snapshot,issued_by_user_id,issued_at,created_at
  ) values (
    p_credit_note_id,p_organization_id,p_invoice_id,v_number,'ISSUED',btrim(p_reason),
    v_subtotal_total,v_discount_total,v_tax_total,v_credit_total,i.seller_snapshot,i.buyer_snapshot,
    p_evidence,v_document,p_actor_user_id,v_now,v_now
  );

  for x in select value from jsonb_array_elements(v_resolved)
  loop
    insert into public.invoice_credit_note_line_items(
      organization_id,invoice_id,credit_note_id,invoice_line_item_id,line_no,
      credited_quantity,name_snapshot,sku_snapshot,unit_price,discount_bps,tax_bps,
      line_subtotal,discount_amount,tax_amount,line_total,created_at
    ) values (
      p_organization_id,p_invoice_id,p_credit_note_id,(x->>'invoiceLineItemId')::uuid,(x->>'lineNo')::integer,
      (x->>'creditedQuantity')::numeric,x->>'name',nullif(x->>'sku',''),(x->>'unitPrice')::numeric,
      (x->>'discountBps')::integer,(x->>'taxBps')::integer,
      (x->>'lineSubtotal')::numeric,(x->>'discountAmount')::numeric,
      (x->>'taxAmount')::numeric,(x->>'lineTotal')::numeric,v_now
    );
  end loop;

  update public.invoices
  set credited_total=credited_total+v_credit_total,version=version+1,
      updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and id=p_invoice_id;

  v_event:=private.invoice_engine_event(
    p_organization_id,p_invoice_id,p_credit_note_id,'CREDIT_NOTE_ISSUED',i.status,i.status,
    'USER',p_actor_user_id,'ie:'||md5(p_request_key||':credit-note'),v_hash,
    jsonb_build_object(
      'creditNoteNumber',v_number,'reason',btrim(p_reason),'total',v_credit_total,
      'currency',i.currency,'refundTruthCreated',false
    )
  );

  perform set_config('app.invoice_engine_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,
    correlation_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'INVOICE_ENGINE_CREDIT_NOTE_ISSUED',
    'invoice_credit_note',p_credit_note_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'invoiceId',p_invoice_id,'creditNoteNumber',v_number,
      'total',v_credit_total,'lifecycleEventId',v_event,'refundTruthCreated',false
    ),
    p_request_key,i.tenant_business_id,i.branch_id
  );
  return p_credit_note_id;
exception when others then
  perform set_config('app.invoice_engine_mutation','0',true);
  raise;
end;
$$;

create or replace function public.reconcile_due_invoices_v1(p_limit integer default 100)
returns jsonb
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  i record;
  v_hash text;
  v_request text;
  v_event uuid;
  v_processed integer:=0;
begin
  if current_user<>'service_role' or p_limit not between 1 and 1000 then
    raise exception 'Invoice due-date reconciliation is not permitted';
  end if;

  for i in
    select id,organization_id,tenant_business_id,branch_id,invoice_number,due_date,status,balance_due
    from public.invoices
    where status='ISSUED' and due_date<current_date and balance_due>0
    order by due_date,id
    for update skip locked
    limit p_limit
  loop
    v_request:='invoice-overdue:'||i.id::text||':'||i.due_date::text;
    v_hash:=md5(jsonb_build_object('invoiceId',i.id,'dueDate',i.due_date,'balanceDue',i.balance_due)::text);

    perform set_config('app.invoice_engine_mutation','allowed',true);
    update public.invoices
    set status='OVERDUE',version=version+1,updated_at=statement_timestamp()
    where organization_id=i.organization_id and id=i.id and status='ISSUED';

    if found then
      v_event:=private.invoice_engine_event(
        i.organization_id,i.id,null,'OVERDUE','ISSUED','OVERDUE','SYSTEM',null,
        'ie:'||md5(v_request||':overdue'),v_hash,
        jsonb_build_object('dueDate',i.due_date,'balanceDue',i.balance_due)
      );
      insert into public.audit_logs(
        organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,
        correlation_id,tenant_business_id,branch_id
      ) values (
        i.organization_id,'SYSTEM','invoice_engine','INVOICE_ENGINE_OVERDUE','invoice',i.id::text,
        jsonb_build_object('requestHash',v_hash,'lifecycleEventId',v_event,'dueDate',i.due_date,'balanceDue',i.balance_due),
        v_request,i.tenant_business_id,i.branch_id
      )
      on conflict do nothing;
      v_processed:=v_processed+1;
    end if;
    perform set_config('app.invoice_engine_mutation','0',true);
  end loop;

  return jsonb_build_object('processed',v_processed);
exception when others then
  perform set_config('app.invoice_engine_mutation','0',true);
  raise;
end;
$$;

create or replace function public.automation_trigger_expected_condition_subject(p_trigger_key text)
returns text
language sql
stable
security invoker
set search_path=public,pg_catalog
as $$
  select case family
    when 'MESSAGE' then 'CONVERSATION'
    when 'CUSTOMER' then 'ACCOUNT'
    when 'LEAD' then 'LEAD'
    when 'DEAL' then 'DEAL'
    when 'TASK' then 'TASK'
    when 'SEGMENT' then 'SEGMENT_SNAPSHOT'
    when 'CASE' then 'CASE'
    when 'BOOKING' then 'BOOKING'
    when 'QUOTE' then 'QUOTE'
    when 'ORDER' then 'ORDER'
    when 'INVOICE' then 'INVOICE'
    else null
  end
  from public.automation_trigger_catalog
  where trigger_key=upper(trim(p_trigger_key));
$$;

update public.automation_trigger_catalog
set availability='AVAILABLE',required_work_package=null,
    description='Canonical INVOICE-ENGINE domain event is produced from durable Invoice lifecycle evidence.'
where trigger_key in ('INVOICE_ISSUED','INVOICE_OVERDUE')
  and required_work_package='INVOICE-ENGINE';

create or replace function public.reconcile_invoice_automation_events(p_limit integer default 100)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  e record;
  v_source_key text;
  v_trigger text;
  v_result jsonb;
  v_processed integer:=0;
  v_enqueued integer:=0;
  v_replayed integer:=0;
begin
  if current_user<>'service_role' or p_limit not between 1 and 1000 then
    raise exception 'Invoice automation reconciliation is not permitted';
  end if;

  for e in
    select ile.id,ile.organization_id,ile.invoice_id,ile.event_type,ile.from_status,ile.to_status,ile.evidence,ile.occurred_at
    from public.invoice_lifecycle_events ile
    where ile.event_type in ('ISSUED','OVERDUE')
      and not exists(
        select 1 from public.audit_logs a
        where a.organization_id=ile.organization_id
          and a.action='INVOICE_AUTOMATION_EVENT_PROJECTED'
          and a.correlation_id='invoice-lifecycle:'||ile.id::text
      )
    order by ile.occurred_at,ile.id
    limit p_limit
  loop
    v_source_key:='invoice-lifecycle:'||e.id::text;
    v_trigger:=case when e.event_type='ISSUED' then 'INVOICE_ISSUED' else 'INVOICE_OVERDUE' end;

    perform pg_advisory_xact_lock(hashtextextended(v_source_key,0));
    if exists(
      select 1 from public.audit_logs a
      where a.organization_id=e.organization_id
        and a.action='INVOICE_AUTOMATION_EVENT_PROJECTED'
        and a.correlation_id=v_source_key
    ) then continue; end if;

    v_result:=public.enqueue_automation_runtime_event(
      e.organization_id,v_trigger,v_source_key,'INVOICE',e.invoice_id,
      jsonb_build_object(
        'invoiceId',e.invoice_id,'lifecycleEventId',e.id,'eventType',e.event_type,
        'fromStatus',e.from_status,'toStatus',e.to_status,'evidence',e.evidence
      ),
      e.occurred_at
    );

    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
    ) values (
      e.organization_id,'SYSTEM','invoice_engine','INVOICE_AUTOMATION_EVENT_PROJECTED','invoice',e.invoice_id::text,
      jsonb_build_object('triggerKey',v_trigger,'lifecycleEventId',e.id,'runtime',v_result),
      v_source_key
    )
    on conflict do nothing;

    v_processed:=v_processed+1;
    v_enqueued:=v_enqueued+coalesce((v_result->>'enqueuedRuns')::integer,0);
    v_replayed:=v_replayed+coalesce((v_result->>'replayedRuns')::integer,0);
  end loop;

  return jsonb_build_object('processed',v_processed,'enqueued',v_enqueued,'replayed',v_replayed);
end;
$$;

create or replace function public.get_crm_customer360_v5(
  p_organization_id uuid,
  p_person_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=public,pg_catalog
as $$
declare v_base jsonb; v_invoices jsonb;
begin
  v_base:=public.get_crm_customer360_v4(p_organization_id,p_person_id,p_limit);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'invoiceNumber',i.invoice_number,'orderId',i.order_id,'status',i.status,
    'settlementStatus',i.settlement_status,'total',i.total,'paidTotal',i.paid_total,
    'creditedTotal',i.credited_total,'balanceDue',i.balance_due,'currency',i.currency,
    'dueDate',i.due_date,'issuedAt',i.issued_at,'updatedAt',i.updated_at
  ) order by i.updated_at desc,i.id),'[]'::jsonb)
  into v_invoices
  from (
    select * from public.invoices
    where organization_id=p_organization_id and person_id=p_person_id
    order by updated_at desc,id limit p_limit
  ) i;

  v_base:=jsonb_set(v_base,'{invoices}',v_invoices,true);
  v_base:=jsonb_set(v_base,'{moduleStatus,invoices}','"IMPLEMENTED"'::jsonb,true);
  return v_base;
end;
$$;

revoke all on function public.guard_invoice_engine_mutation() from public,anon,authenticated,service_role;
revoke all on function private.invoice_engine_actor_role(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.invoice_engine_assert_manage(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.invoice_engine_assert_manager(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.invoice_engine_is_replay(uuid,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.invoice_engine_event(uuid,uuid,uuid,text,text,text,text,uuid,text,text,jsonb) from public,anon,authenticated,service_role;

grant execute on function private.invoice_engine_actor_role(uuid,uuid) to service_role;
grant execute on function private.invoice_engine_assert_manage(uuid,uuid,uuid) to service_role;
grant execute on function private.invoice_engine_assert_manager(uuid,uuid) to service_role;
grant execute on function private.invoice_engine_is_replay(uuid,text,text,text,text,text) to service_role;
grant execute on function private.invoice_engine_event(uuid,uuid,uuid,text,text,text,text,uuid,text,text,jsonb) to service_role;

revoke all on function public.create_invoice_from_order_v1(uuid,uuid,uuid,uuid,date,text)
  from public,anon,authenticated,service_role;
grant execute on function public.create_invoice_from_order_v1(uuid,uuid,uuid,uuid,date,text) to service_role;

revoke all on function public.issue_invoice_v1(uuid,uuid,uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.issue_invoice_v1(uuid,uuid,uuid,integer,text) to service_role;

revoke all on function public.void_invoice_v1(uuid,uuid,uuid,integer,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.void_invoice_v1(uuid,uuid,uuid,integer,text,jsonb,text) to service_role;

revoke all on function public.issue_invoice_credit_note_v1(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.issue_invoice_credit_note_v1(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text) to service_role;

revoke all on function public.reconcile_due_invoices_v1(integer)
  from public,anon,authenticated,service_role;
grant execute on function public.reconcile_due_invoices_v1(integer) to service_role;

revoke all on function public.reconcile_invoice_automation_events(integer)
  from public,anon,authenticated,service_role;
grant execute on function public.reconcile_invoice_automation_events(integer) to service_role;

revoke all on function public.get_crm_customer360_v5(uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_crm_customer360_v5(uuid,uuid,integer) to authenticated,service_role;
