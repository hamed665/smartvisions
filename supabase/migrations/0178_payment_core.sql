-- 0178: PAYMENT-CORE
-- One provider-agnostic canonical Payment intent/link/transaction/refund authority.
-- PAYMENT-OMAN owns Tap/Thawani adapters, webhook signature verification and real provider activation.

create table public.payment_intents (
  id uuid primary key,
  organization_id uuid not null,
  tenant_business_id uuid not null,
  branch_id uuid,
  invoice_id uuid not null,
  order_id uuid not null,
  person_id uuid,
  buyer_business_id uuid,
  deal_id uuid,
  booking_id uuid,
  owner_user_id uuid not null,
  payment_number text not null,
  status text not null default 'CREATED'
    check (status in (
      'CREATED','AUTHORIZED','RECONCILIATION_REQUIRED','PAID',
      'FAILED','EXPIRED','CANCELLED','PARTIALLY_REFUNDED','REFUNDED'
    )),
  provider text,
  amount numeric(18,4) not null check (amount>0),
  currency text not null,
  authorized_total numeric(18,4) not null default 0 check (authorized_total>=0),
  captured_total numeric(18,4) not null default 0 check (captured_total>=0),
  refunded_total numeric(18,4) not null default 0 check (refunded_total>=0),
  net_paid_total numeric(18,4) generated always as (greatest(captured_total-refunded_total,0::numeric)) stored,
  source_evidence jsonb not null,
  reconciliation_reason text,
  version integer not null default 1 check (version>=1),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,payment_number),
  foreign key (organization_id) references public.organizations(id) on delete cascade,
  foreign key (organization_id,tenant_business_id)
    references public.tenant_businesses(organization_id,id) on delete restrict,
  foreign key (organization_id,branch_id)
    references public.branches(organization_id,id) on delete restrict,
  foreign key (organization_id,invoice_id)
    references public.invoices(organization_id,id) on delete restrict,
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
  foreign key (organization_id,owner_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (payment_number ~ '^P-[A-Z0-9]{16}$'),
  check (currency=upper(btrim(currency)) and currency ~ '^[A-Z]{3}$'),
  check (provider is null or (provider=upper(btrim(provider)) and provider ~ '^[A-Z0-9_-]{2,40}$')),
  check (authorized_total<=amount),
  check (captured_total<=amount),
  check (refunded_total<=captured_total),
  check (jsonb_typeof(source_evidence)='object' and source_evidence<>'{}'::jsonb and octet_length(source_evidence::text)<=32768),
  check (reconciliation_reason is null or length(btrim(reconciliation_reason)) between 3 and 1000)
);
comment on table public.payment_intents is
  'Canonical PAYMENT-CORE collection intent. Invoice remains commercial truth; provider acceptance alone is never settlement truth.';

create unique index payment_intents_one_unresolved_per_invoice_uidx
  on public.payment_intents(organization_id,invoice_id)
  where status in ('CREATED','AUTHORIZED','RECONCILIATION_REQUIRED');
create index payment_intents_business_idx on public.payment_intents(organization_id,tenant_business_id);
create index payment_intents_branch_idx on public.payment_intents(organization_id,branch_id) where branch_id is not null;
create index payment_intents_invoice_idx on public.payment_intents(organization_id,invoice_id,created_at desc,id);
create index payment_intents_order_idx on public.payment_intents(organization_id,order_id);
create index payment_intents_person_idx on public.payment_intents(organization_id,person_id) where person_id is not null;
create index payment_intents_buyer_idx on public.payment_intents(organization_id,buyer_business_id) where buyer_business_id is not null;
create index payment_intents_deal_idx on public.payment_intents(organization_id,deal_id) where deal_id is not null;
create index payment_intents_booking_idx on public.payment_intents(organization_id,booking_id) where booking_id is not null;
create index payment_intents_owner_idx on public.payment_intents(organization_id,owner_user_id);
create index payment_intents_creator_idx on public.payment_intents(organization_id,created_by_user_id);

create table public.payment_links (
  id uuid primary key,
  organization_id uuid not null,
  payment_intent_id uuid not null,
  provider text not null,
  provider_link_id text not null,
  url text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','EXPIRED','CANCELLED','CONSUMED')),
  expires_at timestamptz,
  provider_evidence jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id,payment_intent_id),
  unique (organization_id,provider,provider_link_id),
  foreign key (organization_id,payment_intent_id)
    references public.payment_intents(organization_id,id) on delete restrict,
  check (provider=upper(btrim(provider)) and provider ~ '^[A-Z0-9_-]{2,40}$'),
  check (length(btrim(provider_link_id)) between 1 and 240),
  check (url ~ '^https://[^[:space:]]+$' and length(url)<=4096),
  check (jsonb_typeof(provider_evidence)='object' and provider_evidence<>'{}'::jsonb and octet_length(provider_evidence::text)<=32768)
);
comment on table public.payment_links is
  'Provider-neutral PAYMENT-CORE payment-link evidence. A link is not proof of payment success.';
create index payment_links_intent_idx on public.payment_links(organization_id,payment_intent_id,created_at desc,id);

create table public.payment_refunds (
  id uuid primary key,
  organization_id uuid not null,
  payment_intent_id uuid not null,
  invoice_id uuid not null,
  refund_number text not null,
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED','RECONCILIATION_REQUIRED','SUCCEEDED','FAILED','CANCELLED')),
  amount numeric(18,4) not null check (amount>0),
  currency text not null,
  reason text not null,
  provider text,
  provider_reference text,
  request_evidence jsonb not null,
  requested_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id,payment_intent_id),
  unique (organization_id,refund_number),
  foreign key (organization_id,payment_intent_id)
    references public.payment_intents(organization_id,id) on delete restrict,
  foreign key (organization_id,invoice_id)
    references public.invoices(organization_id,id) on delete restrict,
  foreign key (organization_id,requested_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (refund_number ~ '^R-[A-Z0-9]{16}$'),
  check (currency=upper(btrim(currency)) and currency ~ '^[A-Z]{3}$'),
  check (length(btrim(reason)) between 3 and 2000),
  check (provider is null or (provider=upper(btrim(provider)) and provider ~ '^[A-Z0-9_-]{2,40}$')),
  check (provider_reference is null or length(btrim(provider_reference)) between 1 and 240),
  check (jsonb_typeof(request_evidence)='object' and request_evidence<>'{}'::jsonb and octet_length(request_evidence::text)<=32768)
);
comment on table public.payment_refunds is
  'Canonical refund request/outcome authority. Refund means money movement and is intentionally separate from Invoice Credit Notes.';
create index payment_refunds_intent_idx on public.payment_refunds(organization_id,payment_intent_id,created_at desc,id);
create index payment_refunds_invoice_idx on public.payment_refunds(organization_id,invoice_id,created_at desc,id);
create index payment_refunds_requester_idx on public.payment_refunds(organization_id,requested_by_user_id);

