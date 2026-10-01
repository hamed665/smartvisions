# Smart Visions AI Business OS 2027 — Master Program Sections

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

## WhatsApp customer onboarding scope lock — 2026-10-01

The owner-approved non-destructive WhatsApp onboarding contract is frozen in [WHATSAPP_CUSTOMER_ONBOARDING_CONNECTION_CONTRACT.md](WHATSAPP_CUSTOMER_ONBOARDING_CONNECTION_CONTRACT.md).

This scope **does not create new Work Packages**. Its eight implementation slices are mapped onto existing `COMM-TENANT-BRIDGE`, `COMM-HUMAN-AI`, `COMM-ACTION-BRIDGE`, `COMM-RECONCILIATION`, `OMNI-META-SOCIAL`, `OMNI-CHANNEL-HEALTH`, `DEV-INTEGRATIONS`, `ENT-IAM`, `ENT-SECURITY`, `UX-BUSINESS-WEB`, `UX-MOBILE`, `UX-PWA` and `FINAL-E2E` ownership.

Scope locks:

- `communication_channel_bindings` remains the logical connection authority;
- setup/reconnect attempts are child operational state, never a second connection truth;
- active WhatsApp Business App numbers may use only official coexistence for the same number;
- destructive Business App migration / Delete Account / uninstall guidance is not a supported customer path;
- if coexistence is unavailable, the existing mobile WhatsApp stays untouched and a separate API number is the fallback;
- Remote Setup receives only bounded `WHATSAPP_SETUP` authority, not general panel/CRM/billing/admin access;
- credential completion crosses a trusted server-side authorization boundary before Vault mutation;
- Chatwoot remains `Channel::Api` communication plane, while Meta provider authority stays in Smart Core/Vault;
- readiness is evidence-dimensional, not one overloaded `CONNECTED` enum;
- native WhatsApp human activity must participate in the existing Human/AI send gate without creating a second message store.

The current continuation cursor is not reordered merely by registering this scope. Execute these requirements when their owning Work Packages are reached or when a fresh dependency audit proves they are required earlier.

## Product completeness and customer connection requirements

Read [PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md](PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md) before selecting or closing a Business OS delivery package. It preserves the owner-requested full-product scope, simple official customer connection journey, verified multi-business WhatsApp gaps, detailed acceptance gates and the complete Work Package coverage index. It extends acceptance under this roadmap; it does not replace architecture, renumber Work Packages or authorize provider activation. Keep its requirement dispositions and the canonical handoff traceable to implementation and Production evidence.


## Purpose

This document is the stable execution map for completing Smart Visions AI Business OS 2027.

It deliberately **does not use future GitHub PR numbers as roadmap identifiers**. PR numbers are implementation evidence only. They are not phases, milestones, or sequencing keys.

A work package may require one PR, several PRs, a follow-up hardening PR, or an emergency correction. None of those events renumber the program.

## Continuation rule

Future sessions must continue by:

`SECTION -> WORK PACKAGE ID -> verified runtime gap -> implementation evidence`

Never continue by guessing "the next PR number".

Example:

`SECTION COMMUNICATION -> COMM-CHATWOOT-SOURCE`

may eventually be implemented by PR #194, #195 and #198. The stable program identity remains `COMM-CHATWOOT-SOURCE`.

## Source-of-truth priority

1. current routed Production runtime evidence;
2. Production database/provider state;
3. current `main` code at exact SHA;
4. `docs/CURRENT_STATE.md`;
5. this program map and the architecture contracts;
6. PR numbers and historical chat context.

Runtime evidence always wins over stale documentation.

## Current completed baseline

The following foundations are already Production-verified and are not recreated by this program:

- architecture/service/state/event contracts;
- SaaS Control Plane foundation;
- Omnichannel semantic adapter boundary for current Email/WhatsApp providers;
- CRM Identity Foundation;
- Customer 360 Timeline;
- CRM Task Foundation;
- Deal/Pipeline Foundation;
- Custom Field Governance;
- governed Dynamic Lead Segments.

The current planned continuation cursor is:

`SECTION COMMUNICATION / COMM-TENANT-BRIDGE`

This cursor is a planned dependency target, not permission to skip fresh main/Production verification before coding.

---

# SECTION COMMUNICATION — Source-based communication plane

## Goal

Use Chatwoot Community Edition source code as the operational communication plane and unified inbox while preserving Smart Visions Core as the business/system source of truth.

### COMM-CHATWOOT-SOURCE — Community source foundation

Status: **PRODUCTION SOURCE PLANE DEPLOYED AND RELEASE-VERIFIED; BRIDGE ACTIVATION REMAINS SEPARATELY GATED**

Production-promotion readiness and stop conditions: `CHATWOOT_PRODUCTION_PROMOTION_READINESS_AUDIT.md`.

Approved upstream baseline:

- `v4.18.0`
- commit `9f920b549c14491a4e587687a3eed5d21c6ccc7d`

Approved first provider projection: Chatwoot `Channel::Api`, with provider send authority retained by Smart Core.

Detailed decisions: `CHATWOOT_SOURCE_GAP_AUDIT.md`.

2026-09-25 evidence: pinned v4.18.0 source build, Community/Enterprise license guard, enterprise-tree removal, immutable provenance inspection and GHCR publish all succeeded in Chatwoot Source Image run #17. This does **not** satisfy Production runtime completion: no verified public Chatwoot origin, dedicated Chatwoot PostgreSQL, Redis, durable object storage, web/worker health or backup/rollback evidence exists yet.

2026-09-25 Candidate runtime update: an isolated Railway Candidate now has dedicated Chatwoot PostgreSQL/Redis/private S3-compatible storage plus prepare/web/Sidekiq services on the immutable Community-safe digest. Database prepare/configure, Puma boot, Sidekiq/Redis, storage write/read, logical backup/isolated-restore, TLS-verified public `/health=200` with `{"status":"woot"}`, and public `/app/login=200` evidence are verified. This is Candidate evidence only, not Production completion; Production sizing/backup/public-route promotion remains separately gated.


2026-09-26 Production closeout: a separate Chatwoot Production source plane is live on the OVH VPS at `57.131.156.171` with dedicated PostgreSQL/Redis, OVH S3 attachment storage, Paris 3-AZ off-host DB backup with verified restore, Caddy/Let's Encrypt TLS, and public `https://inbox.smartvisionsai.com` health/login. PR #236 corrected the mobile onboarding layout and exact-head CI/source-image verification passed. The live runtime remains Community-only and provider authority remains Smart Core. Railway is no longer a Production dependency and remains only a temporary Candidate rollback asset pending explicit decommission approval. API Inbox/provider/customer activation remains off and continues under `COMM-TENANT-BRIDGE`.

Deliver:

- an upstream-tracked fork/build of Chatwoot Community Edition source;
- exact upstream version/commit pinning;
- reproducible source build and deployment;
- Smart Visions branding/theme/custom shell where permitted;
- upstream-update/rebase policy;
- source-license inventory and NOTICE preservation;
- health/version evidence;
- environment separation for Development / Candidate / Production;
- no dependency on proprietary `enterprise/` code unless Smart Visions has a valid license for that use.

License boundary:

Upstream references to re-verify at implementation time:

- Community/root license: https://github.com/chatwoot/chatwoot/blob/develop/LICENSE
- Enterprise license: https://github.com/chatwoot/chatwoot/blob/develop/enterprise/LICENSE

Rules:

- Chatwoot code outside the repository's `enterprise/` directory is used under its MIT license;
- proprietary `enterprise/` source is not copied, vendored, redistributed, or used in Production without the required Chatwoot license;
- features needed by Smart Visions that exist only in Chatwoot Enterprise are implemented independently in Smart Core/Community-safe code unless a valid Enterprise subscription/license is intentionally adopted.

Repository topology rule:

- do not dump thousands of Chatwoot upstream files into `hamed665/smartvisions` merely to claim integration;
- maintain Chatwoot as an upstream-trackable source fork/deployable component;
- this repository owns Smart Core contracts, mappings, policies, APIs and evidence;
- exact fork repository/deployment identity becomes canonical only after it actually exists and is verified.

### COMM-TENANT-BRIDGE — Tenant/business/user mapping

Slice C1 status: **MERGED AND PRODUCTION-PROMOTED; VAULT BOUNDARY VERIFIED**

C1 uses the already-installed Supabase Vault through service-role-only SECURITY INVOKER wrappers. Dynamic API Inbox secrets remain encrypted in Vault and mapping rows keep only `secretref://supabase-vault/<uuid>` references. No live Chatwoot call occurs in C1.


Slice B status: **MERGED; PRODUCTION SCHEMA PROMOTED THROUGH 0089; LIVE EXTERNAL PROVISIONING NOT ACTIVATED**

Slice B adds server-only User/AccountUser/API-Inbox/Team projection contracts. It preserves OWNER as the only first-version Chatwoot administrator; ADMIN and sales roles project to agent, and VIEWER receives no Chatwoot membership. Live Chatwoot provisioning remains deferred to the Candidate adapter slice.


Status: **TENANT BRIDGE IMPLEMENTATION BOUNDARY CLOSED; NATIVE CHATWOOT IS BUSINESS-WIDE ONLY; PRODUCTION ACTIVATION REMAINS DORMANT UNTIL REAL TENANT + TOKEN + EXPLICIT ACTIVATION**

Detailed decisions: `CHATWOOT_TENANT_BRIDGE_GAP_AUDIT.md`.

Production reconciliation on 2026-09-25 supersedes the historical stacked-Draft blocker text. The source foundation and bridge stack were merged with runner-backed exact-head CI; Production Supabase now carries migrations 0077 through 0089, including Vault boundary, governed User/Account membership, reconciliation receipts/interlocks, signed API Inbox webhook journal, governed API Inbox persistence and governed Team persistence. External Chatwoot provisioning remains unactivated until a real Candidate/Production Chatwoot runtime exists and passes the release gates.

Current implementation checkpoint: Smart Core now has fail-closed Production activation contracts, governed Brand/Business bootstrap, OWNER-only canonical Branch/Department/Team hierarchy bootstrap, tenant projection preparation, Account external orchestration, OWNER User/AccountUser projection, guarded API Inbox/Chatwoot Team execution adapters, source-backed Inbox/Team member desired-set reconciliation for verified Business-wide AccountUsers, and verified external-first BRANCH/DEPARTMENT/TEAM authority reduction. Scoped reconciliation and reduction both use GET -> at most one replace-set PATCH -> GET verification; ambiguous PATCH outcomes are GET-reconciliation-only. Production migrations 0091 and 0092 are live. C5 policy is closed: native Chatwoot AccountUser/SSO requires live Business-wide non-VIEWER Smart Core authority. Scoped-only staff are intentionally not projected into native Chatwoot because Community v4.18.0 exposes Account-wide Contact surfaces to ordinary agents; those users move to the Smart Core scope-aware unified inbox instead. None of the external provisioning paths can execute while Production provisioning is disabled or Platform token/real tenant prerequisites are absent. Real tenant activation remains an operational release gate, not a reason to widen the native Chatwoot security boundary.

The audit also closes these key decisions:

- one Chatwoot Account per canonical `tenant_business`;
- never map Growth/Hunter `public.businesses` as tenant Businesses;
- explicit `communication_channel_bindings` are required because current `integration_connections` is Organization-scoped;
- Smart OWNER/ADMIN -> Chatwoot administrator;
- Smart SALES_MANAGER/SALES_AGENT -> Chatwoot agent;
- Smart VIEWER -> no first-version Chatwoot membership because Community has no read-only AccountUser role;
- Contacts remain projections over canonical identity evidence;
- historical Organization-scoped conversations are not assigned to a tenant Business without evidence.

Deliver deterministic mapping between:

- Organization;
- tenant Business;
- Branch where applicable;
- Smart Visions user/staff identity;
- Chatwoot Account;
- Inbox;
- Team;
- Agent;
- Contact projection;
- Conversation projection.

Requirements:

- tenant isolation;
- mapping version/audit evidence;
- no cross-tenant Chatwoot account/inbox reuse;
- fail closed on ambiguous mapping;
- no provider display name fabricated as canonical Person/Customer.

### COMM-UNIFIED-INBOX — Operational inbox

Deliver:

- unified conversation list;
- inbox/team assignment;
- agent assignment;
- internal notes;
- operational labels/tags that remain communication-plane metadata;
- attachments/media;
- search;
- unread state;
- agent presence/availability;
- conversation status;
- transfer/escalation;
- role-aware views.

Chatwoot owns communication-plane UI state only. It does not become the CRM, pricing, payment, booking, billing, memory or consent source of truth.

### COMM-HUMAN-AI — Human/AI coexistence

Deliver:

- Human > AI priority;
- human takeover;
- AI pause/resume;
- explicit hand-back;
- simultaneous Smart Visions and native-provider activity reconciliation;
- conflict prevention when a human is typing/replying;
- attribution of Human vs AI vs native-provider activity;
- audited control transitions.

### COMM-ACTION-BRIDGE — Safe outbound action path

A reply composed in Chatwoot must not create a bypass around Smart Visions safety.

Canonical path:

`Chatwoot UI -> Smart Core Action Request -> Policy -> Approval if required -> Canonical Send Gate -> Provider -> Verification/Reconciliation -> Chatwoot projection -> Audit`

Requirements:

- no direct provider send bypass for Smart Visions-controlled channels;
- idempotent request keys;
- canonical recipient re-read at provider boundary;
- Shadow Mode / Kill Switch / DNC / suppression / consent / reply-window / Cost Guard enforcement;
- ambiguous provider acceptance goes to reconciliation, not blind retry.

### COMM-RECONCILIATION — Message/event reconciliation

Deliver:

- inbound webhook mapping;
- outbound result mapping;
- provider message identity;
- read/delivery/failure states;
- dedupe;
- ordering tolerance;
- late-event handling;
- native-app reply evidence where provider APIs permit it;
- projection repair/replay;
- no second canonical provider journal.

### COMM-OPERATIONS — Chatwoot lifecycle operations

Deliver:

- backups;
- upgrade procedure;
- database migration procedure;
- rollback;
- observability;
- security patch cadence;
- capacity baseline;
- source fork drift reporting;
- deployment/runbook evidence.

## Exit criteria

Communication section is complete when Chatwoot source is truly deployed and used as the unified human communication plane without owning Smart Core business truth or bypassing Smart Core action safety.

---

# SECTION OMNICHANNEL — Channel expansion

## OMNI-META-SOCIAL

- Instagram Direct;
- Facebook Messenger;
- Meta account/page identity mapping;
- webhook verification;
- delivery/read status;
- human/native coexistence;
- canonical send gate.

## OMNI-TELEGRAM

- customer Telegram messaging where appropriate;
- keep current Owner Assistant/control plane separate from customer conversation identity;
- inbound/outbound reconciliation;
- media support.

### Current evidence checkpoint — 2026-09-27

