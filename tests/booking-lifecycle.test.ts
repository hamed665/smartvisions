import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0160_booking_lifecycle.sql','utf8');
const page=readFileSync('app/booking/lifecycle/page.tsx','utf8');
const actions=readFileSync('app/booking/lifecycle-actions.ts','utf8');
const nav=readFileSync('app/app-shell.tsx','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('BOOKING-LIFECYCLE contract',()=>{
  it('creates one canonical lifecycle authority over existing catalog and availability',()=>{
    expect(migration).toContain('create table public.bookings');
    expect(migration).toContain('create table public.booking_resource_allocations');
    expect(migration).toContain('create table public.booking_lifecycle_events');
    expect(migration).toContain('references public.crm_people');
    expect(migration).toContain('references public.service_booking_profiles');
    expect(migration).toContain('references public.booking_holds');
    expect(migration).not.toMatch(/create table public\.(appointments|reservations|booking_customers)\b/i);
  });

  it('covers the approved lifecycle and audited transition commands',()=>{
    for(const marker of [
      "'REQUESTED','HELD','CONFIRMED','RESCHEDULED','CANCELED','COMPLETED','NO_SHOW'",
      'request_booking',
      'hold_booking_request',
      'confirm_booking',
      'reschedule_booking',
      'cancel_booking',
      'finalize_booking',
      'booking_lifecycle_events',
    ]) expect(migration).toContain(marker);
  });

  it('keeps confirmed bookings inside the canonical availability conflict engine',()=>{
    expect(migration).toContain("b.status in ('CONFIRMED','RESCHEDULED')");
    expect(migration).toContain('public.booking_resource_allocations');
    expect(migration).toContain('SERVICE_CAPACITY_FULL');
    expect(migration).toContain('STAFF_UNAVAILABLE');
    expect(migration).toContain('RESOURCE_CAPACITY_FULL');
  });

  it('prevents orphaned HELD bookings and direct linked-hold release',()=>{
    expect(migration).toContain('guard_linked_booking_hold_release');
    expect(migration).toContain('Booking-linked hold must be released through Booking lifecycle');
    expect(migration).toContain('HOLD_TTL_EXPIRED');
    expect(migration).toContain("set status='CANCELED',current_hold_id=null");
  });

  it('keeps trusted mutations service-role only and SECURITY INVOKER',()=>{
    expect(migration).not.toContain('security definer');
    for(const fn of [
      'request_booking',
      'hold_booking_request',
      'confirm_booking',
      'reschedule_booking',
      'cancel_booking',
      'finalize_booking',
    ]){
      expect(migration).toContain('public.'+fn);
    }
    expect(migration).toContain('from public,anon,authenticated;');
    expect(actions).toContain("rpc('request_booking'");
    expect(actions).toContain("rpc('confirm_booking'");
    expect(actions).toContain("rpc('reschedule_booking'");
  });

  it('ships an operator surface without folding BOOKING-AI into this package',()=>{
    expect(page).toContain('Canonical requested, held, confirmed, rescheduled, canceled, completed and no-show lifecycle');
    expect(page).toContain('New booking request');
    expect(page).toContain('Recent transition evidence');
    expect(nav).toContain("['Bookings', '/booking/lifecycle']");
    expect(migration).not.toMatch(/payment[_ ]link|deposit[_ ]intent|send[_ ]reminder/i);
  });

  it('runs controlled PostgreSQL acceptance in CI',()=>{
    expect(ci).toContain('booking-lifecycle-smoke.sql');
  });
});