create table public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  payment_intent_id uuid not null,
  refund_id uuid,
  provider text not null,
  provider_event_id text not null,
  event_kind text not null
    check (event_kind in ('AUTHORIZED','CAPTURED','FAILED','EXPIRED','REFUNDED','REFUND_FAILED')),
  authenticity text not null
    check (authenticity in ('VERIFIED_WEBHOOK','EXPLICIT_RECONCILIATION')),
  provider_reference text,
  amount numeric(18,4) not null check (amount>=0),
  currency text not null,
  payload_hash text not null,
  raw_evidence jsonb not null,
  normalized_evidence jsonb not null,
  received_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,provider,provider_event_id),
  foreign key (organization_id,payment_intent_id)
    references public.payment_intents(organization_id,id) on delete restrict,
  foreign key (organization_id,refund_id,payment_intent_id)
    references public.payment_refunds(organization_id,id,payment_intent_id) on delete restrict,
  check (provider=upper(btrim(provider)) and provider ~ '^[A-Z0-9_-]{2,40}$'),
  check (length(btrim(provider_event_id)) between 1 and 240),
  check (provider_reference is null or length(btrim(provider_reference)) between 1 and 240),
  check (currency=upper(btrim(currency)) and currency ~ '^[A-Z]{3}$'),
  check (length(payload_hash)=32),
  check (jsonb_typeof(raw_evidence)='object' and raw_evidence<>'{}'::jsonb and octet_length(raw_evidence::text)<=131072),
  check (jsonb_typeof(normalized_evidence)='object' and normalized_evidence<>'{}'::jsonb and octet_length(normalized_evidence::text)<=32768),
  check ((event_kind in ('REFUNDED','REFUND_FAILED') and refund_id is not null)
      or (event_kind not in ('REFUNDED','REFUND_FAILED') and refund_id is null))
);
comment on table public.payment_provider_events is
  'Immutable verified provider/reconciliation evidence journal. PAYMENT-OMAN adapters authenticate provider callbacks before entering this trusted boundary.';
create index payment_provider_events_intent_idx on public.payment_provider_events(organization_id,payment_intent_id,received_at,id);
create index payment_provider_events_refund_fk_idx on public.payment_provider_events(organization_id,refund_id,payment_intent_id) where refund_id is not null;

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  payment_intent_id uuid not null,
  invoice_id uuid not null,
  refund_id uuid,
  provider_event_id uuid not null,
  transaction_type text not null
    check (transaction_type in ('AUTHORIZED','CAPTURED','FAILED','EXPIRED','REFUNDED','REFUND_FAILED')),
  amount numeric(18,4) not null check (amount>=0),
  currency text not null,
  provider text not null,
  provider_reference text,
  request_key text not null,
  request_hash text not null,
  evidence jsonb not null,
  occurred_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,request_key),
  unique (organization_id,provider_event_id),
  foreign key (organization_id,payment_intent_id)
    references public.payment_intents(organization_id,id) on delete restrict,
  foreign key (organization_id,invoice_id)
    references public.invoices(organization_id,id) on delete restrict,
  foreign key (organization_id,refund_id,payment_intent_id)
    references public.payment_refunds(organization_id,id,payment_intent_id) on delete restrict,
  foreign key (organization_id,provider_event_id)
    references public.payment_provider_events(organization_id,id) on delete restrict,
  check (currency=upper(btrim(currency)) and currency ~ '^[A-Z]{3}$'),
  check (provider=upper(btrim(provider)) and provider ~ '^[A-Z0-9_-]{2,40}$'),
  check (provider_reference is null or length(btrim(provider_reference)) between 1 and 240),
  check (length(btrim(request_key)) between 8 and 300),
  check (length(request_hash)=32),
  check (jsonb_typeof(evidence)='object' and evidence<>'{}'::jsonb and octet_length(evidence::text)<=32768),
  check ((transaction_type in ('REFUNDED','REFUND_FAILED') and refund_id is not null)
      or (transaction_type not in ('REFUNDED','REFUND_FAILED') and refund_id is null))
);
comment on table public.payment_transactions is
  'Immutable PAYMENT-CORE transaction ledger. CAPTURED and REFUNDED rows are the canonical money-movement evidence used for Invoice settlement projection.';
create index payment_transactions_intent_idx on public.payment_transactions(organization_id,payment_intent_id,occurred_at,id);
create index payment_transactions_invoice_idx on public.payment_transactions(organization_id,invoice_id,occurred_at,id);
create index payment_transactions_refund_fk_idx on public.payment_transactions(organization_id,refund_id,payment_intent_id) where refund_id is not null;
create index payment_transactions_provider_event_fk_idx on public.payment_transactions(organization_id,provider_event_id);

alter table public.payment_intents enable row level security;
alter table public.payment_links enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.payment_provider_events enable row level security;
alter table public.payment_transactions enable row level security;

create policy payment_intents_member_read on public.payment_intents for select to authenticated
  using ((select public.is_org_member(organization_id)));
create policy payment_links_member_read on public.payment_links for select to authenticated
  using ((select public.is_org_member(organization_id)));
create policy payment_refunds_member_read on public.payment_refunds for select to authenticated
  using ((select public.is_org_member(organization_id)));
create policy payment_provider_events_member_read on public.payment_provider_events for select to authenticated
  using ((select public.is_org_member(organization_id)));
create policy payment_transactions_member_read on public.payment_transactions for select to authenticated
  using ((select public.is_org_member(organization_id)));

revoke all on table
  public.payment_intents,public.payment_links,public.payment_refunds,
  public.payment_provider_events,public.payment_transactions
from public,anon,authenticated,service_role;

grant select on table
  public.payment_intents,public.payment_links,public.payment_refunds,
  public.payment_provider_events,public.payment_transactions
to authenticated;

grant select,insert,update on table public.payment_intents,public.payment_links,public.payment_refunds to service_role;
grant select,insert on table public.payment_provider_events,public.payment_transactions to service_role;

