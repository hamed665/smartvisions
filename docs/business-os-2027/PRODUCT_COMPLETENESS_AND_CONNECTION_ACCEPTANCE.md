# Product completeness and customer connection acceptance — Business OS 2027

## PAYMENT-OMAN Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> PAYMENT-OMAN`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Oman gateway-adapter scope. Real merchant activation, merchant approval, credentials and real-money E2E remain **BLOCKED_EXTERNAL** until legitimate provider evidence exists.
- Implementation PR #408 final head `dd39c43a6f3d9a97f3190941a570bef286e85f1c` passed exact-head CI `37049624399` across lint, typecheck, tests, the complete PostgreSQL 17 migration chain plus PAYMENT-OMAN controlled smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #408 squash-merged to canonical `main@87a036cac3bf983a787523162fddc4ca4f07677b`. Exact-main CI `37050014540` and Cloudflare Production Deploy `37050299511` succeeded on that exact merge SHA.
- Production migration source `supabase/migrations/0179_payment_oman.sql` is applied in Supabase Production as migration `payment_oman@20261002185224`; merged migration blob SHA is `006b9e68fa83392feea5b2d4a596fd16e844290d`.
- PAYMENT-OMAN extends the existing canonical PAYMENT-CORE only. Tap and Thawani remain provider adapters; they do not own a second payment ledger, Invoice, Refund engine, webhook journal, queue, IAM, scheduler or billing authority.
- Provider credentials use the existing Supabase Vault boundary. `integration_connections` stores only Vault references and non-secret provider configuration. Trusted credential create/update/read and provider-configuration functions are service-role-only, SECURITY INVOKER, and denied to `authenticated`.
- Tap support includes hosted OMR charge creation, merchant binding, verified hashstring webhook ingestion, authenticated charge readback, governed Payment Link evidence, and provider refund execution/reconciliation. A Tap API response or link never marks an Invoice paid without canonical verified provider evidence.
- Thawani support includes TEST/LIVE hosted checkout sessions, OMR-to-baisa normalization, publishable/secret key separation, authenticated server-to-server session readback, governed settlement reconciliation, and provider refund execution where supported.
- Ambiguous provider outcomes fail closed into the existing `RECONCILIATION_REQUIRED` path. Captures/refunds still enter the immutable PAYMENT-CORE provider-event/transaction authority with replay-safe provider event IDs.
- Business Web exposes authenticated Oman-provider configuration and Payment Link/refund controls under the existing Payments surfaces. Stored provider secrets are never displayed back to operators.
- Production routed smoke found a real callback-routing defect after the first deploy: new provider callbacks were receiving the operator-auth `307` redirect. Hotfix PR #409 final head `bfd10b3881642f3ecc966ebab0249513e29df71f` passed exact-head CI `37050896062` and merged to canonical `main@bc2fc8664c1fa22def73e50e1ac98ed03bfd6ecb`.
- Exact-main CI `37051363965` and Cloudflare Production Deploy `37051736988` succeeded on the hotfix merge SHA. Fresh routed Production smoke verifies `/payments/providers` remains auth-protected (`307` unauthenticated), while Tap return, Thawani reconciliation and invalid provider webhook POSTs reach the public callback handlers and fail safely with `400` instead of redirecting to Login.
- Production verification remains side-effect clean: `payment_intents=0`, `payment_links=0`, `payment_refunds=0`, `payment_provider_events=0`, `payment_transactions=0`, Oman provider connections `0`, and Payment-named Vault secrets `0`. No synthetic merchant, credential, customer, Payment Link, transaction, refund, provider callback or provider-success evidence was created.
- Fresh advisor baseline remains unchanged from the pre-PAYMENT-OMAN baseline: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`.
- Tap/Thawani merchant onboarding, real provider credentials, provider approval and a real paid/refunded transaction remain external-evidence gated. Their absence does not justify fake Production success.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> PAYMENT-EXTENSION`.

Before mutation, audit the new canonical provider adapter boundary plus current `PAYMENT-CORE`, `integration_connections`, Vault wrappers, provider callback/reconciliation contracts, UI/provider selection and currency assumptions. PAYMENT-EXTENSION should make future country/gateway adapters plug into the same canonical payment truth without provider-specific ledgers, credential stores, webhooks, refund engines or settlement state.

---


## PAYMENT-CORE Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> PAYMENT-CORE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled provider-neutral Payment Core scope.
- Implementation PR #406 final head `4f9a9124fb113615a6bcd379fa0bce2302ce3c82` passed exact-head CI `37040760574` across lint, typecheck, tests, the full PostgreSQL 17 migration chain plus PAYMENT-CORE controlled smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #406 squash-merged to canonical `main@1669f47eb214427860983377d56aa37572119067`. Exact-main push CI `37041194204` succeeded on that exact merge SHA. Cloudflare Production Deploy `37041596109` succeeded on the same SHA through exact-green checkout, release-candidate smoke, controlled SSR load, Production promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0178_payment_core@20261002173449` is live from merged migration blob `bbd54adcdaa84e12445c303288a3da794707a2f9`.
- Canonical Payment authority is one provider-neutral chain: `public.payment_intents`, `payment_links`, immutable `payment_provider_events`, immutable `payment_transactions`, and governed `payment_refunds`. It does not create a second Invoice, Order, Catalog, SaaS billing ledger, provider send plane, outbox, approval engine or scheduler.
- Invoice commercial truth remains owned by INVOICE-ENGINE. Payment Core owns money intent/provider evidence/settlement/refund truth and is the only governed writer of the Invoice `paid_total` settlement projection. Payment Link creation, provider request acceptance or ambiguous HTTP outcomes never mark an Invoice paid.
- Settlement/refund ingress accepts only verified provider-webhook evidence or explicit reconciliation evidence. Provider event IDs are replay-safe/idempotent; conflicting replay fails closed. Ambiguous outcomes enter `RECONCILIATION_REQUIRED` rather than manufacturing success.
- Partial Invoice collection is supported by bounded exact-amount Payment Intents. Capture enforces current Invoice balance and prevents over-settlement. Refund requests do not move money; only verified/ref reconciled refund evidence decreases the governed Invoice paid projection. Refund and Credit Note remain distinct money-movement vs commercial-correction concepts.
- `PAYMENT_INTENT`, `PAYMENT_CAPTURED`, `PAYMENT_FAILED`, and `PAYMENT_REFUNDED` are now AVAILABLE canonical Automation triggers with subject `PAYMENT`, drained by the existing Automation Runtime. No second scheduler/event plane was introduced.
- Customer 360 V6 composes Payment truth over V5 with a cutover-safe V6 -> V5 app fallback. Business Web exposes `/payments`, Payment evidence detail, Invoice -> Payment Intent creation, unresolved-intent cancellation and governed Refund request surfaces; there is no manual “mark paid” shortcut.
- Production verification is side-effect clean: `payment_intents=0`, `payment_links=0`, `payment_refunds=0`, `payment_provider_events=0`, and `payment_transactions=0`. No synthetic Production Payment Intent, link, transaction, refund, provider callback, customer or merchant success was created.
- RLS is enabled on all five exposed Payment tables. Authenticated access is scoped read-only; direct authenticated INSERT/UPDATE is absent. Trusted financial mutation/provider-event RPCs are service-role-only while Customer360 V6 remains authenticated-readable through its governed composition.
- Runtime verification confirms canonical Payment RPCs, Customer360 V6, Invoice Payment projection guard and Payment Automation triggers are live.
- Post-`0178` advisor categories/counts remain unchanged from the pre-Payment baseline: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. Fresh zero-row Payment indexes may appear as unused-index INFO and are not an integrity regression.
- Production Vault currently has no Tap-, Thawani- or generic Payment-named secret records. PAYMENT-CORE therefore does **not** claim real provider activation, merchant approval or real-money E2E evidence. Those provider-specific responsibilities belong to the next official Work Package, `PAYMENT-OMAN`.
- Existing real-tenant WhatsApp E2E / same-number Coexistence blockers remain external-evidence gated and unchanged.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> PAYMENT-OMAN`.

Before mutation, fresh-audit existing provider abstractions, integration bindings, Vault refs, provider webhook journals/idempotency/reconciliation patterns, current Tap/Thawani code/docs/credentials/merchant activation state, Payment Core adapter boundaries, approval/audit/Automation reuse, and current Production webhook/deploy routing. PAYMENT-OMAN must extend canonical PAYMENT-CORE only; it must not create provider-specific payment ledgers, a second webhook plane, a second refund engine, or fake provider success.

---


## INVOICE-ENGINE Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> INVOICE-ENGINE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical Invoice/Credit Note scope.
- Implementation PR #404 final head `a1017fdbb30580343e7f3243743d19978650c2dd` passed exact-head CI `37028750396` across lint, typecheck, tests, the full PostgreSQL 17 migration chain plus INVOICE-ENGINE controlled smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #404 squash-merged to canonical `main@f5cd536af673c6f3f18085d78e3976ba279c596f`. Exact-main push CI `37029188586` succeeded on that exact merge SHA. Cloudflare Production Deploy `37029594495` succeeded on the same SHA through exact-green checkout, release-candidate smoke, controlled SSR load, Production promotion, routed smoke and safe API/webhook rejection smoke.
- Production migration `0177_invoice_engine@20261002154909` is live from merged migration blob `07382072f26b9f457ecd12b801717e354f2f344b`.
- Canonical Invoice authority is `public.invoices` with immutable `invoice_line_items`, immutable `invoice_credit_notes` / `invoice_credit_note_line_items`, and durable `invoice_lifecycle_events`. One canonical Invoice is allowed per canonical Order; creation converges on the existing Invoice rather than manufacturing a parallel commercial document.
- Invoice commercial values and tax/VAT evidence snapshot canonical ORDER-ENGINE evidence. INVOICE-ENGINE does not re-price Catalog data, does not create a second tax authority, and persists immutable issue-time customer documents with governed print/Save-as-PDF surfaces.
- Governed lifecycle covers Draft, Issued, Overdue and Void plus bounded line-level Credit Notes. Credit Notes reduce commercial balance only and never execute a money refund. `paid_total` is deliberately frozen until `PAYMENT-CORE` owns governed settlement projection; Payment/refund transaction truth is not invented in this slice.
- `INVOICE_ISSUED` and `INVOICE_OVERDUE` are now AVAILABLE canonical Automation triggers with subject `INVOICE`. Due/overdue reconciliation and Invoice event projection reuse the existing Automation Runtime scheduler. The same runtime wiring also now invokes the pre-existing `reconcile_order_automation_events` producer so already-AVAILABLE Order triggers are actually drained without adding another scheduler.
- Customer 360 V5 composes Invoice truth over V4 with a cutover-safe fallback during app-before-migration deployment windows. Business Web exposes `/invoices`, Order -> Invoice creation, governed issue/void/Credit Note operations, lifecycle evidence and immutable Invoice/Credit Note document routes.
- Production verification is side-effect clean: `invoices=0`, `invoice_line_items=0`, `invoice_credit_notes=0`, `invoice_credit_note_line_items=0`, and `invoice_lifecycle_events=0`. No synthetic Production Invoice, Credit Note, customer, Order, payment, refund or provider evidence was created.
- RLS is enabled on all five exposed Invoice tables; governed mutation/reconciliation RPCs are service-role-only while authenticated access remains scoped read-only. Runtime verification confirms the Invoice RPCs, Customer360 V5, Payment-Core freeze guard and AVAILABLE Invoice Automation triggers are live.
- Post-`0177` advisor categories/counts are unchanged from the pre-Invoice baseline: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. Fresh zero-row Invoice indexes may appear as unused-index INFO and are not an integrity regression.
- Existing real-tenant WhatsApp E2E / same-number Coexistence blockers remain external-evidence gated and unchanged.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> PAYMENT-CORE`.