- **Customer Telegram messaging — IMPLEMENTED / PRODUCTION_VERIFIED (controlled path):** PR #298 extends the existing tenant/business/Branch communication binding, Vault credential, CRM identity and canonical conversation/projection authorities; it does not introduce a second CRM, Conversation store, queue, Chatwoot integration or Owner Bot authority.
- **Owner/customer separation — IMPLEMENTED / PRODUCTION_VERIFIED:** customer routing and provider code use binding-scoped tenant credentials and never reuse the Owner Assistant's global Bot credential, owner authorization or owner command journal.
- **Inbound/replay/reconciliation — IMPLEMENTED / PRODUCTION_VERIFIED (fail-closed path):** binding-scoped secret-token webhook authentication, `update_id` idempotency, canonical identity resolution, Chatwoot projection and explicit reconciliation states are deployed. Unknown/missing binding evidence fails closed.
- **Outbound safety/reconciliation — IMPLEMENTED / PRODUCTION_VERIFIED (controlled path):** Telegram customer outbound is admitted only through the existing canonical approved-send/safety gate and remains subject to system controls; no Production smoke invoked a provider send.
- **Media support — IMPLEMENTED / PRODUCTION_VERIFIED (infrastructure path):** Telegram photo/document/audio/voice/video/video-note/sticker normalization/download boundaries are implemented and bounded. Real tenant media happy-path acceptance is still external-evidence gated.
- Production migrations: `0122_omni_telegram_customer_foundation` version `20260927171724` and `0123_telegram_activation_acceptance_fk_index_hardening` version `20260927172358`.
- Exact-main CI #1452 and Cloudflare Production Deploy #932 succeeded on `6532693d7cc653e6611af0fea3ba4eea432d6feb`; Production Worker version `0c1a6d02-de44-4603-804f-81e807a1f672`.
- Production remains `NOT_CONFIGURED + disabled` for customer Telegram with `telegram_ai_paused=true` and 0 bindings/events/acceptance receipts. No synthetic tenant/Bot evidence exists.
- Post-`0123` advisor evidence has no Telegram activation-receipt unindexed-FK finding.
- Real tenant Bot authorization plus real inbound/outbound/media end-to-end acceptance remains **BLOCKED_EXTERNAL**. This checkpoint does not authorize activation.
- CI migration-chain coverage past `0101` remains a separate repository hardening gap; Production application + post-apply verification are the direct SQL evidence for `0122/0123`.

## OMNI-WEBCHAT

- embeddable website chat;
- tenant/business configuration;
- anonymous-to-known identity transition;
- consent/session rules;
- file/media support;
- Chatwoot inbox projection.

### Current evidence checkpoint — 2026-09-27

- **Embeddable website chat — IMPLEMENTED / PRODUCTION_VERIFIED (runtime path):** the Smart Core widget is deployed on Cloudflare; exact-main CI #1423 and Production Deploy #903 are green.
- **Tenant/business configuration — IMPLEMENTED / PRODUCTION_VERIFIED (schema/runtime boundary):** canonical WEB_CHAT binding and widget configuration use the existing tenant/business/Branch authority. Production contains no fabricated real-tenant activation row.
- **Anonymous-to-known identity transition — IMPLEMENTED / PRODUCTION_VERIFIED (foundation):** anonymous sessions remain anonymous until evidence justifies canonical identity linkage; no fake Lead/Business identity is created for convenience.
- **Consent/session rules — IMPLEMENTED / PRODUCTION_VERIFIED (security path):** raw session token remains browser-only, DB stores SHA-256 hash, token is header-bound for polling/download, expiry/explicit close are enforced, and exact HTTPS Origin/public key are required.
- **File/media support — IMPLEMENTED / PRODUCTION_VERIFIED (infrastructure and fail-closed paths):** customer → Chatwoot media and operator → visitor attachment delivery reuse Chatwoot storage and canonical messages. The visitor never receives Chatwoot storage credentials/URLs. Real tenant media happy-path acceptance remains GAP-09.
- **Chatwoot inbox projection — IMPLEMENTED / PRODUCTION_VERIFIED (projection path):** inbound Web Chat creates actual Chatwoot API-Inbox messages and signed Chatwoot outgoing events reconcile back to canonical Smart Core messages. No second Conversation store or Chatwoot integration exists.
- Production migrations: `0118_web_chat_outbound_attachments_readiness` and `0119_web_chat_acceptance_fk_index_hardening`.
- Real tenant/browser end-to-end acceptance receipt count remains intentionally zero. **Disposition for that acceptance edge: BLOCKED_EXTERNAL / GAP-09.**
- This checkpoint does not mark the whole OMNICHANNEL section complete. `OMNI-CHANNEL-HEALTH` has only a Web Chat-specific canonical slice so far and requires a separate cross-channel audit.


## OMNI-TIKTOK

Implement only against an actually supported and contractually available messaging API.

- no fake TikTok capability;
- capability detection;
- webhook/send/reconciliation contract when available.

## OMNI-SMS-RCS

- provider abstraction;
- consent;
- country/routing policy;
- delivery/failure evidence;
- pricing/usage accounting.

### Current evidence checkpoint — 2026-09-28

- **Capability foundation — IMPLEMENTED / PRODUCTION_VERIFIED:** PR #304 extended the existing canonical channel/binding/control constraints for SMS and RCS without selecting or fabricating a provider. Production migration `0125_omni_sms_rcs_capability_foundation` is live as version `20260927212408`.
- **Readiness/routing policy — IMPLEMENTED / DEPLOYED:** PR #305 added provider-neutral, fail-closed route evaluation for provider connection, canonical permission/suppression, pricing evidence, exact country/channel capability, sender registration and evidence freshness.
- **Fallback — EVIDENCE-GATED:** RCS -> SMS fallback is available only when exact provider capability evidence explicitly declares the fallback and the fallback route independently passes readiness checks.
- **Runtime activation — BLOCKED_EXTERNAL / CONFIGURATION-GATED:** Production currently has zero SMS/RCS bindings, `sms_ai_paused=true` and `rcs_ai_paused=true`. No provider credential, webhook/send adapter, acceptance receipt or fake evidence exists.
- Active channel adapters remain unchanged until a real supported provider contract and country capability are verified. Consent and usage/cost must continue to reuse canonical authorities rather than creating parallel truth.

## OMNI-VOICE

- voice notes;
- transcription;
- voice reply;
- later telephony/voice-agent boundary;
- recordings/retention/consent;
- call outcome evidence.

### Current evidence checkpoint — 2026-09-28

- **Voice-note/transcription foundation — EXISTING CANONICAL PATH:** reuse the existing voice transcription/cache and media evidence primitives; do not create a second voice store.
- **Controlled WhatsApp audio reply — IMPLEMENTED / PRODUCTION_VERIFIED (fail-closed path):** PR #306 added the policy/synthesis foundation and PR #307 executes AI audio replies only through the existing Shadow artifact + approved-send boundary, Meta tenant provider, OpenAI TTS, Cost Guard/`usage_events` and canonical reconciliation semantics.
- **Safety boundary — VERIFIED:** the path is restricted to `INTERNAL_TEST` businesses; requires Shadow Mode ON, Kill Switch OFF, WhatsApp/OpenAI CONNECTED, open WhatsApp freeform window, no human takeover, disclosure + conservative reserve, approved `gpt-4o-mini-tts*` MP3 output; telephony and voice cloning are disabled.
- Exact-main CI run `36356555098` and Cloudflare Production Deploy run `36356705964` succeeded on `main@70a83c0a94d1a1e6613c222a6688ce3c450a4df0`.
- Production remains intentionally fail-closed: `organization_settings.config.voiceReply` is null and post-merge verification observed zero `VOICE_REPLY_TTS` usage events and zero `AUDIO_SENT` WhatsApp events.
- **Still open:** later telephony/voice-agent provider boundary, recording retention/consent and call outcome evidence. Do not mark the whole `OMNI-VOICE` package complete from the controlled WhatsApp reply slice alone.

## OMNI-CHANNEL-HEALTH

Unified per-channel:

- connection status;
- credential health;
- webhook health;
- provider rate limit/quota;
- last verified evidence;
- supported capabilities;
- incident state.

### Current evidence checkpoint — 2026-09-27

