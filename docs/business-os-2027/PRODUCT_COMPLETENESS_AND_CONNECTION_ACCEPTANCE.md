# Product completeness and customer connection acceptance — Business OS 2027

Owner-requested preservation baseline: 2026-09-26 (Asia/Muscat).
Code audit baseline: `542ef8bf33b394918404990fdb97b9b7df1e7f8e`.
Document type: requirements and acceptance companion, not a new architecture, runtime completion claim, or activation authorization.

## خلاصه برای مالک

هدف، محصول کامل Smart Visions AI Business OS 2027 برای مشتری، کارکنان، مدیر کسب‌وکار و مدیر کل Smart Visions است. هیچ قابلیت مصوب برای سریع‌تر تمام‌شدن یا کم‌شدن تعداد PR حذف نمی‌شود. مسیر ساده اتصال مشتری باید با ورود رسمی و اعطای دسترسی باشد؛ مشتری نباید رمز یا توکن را در چت ارسال کند. مهم‌ترین شکاف تأییدشده، تبدیل اتصال فعلی واتساپ از یک اتصال به مسیریابی امن چند کسب‌وکار است. اتصال هم‌زمان اپ اصلی و AI، رزرو، پرداخت، اپ موبایل و صورتحساب کامل فقط بعد از آزمون واقعی آماده اعلام می‌شوند.

این سند جزئیات و معیارهای پذیرش را حفظ می‌کند. نقشه اصلی همچنان MASTER_PROGRAM_SECTIONS است؛ وضعیت جاری از runtime و NEXT_CHAT_HANDOFF خوانده می‌شود. عدد ۱۵٪ در تصاویر قدیمی و تعداد PR معیار پیشرفت نیستند. «بهترین اپ ۲۰۲۷» هدف کیفیت است و باید با اتصال آسان، نتیجه تجاری، امنیت، سرعت و قابلیت اعتماد سنجیده شود.

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
- CURRENT_STATE records Production migrations through 0097, source-plane Chatwoot on OVH, and existing owner reply/takeover preserved.
- Earlier same-session read-only Production query found zero brands, tenant businesses, Chatwoot account mappings and inbox projections, with Shadow Mode ON. This is timestamped earlier evidence, not a newly refreshed database claim in this documentation package.
- Historical foundation evidence includes Control Plane, Email/WhatsApp semantic adapters, CRM identity, Customer 360, Tasks, Deals/Pipelines, Custom Fields and Dynamic Lead Segments. Foundations are not the whole target product.
- Meta app approval, Tech Provider status, customer coexistence eligibility and third-party commercial terms were not authenticated/verified by this audit.

### Code-backed gaps at the audit SHA

| ID | Evidence | Gap / consequence | Existing owners |
|---|---|---|---|
| GAP-01 | lib/whatsapp/persistence.ts: resolveWhatsAppOrganizationId requires exactly one META/WHATSAPP integration | Multiple integration rows fail closed; real multi-business inbound routing is not complete | DEV-INTEGRATIONS; COMM-RECONCILIATION; COMM-TENANT-BRIDGE |
| GAP-02 | lib/whatsapp/meta-cloud.ts defaults to environment token and phone-number ID | Default send path needs verified tenant-specific credential selection and binding; do not claim every possible injected caller is global | DEV-INTEGRATIONS; COMM-ACTION-BRIDGE |
| GAP-03 | lib/whatsapp/webhook.ts normalized inbound omits destination WABA/phone-number binding context | Preserve trusted destination context through verified webhook ingestion for tenant routing | COMM-RECONCILIATION |
| GAP-04 | app/integrations/page.tsx offers status/verification; reviewed paths contain no completed customer Embedded Signup flow | Self-service connection is not proven | UX-BUSINESS-WEB; DEV-INTEGRATIONS |
| GAP-05 | lib/omnichannel/adapters.ts ACTIVE_CHANNEL_ADAPTERS includes EMAIL and WHATSAPP only | Other customer channels require implementation and acceptance | OMNI-META-SOCIAL; OMNI-TELEGRAM; OMNI-WEBCHAT; OMNI-TIKTOK; OMNI-SMS-RCS |
| GAP-06 | Email/WhatsApp descriptors mark nativeProviderActivity UNPROVEN | Native-app coexistence must not be advertised as proven | COMM-HUMAN-AI; COMM-RECONCILIATION |
| GAP-07 | WhatsApp extraction maps audio media in the reviewed path | Full image/document/video/media support is not established | OMNI-VOICE; AI-VOICE-VISION; COMM-UNIFIED-INBOX |
| GAP-08 | Latest NEXT_CHAT_HANDOFF | Status/labels/assignee/team actions, internal notes and attachment authorization remain next inbox work | COMM-UNIFIED-INBOX |
| GAP-09 | Activation gate + earlier empty tenant/projection evidence | A real first tenant and end-to-end production acceptance remain gated | COMM-TENANT-BRIDGE; FINAL-E2E |

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

Do not replace the current cursor. At this baseline it remains COMMUNICATION / COMM-UNIFIED-INBOX governed operations.

Then sequence related work by verified dependencies:
1. complete inbox status/assignment/transfer/notes/attachment boundaries;
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

- `CATALOG-V2`
- `QUOTE-ENGINE`
- `ORDER-ENGINE`
- `INVENTORY-FULFILLMENT`
- `INVOICE-ENGINE`
- `PAYMENT-CORE`
- `PAYMENT-OMAN`
- `PAYMENT-EXTENSION`

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