Before mutation, fresh-audit current Invoice/Order/Quote/Customer/Deal/Booking/Billing ledger/payment-link/provider/webhook/refund/idempotency/approval/Automation authorities plus Production provider credentials and activation state. PAYMENT-CORE must introduce one canonical payment/settlement/refund transaction authority only; it must not rewrite immutable Invoice evidence, invent provider acceptance, or create a second billing ledger/provider-send plane.

---


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

## ORDER-ENGINE Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> ORDER-ENGINE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical Order scope.
- Implementation PR #398 final head `4e2f3007c944cc3fb40b791359cc9558cffe30d5` passed exact-head CI `37009383921`; canonical merge `main@4c5d5b26d33b460e4d19c6e13551a65eda4d98dc` passed exact-main CI `37009775188` and Cloudflare Production Deploy `37010061631`.
- Production migration `0173_order_engine@20261002130127` is live from merged blob `9123adb5a748a0b5440039ccb81ebe69cfff3236`.
- Acceptance verified: accepted Quote -> Order conversion, permitted direct canonical-price Order creation, immutable commercial line snapshots, processing/fulfillment evidence, pre-fulfillment cancellation, governed return request/decision/receipt, linked Customer 360 V4, and AVAILABLE `ORDER_CREATED` / `ORDER_STATUS_CHANGED` Automation triggers.
- Authority boundaries verified: Catalog/Service/Product pricing remain canonical upstream truth; Booking/Field Service remain their own operational authorities; ORDER-ENGINE introduced no Invoice, Payment/refund, stock quantity, reservation, warehouse or stock-movement authority.
- Security verified: all six Order tables have RLS; authenticated users have scoped SELECT only and no direct DML; trusted Order mutation/reconciliation RPCs are service-role-only; no second IAM or approval/runtime plane was created.
- Production acceptance remained side-effect clean with all six Order tables at 0 rows. No synthetic Production Order, return, customer, Product, Quote, payment or provider fixture was used.
- Advisor follow-up found exactly three new composite-FK index gaps. Hardening PR #399 final head `4935cbcfad527f2084123faa722ab1ada9ba9cb0` passed exact-head CI `37010634724`, merged as `main@ac65d781251f8be112a351aa3ca73cd110314b68`, and passed exact-main CI `37011043404` plus Cloudflare Production Deploy `37011371669`.
- Production hardening migration `0174_order_engine_fk_index_hardening@20261002131210` is live from merged blob `b799d423d2db191f10c22a63ec116d09774ae683`. The Order-specific FK findings are closed and `unindexed_foreign_keys` returned to baseline 14 with no new Order security finding.
- Existing WhatsApp real-tenant E2E and same-number Coexistence acceptance remain external-evidence gated and unchanged.
- Managerial estimate after ORDER-ENGINE: Phase 8 approximately **58% complete / 42% remaining**; overall program approximately **66% complete / 34% remaining**. Planning estimate only.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> INVENTORY-FULFILLMENT`.

---

## QUOTE-ENGINE Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> QUOTE-ENGINE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical Quote scope.
- Implementation PR #395 final head `f1a081a9337319e85e122bd9aff21e07c33d9673` passed exact-head CI `36993458750` across lint, typecheck, unit tests, the complete PostgreSQL 17 migration chain plus QUOTE-ENGINE smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #395 squash-merged to canonical `main@9eda74e080d00c2c691430709635d8719f7f885b`. Exact-main push CI `36994472061` succeeded on that exact merge SHA. Cloudflare Production Deploy `36994762553` succeeded on the same implementation merge SHA.
- Production migration `0171_quote_engine@20261002101923` is live; merged migration blob SHA is `688e38ed30df6706e1c67021e909638538b00c8c`.
- Post-deploy advisor review found three physically duplicate indexes only. Hardening PR #396 final head `adb843bd9aa2ab2fe8197788b3c43b40dcbdda9b` passed exact-head CI `36994998689`, squash-merged to `main@3eec7169ff51c70a737b358c54a1a2612c6257d8`, and exact-main CI `36995343955` plus Cloudflare Production Deploy `36995601281` succeeded.
- Production hardening migration `0172_quote_engine_postdeploy_hardening@20261002102818` is live; merged migration blob SHA is `07a2ee52a75376cddcdb730fcd81e69c54859803`. The three redundant indexes are gone while the existing canonical equivalents remain.
- Canonical Quote authority is `public.quotes` with immutable `quote_versions` and `quote_line_items`, governed `quote_version_reviews`, and durable `quote_lifecycle_events`. Service/Product/Variant identity and pricing remain owned by the existing Catalog authorities; QUOTE-ENGINE snapshots those prices and does not become a second Catalog or pricing truth.
- Quote lifecycle is governed and idempotent across Draft, Review, Sent, Viewed, Accepted, Rejected, Expired and evidence-only Conversion. Approval policy remains owned by `approval_rules`; `QUOTE_ACCEPTED` is now AVAILABLE in the canonical Automation Trigger Catalog with expected subject `QUOTE`.
- Customer-facing Quote document snapshots exclude internal notes, approval metadata and internal price IDs. Business Web exposes `/quotes`, version/review/customer-decision controls and a print/Save-as-PDF document surface without creating a second Document authority.
- Customer 360 V3 composes explicitly linked Quote truth. No Order, Invoice, Payment, inventory/stock, generic Document store, second approval engine, second scheduler or parallel event bus was introduced.
- Production verification remained side-effect clean: `quotes=0`, `quote_versions=0`, `quote_line_items=0`, `quote_version_reviews=0`, `quote_lifecycle_events=0`. No synthetic Production Business, Person, Deal, Quote, customer decision, provider event or Order was created.
- All five Quote tables have RLS enabled; `anon` has no SELECT, `authenticated` has scoped SELECT only and no INSERT, trusted mutation RPCs are service-role-only, and Customer360 V3 is the bounded authenticated read composition.
- Post-0172 advisors show no QUOTE-ENGINE-specific new security, unindexed-FK, multiple-permissive-policy or duplicate-index regression. Remaining advisor findings pre-date this slice; unused-index INFO on zero-row Quote tables is expected until real traffic exists.
- Existing WhatsApp external blockers are unchanged.
- Managerial recalibration after this verified slice: Phase 8 Billing & Commercial Platform is approximately **50% complete / 50% remaining**; overall program is approximately **65% complete / 35% remaining**. These are planning estimates, not canonical runtime state.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> ORDER-ENGINE`.

Before mutation, fresh-audit current Quote/Deal/Catalog/Booking/Order/Invoice/Payment/Inventory authorities, open PRs and Production schema. ORDER-ENGINE must consume accepted canonical Quote evidence without creating a second Quote, Catalog, CRM, Invoice or Payment truth.

---


## CATALOG-V2 Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical Catalog V2 scope.
- Implementation PR #393 final head `0e7b24d24144e6614f5eca13b5a4e8e475107ae7` passed exact-head CI `36983839157`; canonical merge is `main@7e128fda4d644ea7374ad4244fc50083e6af7bb8`.
- Exact-main push CI `36984294927` and Cloudflare Production Deploy `36984634584` succeeded on that exact merge SHA.
- Production migration `0170_catalog_v2@20261002083318` is live; merged migration blob SHA is `435516227f772e2788bbf2b3c976e2d2f445507e`.
- `public.services` remains canonical Service identity and `public.service_prices` remains canonical Service pricing. Product, Variant and Product/Variant pricing are explicit new canonical authorities; Branch availability references `public.branches`.
- Product and Variant SKU uniqueness is Organization-scoped; Product/Variant price uniqueness is subject + country + currency. Media/warranty are bounded and Bundle/Add-on relations reject self-reference/direct reverse cycles.
- Inventory is reference-only at this stage: no stock quantity, reservation, movement, warehouse or fulfillment authority was introduced. Quote/Order/Invoice/Payment authorities also remain deferred to their owning Work Packages.
- Seven catalog tables are live with RLS. Authenticated access is scoped SELECT-only; trusted mutations are service-role governed with OWNER authorization, mutation guards, version/replay semantics and canonical audit evidence.
- Production remained side-effect clean: all seven CATALOG-V2 tables 0-row, `services=8`, `service_prices=37`, `branches=0`, `tenant_businesses=0`, no CATALOG-V2 audit rows, and no synthetic Product/Business/Branch/customer/provider evidence.
- Advisor comparison found no new security, unindexed-FK, auth-RLS-initPlan or multiple-permissive-policy regression; unused-index INFO moved 266 -> 294 because 28 fresh zero-row catalog indexes are unused.
- Existing WhatsApp real-tenant E2E and same-number Coexistence external blockers remain unchanged.
- Managerial estimate after CATALOG-V2: Phase 8 approximately **42% complete / 58% remaining**; overall program approximately **64% complete / 36% remaining**.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> QUOTE-ENGINE`.

---

## WhatsApp onboarding Slice 8 checkpoint — 2026-10-02

**Disposition: IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled reconnect/revoke/disconnect lifecycle and deploy scope. **First real consented tenant E2E and real same-number Coexistence remain BLOCKED_EXTERNAL / pending real external evidence.**

- PR #391 final head `09697e4127fbd3bb8a8216bc945bd16fbcfa637b` passed exact-head CI `36979621813`; canonical merge is `main@5051d6984e1d6413a0077da8da3142f89ef740cd`.
- Exact-main CI `36979959886` and Cloudflare Production Deploy `36980189935` succeeded on that exact merge SHA.
- Production migration `0169_whatsapp_reconnect_disconnect_lifecycle@20261002074458` is live; merged blob SHA `10dd1fd8fdefed603dd8688f92130e70b7348774`.
- Reconnect reuses the canonical binding/version/setup-attempt/Vault authorities, rotates credentials on the same logical binding and rejects WABA/phone retargeting.
- Canonical Meta inbound/outbound resolution fails closed for `MANUAL_DISCONNECTED`, `META_CREDENTIAL_INVALID_OR_REVOKED`, `META_CREDENTIAL_HEALTH_UNCONFIRMED` and `META_PROVIDER_SUBSCRIPTION_MISSING`.
- Owner health verification is evidence-only and sends no test customer message. Safe disconnect blocks local provider actions before attempting WABA app unsubscribe, then reconciles provider truth by readback and does not blindly retry ambiguous external mutation.
- Active setup attempts are superseded and active Unified Inbox projections are degraded on disconnect. Audit evidence explicitly records that the customer’s mobile WhatsApp account was not changed.
- Lifecycle command RPCs are executable by `service_role` only, not `anon` or `authenticated`.
- Production stayed side-effect clean at 0 WhatsApp bindings, 0 setup attempts, 37 Conversation Messages, 136 WhatsApp Events and 0 Unified Inbox projections; lifecycle incident counts remain 0.
- Same-number Business App Coexistence remains intentionally fail-closed/non-destructive until real Meta/provider/runtime eligibility confirms activation. The first real consented tenant E2E must be recorded separately and may not be replaced with synthetic Production data.
- With internally controlled Slices 1–8 closed, execution returns to the stable program cursor `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

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

