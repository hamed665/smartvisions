\set ON_ERROR_STOP on

-- QUOTE-ENGINE: canonical commercial Quote aggregate over existing CRM/Catalog authorities.
-- This migration intentionally does NOT create Order, Invoice, Payment, inventory or generic Document truth.

create unique index if not exists service_prices_org_id_uidx
  on public.service_prices(organization_id,id);
create unique index if not exists catalog_product_prices_org_id_uidx
  on public.catalog_product_prices(organization_id,id);

create table public.quotes (
  id uuid primary key,
  organization_id uuid not null,
  tenant_business_id uuid not null,
  branch_id uuid,
  person_id uuid,
  buyer_business_id uuid,
  deal_id uuid,
  owner_user_id uuid not null,
  quote_number text not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','REVIEW','SENT','VIEWED','ACCEPTED','REJECTED','EXPIRED','PAYMENT_PENDING','CONVERTED')),
  current_version integer not null default 0 check (current_version>=0),
  version integer not null default 1 check (version>=1),
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  expired_at timestamptz,
  converted_at timestamptz,
  conversion_kind text,
  conversion_reference text,
  conversion_evidence jsonb,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,quote_number),
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
  foreign key (organization_id,owner_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (quote_number ~ '^Q-[A-Z0-9]{12}$'),
  check (person_id is not null or buyer_business_id is not null),
  check (
    (status='SENT' and sent_at is not null)
    or status<>'SENT'
  ),
  check (
    (status='VIEWED' and sent_at is not null and viewed_at is not null)
    or status<>'VIEWED'
  ),
  check (
    (status='ACCEPTED' and accepted_at is not null)
    or status<>'ACCEPTED'
  ),
  check (
    (status='REJECTED' and rejected_at is not null)
    or status<>'REJECTED'
  ),
  check (
    (status='EXPIRED' and expired_at is not null)
    or status<>'EXPIRED'
  ),
  check (
    (status='CONVERTED'
      and accepted_at is not null
      and converted_at is not null
      and conversion_kind in ('ORDER','EXTERNAL_ORDER')
      and length(btrim(conversion_reference)) between 1 and 512
      and conversion_evidence is not null
      and jsonb_typeof(conversion_evidence)='object'
      and conversion_evidence<>'{}'::jsonb
      and octet_length(conversion_evidence::text)<=8192)
    or status<>'CONVERTED'
  )
);
comment on table public.quotes is
  'Canonical QUOTE-ENGINE aggregate. Order/Invoice/Payment truth remains owned by later Work Packages.';

create table public.quote_versions (
  id uuid primary key,
  organization_id uuid not null,
  quote_id uuid not null,
  version_no integer not null check (version_no>=1),
  country_code text not null,
  currency text not null,
  valid_until timestamptz not null,
  terms text,
  notes text,
  subtotal numeric(18,4) not null check (subtotal>=0),
  discount_total numeric(18,4) not null check (discount_total>=0),
  tax_total numeric(18,4) not null check (tax_total>=0),
  total numeric(18,4) not null check (total>=0),
  seller_snapshot jsonb not null,
  buyer_snapshot jsonb not null,
  document_snapshot jsonb not null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id,id,quote_id),
  unique (organization_id,quote_id,version_no),
  foreign key (organization_id,quote_id)
    references public.quotes(organization_id,id) on delete restrict,
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (country_code=upper(btrim(country_code)) and country_code ~ '^[A-Z]{2}$'),
  check (currency=upper(btrim(currency)) and currency ~ '^[A-Z]{3}$'),
  check (terms is null or length(btrim(terms)) between 1 and 12000),
  check (notes is null or length(btrim(notes)) between 1 and 12000),
  check (jsonb_typeof(seller_snapshot)='object' and seller_snapshot<>'{}'::jsonb and octet_length(seller_snapshot::text)<=16384),
  check (jsonb_typeof(buyer_snapshot)='object' and buyer_snapshot<>'{}'::jsonb and octet_length(buyer_snapshot::text)<=16384),
  check (jsonb_typeof(document_snapshot)='object' and document_snapshot<>'{}'::jsonb and octet_length(document_snapshot::text)<=131072),
  check (discount_total<=subtotal),
  check (total=subtotal-discount_total+tax_total)
);
comment on table public.quote_versions is
  'Immutable commercial snapshots. Catalog prices are copied as historical evidence; later Catalog changes never rewrite an issued Quote version.';

create table public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id uuid not null,
  quote_version_id uuid not null,
  version_no integer not null,
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
  price_source_version integer,
  created_at timestamptz not null default now(),
  unique (organization_id,quote_version_id,line_no),
  foreign key (organization_id,quote_version_id,quote_id)
    references public.quote_versions(organization_id,id,quote_id) on delete restrict,
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
comment on table public.quote_line_items is
  'Immutable Quote-version line snapshots anchored to canonical Service/Product/Variant price authorities. No free-floating unit-price authority is created.';

create table public.quote_version_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id uuid not null,
  quote_version_id uuid not null,
  version_no integer not null,
  status text not null check (status in ('NOT_REQUIRED','PENDING','APPROVED','REJECTED','SUPERSEDED')),
  approval_action_keys text[] not null default '{}'::text[],
  review_flags text[] not null default '{}'::text[],
  reviewer_roles text[] not null default '{}'::text[],
  decided_by_user_id uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,quote_id,version_no),
  unique (organization_id,quote_version_id),
  foreign key (organization_id,quote_version_id,quote_id)
    references public.quote_versions(organization_id,id,quote_id) on delete restrict,
  foreign key (organization_id,decided_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (approval_action_keys <@ array['CUSTOM_QUOTE','DISCOUNT_ABOVE_AUTO']::text[]),
  check (review_flags <@ array['CUSTOM_PRICING','DISCOUNT','MANUAL_TAX']::text[]),
  check (reviewer_roles <@ array['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']::text[]),
  check (
    (status in ('APPROVED','REJECTED') and decided_by_user_id is not null and decided_at is not null)
    or
    (status not in ('APPROVED','REJECTED') and decided_by_user_id is null and decided_at is null)
  ),
  check (decision_note is null or length(btrim(decision_note)) between 1 and 2000)
);
comment on table public.quote_version_reviews is
  'Quote-version approval evidence. Policy ownership remains public.approval_rules; this table snapshots the applicable governed decision.';

create table public.quote_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id uuid not null,
  quote_version_no integer,
  transition text not null check (transition in (
    'CREATED','VERSION_CREATED','REVIEW_SUBMITTED','REVIEW_APPROVED','REVIEW_REJECTED',
    'SENT','VIEWED','ACCEPTED','REJECTED','EXPIRED','CONVERTED'
  )),
  from_status text,
  to_status text not null,
  actor_type text not null check (actor_type in ('USER','SYSTEM','CUSTOMER','PROVIDER')),
  actor_user_id uuid,
  request_key text not null,
  request_hash text not null,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (organization_id,request_key),
  foreign key (organization_id,quote_id)
    references public.quotes(organization_id,id) on delete restrict,
  foreign key (organization_id,actor_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (length(btrim(request_key)) between 8 and 200),
  check (length(request_hash)=32),
  check (jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=32768),
  check ((actor_type='USER' and actor_user_id is not null) or actor_type<>'USER')
);
comment on table public.quote_lifecycle_events is
  'Durable QUOTE-ENGINE lifecycle evidence and automation projection source. It is domain evidence, not a second event bus.';

