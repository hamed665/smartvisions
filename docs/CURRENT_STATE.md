# Smart Visions Growth OS — Current Production State

**Reconciled:** 2026-09-02 (Oman, UTC+4)

This is the operational handoff and the first document to read before changing Growth OS. Verified Production evidence and current `main` override older planning text. Preserve the existing architecture and extend only proven gaps.

## Production identity

- Repository: `hamed665/smartvisions`
- Branch: `main`
- Production URL: `https://smartvisions.vercel.app`
- Supabase project: `pkypexzpyfbikdnkrzvw`
- Current production main: `369d229612dac8a1d4f76d76a6bd643bbf1121f8` — merged PR #88
- Current Vercel production deployment: `dpl_CkGxRWZYkjCbYK49wxH1PgGnaHUt` — READY, target `production`, canonical alias `smartvisions.vercel.app`, no alias error
- Master Tracker: GitHub Issue #18

## Non-negotiable protection rules

- Shadow Mode remains ON.
- Global kill switch remains OFF.
- Agents pause remains OFF.
- Email pause remains OFF.
- WhatsApp AI pause remains OFF.
- Do not create parallel CRM, Lead, Conversation, Pricing, Cost Guard, Integration, Agent, Preview, Catalog or notification subsystems.
- Do not repeat paid smoke tests when durable Production evidence already proves the behavior.
- Deterministic logic/cached evidence must run before paid AI/provider work where possible.
- A successful provider call must never be blindly retried because local persistence failed.
- No broad autonomous prospecting until the remaining behavior gates below are explicitly closed.

## Recent production closure sequence

The V1 foundation remains canonical. The most relevant recent milestones are:

- #55–#68: WhatsApp Catalog, Agent recommendation, Shadow Approval, inbound idempotency, controlled pilot, Approved Send and production evidence reconciliation.
- #69–#70: Email inbound idempotency/hardening and branded Resend production reconciliation.
- #71–#72: controlled WhatsApp Voice production pilot and least-required Voice transcription grants.
- #73–#76: Preview production readiness, controlled pilot, public-token access and isolation from internal Control Center navigation.
- #78: premium mobile-first 2026 Preview path.
- #79: human multi-agent sales consensus, conversation memory and specialist-to-orchestrator/secretary collaboration.
- #80: Telegram Owner Assistant and typed command journal.
- #81: complete Telegram Lead alert context, including first-class HOT_LEAD and canonical Lead/service/pricing/WhatsApp context.
- #82: Telegram runtime read grants restored after least-privilege hardening.
- #83: Telegram owner control plane completed.
- #84: Telegram confirmation comparison made JSONB-order safe.
- #85: AI cost-efficiency hardening, selective paid-agent routing, context/output/reasoning controls and current OpenAI pricing/cached-input accounting.
- #86: Cost Guard aggregation moved into PostgreSQL and existing paid-AI/deep-run quotas made real.
- #87: provider cost truth added so provisional `$0`/reserve values cannot masquerade as final provider invoices.
- #88: atomic pre-provider Cost Guard reservations for paid OpenAI Agent and paid Google Places calls, plus explicit least-privilege `usage_events` grants.

All code PRs above were merged only after exact-head lint, typecheck, tests and build were green. PR #88 additionally had zero unresolved GitHub/Vercel review threads, DB-only reservation proof, Production migration verification and READY deployment proof.

## Current verified provider state

- `GOOGLE_PLACES / DISCOVERY`: CONNECTED, enabled
- `OPENAI / AI`: CONNECTED, enabled
- `META / WHATSAPP`: CONNECTED, enabled
- `EMAIL_PROVIDER / EMAIL`: CONNECTED, enabled
- WhatsApp Voice transcription: production-proven
- Preview public delivery: production-proven
- Telegram command webhook/control plane: production-proven for real owner commands
- `CRAWL4AI / AUDIT`: NOT_CONFIGURED, disabled, optional while deterministic audit is sufficient
- `META / INSTAGRAM`: NOT_CONFIGURED, disabled, intentionally deferred
- `REDIS / QUEUE`: NOT_CONFIGURED, disabled, optional

Provider status must not be upgraded merely because a secret exists. Durable success evidence remains authoritative.

## WhatsApp Catalog E2E — PRODUCTION VERIFIED

Verified controlled path:

`real inbound → linked Lead/Conversation → Agent → deterministic Catalog recommendation → Shadow Approval → owner approval → canonical Approved Send → Meta product message → SENT → DELIVERED → READ`

Canonical Catalog ID: `1773319100642340`.

Current Catalog Content IDs:

- `SV-WEB-001` — Website Design & Development
- `SV-IG-CONTENT-001` — Instagram Content Creation
- `SV-WA-001` — WhatsApp Automation
- `SV-SEO-001` — SEO & GEO
- `SV-AI-AGENT-001` — AI Agents
- `SV-SM-001` — Social Media Management

