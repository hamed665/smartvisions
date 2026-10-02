# Business OS 2027 — Dependency-Ordered Implementation Map

## INVENTORY-FULFILLMENT Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> INVENTORY-FULFILLMENT`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical Inventory/Fulfillment scope.
- Implementation PR #401 final head `c3b5d985a195ee3e0de5a76b04f6ae7c3fbb4e9b` passed exact-head CI `37019957842`; it squash-merged to `main@406893e57218b9ef1887dcf87cb8ae9d68a28832`. Exact-main CI `37020435853` and Cloudflare Production Deploy `37020829093` succeeded on that exact merge SHA.
- Production migration `0175_inventory_fulfillment@20261002143506` is live from merged blob `6848f76bc4a3fe5c2705d2ed4de8f5610d20e864`.
- Canonical Inventory authority is now `inventory_locations`, `inventory_items`, `inventory_stock_balances`, `inventory_reservations`, immutable `inventory_movements`, and derived `inventory_low_stock_v`. Catalog Product/Variant identity remains upstream truth; `branches` remains branch identity; Order remains customer-facing commercial/fulfillment truth.
- Inventory supports BRANCH/WAREHOUSE stock locations, Product/Variant stock tracking, governed positive/negative adjustments, non-negative on-hand/reserved invariants, idempotent Order reservation/release, atomic reserved-stock consumption into existing Order fulfillment, automatic outstanding reservation release on canonical Order cancellation, low-stock evidence and audited mutations. The Business Web exposes the governed `/inventory` operator surface.
- `STOCKED` Catalog Product/Variant lines are Inventory-managed. Services and non-STOCKED Catalog lines retain the existing direct ORDER-ENGINE fulfillment path. Booking resources and Field Service material-use evidence were not repurposed as stock authority.
- Integrity hardening PR #402 final head `1bbddc86cf4b8b0d286bcd147bea2e1c9d119c9e` passed exact-head CI `37021395045`; it squash-merged to canonical `main@0a4b46e2579974a3e7391ad4e57ea9a4caae9650`. Exact-main CI `37021808114` and Cloudflare Production Deploy `37022193335` succeeded on that exact SHA.
- Production hardening migration `0176_inventory_fulfillment_integrity_hardening@20261002144704` is live from merged blob `d85274e34dde3c6245eb0d2521bfb7e6f6b1de63`. It fail-closes legacy direct ORDER-ENGINE fulfillment increases for effective STOCKED lines unless backed by the exact one-use Inventory fulfillment proof, and adds the required composite FK covering indexes.
- Production verification is side-effect clean: `inventory_locations=0`, `inventory_items=0`, `inventory_stock_balances=0`, `inventory_reservations=0`, `inventory_movements=0`, and `orders=0`. No synthetic Production Business, Product, Variant, Order, reservation, warehouse, stock movement, customer or provider evidence was created.
- Runtime/schema verification confirms the STOCKED fulfillment guard trigger/function and all three hardening indexes are live. Every Inventory foreign key has a valid leading covering index. Fresh advisor baseline remains security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. Fresh Inventory indexes are expected to appear as unused while Production Inventory remains zero-row.
- Invoice, Payment/refund, payment-provider activation and real customer stock/order evidence are not invented here; those remain with their owning Work Packages or real-data acceptance.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> INVOICE-ENGINE`.

Before mutation, fresh-audit current Order/Quote/Catalog/Inventory/Customer/Booking/Deal/tax/document/payment authorities, open PRs, current main, Production migrations/schema and any existing invoice references. INVOICE-ENGINE must produce immutable commercial invoice evidence without creating a second Order, Catalog, Customer, Payment ledger, tax authority or generic Document store.

---

## FIELD-SERVICE Production closeout — 2026-10-01

- Work Package: `SECTION BOOKING_OPERATIONS -> FIELD-SERVICE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Field Service RC scope.
- Implementation PR #372 was squash-merged to canonical `main@c9225ff366fcd1989beb5e3002dbf07a3f6906a9`; final implementation head was `f69c389133b2e0739629e31c3ddd01275243ad83`.
- Exact-head CI `36836510236` succeeded across lint, typecheck, tests, the full PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. Exact-main CI `36836878074` succeeded on the merge SHA. Cloudflare Production Deploy `36837226696` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0162_field_service` is live as version `20261001083712`; merged migration blob SHA is `9d62216932cd7a097cec10bd9ed9fd40fa329662`.
- Canonical work authority remains `crm_tasks` with `task_type=FIELD_SERVICE`; `crm_tasks.assignee_user_id` remains technician identity, `organization_members` remains staff authority, `bookings` remains scheduling authority when linked, `branches` remains branch/location authority, and `crm_support_cases` remains support-case authority. No second Task engine, Booking engine, scheduler, staff directory, location truth, notification engine or inventory truth was introduced.
- Field-specific child state is bounded to `field_service_work_orders`, `field_service_checklist_items`, `field_service_material_usage`, `field_service_evidence` and `field_service_signoffs`. All five tables are live with RLS enabled and remained zero-row after Production migration.
- Work Orders support linked Booking/Support Case/Branch, canonical/manual-confirmed/remote location evidence, manual due scheduling when no Booking is linked, technician assignment, required checklist, material-use evidence, completion summary/evidence, customer sign-off and terminal completion gating. `BOOKING_BRANCH` must resolve to the linked Booking branch and `BUSINESS_ADDRESS` requires canonical formatted-address evidence.
- Materials remain operational usage evidence only with `inventory_effect=NONE`; stock/reservation/fulfillment truth is intentionally deferred to `INVENTORY-FULFILLMENT`.
- Evidence bytes live in the private Supabase Storage bucket `field-service-evidence` with `public=false`, 15 MiB limit and MIME allowlist `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`. Authenticated users have scoped metadata read only; direct authenticated evidence INSERT/UPDATE is denied. Server-side verified finalization uses the existing service-role boundary, and download/upload access uses short-lived signed Storage URLs rather than public URLs.
- Field Service guard/audit functions are SECURITY INVOKER. Trigger-only guard/audit functions are not directly executable by `anon`, `authenticated` or `service_role`; the bounded `field_service_task_can_manage` helper is authenticated-only. Customer 360 Person linkage remains behind the canonical trusted server function rather than direct browser provenance writes.
- Production remained side-effect clean: Field Service tables 0, CRM Tasks 0, Bookings 0, Booking lifecycle events 0, Booking profiles 0, Availability calendars 0, Automation Rules 0, Outreach Messages 43, Conversation Messages 37, Usage Events 108 and Follow-up Jobs 6. No synthetic Production customer/task/work-order/evidence/sign-off data was created and no provider/customer send was used for acceptance.
- Production safety remains unchanged: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-`0162` advisors show no Field Service regression: security remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance remains unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Unused-index INFO moved from 261 to 271 only because the ten new zero-row Field Service indexes have not yet seen real traffic.
- **Not claimed here:** inventory/stock ownership, Quote/Order/Invoice/Payment execution, or provider payment activation. Those remain later Commerce/Payments Work Packages.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

Before mutation, fresh-audit current canonical service/product/catalog, pricing, branch-availability, media/portfolio, inventory-reference, Quote/Order/Invoice/Payment and Business Twin authorities plus open PRs and Production schema. Extend the existing authorities only; do not create a second service catalog, pricing truth, media store, inventory truth or commerce model.

---

## BOOKING-AI Production closeout — 2026-09-30

- Work Package: `SECTION BOOKING_OPERATIONS -> BOOKING-AI`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled AI Booking orchestration RC scope.
- Implementation PR #370 merged to canonical `main@5014ce4b7f116bd33227789180fea3500deb6f28`; final implementation head was `164e749f65055550ae750da893c9b74f6b08d46c`.
- Exact-head CI `36697287541` succeeded. Exact-main CI `36725836638` succeeded on the merge SHA. Cloudflare Production Deploy `36726229249` succeeded on that exact merge SHA.
- Production migration `0161_booking_ai` is live as version `20260930140528`; merged migration blob SHA is `0728abfcb88378f19ed7be47ef267cd61bdbf0a5`.
- BOOKING-AI extends the canonical Booking Catalog, Availability and Lifecycle plus Automation Runtime and Operator Brief authorities. It does not create a second Booking engine, scheduler, workflow runtime, approval engine, provider-send authority or payment truth.
- Seven AI-only Tool Registry actions are live and AVAILABLE: `BOOKING_CHECK_AVAILABILITY`, `BOOKING_CREATE`, `BOOKING_RESCHEDULE`, `BOOKING_CANCEL`, `BOOKING_SCHEDULE_REMINDER`, `BOOKING_ESCALATE`, and `BOOKING_DEPOSIT_REQUIREMENT`. Their execution surface is `AI`; they are not published as general Automation Builder actions.
- The six pre-existing Automation actions remain AVAILABLE, for 13 AVAILABLE Tool Registry actions total. `BOOKING_CREATED`, `BOOKING_CONFIRMED`, and `BOOKING_CANCELLED` triggers are AVAILABLE and 11 typed `BOOKING.*` condition facts are live.
- Booking AI mutation paths require canonical Conversation/Person linkage, current explicit inbound customer request evidence, bookable service/policy checks, availability/lifecycle validation and Shadow Mode gating. Reminder scheduling reuses `SCHEDULE_DUE`; downstream customer send remains owned by `SEND_FOLLOWUP`.
- Governed AI Booking functions are SECURITY INVOKER, executable by `service_role`, and denied to `authenticated` and `anon`. SYSTEM lifecycle actions use truthful `actor_type=SYSTEM` / `actor_id=booking_ai`; `bookings.created_by_user_id` and `updated_by_user_id` are nullable only for governed system mutations.
- Deposit requirement is policy-only in BOOKING-AI. `paymentExecutionAvailable=false`; execution remains a `PAYMENT-CORE` dependency. No payment intent/link/paid state is invented here.
- Production remained side-effect clean: Bookings 0, Booking lifecycle events 0, Booking profiles 0, Availability calendars 0, Automation Rules 0, Outreach Messages 43, Conversation Messages 37, Usage Events 108 and Follow-up Jobs 6. No synthetic Production customer/service/Booking/workflow/payment data was created and no provider/customer send was used for acceptance.
- Production safety remains unchanged: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-`0161` advisor baseline has no BOOKING-AI regression: security remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance remains unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Unused-index INFO is expected on fresh zero-row Booking paths.
- **Not claimed here:** payment execution or Field Service. Payment execution remains `PAYMENT-CORE`; Field Service remains its separate Work Package.

**Fresh continuation cursor:** `SECTION BOOKING_OPERATIONS -> FIELD-SERVICE`.

Before mutation, fresh-audit canonical `crm_tasks`, Bookings, Branch, Organization member/staff, Support Case, service/resource, location/address, attachment/evidence, Automation Runtime and notification authorities. Extend those authorities only; do not create a second Task engine, Booking engine, staff directory, location truth, scheduler or notification engine.

---

## BOOKING-LIFECYCLE Production closeout — 2026-09-30

- Work Package: `SECTION BOOKING_OPERATIONS -> BOOKING-LIFECYCLE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical Booking lifecycle RC scope.
- Implementation PR #368 merged to canonical `main@787fe407a50dbe676c6d5a5dbdece02bf140850f`; final implementation head was `f3c5e0754f790789ee180604f99cf6eef990100d`.
- Exact-head CI `36679109855` succeeded across lint, typecheck, tests, the complete PostgreSQL 17 migration/smoke regression chain, Next build, Vinext and Cloudflare scheduled verification. Exact-main CI `36679379186` succeeded on the merge SHA. Cloudflare Production Deploy `36679640308` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0160_booking_lifecycle` is live as version `20260930064429`; merged migration blob SHA is `859e394b09c059a387d82bdb24a5081e25c0f998`.
- Canonical lifecycle truth is `public.bookings`, with `booking_resource_allocations` as durable resource child state and `booking_lifecycle_events` as immutable/replay-safe transition evidence. Canonical CRM Person, service, branch, staff, resource, Availability/Hold, scheduler and audit authorities are reused; no second customer store, service catalog, availability engine, scheduler, workflow runtime or payment truth was introduced.
- The governed lifecycle covers `REQUESTED -> HELD -> CONFIRMED -> RESCHEDULED` plus `CANCELED`, `COMPLETED` and `NO_SHOW`, with request-key conflict protection, Organization actor authorization and audit evidence.
- `HELD` is backed by the existing `booking_holds` authority. Confirmed/rescheduled Bookings become durable capacity claims in the existing `evaluate_booking_slot` path for service capacity, staff conflicts and resource capacity. A hold linked to a HELD Booking cannot be directly released outside the lifecycle boundary.
- Existing scheduled hold expiry is reused. If a linked hold expires, the HELD Booking is atomically closed as `CANCELED / HOLD_TTL_EXPIRED` with lifecycle/audit evidence rather than being left orphaned.
- The `/booking/lifecycle` operator surface exposes request, hold attachment, confirm, reschedule, cancel, complete and no-show operations over the governed RPCs. Trusted mutation RPCs are SECURITY INVOKER and service-role executable only; authenticated Organization members have RLS-scoped read access and anon access is denied.
- Controlled PostgreSQL acceptance verified replay safety, direct-mutation rejection, hold-link protection, confirmed capacity accounting, durable resource allocations, atomic reschedule capacity movement, cancellation capacity release, completed/no-show transitions, hold-expiry closure, RLS/grants and indexes.
- Production verification was intentionally read-only and side-effect clean because no real Booking configuration is active: Booking profiles 0, Availability calendars 0, Holds 0, Bookings 0, Booking resource allocations 0 and lifecycle events 0. No synthetic Production Person/service/hold/Booking was created.
- Existing customer/provider side effects remain unchanged: Outreach Messages 43, Conversation Messages 37, Usage Events 108 and legacy Follow-up Jobs 6, all six Follow-up Jobs still PENDING. No provider call or customer send was used to prove lifecycle behavior.
- Post-`0160` advisors show no lifecycle-specific security or FK regression: security remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance remains unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Fresh zero-row lifecycle indexes appear only as expected unused-index INFO until real Booking traffic exists.
- Production safety remains unchanged and fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- **Not claimed here:** BOOKING-AI tool orchestration, reminders, escalation, deposit requirement/payment integration, or Customer 360 Booking composition. Those remain separate Work Package / acceptance scope.

**Fresh continuation cursor:** `SECTION BOOKING_OPERATIONS -> BOOKING-AI`.

Before mutation, fresh-audit current main/open PRs plus canonical Booking lifecycle/availability state, Tool/Action Registry, Automation Trigger/Condition/Runtime, notification/reminder authorities, existing AI agent/context compiler paths, approval policy and any Payment Core/deposit dependency. Extend canonical authorities only; do not create a second Booking store, availability engine, agent framework, workflow engine, approval engine, provider-send authority, scheduler or payment truth.

---


## BOOKING-AVAILABILITY Production closeout — 2026-09-30

- Work Package: `SECTION BOOKING_OPERATIONS -> BOOKING-AVAILABILITY`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled deterministic availability, conflict and temporary-hold RC scope.
- Implementation PR #365 merged to canonical `main@002cea12384b960d32748cf893ac166bd5a92b65`; final implementation head was `e7c11c7dd1b35f8cf0914149f2c14c22582fc2f9`.
- Exact-head CI `36649357938` succeeded. Exact-main CI `36650795311` succeeded on the implementation merge SHA across lint, typecheck, tests, the PostgreSQL 17 full migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. Cloudflare Production Deploy `36651003233` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0158_booking_availability` is live as version `20260930003626`; merged migration blob SHA is `ce241b8aac3565adc4fe055f05aa71727cf7f60f`.
- Canonical service and Booking configuration truth remains the existing `public.services` plus the `BOOKING-CATALOG` child state. Availability adds child operational state only through `booking_availability_calendars`, `booking_availability_windows`, `booking_availability_exceptions`, `booking_holds` and `booking_hold_resources`; it does not create a second service catalog, staff/branch/resource truth or booking lifecycle authority.
- The availability engine covers timezone-aware calendars, recurring windows, exceptions/holidays, branch/staff/resource eligibility, capacity/conflict evaluation, deterministic slot reads and replay-safe temporary holds. Hold expiry is reconciled by the existing Cloudflare scheduled runtime rather than by a second scheduler.
- Governed configuration/hold/release/expiry mutations are SECURITY INVOKER and service-role executable only. Authenticated Organization members have RLS-scoped read access; authenticated mutation and all anon access are denied. Direct partial table mutation is guarded.
- Production activation remained side-effect clean: Booking profiles 0, Booking resources 0, availability calendars 0, windows 0, exceptions 0, holds 0 and hold-resource rows 0. No synthetic Production service, staff member, resource, availability calendar or hold was created.
- Existing customer/provider side effects remained unchanged after controlled verification: Outreach Messages 43, Conversation Messages 37, Usage Events 108 and legacy Follow-up Jobs 6. No provider call or customer send was used to prove availability.
- Post-`0158` advisor verification correctly exposed three new unindexed Booking foreign keys. Hotfix PR #366 added only the three covering indexes and merged to `main@14a89a1f40d9b0b7c2e587c012dc8c824f9c19ea`; hotfix head was `2390bc481cda840ef55939cfb67be4c751976da8`.
- Hotfix exact-head CI `36651317853`, exact-main CI `36651582315` and Cloudflare Production Deploy `36651816808` all succeeded. Production migration `0159_booking_availability_fk_index_hardening` is live as version `20260930004624`; merged migration blob SHA is `e48f1ca6532793726d314028e063e320a9fa0040`.
- All three new covering indexes are live, ready and valid. Performance advisor `unindexed_foreign_keys` returned from 17 to the pre-Availability baseline 14 with zero Booking FK findings. Security remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance baseline remains auth RLS initPlan 16 and multiple permissive policies 6. Fresh zero-row indexes may appear as unused-index INFO until real Booking traffic exists.
- Production safety remains unchanged and fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- **Not claimed here:** requested/confirmed/rescheduled/canceled/completed/no-show lifecycle transitions, AI booking actions/reminders/deposit orchestration, or Field Service. Those remain separate Booking Operations Work Packages.