create index quotes_org_status_updated_idx on public.quotes(organization_id,status,updated_at desc,id);
create index quotes_org_person_updated_idx on public.quotes(organization_id,person_id,updated_at desc,id) where person_id is not null;
create index quotes_org_buyer_business_idx on public.quotes(organization_id,buyer_business_id,updated_at desc,id) where buyer_business_id is not null;
create index quotes_org_deal_idx on public.quotes(organization_id,deal_id) where deal_id is not null;
create index quotes_owner_idx on public.quotes(organization_id,owner_user_id,status);
create index quotes_branch_idx on public.quotes(organization_id,branch_id) where branch_id is not null;
create index quote_versions_quote_idx on public.quote_versions(organization_id,quote_id,version_no desc);
create index quote_versions_creator_idx on public.quote_versions(organization_id,created_by_user_id);
create index quote_lines_quote_idx on public.quote_line_items(organization_id,quote_id,version_no,line_no);
create index quote_lines_service_idx on public.quote_line_items(organization_id,service_id) where service_id is not null;
create index quote_lines_product_idx on public.quote_line_items(organization_id,product_id) where product_id is not null;
create index quote_lines_variant_idx on public.quote_line_items(organization_id,variant_id) where variant_id is not null;
create index quote_lines_service_price_idx on public.quote_line_items(organization_id,service_price_id) where service_price_id is not null;
create index quote_lines_product_price_idx on public.quote_line_items(organization_id,product_price_id) where product_price_id is not null;
create index quote_review_decider_idx on public.quote_version_reviews(organization_id,decided_by_user_id) where decided_by_user_id is not null;
create index quote_events_projection_idx on public.quote_lifecycle_events(transition,occurred_at,id);
create index quote_events_actor_idx on public.quote_lifecycle_events(organization_id,actor_user_id) where actor_user_id is not null;

alter table public.quotes enable row level security;
alter table public.quote_versions enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.quote_version_reviews enable row level security;
alter table public.quote_lifecycle_events enable row level security;

create policy quotes_member_read on public.quotes for select to authenticated
  using (public.is_org_member(organization_id));
create policy quote_versions_member_read on public.quote_versions for select to authenticated
  using (public.is_org_member(organization_id));
create policy quote_lines_member_read on public.quote_line_items for select to authenticated
  using (public.is_org_member(organization_id));
create policy quote_reviews_member_read on public.quote_version_reviews for select to authenticated
  using (public.is_org_member(organization_id));
create policy quote_events_member_read on public.quote_lifecycle_events for select to authenticated
  using (public.is_org_member(organization_id));

revoke all on table
  public.quotes,public.quote_versions,public.quote_line_items,
  public.quote_version_reviews,public.quote_lifecycle_events
from public,anon,authenticated,service_role;

grant select on table
  public.quotes,public.quote_versions,public.quote_line_items,
  public.quote_version_reviews,public.quote_lifecycle_events
to authenticated;

grant select,insert,update on table
  public.quotes,public.quote_version_reviews
to service_role;
grant select,insert on table
  public.quote_versions,public.quote_line_items,public.quote_lifecycle_events
to service_role;

create or replace function public.guard_quote_engine_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
begin
  if coalesce(current_setting('app.quote_engine_mutation',true),'')<>'allowed' then
    raise exception 'QUOTE-ENGINE state requires governed command';
  end if;
  if tg_table_name in ('quote_versions','quote_line_items','quote_lifecycle_events')
     and tg_op<>'INSERT' then
    raise exception 'QUOTE-ENGINE immutable evidence cannot be changed';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger quotes_guard before insert or update or delete on public.quotes
for each row execute function public.guard_quote_engine_mutation();
create trigger quote_versions_guard before insert or update or delete on public.quote_versions
for each row execute function public.guard_quote_engine_mutation();
create trigger quote_line_items_guard before insert or update or delete on public.quote_line_items
for each row execute function public.guard_quote_engine_mutation();
create trigger quote_reviews_guard before insert or update or delete on public.quote_version_reviews
for each row execute function public.guard_quote_engine_mutation();
create trigger quote_events_guard before insert or update or delete on public.quote_lifecycle_events
for each row execute function public.guard_quote_engine_mutation();

create unique index quote_engine_audit_request_uidx
  on public.audit_logs(organization_id,action,entity_type,entity_id,correlation_id)
  where action like 'QUOTE_ENGINE_%' and correlation_id is not null;

