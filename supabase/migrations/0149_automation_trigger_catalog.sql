-- AUTO-TRIGGER-CATALOG
-- Adds a governed reference catalog for workflow trigger contracts.
-- This catalog stores trigger definitions only. It does not persist trigger
-- occurrences and does not create an event bus, executor, queue, outbox or
-- second workflow authority.

create table public.automation_trigger_catalog (
  trigger_key text primary key,
  family text not null check (family in (
    'MESSAGE','CUSTOMER','LEAD','DEAL','TASK','SEGMENT','BOOKING',
    'QUOTE','ORDER','INVOICE','PAYMENT','CASE','SCHEDULE',
    'PROVIDER_WEBHOOK','CUSTOM_INTEGRATION'
  )),
  source_kind text not null check (source_kind in (
    'DOMAIN_EVENT','SCHEDULE','PROVIDER_WEBHOOK','CUSTOM_INTEGRATION'
  )),
  event_name text,
  schema_version integer not null default 1 check (schema_version >= 1),
  aggregate_type text,
  availability text not null check (availability in (
    'AVAILABLE','DEPENDENCY_PENDING','DEPRECATED'
  )),
  required_work_package text,
  description text not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint automation_trigger_catalog_key_check
    check (trigger_key ~ '^[A-Z][A-Z0-9_.:-]{0,127}$'),
  constraint automation_trigger_catalog_event_name_check
    check (
      event_name is null
      or event_name ~ '^[a-z][a-z0-9_.-]*[.]v[1-9][0-9]*$'
    )
);

comment on table public.automation_trigger_catalog is
  'System-owned workflow trigger contract catalog. Reference metadata only; never a trigger occurrence store, event bus, queue or executor.';

create index automation_trigger_catalog_family_idx
  on public.automation_trigger_catalog(family,availability,trigger_key);

