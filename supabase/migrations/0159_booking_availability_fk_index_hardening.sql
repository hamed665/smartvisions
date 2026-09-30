-- 0159: BOOKING-AVAILABILITY foreign-key index hardening
-- Cover the three composite foreign keys reported by the Production advisor.
-- Index-only hotfix: no data mutation and no Booking semantic change.

create index booking_hold_resources_org_hold_fk_idx
  on public.booking_hold_resources(organization_id,hold_id);

create index booking_holds_org_branch_fk_idx
  on public.booking_holds(organization_id,branch_id);

create index booking_holds_org_created_by_fk_idx
  on public.booking_holds(organization_id,created_by_user_id);