## CRM identity acceptance checkpoint — 2026-09-28

This checkpoint records evidence only; it does not shrink the complete-product matrix below.

- `CRM-PERSON-CONTACT`: **PRODUCTION_VERIFIED** for the internally controlled Person/identity/company-relationship foundation and authorization boundary from PR #309/#310, migrations `0126/0127`.
- `CRM-IDENTITY-GRAPH`: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for deterministic exact-identity conflict candidates, evidence/confidence state, governed manual MERGE/SPLIT/UNLINK, cross-Organization isolation, anti-orphan behavior, bounded audit, operator review surface and Production deployment from PR #311 / migration `0128`.
- Production currently contains zero real `crm_people` rows. Therefore a real Production happy-path manual resolution action is not claimed; synthetic People or conflict evidence must not be created to make this gate green.
- Generic automatic “unmerge” is **DEFERRED_WITH_REASON**. The implementation preserves merge lineage and retired evidence and provides governed split/unlink correction paths, but does not claim a universally lossless inverse after relationship evidence has been coalesced.
- `CRM-ACCOUNT-V2` is **PRODUCTION_VERIFIED** for its internally controlled paths. `CRM-DATA-QUALITY` scan/import/validation/normalization/audit/bounded-bulk paths are now **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** from PR #319 / migration `0134`; Production contains 0 import batches and 0 People, so no synthetic happy-path evidence is claimed. Destructive retention remains **DEFERRED_WITH_REASON**, therefore the broader Person/account CRM acceptance row is not globally complete.
- `CRM-CUSTOMER360-V2` remains **PARTIAL / REQUIRED**. Person/Lead/Conversation/Task/Deal plus explicit Person-linked Support Case composition is now **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** from PR #321 / migration `0135`. Support context remains immutable and scoped internal Notes are not widened. Booking/Quote/Order/Invoice/Payment/Consent/Document truth must not be fabricated while those owning modules are absent.
- Evidence baseline: `main@c5710ac556faea883745f8656bf0b6c0afc2506f`; exact-main CI #1495 SUCCESS; Cloudflare Production Deploy #975 SUCCESS; Production Supabase through `0128_crm_identity_graph_resolution` version `20260928004331`; Shadow Mode ON; Global Kill Switch OFF.


Owner-requested preservation baseline: 2026-09-26 (Asia/Muscat).
Code audit baseline: `542ef8bf33b394918404990fdb97b9b7df1e7f8e`.
Scope-lock refresh baseline: `bae105697bdb68cb8b25494cf8303e6efe1a6d81` after PR #261; Production Supabase is verified through `0099_comm_unified_inbox_action_claim_policy_consolidation`.
Document type: requirements and acceptance companion, not a new architecture, runtime completion claim, or activation authorization.

## Superseding OMNI-TELEGRAM connection evidence — 2026-09-27

PR #298 and PR #299 plus Production migrations `0122`/`0123` establish the internally controlled customer-Telegram connection boundary without activating a customer Bot. Tenant/business/Branch binding, Vault secret reference, canonical Telegram provider identity, signed webhook/replay journal, Chatwoot/Unified Inbox projection, approved-send safety, reconciliation, media normalization, pause/readiness and health paths are deployed. Owner Assistant authority remains separate.

Exact-main CI #1452 and Cloudflare Production Deploy #932 succeeded on `6532693d7cc653e6611af0fea3ba4eea432d6feb`; Production Worker version is `0c1a6d02-de44-4603-804f-81e807a1f672`. Production Telegram customer state remains deliberately `NOT_CONFIGURED + disabled`, `telegram_ai_paused=true`, with zero customer bindings/events/acceptance receipts. Real Bot authorization and first real inbound/outbound/media acceptance are **BLOCKED_EXTERNAL** and must not be replaced by synthetic evidence. Post-`0123` advisors no longer report Telegram activation-receipt unindexed FKs.

The existing CI PostgreSQL migration-chain step currently enumerates only through `0101`; therefore CI #1452 is not direct SQL-execution proof for `0122/0123`. Successful Production application and post-apply schema/runtime/advisor verification are the current authoritative migration evidence. Preserve a separate repository hardening item to extend migration-chain coverage.

## خلاصه برای مالک

هدف، محصول کامل Smart Visions AI Business OS 2027 برای مشتری، کارکنان، مدیر کسب‌وکار و مدیر کل Smart Visions است. هیچ قابلیت مصوب برای سریع‌تر تمام‌شدن یا کم‌شدن تعداد PR حذف نمی‌شود. مسیر ساده اتصال مشتری باید با ورود رسمی و اعطای دسترسی باشد؛ مشتری نباید رمز یا توکن را در چت ارسال کند. مهم‌ترین شکاف تأییدشده، تبدیل اتصال فعلی واتساپ از یک اتصال به مسیریابی امن چند کسب‌وکار است. اتصال هم‌زمان اپ اصلی و AI، رزرو، پرداخت، اپ موبایل و صورتحساب کامل فقط بعد از آزمون واقعی آماده اعلام می‌شوند.

این سند جزئیات و معیارهای پذیرش را حفظ می‌کند. نقشه اصلی همچنان MASTER_PROGRAM_SECTIONS است؛ وضعیت جاری از runtime و NEXT_CHAT_HANDOFF خوانده می‌شود. عدد ۱۵٪ در تصاویر قدیمی و تعداد PR معیار پیشرفت نیستند. «بهترین اپ ۲۰۲۷» هدف کیفیت است و باید با اتصال آسان، نتیجه تجاری، امنیت، سرعت و قابلیت اعتماد سنجیده شود.

## 0. Owner phase-map scope lock — 2026-09-27

The owner-supplied Phase 0–12 screenshots are preserved here as canonical text so the full target cannot disappear when chats, screenshots or historical planning notes age out.

1. **Phase 0 — Architecture Contracts**
2. **Phase 1 — SaaS Control Plane**
3. **Phase 2 — Omnichannel Adapter Boundary**
4. **Phase 3 — Customer 360 + CRM**
5. **Phase 4 — Business Twin + Industry Packs**
6. **Phase 5 — AI Control Plane**
7. **Phase 6 — Memory v2**
8. **Phase 7 — Workflow + Operational Modules**
9. **Phase 8 — Billing & Commercial Platform**
10. **Phase 9 — Analytics / BI / Google Sheets**
11. **Phase 10 — Hunter as a paid customer module**
12. **Phase 11 — Enterprise + Marketplace + Partner + Developer Platform**
13. **Phase 12 — Mobile Apps + Customer-facing Surfaces**

Scope lock: completion means all applicable Phase 0–12 outcomes, every Work Package in `MASTER_PROGRAM_SECTIONS.md` (106 at this checkpoint), and every applicable acceptance item in this document have evidence-backed disposition. Historical percentages, screenshots saying a path is partly complete, PR counts, or a working provider credential never reduce this scope.

The historical phase map is a dependency/history view; `MASTER_PROGRAM_SECTIONS.md` remains the stable execution taxonomy. Neither may be used to delete requirements from the other.

## 1. Authority, scope and maintenance

Read together:

- [Master architecture](MASTER_ARCHITECTURE.md)
- [Stable Sections and Work Packages](MASTER_PROGRAM_SECTIONS.md)
- [Historical Phase 0–12 map](IMPLEMENTATION_MAP.md)
- [Current continuation](NEXT_CHAT_HANDOFF.md)
- [Current Production evidence](../CURRENT_STATE.md)
- [Delivery packaging](DELIVERY_PACKAGING_STANDARD.md)
- [Service contracts](SERVICE_CONTRACT_STANDARD.md)
- [State/event catalog](STATE_EVENT_CATALOG.md)
- [Chatwoot activation gate](CHATWOOT_PRODUCTION_ACTIVATION_GATE.md)

Authority remains runtime/Production > current GitHub > current docs > historical chat/screenshots.
This file adds acceptance detail under existing Work Package IDs. Its requirement labels are local checklist identifiers, not new services, roadmap phases, database states or Work Packages.

Before implementation, re-read AGENTS.md, main, relevant PR head/base/CI/reviews, runtime evidence and the canonical continuation. Revalidate provider requirements in current official documentation. This documentation change does not activate channels, provision tenants, transfer credentials, disable Shadow Mode, authorize payment or send messages.

For every affected delivery package:
1. identify existing Section + Work Package;
2. identify the requirement below and fresh runtime gap;
3. attach implementation, exact SHA, tests, migration/deploy, production verification and rollback evidence;
4. record remaining gaps in NEXT_CHAT_HANDOFF;
5. update the related requirement disposition without deleting original scope.

Allowed evidence dispositions for this checklist: REQUIRED, IMPLEMENTED, CONFIGURED, CONTROLLED_TEST_VERIFIED, PRODUCTION_VERIFIED, BLOCKED_EXTERNAL, DEFERRED_WITH_REASON, SUPERSEDED_WITH_EVIDENCE. These are reporting labels only; reuse canonical runtime states. A merged PR or UI button alone does not imply production completion. Unknown must remain unknown.

No blanket completion percentage until all applicable acceptance items have evidence and weights are explicitly defined. Do not interpret this document as a full source-code security audit.

## 2. Baseline and verified gaps

### Evidence already available

- Main at this audit: `542ef8bf33b394918404990fdb97b9b7df1e7f8e`, documentation closeout PR #258; exact-main CI and Cloudflare deploy were successful.
- PR #257 integrated Unified Inbox read model, scoped counters, deterministic pagination and per-operator read state into the existing conversation UI.
- PR #260 implemented the governed Unified Inbox backend action bridge for Chatwoot status, labels, assignee and Team changes with Smart Core authorization, idempotent claims, exact upstream reconciliation and audit evidence; Production migration `0098_comm_unified_inbox_actions` is live.
- PR #261 consolidated the action-claim RLS policies without changing authorization semantics; exact-main CI #1341 and Cloudflare Production Deploy #821 passed on `bae105697bdb68cb8b25494cf8303e6efe1a6d81`, and Production migration `0099_comm_unified_inbox_action_claim_policy_consolidation` is live.
- CURRENT_STATE records Production migrations through 0097, source-plane Chatwoot on OVH, and existing owner reply/takeover preserved.
- Earlier same-session read-only Production query found zero brands, tenant businesses, Chatwoot account mappings and inbox projections, with Shadow Mode ON. This is timestamped earlier evidence, not a newly refreshed database claim in this documentation package.
- Historical foundation evidence includes Control Plane, Email/WhatsApp semantic adapters, CRM identity, Customer 360, Tasks, Deals/Pipelines, Custom Fields and Dynamic Lead Segments. Foundations are not the whole target product.
- Meta app approval, Tech Provider status, customer coexistence eligibility and third-party commercial terms were not authenticated/verified by this audit.

### Code-backed gaps at the audit SHA

