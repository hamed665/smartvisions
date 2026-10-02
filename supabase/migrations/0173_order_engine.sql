-- ORDER-ENGINE
-- Canonical commercial Order authority. Reuses QUOTE-ENGINE, CRM, Catalog, Booking and Automation.
-- Does not create Invoice, Payment, refund, stock, warehouse, reservation or inventory-movement truth.

create table public.orders (
  id uuid primary key,
  organization_id uuid not null,
  tenant_business_id uuid not null,
  branch_id uuid,
  person_id uuid,
  buyer_business_id uuid,
  deal_id uuid,
  booking_id uuid,
  quote_id uuid,
  quote_version_no integer,
  owner_user_id uuid not null,
  order_number text not null,
  source_kind text not null check (source_kind in ('QUOTE','DIRECT')),
  status text not null default 'CONFIRMED'
    check (status in ('CONFIRMED','PROCESSING','COMPLETED','CANCELLED','PARTIALLY_RETURNED','RETURNED')),
  fulfillment_status text not null default 'PENDING'
    check (fulfillment_status in ('PENDING','PARTIAL','FULFILLED','CANCELLED','PARTIALLY_RETURNED','RETURNED')),
  country_code text not null,
  currency text not null,
  terms_snapshot text,
  subtotal numeric(18,4) not null check (subtotal>=0),
  discount_total numeric(18,4) not null check (discount_total>=0),
  tax_total numeric(18,4) not null check (tax_total>=0),
  total numeric(18,4) not null check (total>=0),
  seller_snapshot jsonb not null,
  buyer_snapshot jsonb not null,
  source_evidence jsonb not null,
  version integer not null default 1 check (version>=1),
  confirmed_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,order_number),
  unique (organization_id,quote_id),
  foreign key (organization_id) references public.organizations(id) on delete cascade,
  foreign key (organization_id,tenant_business_id)
    references public.tenant_businesses(organization_id,id) on delete restrict,
  foreign key (organization_id,branch_id)
    references public.branches(organization_id,id) on delete restrict,
  foreign key (organization_id,person_id)
    references public.crm_people(organization_id,id) on delete restrict,
  foreign key (organization_id,buyer_business_id)
    references public.businesses(organization_id,id) on delete restrict,
  foreign key (organization_id,deal_id)
    references public.crm_deals(organization_id,id) on delete restrict,
  foreign key (organization_id,booking_id)
    references public.bookings(organization_id,id) on delete restrict,
  foreign key (organization_id,quote_id,quote_version_no)
    references public.quote_versions(organization_id,quote_id,version_no) on delete restrict,
  foreign key (organization_id,owner_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (order_number ~ '^O-[A-Z0-9]{16}$'),
  check (country_code=upper(btrim(country_code)) and country_code ~ '^[A-Z]{2}$'),
  check (currency=upper(btrim(currency)) and currency ~ '^[A-Z]{3}$'),
  check (person_id is not null or buyer_business_id is not null),
  check (
    (source_kind='QUOTE' and quote_id is not null and quote_version_no is not null)
    or (source_kind='DIRECT' and quote_id is null and quote_version_no is null)
  ),
  check (terms_snapshot is null or length(btrim(terms_snapshot)) between 1 and 12000),
  check (jsonb_typeof(seller_snapshot)='object' and seller_snapshot<>'{}'::jsonb and octet_length(seller_snapshot::text)<=16384),
  check (jsonb_typeof(buyer_snapshot)='object' and buyer_snapshot<>'{}'::jsonb and octet_length(buyer_snapshot::text)<=16384),
  check (jsonb_typeof(source_evidence)='object' and source_evidence<>'{}'::jsonb and octet_length(source_evidence::text)<=32768),
  check (discount_total<=subtotal),
  check (total=subtotal-discount_total+tax_total),
  check ((status='PROCESSING' and processing_started_at is not null) or status<>'PROCESSING'),
  check ((status='COMPLETED' and completed_at is not null) or status<>'COMPLETED'),
  check ((status='CANCELLED' and cancelled_at is not null and cancellation_reason is not null) or status<>'CANCELLED'),
  check (cancellation_reason is null or length(btrim(cancellation_reason)) between 3 and 1000)
);
comment on table public.orders is
  'Canonical ORDER-ENGINE commercial aggregate. Inventory, Invoice, Payment and refund truth remain owned by later Work Packages.';

create table public.order_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id uuid not null,
  line_no integer not null check (line_no between 1 and 500),
  quote_line_item_id uuid,
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
  price_source_version integer,
  created_at timestamptz not null default now(),
  unique (organization_id,id,order_id),
  unique (organization_id,order_id,line_no),
  foreign key (organization_id,order_id)
    references public.orders(organization_id,id) on delete restrict,
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
comment on table public.order_line_items is
  'Immutable commercial Order line snapshots. Quote-derived lines preserve accepted Quote evidence; direct lines resolve canonical Catalog prices.';

create unique index if not exists quote_line_items_org_id_uidx
  on public.quote_line_items(organization_id,id);

alter table public.order_line_items
  add constraint order_line_items_quote_line_fk
  foreign key (organization_id,quote_line_item_id)
  references public.quote_line_items(organization_id,id) on delete restrict;

create table public.order_line_fulfillment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id uuid not null,
  order_line_item_id uuid not null,
  ordered_quantity numeric(18,4) not null check (ordered_quantity>0 and ordered_quantity<=1000000),
  fulfilled_quantity numeric(18,4) not null default 0 check (fulfilled_quantity>=0),
  returned_quantity numeric(18,4) not null default 0 check (returned_quantity>=0),
  status text not null default 'PENDING'
    check (status in ('PENDING','PARTIAL','FULFILLED','CANCELLED','PARTIALLY_RETURNED','RETURNED')),
  version integer not null default 1 check (version>=1),
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,order_line_item_id),
  foreign key (organization_id,order_line_item_id,order_id)
    references public.order_line_items(organization_id,id,order_id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (fulfilled_quantity<=ordered_quantity),
  check (returned_quantity<=fulfilled_quantity)
);
comment on table public.order_line_fulfillment is
  'Order-facing fulfillment summary only. It records customer-facing fulfilled/returned quantities and does not own stock, reservation, warehouse or inventory movement.';

create table public.order_returns (
  id uuid primary key,
  organization_id uuid not null,
  order_id uuid not null,
  return_number text not null,
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED','APPROVED','REJECTED','RECEIVED')),
  reason text not null,
  request_evidence jsonb not null,
  decision_note text,
  decision_evidence jsonb,
  received_evidence jsonb,
  created_by_user_id uuid not null,
  decided_by_user_id uuid,
  received_by_user_id uuid,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  received_at timestamptz,
  version integer not null default 1 check (version>=1),
  updated_at timestamptz not null default now(),
  unique (organization_id,id,order_id),
  unique (organization_id,return_number),
  foreign key (organization_id,order_id)
    references public.orders(organization_id,id) on delete restrict,
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,decided_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,received_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (return_number ~ '^R-[A-Z0-9]{16}$'),
  check (length(btrim(reason)) between 3 and 1000),
  check (jsonb_typeof(request_evidence)='object' and request_evidence<>'{}'::jsonb and octet_length(request_evidence::text)<=16384),
  check (decision_note is null or length(btrim(decision_note)) between 1 and 2000),
  check (decision_evidence is null or (jsonb_typeof(decision_evidence)='object' and decision_evidence<>'{}'::jsonb and octet_length(decision_evidence::text)<=16384)),
  check (received_evidence is null or (jsonb_typeof(received_evidence)='object' and received_evidence<>'{}'::jsonb and octet_length(received_evidence::text)<=16384)),
  check (
    (status in ('APPROVED','REJECTED') and decided_by_user_id is not null and decided_at is not null and decision_evidence is not null)
    or status not in ('APPROVED','REJECTED')
  ),
  check (
    (status='RECEIVED' and decided_by_user_id is not null and decided_at is not null
      and received_by_user_id is not null and received_at is not null and received_evidence is not null)
    or status<>'RECEIVED'
  )
);
comment on table public.order_returns is
  'Canonical commercial return evidence for ORDER-ENGINE. Refund execution and credit notes remain owned by Payment/Invoice Work Packages.';