- **Connection status — IMPLEMENTED / PRODUCTION_VERIFIED (read-model path):** derived from canonical integration/binding/readiness evidence; pending/unimplemented channels remain explicitly non-green.
- **Credential health — IMPLEMENTED / PRODUCTION_VERIFIED (boundary):** active/configured rows, tenant bindings and readiness contracts are reused. Built-in Web Chat is explicitly credentialless; inactive Meta channels are not treated as authenticated.
- **Webhook health — IMPLEMENTED / PRODUCTION_VERIFIED (evidence model):** per-channel journal/event evidence is surfaced separately from configuration state.
- **Provider rate limit/quota — IMPLEMENTED / PRODUCTION_VERIFIED (telemetry path):** Resend + Meta provider response evidence is bounded and written to existing audit logs. `EVIDENCE_PRESENT / NEAR_LIMIT / RATE_LIMITED` require observed provider evidence; otherwise health remains `NO_PROVIDER_QUOTA_EVIDENCE`.
- **Last verified evidence — IMPLEMENTED / PRODUCTION_VERIFIED:** existing integration checks, binding verification, events, acceptance receipts and quota observations feed the health surface.
- **Supported capabilities — IMPLEMENTED / PRODUCTION_VERIFIED (declared-evidence path):** active Email/WhatsApp descriptor capabilities plus internally implemented/pending channel states are visible without widening the active adapter registry.
- **Incident state — IMPLEMENTED / PRODUCTION_VERIFIED:** pauses, missing configuration/binding, reconciliation conditions, credential gaps and pending Work Packages remain explicit blockers.
- Production migrations: `0120_omnichannel_health_messenger_bootstrap`, `0121_omnichannel_channel_rate_limit_evidence_index`.
- Exact-main CI #1441 and Production Deploy #921 succeeded on `8e857ae9cc68310e53ce89dac2c39399871f8f1b`.
- Current real provider quota observation count is zero. **Do not interpret an empty evidence stream as healthy provider quota.**
- `CONN-02` remains broader than this Work Package. Reconnect/disconnect, guided provider authorization, retention explanation and real customer acceptance stay open under their existing owners.


---

# SECTION IDENTITY_CRM — Customer identity, CRM and service truth

## CRM-PERSON-CONTACT

Create a governed canonical Person/Contact model only from sufficient identity evidence.

- person/customer profile;
- account/company relationship;
- household/organization relationships where justified;
- no person fabrication from display names.

## CRM-IDENTITY-GRAPH

- Email;
- Phone;
- WhatsApp;
- Instagram;
- Facebook;
- Telegram;
- Web identities;
- provider identifiers;
- merge candidates;
- confidence/evidence;
- manual merge/split;
- deterministic conflict handling.

## CRM-CUSTOMER360-V2

Unify:

- conversations;
- tasks;
- notes;
- deals;
- bookings;
- quotes;
- orders;
- invoices;
- payments;
- support cases;
- documents;
- consent;
- lifecycle;
- relationship history.

**Current evidence checkpoint — PARTIAL / PRODUCTION_VERIFIED for implemented authorities (2026-09-28):**
- PR #313 / Production migration `0129_crm_customer360_v2_person_context` composes canonical People with existing Lead, Conversation, Task and Deal authorities through explicit evidence-backed Person context.
- PR #321 / migration `0135_crm_customer360_support_integration` adds canonical Support Cases only through explicit Case `person_id`; it does not infer Person attribution from Company relationships or weaken immutable Support context.
- Production contains 0 canonical People and 0 Support Cases, so 19 Leads and 12 Conversations remain unlinked by design and no synthetic happy-path evidence is created.
- Person read/link correction is RLS/role governed; Support remains read-only inside 360; sensitive Support prose is not duplicated into the Customer 360 collection.
- Exact-main CI `36403380564` and Cloudflare Production Deploy `36403658680` succeeded on `main@eed2a07b0bda3ec87c57f7ee4c4062d40b351cd7`.
- Scoped Notes linkage remains authorization-gated, and Booking/Quote/Order/Invoice/Payment/Document/Consent remain REQUIRED under their owning Work Packages. Do not mark this whole Work Package complete from the implemented subset.

## CRM-ACCOUNT-V2

- Company/Account;
- contacts;
- account hierarchy;
- ownership;
- branch/business relationship;
- B2B lifecycle.

**Current evidence checkpoint — PRODUCTION_VERIFIED (2026-09-28):**
- PR #314 / Production migration `crm_account_v2_governance` extends canonical `public.businesses`; no second `crm_accounts` store exists.
- `crm_person_business_relationships` remains evidence-backed Contact authority.
- External branch/subsidiary/division hierarchy is Organization-bound and cycle-safe; `tenant_businesses` / `branches` remain the tenant operating hierarchy.
- Account ownership is constrained to assignable Organization members and governed by OWNER/ADMIN/SALES_MANAGER mutation authority.
- B2B lifecycle requires explicit bounded evidence. Production has 19 Businesses, all 19 `UNCLASSIFIED`, 0 owner assignments and 0 external hierarchy links; migration inferred nothing.
- Authenticated Account read is SECURITY INVOKER; trusted mutations are service-role-only SECURITY INVOKER; RLS and governance trigger are live.
- Exact-main CI `36370424412` and Cloudflare Production Deploy `36370581976` succeeded on `main@88a6ab7f1b4f4241ea031deda85b5cecd66b7bc1`.

## CRM-CUSTOM-OBJECTS

Governed Custom Objects only after a real use case proves the schema contract.

Must include:

- typed schema;
- versioning;
- RLS;
- relationships;
- lifecycle;
- audit;
- bounded querying.

No arbitrary JSON/EAV free-for-all.

## CRM-ACTIVITY-TASK-V2

- tasks;
- activities;
- reminders;
- ownership;
- due/overdue;
- recurring human work where justified;
- links to customer/deal/booking/order/case.

**Current evidence checkpoint — PRODUCTION_VERIFIED for current justified scope (2026-09-28):**
- PR #316 / migration `0131_crm_activity_task_v2` extends canonical `crm_tasks`; no second Task or Activity store exists.
- Deal linkage, reminders, reminder acknowledgement, due/overdue reads and immutable audit-derived activity are live.
- Production contains 0 CRM Tasks. Recurrence is `DEFERRED_WITH_REASON`; Booking/Order/Case links remain dependency-gated until those authorities exist.
- Exact-main CI `36371693852` and Cloudflare Production Deploy `36371846971` succeeded on `main@11599810d8ffebd081e3571859c1bc3588a08ebe`.

## CRM-SUPPORT-CASE

- ticket/case;
- priority;
- SLA policy owned by Smart Core unless licensed functionality is intentionally used;
- escalation;
- assignment;
- resolution;
- CSAT;
- linked conversation/customer/order/payment.

**Current evidence checkpoint — PRODUCTION_VERIFIED for currently available dependencies (2026-09-28):**
- PR #317 / migration `0132_crm_support_case` established one canonical Smart Core Support Case + SLA authority; PR #318 / `0133_crm_support_case_fk_index_hardening` closed its FK-index findings.
- Account/Person/Conversation linkage, priority, SLA, assignment, escalation, resolution and CSAT are governed.
- Production has 0 Cases and 0 SLA policies; no synthetic acceptance data exists.
- Order/Payment links remain REQUIRED but dependency-gated until those canonical modules exist.

## CRM-DATA-QUALITY

- duplicate detection;
- merge/split;
- import;
- validation;
- normalization;
- retention;
- audit;
- bulk operations with safety limits.