create or replace function public.guard_payment_core_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if coalesce(current_setting('app.payment_core_mutation',true),'')<>'allowed' then
    raise exception 'PAYMENT-CORE state requires governed command';
  end if;

  if tg_table_name in ('payment_provider_events','payment_transactions') and tg_op<>'INSERT' then
    raise exception 'PAYMENT-CORE immutable provider/transaction evidence cannot be changed';
  end if;

  if tg_table_name='payment_intents' then
    if tg_op='DELETE' then raise exception 'PAYMENT-CORE Payment Intent cannot be deleted'; end if;
    if tg_op='UPDATE' and row(
      new.organization_id,new.tenant_business_id,new.branch_id,new.invoice_id,new.order_id,
      new.person_id,new.buyer_business_id,new.deal_id,new.booking_id,new.owner_user_id,
      new.payment_number,new.amount,new.currency,new.source_evidence,new.created_by_user_id,new.created_at
    ) is distinct from row(
      old.organization_id,old.tenant_business_id,old.branch_id,old.invoice_id,old.order_id,
      old.person_id,old.buyer_business_id,old.deal_id,old.booking_id,old.owner_user_id,
      old.payment_number,old.amount,old.currency,old.source_evidence,old.created_by_user_id,old.created_at
    ) then raise exception 'PAYMENT-CORE Payment Intent commercial source is immutable'; end if;
  end if;

  if tg_table_name='payment_links' then
    if tg_op='DELETE' then raise exception 'PAYMENT-CORE Payment Link cannot be deleted'; end if;
    if tg_op='UPDATE' and row(
      new.organization_id,new.payment_intent_id,new.provider,new.provider_link_id,new.url,new.provider_evidence,new.created_at
    ) is distinct from row(
      old.organization_id,old.payment_intent_id,old.provider,old.provider_link_id,old.url,old.provider_evidence,old.created_at
    ) then raise exception 'PAYMENT-CORE Payment Link provider evidence is immutable'; end if;
  end if;

  if tg_table_name='payment_refunds' then
    if tg_op='DELETE' then raise exception 'PAYMENT-CORE Refund cannot be deleted'; end if;
    if tg_op='UPDATE' and row(
      new.organization_id,new.payment_intent_id,new.invoice_id,new.refund_number,new.amount,new.currency,
      new.reason,new.request_evidence,new.requested_by_user_id,new.created_at
    ) is distinct from row(
      old.organization_id,old.payment_intent_id,old.invoice_id,old.refund_number,old.amount,old.currency,
      old.reason,old.request_evidence,old.requested_by_user_id,old.created_at
    ) then raise exception 'PAYMENT-CORE Refund request evidence is immutable'; end if;
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger payment_intents_guard before insert or update or delete on public.payment_intents
for each row execute function public.guard_payment_core_mutation();
create trigger payment_links_guard before insert or update or delete on public.payment_links
for each row execute function public.guard_payment_core_mutation();
create trigger payment_refunds_guard before insert or update or delete on public.payment_refunds
for each row execute function public.guard_payment_core_mutation();
create trigger payment_provider_events_guard before insert or update or delete on public.payment_provider_events
for each row execute function public.guard_payment_core_mutation();
create trigger payment_transactions_guard before insert or update or delete on public.payment_transactions
for each row execute function public.guard_payment_core_mutation();

-- PAYMENT-CORE takes the previously reserved paid_total projection without weakening
-- INVOICE-ENGINE commercial immutability.
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
    if tg_op='DELETE' then raise exception 'INVOICE-ENGINE Invoice cannot be deleted'; end if;
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
      ) then raise exception 'INVOICE-ENGINE immutable commercial source cannot be rewritten'; end if;
      if old.document_snapshot is not null and new.document_snapshot is distinct from old.document_snapshot then
        raise exception 'INVOICE-ENGINE issued document snapshot is immutable';
      end if;
      if new.paid_total is distinct from old.paid_total
         and coalesce(current_setting('app.payment_core_projection',true),'')<>'allowed'
      then
        raise exception 'INVOICE-ENGINE paid balance is PAYMENT-CORE governed settlement projection';
      end if;
      if new.credited_total<old.credited_total then
        raise exception 'INVOICE-ENGINE credited balance evidence cannot decrease';
      end if;
      if new.status='VOID' and old.status<>'VOID'
         and exists(
           select 1 from public.payment_intents pi
           where pi.organization_id=new.organization_id and pi.invoice_id=new.id
             and pi.status in ('CREATED','AUTHORIZED','RECONCILIATION_REQUIRED')
         )
      then raise exception 'INVOICE-ENGINE Invoice with unresolved Payment Intent cannot be voided'; end if;
      if new.credited_total>old.credited_total and exists(
        select 1 from public.payment_intents pi
        where pi.organization_id=new.organization_id and pi.invoice_id=new.id
          and pi.status in ('CREATED','AUTHORIZED','RECONCILIATION_REQUIRED')
          and pi.amount > greatest(new.total-new.paid_total-new.credited_total,0::numeric)
      ) then raise exception 'INVOICE-ENGINE Credit Note conflicts with unresolved Payment Intent reservation'; end if;
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create unique index payment_core_audit_request_uidx
  on public.audit_logs(organization_id,action,entity_type,entity_id,correlation_id)
  where action like 'PAYMENT_CORE_%' and correlation_id is not null;

create unique index payment_automation_projection_uidx
  on public.audit_logs(organization_id,action,correlation_id)
  where action='PAYMENT_AUTOMATION_EVENT_PROJECTED' and correlation_id is not null;

create or replace function private.payment_core_actor_role(p_organization_id uuid,p_actor_user_id uuid)
returns text language sql stable security invoker set search_path=public,pg_catalog
as $$
  select m.role from public.organization_members m
  where m.organization_id=p_organization_id and m.user_id=p_actor_user_id limit 1
$$;

create or replace function private.payment_core_assert_manage(
  p_organization_id uuid,p_actor_user_id uuid,p_owner_user_id uuid
)
returns void language plpgsql security invoker set search_path=public,private,pg_catalog
as $$
declare v_role text;
begin
  if p_organization_id is null or p_actor_user_id is null or p_owner_user_id is null then
    raise exception 'PAYMENT-CORE Organization, actor and owner are required';
  end if;
  v_role:=private.payment_core_actor_role(p_organization_id,p_actor_user_id);
  if v_role not in ('OWNER','ADMIN','SALES_MANAGER')
     and not (v_role='SALES_AGENT' and p_owner_user_id=p_actor_user_id)
  then raise exception 'PAYMENT-CORE mutation is not permitted for actor'; end if;
end;
$$;

create or replace function private.payment_core_assert_manager(p_organization_id uuid,p_actor_user_id uuid)
returns void language plpgsql security invoker set search_path=public,private,pg_catalog
as $$
begin
  if private.payment_core_actor_role(p_organization_id,p_actor_user_id) not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'PAYMENT-CORE manager permission is required';
  end if;
end;
$$;

create or replace function private.payment_core_is_replay(
  p_organization_id uuid,p_action text,p_entity_type text,p_entity_id text,p_request_key text,p_request_hash text
)
returns boolean language plpgsql security invoker set search_path=public,pg_catalog
as $$
declare v_hash text;
begin
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 240 then
    raise exception 'PAYMENT-CORE request key is invalid';
  end if;
  select a.after_data->>'requestHash' into v_hash
  from public.audit_logs a
  where a.organization_id=p_organization_id and a.action=p_action
    and a.entity_type=p_entity_type and a.entity_id=p_entity_id and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc limit 1;
  if v_hash is null then return false; end if;
  if v_hash<>p_request_hash then raise exception 'PAYMENT-CORE request key conflict'; end if;
  return true;
end;
$$;

create or replace function public.create_payment_intent_v1(
  p_organization_id uuid,p_actor_user_id uuid,p_payment_intent_id uuid,p_invoice_id uuid,
  p_amount numeric,p_request_key text
)
returns uuid
language plpgsql security invoker set search_path=public,private,pg_catalog
as $$
declare
  i public.invoices%rowtype;
  v_existing public.payment_intents%rowtype;
  v_hash text;
  v_number text;