insert into public.automation_trigger_catalog(
  trigger_key,family,source_kind,event_name,schema_version,aggregate_type,
  availability,required_work_package,description
) values
  ('MESSAGE_RECEIVED','MESSAGE','DOMAIN_EVENT','conversation.message.received.v1',1,'conversation','AVAILABLE',null,'A canonical inbound conversation message was received.'),
  ('MESSAGE_SENT','MESSAGE','DOMAIN_EVENT','conversation.message.sent.v1',1,'conversation','AVAILABLE',null,'A canonical outbound conversation message was recorded as sent.'),
  ('CUSTOMER_LIFECYCLE_CHANGED','CUSTOMER','DOMAIN_EVENT','customer.lifecycle_changed.v1',1,'account','AVAILABLE',null,'Canonical Account customer lifecycle changed with governed evidence.'),
  ('LEAD_QUALIFIED','LEAD','DOMAIN_EVENT','lead.qualified.v1',1,'lead','AVAILABLE',null,'Canonical Lead entered qualified state.'),
  ('HOT_LEAD','LEAD','DOMAIN_EVENT','lead.hot.v1',1,'lead','AVAILABLE',null,'Canonical Lead entered governed HOT state.'),
  ('POSITIVE_REPLY','LEAD','DOMAIN_EVENT','lead.positive_reply.v1',1,'lead','AVAILABLE',null,'Canonical reply evidence classified as positive for a Lead.'),
  ('NO_REPLY_48H','LEAD','SCHEDULE','automation.schedule.no_reply_48h.v1',1,'lead','AVAILABLE',null,'Scheduled no-reply boundary over canonical conversation evidence.'),
  ('DEAL_STAGE_CHANGED','DEAL','DOMAIN_EVENT','deal.stage_changed.v1',1,'deal','AVAILABLE',null,'Canonical Deal stage changed.'),
  ('DEAL_WON','DEAL','DOMAIN_EVENT','deal.won.v1',1,'deal','AVAILABLE',null,'Canonical Deal reached WON terminal state.'),
  ('DEAL_LOST','DEAL','DOMAIN_EVENT','deal.lost.v1',1,'deal','AVAILABLE',null,'Canonical Deal reached LOST terminal state.'),
  ('TASK_STATUS_CHANGED','TASK','DOMAIN_EVENT','crm.task.status_changed.v1',1,'crm_task','AVAILABLE',null,'Canonical CRM Task status changed.'),
  ('TASK_COMPLETED','TASK','DOMAIN_EVENT','crm.task.completed.v1',1,'crm_task','AVAILABLE',null,'Canonical CRM Task completed.'),
  ('SEGMENT_MEMBER_ENTERED','SEGMENT','DOMAIN_EVENT','segment.member.entered.v1',1,'segment','DEPENDENCY_PENDING','AUTO-RUNTIME','Segment-entry detection contract exists but no durable runtime producer is claimed yet.'),
  ('SEGMENT_SNAPSHOT_CREATED','SEGMENT','DOMAIN_EVENT','segment.snapshot.created.v1',1,'segment_snapshot','AVAILABLE',null,'Immutable canonical Segment Snapshot was created.'),
  ('BOOKING_CREATED','BOOKING','DOMAIN_EVENT','booking.created.v1',1,'booking','DEPENDENCY_PENDING','BOOKING-CATALOG','Cataloged now; canonical Booking authority is not implemented yet.'),
  ('BOOKING_CONFIRMED','BOOKING','DOMAIN_EVENT','booking.confirmed.v1',1,'booking','DEPENDENCY_PENDING','BOOKING-LIFECYCLE','Cataloged now; canonical Booking lifecycle authority is not implemented yet.'),
  ('BOOKING_CANCELLED','BOOKING','DOMAIN_EVENT','booking.cancelled.v1',1,'booking','DEPENDENCY_PENDING','BOOKING-LIFECYCLE','Cataloged now; canonical Booking lifecycle authority is not implemented yet.'),
  ('QUOTE_ACCEPTED','QUOTE','DOMAIN_EVENT','quote.accepted.v1',1,'quote','DEPENDENCY_PENDING','QUOTE-ENGINE','Cataloged now; canonical Quote authority is not implemented yet.'),
  ('ORDER_CREATED','ORDER','DOMAIN_EVENT','order.created.v1',1,'order','DEPENDENCY_PENDING','ORDER-ENGINE','Cataloged now; canonical Order authority is not implemented yet.'),
  ('ORDER_STATUS_CHANGED','ORDER','DOMAIN_EVENT','order.status_changed.v1',1,'order','DEPENDENCY_PENDING','ORDER-ENGINE','Cataloged now; canonical Order authority is not implemented yet.'),
  ('INVOICE_ISSUED','INVOICE','DOMAIN_EVENT','invoice.issued.v1',1,'invoice','DEPENDENCY_PENDING','INVOICE-ENGINE','Cataloged now; canonical Invoice authority is not implemented yet.'),
  ('INVOICE_OVERDUE','INVOICE','DOMAIN_EVENT','invoice.overdue.v1',1,'invoice','DEPENDENCY_PENDING','INVOICE-ENGINE','Cataloged now; canonical Invoice authority is not implemented yet.'),
  ('PAYMENT_INTENT','PAYMENT','DOMAIN_EVENT','payment.created.v1',1,'payment','DEPENDENCY_PENDING','PAYMENT-CORE','Cataloged now; canonical Payment Core authority is not implemented yet.'),
  ('PAYMENT_CAPTURED','PAYMENT','DOMAIN_EVENT','payment.captured.v1',1,'payment','DEPENDENCY_PENDING','PAYMENT-CORE','Cataloged now; canonical Payment Core authority is not implemented yet.'),
  ('PAYMENT_FAILED','PAYMENT','DOMAIN_EVENT','payment.failed.v1',1,'payment','DEPENDENCY_PENDING','PAYMENT-CORE','Cataloged now; canonical Payment Core authority is not implemented yet.'),
  ('PAYMENT_REFUNDED','PAYMENT','DOMAIN_EVENT','payment.refunded.v1',1,'payment','DEPENDENCY_PENDING','PAYMENT-CORE','Cataloged now; canonical Payment Core authority is not implemented yet.'),
  ('CASE_CREATED','CASE','DOMAIN_EVENT','support.case.created.v1',1,'support_case','AVAILABLE',null,'Canonical Support Case was created.'),
  ('CASE_STATUS_CHANGED','CASE','DOMAIN_EVENT','support.case.status_changed.v1',1,'support_case','AVAILABLE',null,'Canonical Support Case status changed.'),
  ('SCHEDULE_DUE','SCHEDULE','SCHEDULE','automation.schedule.due.v1',1,'schedule','AVAILABLE',null,'A governed workflow schedule boundary became due.'),
  ('PROVIDER_WEBHOOK_RECEIVED','PROVIDER_WEBHOOK','PROVIDER_WEBHOOK','integration.provider_webhook.received.v1',1,'provider_webhook','AVAILABLE',null,'A verified provider webhook was normalized into canonical integration evidence.'),
  ('CUSTOM_INTEGRATION_EVENT','CUSTOM_INTEGRATION','CUSTOM_INTEGRATION','integration.custom_event.received.v1',1,'integration_event','DEPENDENCY_PENDING','DEV-INTEGRATIONS','Cataloged now; governed custom integration event ingress remains a separate Work Package.'),
  ('DEMO_APPROVED','CUSTOM_INTEGRATION','CUSTOM_INTEGRATION','integration.demo.approved.v1',1,'integration_event','DEPENDENCY_PENDING','DEV-INTEGRATIONS','Legacy trigger key retained as a cataloged dependency-pending contract.');