**Fresh continuation cursor:** `SECTION BOOKING_OPERATIONS -> BOOKING-LIFECYCLE`.

Before mutation, fresh-audit current main/open PRs plus the canonical Booking catalog and availability/hold state, any existing appointment/reservation/order/customer timeline authority, lifecycle/status transitions, audit/event producers and every booking-related UI/API path. Extend the canonical Booking authority only; do not create a second service catalog, availability engine, reservation truth, customer identity store, scheduler, payment truth or workflow engine.

---


## BOOKING-CATALOG Production closeout — 2026-09-30

- Work Package: `SECTION BOOKING_OPERATIONS -> BOOKING-CATALOG`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical service-booking catalog RC scope.
- Implementation PR #363 merged to canonical `main@c8b7b701d6354097183486923608a230c64ef0cc`; final implementation head was `e1ceb4961ae6b378756a53ee804b6f5bad64a821`.
- Exact-head CI `36646539493` succeeded across lint, typecheck, tests, the complete PostgreSQL 17 migration/smoke regression chain, Next build, Vinext and Cloudflare scheduled verification. Exact-main CI `36646895908` succeeded on the merge SHA. Cloudflare Production Deploy `36647112423` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0157_booking_catalog` is live as version `20260929235009`; merged migration blob SHA is `451800f93f9164db62aaec2bc8bdf46c24ea7918`.
- Canonical service truth remains `public.services`. Booking configuration is modeled as child state through `service_booking_profiles`, branch/staff/resource eligibility mappings and `booking_resources`; no second service catalog, staff directory, branch model, availability engine or booking lifecycle authority was introduced.
- The Booking catalog models duration, before/after buffers, capacity per slot, branch/location eligibility, staff eligibility, typed booking rules and resource requirements. Resource requirements fail closed when inactive, over capacity or incompatible with the configured location mode.
- `configure_service_booking_catalog` is the replay-safe governed configuration command with request-key conflict protection, OWNER actor authorization, advisory locking and audit evidence. Direct partial mutation of Booking child state is blocked.
- The existing `/services` surface now exposes Booking configuration and resource management over the same canonical service authority. Existing service/pricing and Telegram Owner Catalog Composer authorities remain intact.
- Production activation was intentionally side-effect clean: all 8 existing services remain enabled exactly as before, **0** have a Booking profile, **0** are bookable, Booking Resources 0, Service/Branch links 0, Service/Staff links 0 and Service/Resource requirements 0. No synthetic Production service, branch, staff, resource or booking fixture was created.
- RLS is enabled on all five Booking catalog child tables. The trusted `configure_service_booking_catalog` mutation is SECURITY INVOKER, service-role executable only and denied to authenticated/anon callers. Organization members retain governed read access.
- All four Booking FK covering indexes are present and valid: branch eligibility, staff eligibility, booking-resource branch and resource-requirement lookup indexes.
- Post-`0157` advisors show no Booking-specific regression: security remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance remains unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Fresh zero-row Booking indexes may appear as unused-index INFO until real Booking traffic exists.
- Production safety remains fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- **Not claimed here:** availability calculation, slot generation, conflict/hold/locking semantics, booking lifecycle, AI booking orchestration or Field Service. Those remain their separate Booking Operations Work Packages.

**Fresh continuation cursor:** `SECTION BOOKING_OPERATIONS -> BOOKING-AVAILABILITY`.

Before mutation, fresh-audit current main/open PRs plus canonical Booking catalog, Organization/Business/Branch timezone authority, working/business hours, staff/team eligibility, resource capacities, any existing appointment/reservation/hold/conflict tables and every availability-related code path. Extend canonical authorities only; do not create a second service catalog, branch/staff/resource truth, booking lifecycle store or parallel availability authority.

---

## AUTO-NOTIFICATIONS Production closeout — 2026-09-30

- Work Package: `SECTION AUTOMATION -> AUTO-NOTIFICATIONS`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled notification projection, preference, escalation and configured-delivery RC scope.
- Implementation PR #360 merged to canonical `main@02d7fe39897ee7cd96d6e75c45b6f2355ed99051`; final implementation head was `d02415f5e3fd55e3aed6c7c25ab7493deaf721c2`.
- Exact-head CI `36641388201` succeeded across lint, typecheck, tests, the complete PostgreSQL 17 migration/smoke regression chain, Next build, Vinext and Cloudflare scheduled verification. Exact-main CI `36642548223` succeeded on the implementation merge SHA. Cloudflare Production Deploy `36642802504` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0155_automation_notifications` is live as version `20260929230224`; merged migration blob SHA is `2eb66ee4941aadd1dc9f0fd489abd0d781f0d194`.
- Canonical business/event truth remains in existing `audit_logs`, approval evidence and Automation runtime state. `notification_inbox` is a per-member projection, `notification_delivery_receipts` is terminal delivery evidence, and `notification_projection_checkpoints` is a projection watermark. No second event bus, workflow runtime, provider-send authority or notification work queue was introduced.
- Projection is cutover-safe and lossless: existing Organizations start at the migration cutover, historical events are not replayed, and the cursor is ordered by `(created_at,id)`. Current supported source evidence is governed approval escalation/expiry plus Automation runtime dead-letter evidence.
- In-app notification read/acknowledge and per-member preferences are governed. High/critical alerts have bounded escalation; acknowledgement stops further escalation. Default role targeting keeps Automation DLQ alerts to OWNER/ADMIN and approval alerts to eligible management/reviewer recipients.
- Telegram owner delivery reuses the existing Telegram notification authority and dedupe evidence. Email delivery reuses the existing Resend/email-provider authority plus cost guard. Configuration blockers remain retryable rather than being recorded as false terminal delivery receipts.
- Production currently has no configured notification email or notification mailbox, so real email notification delivery is **BLOCKED_EXTERNAL / configuration-pending** rather than claimed as live-verified. Push remains **DEPENDENCY_PENDING** on canonical device-registration/push-provider authority. SMS remains **DEPENDENCY_PENDING** on a Production-verified `OMNI-SMS-RCS` provider route.
- Production activation was intentionally side-effect clean: notification preferences 0, notification inbox 0, delivery receipts 0, Automation Rules 0, Automation Runs 0, Runtime Actions 0, Outreach Messages 43, Conversation Messages 37, Usage Events 108, Follow-up Jobs 6, pending approvals 9 and decided approvals 0. No synthetic Production notification, runtime event or provider send was created to demonstrate the feature.
- Notification tables have RLS enabled. Trusted mutation/projection/delivery RPCs are SECURITY INVOKER, service-role executable only, and denied to authenticated/anon callers. Authenticated users receive self-scoped read access only.
- Post-`0155` advisor verification exposed exactly two new unindexed notification foreign keys. Hotfix PR #361 added covering indexes only and merged to `main@e0ce35b157ad716286b0585231f90c5874bdc380`; hotfix head was `0ddc997f72c51e403823a20411e59f0b4c3f6af0`.
- Hotfix exact-head CI `36643473325` and exact-main CI `36643793575` succeeded. Cloudflare Production Deploy `36644062870` succeeded on the exact hotfix merge SHA. Production migration `0156_automation_notifications_fk_index_hardening` is live as version `20260929231538`; merged migration blob SHA is `702a84ea9f3c365f2f3c351e949118ed304fe63e`.
- Both notification FK covering indexes are valid and ready in Production. Performance advisor `unindexed_foreign_keys` returned from 16 to the pre-Notifications baseline 14 with zero notification-specific FK findings. Security advisor remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance baseline remains auth RLS initPlan 16 and multiple permissive policies 6.
- Production safety remains fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.