| ID | Evidence | Gap / consequence | Existing owners |
|---|---|---|---|
| GAP-01 | Superseded by PR #264 exact destination routing and PR #267 lifecycle scope enforcement | **IMPLEMENTED / PRODUCTION_DEPLOYED**; real first-tenant acceptance remains under GAP-09 | DEV-INTEGRATIONS; COMM-RECONCILIATION; COMM-TENANT-BRIDGE |
| GAP-02 | Superseded by PR #264 Vault-backed tenant resolver, PR #266 outbound binding enforcement and PR #268 tenant-bound voice media credential | **IMPLEMENTED / PRODUCTION_DEPLOYED** for reviewed production paths; real tenant send acceptance remains GAP-09 | DEV-INTEGRATIONS; COMM-ACTION-BRIDGE |
| GAP-03 | Superseded by PR #264 destination WABA/phone context preservation and exact binding resolution | **IMPLEMENTED / PRODUCTION_DEPLOYED** | COMM-RECONCILIATION |
| GAP-04 | PR #265 implements tenant-bound Meta WhatsApp Embedded Signup code exchange and Vault persistence | **IMPLEMENTED / PRODUCTION_DEPLOYED; BLOCKED_EXTERNAL** for live Meta app/customer acceptance | UX-BUSINESS-WEB; DEV-INTEGRATIONS |
| GAP-05 | Active provider-adapter registry remains evidence-gated. Web Chat is built-in; Instagram/Messenger are internally implemented but not live-active. PR #295/#296 provide unified health + bounded quota telemetry. PR #298/#299 now implement/deploy the customer Telegram controlled path while keeping its Production integration disabled + NOT_CONFIGURED until real tenant evidence. | **OMNI-CHANNEL-HEALTH + OMNI-TELEGRAM: IMPLEMENTED / PRODUCTION_VERIFIED for controlled internal paths.** Web Chat first-real-tenant acceptance remains GAP-09; Instagram/Messenger still require external activation evidence; Telegram real Bot/inbound/outbound/media acceptance is BLOCKED_EXTERNAL; TikTok/SMS-RCS remain separate Work Packages. | OMNI-META-SOCIAL; OMNI-CHANNEL-HEALTH; OMNI-TELEGRAM; OMNI-WEBCHAT; OMNI-TIKTOK; OMNI-SMS-RCS |
| GAP-06 | Email/WhatsApp descriptors mark nativeProviderActivity UNPROVEN | Native-app coexistence must not be advertised as proven | COMM-HUMAN-AI; COMM-RECONCILIATION |
| GAP-07 | PR #268 normalizes audio/image/video/document/sticker media and tenant-binds voice media download | **IMPLEMENTED / PRODUCTION_DEPLOYED** for normalization and reviewed download path; real customer media acceptance remains GAP-09 | OMNI-VOICE; AI-VOICE-VISION; COMM-UNIFIED-INBOX |
| GAP-08A | PR #263 added operator UI over the governed action bridge | **IMPLEMENTED / PRODUCTION_DEPLOYED**; real-tenant activation acceptance remains GAP-09 | COMM-UNIFIED-INBOX |
| GAP-08B | PR #263 added scoped private internal notes with idempotent/reconciled Chatwoot action evidence | **IMPLEMENTED / PRODUCTION_DEPLOYED**; real-tenant acceptance remains GAP-09 | COMM-UNIFIED-INBOX |
| GAP-08C | PR #263 added scoped attachment listing and bounded authenticated proxy download | **IMPLEMENTED / PRODUCTION_DEPLOYED**; real-tenant attachment acceptance remains GAP-09 | COMM-UNIFIED-INBOX |
| GAP-09 | Production still has no evidence-backed first Web Chat tenant/widget/session/event/message/acceptance receipt. Web Chat acceptance now requires derived real inbound + outbound + media + session evidence rather than a caller boolean. | **BLOCKED_EXTERNAL:** a real consented first tenant and end-to-end Production acceptance remain gated. Do not create synthetic tenant/session/media evidence to close this. | COMM-TENANT-BRIDGE; OMNI-WEBCHAT; FINAL-E2E |

Revalidate each gap before changing code. A later fix supersedes the finding through evidence, not deletion.

## 3. Architecture and product boundaries

- Extend organizations, tenant_businesses, canonical CRM/identity, communication bindings, vault boundaries, usage_events, audit_logs, provider journals, send gate and existing workflow/agent/memory primitives.
- Growth/Hunter businesses are prospects/CRM accounts, not automatically tenant businesses.
- Chatwoot is a communication plane; Smart Core owns business truth, permissions, provider credentials and action safety.
- Scoped-only staff use Smart Core scoped inbox. Preserve C5 Business-wide-only native Chatwoot access; never widen Contact exposure for convenience.
- Chatwoot Production is OVH VPS; Smart Core remains Cloudflare + Supabase unless a separate evidence-backed migration is approved. No Railway Production work.
- Do not replace IAM, add a second queue, duplicate CRM, create parallel secret stores or add another integration source of truth to implement onboarding.
- Keep website repository and frozen website paths out of scope.
- Separate Smart Visions platform charges to a tenant from the tenant's invoices/payments to its own buyers.
- The customer web/mobile experience must remain coherent across internal services; infrastructure details should not appear in customer flows unless needed for a decision.

## 4. Customer connection journey

Owners: UX-BUSINESS-WEB, DEV-INTEGRATIONS, COMM-TENANT-BRIDGE, OMNI-CHANNEL-HEALTH, ENT-SECURITY.

### WhatsApp onboarding execution lock — 2026-10-01

The detailed owner-approved execution contract is [WHATSAPP_CUSTOMER_ONBOARDING_CONNECTION_CONTRACT.md](WHATSAPP_CUSTOMER_ONBOARDING_CONNECTION_CONTRACT.md). It refines CONN-01..05 and META-01..02 without introducing a new roadmap Work Package or connection authority.

For WhatsApp customer onboarding:

- the canonical connection identity remains `communication_channel_bindings.id`;
- setup/reconnect attempt identity is separate from binding identity and must be replay/version safe;
- supported customer modes are `BUSINESS_APP_COEXISTENCE`, `API_NEW_NUMBER`, and `EXISTING_API_RECONNECT`;
- `FULL_MIGRATION_FROM_BUSINESS_APP` is not a supported Smart Visions customer flow;
- an active WhatsApp Business mobile account must never be deleted, disabled or uninstalled as a prerequisite created by Smart Visions;
- if official coexistence is unavailable for that same number, the existing mobile WhatsApp remains untouched and a different API number is the fallback;
- Remote Setup must use bounded setup-only authorization rather than OWNER/ADMIN panel access;
- credential completion must validate setup scope, binding/attempt/version and Meta assets before trusted Vault mutation;
- Chatwoot stays a Smart Core projection through the existing API Inbox path and does not become Meta credential/provider authority;
- readiness must distinguish provider authorization, credential validity, webhook/subscription readiness, Chatwoot readiness, inbound verification, outbound verification, coexistence state and AI-send permission where applicable;
- native WhatsApp human activity must beat AI at the final send gate; historical sync must not be mistaken for a live takeover.

This is an acceptance lock. A green Embedded Signup callback or stored token alone does not satisfy WhatsApp onboarding completion.


#### WhatsApp onboarding Slice 1 checkpoint — 2026-10-01

**Disposition: IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Slice 1 contract only.

- PR #375 + migration `0163_meta_whatsapp_onboarding_slice1` implemented bounded setup-attempt state, the three non-destructive connection modes, trusted service-only completion, revocation of the legacy authenticated Vault mutation path and exact WABA/phone membership validation.
- PR #376 + migration `0164_meta_whatsapp_onboarding_fk_index_hardening` closed all four new FK advisor findings and restored the prior security-advisor RLS/no-policy baseline with an explicit authenticated deny-all policy.
- Final canonical main is `85774ea16adf20403832771d316e68e56283028d`; exact-main CI `36857112993` and Cloudflare Production Deploy `36857447148` succeeded on that exact SHA.
- Production setup-attempt rows remain zero. No synthetic tenant/binding/credential, provider send or customer message was used to prove the slice.
- `BUSINESS_APP_COEXISTENCE` is represented and protected but intentionally not activated yet. Same-number setup remains fail-closed rather than falling back to Delete Account/full migration.
- Remaining CONN/META acceptance for mobile wizard/resume, provider subscription/recovery, actual Coexistence/native activity, Human/AI arbitration, reconnect/revoke/disconnect and first real tenant E2E remains open under later contract slices.

#### WhatsApp onboarding Slice 2 checkpoint — 2026-10-01

**Disposition: IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Secure Remote Setup Invitation/session scope only.

- PR #378 + migration `0165_meta_whatsapp_remote_setup_invitation` extend the canonical setup-attempt child state with a one-time setup-only invitation, short-lived session, owner revoke path and exact scope/context revalidation. No second IAM/user directory or connection authority was introduced.
- Final implementation head `fb7018647bf8f632bedff678f450564ee200252c` passed exact-head CI `36865430981`; canonical merge is `main@ba837577f38c90b390474de1998a2ce84de3c622`.
- Exact-main CI `36865851776` and Cloudflare Production Deploy `36866185938` succeeded on the exact merge SHA. Production migration is live as `20261001130718`.
- A remote setup participant receives `WHATSAPP_SETUP` only, with no CRM/Billing/Organization Settings/unrelated-integration/cross-business/OWNER/ADMIN authority and without becoming an Organization member.
- Invitation/session bearer values are not persisted in plaintext. Invitation redemption is one-time and both invitation/session lifetime are bounded by the existing setup attempt.
- Production setup-attempt and Slice-2 remote audit rows remain zero. No synthetic customer/invite/session/credential or provider send was used for acceptance.
- Actual Meta authorization wizard, provider provisioning and Business App Coexistence activation remain outside Slice 2. The non-destructive/fail-closed Coexistence guard remains required.

#### WhatsApp onboarding Slice 3 checkpoint — 2026-10-01

**Disposition: IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled mobile wizard / preflight / setup-later / resume / trusted-remote-completion scope only.

- PR #380 + migration `0166_meta_whatsapp_mobile_wizard_completion` reuse the existing setup attempt and bounded `WHATSAPP_SETUP` session to provide the public mobile wizard, preflight, Meta-hosted authorization entry, recoverable cancel/retry, Setup Later and reload/mobile-return resume.
- Final head `ad4380caa27ad8928da8568e2b009114850d410e` passed exact-head CI `36871208717`; canonical merge is `main@19201aa26ad6176d978ccc6e70b17ac365f1f8aa`.
- Exact-main CI `36871735143` and Cloudflare Production Deploy `36872092126` succeeded on the exact merge SHA. Production migration is live as `20261001135536`.
- Remote completion is bound to the exact session hash + attempt + binding version, validates WABA/phone membership before trusted Vault mutation, records `REMOTE_SETUP / WHATSAPP_SETUP` provenance and supports completed-state replay without creating a second credential/connection path.
- Customer UI hides access tokens, WABA IDs, webhook and developer-app details; Meta password entry remains on Meta.
- Both owner and remote completion remain service-only and retain explicit fail-closed Coexistence guards. No destructive Business App migration path was introduced.
- Production setup-attempt and Slice-3 remote completion audit rows remain zero. No synthetic or real-customer Meta authorization/provider send was used for acceptance.
- Remaining acceptance for provider subscription/provisioning/recovery, Chatwoot provisioning, message/status/media bridge, actual Coexistence/native activity, Human/AI arbitration, reconnect/disconnect and first real-tenant E2E stays open under later slices.