**Current evidence checkpoint — PRODUCTION_VERIFIED for implemented safe scope (2026-09-28):**
- PR #319 / migration `0134_crm_data_quality_foundation` reuses `CRM-IDENTITY-GRAPH` for exact conflict review and governed MERGE/SPLIT/UNLINK; no second dedupe engine exists.
- Deterministic read-only quality scanning plus bounded atomic verified Contact import are deployed over canonical Business/Identity/Person relationships.
- Import is capped at 100 rows / 256 KiB, validates the whole batch, is idempotent by request key + content hash, ambiguity-fail-closed and PII-minimized in receipt/audit evidence.
- Exact-main CI `36401560832` and Cloudflare Production Deploy `36401836383` succeeded on `main@4a1cf8d0064bf6f35f82987e6b5f78c2ee2f3bc1`; Production has 0 import batches and 0 People, so no synthetic acceptance data exists.
- Destructive retention remains `DEFERRED_WITH_REASON` until an Organization-approved retention contract exists. The Work Package is therefore not globally complete beyond its implemented safe scope.

---

# SECTION SEGMENT_SALES_MARKETING — Audience, sales, growth and retention

## SEGMENT-V2

Extend governed segments to justified entities:

- Customer/Person;
- Deal;
- Account where useful;
- lifecycle/behavioral criteria;
- saved views;
- governed custom-field predicates.

**Current evidence checkpoint — PRODUCTION_VERIFIED (2026-09-28):**
- PR #323 / migration `0136_segment_v2_multi_entity` extends the existing canonical `crm_segments + crm_segment_versions`; no second Segment/rule/membership engine exists.
- `LEAD | PERSON | DEAL | ACCOUNT` dynamic predicates are typed, allowlisted, bounded and side-effect-free apart from audit. Custom Fields remain Lead/Deal only.
- Exact-main CI `36409087711` and Cloudflare Production Deploy `36409341905` succeeded on `main@9762e5ce79022718ede2def30610b94843d7f591`. Production Segments/versions remain 0/0.
- Disposition: implemented `SEGMENT-V2` scope is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.

## SEGMENT-SNAPSHOT

- immutable audience snapshot;
- exact Segment semantic version;
- exact entity IDs;
- creation evidence;
- historical reproducibility;
- no silent mutation.

**Current evidence checkpoint — PRODUCTION_VERIFIED (2026-09-28):**
- PR #324 / migration `0137_segment_snapshot` adds a dedicated immutable historical-audience authority, not a second dynamic Segment evaluator.
- Snapshot header freezes exact Segment/version/entity type/predicate hash/member count/membership hash plus bounded creation evidence; members freeze exact ordered entity IDs.
- Creation is service-bound, OWNER/ADMIN/SALES_MANAGER attributed, request-key idempotent and capped at 10,000 members for the RC safety contract.
- Deferred integrity triggers verify exact member rows against frozen count/hash; UPDATE/DELETE is rejected. Authenticated Organization members have RLS-governed read only.
- Exact-head and exact-main CI proved Person and Deal Custom Field snapshot paths, replay, tamper rejection, historical reproducibility, tenant isolation, audit privacy and no send side effect.
- Exact-main CI `36411781776` and Cloudflare Production Deploy `36411960392` succeeded on `main@0e5e4e61be1d30c2ba134ed66a4ad1b2457a7c98`; Production migration version is `20260928104942`.
- Production Snapshots/members remain 0/0 because no synthetic acceptance data was fabricated.
- Disposition: current RC scope is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.

## SALES-SCORING

- lead score;
- fit;
- intent;
- engagement;
- evidence/reasons;
- manual override;
- model-assisted suggestions with deterministic ownership.


**Current evidence checkpoint — PRODUCTION_VERIFIED (2026-09-28):**
- PR #326 / Production migration `0138_sales_scoring_governance` extends canonical `public.leads`; no second score store or qualification engine exists.
- Existing deterministic score truth remains authoritative while fit/engagement provenance, revisioning, manual override/correction/expiry and advisory model suggestions are explicitly governed.
- Hunter acquisition scoring remains source-attributed evidence and is not conflated with canonical CRM Lead truth.
- Exact-head CI `36424281940`, exact-main CI `36424607322` and Cloudflare Production Deploy `36424885898` succeeded on `main@f6b08675d8c3a83aa6dccd8790fe9b9077e1c7ea`.
- Production migration version is `20260928125243`; 19 existing Leads were not rescored/backfilled and all new governance fields remain unused until real evidence is written.
- RLS/guard trigger and service-bound SECURITY INVOKER mutation contracts are live; controlled PostgreSQL 17 smoke proved replay/conflict safety, manual override correction, advisory-only model scoring, bounded engagement recompute, tenant isolation, audit privacy and zero outbound side effects.
- Disposition: current RC scope is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.

Production closeout:
- Canonical accepted scoring authority remains `public.leads`; PR #326 extended the existing authority rather than creating a second score table/engine.
- Migration `0138_sales_scoring_governance` adds governed fit/engagement dimensions, bounded evidence + policy/source provenance, optimistic scoring revision, explicit human override with expiry/correction semantics, and separately stored advisory model suggestions.
- Hunter scored Lead promotion now stamps explicit acquisition-source provenance through the trusted service boundary; acquisition scoring is not silently relabeled as generic CRM scoring truth.
- Trusted score mutations are SECURITY INVOKER, service-role-only and attributed to OWNER/ADMIN/SALES_MANAGER. Authenticated members retain RLS-governed reads; trusted browser mutation execute is denied.
- Controlled PostgreSQL 17 acceptance proved replay/conflict handling, override/base-score separation, model-suggestion non-authority, bounded engagement recompute, tenant isolation, audit privacy and no outbound side effect.
- Exact-head CI `36424281940`, exact-main CI `36424607322` and Cloudflare Production Deploy `36424885898` succeeded on `main@f6b08675d8c3a83aa6dccd8790fe9b9077e1c7ea`; Production migration version is `20260928125243`.
- Production remained honest: 19 existing Leads were not rescored/backfilled; governed revision/fit/engagement/override/model suggestion/provenance remain zero/null until real evidence is written.
- Disposition: current RC scope is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.

## SALES-PIPELINE-V2

- multiple pipelines;
- configurable stages;
- weighted amount;
- probability/forecast fields;
- owner/team;
- expected close;
- stage policies;
- Won/Lost evidence;
- forecasting read models.

**Current evidence checkpoint — PRODUCTION_VERIFIED (2026-09-28):**
- PR #329 / Production migration `0139_sales_pipeline_v2` extends the existing canonical `crm_pipelines + crm_pipeline_stages + crm_deals` authority. No second CRM, Pipeline engine, Deal store, Team store, commercial-history store or persisted weighted-amount truth was created.
- Stages now carry basis-point probability, typed forecast category and bounded policies for amount, expected-close and Deal probability overrides. Terminal WON/LOST semantics are fixed to 10000/0 bps and CLOSED_WON/CLOSED_LOST.
- Deals can reference the canonical `public.teams`, carry a policy-gated probability override, and require bounded typed close evidence plus authenticated actor attribution before governed WON/LOST completion.
- `crm_deal_forecast_rows` derives effective probability and weighted amount instead of persisting a second commercial truth; `get_crm_pipeline_forecast` exposes bounded owner/team/currency forecast summaries through SECURITY INVOKER/RLS.
- Exact-head CI `36429203959` succeeded on `b9ea52c29063f4aa19d52a3a9b24521fde373829`. Exact-main CI `36429525004` and Cloudflare Production Deploy `36429837860` succeeded on `main@6d609ebf4abcd2faadd8f474ec1a48849acdb434`.
- Production migration version is `20260928135144`. Production remains honest at 0 Pipelines / 0 Stages / 0 Deals / 0 forecast rows; no synthetic commercial acceptance records were created.
- Production RLS remains enabled on Pipelines, Stages and Deals. V2 policy/audit guards, Team/close-actor FKs and the security-invoker forecast view are live. Post-migration advisors show no new unindexed-FK finding for the V2 Deal Team or close-actor FKs; existing advisor debt remains separate.
- Controlled PostgreSQL 17 acceptance proved stage-policy rejection, Team tenant isolation, probability override gating, derived weighted forecast, bounded terminal evidence, terminal immutability, RLS isolation, audit privacy and zero outbound/conversation side effects.
- Disposition: current RC scope is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.