create or replace function private.quote_engine_actor_role(
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

create or replace function private.quote_engine_assert_manage(
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
    raise exception 'QUOTE-ENGINE Organization, actor and owner are required';
  end if;
  v_role:=private.quote_engine_actor_role(p_organization_id,p_actor_user_id);
  if v_role not in ('OWNER','ADMIN','SALES_MANAGER')
     and not (v_role='SALES_AGENT' and p_owner_user_id=p_actor_user_id)
  then
    raise exception 'QUOTE-ENGINE mutation is not permitted for actor';
  end if;
end;
$$;

create or replace function private.quote_engine_is_replay(
  p_organization_id uuid,
  p_action text,
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
    raise exception 'QUOTE-ENGINE request key is invalid';
  end if;
  select a.after_data->>'requestHash' into v_hash
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action=p_action
    and a.entity_type='quote'
    and a.entity_id=p_entity_id
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc
  limit 1;
  if v_hash is null then return false; end if;
  if v_hash<>p_request_hash then
    raise exception 'QUOTE-ENGINE request key conflict';
  end if;
  return true;
end;
$$;

create or replace function private.quote_engine_event(
  p_organization_id uuid,
  p_quote_id uuid,
  p_quote_version_no integer,
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
  insert into public.quote_lifecycle_events(
    organization_id,quote_id,quote_version_no,transition,from_status,to_status,
    actor_type,actor_user_id,request_key,request_hash,evidence
  ) values (
    p_organization_id,p_quote_id,p_quote_version_no,p_transition,p_from_status,p_to_status,
    p_actor_type,p_actor_user_id,p_request_key,p_request_hash,coalesce(p_evidence,'{}'::jsonb)
  )
  on conflict (organization_id,request_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id,request_hash into v_id,v_hash
    from public.quote_lifecycle_events
    where organization_id=p_organization_id and request_key=p_request_key;
    if v_hash is distinct from p_request_hash then
      raise exception 'QUOTE-ENGINE lifecycle request key conflict';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.create_quote_version_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_quote_id uuid,
  p_expected_quote_version integer,
  p_country_code text,
  p_currency text,
  p_valid_until timestamptz,
  p_terms text,
  p_notes text,
  p_lines jsonb,
  p_request_key text
)
returns integer
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  v_quote public.quotes%rowtype;
  v_version_id uuid:=gen_random_uuid();
  v_version_no integer;
  v_country text:=upper(btrim(coalesce(p_country_code,'')));
  v_currency text:=upper(btrim(coalesce(p_currency,'')));
  v_hash text;
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
  v_min numeric(18,4);
  v_discount_bps integer;
  v_tax_bps integer;
  v_line_subtotal numeric(18,4);
  v_discount numeric(18,4);
  v_taxable numeric(18,4);
  v_tax numeric(18,4);
  v_line_total numeric(18,4);
  v_price_version integer;
  v_auto_bps integer;
  v_approval_bps integer;
  v_requires_custom boolean;
  v_resolved jsonb:='[]'::jsonb;
  v_subtotal numeric(18,4):=0;
  v_discount_total numeric(18,4):=0;
  v_tax_total numeric(18,4):=0;
  v_total numeric(18,4):=0;
  v_actions text[]:='{}'::text[];
  v_flags text[]:='{}'::text[];
  v_reviewer_roles text[]:='{}'::text[];
  v_review_status text:='NOT_REQUIRED';
  v_seller jsonb;
  v_buyer jsonb;
  v_document jsonb;
  v_line_no integer:=0;
  v_now timestamptz:=statement_timestamp();
  v_event_id uuid;
begin
  if p_lines is null or jsonb_typeof(p_lines)<>'array'
     or jsonb_array_length(p_lines) not between 1 and 500
     or v_country !~ '^[A-Z]{2}$'
     or v_currency !~ '^[A-Z]{3}$'
     or p_valid_until is null or p_valid_until<=v_now
     or p_valid_until>v_now+interval '365 days'
     or (p_terms is not null and length(btrim(p_terms)) not between 1 and 12000)
     or (p_notes is not null and length(btrim(p_notes)) not between 1 and 12000)
  then
    raise exception 'QUOTE-ENGINE version payload is invalid';
  end if;

  select * into v_quote from public.quotes
  where organization_id=p_organization_id and id=p_quote_id
  for update;
  if not found then raise exception 'QUOTE-ENGINE Quote not found'; end if;

  perform private.quote_engine_assert_manage(p_organization_id,p_actor_user_id,v_quote.owner_user_id);
  if p_expected_quote_version is null or p_expected_quote_version<>v_quote.version then
    raise exception 'QUOTE-ENGINE Quote version changed';
  end if;
  if v_quote.status in ('ACCEPTED','REJECTED','EXPIRED','PAYMENT_PENDING','CONVERTED') then
    raise exception 'QUOTE-ENGINE terminal or downstream Quote cannot be revised';
  end if;

  v_hash:=md5(jsonb_build_object(
    'quoteId',p_quote_id,'expectedQuoteVersion',p_expected_quote_version,
    'country',v_country,'currency',v_currency,'validUntil',p_valid_until,
    'terms',nullif(btrim(coalesce(p_terms,'')),''),
    'notes',nullif(btrim(coalesce(p_notes,'')),''),
    'lines',p_lines
  )::text);

  if private.quote_engine_is_replay(
    p_organization_id,'QUOTE_ENGINE_VERSION_CREATED',p_quote_id::text,p_request_key,v_hash
  ) then
    select (a.after_data->>'versionNo')::integer into v_version_no
    from public.audit_logs a
    where a.organization_id=p_organization_id
      and a.action='QUOTE_ENGINE_VERSION_CREATED'
      and a.entity_type='quote' and a.entity_id=p_quote_id::text
      and a.correlation_id=p_request_key
    order by a.created_at desc,a.id desc limit 1;
    return v_version_no;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no:=v_line_no+1;
    v_kind:=upper(btrim(coalesce(v_line->>'subjectKind','')));
    v_description:=nullif(btrim(coalesce(v_line->>'description','')),'');
    v_qty:=coalesce(nullif(v_line->>'quantity','')::numeric,1);
    v_discount_bps:=coalesce(nullif(v_line->>'discountBps','')::integer,0);
    v_tax_bps:=coalesce(nullif(v_line->>'taxBps','')::integer,0);

    if v_qty<=0 or v_qty>1000000
       or v_discount_bps not between 0 and 10000
       or v_tax_bps not between 0 and 10000
       or (v_description is not null and length(v_description)>2000)
    then raise exception 'QUOTE-ENGINE line % payload is invalid',v_line_no; end if;

    v_service_id:=null; v_product_id:=null; v_variant_id:=null;
    v_service_price_id:=null; v_product_price_id:=null;
    v_name:=null; v_sku:=null; v_unit:=null; v_min:=null;
    v_price_version:=null; v_auto_bps:=0; v_approval_bps:=0; v_requires_custom:=false;

    if v_kind='SERVICE' then
      v_service_id:=nullif(btrim(coalesce(v_line->>'serviceId','')),'');
      if v_service_id is null then raise exception 'QUOTE-ENGINE service line % is missing serviceId',v_line_no; end if;

      select s.name,sp.id,sp.price,sp.minimum_price,
             round(sp.max_auto_discount_pct*100)::integer,
             round(sp.max_discount_with_approval_pct*100)::integer,
             coalesce((s.config->>'requiresCustomQuote')::boolean,false)
      into v_name,v_service_price_id,v_unit,v_min,v_auto_bps,v_approval_bps,v_requires_custom
      from public.services s
      join public.service_prices sp
        on sp.organization_id=s.organization_id and sp.service_id=s.id
       and sp.country_code=v_country and sp.currency=v_currency
      where s.organization_id=p_organization_id and s.id=v_service_id and s.enabled=true;

      if not found then raise exception 'QUOTE-ENGINE canonical Service price is unavailable for line %',v_line_no; end if;
      if v_discount_bps>v_approval_bps then
        raise exception 'QUOTE-ENGINE Service discount exceeds configured approval ceiling on line %',v_line_no;
      end if;
      if v_min is not null and round(v_unit*(1-v_discount_bps/10000.0),4)<v_min then
        raise exception 'QUOTE-ENGINE Service discount breaches configured minimum on line %',v_line_no;
      end if;
      if v_discount_bps>v_auto_bps then
        if not ('DISCOUNT_ABOVE_AUTO'=any(v_actions)) then v_actions:=array_append(v_actions,'DISCOUNT_ABOVE_AUTO'); end if;
        if not ('DISCOUNT'=any(v_flags)) then v_flags:=array_append(v_flags,'DISCOUNT'); end if;
      end if;
      if v_requires_custom then
        if not ('CUSTOM_QUOTE'=any(v_actions)) then v_actions:=array_append(v_actions,'CUSTOM_QUOTE'); end if;
        if not ('CUSTOM_PRICING'=any(v_flags)) then v_flags:=array_append(v_flags,'CUSTOM_PRICING'); end if;
      end if;

    elsif v_kind='PRODUCT' then
      v_product_id:=nullif(v_line->>'productId','')::uuid;
      select p.name,p.sku,pp.id,pp.price,pp.minimum_price,pp.version
      into v_name,v_sku,v_product_price_id,v_unit,v_min,v_price_version
      from public.catalog_products p
      join public.catalog_product_prices pp
        on pp.organization_id=p.organization_id and pp.product_id=p.id and pp.variant_id is null
       and pp.country_code=v_country and pp.currency=v_currency
      where p.organization_id=p_organization_id and p.id=v_product_id
        and p.tenant_business_id=v_quote.tenant_business_id and p.status='ACTIVE';
      if not found then raise exception 'QUOTE-ENGINE canonical Product price is unavailable for line %',v_line_no; end if;
      if v_discount_bps>0 and v_min is null then
        raise exception 'QUOTE-ENGINE Product discount requires configured minimum price on line %',v_line_no;
      end if;
      if v_min is not null and round(v_unit*(1-v_discount_bps/10000.0),4)<v_min then
        raise exception 'QUOTE-ENGINE Product discount breaches configured minimum on line %',v_line_no;
      end if;
      if v_discount_bps>0 then
        if not ('DISCOUNT_ABOVE_AUTO'=any(v_actions)) then v_actions:=array_append(v_actions,'DISCOUNT_ABOVE_AUTO'); end if;
        if not ('DISCOUNT'=any(v_flags)) then v_flags:=array_append(v_flags,'DISCOUNT'); end if;
      end if;

    elsif v_kind='VARIANT' then
      v_variant_id:=nullif(v_line->>'variantId','')::uuid;
      select p.id,p.name||' / '||v.name,v.sku,pp.id,pp.price,pp.minimum_price,pp.version
      into v_product_id,v_name,v_sku,v_product_price_id,v_unit,v_min,v_price_version
      from public.catalog_product_variants v
      join public.catalog_products p
        on p.organization_id=v.organization_id and p.id=v.product_id
      join public.catalog_product_prices pp
        on pp.organization_id=v.organization_id and pp.product_id=v.product_id and pp.variant_id=v.id
       and pp.country_code=v_country and pp.currency=v_currency
      where v.organization_id=p_organization_id and v.id=v_variant_id
        and p.tenant_business_id=v_quote.tenant_business_id
        and p.status='ACTIVE' and v.status='ACTIVE';
      if not found then raise exception 'QUOTE-ENGINE canonical Variant price is unavailable for line %',v_line_no; end if;
      if v_discount_bps>0 and v_min is null then
        raise exception 'QUOTE-ENGINE Variant discount requires configured minimum price on line %',v_line_no;
      end if;
      if v_min is not null and round(v_unit*(1-v_discount_bps/10000.0),4)<v_min then
        raise exception 'QUOTE-ENGINE Variant discount breaches configured minimum on line %',v_line_no;
      end if;
      if v_discount_bps>0 then
        if not ('DISCOUNT_ABOVE_AUTO'=any(v_actions)) then v_actions:=array_append(v_actions,'DISCOUNT_ABOVE_AUTO'); end if;
        if not ('DISCOUNT'=any(v_flags)) then v_flags:=array_append(v_flags,'DISCOUNT'); end if;
      end if;
    else
      raise exception 'QUOTE-ENGINE line % subjectKind is invalid',v_line_no;
    end if;

    if v_tax_bps>0 then
      if not ('CUSTOM_QUOTE'=any(v_actions)) then v_actions:=array_append(v_actions,'CUSTOM_QUOTE'); end if;
      if not ('MANUAL_TAX'=any(v_flags)) then v_flags:=array_append(v_flags,'MANUAL_TAX'); end if;
    end if;

    v_line_subtotal:=round(v_unit*v_qty,4);
    v_discount:=round(v_line_subtotal*v_discount_bps/10000.0,4);
    v_taxable:=v_line_subtotal-v_discount;
    v_tax:=round(v_taxable*v_tax_bps/10000.0,4);
    v_line_total:=v_taxable+v_tax;

    v_subtotal:=v_subtotal+v_line_subtotal;
    v_discount_total:=v_discount_total+v_discount;
    v_tax_total:=v_tax_total+v_tax;
    v_total:=v_total+v_line_total;

    v_resolved:=v_resolved||jsonb_build_array(jsonb_build_object(
      'lineNo',v_line_no,'subjectKind',v_kind,
      'serviceId',v_service_id,'productId',v_product_id,'variantId',v_variant_id,
      'servicePriceId',v_service_price_id,'productPriceId',v_product_price_id,
      'name',v_name,'sku',v_sku,'description',v_description,
      'quantity',v_qty,'unitPrice',v_unit,'discountBps',v_discount_bps,
      'discountAmount',v_discount,'taxBps',v_tax_bps,'taxAmount',v_tax,
      'lineSubtotal',v_line_subtotal,'lineTotal',v_line_total,
      'priceSourceVersion',v_price_version
    ));
  end loop;

  if cardinality(v_actions)>0 then
    if (
      select count(distinct ar.action_key)
      from public.approval_rules ar
      where ar.organization_id=p_organization_id and ar.action_key=any(v_actions)
    )<>cardinality(v_actions) then
      raise exception 'QUOTE-ENGINE required approval policy is missing';
    end if;

    select coalesce(array_agg(distinct rr order by rr),'{}'::text[])
      into v_reviewer_roles
    from public.approval_rules ar
    cross join lateral unnest(ar.reviewer_roles) rr
    where ar.organization_id=p_organization_id
      and ar.action_key=any(v_actions)
      and ar.requires_approval=true
      and ar.mode in ('REVIEW','STRICT');

    if cardinality(v_reviewer_roles)>0 then v_review_status:='PENDING'; end if;
  end if;

  select jsonb_build_object(
    'tenantBusinessId',tb.id,'name',tb.name,'legalName',tb.legal_name,
    'countryCode',tb.country_code,'branchId',v_quote.branch_id,
    'branchName',b.name
  ) into v_seller
  from public.tenant_businesses tb
  left join public.branches b
    on b.organization_id=tb.organization_id and b.id=v_quote.branch_id
  where tb.organization_id=p_organization_id and tb.id=v_quote.tenant_business_id;

  select jsonb_build_object(
    'personId',v_quote.person_id,'personName',cp.display_name,
    'businessId',v_quote.buyer_business_id,'businessName',bu.name,
    'dealId',v_quote.deal_id
  ) into v_buyer
  from (select 1) x
  left join public.crm_people cp
    on cp.organization_id=p_organization_id and cp.id=v_quote.person_id
  left join public.businesses bu
    on bu.organization_id=p_organization_id and bu.id=v_quote.buyer_business_id;

  v_version_no:=v_quote.current_version+1;
  v_document:=jsonb_build_object(
    'schema','smartvisions.quote.document.v1',
    'quoteId',p_quote_id,'quoteNumber',v_quote.quote_number,'version',v_version_no,
    'seller',v_seller,'buyer',v_buyer,'countryCode',v_country,'currency',v_currency,
    'validUntil',p_valid_until,
    'terms',nullif(btrim(coalesce(p_terms,'')),''),
    'lines',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'lineNo',(x->>'lineNo')::integer,
        'subjectKind',x->>'subjectKind',
        'name',x->>'name',
        'sku',nullif(x->>'sku',''),
        'description',nullif(x->>'description',''),
        'quantity',(x->>'quantity')::numeric,
        'unitPrice',(x->>'unitPrice')::numeric,
        'discountAmount',(x->>'discountAmount')::numeric,
        'taxAmount',(x->>'taxAmount')::numeric,
        'lineSubtotal',(x->>'lineSubtotal')::numeric,
        'lineTotal',(x->>'lineTotal')::numeric
      ) order by (x->>'lineNo')::integer),'[]'::jsonb)
      from jsonb_array_elements(v_resolved) x
    ),
    'totals',jsonb_build_object(
      'subtotal',round(v_subtotal,4),'discount',round(v_discount_total,4),
      'tax',round(v_tax_total,4),'total',round(v_total,4)
    )
  );

  perform set_config('app.quote_engine_mutation','allowed',true);

  if v_quote.current_version>0 then
    update public.quote_version_reviews
    set status='SUPERSEDED',updated_at=v_now
    where organization_id=p_organization_id and quote_id=p_quote_id
      and version_no=v_quote.current_version and status='PENDING';
  end if;

  insert into public.quote_versions(
    id,organization_id,quote_id,version_no,country_code,currency,valid_until,
    terms,notes,subtotal,discount_total,tax_total,total,
    seller_snapshot,buyer_snapshot,document_snapshot,created_by_user_id,created_at
  ) values (
    v_version_id,p_organization_id,p_quote_id,v_version_no,v_country,v_currency,p_valid_until,
    nullif(btrim(coalesce(p_terms,'')),''),
    nullif(btrim(coalesce(p_notes,'')),''),
    round(v_subtotal,4),round(v_discount_total,4),round(v_tax_total,4),round(v_total,4),
    v_seller,v_buyer,v_document,p_actor_user_id,v_now
  );

  insert into public.quote_line_items(
    organization_id,quote_id,quote_version_id,version_no,line_no,subject_kind,
    service_id,product_id,variant_id,service_price_id,product_price_id,
    name_snapshot,sku_snapshot,description,quantity,unit_price,
    discount_bps,discount_amount,tax_bps,tax_amount,line_subtotal,line_total,price_source_version
  )
  select
    p_organization_id,p_quote_id,v_version_id,v_version_no,
    (x->>'lineNo')::integer,x->>'subjectKind',
    nullif(x->>'serviceId',''),
    nullif(x->>'productId','')::uuid,
    nullif(x->>'variantId','')::uuid,
    nullif(x->>'servicePriceId','')::uuid,
    nullif(x->>'productPriceId','')::uuid,
    x->>'name',nullif(x->>'sku',''),nullif(x->>'description',''),
    (x->>'quantity')::numeric,(x->>'unitPrice')::numeric,
    (x->>'discountBps')::integer,(x->>'discountAmount')::numeric,
    (x->>'taxBps')::integer,(x->>'taxAmount')::numeric,
    (x->>'lineSubtotal')::numeric,(x->>'lineTotal')::numeric,
    nullif(x->>'priceSourceVersion','')::integer
  from jsonb_array_elements(v_resolved) x;

  insert into public.quote_version_reviews(
    organization_id,quote_id,quote_version_id,version_no,status,
    approval_action_keys,review_flags,reviewer_roles,created_at,updated_at
  ) values (
    p_organization_id,p_quote_id,v_version_id,v_version_no,v_review_status,
    v_actions,v_flags,v_reviewer_roles,v_now,v_now
  );

  update public.quotes
  set current_version=v_version_no,status='DRAFT',version=version+1,
      sent_at=null,viewed_at=null,updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and id=p_quote_id;

  v_event_id:=private.quote_engine_event(
    p_organization_id,p_quote_id,v_version_no,'VERSION_CREATED',v_quote.status,'DRAFT',
    'USER',p_actor_user_id,'qe:'||md5(p_request_key||':event'),v_hash,
    jsonb_build_object('versionNo',v_version_no,'total',round(v_total,4),'currency',v_currency)
  );

  perform set_config('app.quote_engine_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'QUOTE_ENGINE_VERSION_CREATED','quote',p_quote_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'versionNo',v_version_no,'quoteVersionId',v_version_id,
      'total',round(v_total,4),'currency',v_currency,
      'reviewStatus',v_review_status,'approvalActionKeys',to_jsonb(v_actions),
      'lifecycleEventId',v_event_id
    ),
    p_request_key,v_quote.tenant_business_id,v_quote.branch_id
  );

  return v_version_no;