begin
  if p_payment_intent_id is null or p_invoice_id is null or p_amount is null or p_amount<=0 then
    raise exception 'PAYMENT-CORE Payment Intent, Invoice and positive amount are required';
  end if;
  select * into i from public.invoices
  where organization_id=p_organization_id and id=p_invoice_id
  for update;
  if not found then raise exception 'PAYMENT-CORE Invoice not found'; end if;
  perform private.payment_core_assert_manage(p_organization_id,p_actor_user_id,i.owner_user_id);

  v_hash:=md5(jsonb_build_object('paymentIntentId',p_payment_intent_id,'invoiceId',p_invoice_id,'amount',p_amount)::text);
  if private.payment_core_is_replay(
    p_organization_id,'PAYMENT_CORE_INTENT_CREATED','payment_intent',p_payment_intent_id::text,p_request_key,v_hash
  ) then return p_payment_intent_id; end if;

  if i.status not in ('ISSUED','OVERDUE') then raise exception 'PAYMENT-CORE Invoice must be issued and collectible'; end if;
  if i.balance_due<=0 then raise exception 'PAYMENT-CORE Invoice has no collectible balance'; end if;
  if p_amount>i.balance_due then raise exception 'PAYMENT-CORE Payment Intent exceeds current Invoice balance'; end if;

  select * into v_existing from public.payment_intents
  where organization_id=p_organization_id and invoice_id=p_invoice_id
    and status in ('CREATED','AUTHORIZED','RECONCILIATION_REQUIRED')
  for update;
  if found then
    if v_existing.amount=p_amount and v_existing.currency=i.currency then return v_existing.id; end if;
    raise exception 'PAYMENT-CORE Invoice already has an unresolved Payment Intent';
  end if;

  v_number:='P-'||upper(right(replace(p_payment_intent_id::text,'-',''),16));
  perform set_config('app.payment_core_mutation','allowed',true);
  insert into public.payment_intents(
    id,organization_id,tenant_business_id,branch_id,invoice_id,order_id,person_id,buyer_business_id,
    deal_id,booking_id,owner_user_id,payment_number,status,amount,currency,source_evidence,
    created_by_user_id
  ) values (
    p_payment_intent_id,p_organization_id,i.tenant_business_id,i.branch_id,i.id,i.order_id,i.person_id,i.buyer_business_id,
    i.deal_id,i.booking_id,i.owner_user_id,v_number,'CREATED',p_amount,i.currency,
    jsonb_build_object('source','INVOICE','invoiceId',i.id,'invoiceNumber',i.invoice_number,
      'invoiceVersion',i.version,'invoiceTotal',i.total,'paidTotal',i.paid_total,
      'creditedTotal',i.credited_total,'balanceDue',i.balance_due),
    p_actor_user_id
  );
  perform set_config('app.payment_core_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,
    correlation_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'PAYMENT_CORE_INTENT_CREATED','payment_intent',p_payment_intent_id::text,
    jsonb_build_object('requestHash',v_hash,'invoiceId',i.id,'paymentNumber',v_number,
      'amount',p_amount,'currency',i.currency,'providerSuccessAssumed',false),
    p_request_key,i.tenant_business_id,i.branch_id
  );
  return p_payment_intent_id;
exception when others then
  perform set_config('app.payment_core_mutation','0',true);
  raise;
end;
$$;

create or replace function public.cancel_payment_intent_v1(
  p_organization_id uuid,p_actor_user_id uuid,p_payment_intent_id uuid,p_reason text,p_request_key text
)
returns text
language plpgsql security invoker set search_path=public,private,pg_catalog
as $$
declare p public.payment_intents%rowtype; v_hash text;
begin
  select * into p from public.payment_intents
  where organization_id=p_organization_id and id=p_payment_intent_id for update;
  if not found then raise exception 'PAYMENT-CORE Payment Intent not found'; end if;
  perform private.payment_core_assert_manage(p_organization_id,p_actor_user_id,p.owner_user_id);
  if length(btrim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'PAYMENT-CORE cancellation reason is invalid'; end if;
  v_hash:=md5(jsonb_build_object('paymentIntentId',p_payment_intent_id,'reason',btrim(p_reason))::text);
  if private.payment_core_is_replay(
    p_organization_id,'PAYMENT_CORE_INTENT_CANCELLED','payment_intent',p_payment_intent_id::text,p_request_key,v_hash
  ) then return 'CANCELLED'; end if;
  if p.captured_total>0 then raise exception 'PAYMENT-CORE captured Payment Intent cannot be cancelled'; end if;
  if p.status not in ('CREATED','AUTHORIZED','RECONCILIATION_REQUIRED') then
    raise exception 'PAYMENT-CORE Payment Intent is not cancellable from status %',p.status;
  end if;
  perform set_config('app.payment_core_mutation','allowed',true);
  update public.payment_intents
  set status='CANCELLED',reconciliation_reason=null,version=version+1,updated_at=statement_timestamp()
  where organization_id=p_organization_id and id=p_payment_intent_id;
  update public.payment_links
  set status='CANCELLED',updated_at=statement_timestamp()
  where organization_id=p_organization_id and payment_intent_id=p_payment_intent_id and status='ACTIVE';
  perform set_config('app.payment_core_mutation','0',true);
  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,
    tenant_business_id,branch_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'PAYMENT_CORE_INTENT_CANCELLED','payment_intent',p_payment_intent_id::text,
    jsonb_build_object('requestHash',v_hash,'reason',btrim(p_reason),'moneyMoved',false),
    p_request_key,p.tenant_business_id,p.branch_id
  );
  return 'CANCELLED';
exception when others then
  perform set_config('app.payment_core_mutation','0',true);
  raise;
end;
$$;

