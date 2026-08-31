# Smart Visions Growth OS — Current Production State

**Reconciled:** 2026-08-31 (Oman, UTC+4)

This is the operational handoff. Production facts and current `main` win over older planning text. Preserve the existing Control Center and extend only verified gaps.

## Production identity

- Repository: `hamed665/smartvisions`
- Production branch: `main`
- Production URL: `https://smartvisions.vercel.app`
- Supabase project: `pkypexzpyfbikdnkrzvw`
- Current production main: `40b7f64485c1067e168e126737b2356271e122b3` — merged PR #69
- Current Vercel production deployment for that code after the Resend Full Access credential redeploy: `dpl_BUY2bw8HKCnWVCHhzx5VdTtm9R8M` — READY, target `production`, canonical alias remains `smartvisions.vercel.app`

## Completed implementation / hardening sequence

- #36 ✅ Growth Intelligence / acquisition and growth-opportunity routing
- #37 ✅ AI Sales / Conversations / Email / WhatsApp / Voice foundation
- #38 ✅ Reliability hardening for the five PR #37 review failures
- #39 ✅ Website Demo & Content Production Engine
- #40 ✅ Control Center completeness / reliability / launch gates
- #49–#54 ✅ WhatsApp production webhook, verification, environment-name and least-privilege hardening
- #55 ✅ Live Smart Visions WhatsApp Catalog wired into canonical Approved Send
- #56 ✅ Deterministic Agent service intent → allowlisted Catalog recommendation
- #57 ✅ Catalog-era handoff reconciliation
- #58 ✅ Agent REVIEW → existing Shadow Approval bridge with durable 24-hour evidence
- #59 ✅ Pilot-state reconciliation
- #60 ✅ WhatsApp inbound lifecycle idempotency fix for partial unique-index conflict handling
- #61 ✅ Owner-only Controlled WhatsApp Agent Pilot surface
- #62 ✅ Pilot routing hardening attempt; superseded by later root-cause fixes
- #63 ✅ Internal AI route session-proxy boundary fixed
- #64 ⛔ Closed without merge because its documentation became stale after new production evidence
- #65 ✅ WhatsApp pilot idempotency uses durable internal inbound UUID rather than raw Meta message ID
- #66 ✅ Least-required service-role grants restored for Agent → Shadow Approval runtime
- #67 ✅ Owner-controlled Catalog send gate through canonical Approved Send while global Shadow Mode remains ON
- #68 ✅ Production evidence / integration inventory reconciliation
- #69 ✅ Email inbound lifecycle idempotency hardened to plain insert + `23505` duplicate handling

Do not recreate WhatsApp foundations, Email foundations, CRM, pricing, conversations, Cost Guard, provider state, agent framework, preview engine or catalog storage as parallel systems.

## Existing Control Center is protected

The current production panel remains the foundation: Dashboard, Leads/CRM, Hunters/Growth, Campaigns, Conversations, Hot Leads, Services, Pricing, Portfolio, Preview Studio, Markets, Agents, Message Studio, Automations, Approvals, Integrations, Cost & Usage, Audit, Suppression/DNC, System, Knowledge Base and Reports.

No redesign or replacement subsystem is justified by the current production state.

## Canonical runtime sources

- Emergency/runtime flags: `system_controls`
- Budget, quotas, provider allocations and thresholds: `cost_guard_settings`
- Market/channel policy: `market_settings.config` plus `outreach_policies`
- Agent runtime/model/confidence settings: `agent_settings`
- Pricing: existing service price tables
- Provider health/state: `integration_connections`
- Usage/cost ledger: `usage_events`
- Audit trail: `audit_logs`

`system_controls.monthly_budget_usd` remains legacy. The canonical budget is `cost_guard_settings.monthly_total_budget_usd`.

## Current verified production runtime state

Queried directly from Growth OS Supabase on 2026-08-31 after the controlled pilots:

- `GOOGLE_PLACES / DISCOVERY`: CONNECTED, enabled
- `OPENAI / AI`: CONNECTED, enabled
- `META / WHATSAPP`: CONNECTED, enabled
- `EMAIL_PROVIDER / EMAIL`: CONNECTED, enabled
- `CRAWL4AI / AUDIT`: NOT_CONFIGURED, disabled; optional for V1 because deterministic audit exists
- `META / INSTAGRAM`: NOT_CONFIGURED, disabled; restricted automation remains intentionally deferred/policy-aware
- `REDIS / QUEUE`: NOT_CONFIGURED, disabled; optional until measured queue/recovery load justifies it
- Global kill switch: OFF
- Email pause: OFF
- WhatsApp AI pause: OFF
- Agents pause: OFF
- Shadow Mode: ON

## WhatsApp controlled E2E — PRODUCTION VERIFIED

The WhatsApp controlled Catalog path is proven with real production evidence.

Real customer/test inbound:

`Can you show me your website service?`

Verified path:

`real linked WhatsApp inbound → /api/ai/process-inbound → exactly one Agent run → deterministic Catalog recommendation → exactly one Shadow Approval → owner approval → controlled canonical Approved Send → Meta product message → SENT → DELIVERED → READ`

Evidence:

- Recommended/approved Catalog Content ID: `SV-WEB-001` — Website Design & Development
- `conversation_messages` final status: `SENT`
- Real Meta provider message ID: `wamid.HBgLOTY4Nzc1MTEwNTMVAgARGBIxOThBNjM4MURFQzYwM0RGNzUA`
- `whatsapp_events`: `PRODUCT_SENT` with `catalog_content_id = SV-WEB-001`
- Provider status webhooks persisted: `SENT`, `DELIVERED`, `READ`
- `usage_events`: exactly one `WHATSAPP / SEND_PRODUCT`, one unit, Content ID persisted
- Duplicate/idempotency verification: one logical message row and one provider message identity for the controlled send
- Global Shadow Mode remained ON before, during and after the pilot

PR #67 did not create a parallel sender. Its owner-only exception verifies durable INTERNAL_TEST evidence and then reuses existing Approved Send / `MetaCloudWhatsAppProvider`. Kill/pause, DNC, human takeover, provider CONNECTED, local send window, WhatsApp 24-hour policy, Cost Guard, claim/idempotency and no-blind-retry semantics remain active.

### Production WhatsApp Catalog

Canonical Catalog ID: `1773319100642340`

Canonical Content IDs:

- `SV-WEB-001` — Website Design & Development
- `SV-IG-CONTENT-001` — Instagram Content Creation
- `SV-WA-001` — WhatsApp Automation
- `SV-SEO-001` — SEO & GEO
- `SV-AI-AGENT-001` — AI Agents
- `SV-SM-001` — Social Media Management

No further paid WhatsApp smoke test is required merely to refresh a badge. New WhatsApp tests must correspond to a genuinely unproven behavior.

## Email / Resend — CUSTOM-DOMAIN INBOUND + OUTBOUND PRODUCTION VERIFIED

The Email Provider is Resend.

### Outbound evidence

Existing durable evidence from 2026-08-23:

- Mailbox: `hello@smartvisionsai.com`
- Provider message ID: `a180f18d-0a5f-4bee-9687-5c962bf0610e`
- Signed `email.sent` webhook persisted
- Signed `email.delivered` webhook persisted
- Integration reconciled to CONNECTED + enabled from durable evidence with zero unnecessary provider calls
- Mailbox health: HEALTHY

### Receiving configuration

Custom-domain receiving is now configured and verified rather than inferred:

- Resend domain: `smartvisionsai.com` — Verified
- DNS provider: Cloudflare
- Resend receiving region: Tokyo / `ap-northeast-1`
- Root receiving MX: `@ → inbound-smtp.ap-northeast-1.amazonaws.com`
- Priority: `10`
- Resend Receiving status: Verified
- Existing sending DKIM remains Verified
- Existing sending SPF/Return-Path records remain Verified
- DMARC record exists as `v=DMARC1; p=none;`
- Resend webhook endpoint: `https://smartvisions.vercel.app/api/email/webhook`
- `email.received` subscription is enabled