## SALES-NEXT-ACTION

- stale lead/deal detection;
- follow-up queue;
- next best action;
- reminders;
- AI suggestions;
- human ownership;
- no blind auto-send.

## MARKETING-CAMPAIGNS

- campaign definition;
- exact audience/Segment version;
- templates/content;
- schedule;
- channel policy;
- consent/suppression;
- frequency caps;
- budget caps;
- approvals;
- A/B experiments;
- response/conversion evidence.

## MARKETING-CONSENT

Canonical permission evidence:

- opt-in;
- opt-out;
- channel purpose;
- source;
- timestamp;
- legal/business basis where required;
- suppression;
- preference center.

Segment membership is never equivalent to send permission.

## MARKETING-ATTRIBUTION

- source/campaign;
- conversation;
- lead;
- deal;
- booking;
- order;
- payment/revenue;
- bounded attribution models;
- no fabricated click/view events.

## HUNTER-CUSTOMER-MODULE

Extend existing Hunter:

- tenant-facing targeting;
- prospect discovery;
- enrichment;
- qualification;
- credits;
- dedupe;
- CRM promotion;
- compliance;
- ROI evidence.

Prospects remain acquisition evidence until promoted into canonical CRM entities.

## CUSTOMER-SUCCESS-LOYALTY

- onboarding;
- health/status;
- retention;
- churn risk signals;
- reactivation;
- loyalty/rewards;
- referrals;
- lifecycle campaigns;
- governed customer-success tasks.

---

# SECTION AUTOMATION — Workflow, tools, approvals and execution

## AUTO-WORKFLOW-MODEL

- Trigger;
- Conditions;
- Actions;
- immutable published versions;
- draft/publish;
- ownership;
- enable/disable;
- execution state.

## AUTO-TRIGGER-CATALOG

Triggers for:

- message;
- customer/lead;
- deal;
- task;
- Segment entry/snapshot;
- booking;
- quote;
- order;
- invoice;
- payment;
- case;
- schedule;
- provider webhook;
- custom integration event.

## AUTO-CONDITION-ENGINE

- typed operators;
- tenant-bound facts;
- deterministic evaluation;
- no arbitrary SQL/eval;
- bounded complexity.

## AUTO-TOOL-ACTION-REGISTRY

Every AI/workflow action has:

- typed input/output;
- permission;
- scope;
- idempotency;
- cost class;
- side-effect class;
- approval requirement;
- verifier;
- audit contract.

## AUTO-APPROVAL

- AUTO;
- REVIEW;
- STRICT;
- approval queue;
- expiry;
- escalation;
- delegation;
- reviewer permissions;
- audit;
- denial reason;
- replay-safe execution.

## AUTO-RUNTIME

- durable execution;
- scheduler;
- outbox;
- retry policy;
- DLQ;
- compensation;
- timeout;
- concurrency;
- idempotency;
- outcome verification.

Reuse existing primitives. Do not create duplicate queue/automation systems without evidence.

## AUTO-BUILDER

Business-facing:

- visual builder;
- templates;
- validation;
- test mode;
- draft/publish;
- version comparison;
- execution history;
- error diagnostics.

## AUTO-NOTIFICATIONS

- in-app;
- push;
- email;
- Telegram owner notifications;
- SMS where enabled;
- notification preferences;
- dedupe;
- escalation.

---

# SECTION BOOKING_OPERATIONS — Scheduling and service operations

## BOOKING-CATALOG

- service duration;
- staff eligibility;
- branch/location;
- buffers;
- capacity;
- required resources;
- booking rules.

## BOOKING-AVAILABILITY

- staff calendars;
- business hours;
- holidays;
- timezone;
- capacity;
- conflicts;
- holds;
- deterministic availability.

## BOOKING-LIFECYCLE

- requested;
- held;
- confirmed;
- rescheduled;
- canceled;
- completed;
- no-show;
- audited transitions.

## BOOKING-AI

AI tools for:

- availability;
- booking;
- reschedule;
- cancel;
- reminders;
- escalation;
- deposit requirement.

## FIELD-SERVICE

Where industry packs require it:

- job/work order;
- technician;
- location;
- schedule;
- checklist;
- parts/materials;
- photos;
- status;
- completion evidence;
- customer sign-off.

---

# SECTION COMMERCE_PAYMENTS — Catalog, quotes, orders, invoices and money

## CATALOG-V2

- products;
- services;
- variants;
- media;
- branch availability;
- pricing references;
- warranty;
- inventory/stock where enabled;
- bundles/add-ons.

Canonical pricing ownership must remain explicit.

## QUOTE-ENGINE

- line items;
- canonical prices;
- taxes;
- discounts;
- validity;
- versions;
- approval;
- acceptance/rejection;
- PDF/document;
- conversion evidence.

## ORDER-ENGINE

- Quote -> Order;
- direct order where permitted;
- fulfillment;
- status;
- cancellation;
- returns;
- linked customer/booking/payment.

## INVENTORY-FULFILLMENT

When enabled:

- stock;
- reservation;
- adjustment;
- warehouse/branch;
- fulfillment;
- low-stock evidence;
- audited mutations.

## INVOICE-ENGINE

- invoice numbering;
- lines;
- tax/VAT;
- due dates;
- states;
- balances;
- credit notes;
- documents;
- immutable commercial evidence.

## PAYMENT-CORE

- payment intent;
- payment link;
- immutable transaction ledger;
- authorized/paid/failed/expired/refunded;
- reconciliation;
- idempotency;
- ambiguous-result handling.

## PAYMENT-OMAN

- Tap integration;
- Thawani integration;
- webhook verification;
- payment-link lifecycle;
- refund where provider supports it;
- reconciliation.

## PAYMENT-EXTENSION

Provider abstraction for future countries/gateways without replacing payment truth.

---

# SECTION BUSINESS_INTELLIGENCE_AI — Business Twin, knowledge, memory and agents

## BRAIN-BUSINESS-TWIN

Versioned business truth:

- business identity;
- branches;
- products/services;
- prices/references;
- hours;
- staff;
- policies;
- warranty/refund;
- booking/payment/delivery rules;
- brand tone;
- languages/dialects;
- escalation rules;
- operational constraints.

## BRAIN-INDUSTRY-PACKS

Configurable packs, not core forks, for examples such as:

- dental/medical;
- pet clinic;
- automotive/garage/showroom;
- salon/spa/beauty;
- restaurant/cafe;
- home services;
- real estate;
- education;
- retail/professional services.

Each pack may define onboarding, custom objects, pipelines, workflows, metrics, AI evaluation scenarios and templates.

## KNOWLEDGE-V2

- website ingestion;
- PDFs;
- docs;
- FAQs;
- policies;
- manuals;
- catalogs;
- source provenance;
- versions;
- approval;
- refresh;
- stale detection;
- retrieval permissions.

## MEMORY-V2

Typed memory:

- Conversation;
- Customer;
- Relationship;
- Business;
- Working;
- Episodic;
- Operational;
- Agent learning.

Every memory item needs source, confidence, freshness, sensitivity, validity and correction/expiry semantics.

## AI-CONTEXT-COMPILER

Deterministically composes:

- customer;
- conversation;
- CRM;
- Business Twin;
- knowledge;
- memory;
- pricing;
- policy;
- locale;
- permissions;
- tool availability.

## AI-AGENT-RUNTIME

Specialist roles may include:

- Router/Supervisor;
- Sales;
- Support;
- Booking;
- CRM;
- Quote/Commerce;
- Knowledge;
- Memory;
- Follow-up;
- Quality;
- Analytics.

Agents never own provider or financial side effects directly.

## AI-MODEL-PROMPT-CONTROL