alter table public.automation_trigger_catalog enable row level security;

create policy automation_trigger_catalog_authenticated_read
on public.automation_trigger_catalog
for select
to authenticated
using (true);

revoke all on table public.automation_trigger_catalog
  from public,anon,authenticated,service_role;
grant select on table public.automation_trigger_catalog
  to authenticated,service_role;

create or replace function public.enforce_automation_rule_trigger_catalog()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_availability text;
begin
  select availability
    into v_availability
    from public.automation_trigger_catalog
   where trigger_key = new.trigger_key;

  if v_availability is null then
    raise exception 'Automation trigger is not cataloged: %', new.trigger_key;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_automation_published_trigger_catalog()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_availability text;
begin
  select availability
    into v_availability
    from public.automation_trigger_catalog
   where trigger_key = new.trigger_key;

  if v_availability is null then
    raise exception 'Automation trigger is not cataloged: %', new.trigger_key;
  end if;

  if v_availability <> 'AVAILABLE' then
    raise exception 'Automation trigger is not publishable: % (%)',
      new.trigger_key, v_availability;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_automation_enable_trigger_catalog()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_trigger_key text;
  v_availability text;
begin
  if new.enabled and (tg_op = 'INSERT' or old.enabled is distinct from true) then
    if new.latest_published_version <= 0 then
      return new;
    end if;

    select v.trigger_key
      into v_trigger_key
      from public.automation_rule_versions v
     where v.organization_id = new.organization_id
       and v.automation_rule_id = new.id
       and v.version = new.latest_published_version;

    if v_trigger_key is null then
      raise exception 'Automation latest published trigger snapshot is missing';
    end if;

    select availability
      into v_availability
      from public.automation_trigger_catalog
     where trigger_key = v_trigger_key;

    if v_availability is distinct from 'AVAILABLE' then
      raise exception 'Automation published trigger is not enableable: % (%)',
        v_trigger_key, coalesce(v_availability,'UNKNOWN');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists automation_rules_trigger_catalog_guard
  on public.automation_rules;
create trigger automation_rules_trigger_catalog_guard
before insert or update of trigger_key on public.automation_rules
for each row execute function public.enforce_automation_rule_trigger_catalog();

drop trigger if exists automation_rule_versions_trigger_catalog_guard
  on public.automation_rule_versions;
create trigger automation_rule_versions_trigger_catalog_guard
before insert on public.automation_rule_versions
for each row execute function public.enforce_automation_published_trigger_catalog();

drop trigger if exists automation_rules_enable_trigger_catalog_guard
  on public.automation_rules;
create trigger automation_rules_enable_trigger_catalog_guard
before insert or update of enabled on public.automation_rules
for each row execute function public.enforce_automation_enable_trigger_catalog();

revoke all on function public.enforce_automation_rule_trigger_catalog()
  from public,anon,authenticated,service_role;
revoke all on function public.enforce_automation_published_trigger_catalog()
  from public,anon,authenticated,service_role;
revoke all on function public.enforce_automation_enable_trigger_catalog()
  from public,anon,authenticated,service_role;
