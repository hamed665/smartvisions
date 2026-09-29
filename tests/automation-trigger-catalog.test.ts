import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0149_automation_trigger_catalog.sql','utf8');
const page=readFileSync('app/automations/page.tsx','utf8');
const builder=readFileSync('components/automations/AutomationBuilder.tsx','utf8');
const events=readFileSync('docs/business-os-2027/STATE_EVENT_CATALOG.md','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('AUTO-TRIGGER-CATALOG contract',()=>{
  it('covers every required trigger family without creating an event occurrence store',()=>{
    for(const family of [
      'MESSAGE','CUSTOMER','LEAD','DEAL','TASK','SEGMENT','BOOKING','QUOTE',
      'ORDER','INVOICE','PAYMENT','CASE','SCHEDULE','PROVIDER_WEBHOOK','CUSTOM_INTEGRATION',
    ]) expect(migration).toContain(`'${family}'`);

    expect(migration).toContain('Reference metadata only');
    expect(migration).not.toMatch(/create table public\.(automation_trigger_events|workflow_events|event_bus|event_queue|outbox|queue)/i);
  });

  it('fails closed on unknown triggers and blocks dependency-pending publication',()=>{
    expect(migration).toContain('Automation trigger is not cataloged');
    expect(migration).toContain('Automation trigger is not publishable');
    expect(migration).toContain("'DEPENDENCY_PENDING'");
    expect(migration).toContain('automation_rule_versions_trigger_catalog_guard');
    expect(migration).toContain('automation_rules_enable_trigger_catalog_guard');
  });

  it('keeps future domain triggers cataloged without fabricating domain authority',()=>{
    for(const key of ['BOOKING_CONFIRMED','QUOTE_ACCEPTED','ORDER_CREATED','INVOICE_ISSUED','PAYMENT_CAPTURED']){
      expect(migration).toContain(`('${key}'`);
    }
    for(const wp of ['BOOKING-LIFECYCLE','QUOTE-ENGINE','ORDER-ENGINE','INVOICE-ENGINE','PAYMENT-CORE']){
      expect(migration).toContain(wp);
    }
  });

  it('uses the database catalog in the visual builder instead of a hardcoded trigger array',()=>{
    expect(page).toContain("from('automation_trigger_catalog')");
    expect(builder).toContain('Trigger contracts');
    expect(builder).toContain("item.availability === 'AVAILABLE'");
    expect(builder).toContain('triggers.find(item => item.trigger_key === triggerKey)');
    expect(page).not.toContain('const TRIGGERS=[');
    expect(builder).not.toContain('const TRIGGERS=[');
  });

  it('aligns catalog event contracts with the reviewed state/event catalog',()=>{
    for(const event of [
      'conversation.message.received.v1',
      'customer.lifecycle_changed.v1',
      'lead.qualified.v1',
      'segment.snapshot.created.v1',
      'support.case.status_changed.v1',
      'automation.schedule.due.v1',
      'integration.custom_event.received.v1',
    ]) expect(events).toContain(event);
  });

  it('runs controlled PostgreSQL acceptance in CI',()=>{
    expect(ci).toContain('automation-trigger-catalog-smoke.sql');
  });
});