- Prompt Registry;
- model routing;
- fallback;
- Cost Guard;
- versioning;
- shadow/canary;
- evaluation;
- rollback.

## AI-QUALITY-SAFETY

- evaluation datasets;
- regression suites;
- hallucination/evidence checks;
- red-team;
- policy testing;
- confidence/uncertainty;
- PII/sensitive-data handling;
- tool/action safety.

## AI-VOICE-VISION

- voice-note understanding;
- transcription;
- image/document understanding;
- media evidence;
- voice response where permitted;
- later phone agent with explicit consent/recording policy.

## AI-OWNER-COPILOT

Owner/Admin can ask and, when authorized, act on:

- leads;
- customers;
- deals;
- tasks;
- bookings;
- quotes;
- orders;
- invoices;
- payments;
- team performance;
- follow-ups;
- reports;
- campaigns;
- automations.

Copilot actions still cross Tool Registry -> Policy -> Approval -> Action Gateway -> Verify -> Audit.

---

# SECTION ANALYTICS_REPORTING — Metrics, attribution and decision support

## DATA-EVENT-METRICS

- canonical event feed;
- Metrics Registry;
- metric definitions;
- dimensions;
- tenant/business/branch scope;
- versioned definitions.

## DATA-WAREHOUSE

- CDC/event ingestion;
- analytics store/warehouse boundary;
- no heavy BI queries against OLTP paths;
- freshness and backfill contracts.

## DATA-DASHBOARDS

- leads;
- customers;
- conversations;
- response time;
- sales;
- pipeline;
- bookings;
- quotes;
- orders;
- revenue;
- payments;
- retention;
- staff;
- channel;
- AI;
- workflow;
- campaign.

## DATA-ATTRIBUTION

Governed marketing/sales attribution connected to real evidence.

## DATA-ASK

Ask Your Data through governed metrics and semantic definitions, not arbitrary production SQL.

## DATA-EXPORTS

- CSV;
- XLSX;
- PDF;
- JSON;
- Google Sheets;
- scheduled delivery;
- branch/role-aware data.

## DATA-REPORTING

- daily;
- weekly;
- monthly;
- custom;
- multilingual summaries;
- owner executive briefing;
- anomaly alerts.

---

# SECTION SAAS_PLATFORM — Monetization, admin, agency and marketplace

## SAAS-PLANS-ENTITLEMENTS

Plans:

- Starter;
- Growth;
- Pro;
- Business;
- Agency;
- Enterprise.

Govern:

- feature entitlements;
- limits;
- seats;
- channels;
- add-ons;
- API/storage allowances.

## SAAS-BILLING

Customer-facing formula supports:

`Setup + Platform + Features + Channels + Seats + AI Usage + Third-party Usage + Overage - Discounts + Tax`

Current commercial AI usage policy starts at 4x eligible raw AI cost, with billing from governed usage evidence only.

## SAAS-COUPONS

- fixed;
- percentage;
- setup discount/free setup;
- trial;
- channel/add-on discounts;
- validity;
- redemption caps;
- tenant/customer constraints.

## SAAS-AGENCY

- multiple subaccounts/businesses;
- delegated admin;
- reseller;
- white label;
- custom domain;
- agency usage/revenue;
- client access;
- permission boundaries.

## SAAS-SUPER-ADMIN

Smart Visions command center:

- tenants;
- businesses;
- users;
- plans;
- subscriptions;
- revenue;
- usage;
- AI/provider cost;
- channels;
- integrations;
- incidents;
- health;
- feature flags;
- coupons;
- invoices;
- support;
- audit;
- Shadow Mode;
- Kill Switch;
- controlled tenant impersonation with audit.

## SAAS-MARKETPLACE

- apps;
- skills;
- integrations;
- industry packs;
- paid add-ons;
- installation;
- entitlement;
- versioning;
- permissions;
- billing.

---

# SECTION DEVELOPER_ECOSYSTEM — APIs, integrations and partners

## DEV-PUBLIC-API

- versioned API;
- scoped API keys/OAuth;
- rate limits;
- tenant scoping;
- idempotency;
- audit;
- usage/billing.

## DEV-WEBHOOKS

- subscription;
- signing;
- retries;
- replay;
- delivery journal;
- endpoint health;
- secret rotation.

## DEV-SDK

Supported SDK/typed contracts where justified.

## DEV-INTEGRATIONS

Connector framework for:

- websites;
- ecommerce;
- accounting;
- calendars;
- ERP;
- external CRM;
- delivery;
- storage;
- productivity tools.

## DEV-SANDBOX

- test tenant;
- test credentials;
- synthetic/non-customer fixtures;
- no accidental Production provider sends.

## DEV-MIGRATION

- import/export;
- schema/version compatibility;
- customer onboarding/migration tools;
- safe rollback.

## DEV-PARTNER

- partner/reseller integration;
- delegated operations;
- API/portal access;
- commercial attribution.

---

# SECTION EXPERIENCE — Web, mobile and portals

## UX-BUSINESS-WEB

Complete role-aware Business dashboard for:

- Inbox;
- CRM;
- Sales;
- Tasks;
- Booking;
- Catalog;
- Quotes;
- Orders;
- Invoices;
- Payments;
- Knowledge;
- Automations;
- Analytics;
- Copilot;
- team/settings;
- billing.

## UX-MOBILE

iOS/Android role-aware app:

- Inbox;
- notifications;
- CRM;
- deals;
- tasks;
- booking;
- quotes;
- payments;
- analytics;
- owner Copilot;
- human takeover.

## UX-PWA

Responsive/PWA experience where valuable.

## UX-CUSTOMER-PORTAL

Customer-facing:

- appointments;
- quotes;
- orders;
- invoices;
- payments;
- documents;
- tickets/cases;
- preferences/consent.

## UX-PARTNER-PORTAL

Agency/reseller/partner controls.

## UX-DEVELOPER-PORTAL

API keys, docs, webhooks, usage and sandbox.

## UX-SUPERADMIN-MOBILE

Mobile operational control for Smart Visions owner/admin where safe.

## UX-LOCALIZATION

- English;
- Arabic;
- Persian;
- Hindi/Urdu where required;
- RTL;
- Omani/UAE/Saudi/Qatar locale behavior;
- timezone/currency/number/date correctness.

## UX-ACCESSIBILITY

- keyboard;
- screen-reader semantics;
- contrast;
- responsive behavior;
- error clarity;
- accessible forms/navigation.

---

# SECTION ENTERPRISE_OPERATIONS — Security, governance, reliability and scale

## ENT-IAM

- SAML;
- OIDC;
- SCIM;
- MFA/session policy;
- enterprise role policy;
- device/session controls where justified.

## ENT-DATA-GOVERNANCE

- classification;
- retention;
- deletion;
- export;
- legal hold where required;
- data lineage;
- residency;
- tenant/cell boundaries;
- PII controls.

## ENT-SECURITY

- secrets;
- encryption;
- least privilege;
- RLS;
- threat modeling;
- dependency/supply chain;
- vulnerability response;
- abuse/rate limiting;
- security audit.

## ENT-INCIDENT

- incident states;
- severity;
- response runbooks;
- evidence;
- communication;
- postmortem.

## ENT-OBSERVABILITY

- logs;
- traces;
- metrics;
- SLO/SLI;
- alerts;
- per-tenant/provider/workflow diagnostics;
- cost visibility.

## ENT-PERFORMANCE

- load tests;
- concurrency;
- queue pressure;
- DB/query plans;
- caching only where measured;
- capacity planning.

## ENT-BACKUP-DR

- backups;
- restore drills;
- RPO/RTO;
- regional/cell recovery;
- disaster runbooks.

## ENT-RELEASE

- candidate isolation;
- migration safety;
- feature flags;
- canary;
- rollback;
- schema compatibility;
- app/mobile release controls.