#### WhatsApp onboarding Slice 4 checkpoint — 2026-10-01

**Disposition: IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Meta provisioning / subscription / recovery scope.

- PR #382 final head `d39ca5db89f1661138dc4709cff8ab60a6bea579` passed exact-head CI `36880398289`; canonical merge is `main@3e0eb5ec585b1be5d65ba48531c5026d38324178`.
- Exact-main CI `36880881774` and Cloudflare Production Deploy `36881305912` succeeded on the exact merge SHA.
- No Slice-4 schema migration was required. Production remains through `0166_meta_whatsapp_mobile_wizard_completion@20261001135536`.
- Provisioning revalidates WABA/phone membership, reconciles the Meta app subscription by provider readback, safely handles ambiguous mutation outcomes, and supports bounded `API_NEW_NUMBER` registration with an ephemeral six-digit PIN that is neither persisted nor audited.
- Owner and remote `WHATSAPP_SETUP` flows reuse the same canonical binding, Vault credential and Meta adapter. No second connection/provider/secret/health authority was added.
- `BUSINESS_APP_COEXISTENCE` remains fail-closed and non-destructive; no Delete Account or destructive migration path exists.
- Read-only Production verification remained side-effect clean: Setup Attempts 0, Slice-4 provisioning audit rows 0, provisioning-error bindings 0 and registration-required bindings 0. No synthetic provider/customer mutation was used.
- Remaining acceptance for existing Chatwoot provisioning integration, message/status/media provenance, official Coexistence/native activity, Human/AI arbitration, reconnect/revoke/disconnect and first real tenant E2E stays open under Slices 5–8.


#### WhatsApp onboarding Slice 5 checkpoint — 2026-10-01

**Disposition: IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled existing-Chatwoot projection/orchestration path.

- PR #385 final head `0e6ec7a73c8b6d715e6914cb99a2a9f3c501624b` passed exact-head CI `36883590463`; canonical merge is `main@4463c29be4b3cf91fc80136587f6c253a6597f36`.
- Exact-main CI `36884006244` and Cloudflare Production Deploy `36884481705` succeeded on the exact merge SHA.
- No Slice-5 migration was required; Production remains through `0166_meta_whatsapp_mobile_wizard_completion@20261001135536`.
- The projection reuses existing Chatwoot Account/OWNER User+administrator membership/API Inbox mapping, marker reconciliation, Vault capture and verified receipt activation. It does not create a second Chatwoot authority or move Meta credential ownership into Chatwoot.
- Chatwoot projection requires matching Slice-4 provider evidence and an authenticated Smart Visions OWNER. Remote `WHATSAPP_SETUP` participants receive no Chatwoot or panel authority.
- Business-wide null-branch bindings are supported; owner retry/finalization after remote Meta setup does not repeat Meta login or duplicate the canonical connection.
- Production remained side-effect clean: tenant Businesses 0, WhatsApp bindings 0, all Chatwoot mapping/receipt counts 0 and `META_WHATSAPP_CHATWOOT_PROJECTED` audit rows 0. Real-tenant external Chatwoot E2E remains open for Slice 8/final acceptance.
- Remaining acceptance for message/status/media provenance and dedupe, official Coexistence/native activity, Human/AI arbitration, reconnect/revoke/disconnect and first real-tenant E2E stays open under Slices 6–8.


#### WhatsApp onboarding Slice 7 checkpoint — 2026-10-02

**Disposition: IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled native Business App activity, Human/AI arbitration, canonical provenance/dedupe, durable Chatwoot reconciliation and deployment scope. **Official same-number Coexistence activation and first real-tenant native E2E remain BLOCKED_EXTERNAL / pending real external evidence.**

- PR #389 final head `75ad62a8bc88fa3b69226208e7b19ce5231fb6ef` passed exact-head CI `36943804916`; canonical merge is `main@917913736fe6ac2cf5c87626d8ac92f422541df5`.
- Exact-main CI `36944138334` and Cloudflare Production Deploy `36944402017` succeeded on that exact merge SHA.
- Production migration `0168_whatsapp_coexistence_native_arbitration@20261002000822` is live; merged blob SHA `0f3411fc50599e6241510362125a8f37c83c6e77`.
- Signed/current `smb_message_echoes` are normalized into the existing journal and canonical message path as `HUMAN_NATIVE_WHATSAPP` only when an existing canonical customer/Lead/WhatsApp Conversation can be resolved. The WhatsApp Business sender number is never fabricated as a customer.
- Current native-human activity atomically claims existing HUMAN takeover semantics and therefore blocks stale queued/approved AI at the existing final send gate. Duplicate/replayed native evidence is idempotent.
- The existing Chatwoot reconciliation worker mirrors canonical native outbound evidence with `PENDING -> PROCESSING -> ACCEPTED / RECONCILIATION_REQUIRED`; ambiguous mutation is fail-closed rather than blindly retried.
- Historical sync is not classified as live native-human takeover evidence.
- Production remains data-clean at 37 canonical Conversation Messages, 136 WhatsApp Events, 0 Unified Inbox projections, 0 WhatsApp bindings and 0 Slice-7 smoke residue. New Slice-7 RPCs are service-role-only.
- Production safety remains Shadow Mode ON, global Kill Switch OFF, WhatsApp AI pause OFF and Agents pause OFF. Fresh advisors contain no Slice-7-specific security/performance finding.
- Acceptance still open by design: actual Meta Coexistence eligibility/activation, real `HUMAN_NATIVE_WHATSAPP` provider evidence, reconnect/revoke/disconnect and first real-tenant Meta ↔ Smart Core ↔ Chatwoot end-to-end proof.

#### WhatsApp onboarding Slice 6 checkpoint — 2026-10-02

**Disposition: IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled message/status/media bridge, provenance, cross-plane dedupe and reconciliation scope.

- PR #387 final head `4b6eba7ceb900e1d012d299e3b20816911f9fa51` passed exact-head CI `36939463033`; canonical merge is `main@5f7f81c5b279efd92feb6341bdc971fe6e6c012e`.
- Exact-main CI `36939774658` and Cloudflare Production Deploy `36940049403` succeeded on that exact merge SHA. Release-candidate smoke, controlled SSR load, routed Production smoke and safe API/webhook rejection smoke all passed without outbound provider sends.
- Production migration `0167_whatsapp_message_bridge_provenance` is live as version `20261001231837`; merged blob SHA is `60c4df822b1429bf77d975089af96a218a1bf81b`.
- Canonical `conversation_messages` now carries semantic provenance and cross-plane source identity; `whatsapp_events` remains the durable provider journal and carries Chatwoot sync state. No second message store, webhook journal, queue, provider authority or Chatwoot plane was introduced.
- Meta inbound is canonically persisted before asynchronous Chatwoot projection. Chatwoot human outbound requires canonical Smart Visions user/membership authorization plus full human takeover and then passes the existing final send safety gate. Smart Core Owner/AI outbound mirrors to Chatwoot with deterministic echo suppression.
- Delivery status reconciliation is monotonic and replays out-of-order status evidence. Media transfer is bounded, trusted-origin/MIME checked, and reuses the existing Meta provider/Vault and governed Chatwoot attachment boundaries. Ambiguous external mutation remains fail-closed / reconciliation-required rather than blind-retried.
- Business-wide Unified Inbox `branch_id=null` is supported; Team mapping remains branch-scoped and fail-closed.
- Production backfill is truthful: 36 existing `SHADOW_MODE` outbound messages are `AI`; the one ambiguous old outbound is `SYSTEM`. Of legacy inbound WhatsApp journal evidence, 37 scoped events are `PENDING` for Chatwoot reconciliation while 12 events lacking both Conversation and Lead scope remain unprojected.
- Production remained side-effect clean at 37 Conversation Messages, 136 WhatsApp Events and 0 Unified Inbox projections. No synthetic tenant, binding, credential, Chatwoot resource, message or provider mutation was created for acceptance.
- Slice-6 reconciliation RPCs are service-role-only; `anon` and `authenticated` execution is denied. Production safety remains Shadow Mode ON, global Kill Switch OFF, WhatsApp AI pause OFF and Agents pause OFF.
- **Still open:** official same-number Coexistence/native activity and live `HUMAN_NATIVE_WHATSAPP` evidence, Human/AI arbitration against real native activity, reconnect/revoke/disconnect, and first real-tenant Meta ↔ Smart Core ↔ Chatwoot E2E. These remain Slices 7–8 / external-evidence acceptance.



### CONN-01 — Guided onboarding

Required flow:
1. authenticated owner selects or creates a governed real business, industry, timezone, currency and locale;
2. selects a channel and sees eligibility, supported capabilities and any provider prerequisites;
3. authorizes via the provider's official hosted flow;
4. selects the exact account/page/phone/mailbox;
5. confirms target business/branch and required permissions;
6. server exchanges authorization securely and validates asset ownership/access;
7. existing canonical connection/binding and secret-reference mechanisms persist the connection;
8. system verifies webhook registration and non-sending health; any sending test uses a separately authorized controlled recipient;
9. clear readiness status explains missing actions, not just a green credential badge;
10. user can resume interrupted setup, reconnect, revoke or request assistance.

Acceptance: canceled consent, expired session, popup blocked, mobile return, wrong account, missing admin rights, duplicate callback, internet interruption and repeated clicks recover without duplicated accounts or accidental sends. Do not promise one-click completion where provider verification or billing setup remains necessary.

### CONN-02 — Connection center

Per channel show:
- provider asset identity and masked phone/email; exact business/branch;
- authorized capabilities and unsupported features;
- effective status derived from real evidence and its timestamp;
- inbound/outbound health separately; last success, token/permission issue and corrective action;
- relevant quota, budget and restrictions;
- who connected/changed it and when;
- reconnect/disconnect with data-retention explanation;
- eligibility and evidence for native-app coexistence;
- customer-facing errors translated into clear actions, with a safe support correlation ID.

Do not expose access tokens, secrets, full upstream error payloads or unnecessary personal data. A configured token is not proof of a healthy integration.

Superseding channel-health evidence — 2026-09-27: PR #295 + #296, Production migrations 0120/0121, exact-main CI #1441 and Cloudflare Deploy #921 implement the internally controlled multi-channel health dimensions: connection/configuration state, credential/readiness state, webhook/event evidence, provider quota/rate evidence, last verified evidence, supported capabilities and incident/control state. Web Chat retains its canonical detailed health path. Provider quota status remains unknown until a real response produces bounded evidence; the current Production quota-evidence stream is empty. Messenger's new bootstrap row is disabled + NOT_CONFIGURED only. This closes the controlled `OMNI-CHANNEL-HEALTH` read-model/telemetry gap, but **does not** complete all of CONN-02: guided reconnect/disconnect, provider-hosted authorization, retention UX, exact customer asset acceptance and real-tenant E2E remain under their existing Work Packages/GAP-09.

### CONN-03 — Multi-business routing and credential isolation