exception when others then
  perform set_config('app.quote_engine_mutation','0',true);
  raise;
end;
$$;

create or replace function public.create_quote_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_quote_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_person_id uuid,
  p_buyer_business_id uuid,
  p_deal_id uuid,
  p_owner_user_id uuid,
  p_country_code text,
  p_currency text,
  p_valid_until timestamptz,
  p_terms text,
  p_notes text,
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
  v_number text;
  v_hash text;
  v_existing uuid;
  v_version integer;
  v_now timestamptz:=statement_timestamp();
  v_deal public.crm_deals%rowtype;
  v_event_id uuid;
begin
  if p_quote_id is null or p_tenant_business_id is null
     or (p_person_id is null and p_buyer_business_id is null)
     or length(btrim(coalesce(p_request_key,''))) not between 8 and 180
  then raise exception 'QUOTE-ENGINE create payload is invalid'; end if;

  perform private.quote_engine_assert_manage(p_organization_id,p_actor_user_id,v_owner);

  if not exists(
    select 1 from public.tenant_businesses tb
    where tb.organization_id=p_organization_id and tb.id=p_tenant_business_id and tb.status='ACTIVE'
  ) then raise exception 'QUOTE-ENGINE seller Business is missing or inactive'; end if;

  if p_branch_id is not null and not exists(
    select 1 from public.branches b
    where b.organization_id=p_organization_id and b.id=p_branch_id
      and b.tenant_business_id=p_tenant_business_id and b.status='ACTIVE'
  ) then raise exception 'QUOTE-ENGINE seller Branch scope is invalid'; end if;

  if p_person_id is not null and not exists(
    select 1 from public.crm_people p
    where p.organization_id=p_organization_id and p.id=p_person_id and p.status='ACTIVE'
  ) then raise exception 'QUOTE-ENGINE buyer Person is missing or inactive'; end if;

  if p_buyer_business_id is not null and not exists(
    select 1 from public.businesses b
    where b.organization_id=p_organization_id and b.id=p_buyer_business_id
  ) then raise exception 'QUOTE-ENGINE buyer Business is missing'; end if;

  if p_person_id is not null and p_buyer_business_id is not null and not exists(
    select 1 from public.crm_person_business_relationships r
    where r.organization_id=p_organization_id and r.person_id=p_person_id
      and r.business_id=p_buyer_business_id and r.status='ACTIVE'
  ) then raise exception 'QUOTE-ENGINE Person/Business relationship is not confirmed'; end if;

  if p_deal_id is not null then
    select * into v_deal from public.crm_deals
    where organization_id=p_organization_id and id=p_deal_id;
    if not found or v_deal.state<>'OPEN'
       or p_buyer_business_id is null or v_deal.business_id<>p_buyer_business_id
       or (v_deal.person_id is not null and v_deal.person_id is distinct from p_person_id)
    then raise exception 'QUOTE-ENGINE Deal context is inconsistent'; end if;
  end if;

  v_number:='Q-'||upper(substr(replace(p_quote_id::text,'-',''),1,12));
  v_hash:=md5(jsonb_build_object(
    'quoteId',p_quote_id,'sellerBusinessId',p_tenant_business_id,'branchId',p_branch_id,
    'personId',p_person_id,'buyerBusinessId',p_buyer_business_id,'dealId',p_deal_id,
    'ownerUserId',v_owner,'country',upper(btrim(coalesce(p_country_code,''))),
    'currency',upper(btrim(coalesce(p_currency,''))),'validUntil',p_valid_until,
    'terms',p_terms,'notes',p_notes,'lines',p_lines
  )::text);

  if private.quote_engine_is_replay(
    p_organization_id,'QUOTE_ENGINE_CREATED',p_quote_id::text,p_request_key,v_hash
  ) then return p_quote_id; end if;

  select q.id into v_existing from public.quotes q
  where q.organization_id=p_organization_id and q.id=p_quote_id;
  if v_existing is not null then
    raise exception 'QUOTE-ENGINE Quote ID already exists under another command';
  end if;

  perform set_config('app.quote_engine_mutation','allowed',true);
  insert into public.quotes(
    id,organization_id,tenant_business_id,branch_id,person_id,buyer_business_id,deal_id,
    owner_user_id,quote_number,status,current_version,version,
    created_by_user_id,updated_by_user_id,created_at,updated_at
  ) values (
    p_quote_id,p_organization_id,p_tenant_business_id,p_branch_id,p_person_id,p_buyer_business_id,p_deal_id,
    v_owner,v_number,'DRAFT',0,1,p_actor_user_id,p_actor_user_id,v_now,v_now
  );
  perform set_config('app.quote_engine_mutation','0',true);

  v_version:=public.create_quote_version_v1(
    p_organization_id,p_actor_user_id,p_quote_id,1,
    p_country_code,p_currency,p_valid_until,p_terms,p_notes,p_lines,
    p_request_key||':v1'
  );

  perform set_config('app.quote_engine_mutation','allowed',true);
  v_event_id:=private.quote_engine_event(
    p_organization_id,p_quote_id,v_version,'CREATED',null,'DRAFT',
    'USER',p_actor_user_id,'qe:'||md5(p_request_key||':created-event'),v_hash,
    jsonb_build_object('quoteNumber',v_number,'versionNo',v_version)
  );
  perform set_config('app.quote_engine_mutation','0',true);

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id,tenant_business_id,branch_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'QUOTE_ENGINE_CREATED','quote',p_quote_id::text,
    jsonb_build_object(
      'requestHash',v_hash,'quoteNumber',v_number,'versionNo',v_version,
      'lifecycleEventId',v_event_id,'orderTruthCreated',false,
      'invoiceTruthCreated',false,'paymentTruthCreated',false
    ),
    p_request_key,p_tenant_business_id,p_branch_id
  );

  return p_quote_id;