create table public.order_return_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  return_id uuid not null,
  order_id uuid not null,
  order_line_item_id uuid not null,
  quantity numeric(18,4) not null check (quantity>0 and quantity<=1000000),
  created_at timestamptz not null default now(),
  unique (organization_id,return_id,order_line_item_id),
  foreign key (organization_id,return_id,order_id)
    references public.order_returns(organization_id,id,order_id) on delete restrict,
  foreign key (organization_id,order_line_item_id,order_id)
    references public.order_line_items(organization_id,id,order_id) on delete restrict
);
comment on table public.order_return_lines is
  'Immutable returned-quantity request snapshot. No refund amount or Payment authority is stored here.';

create table public.order_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id uuid not null,
  transition text not null check (transition in (
    'CREATED','PROCESSING_STARTED','FULFILLMENT_RECORDED','FULFILLED','CANCELLED',
    'RETURN_REQUESTED','RETURN_APPROVED','RETURN_REJECTED','PARTIALLY_RETURNED','RETURNED'
  )),
  from_status text,
  to_status text not null,
  actor_type text not null check (actor_type in ('USER','SYSTEM')),
  actor_user_id uuid,
  request_key text not null,
  request_hash text not null,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (organization_id,request_key),
  foreign key (organization_id,order_id)
    references public.orders(organization_id,id) on delete restrict,
  foreign key (organization_id,actor_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (length(btrim(request_key)) between 8 and 200),
  check (length(request_hash)=32),
  check (jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=32768),
  check ((actor_type='USER' and actor_user_id is not null) or actor_type<>'USER')
);
comment on table public.order_lifecycle_events is
  'Durable ORDER-ENGINE domain evidence and Automation Runtime projection source. It is not a second event bus.';

create index orders_org_status_updated_idx on public.orders(organization_id,status,updated_at desc,id);
create index orders_seller_idx on public.orders(organization_id,tenant_business_id);
create index orders_branch_idx on public.orders(organization_id,branch_id) where branch_id is not null;
create index orders_person_idx on public.orders(organization_id,person_id,updated_at desc,id) where person_id is not null;
create index orders_buyer_business_idx on public.orders(organization_id,buyer_business_id,updated_at desc,id) where buyer_business_id is not null;
create index orders_deal_idx on public.orders(organization_id,deal_id) where deal_id is not null;
create index orders_booking_idx on public.orders(organization_id,booking_id) where booking_id is not null;
create index orders_quote_version_idx on public.orders(organization_id,quote_id,quote_version_no) where quote_id is not null;
create index orders_owner_idx on public.orders(organization_id,owner_user_id,status);
create index orders_creator_idx on public.orders(organization_id,created_by_user_id);
create index orders_updater_idx on public.orders(organization_id,updated_by_user_id);

create index order_lines_order_idx on public.order_line_items(organization_id,order_id,line_no);
create index order_lines_quote_line_idx on public.order_line_items(organization_id,quote_line_item_id) where quote_line_item_id is not null;
create index order_lines_service_idx on public.order_line_items(organization_id,service_id) where service_id is not null;
create index order_lines_product_idx on public.order_line_items(organization_id,product_id) where product_id is not null;
create index order_lines_variant_idx on public.order_line_items(organization_id,variant_id) where variant_id is not null;
create index order_lines_service_price_idx on public.order_line_items(organization_id,service_price_id) where service_price_id is not null;
create index order_lines_product_price_idx on public.order_line_items(organization_id,product_price_id) where product_price_id is not null;

create index order_fulfillment_order_idx on public.order_line_fulfillment(organization_id,order_id,status);
create index order_fulfillment_updater_idx on public.order_line_fulfillment(organization_id,updated_by_user_id);

create index order_returns_order_idx on public.order_returns(organization_id,order_id,status,requested_at desc,id);
create index order_returns_creator_idx on public.order_returns(organization_id,created_by_user_id);
create index order_returns_decider_idx on public.order_returns(organization_id,decided_by_user_id) where decided_by_user_id is not null;
create index order_returns_receiver_idx on public.order_returns(organization_id,received_by_user_id) where received_by_user_id is not null;
create index order_return_lines_order_line_idx on public.order_return_lines(organization_id,order_line_item_id);
create index order_events_order_idx on public.order_lifecycle_events(organization_id,order_id,occurred_at desc,id);
create index order_events_projection_idx on public.order_lifecycle_events(transition,occurred_at,id);
create index order_events_actor_idx on public.order_lifecycle_events(organization_id,actor_user_id) where actor_user_id is not null;

alter table public.orders enable row level security;
alter table public.order_line_items enable row level security;
alter table public.order_line_fulfillment enable row level security;
alter table public.order_returns enable row level security;
alter table public.order_return_lines enable row level security;
alter table public.order_lifecycle_events enable row level security;

create policy orders_member_read on public.orders for select to authenticated
  using (public.is_org_member(organization_id));
create policy order_lines_member_read on public.order_line_items for select to authenticated
  using (public.is_org_member(organization_id));
create policy order_fulfillment_member_read on public.order_line_fulfillment for select to authenticated
  using (public.is_org_member(organization_id));
create policy order_returns_member_read on public.order_returns for select to authenticated
  using (public.is_org_member(organization_id));
create policy order_return_lines_member_read on public.order_return_lines for select to authenticated
  using (public.is_org_member(organization_id));
create policy order_events_member_read on public.order_lifecycle_events for select to authenticated
  using (public.is_org_member(organization_id));

revoke all on table
  public.orders,public.order_line_items,public.order_line_fulfillment,
  public.order_returns,public.order_return_lines,public.order_lifecycle_events
from public,anon,authenticated,service_role;

grant select on table
  public.orders,public.order_line_items,public.order_line_fulfillment,
  public.order_returns,public.order_return_lines,public.order_lifecycle_events
to authenticated;

grant select,insert,update on table
  public.orders,public.order_line_fulfillment,public.order_returns
to service_role;
grant select,insert on table
  public.order_line_items,public.order_return_lines,public.order_lifecycle_events
to service_role;

create or replace function public.guard_order_engine_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if coalesce(current_setting('app.order_engine_mutation',true),'')<>'allowed' then
    raise exception 'ORDER-ENGINE state requires governed command';
  end if;
  if tg_table_name in ('order_line_items','order_return_lines','order_lifecycle_events')
     and tg_op<>'INSERT' then
    raise exception 'ORDER-ENGINE immutable evidence cannot be changed';
  end if;
  if tg_table_name='order_line_fulfillment' and tg_op='UPDATE'
     and new.ordered_quantity is distinct from old.ordered_quantity then
    raise exception 'ORDER-ENGINE ordered quantity snapshot is immutable';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger orders_guard before insert or update or delete on public.orders
for each row execute function public.guard_order_engine_mutation();
create trigger order_lines_guard before insert or update or delete on public.order_line_items
for each row execute function public.guard_order_engine_mutation();
create trigger order_fulfillment_guard before insert or update or delete on public.order_line_fulfillment
for each row execute function public.guard_order_engine_mutation();
create trigger order_returns_guard before insert or update or delete on public.order_returns
for each row execute function public.guard_order_engine_mutation();
create trigger order_return_lines_guard before insert or update or delete on public.order_return_lines
for each row execute function public.guard_order_engine_mutation();
create trigger order_events_guard before insert or update or delete on public.order_lifecycle_events
for each row execute function public.guard_order_engine_mutation();

create unique index order_engine_audit_request_uidx
  on public.audit_logs(organization_id,action,entity_type,entity_id,correlation_id)
  where action like 'ORDER_ENGINE_%' and correlation_id is not null;

create unique index order_automation_projection_uidx
  on public.audit_logs(organization_id,action,correlation_id)
  where action='ORDER_AUTOMATION_EVENT_PROJECTED' and correlation_id is not null;