Before connecting multiple customers:
- resolve signed inbound events using the provider destination identity (e.g. WABA + phone-number ID) and canonical ACTIVE bindings;
- verify uniqueness and hierarchy consistency; unknown/ambiguous/stale destination fails closed into existing diagnostics/reconciliation semantics;
- preserve destination and provider identity through normalization, journaling, AI context, send decision and status reconciliation;
- select the exact tenant/business/channel credential server-side; never fall back to another tenant's credential;
- distinguish the same buyer contacting two different businesses; do not use the sender's phone alone as tenant authority;
- cover batched webhook entries with multiple destinations;
- support more than one channel asset per business only through explicit bindings;
- version/rotate/revoke credentials without logging values;
- retain canonical idempotency and provider event journals; do not create a parallel inbox or queue.

Acceptance: two isolated test businesses, distinct numbers, same buyer, repeated/out-of-order webhooks, missing binding, revoked credential, wrong tenant session, spoofed callback, token refresh race and late status all preserve isolation. Production pilots use real consented businesses only; synthetic fixtures belong in isolated tests.

### CONN-04 — OAuth and secret lifecycle

- Bind authorization state to authenticated user, tenant, intended provider and short-lived nonce; reject CSRF/replay and untrusted redirect targets.
- Use PKCE where applicable to the provider/client flow; perform secret-bearing code exchange on server.
- Request least privileges; support missing/revoked consent and required reauthorization.
- Reuse established encrypted secret facilities only after validating provider-specific access contracts.
- Restrict decrypt access, redact logs, audit changes without values, rotate secrets and disable sends on revocation.
- Disconnect must stop new automated actions, reconcile accepted actions and apply documented retention/export/deletion policy.
- Public API keys, customer OAuth grants and Chatwoot Platform token are separate authorities.

### CONN-05 — Provider/API readiness while credentials are pending

A missing external API credential, merchant approval or provider activation must not block implementation of the internal product contract. Before a provider gives Smart Visions the final API credential, the product should already have the applicable:

- typed provider adapter and capability matrix;
- exact tenant Business / Branch / channel or merchant binding;
- server-only secret-reference contract with no raw credential in browser, chat, logs or ordinary database columns;
- OAuth/hosted authorization path where the provider supports it, or a governed secure credential setup path where it does not;
- webhook endpoint, signature/authenticity validation, replay/idempotency and event journal semantics;
- outbound/request idempotency, ambiguous-result handling and reconciliation;
- readiness/health diagnostics that distinguish configured, authenticated, inbound healthy, outbound healthy and externally blocked;
- least-privilege permissions, credential rotation/revocation and audit trail;
- Cost Guard/budget/quota handling for paid APIs;
- disconnect behavior that stops new side effects safely without inventing completion for already accepted external work.

For multi-tenant providers, a global environment credential must never silently become another customer's authority. Runtime selects the exact tenant-bound credential or fails closed.

For payment gateways, provider credentials are not payment truth. `PAYMENT-CORE` owns intent/ledger/reconciliation; a verified provider webhook or explicit reconciliation proves paid/refunded state. The UI must never mark payment successful merely because an API request was sent.

If the external party has not supplied credentials/approval yet, the requirement disposition is `BLOCKED_EXTERNAL` only for activation/e2e evidence. Internal implementation, tests, UI states, security boundaries and documentation continue to completion.

## 5. Provider strategy and prerequisites

These are required integration directions, not assertions of current approval or availability.

### META-01 — Preferred WhatsApp route

Use Meta Cloud API + Embedded Signup under the Smart Visions provider app as the preferred direct route. A supported official partner can be considered where current approval/support/commercial evidence justifies it; no vendor purchase is authorized here. Do not assume a partner bypasses Meta approval or guarantees coexistence.

Platform readiness checklist:
- Meta business/app ownership and authorized administrators;
- Business Verification, applicable Tech Provider/access-verification requirements;
- current App Review/Advanced Access requirements for whatsapp_business_management and whatsapp_business_messaging;
- exact HTTPS redirect URIs, permitted domains and Embedded Signup configuration;
- real privacy/data-deletion/support URLs;
- webhook verification, signature handling and required subscriptions;
- production app availability, token lifecycle and permission health;
- customer payment/billing requirements and disclosed third-party costs;
- eligibility, number registration/migration and existing provider checks;
- official app review demonstrations using a controlled test flow.

A working Smart Visions-owned WhatsApp number does not prove permission to onboard external businesses. Never ask customers to send account passwords or copy tokens into chat. The provider-hosted flow keeps customer assets and consent attributable to the customer.

### META-02 — Native WhatsApp Business coexistence

Use official coexistence only for eligible accounts/numbers. Check current restrictions and regional/account/provider conditions at implementation and onboarding time.
- reconcile native-app message evidence where delivered;
- preserve human priority with a final pre-send check;
- attribute AI/human/native actions separately;
- define explicit takeover, pause duration, hand-back and race behavior;
- prevent echoes and duplicated sends;
- explain unsupported typing/presence/history synchronization rather than inventing events.

Acceptance includes human reply racing AI generation, native reply after queued approval, revoked connection, duplicated echo, unsupported event and delayed delivery. No promise of complete historical sync or universal coexistence without evidence.

### CHANNEL-01 — Other channels

| Channel | Intended easiest supported flow | Required constraints |
|---|---|---|
| Instagram | Official Instagram login for professional accounts, or supported Meta login variant | Correct permission family, account eligibility, message/webhook policy; no consumer-account promise |
| Facebook Messenger | Official Meta authorization and Page selection | Page identity/access and channel policy; no WhatsApp credential reuse |
| Gmail/Workspace | Google OAuth for exact mailbox | Least scopes; sensitive/restricted verification and security assessment where applicable; sending-only is not full inbox access |
| Microsoft 365 | Microsoft delegated OAuth | Tenant consent/admin policy and mailbox grants; lifecycle/refresh/revocation |
| Telegram | Bot integration or supported connected Business bot | Distinguish bot chat from Business-account messaging; owner assistant stays separate |
| Website chat | Scoped widget/install snippet or justified plugin | Tenant-bound configuration, origin/session limits, anonymous-to-known transition, consent and safe uploads |
| TikTok | Only an available authorized messaging integration | Capability detection; blocked state when unsupported; no scraping/consumer-session substitute |
| SMS/RCS | Supported provider adapter | Country capability, consent, status and cost evidence |
| Voice | Voice-note pipeline first; telephony later | Consent/retention, provider support, interruption, cost and quality evaluation |
| Payments | Customer's approved merchant account via supported provider mechanism | Tap/Thawani onboarding, merchant ownership, credentials, webhook and reconciliation; do not assume OAuth is offered |
| Calendars/Sheets/other apps | Official least-privilege authorization or secure setup | Scope-aware data, explicit sync direction, conflicts, revocation and audit |

Each channel must publish an evidence-backed capability matrix: inbound/outbound text, media, templates, receipts, native activity, history, restrictions, last verification and supported locales.

## 6. Full product acceptance matrix

Each row is REQUIRED for the applicable complete-product scope; partial foundations are not completion. Detailed Work Package definitions remain in MASTER_PROGRAM_SECTIONS.

| Area | Existing Work Packages | Required customer/admin behavior and key acceptance |
|---|---|---|
| Tenant and team | COMM-TENANT-BRIDGE; ENT-IAM; UX-BUSINESS-WEB | Organization/brand/business/branch/department/team, invitations, roles, scope inheritance, removal and stale-session behavior; no cross-scope access |
| Inbox | COMM-UNIFIED-INBOX | Assignment, transfer, status, tags, internal notes, saved replies, search, per-user unread, attachments, availability and escalation; notes never leak as customer messages |
| Human/AI and sends | COMM-HUMAN-AI; COMM-ACTION-BRIDGE; COMM-RECONCILIATION | Human wins, safe hand-back, canonical send gate, delivery evidence, duplicates/late events/ambiguous outcomes handled |
| Person/account CRM | CRM-PERSON-CONTACT; CRM-IDENTITY-GRAPH; CRM-ACCOUNT-V2; CRM-DATA-QUALITY | Evidence-based identity, multiple identities, company relationships, import, manual merge/split and conflict review; no fabricated people |
| Customer 360 | CRM-CUSTOMER360-V2; CRM-ACTIVITY-TASK-V2 | Conversations, deals, tasks, notes, bookings, quotes, orders, invoices/payments, support, consent and documents with governed scope |
| Configurable CRM | CRM-CUSTOM-OBJECTS; SEGMENT-V2; SEGMENT-SNAPSHOT | Typed governed schema, immutable audience snapshots where needed, versioned filters; no unbounded arbitrary metadata querying |

### SEGMENT-V2 / SEGMENT-SNAPSHOT checkpoint — 2026-09-28

- `SEGMENT-V2` is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** from PR #323 / migration `0136_segment_v2_multi_entity`, exact-main CI `36409087711` and Cloudflare Production Deploy `36409341905` on `main@9762e5ce79022718ede2def30610b94843d7f591`.
- The governed `crm_segments + crm_segment_versions` authority supports `LEAD | PERSON | DEAL | ACCOUNT` with typed bounded predicates and no persisted dynamic membership. Production remains 0 Segment definitions/versions.
- Person PII/display-name/free metadata and arbitrary SQL/JSONPath are not audience criteria; governed Custom Fields remain Lead/Deal only.
- Dynamic evaluation is not consent and does not invoke Campaign/Workflow/provider sends.
- `SEGMENT-SNAPSHOT` is now **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** from PR #324 / migration `0137_segment_snapshot`, exact-main CI `36411781776` and Cloudflare Production Deploy `36411960392` on `main@0e5e4e61be1d30c2ba134ed66a4ad1b2457a7c98`. Production has 0 Snapshots/0 members; no synthetic audience evidence is claimed. Snapshot membership remains historical evidence only, never consent or send permission.

`SALES-SCORING` is now **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** from PR #326 / migration `0138_sales_scoring_governance`, exact-main CI `36424607322` and Cloudflare Production Deploy `36424885898` on `main@f6b08675d8c3a83aa6dccd8790fe9b9077e1c7ea`. Canonical score truth remains on `public.leads`; pre-existing Production Leads were not synthetically rescored/backfilled, manual override preserves deterministic base truth, and model suggestions remain advisory-only. `SALES-PIPELINE-V2` is separately Production-verified below; `SALES-NEXT-ACTION` remains the next required Sales Work Package.

### SALES-SCORING checkpoint — 2026-09-28

- `SALES-SCORING` is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** from PR #326 / migration `0138_sales_scoring_governance`, exact-main CI `36424607322` and Cloudflare Production Deploy `36424885898` on `main@f6b08675d8c3a83aa6dccd8790fe9b9077e1c7ea`.
- Canonical accepted Lead score truth remains `public.leads`; fit, intent, engagement, reasons/evidence, manual override and advisory model suggestion semantics are governed without a second score store.
- Model suggestions cannot silently overwrite deterministic accepted score; explicit manual override preserves the underlying deterministic base score and carries actor/reason/time/expiry/correction evidence.
- Production remains free of synthetic scoring acceptance data: all 19 existing Leads retain their prior scores and have zero/NULL new governance evidence until real operator/runtime actions occur.
- Scoring and Segment membership do not imply consent or send permission, and the scoring path does not trigger provider sends or workflows.

### SALES-PIPELINE-V2 checkpoint — 2026-09-28

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

