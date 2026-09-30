import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0158_booking_availability.sql','utf8');
const page=readFileSync('app/booking/availability/page.tsx','utf8');
const actions=readFileSync('app/booking/availability-actions.ts','utf8');
const worker=readFileSync('worker/index.ts','utf8');
const route=readFileSync('app/api/operations/booking-holds/route.ts','utf8');
const nav=readFileSync('app/app-shell.tsx','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('BOOKING-AVAILABILITY contract',()=>{
  it('adds availability child state without inventing a booking lifecycle store',()=>{
    for(const table of [
      'booking_availability_calendars',
      'booking_availability_windows',
      'booking_availability_exceptions',
      'booking_holds',
      'booking_hold_resources',
    ]) expect(migration).toContain('public.'+table);
    expect(migration).not.toMatch(/create table public\.(bookings|appointments|reservations)\b/i);
  });

  it('covers calendars business hours holidays timezone capacity conflicts and holds',()=>{
    for(const marker of [
      "'BUSINESS','STAFF','RESOURCE'",
      "'HOLIDAY','TIME_OFF','BUSY','MAINTENANCE','SPECIAL_HOURS','MANUAL'",
      'booking_assert_timezone',
      'capacity_per_slot',
      'RESOURCE_CAPACITY_FULL',
      'STAFF_UNAVAILABLE',
      'create_booking_hold',
      'release_booking_hold',
      'expire_booking_holds',
    ]) expect(migration).toContain(marker);
  });

  it('uses deterministic governed commands and an organization lock for hold races',()=>{
    expect(migration).toContain("hashtextextended('booking-hold:'||p_organization_id::text,0)");
    expect(migration).toContain('Booking hold request key conflict');
    expect(migration).toContain('Booking availability state requires governed command');
    expect(migration).toContain('get_booking_availability');
    expect(migration).toContain('evaluate_booking_slot');
  });

  it('keeps canonical branch staff service and resource authorities',()=>{
    expect(migration).toContain('references public.service_booking_profiles');
    expect(migration).toContain('references public.branches');
    expect(migration).toContain('references public.organization_members');
    expect(migration).toContain('references public.booking_resources');
    expect(migration).not.toMatch(/create table public\.(booking_staff|booking_branches|booking_services)\b/i);
  });

  it('keeps trusted mutation server-only and read surfaces SECURITY INVOKER',()=>{
    expect(migration).not.toContain('security definer');
    expect(migration).toContain('to authenticated,service_role');
    expect(migration).toContain('from public,anon,authenticated;');
    expect(actions).toContain("rpc('configure_booking_availability_calendar'");
    expect(actions).toContain("rpc('create_booking_hold'");
    expect(actions).toContain("rpc('release_booking_hold'");
  });

  it('ships an owner operations surface and scheduled hold expiry',()=>{
    expect(page).toContain('Booking Availability');
    expect(page).toContain('Deterministic availability preview');
    expect(page).toContain('Create 10m hold');
    expect(nav).toContain("['Booking Availability', '/booking/availability']");
    expect(route).toContain("rpc('expire_booking_holds'");
    expect(worker).toContain("'/api/operations/booking-holds'");
    expect(worker).toContain('bookingHoldsExpired');
  });

  it('runs PostgreSQL controlled acceptance in CI',()=>{
    expect(ci).toContain('booking-availability-smoke.sql');
  });
});