No duplicate provider send occurred and Shadow Mode remained ON throughout the proof.

## Email / Resend — OUTBOUND + BRANDED INBOUND PRODUCTION VERIFIED

Provider: Resend.

Verified outbound:

- sender `hello@smartvisionsai.com`
- durable `email.sent` and `email.delivered` evidence
- provider/mailbox integration CONNECTED and enabled

Verified inbound:

`Gmail → hello@smartvisionsai.com → Resend Receiving → signed email.received → content retrieval → exact INTERNAL_TEST Business/Lead match → EMAIL conversation → inbound outreach_messages → Lead REPLIED`

The controlled inbound persisted exactly once.

Important distinction: the provider webhook deliberately does not invoke paid AI directly because provider retries must not duplicate Agent calls. Email transport is green; broad autonomous Email conversation behavior still requires the Shadow Mode behavior scenarios below.

## WhatsApp Voice — PRODUCTION VERIFIED

A real WhatsApp voice note from the linked INTERNAL_TEST contact was downloaded from Meta and transcribed once through OpenAI.

Durable evidence includes:

- real Meta provider message/media identity
- one logical `voice_transcriptions` row
- model `gpt-4o-mini-transcribe`
- status `SUCCEEDED`
- one paid OpenAI Voice usage event for the first logical transcription
- repeated identical logical request returned cached transcription with `openAiCalls=0`
- no second usage/cost event
- no outbound message triggered
- Shadow Mode remained ON

Voice already has cache/idempotency and crash-recovery semantics. PR #88 intentionally did not mix Voice into the new atomic pre-call reservation mechanism; this is a bounded hardening option before larger concurrency, not a reason to rebuild the Voice path.

## Preview E2E — PRODUCTION VERIFIED

Verified lifecycle:

`real voice Website request → deterministic zero-provider-cost Preview → GENERATED → owner APPROVED → controlled internal share → SENT → public token view → VIEWED`

Evidence includes quality `100/100`, zero provider calls for generation/share, zero generation cost, single lifecycle events and public unauthenticated access without exposing the internal Control Center shell.

Do not create a second Preview/content system.

## Multi-Agent sales intelligence — CURRENT TRUTH

The Agent architecture is canonical and should not be replaced.

Current runtime wiring now hydrates, before the paid boundary:

- the authoritative Lead/Conversation;
- up to 14 recent inbound/outbound conversation messages;
- conversation summary/stage/mode/language/dialect;
- active `knowledge_versions`;
- active `prompt_versions`;
- per-Agent settings/model/confidence/config;
- enabled canonical Services;
- market-specific canonical `service_prices` including floor/discount boundaries;
- market locale/tone profile;
- approved evidence/portfolio context passed through the existing Agent contract.

Specialist outputs feed the real Orchestrator. The Secretary reads specialist consensus, Orchestrator decision, conversation memory and canonical service knowledge. The Relevance Checker evaluates the actual proposed reply rather than only the inbound message.

### Current Production data gap

The runtime wiring is no longer the blocker. Production currently has:

- active Knowledge versions: `0`
- active Prompt versions: `0`
- enabled Services: `6`
- service price rows: `36`
- locale profiles: `6`

Therefore Services/Pricing/Locale are live canonical data, while optional owner-maintained Knowledge and Prompt corpora are currently empty. Safe code-level Agent instructions remain the fallback.

Next intelligence work should populate only genuinely useful, non-duplicative Knowledge/brand guidance. Do not copy pricing into Knowledge, and do not create a second prompt framework.

## Selective AI routing / token-efficiency — PRODUCTION

PR #85 established the intended paid boundary:

- `ZERO_COST`: zero paid Agent calls.
- `LIGHT`: one paid Secretary call for routine replies.
- `FULL`: deterministic specialists still contribute, but only specialists that materially need model reasoning are paid; Orchestrator/Secretary and high-risk relevance/evidence checks remain where justified.
- Typical complex FULL work is roughly 3–6 paid calls instead of paying the entire 7–10 Agent committee.
- context history limits are enforced in the actual Responses payload.
- task-specific output ceilings and GPT-5 reasoning effort are explicit.
- cached input tokens are accounted separately.
- configured per-Agent model selection is honored.

Do not optimize cost by removing evidence/pricing/handoff safety. The objective is fewer unnecessary calls, not cheaper bad decisions.

## Cost Guard / accounting — PRODUCTION

Canonical monthly guardrails remain:

- total `$25`
- OpenAI `$10`
- Google Places `$5`
- Email `$4`
- WhatsApp `$3`
- reserve `$3`
- warning / throttle / critical / hard-stop: `70 / 85 / 95 / 100%`
- daily new leads: `50`
- daily website audits: `15`
- daily deep AI runs: `10`
- max AI runs per lead: `20`
- max voice seconds: `180`
- max automatic retries: `1`

Current hardening:

- monthly provider totals are aggregated in PostgreSQL rather than downloading the month's usage history for each serverless preflight;
- `max_ai_runs_per_lead` is enforced for paid LIGHT/FULL AI work;
- `daily_deep_ai_runs` is enforced for FULL reasoning;
- ZERO_COST deterministic work remains available without consuming paid-AI quota;
- OpenAI usage uses current official model pricing and cached-input accounting;
- Dashboard distinguishes reconciled/token-metered, conservative reserve, pending reconciliation and legacy/unclassified records;
- paid OpenAI Agent + paid Google Places work reserves budget atomically in canonical `usage_events` before the provider call;
- successful calls settle that same row, avoiding double accounting;
- network/5xx ambiguity remains conservatively counted and becomes reconciliation-required rather than disappearing after a timeout;
- no active/stale reservation remained after the PR #88 DB-only verification transaction.

### `usage_events` least privilege

Production verification exposed older broad/default grants and PR #88 explicitly corrected them:

- authenticated: SELECT + INSERT only; no table UPDATE/DELETE/TRUNCATE;
- service_role: SELECT + INSERT, no table-wide UPDATE/DELETE/TRUNCATE;
- service_role UPDATE only on `cost_usd`, `input_tokens`, `output_tokens`, `units`, `metadata`;
- service_role cannot mutate provider identity;
- reservation/finalization RPC execute: service_role only; authenticated/anon denied.

## Telegram Owner Assistant — CURRENT PRODUCTION EVIDENCE

Telegram is no longer merely code/deployment-ready. Real owner command journal evidence exists.

Production journal currently contains successful executions for read/control flows including:

- status
- services
- pricing
- leads
- markets
- budget
- help
- reversible market-style mutation
- confirmation callback
- revert-last-change

The stale-preview/changed-state confirmation path also failed closed as designed. An earlier status lookup failure is superseded by a later successful `SHOW_STATUS` run.

### Telegram gap still not proven

`telegram_notification_events` currently has `0` rows. Therefore do **not** claim real Production E2E yet for outbound owner alerts such as:

- New Lead
- Hot Lead
- Discount request
- Consultation request
- Human handoff

The alert code/context is implemented, but the real Telegram notification send/journal path still needs one controlled proof without manufacturing a fake customer event.

## Business Hunter — CURRENT TRUTH

Business Hunter remains intact and must not be rebuilt.

Canonical behavior:

- Google Places IDs-first discovery;
- dedupe/minimum qualification before paid enrichment;
- paid Details only when value justifies it;
- standalone website absence/social-only contact can strengthen Website opportunity;
- having a website does not eliminate other growth/content opportunities;
- Muscat/Oman/international routing remains canonical;
- qualification itself does not trigger outreach;
- paid Google calls now atomically reserve Cost Guard budget before provider invocation.

Project/marketplace Hunter remains a future source-expansion lane only if sources are public/official/licensed/permitted and feed the existing Lead/Intent model. No second CRM.

Instagram remains deferred and is not a V1 launch blocker.

## Remaining launch gates — prioritized

Do not disable Shadow Mode and do not start broad autonomous prospecting yet.

1. **Knowledge/brand intelligence:** create a small, reviewed active Knowledge corpus for Smart Visions service/brand/process guidance that is not already canonical in Services/Pricing/Locale. Add active Prompt versions only where owner-tunable behavior adds real value over hard code-level safety rules.
2. **Telegram owner alerts:** produce one controlled real notification-path proof and then cover New Lead / Hot Lead / Discount / Consultation / Human Handoff alert behavior without triggering customer outreach.
3. **Shadow Mode behavior scenarios:** using test/internal contacts only, prove positive reply, objection, no reply/follow-up, DNC/unsubscribe and human takeover.
4. **Follow-up cancellation:** prove cancellation with an actual pending follow-up rather than a synthetic state claim.
5. **Full-path fail-closed checks:** DNC, human takeover, global kill, local time and commercial-price boundaries must remain authoritative through the real path.
6. **Voice concurrency decision:** before materially higher concurrency, either extend the atomic reservation primitive to Voice with its existing post-provider reconciliation semantics or document why the existing single-call/cache boundary plus small pilot volume is sufficient.
7. **Tiny Oman pilot:** only after the gates above are green, make an explicit owner decision on permitted automation level and tiny volume. Scale only from measured outcomes.

Crawl4AI, Redis and Instagram are not current launch blockers unless a measured use case proves otherwise.

## Definition of next clean work

Prefer evidence over architecture tourism:

`current canonical data → deterministic/cache gate → Cost Guard → minimum paid reasoning/provider work → Shadow Approval/control → durable outcome evidence → only then tune/scale`

If a future chat proposes rebuilding Hunter, adding another Agent framework, duplicating pricing/knowledge, running paid smoke tests for already-proven paths, or disabling Shadow Mode before behavior proof, stop and reconcile against this document and Issue #18 first.