The Resend API credential used by Growth OS was upgraded from sending-only permission to Full Access because inbound content retrieval uses Resend Receiving API. The secret remains only in Vercel Environment Variables; no secret is committed to the repository.

### Real custom-domain inbound evidence

A real Gmail message was sent through normal Internet mail delivery to the production mailbox:

- From: `capcutproazivibe@gmail.com`
- To: `hello@smartvisionsai.com`
- Subject: `Website service inquiry`
- Body: `Hi, I’m interested in your website service. Can you tell me more about what is included?`
- Resend received email ID / provider message ID: `e7a8b6d1-0db9-4634-b802-c7d7c0d35cb7`
- Resend webhook event ID: `msg_3IghZHR1eyuRFv4lAgzVgp2Igfv`
- Gmail Message-ID: `<CAGYidLPgm6ZTi9yd+86eLfZxdMVpCjoZcat1mBzSOnoD9Xgopg@mail.gmail.com>`

Verified path:

`Gmail → hello@smartvisionsai.com → Resend Receiving → signed email.received webhook → Resend content retrieval → exact INTERNAL_TEST Business/Lead match → EMAIL sales_conversation → inbound outreach_messages → Lead REPLIED`

Durable evidence:

- `email_events`: exactly one `email.received` for the provider identity
- `outreach_messages`: exactly one EMAIL / INBOUND / RECEIVED row for the provider identity
- inbound idempotency key: `resend:inbound:e7a8b6d1-0db9-4634-b802-c7d7c0d35cb7`
- linked EMAIL conversation ID: `438b12c3-5ec7-4d92-a175-09b105894d89`
- dedicated INTERNAL_TEST Lead ID: `2e4a14bd-6f87-474d-81c1-db1fb3c5ef1a`
- Lead status: `REPLIED`
- no duplicate lifecycle row was produced
- no pending follow-up existed for this test Lead, so do **not** claim a real pending-job cancellation occurred in this particular proof; cancellation code remains implemented and requires a later scenario with an actual pending job to prove that behavior

### Known Email intelligence gap exposed by the successful transport test

Transport/lifecycle success is not the same as Agent conversation intelligence.

The real EMAIL conversation currently proves persistence, but the existing `email-lifecycle` path only updates `last_message_at`, Lead `REPLIED`, and pending follow-up cancellation. It does **not** directly call the paid Agent pipeline from the provider webhook, which is intentional because webhook retries must not duplicate paid AI calls.

Observed fields after the real inbound:

- `stage = NEW`
- `last_inbound_at = null`
- `unread_count = 0`
- `awaiting_party = NONE`
- `intent_label = null`
- `persian_summary = null`

This is a real launch/intelligence gap, not an Email transport failure. Do not solve it by wiring Resend webhook retries directly to paid AI. Reuse the existing idempotent `agent_runs`, conversation intelligence and Shadow Approval primitives when that behavior is completed.

## Agent / knowledge intelligence status

The canonical multi-agent stack exists and is selectively routed rather than running every specialist on every message. Existing Agent context supports fields such as conversation summary, stage, quoted service/price and verified evidence.

Known gaps discovered during production review:

- `/api/ai/process-inbound` currently relies mainly on caller-provided context and does not fully hydrate recent conversation history itself.
- Knowledge Base UI/versioning exists, but Production currently has no active service-knowledge corpus and runtime does not yet load `knowledge_versions` into Agent reasoning.
- Agent prompt/version controls exist in the Control Center, but the current OpenAI runtime still uses canonical code instructions rather than active DB prompt versions.
- `services` / `service_prices` and the WhatsApp Catalog are not yet fully reconciled as one commercial source of truth; Catalog includes SEO/GEO, AI Agents and Social Media Management while the current structured service table is narrower.