| Sales | SALES-SCORING; SALES-PIPELINE-V2; SALES-NEXT-ACTION | Explainable qualification, pipelines, follow-up, ownership, forecast and real won/lost evidence; no blind automated outreach |
| Marketing and retention | MARKETING-CAMPAIGNS; MARKETING-CONSENT; MARKETING-ATTRIBUTION; CUSTOMER-SUCCESS-LOYALTY | Opt-in/out, purpose, suppression, audience/version, caps, templates, experiment evidence, loyalty/referrals; no invented attribution |
| Hunter | HUNTER-CUSTOMER-MODULE | Extend existing discovery/enrichment; tenant targeting, credit usage, dedupe, qualified CRM promotion and ROI; discovery is not send consent |
| Business brain | BRAIN-BUSINESS-TWIN; BRAIN-INDUSTRY-PACKS | Versioned hours/services/prices/policies/branches/staff/brand tone; industry packs configure the core, never fork it |
| Knowledge | KNOWLEDGE-V2 | Site/files/FAQs/catalog ingestion with provenance, approval, freshness, scoped retrieval and stale/conflicting source behavior |
| Memory | MEMORY-V2 | Conversation/customer/relationship/business/working/episodic/operational learning, source/confidence/validity; correction, expiry, deletion and isolation |
| Agents and copilot | AI-CONTEXT-COMPILER; AI-AGENT-RUNTIME; AI-MODEL-PROMPT-CONTROL; AI-QUALITY-SAFETY; AI-OWNER-COPILOT | Sales/support/booking/CRM/knowledge/memory/follow-up/quality roles, versioned routing, evaluations; all actions obey permissions/policy/approval |
| Voice/vision | AI-VOICE-VISION; OMNI-VOICE | Text/audio/image/document handling, limits, uncertainty and media evidence; no unsupported diagnosis or operational commitment |
| Workflow | AUTO-WORKFLOW-MODEL; AUTO-TRIGGER-CATALOG; AUTO-CONDITION-ENGINE; AUTO-TOOL-ACTION-REGISTRY; AUTO-APPROVAL; AUTO-RUNTIME; AUTO-BUILDER; AUTO-NOTIFICATIONS | Visual draft/publish/test/history, typed tools, approvals/expiry, durable execution, bounded retries/compensation, notifications without duplicates |
| Booking | BOOKING-CATALOG; BOOKING-AVAILABILITY; BOOKING-LIFECYCLE; BOOKING-AI | Staff/resources/duration/buffers/holidays/timezones, holds, reschedule/cancel/no-show/reminders/deposits; concurrent booking cannot oversell capacity |
| Field service/support | FIELD-SERVICE; CRM-SUPPORT-CASE | Work assignment/location/status, support priority/SLA/escalation/CSAT and linked operational evidence |
| Commerce | CATALOG-V2; QUOTE-ENGINE; ORDER-ENGINE; INVENTORY-FULFILLMENT; INVOICE-ENGINE | Products/services/variants, governed prices, quote versions/expiry/approval/PDF, orders/returns, stock reservations and immutable commercial documents |
| Payments | PAYMENT-CORE; PAYMENT-OMAN; PAYMENT-EXTENSION | Tap/Thawani, links, partial/failure/refund cases as supported, verified webhook, ledger reconciliation; no double charge or assumed success |
| Reports/BI | DATA-EVENT-METRICS; DATA-WAREHOUSE; DATA-DASHBOARDS; DATA-ATTRIBUTION; DATA-ASK; DATA-EXPORTS; DATA-REPORTING | Defined metrics, sales/revenue/conversion/team/channel/AI/cost dashboards, governed questions, CSV/XLSX/PDF/JSON/Sheets sync, scheduled summaries and freshness |
| SaaS commerce | SAAS-PLANS-ENTITLEMENTS; SAAS-BILLING; SAAS-COUPONS | Plans/seats/channels/features/setup/add-ons/usage/overage/discount/tax, trials/upgrades/payment failure/cancel; ledger-derived billing |
| Agency and marketplace | SAAS-AGENCY; SAAS-MARKETPLACE; DEV-PARTNER | Subaccounts/delegated access/custom branding/domain, reseller accounting, app/skill/industry-pack permissions/versioning/entitlements |
| Super Admin | SAAS-SUPER-ADMIN; UX-SUPERADMIN-MOBILE | Tenant onboarding health, subscriptions/revenue/cost, incidents/support/audit, scoped stop controls and time-limited audited support access |
| Developer ecosystem | DEV-PUBLIC-API; DEV-WEBHOOKS; DEV-SDK; DEV-INTEGRATIONS; DEV-SANDBOX; DEV-MIGRATION | Versioned APIs/scoped keys/rates/idempotency, signed webhooks/replay, documented contracts, migration/import/export and isolated sandbox |
| Web/mobile/portals | UX-BUSINESS-WEB; UX-MOBILE; UX-PWA; UX-CUSTOMER-PORTAL; UX-PARTNER-PORTAL; UX-DEVELOPER-PORTAL | Complete role-aware screens, iOS/Android/push, buyer appointments/documents/payments/cases; one canonical backend |
| Locale/accessibility | UX-LOCALIZATION; UX-ACCESSIBILITY | English core UI, Arabic/RTL and planned Persian/Hindi/Urdu needs, correct dates/currency/timezone, keyboard/screen reader, mobile forms and errors |
| Operations/security | ENT-IAM; ENT-DATA-GOVERNANCE; ENT-SECURITY; ENT-INCIDENT; ENT-OBSERVABILITY; ENT-PERFORMANCE; ENT-BACKUP-DR; ENT-RELEASE; ENT-CONTRACTS; COMM-OPERATIONS | Auth/session/MFA, governance/deletion/export/residency, audit, alerts/SLOs, capacity, upgrades, restore drills/rollback and documented support terms |

### IDENTITY_CRM evidence checkpoint — 2026-09-28

- `CRM-PERSON-CONTACT` and the internally controlled `CRM-IDENTITY-GRAPH` paths are Production-verified without fabricating People.
- PR #313 / migration `0129_crm_customer360_v2_person_context` Production-verified Person-centric composition for existing Conversation/Task/Deal/Lead authorities. The complete Customer 360 acceptance row remains open for Notes, Booking, Quote, Order, Invoice/Payment, Support, Consent and Documents.
- `CRM-ACCOUNT-V2`: **PRODUCTION_VERIFIED** for canonical external Company/Account truth on `public.businesses`, evidence-backed Contacts via `crm_person_business_relationships`, cycle-safe Organization-bound external hierarchy, governed owner assignment and explicit B2B lifecycle. PR #314 / Production migration `crm_account_v2_governance`; exact-main CI `36370424412`; Cloudflare Production Deploy `36370581976`. Production remains 19/19 `UNCLASSIFIED`, 0 owner assignments and 0 external hierarchy links; no discovery/Lead evidence was treated as Customer status.
- `CRM-DATA-QUALITY` remains open beyond the already implemented identity merge/split/conflict controls; import/normalization/retention/bulk-safety acceptance is not silently inherited.

### COMM-DETAIL — Inbox/media usability

Attachment authorization must cover direct/download URLs, previews, expiry, revoked access, file type/size limits, unsafe content and isolated storage access. Search and counters must not leak inaccessible contacts. Drafts, internal notes and blocked/unsent messages are not customer-visible history. Saved replies need scope, permissions, language and version control. New inbound while a conversation is open must obey defined read-state semantics.

### BRAIN-DETAIL — Business facts and AI quality

- Customer claims and uploaded instructions cannot overwrite approved business truth or system permissions.
- Defend tool use and retrieval against prompt injection from messages, sites and documents.
- Corrections carry provenance; confidential facts never become cross-tenant learning data.
- Recheck price/availability/payment authority at execution; cached facts must not authorize stale commitments.
- Use neutral language on low dialect confidence; evaluate Omani/Gulf Arabic, English, Persian and relevant mixed-language voice/text.
- Run representative regression sets before model/prompt rollout; preserve rollback and measured quality/cost evidence.
- Surface uncertainty and route complaints, unusual discounts, refunds, contractual commitments and explicit human requests to governed human handling.
- Model provider outages must degrade safely to human handling or queued work, not invented answers.

### COMMERCIAL-DETAIL — Pricing and billing

Approved formula:
Setup + Monthly Platform + Features + Channels + Seats + AI Usage + Third-party Usage + Overages - Discounts + Tax.

Preserve current approved AI policy: eligible BILLABLE raw AI cost × 4. Do not change that multiplier or actual plan prices through this document. Reuse canonical usage classification; SYSTEM_RETRY, CACHED, PROMOTIONAL, INTERNAL and NON_BILLABLE are not silently charged as BILLABLE.

Required: setup per channel; fixed/percentage/setup coupons, redemption/expiry limits; pricing versions; trial/upgrade/downgrade/renewal/cancel/grace/suspension behavior; currency/rounding/tax treatment; adjustments/refund evidence; customer usage visibility; budget and entitlement enforcement before paid work. Document any proration policy before implementing it.

Separate platform subscription billing from a tenant's own buyer commerce. Revenue, raw costs and margin must declare included/excluded costs; no fabricated profit metric. Hunter credit charging and provider costs require clear units and reconciliation.

### UX-DETAIL — Mobile and portals

- Responsive web, role-aware mobile, correct RTL, accessible forms and errors.
- Notifications deep-link to authorized resources; avoid sensitive lock-screen content by default.
- Poor connectivity retains safe drafts and never duplicates sends, bookings or payments after retry.
- Session expiry and permission removal work across devices.
- Buyer portals enforce identity and document scope; no guessable public invoice/customer URLs.
- Business users see only enabled features; do not display decorative actions as available functionality.
- Industry examples include Sahra automotive, pet/dental clinics, salons and retail, using real onboarding data only after authorization.

## 7. Whole-product acceptance gates

Owners: FINAL-E2E, FINAL-COMMERCIAL, FINAL-SAFETY, FINAL-OPERATIONS, FINAL-LAUNCH.

### GATE-A — First controlled customer

- governed real business + users, no synthetic Production tenant;
- verified channel ownership/binding/credential and inbound routing;
- approved services/prices/knowledge and language behavior;
- inbound -> identity/CRM -> AI draft or human -> policy/approval/send -> provider result -> timeline/report evidence;
- takeover and native-app restrictions visible;
- scoped operator cannot access another business/branch/contact/file;
- usage/limits/entitlements and support escalation visible;
- rollback/disconnect and safe replay demonstrated;
- explicit controlled activation gate satisfied; Shadow Mode is not automatically disabled by successful CI.

### GATE-B — Multi-customer safety

Use isolated fixtures to prove two businesses, the same buyer across both, separate credentials, overlapping names/labels, cross-scope requests, revoked staff sessions and provider retries cannot cross boundaries. Then validate the approved real pilot without sending unsolicited customer messages.

### GATE-C — Full operational story

Representative industry flow:
Connection -> inbound -> identity -> scoped inbox -> AI/human -> CRM/task/deal -> booking/quote -> order/invoice -> payment -> fulfilment/support -> usage/billing -> analytics -> Owner Copilot.

Include no-show, expired quote, payment pending/failed, partial refund, duplicate events, budget exhaustion, provider outage and human approval expiry. No unsupported provider behavior may be simulated and reported as Production verified.