**Fresh continuation cursor:** `SECTION BOOKING_OPERATIONS -> BOOKING-CATALOG`.

Before mutation, fresh-audit current main/open PRs plus existing service/product catalog, branch/location, staff/team eligibility, business hours/resources, CRM/custom-object authorities and every booking-related schema/code path. Extend canonical authorities only; do not create a second service catalog, staff directory, branch model, resource truth, availability engine or booking lifecycle authority.

---

## AUTO-BUILDER Production closeout — 2026-09-30

- Work Package: `SECTION AUTOMATION -> AUTO-BUILDER`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled business-facing Automation Builder RC scope.
- Implementation PR #358 merged to canonical `main@96d6ecefda8d23fd8126dddd7f50e6709ff677fc`; final implementation head was `f265026ef314952fe64934e2e0686e8e325c0724`.
- Exact-head CI `36637555138` succeeded across lint, typecheck, **1418 tests**, the complete PostgreSQL 17 migration/smoke regression chain, Next build, Vinext and Cloudflare scheduled verification.
- Exact-main CI `36637897801` succeeded on the Builder merge SHA. Cloudflare Production Deploy `36638174944` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- AUTO-BUILDER required **no database migration**. Canonical workflow-definition authority remains `public.automation_rules` plus immutable `public.automation_rule_versions`; runtime truth remains `public.automation_runs` + `public.automation_run_actions`. No second workflow model, trigger catalog, condition store, action registry, executor, queue, scheduler or approval engine was introduced.
- The `/automations` surface is now a business-facing visual **When -> Only if -> Then** builder over the existing Trigger Catalog, typed Condition Fact Catalog and Tool/Action Registry. Raw Conditions/Actions JSON editing is no longer the normal builder path.
- Governed starter templates use only currently AVAILABLE trigger/action contracts. Action selection is scope-aware and action-specific business configuration is exposed for Preview, Human Handoff, Operator Brief, MARK_HOT, SEND_FOLLOWUP and PAUSE_AUTOMATION.
- Existing advanced/nested condition graphs are preserved exactly rather than silently flattened. Replacing an advanced graph with simpler visual conditions requires an explicit user action.
- Test Mode is side-effect-free: it reuses canonical trigger/condition/action/runtime validators and can optionally evaluate conditions read-only against one Organization-scoped subject. It does **not** enqueue an Automation event, create a run, execute an action, send a provider message or bypass approval/Shadow policy.
- Draft save, Publish and Enable/Disable remain separate explicit governed operations through the existing workflow RPC boundary. Creating a workflow produces a disabled draft; saving never implicitly publishes or enables it.
- Version comparison reads immutable `automation_rule_versions`; execution history and error diagnostics read canonical runtime tables, including action attempts, terminal errors and compensation state. Builder history does not create a parallel reporting/runtime store.
- Production remained unseeded and side-effect clean after deployment: Automation Rules 0, published versions 0, Automation Runs 0, Runtime Actions 0, Outreach Messages 43, Conversation Messages 37, Usage Events 108, Follow-up Jobs 6, pending approvals 9 and decided approvals 0. No synthetic Production workflow or runtime event was created merely to demonstrate the Builder.
- Production Builder contracts remain 17 AVAILABLE triggers, 61 typed condition facts and all 6 canonical Tool/Action contracts AVAILABLE.
- No migration was added after `0154_automation_runtime_fk_index_hardening`; Production migration history remains unchanged by AUTO-BUILDER.
- Production safety remains fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-deploy advisor baseline is unchanged: security RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6.
- **Not claimed here:** automation notification delivery/escalation surfaces. Those remain the separate `AUTO-NOTIFICATIONS` Work Package.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-NOTIFICATIONS`.

Before mutation, fresh-audit current main/open PRs plus existing notification/event authorities, approval escalation evidence, runtime DLQ/compensation/error states, operator surfaces and channel delivery boundaries. Extend canonical notification/event paths only; do not create a second event bus, notification queue, provider-send authority, alert truth or workflow runtime.

---

## AUTO-RUNTIME Production closeout — 2026-09-30

- Work Package: `SECTION AUTOMATION -> AUTO-RUNTIME`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled durable workflow-execution RC scope.
- Implementation PR #355 merged to canonical `main@9d540a4c75bab5aaeef771fa260f8093880077fc`; final implementation head was `caa793cdb137c21f9df2bc777ea4f0f3d56808ea`.
- Exact-head CI `36630486924` succeeded across lint, typecheck, tests, the complete PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. Controlled SQL acceptance covered event idempotency, immutable published-version execution, ordered actions, `FOR UPDATE SKIP LOCKED` leasing, verified-success gating, bounded retry, timeout recovery, DLQ, compensation requirements, Global Kill Switch, Agents Pause, approval/Shadow waits and scheduled approval deadline reconciliation.
- Exact-main CI `36631038101` succeeded on the runtime merge SHA. Cloudflare Production Deploy `36631362277` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0153_automation_runtime` is live as version `20260929211117`; merged migration blob SHA is `41a500b9d0490794dde5f4146cff00aa13ad258d`.
- Canonical workflow-definition authority remains `public.automation_rules` plus immutable `public.automation_rule_versions`. `public.automation_runs` and `public.automation_run_actions` are child runtime state only. The action table is the ordered durable runtime outbox/DLQ state, not a second workflow engine, generic queue, action gateway or provider-send authority.
- The existing Cloudflare Worker `scheduled()` loop remains the scheduler. No `pg_cron`, `pgmq` or parallel scheduler was introduced. Existing `agent_runs` and `followup_jobs` retain their domain-specific authority; the 6 real legacy overdue `followup_jobs` were not executed or mutated.
- Runtime executes only immutable published READY versions. Event ingestion is idempotent by Organization/rule/version/source-event key. Action claims use bounded leases and `SKIP LOCKED`; actions execute in order. Internal idempotent actions use bounded retry, while external-provider ambiguity never blind-retries after provider acceptance and moves to reconciliation-only evidence.
- Success requires verifier evidence. Terminal failures are durable DLQ state and prior successful side effects can be marked compensation-required for governed resolution.
- Global Kill Switch and Agents Pause both fail closed at the claim boundary and controlled PostgreSQL acceptance proves claims resume only after release. Disabling a workflow cancels unstarted runtime actions.
- Approval deadlines are now scheduled by AUTO-RUNTIME through the existing `reconcile_due_message_approvals` authority. `WAITING_APPROVAL`, `WAITING_RELEASE` and `VERIFYING` are durable external waits rather than active short-deadline execution; after release, active runtime deadline budget is restored.
- All 6 canonical Tool/Action contracts are now `AVAILABLE`: `GENERATE_PREVIEW`, `HANDOFF_HUMAN`, `CREATE_OPERATOR_BRIEF`, `MARK_HOT`, `PAUSE_AUTOMATION` and `SEND_FOLLOWUP`. Runtime reuses their existing authorities instead of bypassing them.
- `SEND_FOLLOWUP` creates the canonical approval artifact, waits for governed approval, remains `WAITING_RELEASE` while Shadow Mode is ON, and only after release routes through the existing approved-send authority. No direct provider client was added to the runtime dispatcher and no controlled Shadow bypass was introduced.
- Runtime mutation/claim/reconciliation/command RPCs are SECURITY INVOKER and service-role executable only; authenticated and anon execution is denied. Runtime tables have RLS enabled and authenticated Organization-member read policies.
- Production verification after `0153` remained side-effect clean: Automation Rules 0, published Automation versions 0, Automation Runs 0, Runtime Actions 0, Outreach Messages 43, Conversation Messages 37, Usage Events 108, Follow-up Jobs 6, pending approvals 9 and decided approvals 0. No synthetic Production workflow/event/run or provider call was created.
- Post-`0153` advisor verification exposed exactly 7 new unindexed runtime foreign keys. Hotfix PR #356 added covering indexes only and merged to `main@3655644a709ba206fbd75e5b58497a8d696326c4`; hotfix head was `1f3a6337cf60757d80fb538a929eff3a3e3e5723`.
- Hotfix exact-head CI `36631862464` and exact-main CI `36632242868` succeeded. Cloudflare Production Deploy `36632563479` succeeded on the hotfix merge SHA. Production migration `0154_automation_runtime_fk_index_hardening` is live as version `20260929212153`; merged migration blob SHA is `2f802768edd9faa92efbd5157cdf225ffc1887f9`.
- All 7 AUTO-RUNTIME FK covering indexes are valid and ready in Production. Performance advisor `unindexed_foreign_keys` returned from 21 to the pre-runtime baseline 14, with **zero runtime-specific FK findings**. Security advisor baseline remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance baseline is auth RLS initPlan 16 and multiple permissive policies 6. Newly created runtime indexes may appear as unused-index INFO until real runtime traffic exists.
- Production safety remains fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- **Not claimed here:** the visual automation builder or automation notification surfaces. Those remain separate Work Packages.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-BUILDER`.

Before mutation, fresh-audit current main/open PRs plus the existing workflow editor UI, draft/publish/version RPCs, Trigger Catalog, typed Condition Engine, Tool/Action Registry, approval model and runtime contracts. Build the visual/business-facing builder over those canonical authorities only; do not create a second workflow definition model, trigger/condition/action catalog, executor, queue, scheduler or approval engine.

---

## AUTO-APPROVAL Production closeout — 2026-09-29

- Work Package: `SECTION AUTOMATION -> AUTO-APPROVAL`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled approval-orchestration RC scope.
- PR #353 merged to canonical `main@e04c57d45d53f64fbed4834dc273941a7001dd41`; final implementation head was `5542734d330f1ac456e78c1fa47d0094aca5912c`.
- Exact-head CI `36617523783` succeeded across lint, typecheck, 1395 tests, the complete PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. Controlled SQL acceptance covered replay-safe approve/reject, required denial reason, direct-mutation fail-closed guard, delegation and delegated-reviewer decision, escalation, expiry and side-effect cleanliness.
- Exact-main CI `36618071238` succeeded on the merge SHA. Cloudflare Production Deploy `36618411998` succeeded on the same SHA through credential preflight, isolated release-candidate deploy/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0152_automation_approval` is live as version `20260929192120`; merged migration blob SHA is `627d315fe761dacd751b4db346bd9fb6480177de`.
- Canonical approval policy authority remains `public.approval_rules`; the existing `public.conversation_messages` approval states remain the queue and `public.audit_logs.correlation_id` is reused as replay evidence. No second approval engine/request table/queue/outbox/action gateway/provider-send authority was created.
- All 6 real Smart Visions approval rules are now explicit `STRICT` policies with 24-hour expiry, 4-hour escalation, OWNER reviewers and governed delegation eligibility to OWNER/ADMIN/SALES_MANAGER. This changed policy metadata only; it did not create new Organization members.
- The 9 pre-existing real pending approvals were preserved and policy-snapshotted. Their legacy deadline clocks started at migration time instead of being retro-expired: 9 pending, 9 snapshotted, 0 expired-now and 0 escalation-due at verification.
- Pending approval state is guarded against direct mutation. A controlled Production attempt to bypass the governed command path failed closed and left queue cardinality unchanged.
- `decide_message_approval`, `delegate_message_approval`, `reconcile_due_message_approvals`, replay/actor/reviewer helpers are SECURITY INVOKER. Trusted mutation/reconciliation execution is service-role only; authenticated and anon cannot execute these RPCs. Trigger functions are not directly executable by service/authenticated/anon.
- Real Smart Visions OWNER read-only runtime verification returned `owner_can_review=true` for an existing pending approval. Deadline reconciliation returned `expired_count=0`, `escalated_count=0`; no Production approval decision or delegation was created.
- Approve/reject server actions now use governed RPCs rather than direct `conversation_messages` updates. Reject requires a bounded denial reason. The existing approval surface exposes mode, request/escalation/expiry timing and governed delegation while controlled WhatsApp provider-send pilots remain OWNER-only.
- `SEND_FOLLOWUP` remains `DEPENDENCY_PENDING`, approval-required and bound to `OUTBOUND_SEND`, but its remaining Work Package dependency is now only `AUTO-RUNTIME`; approval orchestration is no longer the blocker.
- Production side-effect evidence remained unchanged by verification: Automation Rules 0, published Automation versions 0, Outreach Messages 43, Conversation Messages 37, Usage Events 108 and Follow-up Jobs 6. The approval queue remained 9 pending / 0 decided / 0 escalated. No synthetic customer/workflow/provider evidence and no provider call was created.
- Production safety remains fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF. Unreleased/held channel AI pauses remain ON for Instagram, Facebook Messenger, Web Chat, Telegram, TikTok, SMS and RCS.
- Post-0152 advisor baseline shows no AUTO-APPROVAL-specific security or unindexed-FK regression: RLS-enabled/no-policy INFO 15, leaked-password-protection WARN 1, unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. The new approval reviewer index is only an unused-index informational finding immediately after creation.
- **Not claimed here:** durable workflow execution, scheduler/outbox processing, retries, DLQ, compensation, timeout/concurrency runtime, visual builder or automation notifications. These remain separate Work Packages.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-RUNTIME`.

Before mutation, fresh-audit current main/open PRs and the existing queue/outbox/event/follow-up execution primitives, workflow publication/enablement model, Tool/Action Registry, approval boundary, provider send authorities and all current automation execution consumers. Reuse existing primitives; do not create a second workflow engine, queue, outbox, scheduler, action gateway, provider-send authority or approval engine.

---


## Current verified continuation cursor — 2026-09-30

`SECTION AUTOMATION -> AUTO-BUILDER`

This supersedes historical cursor text below. Fresh runtime/current-main verification is still required before mutation.

## Owner phase-map preservation lock

The owner reconfirmed on 2026-09-27 that the full historical Phase 0–12 map remains in scope together with the stable Work Packages and `PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md`. Historical percentages and PR counts are not completion metrics. A provider/API credential that has not arrived may block activation evidence, but does not remove the corresponding internal implementation requirement.

## Current execution and completeness authority

This file preserves historical Phase 0–12 dependencies. Read [NEXT_CHAT_HANDOFF.md](NEXT_CHAT_HANDOFF.md) for the latest cursor and [PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md](PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md) for owner-requested product detail, official customer onboarding, verified integration gaps and acceptance criteria. Historical phase counts/percentages do not measure current completion.


This is not a feature wishlist. It is the dependency history required to avoid rebuilding the same primitive twice.

For future execution, **do not assign or infer projected GitHub PR numbers**. The stable program roadmap is `MASTER_PROGRAM_SECTIONS.md`, which uses semantic Section and Work Package IDs. Historical PR numbers in this file remain implementation evidence only.

Current planned continuation cursor: `SECTION IDENTITY_CRM / CRM-SUPPORT-CASE`. PR #316 / Production migration `0131_crm_activity_task_v2` Production-verified the current Task/Activity scope on canonical `crm_tasks` with reminders, due/overdue state, Deal linkage and immutable audit-derived activity, while Production remained at 0 Tasks. `CRM-CUSTOM-OBJECTS` is deferred until a real typed-object use case exists. Support Case is the first verified missing CRM authority; build one canonical Case + Smart Core SLA path and do not fabricate Order/Payment links before those modules exist.

## Phase 0 — Architecture contracts

Status: **MERGED** in PR #172. No Production schema change was part of Phase 0.

Deliver before production code expansion:

- domain ownership map;
- source-of-truth map;
- critical state machines;
- event catalog and versioning convention;
- service contract template;
- policy/action boundary;
- usage/billing taxonomy;
- Growth OS reuse matrix.

No production schema changes in this phase.

## Phase 1 — SaaS Control Plane foundation

Status: **MERGED AND PROMOTED TO PRODUCTION** in PR #173 / migration 0068, with post-promotion FK-index cleanup 0069 also live. Production verification passed for schema, RLS, grants, runtime safety, usage classification, audit foundations, and advisor FK coverage. See `CONTROL_PLANE_FOUNDATION.md` for the evidence-backed Gap Map and contract.

Extend the existing organization model toward:

Organization -> Brand -> Business -> Branch -> Department -> Team -> User.

Add/normalize:

- tenant/business scoping contract;
- role and permission model;
- entitlement model;
- subscription/pricing-version model;
- immutable usage classes;
- audit correlation IDs;
- configuration inheritance rules.

Keep current production behavior backward compatible.

## Phase 2 — Omnichannel domain boundary

Status: **COMPLETED AND MERGED**. Semantic adapter/status work merged in PR #175 at `main@5d812eee8a0e15dac658247b254660ae8f09aacd`; provider-identity/reconciliation work merged in PR #176 at `main@a5396156afc58a22cdf78baf7a495fb07ec38b40`. Production verification after PR #176 showed a healthy heartbeat, Shadow Mode ON, acquisition/dispatch SKIPPED, and zero Email/WhatsApp outbound messages after the merge. No Production schema migration was required.

Do not replace canonical provider journals/send gate.

Add a stable Channel Adapter contract:

- inbound normalization;
- outbound capability matrix;
- reply-window/policy metadata;
- native-app coexistence signals where available;
- reconciliation hooks;
- delivery/read status mapping;
- provider identity mapping.

Use the existing WhatsApp/Email paths as first adapters.

## Phase 3 — Customer 360 + CRM normalization

**Current Production checkpoint — 2026-09-28:** the earlier Slice 1–6 history below remains valid but is no longer the execution cursor. PR #309/#310 Production-verified canonical Person/Contact, PR #311 Production-verified governed Identity Graph resolution, PR #313 Production-verified explicit Person context for current Customer 360 authorities, and PR #314 Production-verified Account v2 over canonical `public.businesses`. Exact-main CI `36370424412` and Cloudflare Production Deploy `36370581976` succeeded on `main@88a6ab7f1b4f4241ea031deda85b5cecd66b7bc1`; Production Worker is `dc6142da-42d9-42f4-9bf0-6d38be7bf358`. Production still has 0 real People and all 19 Businesses remain `UNCLASSIFIED` with no fabricated owner/hierarchy. The next bounded step is a fresh audit of the remaining Identity/CRM Work Packages rather than rebuilding already verified foundations.

Status: **ACTIVE IMPLEMENTATION**. Slice 1 CRM Identity Foundation is Production-verified in PR #178 / migration 0070. Slice 2 Customer 360 Timeline is Production-verified in PR #179 / migration 0071. Slice 3 CRM Task Foundation is Production-verified in PR #181 / migration 0072 with FK-index cleanup 0073. Slice 4 Deal/Pipeline Foundation is Production-verified in PR #184 / migration 0074. Slice 5 Custom Field Governance is Production-verified in PR #188 / migration 0075. Slice 6 governed Dynamic Lead Segments is Production-verified in PR #191 / migration 0076. Existing Growth/Intent Opportunities remain acquisition evidence and are not repurposed as CRM Deals. Slice 6 remains LEAD-only + DYNAMIC-only and does not authorize Snapshot membership or Campaign/Workflow/provider execution. Implementation-runtime Worker checkpoint after PR #191 (before docs-only closeout) is `b6ad6482-11e1-4658-97e8-7f5d1a842318` with `failed=0`, acquisition/evidence/auto-dispatch SKIPPED and zero Email/WhatsApp outbound delta from promotion verification.

Extend the existing Lead/Business/Conversation CRM instead of creating a second CRM.

Add:

- contact identities;
- identity resolution;
- companies/accounts;
- custom fields/objects;
- activities/tasks;
- pipelines/deals;
- segments;
- customer timeline;
- merge/conflict rules.

## Phase 4 — Business Twin + Industry Packs

Add a versioned business configuration model for:

- branches;
- services/products;
- hours;
- staff;
- policies;
- booking/payment/delivery rules;
- tone/languages;
- permissions.

Industry Packs configure schemas, onboarding, default pipelines, workflows, metrics and evaluation scenarios without forking the core.

## Phase 5 — AI control plane

Extend existing multi-agent, prompt versions, knowledge versions, Context Hydrator and Cost Guard.

Introduce explicit:

- Context Compiler;
- Prompt Registry contract;
- Agent/Tool registry;
- Policy Engine;
- Action Gateway;
- confidence/uncertainty policy;
- outcome verification;
- evaluation datasets;
- shadow/canary version promotion.

## Phase 6 — Memory v2

Evolve current conversation memory into typed memory:

- Business Truth;
- Customer;
- Conversation;
- Working;
- Episodic;
- Operational;
- Agent Learning;
- Organizational.

Every memory record carries source, confidence, freshness, sensitivity, validity window, scope and permission.

No raw conversation sentence becomes Business Truth without validation policy.

## Phase 7 — Workflow and operational modules

Build through common state-machine/action contracts:

- booking;
- quote;
- payment;
- order;
- ticket/case;
- field service;
- loyalty;
- notification.

Workflow execution must be durable, idempotent and compensation-aware.

## Phase 8 — Billing and commercial platform

Add customer-facing commercial metering:

- platform subscription;
- setup fees;
- per-channel fees;
- AI billable raw cost × configured multiplier (initial commercial policy: 4x);
- voice;
- Hunter credits;
- seats;
- add-ons;
- API/storage/integrations;
- tax and multi-currency.

System retry/internal/cached/promotional usage must remain separable from billable usage.

## Phase 9 — Analytics / BI / Sheets

Reuse canonical operational evidence and create a dedicated analytics path.

Implement:

- Metrics Registry;
- event/CDC feed;
- analytics warehouse boundary;
- custom reports;
- Ask Your Data over governed metrics;
- CSV/XLSX/PDF/JSON export;
- Google Sheets scheduled/live sync;
- role/branch-aware reporting.

## Phase 10 — Hunter as paid customer module

Extend existing Hunter rather than cloning it.

Add tenant-facing:

- provider gateway;
- customer-configurable targeting;
- enrichment/verification credits;
- AI qualification;
- CRM import;
- intent/audit signals;
- ROI attribution;
- compliance boundary before outreach.

## Phase 11 — Enterprise + ecosystem

- SAML/OIDC/SCIM;
- data residency/cells;
- custom contracts and enterprise billing;
- sandbox;
- migration framework;
- marketplace;
- partner/reseller portal;
- developer SDKs/webhook console.

## Phase 12 — Mobile and customer-facing surfaces

One role-aware mobile app for owner/admin/staff/super-admin functions.

Customer portal for appointments, orders, quotes, invoices, payments, subscriptions, documents and tickets.

## Definition of Done for every phase

Applicable UI + API + persistence + permissions + audit + events + metrics + billing implications + retries/failure states + tests + observability + documentation + migration/rollback must be complete.

A decorative UI is not a completed feature.


### Phase 3 Slice 5 — Custom Field Governance

Status: **PRODUCTION-VERIFIED**.

- Gap audit merged in PR #187.
- Implementation merged in PR #188 at `main@b771883b1ba2f4787c6a466aea49f95a9052bd5f`.
- Production migration `0075_crm_custom_field_governance` version `20260923012557`.
- First slice supports governed Lead + Deal custom fields only.
- No Custom Objects, Segments or Person Contact were introduced.
- Production has 0 definitions / 0 options / 0 values after migration and rollback-only verification.
- Cloudflare runtime is proven by Worker `d42bd9c5-e862-4af6-ae70-787cbf81c5d6` with `failed=0`, acquisition/dispatch SKIPPED and zero Email/WhatsApp outbound rows after merge.
- Next dependency: Segment Governance gap audit. Do not build Segments on arbitrary JSON or ungoverned fields.


### Phase 3 Slice 6 — Governed Dynamic Lead Segments

- Gap audit: PR #190.
- Implementation: PR #191 at `main@a34bfd243d2f95e2ccad9895d5a753ef902a4299`.
- Production migration: `0076_crm_segment_governance` version `20260923093619`.
- Scope is LEAD-only, DYNAMIC-only, organization-wide Segment definitions with immutable semantic versions.
- Predicate AST is typed/allowlisted and enforced at API + database boundaries.
- Governed Custom Field predicates are restricted to compatible ACTIVE/filterable INTERNAL Lead definitions.
- Evaluation is authenticated, on-demand, deterministic and bounded; no persistent current-membership table exists.
- Segment evaluation is audience truth only and never invokes Campaign, Workflow or provider actions.
- Rollback-only Production verification left zero Segment data and zero audit fixture residue.
- Do not infer that Custom Objects are automatically the next implementation. Re-audit the remaining Phase 3 gap against Production evidence first.


## Future execution numbering policy

- Phases above remain useful dependency/history groupings.
- Future completion is tracked by stable Sections/Work Package IDs from `MASTER_PROGRAM_SECTIONS.md`.
- Extra audit, hardening, migration-fix, index-cleanup, hotfix or closeout PRs do not renumber later work.
- Actual PR numbers are recorded only after they exist.
- Chatwoot Community source integration is owned by `SECTION COMMUNICATION`; it is not represented as a guessed future PR number.


## 2026-09-28 Sales Pipeline V2 Production checkpoint

Within the Phase 3 CRM foundation and the stable `SEGMENT_SALES_MARKETING / SALES-PIPELINE-V2` Work Package, PR #329 and Production migration `0139_sales_pipeline_v2` upgraded the existing canonical Deal/Pipeline authority rather than creating a replacement. Stage probability/forecast policies, canonical Team assignment, governed Deal probability override, bounded Won/Lost close evidence and derived forecasting read models are Production-verified.

Exact-main CI `36429525004` and Cloudflare Production Deploy `36429837860` succeeded on `main@6d609ebf4abcd2faadd8f474ec1a48849acdb434`; Production migration version is `20260928135144`. Production remains 0 Pipelines / 0 Stages / 0 Deals, deliberately without synthetic acceptance data.

The execution cursor advances to `SALES-NEXT-ACTION`; Phase numbering does not change.


## 2026-09-28 Sales Next Action Production checkpoint

PR #331 and Production migration `0140_sales_next_action` delivered the bounded next-action queue by extending canonical CRM Tasks and deriving candidates from existing Lead/Deal/Conversation truth. Production then exposed a real enum/text UNION mismatch that CI did not reproduce. PR #332 and `0141_sales_next_action_status_cast_fix` normalized all source-status branches without adding a second queue or mutating customer data.

Final PR #332 exact-head CI `36462166810`, exact-main CI `36462560234` and Cloudflare Production Deploy `36462884290` all succeeded. Production migration versions are `20260928174748` for 0140 and `20260928180433` for 0141.

Production currently contains 19 Leads / 0 Deals / 0 CRM Tasks / 0 NEXT_ACTION Tasks / 6 PENDING legacy followup jobs. Authenticated runtime returns 17 real stale-Lead candidates; 2 recent NEW Leads are correctly excluded. Human acceptance is explicit and service-governed; AI suggestions are advisory only; no blind auto-send or synthetic Production fixture was introduced.

`SALES-NEXT-ACTION` is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.

The execution cursor advances to `MARKETING-CAMPAIGNS`; Phase numbering does not change.

---

## 2026-09-28 Marketing Campaigns Production checkpoint

## MARKETING-CAMPAIGNS Production closeout — 2026-09-28

**Disposition: IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED.**

- PR #334 extended the existing canonical `public.campaigns` / outreach plane for governed MARKETING campaigns; no second Campaign, audience, Consent, send, provider or attribution authority was created.
- MARKETING campaigns bind to immutable CAMPAIGN-purpose LEAD Segment Snapshots, governed Message Templates/Variants, schedule/channel/frequency/budget caps, explicit approval lifecycle, actor provenance and A/B allocation evidence. Direct conversion evidence is append-only and explicitly does not claim attribution.
- Campaign control never invokes provider sends. Consent/suppression remains enforced at the canonical send gate, and START/RESUME remains bounded by Shadow Mode.
- Final PR #334 exact-head CI `36470405184` succeeded on `de27a43c9408f0dcf8d02be849c8495fa5b503c2`. PR #334 merged to `main@6cdb3a7a35f1d0f98d0dac63110800a7a5361cad`; exact-main CI `36470727765` and Cloudflare Production Deploy `36471049566` succeeded.
- Production migration `0142_marketing_campaign_governance` is applied as version `20260928191814`.
- Post-migration advisor verification found three new unindexed composite FKs on `marketing_campaign_conversion_evidence`. PR #335 / migration `0143_marketing_campaign_fk_index_hardening` added only those covering indexes and extended the PostgreSQL 17 smoke.
- PR #335 exact-head CI `36471556035` succeeded on `c209fbc762e47e45bf444e8c634bdd0ea5eb615c`. PR #335 merged to `main@b9dc839dcc30fbfb398852fc18258196290ab75c`; exact-main CI `36471907606` and Cloudflare Production Deploy `36472242677` succeeded.
- Production migration `0143_marketing_campaign_fk_index_hardening` is applied as version `20260928192755`. The three MARKETING conversion FK indexes are present and the advisor now reports zero unindexed-FK findings for that table.
- Production remains honest: 7 total campaigns, all 7 HUNTER and 0 MARKETING; 43 existing outreach messages; 0 Marketing conversion evidence. No synthetic Production Campaign, Snapshot, Template, Variant or conversion fixture was created.
- Conversion evidence RLS is enabled. Authenticated users can read but cannot insert it; trusted mutation RPCs are service-role-only with explicit human actor provenance. All five campaign RPCs are SECURITY INVOKER. The three governance/immutability triggers are enabled.
- Shadow Mode remains ON; Kill Switch and pause controls remain unchanged.
- Existing Hunter runtime/data was preserved.

**2026-09-29 MARKETING-CONSENT Production closeout**

- PR #337 delivered MARKETING-CONSENT governance. Exact-head CI `36476465786` succeeded on `145fe69c3d4617d399a76842e0e516bdf8999c89`; the PR merged to `main@2ad80936aaae62020face3b263fc5b98cb666790`.
- Exact-main CI `36476868405` and Cloudflare Production Deploy `36477188658` both succeeded on the same main SHA.
- Production migration `0144_marketing_consent_governance` is applied as version `20260928205708`.
- Canonical permission evidence reuses `public.lead_sources`; canonical suppression/DNC remains `public.suppression_list`. No second Consent, preference, provider-permission or suppression authority was created.
- Permission evidence is append-only behind `lead_sources_marketing_permission_guard`. `record_marketing_permission_event` is SECURITY INVOKER and service-role-only with explicit human/preference-center provenance. `get_marketing_permission` and `get_marketing_preferences` are SECURITY INVOKER and readable by authenticated/service-role callers under existing RLS.
- Production verification remains honest: 0 marketing permission events, 0 effective preferences, 1 existing suppression row and 43 existing outreach messages. Post-migration verification observed 0 new outbound rows in the preceding 10 minutes. No synthetic opt-in/opt-out evidence was created.
- The post-0144 advisor pass introduced no new Marketing security or unindexed-FK regression; existing platform advisor debt remains separate.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the governed internal permission path. Real customer opt-in/opt-out evidence remains data-driven and must never be fabricated.

**Fresh continuation cursor:** `SECTION SEGMENT_SALES_MARKETING -> MARKETING-ATTRIBUTION`.

For `MARKETING-ATTRIBUTION`, first audit existing outreach/reply/conversation/Lead/Deal and future booking/order/payment evidence. Do not infer attribution from Segment membership, Campaign approval, or direct conversion evidence alone; do not fabricate click/view events or create a second revenue truth.

Phase numbering does not change; the execution cursor advances to `MARKETING-ATTRIBUTION`.



---


## MARKETING-ATTRIBUTION Production closeout — 2026-09-29

- Work Package: `SECTION SEGMENT_SALES_MARKETING -> MARKETING-ATTRIBUTION`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the current observational attribution scope.
- PR #339 delivered the bounded read-only model on existing canonical authorities only. No second attribution table, revenue truth, Campaign store, CRM store, send path or provider truth was created.
- Implementation merge: `main@9e8373bb37102b3763b92d19abda66ee3acf724a`.
- Exact-head CI: `36484937638` SUCCESS on `dcd9fbbf51f6857cacee787f546cf11d7d4001af`.
- Exact-main CI: `36485322314` SUCCESS.
- Cloudflare Production Deploy: `36485633187` SUCCESS, including release-candidate smoke, exact validated bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0145_marketing_attribution_observational` is live. Near-simultaneous idempotent application recorded two migration-history entries, versions `20260928212346` and `20260928212358`. Their stored statement hashes differ, but both contain the same hardened contract markers (Lead-first touch index, Deal-bounded limit, reply/conversion outcome-time bounds and LINEAR truncation protection). The canonical runtime matches merged `main`; the schema contains only the intended single function/index and no manual migration-history deletion was performed.
- Production runtime under the real Smart Visions authenticated OWNER/RLS context successfully executed `FIRST_TOUCH`, `LAST_TOUCH` and `LINEAR` with the bounded 30-day/200-Deal contract.
- Current honest Production evidence: 19 Leads, 0 Deals / 0 WON Deals, 7 total Campaigns / 0 MARKETING Campaigns, 43 Outreach messages, 12 Sales Conversations, 37 Conversation messages, 0 Reply events and 0 Marketing conversion-evidence rows; therefore all three attribution models correctly return 0 rows. No synthetic Campaign, Deal, message, click, view, payment or revenue fixture was created.
- `get_marketing_attribution` is SECURITY INVOKER; authenticated/service_role may execute, anon may not. No persisted `marketing_attribution*` table/view/materialized authority exists.
- Attribution requires real sent MARKETING outreach before a canonical WON Deal. Exact Conversation linkage requires the same provider message ID. FIRST_TOUCH/LAST_TOUCH/LINEAR are bounded observational credit models only; `causal_claim=false` and `revenue_claimed=false`.
- Deal amount remains sales evidence, not collected revenue. Booking/Order/Invoice/Payment attribution stays deferred until their canonical authorities exist.
- Post-apply advisors show no Attribution-specific security finding. The new partial index is currently reported only as unused, expected while Production has no MARKETING Campaign/WON Deal attribution workload.
- No outbound/provider send side effect was introduced; Shadow Mode and existing safety controls remain unchanged.

