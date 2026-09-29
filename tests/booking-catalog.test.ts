import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0157_booking_catalog.sql','utf8');
const page=readFileSync('app/services/page.tsx','utf8');
const actions=readFileSync('app/control-center-actions.ts','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('BOOKING-CATALOG contract',()=>{
  it('extends canonical services instead of creating a second service/staff/branch catalog',()=>{
    expect(migration).toContain('references public.services(organization_id,id)');
    expect(migration).toContain('references public.branches(organization_id,id)');
    expect(migration).toContain('references public.organization_members(organization_id,user_id)');
    expect(migration).toContain('create table public.service_booking_profiles');
    expect(migration).not.toMatch(/create table public\.(booking_services|booking_staff|booking_branches|service_catalog)/i);
  });

  it('models every required catalog dimension',()=>{
    for(const marker of [
      'duration_minutes',
      'buffer_before_minutes',
      'buffer_after_minutes',
      'capacity_per_slot',
      'location_mode',
      'staff_mode',
      'eligible_staff_roles',
      'booking_rules',
      'service_booking_branches',
      'service_booking_staff',
      'service_booking_resource_requirements',
    ]) expect(migration).toContain(marker);
  });

  it('introduces one canonical booking resource registry with branch-aware capacity',()=>{
    expect(migration).toContain('create table public.booking_resources');
    expect(migration).toContain("'ROOM','EQUIPMENT','VEHICLE','SPACE','CAPACITY_POOL','OTHER'");
    expect(migration).toContain('capacity integer not null default 1');
    expect(migration).toContain('booking_resources_branch_fk');
  });

  it('keeps booking profile mutation atomic and replay safe',()=>{
    expect(migration).toContain('configure_service_booking_catalog');
    expect(migration).toContain('Booking catalog request key conflict');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('audit_logs_booking_catalog_request_uidx');
    expect(migration).toContain('Booking catalog child state requires governed configuration command');
    expect(migration).toContain("set_config('app.booking_catalog_mutation','allowed',true)");
  });

  it('uses bounded typed booking rules rather than free-form executable logic',()=>{
    expect(migration).toContain('validate_service_booking_rules');
    for(const key of [
      'minimumNoticeMinutes',
      'maximumAdvanceDays',
      'cancellationNoticeMinutes',
      'slotIncrementMinutes',
      'allowCustomerCancel',
      'allowCustomerReschedule',
      'requiresConfirmation',
    ]) expect(migration).toContain(key);
    expect(migration).toContain('Unknown booking rule');
  });

  it('prevents invalid explicit scope and resource capacity combinations',()=>{
    expect(migration).toContain('Explicit branch mode requires at least one branch');
    expect(migration).toContain('Explicit staff mode requires at least one staff member');
    expect(migration).toContain('Booking resource is missing, inactive, over capacity, or incompatible with location scope');
    expect(migration).toContain("rb.status='ACTIVE'");
  });

  it('extends the existing Services surface and governed actions',()=>{
    expect(page).toContain('Booking catalog');
    expect(page).toContain('Duration');
    expect(page).toContain('Buffer before');
    expect(page).toContain('Capacity / slot');
    expect(page).toContain('Required resources');
    expect(actions).toContain("rpc('configure_service_booking_catalog'");
    expect(actions).toContain('createBookingResource');
    expect(actions).toContain('updateBookingResource');
  });

  it('runs controlled PostgreSQL acceptance in CI',()=>{
    expect(ci).toContain('booking-catalog-smoke.sql');
  });
});