### GATE-D — Commercial and operations closeout

- plan/feature/seat/channel limits enforced server-side;
- customer bill can be traced to correct usage classification and pricing version;
- monitoring identifies affected tenant/provider/workflow with redacted diagnostics;
- backup restoration and rollback drills include evidence, measured RPO/RTO and incident runbook;
- no known unresolved P0/P1 security, integrity or product defects;
- applicable web/mobile/store-release, capacity and customer-support gates completed;
- current state and continuation updated after actual verification.

## 8. Quality scorecard for the 2027 goal

Measure before setting contractual targets. Do not invent SLO numbers or promise market leadership.

| Metric | Measurement |
|---|---|
| Time to first value | Registration to first successful controlled conversation; separate provider approval waiting time |
| Connection completion | Completed eligible onboarding / started eligible onboarding; failure reasons and assisted cases |
| Grounded answer quality | Correct approved price/policy/source, language and appropriate human escalation |
| Business outcome | Evidence-linked resolved case, qualified lead, booking or paid order; no causal claim without suitable analysis |
| Latency | p50/p95 ingress-to-visible, AI response and tool completion by channel |
| Reliability | Lost/duplicate actions, stale events, recovery success and backlog age |
| Isolation | Negative tests across UI/API/DB/search/files/retrieval/memory/exports/notifications |
| Cost | Raw cost and billable usage per verified outcome; budget stop correctness |
| Human coexistence | Races avoided, takeover respected, unsupported capabilities disclosed |
| Mobile quality | Crash/error rate, notification/deep-link correctness and weak-network recovery |
| Operations | Detection/recovery time, restore evidence and support burden |

Every metric needs definition, source, window, dimensions, freshness and owner under DATA-EVENT-METRICS. Published promises require measured evidence.

## 9. Dependency order and next-session instructions

### Superseding dependency checkpoint — 2026-09-27

The older baseline text below is historical where it still names COMM-UNIFIED-INBOX as the current cursor. Governed Unified Inbox actions/notes/attachment bounds have already progressed beyond that checkpoint, and the current completed bounded unit is `SECTION OMNICHANNEL / OMNI-WEBCHAT`.

Evidence: PR #292 + Production migration 0118 + exact-main CI/Deploy; PR #293 + Production migration 0119; Production fail-closed Web Chat attachment/upload probes; zero fabricated real-tenant acceptance data.

Before the next mutation, re-audit `MASTER_PROGRAM_SECTIONS.md` and runtime dependencies. A Web Chat-specific Connection Center/health slice now exists, but `OMNI-CHANNEL-HEALTH` is not complete merely because Web Chat health is implemented. Cross-channel connection, credential/webhook, quota/capability, last-evidence and incident semantics must be audited against each channel authority before selecting/closing that Work Package.

Do not replace the current cursor. At this baseline it remains COMMUNICATION / COMM-UNIFIED-INBOX governed operations.

Then sequence related work by verified dependencies:
1. finish operator UI for the already-implemented governed status/labels/assignee/Team actions, then complete internal notes and attachment authorization/read bounds;
2. close multi-business provider routing and per-business credential selection before a second customer is connected;
3. investigate platform approval readiness alongside implementation; never assume external approval;
4. deliver official self-service connection and recoverable onboarding under existing DEV-INTEGRATIONS and UX-BUSINESS-WEB;
5. satisfy real-tenant bridge activation separately;
6. prove per-business knowledge, AI/human response, limits and commercial readiness;
7. run a controlled first-customer acceptance;
8. continue operational modules, channels, mobile and enterprise ecosystem according to MASTER_PROGRAM_SECTIONS.

The first controlled sellable slice can be WhatsApp + AI + human handoff + base CRM, but it does not remove booking, commerce, mobile, agency, marketplace or other approved full-product scope.

Future sessions must report: what is verified, what is implementation-only, what is externally blocked, exact next Work Package and acceptance evidence. Never mark the whole product complete because Chatwoot is live, a token exists, CI is green or many PRs merged.

## 10. Provider references and revalidation

Reference review date: 2026-09-26. Provider approval, eligibility, pricing and APIs change; inspect current official documentation and actual app/account state before implementation.

- Meta official sample and Production checklist: https://github.com/fbsamples/business-messaging-sample-tech-provider-app
- Meta Embedded Signup: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/
- Meta WhatsApp Business app onboarding: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- Meta official API collection: https://www.postman.com/meta/whatsapp-business-platform/collection/du6gzjv/embedded-signup
- Meta Instagram API collection: https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login
- Twilio Tech Provider integration guide (optional partner example): https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/integration-guide
- Google Gmail scopes: https://developers.google.com/workspace/gmail/api/auth/scopes
- Microsoft delegated authorization: https://learn.microsoft.com/en-us/graph/auth-v2-user
- Telegram Business bots: https://core.telegram.org/bots

Some Meta documentation pages rate-limited during the initial review; official sample/collections supplied complementary evidence. Revalidate the live dashboard before recording an approval or eligibility result. External sample code is reference only: do not import its separate IAM/database/secret patterns into this project's architecture.

## 11. Full Work Package coverage index

The following baseline inventory preserves every existing semantic Work Package, including items whose detail stays in MASTER_PROGRAM_SECTIONS. All retain their original acceptance criteria and remain subject to evidence-based tracking. This index is not a declaration that work is complete.

### COMMUNICATION — Source-based communication plane

- `COMM-CHATWOOT-SOURCE`
- `COMM-TENANT-BRIDGE`
- `COMM-UNIFIED-INBOX`
- `COMM-HUMAN-AI`
- `COMM-ACTION-BRIDGE`
- `COMM-RECONCILIATION`
- `COMM-OPERATIONS`

### OMNICHANNEL — Channel expansion

- `OMNI-META-SOCIAL`
- `OMNI-TELEGRAM`
- `OMNI-WEBCHAT`
- `OMNI-TIKTOK`
- `OMNI-SMS-RCS`
- `OMNI-VOICE`
- `OMNI-CHANNEL-HEALTH`

### IDENTITY_CRM — Customer identity, CRM and service truth

- `CRM-PERSON-CONTACT`
- `CRM-IDENTITY-GRAPH`
- `CRM-CUSTOMER360-V2`
- `CRM-ACCOUNT-V2`
- `CRM-CUSTOM-OBJECTS`
- `CRM-ACTIVITY-TASK-V2`
- `CRM-SUPPORT-CASE`
- `CRM-DATA-QUALITY`

### SEGMENT_SALES_MARKETING — Audience, sales, growth and retention

- `SEGMENT-V2`
- `SEGMENT-SNAPSHOT`
- `SALES-SCORING`
- `SALES-PIPELINE-V2`
- `SALES-NEXT-ACTION`
- `MARKETING-CAMPAIGNS`
- `MARKETING-CONSENT`
- `MARKETING-ATTRIBUTION`
- `HUNTER-CUSTOMER-MODULE`
- `CUSTOMER-SUCCESS-LOYALTY`

### AUTOMATION — Workflow, tools, approvals and execution

- `AUTO-WORKFLOW-MODEL`
- `AUTO-TRIGGER-CATALOG`
- `AUTO-CONDITION-ENGINE`
- `AUTO-TOOL-ACTION-REGISTRY`
- `AUTO-APPROVAL`
- `AUTO-RUNTIME`
- `AUTO-BUILDER`
- `AUTO-NOTIFICATIONS`

### BOOKING_OPERATIONS — Scheduling and service operations

- `BOOKING-CATALOG`
- `BOOKING-AVAILABILITY`
- `BOOKING-LIFECYCLE`
- `BOOKING-AI`
- `FIELD-SERVICE`

### COMMERCE_PAYMENTS — Catalog, quotes, orders, invoices and money

- `CATALOG-V2` — **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** (`0170_catalog_v2@20261002083318`)
- `QUOTE-ENGINE` — **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** (`0171_quote_engine@20261002101923`, hardening `0172_quote_engine_postdeploy_hardening@20261002102818`)
- `ORDER-ENGINE` — **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** (`0173_order_engine@20261002130127`, hardening `0174_order_engine_fk_index_hardening@20261002131210`)
- `INVENTORY-FULFILLMENT` — **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**
- `INVOICE-ENGINE` — **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**
- `PAYMENT-CORE` — **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**
- `PAYMENT-OMAN` — **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for internally controlled scope; real merchant activation/E2E **BLOCKED_EXTERNAL**
- `PAYMENT-EXTENSION` — **NEXT**

### BUSINESS_INTELLIGENCE_AI — Business Twin, knowledge, memory and agents

- `BRAIN-BUSINESS-TWIN`
- `BRAIN-INDUSTRY-PACKS`
- `KNOWLEDGE-V2`
- `MEMORY-V2`
- `AI-CONTEXT-COMPILER`
- `AI-AGENT-RUNTIME`
- `AI-MODEL-PROMPT-CONTROL`
- `AI-QUALITY-SAFETY`
- `AI-VOICE-VISION`
- `AI-OWNER-COPILOT`

### ANALYTICS_REPORTING — Metrics, attribution and decision support

- `DATA-EVENT-METRICS`
- `DATA-WAREHOUSE`
- `DATA-DASHBOARDS`
- `DATA-ATTRIBUTION`
- `DATA-ASK`
- `DATA-EXPORTS`
- `DATA-REPORTING`

### SAAS_PLATFORM — Monetization, admin, agency and marketplace

- `SAAS-PLANS-ENTITLEMENTS`
- `SAAS-BILLING`
- `SAAS-COUPONS`
- `SAAS-AGENCY`
- `SAAS-SUPER-ADMIN`
- `SAAS-MARKETPLACE`

### DEVELOPER_ECOSYSTEM — APIs, integrations and partners

- `DEV-PUBLIC-API`
- `DEV-WEBHOOKS`
- `DEV-SDK`
- `DEV-INTEGRATIONS`
- `DEV-SANDBOX`
- `DEV-MIGRATION`
- `DEV-PARTNER`

### EXPERIENCE — Web, mobile and portals

- `UX-BUSINESS-WEB`
- `UX-MOBILE`
- `UX-PWA`
- `UX-CUSTOMER-PORTAL`
- `UX-PARTNER-PORTAL`
- `UX-DEVELOPER-PORTAL`
- `UX-SUPERADMIN-MOBILE`
- `UX-LOCALIZATION`
- `UX-ACCESSIBILITY`

### ENTERPRISE_OPERATIONS — Security, governance, reliability and scale

- `ENT-IAM`
- `ENT-DATA-GOVERNANCE`
- `ENT-SECURITY`
- `ENT-INCIDENT`
- `ENT-OBSERVABILITY`
- `ENT-PERFORMANCE`
- `ENT-BACKUP-DR`
- `ENT-RELEASE`
- `ENT-CONTRACTS`

### FINAL_ACCEPTANCE — Full product completion gate

- `FINAL-E2E`
- `FINAL-COMMERCIAL`
- `FINAL-SAFETY`
- `FINAL-OPERATIONS`
- `FINAL-LAUNCH`


---

## Production acceptance checkpoint — SALES-NEXT-ACTION

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

### MARKETING-CAMPAIGNS checkpoint — 2026-09-28

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