**Fresh continuation cursor:** `SECTION SEGMENT_SALES_MARKETING -> HUNTER-CUSTOMER-MODULE`.

Before mutation, re-audit current main/open PRs/exact-head CI and Production Hunter/discovery/enrichment/credit/dedupe/CRM-promotion/compliance authorities. Extend the existing Hunter only; do not create a second prospect, discovery, enrichment, credit, CRM, consent/suppression or provider-send authority.

---

# Production evidence checkpoint — HUNTER-CUSTOMER-MODULE

## HUNTER-CUSTOMER-MODULE Production closeout — 2026-09-29

- Work Package: `SECTION SEGMENT_SALES_MARKETING -> HUNTER-CUSTOMER-MODULE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the current customer-facing Hunter read/composition scope.
- PR #341 merged to canonical `main@b36b1dc4df72f61d6de84a4b70475377eb1903cc`.
- Final exact-head CI `36493943818` succeeded after the test-only legacy Business bootstrap was aligned with long-lived Production's canonical Hunter enrichment shape; no Product/Production authority was changed to satisfy CI.
- Exact-main CI `36494234082` succeeded on the merge SHA across lint, typecheck, Vitest, PostgreSQL 17 migration/smoke, Next build, Vinext and scheduled verification.
- Cloudflare Production Deploy `36494486700` succeeded on the same merge SHA.
- Production migration `0146_hunter_customer_module_read_model` is live as version `20260928224839`; merged migration file blob SHA is `768522507c96b0011020f550bd5906407f68553f`.
- The module extends existing canonical Hunter/CRM/usage/entitlement/suppression authorities only. It created no second Prospect store, CRM, credit ledger, entitlement store, consent source, send gate or provider runtime.
- Production runtime was executed under the real Smart Visions authenticated OWNER/RLS context. Current real evidence: 7 Hunter Campaigns, 13 discovered prospects, 13 enriched Businesses, 13 CRM-promoted prospects, 12 qualified prospects, 1 suppressed prospect, 18 Hunter usage units this month, USD 0.18 Hunter provider cost this month, 0 observed WON Deals and Hunter entitlement status `UNCONFIGURED`.
- `get_hunter_customer_summary` and `get_hunter_customer_prospects` are SECURITY INVOKER. Authenticated/service_role execution is granted; anon execution is denied.
- Contactability remains evidence only: Production returned `permission_true_count=0`. Suppression is surfaced, while actual outreach remains governed by canonical consent/channel/send gates and Shadow Mode.
- ROI remains observational WON Deal evidence only and does not claim Hunter caused revenue.
- Production stayed honest across the migration/runtime verification: Leads 19 -> 19, Outreach messages 43 -> 43, Conversation messages 37 -> 37, Usage events 108 -> 108, Deals 0 -> 0, Discovery records 13 -> 13, Growth opportunities 14 -> 14. No synthetic Production prospect, Lead, Deal, send or usage fixture was created.
- Post-apply Supabase advisor categories/counts show no Hunter-specific regression: security baseline remains RLS-enabled/no-policy INFO 15 and leaked-password-protection WARN 1; performance baseline remains unindexed FKs 14, auth RLS initPlan 16, multiple permissive policies 6. Unused indexes decreased from 223 to 222 and are not a Hunter security regression.

**Fresh continuation cursor:** `SECTION SEGMENT_SALES_MARKETING -> CUSTOMER-SUCCESS-LOYALTY`.

Before mutation, fresh-audit current main/open PRs/exact-head CI and Production onboarding/health/retention/churn/reactivation/loyalty/referral/lifecycle-task authorities. Reuse canonical Person/Account/Lead/Deal/Task/Support/Segment/Marketing Consent/Campaign authorities and do not create a second customer, task, campaign, consent, scoring or billing truth.

---

## CUSTOMER-SUCCESS-LOYALTY Production closeout — 2026-09-29

- Work Package: `SECTION SEGMENT_SALES_MARKETING -> CUSTOMER-SUCCESS-LOYALTY`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the current RC scope.
- PR #343 merged to canonical `main@2c4b4ef72c3fb13f27012f16078323b4a68d1b9f`; implementation head was `b9aea3f746eb6c5331482a2fa899219786b8e1c5`.
- Exact-head CI `36497500213` succeeded across lint, typecheck, Vitest, PostgreSQL 17 migration/smoke, Next build, Vinext and scheduled verification.
- Exact-main CI `36497865655` succeeded on the merge SHA.
- Cloudflare Production Deploy `36498116462` succeeded on the same exact main SHA, including exact-green checkout, release-candidate deployment/smoke, controlled SSR load, exact bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0147_customer_success_loyalty` is live as version `20260928232514`; merged migration blob SHA is `792bfe02b27ca2f7eba61480edb3cb8368450670`.
- Canonical Account lifecycle remains `public.businesses.account_lifecycle`; CRM Task remains `public.crm_tasks`; Support remains `public.crm_support_cases`; Marketing Campaign remains `public.campaigns`. No second customer, task, campaign, consent, scoring, billing or workflow authority was created.
- Health/churn are bounded explainable derived evidence, not a second persisted scoring engine. New persisted truth is limited to append-only non-cash loyalty events and governed referral evidence linked back to canonical Account/Person/Lead/Deal truth.
- Production runtime succeeded under the real Smart Visions authenticated OWNER/RLS context. Current honest state is 19 Businesses, 0 CUSTOMER accounts, 0 FORMER_CUSTOMER accounts, 19 Leads, 0 Deals, 0 Tasks, 0 CUSTOMER_SUCCESS Tasks, 0 loyalty events, 0 referrals, 7 Campaigns and 0 lifecycle-classified Campaigns; `get_customer_success_summary` and `get_customer_success_accounts` return valid zero-data results without fixtures.
- Production remained side-effect clean: Outreach messages stayed 43 and Conversation messages stayed 37. No synthetic customer, Task, referral, loyalty, campaign, send or commercial evidence was created.
- RLS is enabled on `customer_loyalty_events`, `customer_referrals`, `crm_tasks` and `campaigns`. The loyalty immutable guard and Customer Success Task provenance guard are live.
- Customer-success read RPCs are SECURITY INVOKER and authenticated/service-role readable; trusted task/loyalty/referral/campaign mutations are SECURITY INVOKER, service-role-only, authenticated execution denied and anon execution denied.
- The trusted runtime keeps least privilege on `crm_tasks`: service_role still has no table-wide SELECT; only the required `due_at` and `metadata` read columns were added to the previously scoped grant set.
- Post-0147 advisors show no Customer Success security or unindexed-FK regression: security remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance remains unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Fresh zero-row indexes are naturally reported unused and are not an integrity regression.
- Production safety is unchanged: Shadow Mode ON, global Kill Switch OFF, Email pause OFF, WhatsApp AI pause OFF and Agents pause OFF.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-WORKFLOW-MODEL`.

Before mutation, fresh-audit current main/open PRs and the existing `automation_rules` / `approval_rules` authority. Production currently has 0 Smart Visions automation rules and 6 canonical approval rules. Extend `automation_rules` rather than creating a second workflow/automation authority; add immutable published-version semantics only where the existing model cannot represent them.

---

## AUTO-WORKFLOW-MODEL Production closeout — 2026-09-29

- Work Package: `SECTION AUTOMATION -> AUTO-WORKFLOW-MODEL`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the governed workflow-definition model RC scope.
- PR #345 merged to canonical `main@c6abc26fd5521774ab2f0b4c70c3cffa482c0efe`; implementation head was `b65d0b501b876a5ad32e10a7808f6358f3c6814a`.
- Exact-head CI `36506580079` succeeded across lint, typecheck, tests, PostgreSQL 17 migration/smoke, Next build, Vinext and Cloudflare scheduled verification.
- Exact-main CI `36506777208` succeeded on the merge SHA. Cloudflare Production Deploy `36506935424` succeeded on that exact SHA, including release-candidate deploy/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0148_automation_workflow_model` is live as version `20260929011256`; merged migration blob SHA is `fc4f19680e6583b4273f4eeaa6ddae2028103a78`.
- Canonical workflow authority remains `public.automation_rules`. The new `public.automation_rule_versions` table is only the immutable published-version snapshot child of that authority; it is not a second automation engine, runtime, queue or outbox.
- The model now governs Trigger, ordered Conditions/Actions payloads, eligible owner, DRAFT/PUBLISHED state, optimistic draft revision, immutable published versions, explicit enable/disable and `NOT_READY / READY / DISABLED` execution eligibility. A newer draft can coexist with the last published READY version without silently changing runtime truth.
- Creation/update/publish/enable mutations are service-role-only SECURITY INVOKER RPCs with explicit human actor provenance. Authenticated browser access to both workflow tables is read-only under RLS; direct INSERT/UPDATE/DELETE/TRUNCATE is denied.
- Existing Web and Telegram Owner surfaces reuse the same canonical authority. Legacy `automation.create/update` parity now routes through the governed RPC boundary; richer draft/publish/enable controls remain specialized workflow-model actions.
- Production remains honest: 0 automation rules, 0 published automation versions and 6 existing approval rules. Outreach messages stayed 43 and conversation messages stayed 37. No synthetic Production workflow, execution, provider send, Task, Lead or approval evidence was created.
- Production safety is unchanged: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-0148 advisors show no Automation-specific security or unindexed-FK regression. Existing platform baseline remains RLS-enabled/no-policy INFO 15, leaked-password-protection WARN 1, unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Fresh zero-row workflow indexes are naturally reported unused.
- **Not claimed here:** trigger catalog semantics, condition evaluation, tool/action registry, approval orchestration, durable execution, retries/compensation, builder or notifications. Those remain their separate Work Packages, especially `AUTO-RUNTIME`.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-TRIGGER-CATALOG`.

Before mutation, fresh-audit current main/open PRs and existing event/trigger/state catalogs plus all code paths that consume `automation_rules.trigger_key`. Extend the canonical workflow model only; do not create a second event bus, trigger store, workflow engine, queue or outbox.

---

## AUTO-TRIGGER-CATALOG Production closeout — 2026-09-29

- Work Package: `SECTION AUTOMATION -> AUTO-TRIGGER-CATALOG`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the governed trigger-contract catalog RC scope.
- PR #347 merged to canonical `main@1c63bb6734206f5bd0cd4e4d4963553d1cf46afb`; implementation head was `a2611007c559a00440b45e9136d8d858add54ae4`. 
- Exact-head CI `36531934368` succeeded across lint, typecheck, tests, PostgreSQL 17 migration/smoke, Next build, Vinext and Cloudflare scheduled verification.
- Exact-main CI `36532221317` succeeded on the merge SHA. Cloudflare Production Deploy `36532486413` succeeded on that same SHA through exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0149_automation_trigger_catalog` is live as version `20260929064517`; merged migration blob SHA is `8bc156375b355e8da80060de5ac4fa907d6f34d7`.
- The canonical workflow authority remains `public.automation_rules`. `public.automation_trigger_catalog` is system-owned reference metadata only; it stores no trigger occurrences and creates no event bus, queue, outbox, executor or second workflow authority.
- Production contains 32 cataloged trigger contracts across all 15 required families: 17 `AVAILABLE`, 15 `DEPENDENCY_PENDING`, 0 `DEPRECATED`. Booking, Quote, Order, Invoice and Payment trigger contracts remain dependency-gated until their canonical owning modules exist.
- Draft/root definitions fail closed on unknown trigger keys. Immutable published versions accept only `AVAILABLE` triggers, and enablement re-checks the latest published trigger contract. The three guards are live and SECURITY INVOKER.
- Trigger Catalog RLS is enabled. Authenticated and service-role runtime access is SELECT-only; authenticated INSERT/UPDATE/DELETE are denied. A real Smart Visions OWNER/RLS read saw all 32 catalog entries and the dependency-pending Booking contract.
- Production remained side-effect clean: Automation Rules 0, published Automation versions 0, Approval Rules 6, Outreach Messages 43, Conversation Messages 37, Usage Events 108 and Follow-up Jobs 6. No synthetic workflow/event/customer/provider evidence was created.
- Production safety is unchanged: Shadow Mode ON; Global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-0149 advisors show no Trigger Catalog-specific security or unindexed-FK regression. Existing baseline remains RLS-enabled/no-policy INFO 15, leaked-password-protection WARN 1, unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6.
- **Not claimed here:** condition evaluation, action/tool registry, approval orchestration, durable workflow execution, retries/compensation, builder or notifications. Those remain separate Automation Work Packages.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-CONDITION-ENGINE`.

Before mutation, fresh-audit current main/open PRs and the existing `automation_rules.conditions` shape plus canonical CRM/Segment/communication facts. Extend the existing workflow model only; do not create a second workflow engine, rules engine, customer fact store, scoring engine, queue or outbox.


---

## AUTO-CONDITION-ENGINE Production closeout — 2026-09-29

- Work Package: `SECTION AUTOMATION -> AUTO-CONDITION-ENGINE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the typed deterministic condition-evaluation RC scope.
- PR #349 merged to canonical `main@6292d0cc0725864e0f44f2bc923f403851fb04b9`; final implementation head was `c15da2b86cda24dcd8f1b1fdb4e97f3e1bc0ac36`.
- Exact-head CI `36571352718` succeeded across lint, typecheck, tests, the full PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. An earlier head run exposed only a compact-CI-bootstrap drift for the legacy Lead `recommended_offer` column; the bootstrap was aligned to the real Production lineage and the complete chain then passed.
- Exact-main CI `36571715430` succeeded on the merge SHA. Cloudflare Production Deploy `36572032475` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0150_automation_condition_engine` is live as version `20260929130243`; merged migration blob SHA is `fc0b663d890f14fe0fa89c3737b3af919fb80827`.
- Canonical workflow-condition truth remains `public.automation_rules.conditions`. `public.automation_condition_fact_catalog` is system-owned metadata only and stores no customer/runtime fact values; no second workflow/rules engine, fact store, queue or outbox was created.
- The condition contract is typed and bounded: `GROUP(AND/OR)` + `PREDICATE`, TEXT/NUMBER/BOOLEAN/UUID/TIMESTAMP facts, depth <= 4, <= 20 leaves, <= 8 children/top-level nodes and <= 20 list values. A condition set targets one canonical subject type and must match the trigger family when subject-bound conditions are used.
- Production catalog contains 61 allowlisted facts across 7 canonical subject types: Lead, Deal, CRM Task, Account, Conversation, Segment Snapshot and Support Case. Evaluation uses fixed Organization-scoped reads from those existing authorities; there is no dynamic SQL or expression-eval surface.
- Condition validation/fact loading/evaluation RPCs are SECURITY INVOKER, service-role executable only; authenticated and anon execution is denied. Authenticated users can read the fact metadata catalog but cannot INSERT/UPDATE/DELETE it.
- A read-only Production runtime evaluation against an existing Smart Visions Lead deterministically matched 2/2 bounded numeric Lead conditions. No Production fixture or customer/provider event was created.
- The existing least-privilege Task boundary was preserved: `service_role` still has no table-wide SELECT on `crm_tasks`; only already-governed columns such as status/due/assignee remain readable, while priority/task_type remain denied.
- Production stayed side-effect clean: Automation Rules 0, published Automation versions 0, Approval Rules 6, Outreach Messages 43, Conversation Messages 37, Usage Events 108 and Follow-up Jobs 6.
- Post-0150 advisors show no Condition Engine-specific security or unindexed-FK regression. Existing baseline remains RLS-enabled/no-policy INFO 15, leaked-password-protection WARN 1, unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6.
- Production safety is unchanged: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- **Not claimed here:** tool/action registry, approval orchestration, durable workflow execution, retry/compensation runtime, visual builder or notifications. Those remain separate Automation Work Packages.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-TOOL-ACTION-REGISTRY`.