create or replace function public.record_payment_link_v1(
  p_organization_id uuid,p_payment_link_id uuid,p_payment_intent_id uuid,p_provider text,
  p_provider_link_id text,p_url text,p_expires_at timestamptz,p_provider_evidence jsonb,p_request_key text
)
returns uuid
language plpgsql security invoker set search_path=public,private,pg_catalog
as $$
declare p public.payment_intents%rowtype; v_provider text:=upper(btrim(coalesce(p_provider,''))); v_hash text;
begin
  if current_user<>'service_role' then raise exception 'PAYMENT-CORE Payment Link recording is service-only'; end if;
  if p_payment_link_id is null or length(v_provider) not between 2 and 40
     or length(btrim(coalesce(p_provider_link_id,''))) not between 1 and 240
     or coalesce(p_url,'')!~'^https://[^[:space:]]+$'
     or p_provider_evidence is null or jsonb_typeof(p_provider_evidence)<>'object' or p_provider_evidence='{}'::jsonb
  then raise exception 'PAYMENT-CORE Payment Link provider evidence is invalid'; end if;
  select * into p from public.payment_intents where organization_id=p_organization_id and id=p_payment_intent_id for update;
  if not found then raise exception 'PAYMENT-CORE Payment Intent not found'; end if;
  if p.status not in ('CREATED','AUTHORIZED','RECONCILIATION_REQUIRED') then
    raise exception 'PAYMENT-CORE Payment Link requires unresolved Payment Intent';
  end if;
  if p.provider is not null and p.provider<>v_provider then raise exception 'PAYMENT-CORE Payment Intent provider is already bound'; end if;
  v_hash:=md5(jsonb_build_object(
    'paymentLinkId',p_payment_link_id,'paymentIntentId',p_payment_intent_id,'provider',v_provider,
    'providerLinkId',p_provider_link_id,'url',p_url,'expiresAt',p_expires_at,'evidence',p_provider_evidence
  )::text);
  if private.payment_core_is_replay(
    p_organization_id,'PAYMENT_CORE_LINK_RECORDED','payment_link',p_payment_link_id::text,p_request_key,v_hash
  ) then return p_payment_link_id; end if;
  perform set_config('app.payment_core_mutation','allowed',true);
  update public.payment_intents set provider=v_provider,version=version+1,updated_at=statement_timestamp()
  where organization_id=p_organization_id and id=p_payment_intent_id and provider is null;
  insert into public.payment_links(
    id,organization_id,payment_intent_id,provider,provider_link_id,url,status,expires_at,provider_evidence
  ) values (
    p_payment_link_id,p_organization_id,p_payment_intent_id,v_provider,btrim(p_provider_link_id),p_url,'ACTIVE',p_expires_at,p_provider_evidence
  );
  perform set_config('app.payment_core_mutation','0',true);
  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,
    correlation_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'SYSTEM','payment_provider_adapter','PAYMENT_CORE_LINK_RECORDED','payment_link',p_payment_link_id::text,
    jsonb_build_object('requestHash',v_hash,'paymentIntentId',p_payment_intent_id,'provider',v_provider,
      'providerAcceptedLink',true,'settlementProven',false),
    p_request_key,p.tenant_business_id,p.branch_id
  );
  return p_payment_link_id;
exception when others then
  perform set_config('app.payment_core_mutation','0',true);
  raise;
end;
$$;

create or replace function public.mark_payment_intent_reconciliation_required_v1(
  p_organization_id uuid,p_payment_intent_id uuid,p_provider text,p_reason text,p_evidence jsonb,p_request_key text
)
returns text
language plpgsql security invoker set search_path=public,private,pg_catalog
as $$
declare p public.payment_intents%rowtype; v_provider text:=upper(btrim(coalesce(p_provider,''))); v_hash text;
begin
  if current_user<>'service_role' then raise exception 'PAYMENT-CORE reconciliation marking is service-only'; end if;
  if length(v_provider) not between 2 and 40 or length(btrim(coalesce(p_reason,''))) not between 3 and 1000
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb
  then raise exception 'PAYMENT-CORE reconciliation evidence is invalid'; end if;
  select * into p from public.payment_intents where organization_id=p_organization_id and id=p_payment_intent_id for update;
  if not found then raise exception 'PAYMENT-CORE Payment Intent not found'; end if;
  v_hash:=md5(jsonb_build_object('paymentIntentId',p_payment_intent_id,'provider',v_provider,'reason',btrim(p_reason),'evidence',p_evidence)::text);
  if private.payment_core_is_replay(
    p_organization_id,'PAYMENT_CORE_RECONCILIATION_REQUIRED','payment_intent',p_payment_intent_id::text,p_request_key,v_hash
  ) then return 'RECONCILIATION_REQUIRED'; end if;
  if p.status not in ('CREATED','AUTHORIZED','RECONCILIATION_REQUIRED') then
    raise exception 'PAYMENT-CORE terminal Payment Intent cannot be marked ambiguous';
  end if;
  if p.provider is not null and p.provider<>v_provider then raise exception 'PAYMENT-CORE Payment Intent provider is already bound'; end if;
  perform set_config('app.payment_core_mutation','allowed',true);
  update public.payment_intents
  set provider=coalesce(provider,v_provider),status='RECONCILIATION_REQUIRED',
      reconciliation_reason=btrim(p_reason),version=version+1,updated_at=statement_timestamp()
  where organization_id=p_organization_id and id=p_payment_intent_id;
  perform set_config('app.payment_core_mutation','0',true);
  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,
    correlation_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'SYSTEM','payment_provider_adapter','PAYMENT_CORE_RECONCILIATION_REQUIRED',
    'payment_intent',p_payment_intent_id::text,
    jsonb_build_object('requestHash',v_hash,'provider',v_provider,'reason',btrim(p_reason),
      'paymentSuccessAssumed',false,'requiresVerifiedProviderEvidence',true),
    p_request_key,p.tenant_business_id,p.branch_id
  );
  return 'RECONCILIATION_REQUIRED';
exception when others then
  perform set_config('app.payment_core_mutation','0',true);
  raise;
end;
$$;

create or replace function public.request_payment_refund_v1(
  p_organization_id uuid,p_actor_user_id uuid,p_refund_id uuid,p_payment_intent_id uuid,
  p_amount numeric,p_reason text,p_evidence jsonb,p_request_key text
)
returns uuid
language plpgsql security invoker set search_path=public,private,pg_catalog
as $$
declare p public.payment_intents%rowtype; v_open numeric(18,4); v_hash text; v_number text;
begin
  if p_refund_id is null or p_amount is null or p_amount<=0
     or length(btrim(coalesce(p_reason,''))) not between 3 and 2000
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb
  then raise exception 'PAYMENT-CORE Refund request is invalid'; end if;
  select * into p from public.payment_intents
  where organization_id=p_organization_id and id=p_payment_intent_id for update;
  if not found then raise exception 'PAYMENT-CORE Payment Intent not found'; end if;
  perform private.payment_core_assert_manager(p_organization_id,p_actor_user_id);
  v_hash:=md5(jsonb_build_object('refundId',p_refund_id,'paymentIntentId',p_payment_intent_id,
    'amount',p_amount,'reason',btrim(p_reason),'evidence',p_evidence)::text);
  if private.payment_core_is_replay(
    p_organization_id,'PAYMENT_CORE_REFUND_REQUESTED','payment_refund',p_refund_id::text,p_request_key,v_hash
  ) then return p_refund_id; end if;
  if p.captured_total<=p.refunded_total then raise exception 'PAYMENT-CORE Payment Intent has no refundable settlement'; end if;
  select coalesce(sum(r.amount),0) into v_open
  from public.payment_refunds r
  where r.organization_id=p_organization_id and r.payment_intent_id=p_payment_intent_id
    and r.status in ('REQUESTED','RECONCILIATION_REQUIRED');
  if p_amount>p.captured_total-p.refunded_total-v_open then
    raise exception 'PAYMENT-CORE Refund exceeds remaining refundable settlement';
  end if;
  v_number:='R-'||upper(right(replace(p_refund_id::text,'-',''),16));
  perform set_config('app.payment_core_mutation','allowed',true);
  insert into public.payment_refunds(
    id,organization_id,payment_intent_id,invoice_id,refund_number,status,amount,currency,
    reason,request_evidence,requested_by_user_id
  ) values (
    p_refund_id,p_organization_id,p_payment_intent_id,p.invoice_id,v_number,'REQUESTED',p_amount,p.currency,
    btrim(p_reason),p_evidence,p_actor_user_id
  );
  perform set_config('app.payment_core_mutation','0',true);
  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,
    correlation_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'PAYMENT_CORE_REFUND_REQUESTED','payment_refund',p_refund_id::text,
    jsonb_build_object('requestHash',v_hash,'paymentIntentId',p_payment_intent_id,'invoiceId',p.invoice_id,
      'amount',p_amount,'currency',p.currency,'providerRefundSucceeded',false,'creditNoteCreated',false),
    p_request_key,p.tenant_business_id,p.branch_id
  );
  return p_refund_id;