exception when others then
  perform set_config('app.quote_engine_mutation','0',true);
  raise;
end;
$$;

create or replace function public.submit_quote_review_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_quote_id uuid,
  p_expected_quote_version integer,
  p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  q public.quotes%rowtype;
  r public.quote_version_reviews%rowtype;
  v_hash text;
  v_now timestamptz:=statement_timestamp();
  v_event uuid;
begin
  select * into q from public.quotes
  where organization_id=p_organization_id and id=p_quote_id for update;
  if not found then raise exception 'QUOTE-ENGINE Quote not found'; end if;
  perform private.quote_engine_assert_manage(p_organization_id,p_actor_user_id,q.owner_user_id);
  if q.version<>p_expected_quote_version or q.status<>'DRAFT' or q.current_version<1 then
    raise exception 'QUOTE-ENGINE Quote is not reviewable at expected version';
  end if;

  select * into r from public.quote_version_reviews
  where organization_id=p_organization_id and quote_id=p_quote_id and version_no=q.current_version;
  if not found or r.status not in ('PENDING','NOT_REQUIRED') then
    raise exception 'QUOTE-ENGINE current version review state is invalid';
  end if;

  v_hash:=md5(jsonb_build_object('quoteId',p_quote_id,'versionNo',q.current_version,'expected',p_expected_quote_version)::text);
  if private.quote_engine_is_replay(p_organization_id,'QUOTE_ENGINE_REVIEW_SUBMITTED',p_quote_id::text,p_request_key,v_hash)
  then return 'REVIEW'; end if;

  perform set_config('app.quote_engine_mutation','allowed',true);
  update public.quotes set status='REVIEW',version=version+1,updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and id=p_quote_id;
  v_event:=private.quote_engine_event(
    p_organization_id,p_quote_id,q.current_version,'REVIEW_SUBMITTED','DRAFT','REVIEW',
    'USER',p_actor_user_id,'qe:'||md5(p_request_key||':event'),v_hash,
    jsonb_build_object('reviewStatus',r.status,'reviewerRoles',to_jsonb(r.reviewer_roles))
  );
  perform set_config('app.quote_engine_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id,branch_id)
  values (p_organization_id,'USER',p_actor_user_id::text,'QUOTE_ENGINE_REVIEW_SUBMITTED','quote',p_quote_id::text,
    jsonb_build_object('requestHash',v_hash,'versionNo',q.current_version,'reviewStatus',r.status,'lifecycleEventId',v_event),
    p_request_key,q.tenant_business_id,q.branch_id);
  return 'REVIEW';
exception when others then perform set_config('app.quote_engine_mutation','0',true); raise;
end;
$$;

create or replace function public.decide_quote_review_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_quote_id uuid,
  p_decision text,
  p_note text,
  p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  q public.quotes%rowtype;
  r public.quote_version_reviews%rowtype;
  v_role text;
  v_decision text:=upper(btrim(coalesce(p_decision,'')));
  v_hash text;
  v_now timestamptz:=statement_timestamp();
  v_to text;
  v_event uuid;
begin
  if v_decision not in ('APPROVE','REJECT')
     or (p_note is not null and length(btrim(p_note)) not between 1 and 2000)
  then raise exception 'QUOTE-ENGINE review decision payload is invalid'; end if;

  select * into q from public.quotes
  where organization_id=p_organization_id and id=p_quote_id for update;
  if not found or q.status<>'REVIEW' then raise exception 'QUOTE-ENGINE Quote is not awaiting review'; end if;

  select * into r from public.quote_version_reviews
  where organization_id=p_organization_id and quote_id=p_quote_id and version_no=q.current_version
  for update;
  if not found or r.status<>'PENDING' then raise exception 'QUOTE-ENGINE approval is not pending'; end if;

  v_role:=private.quote_engine_actor_role(p_organization_id,p_actor_user_id);
  if v_role is null or not (v_role=any(r.reviewer_roles)) then
    raise exception 'QUOTE-ENGINE actor is not an authorized reviewer';
  end if;

  v_hash:=md5(jsonb_build_object('quoteId',p_quote_id,'versionNo',q.current_version,'decision',v_decision,'note',p_note)::text);
  if private.quote_engine_is_replay(p_organization_id,'QUOTE_ENGINE_REVIEW_DECIDED',p_quote_id::text,p_request_key,v_hash)
  then return case when v_decision='APPROVE' then 'APPROVED' else 'REJECTED' end; end if;

  v_to:=case when v_decision='APPROVE' then 'REVIEW' else 'DRAFT' end;
  perform set_config('app.quote_engine_mutation','allowed',true);
  update public.quote_version_reviews
  set status=case when v_decision='APPROVE' then 'APPROVED' else 'REJECTED' end,
      decided_by_user_id=p_actor_user_id,decided_at=v_now,
      decision_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=v_now
  where organization_id=p_organization_id and quote_id=p_quote_id and version_no=q.current_version;
  update public.quotes
  set status=v_to,version=version+1,updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and id=p_quote_id;
  v_event:=private.quote_engine_event(
    p_organization_id,p_quote_id,q.current_version,
    case when v_decision='APPROVE' then 'REVIEW_APPROVED' else 'REVIEW_REJECTED' end,
    'REVIEW',v_to,'USER',p_actor_user_id,'qe:'||md5(p_request_key||':event'),v_hash,
    jsonb_build_object('decision',v_decision,'note',nullif(btrim(coalesce(p_note,'')),''))
  );
  perform set_config('app.quote_engine_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id,branch_id)
  values (p_organization_id,'USER',p_actor_user_id::text,'QUOTE_ENGINE_REVIEW_DECIDED','quote',p_quote_id::text,
    jsonb_build_object('requestHash',v_hash,'versionNo',q.current_version,'decision',v_decision,'lifecycleEventId',v_event),
    p_request_key,q.tenant_business_id,q.branch_id);
  return case when v_decision='APPROVE' then 'APPROVED' else 'REJECTED' end;
exception when others then perform set_config('app.quote_engine_mutation','0',true); raise;
end;
$$;

create or replace function public.mark_quote_sent_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_quote_id uuid,
  p_expected_quote_version integer,
  p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  q public.quotes%rowtype;
  r public.quote_version_reviews%rowtype;
  v_version public.quote_versions%rowtype;
  v_hash text;
  v_now timestamptz:=statement_timestamp();
  v_event uuid;
begin
  select * into q from public.quotes where organization_id=p_organization_id and id=p_quote_id for update;
  if not found then raise exception 'QUOTE-ENGINE Quote not found'; end if;
  perform private.quote_engine_assert_manage(p_organization_id,p_actor_user_id,q.owner_user_id);
  if q.version<>p_expected_quote_version or q.status<>'REVIEW' then
    raise exception 'QUOTE-ENGINE Quote is not sendable at expected version';
  end if;

  select * into r from public.quote_version_reviews
  where organization_id=p_organization_id and quote_id=p_quote_id and version_no=q.current_version;
  select * into v_version from public.quote_versions
  where organization_id=p_organization_id and quote_id=p_quote_id and version_no=q.current_version;
  if r.status not in ('APPROVED','NOT_REQUIRED') then raise exception 'QUOTE-ENGINE approval is incomplete'; end if;
  if v_version.valid_until<=v_now then raise exception 'QUOTE-ENGINE Quote version is already expired'; end if;

  v_hash:=md5(jsonb_build_object('quoteId',p_quote_id,'versionNo',q.current_version,'expected',p_expected_quote_version)::text);
  if private.quote_engine_is_replay(p_organization_id,'QUOTE_ENGINE_SENT',p_quote_id::text,p_request_key,v_hash)
  then return 'SENT'; end if;

  perform set_config('app.quote_engine_mutation','allowed',true);
  update public.quotes set status='SENT',sent_at=v_now,version=version+1,updated_by_user_id=p_actor_user_id,updated_at=v_now
  where organization_id=p_organization_id and id=p_quote_id;
  v_event:=private.quote_engine_event(p_organization_id,p_quote_id,q.current_version,'SENT','REVIEW','SENT',
    'USER',p_actor_user_id,'qe:'||md5(p_request_key||':event'),v_hash,jsonb_build_object('versionNo',q.current_version));
  perform set_config('app.quote_engine_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id,branch_id)
  values (p_organization_id,'USER',p_actor_user_id::text,'QUOTE_ENGINE_SENT','quote',p_quote_id::text,
    jsonb_build_object('requestHash',v_hash,'versionNo',q.current_version,'lifecycleEventId',v_event),
    p_request_key,q.tenant_business_id,q.branch_id);
  return 'SENT';
exception when others then perform set_config('app.quote_engine_mutation','0',true); raise;
end;
$$;

create or replace function public.record_quote_viewed_v1(
  p_organization_id uuid,
  p_quote_id uuid,
  p_evidence jsonb,
  p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare q public.quotes%rowtype; v_hash text; v_now timestamptz:=statement_timestamp(); v_event uuid;
begin
  if current_user<>'service_role' or p_evidence is null or jsonb_typeof(p_evidence)<>'object'
     or p_evidence='{}'::jsonb or octet_length(p_evidence::text)>8192
  then raise exception 'QUOTE-ENGINE viewed evidence is invalid'; end if;
  select * into q from public.quotes where organization_id=p_organization_id and id=p_quote_id for update;
  if not found or q.status not in ('SENT','VIEWED') then raise exception 'QUOTE-ENGINE Quote is not viewable'; end if;
  v_hash:=md5(jsonb_build_object('quoteId',p_quote_id,'evidence',p_evidence)::text);
  if private.quote_engine_is_replay(p_organization_id,'QUOTE_ENGINE_VIEWED',p_quote_id::text,p_request_key,v_hash)
  then return 'VIEWED'; end if;

  perform set_config('app.quote_engine_mutation','allowed',true);
  update public.quotes set status='VIEWED',viewed_at=coalesce(viewed_at,v_now),version=version+1,updated_at=v_now
  where organization_id=p_organization_id and id=p_quote_id;
  v_event:=private.quote_engine_event(p_organization_id,p_quote_id,q.current_version,'VIEWED',q.status,'VIEWED',
    'CUSTOMER',null,'qe:'||md5(p_request_key||':event'),v_hash,p_evidence);
  perform set_config('app.quote_engine_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id,branch_id)
  values (p_organization_id,'SYSTEM','quote_portal','QUOTE_ENGINE_VIEWED','quote',p_quote_id::text,
    jsonb_build_object('requestHash',v_hash,'versionNo',q.current_version,'lifecycleEventId',v_event,'evidence',p_evidence),
    p_request_key,q.tenant_business_id,q.branch_id);
  return 'VIEWED';
exception when others then perform set_config('app.quote_engine_mutation','0',true); raise;
end;
$$;

create or replace function public.record_quote_customer_decision_v1(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_quote_id uuid,
  p_decision text,
  p_evidence_source text,
  p_evidence jsonb,
  p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  q public.quotes%rowtype;
  v_decision text:=upper(btrim(coalesce(p_decision,'')));
  v_source text:=upper(btrim(coalesce(p_evidence_source,'')));
  v_hash text;
  v_to text;
  v_actor_type text;
  v_now timestamptz:=statement_timestamp();
  v_event uuid;
begin
  if current_user<>'service_role'
     or v_decision not in ('ACCEPT','REJECT')
     or v_source not in ('CUSTOMER_AUTHENTICATED','PROVIDER_VERIFIED','MANUAL_CONFIRMED')
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object'
     or p_evidence='{}'::jsonb or octet_length(p_evidence::text)>8192
  then raise exception 'QUOTE-ENGINE customer decision evidence is invalid'; end if;

  select * into q from public.quotes where organization_id=p_organization_id and id=p_quote_id for update;
  if not found or q.status not in ('SENT','VIEWED') then
    raise exception 'QUOTE-ENGINE Quote is not awaiting customer decision';
  end if;

  if v_source='MANUAL_CONFIRMED' then
    if p_actor_user_id is null then raise exception 'QUOTE-ENGINE manual decision requires actor'; end if;
    perform private.quote_engine_assert_manage(p_organization_id,p_actor_user_id,q.owner_user_id);
    v_actor_type:='USER';
  else
    if p_actor_user_id is not null then raise exception 'QUOTE-ENGINE external decision must not impersonate a user'; end if;
    v_actor_type:=case when v_source='CUSTOMER_AUTHENTICATED' then 'CUSTOMER' else 'PROVIDER' end;
  end if;

  v_to:=case when v_decision='ACCEPT' then 'ACCEPTED' else 'REJECTED' end;
  v_hash:=md5(jsonb_build_object('quoteId',p_quote_id,'decision',v_decision,'source',v_source,'evidence',p_evidence)::text);
  if private.quote_engine_is_replay(p_organization_id,'QUOTE_ENGINE_CUSTOMER_DECISION',p_quote_id::text,p_request_key,v_hash)
  then return v_to; end if;

  perform set_config('app.quote_engine_mutation','allowed',true);
  update public.quotes
  set status=v_to,
      accepted_at=case when v_to='ACCEPTED' then v_now else accepted_at end,
      rejected_at=case when v_to='REJECTED' then v_now else rejected_at end,
      version=version+1,updated_by_user_id=coalesce(p_actor_user_id,updated_by_user_id),updated_at=v_now
  where organization_id=p_organization_id and id=p_quote_id;
  v_event:=private.quote_engine_event(
    p_organization_id,p_quote_id,q.current_version,
    case when v_to='ACCEPTED' then 'ACCEPTED' else 'REJECTED' end,
    q.status,v_to,v_actor_type,p_actor_user_id,'qe:'||md5(p_request_key||':event'),v_hash,
    jsonb_build_object('source',v_source,'evidence',p_evidence)
  );
  perform set_config('app.quote_engine_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id,branch_id)
  values (
    p_organization_id,
    case when v_actor_type='USER' then 'USER' else 'SYSTEM' end,
    case when p_actor_user_id is not null then p_actor_user_id::text else lower(v_source) end,
    'QUOTE_ENGINE_CUSTOMER_DECISION','quote',p_quote_id::text,
    jsonb_build_object('requestHash',v_hash,'decision',v_to,'source',v_source,'versionNo',q.current_version,'lifecycleEventId',v_event),
    p_request_key,q.tenant_business_id,q.branch_id
  );
  return v_to;
exception when others then perform set_config('app.quote_engine_mutation','0',true); raise;
end;
$$;

create or replace function public.expire_quote_v1(
  p_organization_id uuid,
  p_quote_id uuid,
  p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare q public.quotes%rowtype; v public.quote_versions%rowtype; v_hash text; v_now timestamptz:=statement_timestamp(); v_event uuid;
begin
  if current_user<>'service_role' then raise exception 'QUOTE-ENGINE expiry requires trusted server boundary'; end if;
  select * into q from public.quotes where organization_id=p_organization_id and id=p_quote_id for update;
  if not found or q.status not in ('DRAFT','REVIEW','SENT','VIEWED') then raise exception 'QUOTE-ENGINE Quote is not expirable'; end if;
  select * into v from public.quote_versions where organization_id=p_organization_id and quote_id=p_quote_id and version_no=q.current_version;
  if v.valid_until>v_now then raise exception 'QUOTE-ENGINE Quote is not yet expired'; end if;
  v_hash:=md5(jsonb_build_object('quoteId',p_quote_id,'versionNo',q.current_version,'validUntil',v.valid_until)::text);
  if private.quote_engine_is_replay(p_organization_id,'QUOTE_ENGINE_EXPIRED',p_quote_id::text,p_request_key,v_hash)
  then return 'EXPIRED'; end if;

  perform set_config('app.quote_engine_mutation','allowed',true);
  update public.quotes set status='EXPIRED',expired_at=v_now,version=version+1,updated_at=v_now
  where organization_id=p_organization_id and id=p_quote_id;
  v_event:=private.quote_engine_event(p_organization_id,p_quote_id,q.current_version,'EXPIRED',q.status,'EXPIRED',
    'SYSTEM',null,'qe:'||md5(p_request_key||':event'),v_hash,jsonb_build_object('validUntil',v.valid_until));
  perform set_config('app.quote_engine_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id,branch_id)
  values (p_organization_id,'SYSTEM','quote_expiry','QUOTE_ENGINE_EXPIRED','quote',p_quote_id::text,
    jsonb_build_object('requestHash',v_hash,'versionNo',q.current_version,'lifecycleEventId',v_event),
    p_request_key,q.tenant_business_id,q.branch_id);
  return 'EXPIRED';
exception when others then perform set_config('app.quote_engine_mutation','0',true); raise;
end;
$$;

create or replace function public.record_quote_conversion_v1(
  p_organization_id uuid,
  p_quote_id uuid,
  p_conversion_kind text,
  p_conversion_reference text,
  p_evidence jsonb,
  p_request_key text
)
returns text
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $$
declare
  q public.quotes%rowtype;
  v_kind text:=upper(btrim(coalesce(p_conversion_kind,'')));
  v_ref text:=btrim(coalesce(p_conversion_reference,''));
  v_hash text;
  v_now timestamptz:=statement_timestamp();
  v_event uuid;
begin
  if current_user<>'service_role' or v_kind not in ('ORDER','EXTERNAL_ORDER')
     or length(v_ref) not between 1 and 512
     or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb
     or octet_length(p_evidence::text)>8192
  then raise exception 'QUOTE-ENGINE conversion evidence is invalid'; end if;
  select * into q from public.quotes where organization_id=p_organization_id and id=p_quote_id for update;
  if not found or q.status<>'ACCEPTED' then raise exception 'QUOTE-ENGINE only accepted Quote can record conversion'; end if;

  v_hash:=md5(jsonb_build_object('quoteId',p_quote_id,'kind',v_kind,'reference',v_ref,'evidence',p_evidence)::text);
  if private.quote_engine_is_replay(p_organization_id,'QUOTE_ENGINE_CONVERTED',p_quote_id::text,p_request_key,v_hash)
  then return 'CONVERTED'; end if;

  perform set_config('app.quote_engine_mutation','allowed',true);
  update public.quotes
  set status='CONVERTED',converted_at=v_now,conversion_kind=v_kind,conversion_reference=v_ref,
      conversion_evidence=p_evidence,version=version+1,updated_at=v_now
  where organization_id=p_organization_id and id=p_quote_id;
  v_event:=private.quote_engine_event(p_organization_id,p_quote_id,q.current_version,'CONVERTED','ACCEPTED','CONVERTED',
    'SYSTEM',null,'qe:'||md5(p_request_key||':event'),v_hash,jsonb_build_object('kind',v_kind,'reference',v_ref,'evidence',p_evidence));
  perform set_config('app.quote_engine_mutation','0',true);

  insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id,branch_id)
  values (p_organization_id,'SYSTEM','quote_conversion','QUOTE_ENGINE_CONVERTED','quote',p_quote_id::text,
    jsonb_build_object('requestHash',v_hash,'kind',v_kind,'reference',v_ref,'lifecycleEventId',v_event,'orderTruthCreatedByQuoteEngine',false),
    p_request_key,q.tenant_business_id,q.branch_id);
  return 'CONVERTED';
exception when others then perform set_config('app.quote_engine_mutation','0',true); raise;
end;
$$;

-- Quote acceptance now has a durable canonical producer. The catalog remains metadata only.
update public.automation_trigger_catalog
set availability='AVAILABLE',
    required_work_package=null,
    description='Canonical QUOTE-ENGINE acceptance event is produced from durable Quote lifecycle evidence.'
where trigger_key='QUOTE_ACCEPTED'
  and required_work_package='QUOTE-ENGINE';

create or replace function public.reconcile_quote_automation_events(p_limit integer default 100)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare
  e record;
  v_source_key text;
  v_result jsonb;
  v_processed integer:=0;
  v_enqueued integer:=0;
  v_replayed integer:=0;
begin
  if current_user<>'service_role' or p_limit not between 1 and 1000 then
    raise exception 'Quote automation reconciliation is not permitted';
  end if;

  for e in
    select qle.id,qle.organization_id,qle.quote_id,qle.quote_version_no,qle.evidence,qle.occurred_at
    from public.quote_lifecycle_events qle
    where qle.transition='ACCEPTED'
      and not exists(
        select 1 from public.audit_logs a
        where a.organization_id=qle.organization_id
          and a.action='QUOTE_AUTOMATION_EVENT_PROJECTED'
          and a.correlation_id='quote-lifecycle:'||qle.id::text
      )
    order by qle.occurred_at,qle.id
    for update skip locked
    limit p_limit
  loop
    v_source_key:='quote-lifecycle:'||e.id::text;
    v_result:=public.enqueue_automation_runtime_event(
      e.organization_id,'QUOTE_ACCEPTED',v_source_key,
      null,null,
      jsonb_build_object(
        'quoteId',e.quote_id,'versionNo',e.quote_version_no,
        'lifecycleEventId',e.id,'evidence',e.evidence
      ),
      e.occurred_at
    );

    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
    ) values (
      e.organization_id,'SYSTEM','quote_engine',
      'QUOTE_AUTOMATION_EVENT_PROJECTED','quote',e.quote_id::text,
      jsonb_build_object('triggerKey','QUOTE_ACCEPTED','lifecycleEventId',e.id,'runtime',v_result),
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

-- Customer 360 V3 composes Quote truth without rewriting the existing V2 authority.
create or replace function public.get_crm_customer360_v3(
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
declare v_base jsonb; v_quotes jsonb;
begin
  v_base:=public.get_crm_customer360_v2(p_organization_id,p_person_id,p_limit);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'quoteNumber',q.quote_number,'status',q.status,
    'buyerBusinessId',q.buyer_business_id,'dealId',q.deal_id,
    'ownerUserId',q.owner_user_id,'currentVersion',q.current_version,
    'total',v.total,'currency',v.currency,'validUntil',v.valid_until,
    'updatedAt',q.updated_at
  ) order by q.updated_at desc,q.id),'[]'::jsonb)
  into v_quotes
  from (
    select * from public.quotes
    where organization_id=p_organization_id and person_id=p_person_id
    order by updated_at desc,id limit p_limit
  ) q
  left join public.quote_versions v
    on v.organization_id=q.organization_id and v.quote_id=q.id and v.version_no=q.current_version;

  v_base:=jsonb_set(v_base,'{quotes}',v_quotes,true);
  v_base:=jsonb_set(v_base,'{moduleStatus,quotes}','"IMPLEMENTED"'::jsonb,true);
  return v_base;
end;
$$;

-- Public functions are trusted-server only except Customer360 read composition.
revoke all on function public.guard_quote_engine_mutation() from public,anon,authenticated,service_role;
revoke all on function private.quote_engine_actor_role(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.quote_engine_assert_manage(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.quote_engine_is_replay(uuid,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.quote_engine_event(uuid,uuid,integer,text,text,text,text,uuid,text,text,jsonb) from public,anon,authenticated,service_role;

grant execute on function private.quote_engine_actor_role(uuid,uuid) to service_role;
grant execute on function private.quote_engine_assert_manage(uuid,uuid,uuid) to service_role;
grant execute on function private.quote_engine_is_replay(uuid,text,text,text,text) to service_role;
grant execute on function private.quote_engine_event(uuid,uuid,integer,text,text,text,text,uuid,text,text,jsonb) to service_role;

revoke all on function public.create_quote_version_v1(uuid,uuid,uuid,integer,text,text,timestamptz,text,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.create_quote_version_v1(uuid,uuid,uuid,integer,text,text,timestamptz,text,text,jsonb,text)
  to service_role;

revoke all on function public.create_quote_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.create_quote_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,jsonb,text)
  to service_role;

revoke all on function public.submit_quote_review_v1(uuid,uuid,uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.submit_quote_review_v1(uuid,uuid,uuid,integer,text) to service_role;

revoke all on function public.decide_quote_review_v1(uuid,uuid,uuid,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.decide_quote_review_v1(uuid,uuid,uuid,text,text,text) to service_role;

revoke all on function public.mark_quote_sent_v1(uuid,uuid,uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mark_quote_sent_v1(uuid,uuid,uuid,integer,text) to service_role;

revoke all on function public.record_quote_viewed_v1(uuid,uuid,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_quote_viewed_v1(uuid,uuid,jsonb,text) to service_role;

revoke all on function public.record_quote_customer_decision_v1(uuid,uuid,uuid,text,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_quote_customer_decision_v1(uuid,uuid,uuid,text,text,jsonb,text) to service_role;

revoke all on function public.expire_quote_v1(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.expire_quote_v1(uuid,uuid,text) to service_role;

revoke all on function public.record_quote_conversion_v1(uuid,uuid,text,text,jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.record_quote_conversion_v1(uuid,uuid,text,text,jsonb,text) to service_role;

revoke all on function public.reconcile_quote_automation_events(integer)
  from public,anon,authenticated,service_role;
grant execute on function public.reconcile_quote_automation_events(integer) to service_role;

revoke all on function public.get_crm_customer360_v3(uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_crm_customer360_v3(uuid,uuid,integer) to authenticated,service_role;