create or replace function private.order_engine_actor_role(
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

create or replace function private.order_engine_assert_manage(
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
    raise exception 'ORDER-ENGINE Organization, actor and owner are required';
  end if;
  v_role:=private.order_engine_actor_role(p_organization_id,p_actor_user_id);
  if v_role not in ('OWNER','ADMIN','SALES_MANAGER')
     and not (v_role='SALES_AGENT' and p_owner_user_id=p_actor_user_id)
  then
    raise exception 'ORDER-ENGINE mutation is not permitted for actor';
  end if;
end;
$$;

create or replace function private.order_engine_assert_manager(
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
  v_role:=private.order_engine_actor_role(p_organization_id,p_actor_user_id);
  if v_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'ORDER-ENGINE manager permission is required';
  end if;
end;
$$;

create or replace function private.order_engine_is_replay(
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
    raise exception 'ORDER-ENGINE request key is invalid';
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
  if v_hash<>p_request_hash then
    raise exception 'ORDER-ENGINE request key conflict';
  end if;
  return true;
end;
$$;

create or replace function private.order_engine_event(
  p_organization_id uuid,
  p_order_id uuid,
  p_transition text,
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
  insert into public.order_lifecycle_events(
    organization_id,order_id,transition,from_status,to_status,
    actor_type,actor_user_id,request_key,request_hash,evidence
  ) values (
    p_organization_id,p_order_id,p_transition,p_from_status,p_to_status,
    p_actor_type,p_actor_user_id,p_request_key,p_request_hash,coalesce(p_evidence,'{}'::jsonb)
  )
  on conflict (organization_id,request_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id,request_hash into v_id,v_hash
    from public.order_lifecycle_events
    where organization_id=p_organization_id and request_key=p_request_key;
    if v_hash is distinct from p_request_hash then
      raise exception 'ORDER-ENGINE lifecycle request key conflict';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.create_order_from_quote_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_order_id uuid,
  p_quote_id uuid,
  p_booking_id uuid,
  p_owner_user_id uuid,
  p_request_key text
)
returns uuid
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  q public.quotes%rowtype;
  v public.quote_versions%rowtype;
  v_owner uuid:=coalesce(p_owner_user_id,p_actor_user_id);
  v_number text;
  v_hash text;
  v_now timestamptz:=statement_timestamp();
  v_event uuid;
  v_existing uuid;
begin
  if current_user<>'service_role' or p_order_id is null or p_quote_id is null then
    raise exception 'ORDER-ENGINE Quote conversion payload is invalid';
  end if;

  v_hash:=md5(jsonb_build_object(
    'orderId',p_order_id,'quoteId',p_quote_id,'bookingId',p_booking_id,'ownerUserId',v_owner
  )::text);

  select * into q from public.quotes
  where organization_id=p_organization_id and id=p_quote_id
  for update;
  if not found then raise exception 'ORDER-ENGINE source Quote not found'; end if;

  perform private.order_engine_assert_manage(p_organization_id,p_actor_user_id,v_owner);

  if private.order_engine_is_replay(
    p_organization_id,'ORDER_ENGINE_CREATED','order',p_order_id::text,p_request_key,v_hash
  ) then return p_order_id; end if;

  if q.status<>'ACCEPTED' or q.accepted_at is null or q.current_version<1 then
    raise exception 'ORDER-ENGINE only an accepted current Quote can become an Order';
  end if;

  if exists(
    select 1 from public.orders o
    where o.organization_id=p_organization_id and o.quote_id=p_quote_id
  ) then raise exception 'ORDER-ENGINE source Quote already has a canonical Order'; end if;

  select * into v from public.quote_versions
  where organization_id=p_organization_id and quote_id=p_quote_id and version_no=q.current_version;
  if not found then raise exception 'ORDER-ENGINE accepted Quote version is missing'; end if;

  if p_booking_id is not null and not exists(
    select 1 from public.bookings b
    where b.organization_id=p_organization_id and b.id=p_booking_id
      and q.person_id is not null and b.person_id=q.person_id
      and b.status<>'CANCELED'
  ) then raise exception 'ORDER-ENGINE Booking link is inconsistent with accepted Quote customer'; end if;

  v_number:='O-'||upper(right(replace(p_order_id::text,'-',''),16));

  perform set_config('app.order_engine_mutation','allowed',true);

  insert into public.orders(
    id,organization_id,tenant_business_id,branch_id,person_id,buyer_business_id,deal_id,booking_id,
    quote_id,quote_version_no,owner_user_id,order_number,source_kind,status,fulfillment_status,
    country_code,currency,terms_snapshot,subtotal,discount_total,tax_total,total,
    seller_snapshot,buyer_snapshot,source_evidence,version,confirmed_at,
    created_by_user_id,updated_by_user_id,created_at,updated_at
  ) values (
    p_order_id,p_organization_id,q.tenant_business_id,q.branch_id,q.person_id,q.buyer_business_id,q.deal_id,p_booking_id,
    q.id,q.current_version,v_owner,v_number,'QUOTE','CONFIRMED','PENDING',
    v.country_code,v.currency,v.terms,v.subtotal,v.discount_total,v.tax_total,v.total,
    v.seller_snapshot,v.buyer_snapshot,
    jsonb_build_object(
      'source','ACCEPTED_QUOTE','quoteId',q.id,'quoteNumber',q.quote_number,
      'quoteVersion',q.current_version,'acceptedAt',q.accepted_at
    ),
    1,v_now,p_actor_user_id,p_actor_user_id,v_now,v_now
  );

  insert into public.order_line_items(
    organization_id,order_id,line_no,quote_line_item_id,subject_kind,
    service_id,product_id,variant_id,service_price_id,product_price_id,
    name_snapshot,sku_snapshot,description,quantity,unit_price,
    discount_bps,discount_amount,tax_bps,tax_amount,line_subtotal,line_total,price_source_version,created_at
  )
  select
    qli.organization_id,p_order_id,qli.line_no,qli.id,qli.subject_kind,
    qli.service_id,qli.product_id,qli.variant_id,qli.service_price_id,qli.product_price_id,
    qli.name_snapshot,qli.sku_snapshot,qli.description,qli.quantity,qli.unit_price,
    qli.discount_bps,qli.discount_amount,qli.tax_bps,qli.tax_amount,qli.line_subtotal,qli.line_total,
    qli.price_source_version,v_now
  from public.quote_line_items qli
  where qli.organization_id=p_organization_id and qli.quote_id=p_quote_id and qli.version_no=q.current_version
  order by qli.line_no;

  if not found then raise exception 'ORDER-ENGINE accepted Quote has no line items'; end if;

  insert into public.order_line_fulfillment(
    organization_id,order_id,order_line_item_id,ordered_quantity,fulfilled_quantity,returned_quantity,status,
    version,updated_by_user_id,created_at,updated_at
  )
  select organization_id,order_id,id,quantity,0,0,'PENDING',1,p_actor_user_id,v_now,v_now
  from public.order_line_items
  where organization_id=p_organization_id and order_id=p_order_id;

  v_event:=private.order_engine_event(
    p_organization_id,p_order_id,'CREATED',null,'CONFIRMED',
    'USER',p_actor_user_id,'oe:'||md5(p_request_key||':created'),v_hash,
    jsonb_build_object('sourceKind','QUOTE','quoteId',p_quote_id,'quoteVersion',q.current_version,'orderNumber',v_number)
  );

  perform set_config('app.order_engine_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'ORDER_ENGINE_CREATED','order',p_order_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'orderNumber',v_number,'sourceKind','QUOTE',
      'quoteId',p_quote_id,'quoteVersion',q.current_version,'total',v.total,'currency',v.currency,
      'lifecycleEventId',v_event,'invoiceTruthCreated',false,'paymentTruthCreated',false,
      'stockTruthCreated',false
    ),
    p_request_key,q.tenant_business_id,q.branch_id
  );

  perform public.record_quote_conversion_v1(
    p_organization_id,p_quote_id,'ORDER',p_order_id::text,
    jsonb_build_object('orderId',p_order_id,'orderNumber',v_number,'orderEngine','ORDER-ENGINE'),
    p_request_key||':quote-conversion'
  );

  return p_order_id;
exception when others then
  perform set_config('app.order_engine_mutation','0',true);
  raise;
end;
$$;

create or replace function public.create_direct_order_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_order_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_person_id uuid,
  p_buyer_business_id uuid,
  p_deal_id uuid,
  p_booking_id uuid,
  p_owner_user_id uuid,
  p_country_code text,
  p_currency text,
  p_terms text,
  p_direct_reason text,
  p_direct_evidence jsonb,
  p_lines jsonb,
  p_request_key text
)
returns uuid
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_owner uuid:=coalesce(p_owner_user_id,p_actor_user_id);
  v_country text:=upper(btrim(coalesce(p_country_code,'')));
  v_currency text:=upper(btrim(coalesce(p_currency,'')));
  v_reason text:=btrim(coalesce(p_direct_reason,''));
  v_hash text;
  v_number text;
  v_now timestamptz:=statement_timestamp();
  v_line jsonb;
  v_kind text;
  v_service_id text;
  v_product_id uuid;
  v_variant_id uuid;
  v_service_price_id uuid;
  v_product_price_id uuid;
  v_name text;
  v_sku text;
  v_description text;
  v_qty numeric(18,4);
  v_unit numeric(18,4);
  v_tax_bps integer;
  v_sub numeric(18,4);
  v_tax numeric(18,4);
  v_total_line numeric(18,4);
  v_price_version integer;
  v_line_no integer:=0;
  v_resolved jsonb:='[]'::jsonb;
  v_subtotal numeric(18,4):=0;
  v_tax_total numeric(18,4):=0;
  v_total numeric(18,4):=0;
  v_seller jsonb;
  v_buyer jsonb;
  v_deal public.crm_deals%rowtype;
  v_event uuid;
begin
  if current_user<>'service_role' or p_order_id is null or p_tenant_business_id is null
     or (p_person_id is null and p_buyer_business_id is null)
     or v_country !~ '^[A-Z]{2}$' or v_currency !~ '^[A-Z]{3}$'
     or length(v_reason) not between 3 and 1000
     or p_direct_evidence is null or jsonb_typeof(p_direct_evidence)<>'object'
     or p_direct_evidence='{}'::jsonb or octet_length(p_direct_evidence::text)>16384
     or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 500
  then raise exception 'ORDER-ENGINE direct Order payload is invalid'; end if;

  perform private.order_engine_assert_manager(p_organization_id,p_actor_user_id);

  v_hash:=md5(jsonb_build_object(
    'orderId',p_order_id,'sellerBusinessId',p_tenant_business_id,'branchId',p_branch_id,
    'personId',p_person_id,'buyerBusinessId',p_buyer_business_id,'dealId',p_deal_id,'bookingId',p_booking_id,
    'ownerUserId',v_owner,'country',v_country,'currency',v_currency,'terms',p_terms,
    'directReason',v_reason,'directEvidence',p_direct_evidence,'lines',p_lines
  )::text);

  if private.order_engine_is_replay(
    p_organization_id,'ORDER_ENGINE_CREATED','order',p_order_id::text,p_request_key,v_hash
  ) then return p_order_id; end if;

  if exists(select 1 from public.orders where organization_id=p_organization_id and id=p_order_id) then
    raise exception 'ORDER-ENGINE Order ID already exists under another command';
  end if;

  if not exists(
    select 1 from public.tenant_businesses tb
    where tb.organization_id=p_organization_id and tb.id=p_tenant_business_id and tb.status='ACTIVE'
  ) then raise exception 'ORDER-ENGINE seller Business is missing or inactive'; end if;

  if p_branch_id is not null and not exists(
    select 1 from public.branches b
    where b.organization_id=p_organization_id and b.id=p_branch_id
      and b.tenant_business_id=p_tenant_business_id and b.status='ACTIVE'
  ) then raise exception 'ORDER-ENGINE seller Branch scope is invalid'; end if;

  if p_person_id is not null and not exists(
    select 1 from public.crm_people p
    where p.organization_id=p_organization_id and p.id=p_person_id and p.status='ACTIVE'
  ) then raise exception 'ORDER-ENGINE buyer Person is missing or inactive'; end if;

  if p_buyer_business_id is not null and not exists(
    select 1 from public.businesses b
    where b.organization_id=p_organization_id and b.id=p_buyer_business_id
  ) then raise exception 'ORDER-ENGINE buyer Business is missing'; end if;

  if p_person_id is not null and p_buyer_business_id is not null and not exists(
    select 1 from public.crm_person_business_relationships r
    where r.organization_id=p_organization_id and r.person_id=p_person_id
      and r.business_id=p_buyer_business_id and r.status='ACTIVE'
  ) then raise exception 'ORDER-ENGINE Person/Business relationship is not confirmed'; end if;

  if p_deal_id is not null then
    select * into v_deal from public.crm_deals where organization_id=p_organization_id and id=p_deal_id;
    if not found or v_deal.state<>'OPEN'
       or p_buyer_business_id is null or v_deal.business_id<>p_buyer_business_id
       or (v_deal.person_id is not null and v_deal.person_id is distinct from p_person_id)
    then raise exception 'ORDER-ENGINE Deal context is inconsistent'; end if;
  end if;

  if p_booking_id is not null and not exists(
    select 1 from public.bookings b
    where b.organization_id=p_organization_id and b.id=p_booking_id
      and p_person_id is not null and b.person_id=p_person_id and b.status<>'CANCELED'
  ) then raise exception 'ORDER-ENGINE Booking context is inconsistent'; end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no:=v_line_no+1;
    v_kind:=upper(btrim(coalesce(v_line->>'subjectKind','')));
    v_description:=nullif(btrim(coalesce(v_line->>'description','')),'');
    v_qty:=coalesce(nullif(v_line->>'quantity','')::numeric,1);
    v_tax_bps:=coalesce(nullif(v_line->>'taxBps','')::integer,0);

    if v_qty<=0 or v_qty>1000000 or v_tax_bps not between 0 and 10000
       or coalesce(nullif(v_line->>'discountBps','')::integer,0)<>0
       or (v_description is not null and length(v_description)>2000)
    then
      raise exception 'ORDER-ENGINE direct line % is invalid; discounts require governed Quote flow',v_line_no;
    end if;

    v_service_id:=null; v_product_id:=null; v_variant_id:=null;
    v_service_price_id:=null; v_product_price_id:=null;
    v_name:=null; v_sku:=null; v_unit:=null; v_price_version:=null;

    if v_kind='SERVICE' then
      v_service_id:=nullif(btrim(coalesce(v_line->>'serviceId','')),'');
      select s.name,sp.id,sp.price
      into v_name,v_service_price_id,v_unit
      from public.services s
      join public.service_prices sp
        on sp.organization_id=s.organization_id and sp.service_id=s.id
       and sp.country_code=v_country and sp.currency=v_currency
      where s.organization_id=p_organization_id and s.id=v_service_id and s.enabled=true;
      if not found then raise exception 'ORDER-ENGINE canonical Service price is unavailable for line %',v_line_no; end if;
    elsif v_kind='PRODUCT' then
      v_product_id:=nullif(v_line->>'productId','')::uuid;
      select p.name,p.sku,pp.id,pp.price,pp.version
      into v_name,v_sku,v_product_price_id,v_unit,v_price_version
      from public.catalog_products p
      join public.catalog_product_prices pp
        on pp.organization_id=p.organization_id and pp.product_id=p.id and pp.variant_id is null
       and pp.country_code=v_country and pp.currency=v_currency
      where p.organization_id=p_organization_id and p.id=v_product_id
        and p.tenant_business_id=p_tenant_business_id and p.status='ACTIVE';
      if not found then raise exception 'ORDER-ENGINE canonical Product price is unavailable for line %',v_line_no; end if;
    elsif v_kind='VARIANT' then
      v_variant_id:=nullif(v_line->>'variantId','')::uuid;
      select p.id,p.name||' / '||v.name,v.sku,pp.id,pp.price,pp.version
      into v_product_id,v_name,v_sku,v_product_price_id,v_unit,v_price_version
      from public.catalog_product_variants v
      join public.catalog_products p on p.organization_id=v.organization_id and p.id=v.product_id
      join public.catalog_product_prices pp
        on pp.organization_id=v.organization_id and pp.product_id=v.product_id and pp.variant_id=v.id
       and pp.country_code=v_country and pp.currency=v_currency
      where v.organization_id=p_organization_id and v.id=v_variant_id
        and p.tenant_business_id=p_tenant_business_id
        and p.status='ACTIVE' and v.status='ACTIVE';
      if not found then raise exception 'ORDER-ENGINE canonical Variant price is unavailable for line %',v_line_no; end if;
    else
      raise exception 'ORDER-ENGINE direct line % subjectKind is invalid',v_line_no;
    end if;

    v_sub:=round(v_unit*v_qty,4);
    v_tax:=round(v_sub*v_tax_bps/10000.0,4);
    v_total_line:=v_sub+v_tax;
    v_subtotal:=v_subtotal+v_sub;
    v_tax_total:=v_tax_total+v_tax;
    v_total:=v_total+v_total_line;

    v_resolved:=v_resolved||jsonb_build_array(jsonb_build_object(
      'lineNo',v_line_no,'subjectKind',v_kind,'serviceId',v_service_id,
      'productId',v_product_id,'variantId',v_variant_id,
      'servicePriceId',v_service_price_id,'productPriceId',v_product_price_id,
      'name',v_name,'sku',v_sku,'description',v_description,
      'quantity',v_qty,'unitPrice',v_unit,'discountBps',0,'discountAmount',0,
      'taxBps',v_tax_bps,'taxAmount',v_tax,'lineSubtotal',v_sub,'lineTotal',v_total_line,
      'priceSourceVersion',v_price_version
    ));
  end loop;

  select jsonb_build_object(
    'tenantBusinessId',tb.id,'name',tb.name,'legalName',tb.legal_name,
    'countryCode',tb.country_code,'branchId',p_branch_id,'branchName',b.name
  ) into v_seller
  from public.tenant_businesses tb
  left join public.branches b on b.organization_id=tb.organization_id and b.id=p_branch_id
  where tb.organization_id=p_organization_id and tb.id=p_tenant_business_id;

  select jsonb_build_object(
    'personId',p_person_id,'personName',cp.display_name,
    'businessId',p_buyer_business_id,'businessName',bu.name,'dealId',p_deal_id
  ) into v_buyer
  from (select 1) x
  left join public.crm_people cp on cp.organization_id=p_organization_id and cp.id=p_person_id
  left join public.businesses bu on bu.organization_id=p_organization_id and bu.id=p_buyer_business_id;

  v_number:='O-'||upper(right(replace(p_order_id::text,'-',''),16));

  perform set_config('app.order_engine_mutation','allowed',true);

  insert into public.orders(
    id,organization_id,tenant_business_id,branch_id,person_id,buyer_business_id,deal_id,booking_id,
    owner_user_id,order_number,source_kind,status,fulfillment_status,country_code,currency,terms_snapshot,
    subtotal,discount_total,tax_total,total,seller_snapshot,buyer_snapshot,source_evidence,
    version,confirmed_at,created_by_user_id,updated_by_user_id,created_at,updated_at
  ) values (
    p_order_id,p_organization_id,p_tenant_business_id,p_branch_id,p_person_id,p_buyer_business_id,p_deal_id,p_booking_id,
    v_owner,v_number,'DIRECT','CONFIRMED','PENDING',v_country,v_currency,
    nullif(btrim(coalesce(p_terms,'')),''),
    round(v_subtotal,4),0,round(v_tax_total,4),round(v_total,4),v_seller,v_buyer,
    jsonb_build_object('source','DIRECT','reason',v_reason,'evidence',p_direct_evidence),
    1,v_now,p_actor_user_id,p_actor_user_id,v_now,v_now
  );

  insert into public.order_line_items(
    organization_id,order_id,line_no,subject_kind,service_id,product_id,variant_id,
    service_price_id,product_price_id,name_snapshot,sku_snapshot,description,quantity,unit_price,
    discount_bps,discount_amount,tax_bps,tax_amount,line_subtotal,line_total,price_source_version,created_at
  )
  select p_organization_id,p_order_id,(x->>'lineNo')::integer,x->>'subjectKind',
    nullif(x->>'serviceId',''),nullif(x->>'productId','')::uuid,nullif(x->>'variantId','')::uuid,
    nullif(x->>'servicePriceId','')::uuid,nullif(x->>'productPriceId','')::uuid,
    x->>'name',nullif(x->>'sku',''),nullif(x->>'description',''),
    (x->>'quantity')::numeric,(x->>'unitPrice')::numeric,0,0,
    (x->>'taxBps')::integer,(x->>'taxAmount')::numeric,
    (x->>'lineSubtotal')::numeric,(x->>'lineTotal')::numeric,
    nullif(x->>'priceSourceVersion','')::integer,v_now
  from jsonb_array_elements(v_resolved) x;

  insert into public.order_line_fulfillment(
    organization_id,order_id,order_line_item_id,ordered_quantity,fulfilled_quantity,returned_quantity,status,
    version,updated_by_user_id,created_at,updated_at
  )
  select organization_id,order_id,id,quantity,0,0,'PENDING',1,p_actor_user_id,v_now,v_now
  from public.order_line_items where organization_id=p_organization_id and order_id=p_order_id;

  v_event:=private.order_engine_event(
    p_organization_id,p_order_id,'CREATED',null,'CONFIRMED','USER',p_actor_user_id,
    'oe:'||md5(p_request_key||':created'),v_hash,
    jsonb_build_object('sourceKind','DIRECT','orderNumber',v_number,'reason',v_reason)
  );

  perform set_config('app.order_engine_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'ORDER_ENGINE_CREATED','order',p_order_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'orderNumber',v_number,'sourceKind','DIRECT','total',round(v_total,4),
      'currency',v_currency,'lifecycleEventId',v_event,'invoiceTruthCreated',false,
      'paymentTruthCreated',false,'stockTruthCreated',false
    ),
    p_request_key,p_tenant_business_id,p_branch_id
  );

  return p_order_id;
exception when others then
  perform set_config('app.order_engine_mutation','0',true);
  raise;
end;
$$;

create or replace function public.start_order_processing_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_order_id uuid,
  p_expected_version integer,
  p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare o public.orders%rowtype; v_hash text; v_now timestamptz:=statement_timestamp(); v_event uuid;
begin
  if current_user<>'service_role' then raise exception 'ORDER-ENGINE processing command is not permitted'; end if;
  select * into o from public.orders where organization_id=p_organization_id and id=p_order_id for update;
  if not found then raise exception 'ORDER-ENGINE Order not found'; end if;
  perform private.order_engine_assert_manage(p_organization_id,p_actor_user_id,o.owner_user_id);
  v_hash:=md5(jsonb_build_object('orderId',p_order_id,'expectedVersion',p_expected_version)::text);
  if private.order_engine_is_replay(p_organization_id,'ORDER_ENGINE_PROCESSING_STARTED','order',p_order_id::text,p_request_key,v_hash)
  then return 'PROCESSING'; end if;
  if o.version<>p_expected_version or o.status<>'CONFIRMED' then
    raise exception 'ORDER-ENGINE Order is not processable at expected version';
  end if;

  perform set_config('app.order_engine_mutation','allowed',true);
  update public.orders set status='PROCESSING',processing_started_at=v_now,version=version+1,
    updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and id=p_order_id;
  v_event:=private.order_engine_event(p_organization_id,p_order_id,'PROCESSING_STARTED','CONFIRMED','PROCESSING',
    'USER',p_actor_user_id,'oe:'||md5(p_request_key||':event'),v_hash,'{}'::jsonb);
  perform set_config('app.order_engine_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id,branch_id)
  values (p_organization_id,'USER',p_actor_user_id::text,'ORDER_ENGINE_PROCESSING_STARTED','order',p_order_id::text,
    jsonb_build_object('requestHash',v_hash,'lifecycleEventId',v_event),p_request_key,o.tenant_business_id,o.branch_id);
  return 'PROCESSING';
exception when others then perform set_config('app.order_engine_mutation','0',true); raise;
end;
$$;

create or replace function public.record_order_fulfillment_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_order_id uuid,
  p_expected_version integer,
  p_lines jsonb,
  p_evidence jsonb,
  p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  o public.orders%rowtype;
  x jsonb;
  v_line_id uuid;
  v_qty numeric(18,4);
  f public.order_line_fulfillment%rowtype;
  v_hash text;
  v_now timestamptz:=statement_timestamp();
  v_all boolean;
  v_any boolean;
  v_to text;
  v_fulfillment text;
  v_transition text;
  v_event uuid;
begin
  if current_user<>'service_role'
     or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 500
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb
     or octet_length(p_evidence::text)>16384
  then raise exception 'ORDER-ENGINE fulfillment payload is invalid'; end if;

  if (select count(*) from jsonb_array_elements(p_lines))<>
     (select count(distinct value->>'orderLineId') from jsonb_array_elements(p_lines))
  then raise exception 'ORDER-ENGINE fulfillment contains duplicate line IDs'; end if;

  select * into o from public.orders where organization_id=p_organization_id and id=p_order_id for update;
  if not found then raise exception 'ORDER-ENGINE Order not found'; end if;
  perform private.order_engine_assert_manage(p_organization_id,p_actor_user_id,o.owner_user_id);

  v_hash:=md5(jsonb_build_object(
    'orderId',p_order_id,'expectedVersion',p_expected_version,'lines',p_lines,'evidence',p_evidence
  )::text);
  if private.order_engine_is_replay(p_organization_id,'ORDER_ENGINE_FULFILLMENT_RECORDED','order',p_order_id::text,p_request_key,v_hash)
  then
    select status into v_to from public.orders where organization_id=p_organization_id and id=p_order_id;
    return v_to;
  end if;

  if o.version<>p_expected_version or o.status not in ('CONFIRMED','PROCESSING') then
    raise exception 'ORDER-ENGINE fulfillment is not allowed at expected version';
  end if;

  perform set_config('app.order_engine_mutation','allowed',true);

  for x in select value from jsonb_array_elements(p_lines)
  loop
    v_line_id:=nullif(x->>'orderLineId','')::uuid;
    v_qty:=nullif(x->>'quantity','')::numeric;
    if v_line_id is null or v_qty is null or v_qty<=0 then
      raise exception 'ORDER-ENGINE fulfillment line is invalid';
    end if;

    select * into f from public.order_line_fulfillment
    where organization_id=p_organization_id and order_id=p_order_id and order_line_item_id=v_line_id
    for update;
    if not found then raise exception 'ORDER-ENGINE fulfillment line does not belong to Order'; end if;
    if f.fulfilled_quantity+v_qty>f.ordered_quantity then
      raise exception 'ORDER-ENGINE fulfillment exceeds ordered quantity';
    end if;

    update public.order_line_fulfillment
    set fulfilled_quantity=fulfilled_quantity+v_qty,
        status=case
          when fulfilled_quantity+v_qty=ordered_quantity then 'FULFILLED'
          else 'PARTIAL'
        end,
        version=version+1,updated_by_user_id=p_actor_user_id,updated_at=v_now
    where organization_id=p_organization_id and order_line_item_id=v_line_id;
  end loop;

  select bool_and(fulfilled_quantity=ordered_quantity),bool_or(fulfilled_quantity>0)
  into v_all,v_any
  from public.order_line_fulfillment
  where organization_id=p_organization_id and order_id=p_order_id;

  v_to:=case when v_all then 'COMPLETED' else 'PROCESSING' end;
  v_fulfillment:=case when v_all then 'FULFILLED' else 'PARTIAL' end;
  v_transition:=case when v_all then 'FULFILLED' else 'FULFILLMENT_RECORDED' end;

  update public.orders
  set status=v_to,fulfillment_status=v_fulfillment,
      processing_started_at=coalesce(processing_started_at,v_now),
      completed_at=case when v_all then coalesce(completed_at,v_now) else completed_at end,
      version=version+1,updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and id=p_order_id;

  v_event:=private.order_engine_event(
    p_organization_id,p_order_id,v_transition,o.status,v_to,'USER',p_actor_user_id,
    'oe:'||md5(p_request_key||':event'),v_hash,
    jsonb_build_object('lines',p_lines,'evidence',p_evidence,'fulfillmentStatus',v_fulfillment)
  );

  perform set_config('app.order_engine_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id,branch_id)
  values (p_organization_id,'USER',p_actor_user_id::text,'ORDER_ENGINE_FULFILLMENT_RECORDED','order',p_order_id::text,
    jsonb_build_object('requestHash',v_hash,'status',v_to,'fulfillmentStatus',v_fulfillment,'lifecycleEventId',v_event),
    p_request_key,o.tenant_business_id,o.branch_id);

  return v_to;
exception when others then perform set_config('app.order_engine_mutation','0',true); raise;
end;
$$;

create or replace function public.cancel_order_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_order_id uuid,
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
declare o public.orders%rowtype; v_reason text:=btrim(coalesce(p_reason,'')); v_hash text; v_now timestamptz:=statement_timestamp(); v_event uuid;
begin
  if current_user<>'service_role' or length(v_reason) not between 3 and 1000
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb or octet_length(p_evidence::text)>16384
  then raise exception 'ORDER-ENGINE cancellation payload is invalid'; end if;

  select * into o from public.orders where organization_id=p_organization_id and id=p_order_id for update;
  if not found then raise exception 'ORDER-ENGINE Order not found'; end if;
  perform private.order_engine_assert_manage(p_organization_id,p_actor_user_id,o.owner_user_id);

  v_hash:=md5(jsonb_build_object('orderId',p_order_id,'expectedVersion',p_expected_version,'reason',v_reason,'evidence',p_evidence)::text);
  if private.order_engine_is_replay(p_organization_id,'ORDER_ENGINE_CANCELLED','order',p_order_id::text,p_request_key,v_hash)
  then return 'CANCELLED'; end if;

  if o.version<>p_expected_version or o.status not in ('CONFIRMED','PROCESSING') then
    raise exception 'ORDER-ENGINE Order is not cancellable at expected version';
  end if;
  if exists(
    select 1 from public.order_line_fulfillment
    where organization_id=p_organization_id and order_id=p_order_id and fulfilled_quantity>0
  ) then raise exception 'ORDER-ENGINE fulfilled Order cannot be cancelled; use governed return flow'; end if;
  if exists(
    select 1 from public.order_returns
    where organization_id=p_organization_id and order_id=p_order_id and status in ('REQUESTED','APPROVED','RECEIVED')
  ) then raise exception 'ORDER-ENGINE Order with return evidence cannot be cancelled'; end if;

  perform set_config('app.order_engine_mutation','allowed',true);
  update public.order_line_fulfillment
  set status='CANCELLED',version=version+1,updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and order_id=p_order_id;
  update public.orders
  set status='CANCELLED',fulfillment_status='CANCELLED',cancelled_at=v_now,cancellation_reason=v_reason,
      version=version+1,updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and id=p_order_id;
  v_event:=private.order_engine_event(p_organization_id,p_order_id,'CANCELLED',o.status,'CANCELLED','USER',p_actor_user_id,
    'oe:'||md5(p_request_key||':event'),v_hash,jsonb_build_object('reason',v_reason,'evidence',p_evidence));
  perform set_config('app.order_engine_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id,branch_id)
  values (p_organization_id,'USER',p_actor_user_id::text,'ORDER_ENGINE_CANCELLED','order',p_order_id::text,
    jsonb_build_object('requestHash',v_hash,'reason',v_reason,'lifecycleEventId',v_event),p_request_key,o.tenant_business_id,o.branch_id);
  return 'CANCELLED';
exception when others then perform set_config('app.order_engine_mutation','0',true); raise;
end;
$$;

create or replace function public.request_order_return_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_return_id uuid,
  p_order_id uuid,
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
  o public.orders%rowtype;
  v_reason text:=btrim(coalesce(p_reason,''));
  v_hash text;
  v_number text;
  v_now timestamptz:=statement_timestamp();
  x jsonb;
  v_line_id uuid;
  v_qty numeric(18,4);
  v_available numeric(18,4);
  v_reserved numeric(18,4);
  v_event uuid;
begin
  if current_user<>'service_role' or p_return_id is null
     or length(v_reason) not between 3 and 1000
     or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 500
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb or octet_length(p_evidence::text)>16384
  then raise exception 'ORDER-ENGINE return request payload is invalid'; end if;

  if (select count(*) from jsonb_array_elements(p_lines))<>
     (select count(distinct value->>'orderLineId') from jsonb_array_elements(p_lines))
  then raise exception 'ORDER-ENGINE return request contains duplicate line IDs'; end if;

  select * into o from public.orders where organization_id=p_organization_id and id=p_order_id for update;
  if not found then raise exception 'ORDER-ENGINE Order not found'; end if;
  perform private.order_engine_assert_manage(p_organization_id,p_actor_user_id,o.owner_user_id);

  v_hash:=md5(jsonb_build_object('returnId',p_return_id,'orderId',p_order_id,'reason',v_reason,'lines',p_lines,'evidence',p_evidence)::text);
  if private.order_engine_is_replay(p_organization_id,'ORDER_ENGINE_RETURN_REQUESTED','order_return',p_return_id::text,p_request_key,v_hash)
  then return p_return_id; end if;

  if o.status not in ('PROCESSING','COMPLETED','PARTIALLY_RETURNED') then
    raise exception 'ORDER-ENGINE Order is not returnable';
  end if;
  if exists(select 1 from public.order_returns where organization_id=p_organization_id and id=p_return_id) then
    raise exception 'ORDER-ENGINE Return ID already exists under another command';
  end if;

  for x in select value from jsonb_array_elements(p_lines)
  loop
    v_line_id:=nullif(x->>'orderLineId','')::uuid;
    v_qty:=nullif(x->>'quantity','')::numeric;
    if v_line_id is null or v_qty is null or v_qty<=0 then raise exception 'ORDER-ENGINE return line is invalid'; end if;

    select fulfilled_quantity-returned_quantity into v_available
    from public.order_line_fulfillment
    where organization_id=p_organization_id and order_id=p_order_id and order_line_item_id=v_line_id
    for update;
    if not found then raise exception 'ORDER-ENGINE return line does not belong to Order'; end if;

    select coalesce(sum(orl.quantity),0) into v_reserved
    from public.order_return_lines orl
    join public.order_returns r
      on r.organization_id=orl.organization_id and r.id=orl.return_id
    where orl.organization_id=p_organization_id and orl.order_id=p_order_id
      and orl.order_line_item_id=v_line_id and r.status in ('REQUESTED','APPROVED');

    if v_qty>v_available-v_reserved then raise exception 'ORDER-ENGINE return quantity exceeds available fulfilled quantity'; end if;
  end loop;

  v_number:='R-'||upper(right(replace(p_return_id::text,'-',''),16));

  perform set_config('app.order_engine_mutation','allowed',true);
  insert into public.order_returns(
    id,organization_id,order_id,return_number,status,reason,request_evidence,
    created_by_user_id,requested_at,version,updated_at
  ) values (
    p_return_id,p_organization_id,p_order_id,v_number,'REQUESTED',v_reason,p_evidence,
    p_actor_user_id,v_now,1,v_now
  );

  insert into public.order_return_lines(organization_id,return_id,order_id,order_line_item_id,quantity,created_at)
  select p_organization_id,p_return_id,p_order_id,
         nullif(x->>'orderLineId','')::uuid,(x->>'quantity')::numeric,v_now
  from jsonb_array_elements(p_lines) x;

  v_event:=private.order_engine_event(
    p_organization_id,p_order_id,'RETURN_REQUESTED',o.status,o.status,'USER',p_actor_user_id,
    'oe:'||md5(p_request_key||':event'),v_hash,
    jsonb_build_object('returnId',p_return_id,'returnNumber',v_number,'reason',v_reason,'lines',p_lines)
  );
  perform set_config('app.order_engine_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id,branch_id)
  values (p_organization_id,'USER',p_actor_user_id::text,'ORDER_ENGINE_RETURN_REQUESTED','order_return',p_return_id::text,
    jsonb_build_object('requestHash',v_hash,'orderId',p_order_id,'returnNumber',v_number,'lifecycleEventId',v_event),
    p_request_key,o.tenant_business_id,o.branch_id);
  return p_return_id;
exception when others then perform set_config('app.order_engine_mutation','0',true); raise;
end;
$$;

create or replace function public.decide_order_return_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_return_id uuid,
  p_decision text,
  p_note text,
  p_evidence jsonb,
  p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  r public.order_returns%rowtype;
  o public.orders%rowtype;
  v_decision text:=upper(btrim(coalesce(p_decision,'')));
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
  v_to text;
  v_hash text;
  v_now timestamptz:=statement_timestamp();
  v_event uuid;
begin
  if current_user<>'service_role' or v_decision not in ('APPROVE','REJECT')
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb or octet_length(p_evidence::text)>16384
     or (v_note is not null and length(v_note)>2000)
  then raise exception 'ORDER-ENGINE return decision payload is invalid'; end if;

  perform private.order_engine_assert_manager(p_organization_id,p_actor_user_id);

  select * into r from public.order_returns where organization_id=p_organization_id and id=p_return_id for update;
  if not found then raise exception 'ORDER-ENGINE Return not found'; end if;
  select * into o from public.orders where organization_id=p_organization_id and id=r.order_id for update;

  v_to:=case when v_decision='APPROVE' then 'APPROVED' else 'REJECTED' end;
  v_hash:=md5(jsonb_build_object('returnId',p_return_id,'decision',v_decision,'note',v_note,'evidence',p_evidence)::text);
  if private.order_engine_is_replay(p_organization_id,'ORDER_ENGINE_RETURN_DECIDED','order_return',p_return_id::text,p_request_key,v_hash)
  then return v_to; end if;

  if r.status<>'REQUESTED' then raise exception 'ORDER-ENGINE Return is not awaiting decision'; end if;

  perform set_config('app.order_engine_mutation','allowed',true);
  update public.order_returns
  set status=v_to,decision_note=v_note,decision_evidence=p_evidence,
      decided_by_user_id=p_actor_user_id,decided_at=v_now,version=version+1,updated_at=v_now
  where organization_id=p_organization_id and id=p_return_id;

  v_event:=private.order_engine_event(
    p_organization_id,r.order_id,
    case when v_to='APPROVED' then 'RETURN_APPROVED' else 'RETURN_REJECTED' end,
    o.status,o.status,'USER',p_actor_user_id,'oe:'||md5(p_request_key||':event'),v_hash,
    jsonb_build_object('returnId',p_return_id,'decision',v_to,'note',v_note)
  );
  perform set_config('app.order_engine_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id,branch_id)
  values (p_organization_id,'USER',p_actor_user_id::text,'ORDER_ENGINE_RETURN_DECIDED','order_return',p_return_id::text,
    jsonb_build_object('requestHash',v_hash,'orderId',r.order_id,'status',v_to,'lifecycleEventId',v_event),
    p_request_key,o.tenant_business_id,o.branch_id);
  return v_to;
exception when others then perform set_config('app.order_engine_mutation','0',true); raise;
end;
$$;

create or replace function public.receive_order_return_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_return_id uuid,
  p_evidence jsonb,
  p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  r public.order_returns%rowtype;
  o public.orders%rowtype;
  x record;
  f public.order_line_fulfillment%rowtype;
  v_hash text;
  v_now timestamptz:=statement_timestamp();
  v_all_returned boolean;
  v_to text;
  v_fulfillment text;
  v_event uuid;
begin
  if current_user<>'service_role'
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb or octet_length(p_evidence::text)>16384
  then raise exception 'ORDER-ENGINE return receipt payload is invalid'; end if;

  select * into r from public.order_returns where organization_id=p_organization_id and id=p_return_id for update;
  if not found then raise exception 'ORDER-ENGINE Return not found'; end if;
  select * into o from public.orders where organization_id=p_organization_id and id=r.order_id for update;
  perform private.order_engine_assert_manage(p_organization_id,p_actor_user_id,o.owner_user_id);

  v_hash:=md5(jsonb_build_object('returnId',p_return_id,'evidence',p_evidence)::text);
  if private.order_engine_is_replay(p_organization_id,'ORDER_ENGINE_RETURN_RECEIVED','order_return',p_return_id::text,p_request_key,v_hash)
  then
    select status into v_to from public.orders where organization_id=p_organization_id and id=r.order_id;
    return v_to;
  end if;

  if r.status<>'APPROVED' then raise exception 'ORDER-ENGINE Return is not approved'; end if;

  perform set_config('app.order_engine_mutation','allowed',true);

  for x in
    select orl.order_line_item_id,orl.quantity
    from public.order_return_lines orl
    where orl.organization_id=p_organization_id and orl.return_id=p_return_id
    order by orl.id
  loop
    select * into f from public.order_line_fulfillment
    where organization_id=p_organization_id and order_id=r.order_id and order_line_item_id=x.order_line_item_id
    for update;
    if f.returned_quantity+x.quantity>f.fulfilled_quantity then
      raise exception 'ORDER-ENGINE received return exceeds fulfilled quantity';
    end if;

    update public.order_line_fulfillment
    set returned_quantity=returned_quantity+x.quantity,
        status=case
          when returned_quantity+x.quantity=ordered_quantity then 'RETURNED'
          else 'PARTIALLY_RETURNED'
        end,
        version=version+1,updated_by_user_id=p_actor_user_id,updated_at=v_now
    where organization_id=p_organization_id and order_line_item_id=x.order_line_item_id;
  end loop;

  update public.order_returns
  set status='RECEIVED',received_evidence=p_evidence,received_by_user_id=p_actor_user_id,
      received_at=v_now,version=version+1,updated_at=v_now
  where organization_id=p_organization_id and id=p_return_id;

  select bool_and(returned_quantity=ordered_quantity)
  into v_all_returned
  from public.order_line_fulfillment
  where organization_id=p_organization_id and order_id=r.order_id;

  v_to:=case when v_all_returned then 'RETURNED' else 'PARTIALLY_RETURNED' end;
  v_fulfillment:=v_to;

  update public.orders
  set status=v_to,fulfillment_status=v_fulfillment,version=version+1,
      updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and id=r.order_id;

  v_event:=private.order_engine_event(
    p_organization_id,r.order_id,v_to,o.status,v_to,'USER',p_actor_user_id,
    'oe:'||md5(p_request_key||':event'),v_hash,
    jsonb_build_object('returnId',p_return_id,'evidence',p_evidence)
  );

  perform set_config('app.order_engine_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id,branch_id)
  values (p_organization_id,'USER',p_actor_user_id::text,'ORDER_ENGINE_RETURN_RECEIVED','order_return',p_return_id::text,
    jsonb_build_object('requestHash',v_hash,'orderId',r.order_id,'orderStatus',v_to,'lifecycleEventId',v_event,
      'refundTruthCreated',false,'creditNoteTruthCreated',false),
    p_request_key,o.tenant_business_id,o.branch_id);
  return v_to;
exception when others then perform set_config('app.order_engine_mutation','0',true); raise;
end;
$$;

-- Activate the already-cataloged Order triggers and extend the canonical subject resolver.
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
    else null
  end
  from public.automation_trigger_catalog
  where trigger_key=upper(trim(p_trigger_key));
$$;

update public.automation_trigger_catalog
set availability='AVAILABLE',required_work_package=null,
    description='Canonical ORDER-ENGINE domain event is produced from durable Order lifecycle evidence.'
where trigger_key in ('ORDER_CREATED','ORDER_STATUS_CHANGED')
  and required_work_package='ORDER-ENGINE';

create or replace function public.reconcile_order_automation_events(p_limit integer default 100)
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
    raise exception 'Order automation reconciliation is not permitted';
  end if;

  for e in
    select ole.id,ole.organization_id,ole.order_id,ole.transition,ole.from_status,ole.to_status,ole.evidence,ole.occurred_at
    from public.order_lifecycle_events ole
    where (
      ole.transition='CREATED'
      or (ole.from_status is distinct from ole.to_status and ole.transition<>'CREATED')
    )
    and not exists(
      select 1 from public.audit_logs a
      where a.organization_id=ole.organization_id
        and a.action='ORDER_AUTOMATION_EVENT_PROJECTED'
        and a.correlation_id='order-lifecycle:'||ole.id::text
    )
    order by ole.occurred_at,ole.id
    limit p_limit
  loop
    v_source_key:='order-lifecycle:'||e.id::text;
    v_trigger:=case when e.transition='CREATED' then 'ORDER_CREATED' else 'ORDER_STATUS_CHANGED' end;

    perform pg_advisory_xact_lock(hashtextextended(v_source_key,0));
    if exists(
      select 1 from public.audit_logs a
      where a.organization_id=e.organization_id
        and a.action='ORDER_AUTOMATION_EVENT_PROJECTED'
        and a.correlation_id=v_source_key
    ) then continue; end if;

    v_result:=public.enqueue_automation_runtime_event(
      e.organization_id,v_trigger,v_source_key,'ORDER',e.order_id,
      jsonb_build_object(
        'orderId',e.order_id,'lifecycleEventId',e.id,'transition',e.transition,
        'fromStatus',e.from_status,'toStatus',e.to_status,'evidence',e.evidence
      ),
      e.occurred_at
    );

    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
    ) values (
      e.organization_id,'SYSTEM','order_engine','ORDER_AUTOMATION_EVENT_PROJECTED','order',e.order_id::text,
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

-- Customer 360 V4 composes Order truth over V3 without replacing CRM authority.
create or replace function public.get_crm_customer360_v4(
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
declare v_base jsonb; v_orders jsonb;
begin
  v_base:=public.get_crm_customer360_v3(p_organization_id,p_person_id,p_limit);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'orderNumber',o.order_number,'sourceKind',o.source_kind,'status',o.status,
    'fulfillmentStatus',o.fulfillment_status,'buyerBusinessId',o.buyer_business_id,
    'dealId',o.deal_id,'bookingId',o.booking_id,'quoteId',o.quote_id,
    'ownerUserId',o.owner_user_id,'total',o.total,'currency',o.currency,'updatedAt',o.updated_at
  ) order by o.updated_at desc,o.id),'[]'::jsonb)
  into v_orders
  from (
    select * from public.orders
    where organization_id=p_organization_id and person_id=p_person_id
    order by updated_at desc,id limit p_limit
  ) o;

  v_base:=jsonb_set(v_base,'{orders}',v_orders,true);
  v_base:=jsonb_set(v_base,'{moduleStatus,orders}','"IMPLEMENTED"'::jsonb,true);
  return v_base;
end;
$$;

-- Trusted mutation RPCs stay service-role only. Customer360 remains a scoped authenticated read composition.
revoke all on function public.guard_order_engine_mutation() from public,anon,authenticated,service_role;
revoke all on function private.order_engine_actor_role(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.order_engine_assert_manage(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.order_engine_assert_manager(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.order_engine_is_replay(uuid,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.order_engine_event(uuid,uuid,text,text,text,text,uuid,text,text,jsonb) from public,anon,authenticated,service_role;

grant execute on function private.order_engine_actor_role(uuid,uuid) to service_role;
grant execute on function private.order_engine_assert_manage(uuid,uuid,uuid) to service_role;
grant execute on function private.order_engine_assert_manager(uuid,uuid) to service_role;
grant execute on function private.order_engine_is_replay(uuid,text,text,text,text,text) to service_role;
grant execute on function private.order_engine_event(uuid,uuid,text,text,text,text,uuid,text,text,jsonb) to service_role;

revoke all on function public.create_order_from_quote_v1(uuid,uuid,uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.create_order_from_quote_v1(uuid,uuid,uuid,uuid,uuid,uuid,text) to service_role;

revoke all on function public.create_direct_order_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.create_direct_order_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,jsonb,jsonb,text)
  to service_role;

revoke all on function public.start_order_processing_v1(uuid,uuid,uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.start_order_processing_v1(uuid,uuid,uuid,integer,text) to service_role;

revoke all on function public.record_order_fulfillment_v1(uuid,uuid,uuid,integer,jsonb,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_order_fulfillment_v1(uuid,uuid,uuid,integer,jsonb,jsonb,text) to service_role;

revoke all on function public.cancel_order_v1(uuid,uuid,uuid,integer,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.cancel_order_v1(uuid,uuid,uuid,integer,text,jsonb,text) to service_role;

revoke all on function public.request_order_return_v1(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.request_order_return_v1(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text) to service_role;

revoke all on function public.decide_order_return_v1(uuid,uuid,uuid,text,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.decide_order_return_v1(uuid,uuid,uuid,text,text,jsonb,text) to service_role;

revoke all on function public.receive_order_return_v1(uuid,uuid,uuid,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.receive_order_return_v1(uuid,uuid,uuid,jsonb,text) to service_role;

revoke all on function public.reconcile_order_automation_events(integer)
  from public,anon,authenticated,service_role;
grant execute on function public.reconcile_order_automation_events(integer) to service_role;

revoke all on function public.get_crm_customer360_v4(uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_crm_customer360_v4(uuid,uuid,integer) to authenticated,service_role;