exception when others then
  perform set_config('app.payment_core_mutation','0',true);
  raise;
end;
$$;

create or replace function public.record_payment_provider_event_v1(
  p_organization_id uuid,p_payment_intent_id uuid,p_refund_id uuid,p_provider text,
  p_provider_event_id text,p_event_kind text,p_provider_reference text,p_amount numeric,
  p_currency text,p_authenticity text,p_raw_evidence jsonb,p_normalized_evidence jsonb,p_request_key text
)
returns jsonb
language plpgsql security invoker set search_path=public,private,pg_catalog
as $$
declare
  p public.payment_intents%rowtype;
  i public.invoices%rowtype;
  r public.payment_refunds%rowtype;
  pe public.payment_provider_events%rowtype;
  v_provider text:=upper(btrim(coalesce(p_provider,'')));
  v_kind text:=upper(btrim(coalesce(p_event_kind,'')));
  v_auth text:=upper(btrim(coalesce(p_authenticity,'')));
  v_currency text:=upper(btrim(coalesce(p_currency,'')));
  v_hash text;
  v_tx uuid;
  v_new_status text;
begin
  if current_user<>'service_role' then raise exception 'PAYMENT-CORE provider event ingestion is service-only'; end if;
  if length(v_provider) not between 2 and 40
     or length(btrim(coalesce(p_provider_event_id,''))) not between 1 and 240
     or v_kind not in ('AUTHORIZED','CAPTURED','FAILED','EXPIRED','REFUNDED','REFUND_FAILED')
     or v_auth not in ('VERIFIED_WEBHOOK','EXPLICIT_RECONCILIATION')
     or p_amount is null or p_amount<0
     or p_raw_evidence is null or jsonb_typeof(p_raw_evidence)<>'object' or p_raw_evidence='{}'::jsonb
     or p_normalized_evidence is null or jsonb_typeof(p_normalized_evidence)<>'object' or p_normalized_evidence='{}'::jsonb
  then raise exception 'PAYMENT-CORE verified provider event contract is invalid'; end if;

  select * into p from public.payment_intents
  where organization_id=p_organization_id and id=p_payment_intent_id for update;
  if not found then raise exception 'PAYMENT-CORE Payment Intent not found'; end if;
  select * into i from public.invoices
  where organization_id=p_organization_id and id=p.invoice_id for update;
  if not found then raise exception 'PAYMENT-CORE Invoice not found'; end if;
  if v_currency<>p.currency then raise exception 'PAYMENT-CORE provider event currency mismatch'; end if;
  if p.provider is not null and p.provider<>v_provider then raise exception 'PAYMENT-CORE Payment Intent provider mismatch'; end if;

  if v_kind in ('REFUNDED','REFUND_FAILED') then
    if p_refund_id is null then raise exception 'PAYMENT-CORE refund event requires Refund'; end if;
    select * into r from public.payment_refunds
    where organization_id=p_organization_id and id=p_refund_id and payment_intent_id=p_payment_intent_id
    for update;
    if not found then raise exception 'PAYMENT-CORE Refund not found for Payment Intent'; end if;
  elsif p_refund_id is not null then
    raise exception 'PAYMENT-CORE non-refund event cannot reference Refund';
  end if;

  v_hash:=md5(jsonb_build_object(
    'paymentIntentId',p_payment_intent_id,'refundId',p_refund_id,'provider',v_provider,
    'providerEventId',btrim(p_provider_event_id),'kind',v_kind,'providerReference',p_provider_reference,
    'amount',p_amount,'currency',v_currency,'authenticity',v_auth,
    'rawEvidence',p_raw_evidence,'normalizedEvidence',p_normalized_evidence
  )::text);

  perform set_config('app.payment_core_mutation','allowed',true);
  insert into public.payment_provider_events(
    organization_id,payment_intent_id,refund_id,provider,provider_event_id,event_kind,authenticity,
    provider_reference,amount,currency,payload_hash,raw_evidence,normalized_evidence
  ) values (
    p_organization_id,p_payment_intent_id,p_refund_id,v_provider,btrim(p_provider_event_id),v_kind,v_auth,
    nullif(btrim(coalesce(p_provider_reference,'')),''),p_amount,v_currency,v_hash,p_raw_evidence,p_normalized_evidence
  )
  on conflict (organization_id,provider,provider_event_id) do nothing
  returning * into pe;

  if pe.id is null then
    select * into pe from public.payment_provider_events
    where organization_id=p_organization_id and provider=v_provider and provider_event_id=btrim(p_provider_event_id);
    perform set_config('app.payment_core_mutation','0',true);
    if pe.payment_intent_id<>p_payment_intent_id
       or pe.refund_id is distinct from p_refund_id
       or pe.event_kind<>v_kind or pe.payload_hash<>v_hash
    then raise exception 'PAYMENT-CORE provider event replay conflict'; end if;
    select id into v_tx from public.payment_transactions
    where organization_id=p_organization_id and provider_event_id=pe.id;
    return jsonb_build_object('providerEventId',pe.id,'transactionId',v_tx,'replayed',true,
      'paymentIntentStatus',p.status,'invoicePaidTotal',i.paid_total);
  end if;

  if v_kind='AUTHORIZED' then
    if p_amount<>p.amount then raise exception 'PAYMENT-CORE authorization must match Payment Intent amount'; end if;
    if p.status not in ('CREATED','AUTHORIZED','RECONCILIATION_REQUIRED') then
      raise exception 'PAYMENT-CORE Payment Intent cannot be authorized from status %',p.status;
    end if;
    update public.payment_intents set
      provider=coalesce(provider,v_provider),authorized_total=p.amount,status='AUTHORIZED',
      reconciliation_reason=null,version=version+1,updated_at=statement_timestamp()
    where organization_id=p_organization_id and id=p_payment_intent_id;
  elsif v_kind='CAPTURED' then
    if p_amount<>p.amount or p.captured_total<>0 then
      raise exception 'PAYMENT-CORE each Payment Intent requires one exact capture; use a smaller Intent for partial Invoice payment';
    end if;
    if p.status not in ('CREATED','AUTHORIZED','RECONCILIATION_REQUIRED') then
      raise exception 'PAYMENT-CORE Payment Intent cannot be captured from status %',p.status;
    end if;
    if i.status not in ('ISSUED','OVERDUE') then raise exception 'PAYMENT-CORE Invoice is not collectible'; end if;
    if i.paid_total+i.credited_total+p_amount>i.total then raise exception 'PAYMENT-CORE capture would over-settle Invoice'; end if;
    update public.payment_intents set
      provider=coalesce(provider,v_provider),authorized_total=greatest(authorized_total,p_amount),
      captured_total=p_amount,status='PAID',reconciliation_reason=null,
      version=version+1,updated_at=statement_timestamp()
    where organization_id=p_organization_id and id=p_payment_intent_id;
    perform set_config('app.invoice_engine_mutation','allowed',true);
    perform set_config('app.payment_core_projection','allowed',true);
    update public.invoices set paid_total=paid_total+p_amount,version=version+1,updated_at=statement_timestamp()
    where organization_id=p_organization_id and id=p.invoice_id;
    perform set_config('app.payment_core_projection','0',true);
    perform set_config('app.invoice_engine_mutation','0',true);
    update public.payment_links set status='CONSUMED',updated_at=statement_timestamp()
    where organization_id=p_organization_id and payment_intent_id=p_payment_intent_id and status='ACTIVE';
  elsif v_kind in ('FAILED','EXPIRED') then
    if p.captured_total>0 then raise exception 'PAYMENT-CORE settled Payment Intent cannot become failed/expired'; end if;
    if p.status not in ('CREATED','AUTHORIZED','RECONCILIATION_REQUIRED') then
      raise exception 'PAYMENT-CORE Payment Intent cannot become failed/expired from status %',p.status;
    end if;
    v_new_status:=case when v_kind='FAILED' then 'FAILED' else 'EXPIRED' end;
    update public.payment_intents set provider=coalesce(provider,v_provider),status=v_new_status,
      reconciliation_reason=null,version=version+1,updated_at=statement_timestamp()
    where organization_id=p_organization_id and id=p_payment_intent_id;
    update public.payment_links set status=case when v_kind='EXPIRED' then 'EXPIRED' else 'CANCELLED' end,
      updated_at=statement_timestamp()
    where organization_id=p_organization_id and payment_intent_id=p_payment_intent_id and status='ACTIVE';
  elsif v_kind='REFUNDED' then
    if r.status not in ('REQUESTED','RECONCILIATION_REQUIRED') then
      raise exception 'PAYMENT-CORE Refund cannot succeed from status %',r.status;
    end if;
    if p_amount<>r.amount then raise exception 'PAYMENT-CORE provider Refund amount must match canonical Refund request'; end if;
    if p.refunded_total+p_amount>p.captured_total or i.paid_total<p_amount then
      raise exception 'PAYMENT-CORE provider Refund exceeds settled money';
    end if;
    update public.payment_refunds set status='SUCCEEDED',provider=v_provider,
      provider_reference=nullif(btrim(coalesce(p_provider_reference,'')),''),
      updated_at=statement_timestamp()
    where organization_id=p_organization_id and id=p_refund_id;
    update public.payment_intents set refunded_total=refunded_total+p_amount,
      status=case when refunded_total+p_amount=captured_total then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,
      version=version+1,updated_at=statement_timestamp()
    where organization_id=p_organization_id and id=p_payment_intent_id;
    perform set_config('app.invoice_engine_mutation','allowed',true);
    perform set_config('app.payment_core_projection','allowed',true);
    update public.invoices set paid_total=paid_total-p_amount,version=version+1,updated_at=statement_timestamp()
    where organization_id=p_organization_id and id=p.invoice_id;
    perform set_config('app.payment_core_projection','0',true);
    perform set_config('app.invoice_engine_mutation','0',true);
  elsif v_kind='REFUND_FAILED' then
    if r.status not in ('REQUESTED','RECONCILIATION_REQUIRED') then
      raise exception 'PAYMENT-CORE Refund cannot fail from status %',r.status;
    end if;
    if p_amount<>r.amount then raise exception 'PAYMENT-CORE provider Refund failure amount must match canonical Refund request'; end if;
    update public.payment_refunds set status='FAILED',provider=v_provider,
      provider_reference=nullif(btrim(coalesce(p_provider_reference,'')),''),
      updated_at=statement_timestamp()
    where organization_id=p_organization_id and id=p_refund_id;
  end if;

  insert into public.payment_transactions(
    organization_id,payment_intent_id,invoice_id,refund_id,provider_event_id,transaction_type,
    amount,currency,provider,provider_reference,request_key,request_hash,evidence
  ) values (
    p_organization_id,p_payment_intent_id,p.invoice_id,p_refund_id,pe.id,v_kind,p_amount,v_currency,v_provider,
    nullif(btrim(coalesce(p_provider_reference,'')),''),
    'payment-provider-event:'||v_provider||':'||btrim(p_provider_event_id),v_hash,
    jsonb_build_object('authenticity',v_auth,'providerEventId',pe.id,'normalized',p_normalized_evidence)
  ) returning id into v_tx;

  perform set_config('app.payment_core_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,
    correlation_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'SYSTEM','payment_provider_evidence','PAYMENT_CORE_PROVIDER_EVENT_APPLIED',
    'payment_transaction',v_tx::text,
    jsonb_build_object('requestHash',v_hash,'paymentIntentId',p_payment_intent_id,'refundId',p_refund_id,
      'provider',v_provider,'eventKind',v_kind,'authenticity',v_auth,'providerEventId',pe.id,
      'settlementProjectionApplied',v_kind in ('CAPTURED','REFUNDED')),
    p_request_key,p.tenant_business_id,p.branch_id
  );

  select status into v_new_status from public.payment_intents
  where organization_id=p_organization_id and id=p_payment_intent_id;
  select * into i from public.invoices where organization_id=p_organization_id and id=p.invoice_id;
  return jsonb_build_object('providerEventId',pe.id,'transactionId',v_tx,'replayed',false,
    'paymentIntentStatus',v_new_status,'invoicePaidTotal',i.paid_total,'invoiceBalanceDue',i.balance_due);