Do not create a new Agent framework. Future intelligence improvement should wire these existing Control Center primitives into the canonical runtime.

## Hunter / acquisition status

Business Hunter remains intact and must not be rebuilt.

Current canonical behavior includes:

- Google Places IDs-only discovery first
- selective qualification and durable dedupe
- operational business with no website → high Website opportunity score
- social/contact-only link without standalone site → priority Website opportunity
- standalone website → low Website-opportunity score while content opportunities can still remain valid
- Growth routing by Muscat local / Oman remote / international remote lane
- no automatic social analysis or outreach from qualification itself

Instagram is not a current Hunter runtime provider. `META / INSTAGRAM` remains NOT_CONFIGURED/DEFERRED and any later social source must feed the existing CRM/Hunter/Cost Guard model rather than create a parallel system or uncontrolled cold-DM bot.

## Cost Guard

Canonical production budget remains:

- Total monthly: $25
- OpenAI: $10
- Google Places: $5
- Email: $4
- WhatsApp: $3
- Reserve: $3
- Warning / throttle / critical / hard-stop: 70 / 85 / 95 / 100%
- Daily new leads: 50
- Daily website audits: 15
- Daily deep AI runs: 10
- Max AI runs per lead: 20
- Max voice seconds: 180
- Max automatic retries: 1

Large budget/quota increases require explicit owner confirmation and audit logging.

## Reliability boundaries that remain canonical

- Business identity: existing Google Place/domain dedupe
- Paid Google Details: `discovery_records` claim/replay journal
- Website audit: cache + quota + unique RUNNING guard
- Inbound AI: `agent_runs.request_key/result_payload` claim/replay semantics
- Voice: media cache + FAILED recovery + stale PROCESSING lease
- Preview/content: stable `brief_hash` idempotency
- Email webhook: signed, provider-event idempotency + inbound-message idempotency
- WhatsApp webhook: signed/durable/idempotent event and lifecycle persistence
- Approved outbound: pre-provider claim; provider acceptance is final for resend safety; later persistence failures are reconciliation-only
- Global kill / Agent pause / channel pause / DNC / human takeover remain hard gates

## Exact next action

Do **not** disable Shadow Mode. Do **not** repeat WhatsApp or Email connectivity tests merely to refresh UI state.

Email custom-domain inbound transport is now proven. The next genuinely unproven provider behavior in the locked launch sequence is a controlled **WhatsApp voice transcription production test** using the existing OpenAI connection and existing voice-transcription cache.

Requirements for that test:

1. use the existing dedicated INTERNAL_TEST WhatsApp Business/Lead/Conversation;
2. receive one real WhatsApp voice note through the existing signed webhook path — no fake media ID, message ID or timestamp;
3. do not invoke paid transcription directly from the webhook retry path;
4. execute the existing `transcribeWhatsAppVoiceOnce` primitive through a controlled, idempotent owner/internal boundary;
5. verify exactly one `voice_transcriptions` logical row for the provider message/media identity;
6. verify transcript + detected language + `OPENAI / VOICE_TRANSCRIPTION` usage evidence;
7. invoke the same logical request again only as an idempotency check and confirm it returns cached evidence without a second OpenAI call/usage row;
8. preserve Cost Guard, max-media, failure recovery and no-blind-retry semantics;
9. keep Shadow Mode ON and do not send any outbound message as part of the transcription proof.

After Voice proof:

- Preview generate → share/send → public view E2E
- Crawl4AI only if its external service is actually configured and useful; one smallest controlled smoke test
- smallest safe bounce/suppression/unsubscribe evidence where still required
- full Shadow Mode scenarios: positive reply, no reply, objection, DNC, human takeover
- only then consider a tiny Oman pilot and a separate explicit automation-level decision

Separately, before broad autonomous conversations, the known Agent intelligence gaps — conversation hydration, Knowledge Base runtime wiring, prompt/settings runtime wiring and service-source reconciliation — must be closed by extending the existing primitives, not by creating new subsystems.