Before mutation, fresh-audit current main/open PRs and the existing action/tool authorities, approval/policy/action-gateway boundaries and all current `automation_rules.actions` consumers. Extend the canonical workflow/action boundary only; do not create a second tool registry, action gateway, workflow engine, queue, outbox, provider-send authority or approval engine.



---

## AUTO-TOOL-ACTION-REGISTRY Production closeout — 2026-09-29

- Work Package: `SECTION AUTOMATION -> AUTO-TOOL-ACTION-REGISTRY`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the governed Tool/Action contract-registry RC scope.
- PR #351 merged to canonical `main@3a8cbe0735cb948556c9154cde5a2c6e51887ef9`; final implementation head was `e723d18d8d38e5093f7784506cd67b0139e610c4`.
- Exact-head CI `36610866049` succeeded across lint, typecheck, tests, the complete PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. Earlier head CI `36610457171` exposed only a compact-CI lineage gap: the legacy Production `approval_rules` authority was absent from the test bootstrap. The bootstrap was aligned to the real Production schema and the full chain then passed without weakening the product contract.
- Exact-main CI `36611263495` succeeded on the merge SHA. Cloudflare Production Deploy `36611505849` succeeded on that same SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0151_automation_tool_action_registry` is live as version `20260929182352`; merged migration blob SHA is `8451fc77a17ac2d998b2fdf23716800c527627cc`.
- Canonical workflow action-definition truth remains `public.automation_rules.actions`. `public.tool_action_registry` is system-owned contract metadata only; it stores no action requests and creates no second executor, action gateway, queue, outbox, provider-send authority or approval engine.
- Production contains exactly 6 current workflow action contracts. `GENERATE_PREVIEW` and `HANDOFF_HUMAN` are `AVAILABLE`; `CREATE_OPERATOR_BRIEF`, `MARK_HOT`, `PAUSE_AUTOMATION` and `SEND_FOLLOWUP` are explicitly `DEPENDENCY_PENDING`.
- Every registered action carries typed input/output schemas, permission key, scope, idempotency contract, cost class, side-effect class, approval requirement, verifier and audit contract.
- `SEND_FOLLOWUP` is bound to the existing `APPROVED_SEND_POLICY` / `OUTBOUND_SEND` authority, classified `PROVIDER_METERED` + `EXTERNAL_PROVIDER`, requires approval, and remains dependency-gated on `AUTO-APPROVAL` + `AUTO-RUNTIME`. The real Smart Visions `OUTBOUND_SEND` approval rule exists in Production with `requires_approval=true`.
- `MARK_HOT` is bound to `SALES_SCORING_GOVERNANCE`; Registry metadata explicitly forbids a direct `leads.status` write that would bypass canonical Sales Scoring evidence.
- Unknown action keys fail closed at Draft. Dependency-pending actions may be designed in Draft but fail closed at Publish. Enablement re-checks the latest immutable published action snapshot so a later deprecation cannot silently reactivate a workflow.
- Tool/Action Registry RLS is enabled. A real Smart Visions OWNER authenticated read saw all 6 contracts. Authenticated users and service role have SELECT-only table access; authenticated/anon cannot execute the trusted validator, while service role can. Validator and guards are SECURITY INVOKER.
- Three live guards protect the workflow root, immutable published versions and enablement boundary.
- Read-only Production validation proved `GENERATE_PREVIEW` publish validation succeeds, `SEND_FOLLOWUP` is valid as a Draft contract, and its Publish validation remains blocked while dependency-pending.
- Automation UI now reads action contracts from the database Registry instead of a hardcoded action list and surfaces action availability beside each workflow.
- Production remained side-effect clean: Automation Rules 0, published Automation versions 0, Approval Rules 6, Outreach Messages 43, Conversation Messages 37, Usage Events 108 and Follow-up Jobs 6. No synthetic workflow/customer/provider evidence was created.
- Post-0151 advisors show no Tool/Action Registry-specific security or unindexed-FK regression. Existing baseline remains RLS-enabled/no-policy INFO 15, leaked-password-protection WARN 1, unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6.
- Production safety is unchanged: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- **Not claimed here:** approval orchestration, durable workflow/action execution, retries/compensation runtime, visual builder or notifications. Those remain separate Automation Work Packages.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-APPROVAL`.

Before mutation, fresh-audit current main/open PRs plus the existing `approval_rules` authority, Shadow approval queue, approved-send policy, message approval surfaces and all approval consumers. Extend the existing approval boundary only; do not create a second approval engine, action gateway, workflow runtime, queue, outbox or provider-send authority.