exception when others then
  perform set_config('app.payment_core_projection','0',true);
  perform set_config('app.invoice_engine_mutation','0',true);
  perform set_config('app.payment_core_mutation','0',true);
  raise;
end;
$$;

create or replace function public.automation_trigger_expected_condition_subject(p_trigger_key text)
returns text
language sql stable security invoker set search_path=public,pg_catalog
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
    when 'PAYMENT' then 'PAYMENT'
    else null
  end
  from public.automation_trigger_catalog
  where trigger_key=upper(trim(p_trigger_key));
$$;

update public.automation_trigger_catalog
set availability='AVAILABLE',required_work_package=null,
    description='Canonical PAYMENT-CORE domain event is produced from durable Payment intent/transaction evidence.'
where trigger_key in ('PAYMENT_INTENT','PAYMENT_CAPTURED','PAYMENT_FAILED','PAYMENT_REFUNDED')
  and required_work_package='PAYMENT-CORE';

create or replace function public.reconcile_payment_automation_events(p_limit integer default 100)
returns jsonb
language plpgsql security invoker set search_path=public,pg_catalog
as $$
declare e record; v_source text; v_trigger text; v_result jsonb; v_processed integer:=0; v_enqueued integer:=0; v_replayed integer:=0;
begin
  if current_user<>'service_role' or p_limit not between 1 and 1000 then
    raise exception 'Payment automation reconciliation is not permitted';
  end if;
  for e in
    select source_kind,organization_id,subject_id,source_id,event_kind,occurred_at,payload
    from (
      select 'INTENT'::text source_kind,pi.organization_id,pi.id subject_id,pi.id source_id,
        'PAYMENT_INTENT'::text event_kind,pi.created_at occurred_at,
        jsonb_build_object('paymentIntentId',pi.id,'invoiceId',pi.invoice_id,'amount',pi.amount,'currency',pi.currency,'status',pi.status) payload
      from public.payment_intents pi
      union all
      select 'TRANSACTION',pt.organization_id,pt.payment_intent_id,pt.id,
        case pt.transaction_type when 'CAPTURED' then 'PAYMENT_CAPTURED'
          when 'FAILED' then 'PAYMENT_FAILED' when 'REFUNDED' then 'PAYMENT_REFUNDED' else null end,
        pt.occurred_at,
        jsonb_build_object('paymentIntentId',pt.payment_intent_id,'invoiceId',pt.invoice_id,
          'transactionId',pt.id,'transactionType',pt.transaction_type,'amount',pt.amount,
          'currency',pt.currency,'refundId',pt.refund_id)
      from public.payment_transactions pt
      where pt.transaction_type in ('CAPTURED','FAILED','REFUNDED')
    ) q
    where event_kind is not null
      and not exists(
        select 1 from public.audit_logs a
        where a.organization_id=q.organization_id and a.action='PAYMENT_AUTOMATION_EVENT_PROJECTED'
          and a.correlation_id=case when q.source_kind='INTENT' then 'payment-intent:'||q.source_id::text else 'payment-transaction:'||q.source_id::text end
      )
    order by occurred_at,source_id
    limit p_limit
  loop
    v_source:=case when e.source_kind='INTENT' then 'payment-intent:'||e.source_id::text else 'payment-transaction:'||e.source_id::text end;
    v_trigger:=e.event_kind;
    perform pg_advisory_xact_lock(hashtextextended(v_source,0));
    if exists(select 1 from public.audit_logs where organization_id=e.organization_id
      and action='PAYMENT_AUTOMATION_EVENT_PROJECTED' and correlation_id=v_source) then continue; end if;
    v_result:=public.enqueue_automation_runtime_event(
      e.organization_id,v_trigger,v_source,'PAYMENT',e.subject_id,e.payload,e.occurred_at
    );
    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
    ) values (
      e.organization_id,'SYSTEM','payment_core','PAYMENT_AUTOMATION_EVENT_PROJECTED',
      'payment_intent',e.subject_id::text,
      jsonb_build_object('triggerKey',v_trigger,'sourceKind',e.source_kind,'sourceId',e.source_id,'runtime',v_result),
      v_source
    ) on conflict do nothing;
    v_processed:=v_processed+1;
    v_enqueued:=v_enqueued+coalesce((v_result->>'enqueuedRuns')::integer,0);
    v_replayed:=v_replayed+coalesce((v_result->>'replayedRuns')::integer,0);
  end loop;
  return jsonb_build_object('processed',v_processed,'enqueuedRuns',v_enqueued,'replayedRuns',v_replayed);
