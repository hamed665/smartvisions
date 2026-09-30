import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0161_booking_ai.sql','utf8');
const tools=readFileSync('lib/booking/ai-tools.ts','utf8');
const route=readFileSync('app/api/ai/process-inbound/route.ts','utf8');
const pipeline=readFileSync('lib/agents/pipeline.ts','utf8');
const context=readFileSync('lib/agents/context-hydrator-core.ts','utf8');
const openai=readFileSync('lib/agents/openai-runtime-core.ts','utf8');
const runtime=readFileSync('lib/automation/runtime.ts','utf8');
const automationsPage=readFileSync('app/automations/page.tsx','utf8');
const builder=readFileSync('components/automations/AutomationBuilder.tsx','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('BOOKING-AI contract',()=>{
  it('reuses canonical Booking and Automation authorities',()=>{
    for(const marker of [
      'execute_booking_ai_create','execute_booking_ai_reschedule','execute_booking_ai_cancel',
      'create_booking_hold','request_booking','hold_booking_request','confirm_booking',
      'reschedule_booking','cancel_booking','enqueue_automation_runtime_event',
      'create_automation_operator_brief',
    ]) expect(migration+tools).toContain(marker);
    expect(migration).not.toMatch(/create table public\.(booking_ai|booking_reminder|booking_agent|booking_queue)/i);
    expect(migration).not.toMatch(/create table public\.(payments|payment_intents|payment_links)/i);
  });

  it('registers AI-only typed tools without leaking them into Automation Builder',()=>{
    for(const key of [
      'BOOKING_CHECK_AVAILABILITY','BOOKING_CREATE','BOOKING_RESCHEDULE',
      'BOOKING_CANCEL','BOOKING_SCHEDULE_REMINDER','BOOKING_ESCALATE',
      'BOOKING_DEPOSIT_REQUIREMENT',
    ]) expect(migration).toContain(key);
    expect(migration).toContain('"executionSurfaces":["AI"]');
    expect(migration).toContain('Automation action is not available on AUTOMATION execution surface');
    expect(automationsPage).toContain("surfaces.includes('AUTOMATION')");
  });

  it('promotes only cataloged Booking triggers and adds canonical Booking facts',()=>{
    for(const trigger of ['BOOKING_CREATED','BOOKING_CONFIRMED','BOOKING_CANCELLED']){
      expect(migration).toContain(trigger);
    }
    expect(migration).toContain("when 'BOOKING' then 'BOOKING'");
    expect(migration).toContain("'BOOKING.STATUS'");
    expect(migration).toContain('reconcile_booking_automation_events');
    expect(runtime).toContain("rpc(\n    'reconcile_booking_automation_events'");
    expect(builder).toContain("BOOKING: 'BOOKING'");
  });

  it('keeps mutations fail closed behind current inbound evidence and Shadow Mode',()=>{
    expect(tools).toContain('explicitCustomerRequest');
    expect(tools).toContain('inboundVerified');
    expect(tools).toContain("if (mutation && input.shadowMode)");
    expect(tools).toContain("status:'SHADOW_BLOCKED'");
    expect(route).toContain('afterOrchestrator');
    expect(pipeline).toContain('bookingToolResult');
    expect(pipeline).toContain('BOOKING_TOOL_REQUIRES_REVIEW');
  });

  it('gives secretary verified tool evidence before customer reply composition',()=>{
    expect(pipeline.indexOf('hooks.afterOrchestrator')).toBeLessThan(pipeline.indexOf("runAgent('secretary'"));
    expect(openai).toContain('booking_tool_proposal');
    expect(openai).toContain('never tell the customer that a booking');
    expect(context).toContain('bookingContext');
    expect(context).toContain("from('bookings')");
  });

  it('keeps reminders and deposits inside existing authorities',()=>{
    expect(tools).toContain("p_trigger_key:'SCHEDULE_DUE'");
    expect(tools).toContain("providerSendAuthority:'SEND_FOLLOWUP'");
    expect(migration).toContain("'paymentExecutionAvailable',false");
    expect(migration).toContain("'paymentExecutionDependency','PAYMENT-CORE'");
    expect(migration).not.toContain('PAYMENT_CAPTURED_BY_BOOKING_AI');
  });

  it('uses honest SYSTEM attribution instead of fabricating a member',()=>{
    expect(migration).toContain("case when p_actor_user_id is null then 'SYSTEM' else 'USER' end");
    expect(migration).toContain("coalesce(p_actor_user_id::text,'booking_ai')");
    expect(migration).toContain('alter column created_by_user_id drop not null');
    expect(migration).toContain('alter column updated_by_user_id drop not null');
  });

  it('runs controlled PostgreSQL acceptance in CI',()=>{
    expect(ci).toContain('booking-ai-smoke.sql');
  });
});