## ENT-CONTRACTS

- enterprise plan/contracts;
- custom limits;
- data residency options;
- support/SLA product contract;
- negotiated billing without violating canonical ledger rules.

---

# SECTION FINAL_ACCEPTANCE — Full product completion gate

## FINAL-E2E

Prove representative end-to-end flows:

`Message -> Chatwoot -> Identity -> Customer 360 -> Business Brain/Memory -> Agent/Human -> Tool/Approval -> CRM/Booking/Quote/Order/Payment -> Provider Verification -> Audit -> Analytics -> Owner Copilot`

Across representative industries and channels.

## FINAL-COMMERCIAL

Verify:

- subscriptions;
- entitlements;
- billing;
- AI markup;
- provider usage;
- overages;
- discounts;
- tax;
- agency/reseller accounting.

## FINAL-SAFETY

Verify:

- tenant isolation;
- Human > AI;
- Shadow/canary;
- Kill Switch;
- consent/DNC/suppression;
- financial approvals;
- provider idempotency/reconciliation;
- PII controls.

## FINAL-OPERATIONS

Verify:

- dashboards;
- alerts;
- runbooks;
- backup/restore;
- incident response;
- upgrade/rollback;
- support workflow.

## FINAL-LAUNCH

Release criteria:

- no known unresolved P0/P1 product/security/data-integrity defects;
- production migration chain verified;
- representative load/capacity verified;
- mobile/web release gates verified;
- controlled pilots completed;
- owner/admin operational readiness documented;
- Production evidence reconciled into current-state docs.

---

# Definition of Done for every work package

A work package is not complete merely because a PR merged.

Where applicable it requires:

- current-state/gap audit;
- explicit source-of-truth ownership;
- schema and RLS;
- API/runtime behavior;
- UI where user-facing;
- formal lifecycle/state machine;
- RBAC/ABAC;
- idempotency;
- retries/reconciliation;
- failure behavior;
- audit;
- events;
- metrics/observability;
- usage/billing implications;
- security review;
- static/unit/integration tests;
- PostgreSQL migration-chain verification;
- exact-head CI;
- technical review;
- zero unresolved review threads;
- controlled Production promotion;
- Production verification;
- rollback/recovery evidence;
- documentation/handoff reconciliation.

# Delivery packaging and pull-request policy

The stable roadmap is Section/Work-Package based. Pull Requests are implementation evidence only.

Detailed packaging rules are defined in `DELIVERY_PACKAGING_STANDARD.md`.

Rules:

1. Never pre-assign GitHub PR numbers or a fixed PR count to future work.
2. Never renumber Sections or Work Package IDs because implementation packaging changes.
3. Prefer complete vertical slices that combine compatible audit, schema, API/runtime, authorization, tests, UI, migration/rollback and documentation work when they share one bounded context and one safe promotion boundary.
4. Do not create separate audit, implementation, hardening, index-cleanup or documentation PRs by habit. Split only when a real independent security, migration, provider, financial, rollback or Production-verification gate requires it.
5. Multiple adjacent Work Packages may share one delivery package when ownership, failure model, test story and rollback boundary remain clear.
6. Never reduce approved product scope, architecture quality, safety, observability, rollback evidence or test coverage merely to minimize PR volume.
7. Record actual PR numbers only after they exist.
8. The continuation cursor advances only when the Work Package Definition of Done is satisfied by real evidence.
9. Emergency/hotfix work does not change roadmap numbering.
10. Runtime/Production evidence may reorder execution inside a Section when a real blocker exists, but semantic IDs remain stable.

# Non-negotiable architecture rules

- Chatwoot is the source-based Communication Plane, not Smart Core.
- Smart Core owns CRM/customer/business truth, consent, pricing, booking, commerce, payments, billing, knowledge/memory policy and action safety.
- Human activity overrides AI.
- AI never directly owns provider/financial side effects.
- Provider actions are idempotent and fail closed.
- No blind retry after ambiguous provider acceptance.
- No parallel CRM, Knowledge Base, pricing truth, audit ledger, Agent framework, workflow engine or provider journal without a proven blocker.
- Analytics is separated from heavy OLTP workloads.
- Material mutations are audited.
- Tenant isolation is structural.
- Production evidence outranks plans and chat memory.


---

# Production evidence checkpoint — SALES-NEXT-ACTION

## SALES-NEXT-ACTION Production closeout — 2026-09-28

**Disposition: IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED.**

- PR #331 delivered the bounded `SALES-NEXT-ACTION` slice by extending the existing canonical `public.crm_tasks` authority and deriving a prioritized read model from canonical Tasks, Leads, Deals and Conversation activity. It did not create a second task/reminder store, ownership model, scoring engine, automation engine, queue/outbox or provider send path.
- Exact-head CI for PR #331: `36460193532` succeeded. PR #331 merged to `main@fc82c727c7099e46602a466d3d4faaac1fa4b574`.
- Production migration `0140_sales_next_action` is applied as version `20260928174748`.
- Production runtime verification of 0140 exposed PostgreSQL `42804` because long-lived Production uses enum `public.lead_status` while the derived UNION exposed `source_status text`. This was treated as a real Production defect, not papered over.
- PR #332 fixed only the canonical `get_crm_next_actions` function by explicitly normalizing Task, Lead and Deal source statuses to text. No data mutation, seed, new table or second authority was introduced.
- Final exact-head CI for PR #332: `36462166810` succeeded on `c1489fcf719dbf348e3e95b9917180c67d36946c`. PR #332 merged to `main@7a923beacb89fa8a39c7f35f0255ad9532ff5d54`.
- Exact-main CI `36462560234` succeeded on that same SHA. Cloudflare Production Deploy `36462884290` also succeeded, including exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0141_sales_next_action_status_cast_fix` is applied as version `20260928180433`.
- Production runtime now executes `get_crm_next_actions(...,72,NULL,200)` successfully under authenticated RLS for the real Smart Visions owner. Current real data is 19 Leads / 0 Deals / 0 CRM Tasks / 0 NEXT_ACTION Tasks / 6 PENDING legacy `followup_jobs`. The derived queue currently returns 17 real `LEAD_STALE` candidates; the remaining 2 Leads are recent NEW Leads and therefore correctly excluded by the 72-hour stale boundary.
- `crm_tasks` RLS remains enabled. `crm_tasks_next_action_guard` and `crm_tasks_next_action_audit` are live. All three next-action functions are SECURITY INVOKER. Authenticated users can execute only the read function; acceptance and model-suggestion mutation functions are restricted to `service_role`.
- Human acceptance remains explicit: the authenticated API resolves the human actor, then the trusted service boundary creates the canonical Task with actor provenance. SALES_AGENT cannot assign another user. Direct browser fabrication of `NEXT_ACTION` Tasks is rejected.
- AI next-action suggestions remain advisory only. They cannot change task owner/status/due/reminder/send state and do not create provider/customer side effects.
- Legacy `followup_jobs` remains outreach scheduling evidence only and is not the canonical CRM work queue.
- No synthetic Production Deal, Task or next-action fixture was created. Production stayed at 0 Tasks/0 NEXT_ACTION Tasks through verification. No outbound/provider send path is invoked by the derived queue or hotfix.
- Current Supabase advisor output contains pre-existing platform debt, but no new advisor finding specific to the SALES-NEXT-ACTION schema/function hotfix.

**Fresh continuation cursor:** `SECTION SEGMENT_SALES_MARKETING -> MARKETING-CAMPAIGNS`.

Before mutation, re-audit current main/open PRs/exact-head CI, Production migrations/schema/data/security and current provider/consent/campaign authorities. Reuse existing canonical suppression, outreach/provider, segment/snapshot and audit authorities. Do not create a second campaign, consent, audience, send or provider-truth plane.

---

# Production evidence checkpoint — MARKETING-CAMPAIGNS

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