end;
$$;

create or replace function public.get_crm_customer360_v6(
  p_organization_id uuid,p_person_id uuid,p_limit integer default 50
)
returns jsonb
language plpgsql stable security invoker set search_path=public,pg_catalog
as $$
declare v_base jsonb; v_payments jsonb;
begin
  v_base:=public.get_crm_customer360_v5(p_organization_id,p_person_id,p_limit);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'paymentNumber',p.payment_number,'invoiceId',p.invoice_id,'status',p.status,
    'provider',p.provider,'amount',p.amount,'capturedTotal',p.captured_total,
    'refundedTotal',p.refunded_total,'netPaidTotal',p.net_paid_total,'currency',p.currency,
    'createdAt',p.created_at,'updatedAt',p.updated_at
  ) order by p.updated_at desc,p.id),'[]'::jsonb)
  into v_payments
  from (
    select * from public.payment_intents
    where organization_id=p_organization_id and person_id=p_person_id
    order by updated_at desc,id limit p_limit
  ) p;
  v_base:=jsonb_set(v_base,'{payments}',v_payments,true);
  v_base:=jsonb_set(v_base,'{moduleStatus,payments}','"IMPLEMENTED"'::jsonb,true);
  return v_base;
end;
$$;

revoke all on function public.guard_payment_core_mutation() from public,anon,authenticated,service_role;
revoke all on function private.payment_core_actor_role(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.payment_core_assert_manage(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.payment_core_assert_manager(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.payment_core_is_replay(uuid,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.payment_core_actor_role(uuid,uuid) to service_role;
grant execute on function private.payment_core_assert_manage(uuid,uuid,uuid) to service_role;
grant execute on function private.payment_core_assert_manager(uuid,uuid) to service_role;
grant execute on function private.payment_core_is_replay(uuid,text,text,text,text,text) to service_role;

revoke all on function public.create_payment_intent_v1(uuid,uuid,uuid,uuid,numeric,text) from public,anon,authenticated,service_role;
grant execute on function public.create_payment_intent_v1(uuid,uuid,uuid,uuid,numeric,text) to service_role;
revoke all on function public.cancel_payment_intent_v1(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.cancel_payment_intent_v1(uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.record_payment_link_v1(uuid,uuid,uuid,text,text,text,timestamptz,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.record_payment_link_v1(uuid,uuid,uuid,text,text,text,timestamptz,jsonb,text) to service_role;
revoke all on function public.mark_payment_intent_reconciliation_required_v1(uuid,uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.mark_payment_intent_reconciliation_required_v1(uuid,uuid,text,text,jsonb,text) to service_role;
revoke all on function public.request_payment_refund_v1(uuid,uuid,uuid,uuid,numeric,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.request_payment_refund_v1(uuid,uuid,uuid,uuid,numeric,text,jsonb,text) to service_role;
revoke all on function public.record_payment_provider_event_v1(uuid,uuid,uuid,text,text,text,text,numeric,text,text,jsonb,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.record_payment_provider_event_v1(uuid,uuid,uuid,text,text,text,text,numeric,text,text,jsonb,jsonb,text) to service_role;
revoke all on function public.reconcile_payment_automation_events(integer) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_payment_automation_events(integer) to service_role;
revoke all on function public.get_crm_customer360_v6(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_crm_customer360_v6(uuid,uuid,integer) to authenticated,service_role;
