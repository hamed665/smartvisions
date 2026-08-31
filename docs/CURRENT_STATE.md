# Smart Visions Growth OS — Current Production State

**Reconciled:** 2026-08-31 (Oman, UTC+4)

This is the operational handoff. Production evidence and current `main` override older planning text. Preserve the existing Control Center and extend only verified gaps.

## Production identity

- Repository: `hamed665/smartvisions`
- Branch: `main`
- Production URL: `https://smartvisions.vercel.app`
- Supabase project: `pkypexzpyfbikdnkrzvw`
- Current production main: `227f0d4948ba5512751d1b98d2603e4717f509a6` — merged PR #76
- Current Vercel production deployment: `dpl_4FPTwhW9uTr63FNLwkvKxhcDQ9f1` — READY, target `production`, alias `smartvisions.vercel.app`

## Protection rules

- Shadow Mode remains ON.
- Global kill switch remains OFF.
- Agents pause remains OFF.
- WhatsApp AI pause remains OFF.
- Do not create parallel CRM, Lead, Conversation, Pricing, Cost Guard, Integration, Agent, Preview or Catalog subsystems.
- Do not repeat paid smoke tests for behavior already proven by durable production evidence.

## Completed production hardening / verification sequence

The existing V1 architecture remains canonical. Recent production closure milestones include:

- #55–#68: WhatsApp Catalog, Agent recommendation, Shadow Approval, inbound idempotency, controlled pilot, Approved Send and production evidence reconciliation.
- #69: Email inbound partial-index/idempotency hardening.
- #70: branded Email production evidence reconciliation.
- #71: controlled WhatsApp Voice production pilot.
- #72: least-required Voice transcription service-role grants restored.
- #73: Preview production readiness, grants, stale identity and expiry hardening.
- #74: controlled Preview production pilot and terminal lifecycle event alignment.
- #75: tokenized `/p/[token]` Preview routes made genuinely accessible without an operator session.
- #76: public Preview isolated from the internal Control Center shell/navigation.

All merged code PRs above were merged only after exact-head lint, typecheck, tests and build were green.

## Current verified provider state

- `GOOGLE_PLACES / DISCOVERY`: CONNECTED, enabled
- `OPENAI / AI`: CONNECTED, enabled
- `META / WHATSAPP`: CONNECTED, enabled
- `EMAIL_PROVIDER / EMAIL`: CONNECTED, enabled
- `CRAWL4AI / AUDIT`: NOT_CONFIGURED, disabled, optional for V1 while deterministic audit remains sufficient
- `META / INSTAGRAM`: NOT_CONFIGURED, disabled, intentionally deferred
- `REDIS / QUEUE`: NOT_CONFIGURED, disabled, optional

## WhatsApp Catalog E2E — PRODUCTION VERIFIED

Verified controlled path:

`real inbound → linked Lead/Conversation → Agent → deterministic Catalog recommendation → Shadow Approval → owner approval → canonical Approved Send → Meta product message → SENT → DELIVERED → READ`

Canonical Catalog ID: `1773319100642340`.

Verified website Content ID: `SV-WEB-001`.

No duplicate provider send occurred and Shadow Mode remained ON throughout.

Current Catalog Content IDs:

- `SV-WEB-001` — Website Design & Development
- `SV-IG-CONTENT-001` — Instagram Content Creation
- `SV-WA-001` — WhatsApp Automation
- `SV-SEO-001` — SEO & GEO
- `SV-AI-AGENT-001` — AI Agents
- `SV-SM-001` — Social Media Management

## Email / Resend — OUTBOUND + BRANDED INBOUND PRODUCTION VERIFIED

Provider: Resend.

### Outbound

- Sender: `hello@smartvisionsai.com`
- durable `email.sent` and `email.delivered` evidence exists
- mailbox/provider integration is CONNECTED and enabled

### Receiving

- domain: `smartvisionsai.com`
- DNS provider: Cloudflare
- Receiving region: `ap-northeast-1`
- root MX: `@ → inbound-smtp.ap-northeast-1.amazonaws.com`, priority `10`
- Receiving state: Verified
- DKIM/SPF remain Verified
- DMARC exists as `v=DMARC1; p=none;`
- webhook: `https://smartvisions.vercel.app/api/email/webhook`

Real branded inbound proof:

`Gmail → hello@smartvisionsai.com → Resend Receiving → signed email.received → content retrieval → exact INTERNAL_TEST Business/Lead match → EMAIL conversation → inbound outreach_messages → Lead REPLIED`

The controlled inbound persisted exactly once. Email transport is green.

### Known Email intelligence distinction

The provider webhook intentionally does not directly invoke paid AI because provider retries must not duplicate paid Agent calls. Email transport success therefore does not prove multi-turn Agent intelligence. Future completion must reuse the existing idempotent `agent_runs`, conversation intelligence and Shadow Approval primitives through a controlled boundary.

## WhatsApp Voice — PRODUCTION VERIFIED

A real WhatsApp voice note from the linked INTERNAL_TEST contact was received through Meta and transcribed through the existing OpenAI Voice path.

Real transcript:

`I need a website for my clinic. Can you show me your website services?`

Evidence:

- real Meta `provider_message_id` and `media_id`
- exactly one logical `voice_transcriptions` row
- model: `gpt-4o-mini-transcribe`
- status: `SUCCEEDED`
- one paid OpenAI Voice usage event for the first transcription
- controlled accounting estimate recorded at `$0.009`
- second identical logical request returned the cached transcription with `cached=true` and `openAiCalls=0`
- no second OpenAI usage/cost event was created
- no outbound message was triggered
- Shadow Mode remained ON

The Voice path is green, including cache/idempotency proof.

## Preview E2E — PRODUCTION VERIFIED

Controlled Preview ID: `9f962982-a25d-4d66-8f80-3fc4c9791948`.

Public token: `dcf27c1b-cffe-4e0d-affe-df234ce0bb6d`.

Linked evidence uses the same real INTERNAL_TEST WhatsApp voice Lead and Website intent.

Verified lifecycle:

`real voice Website request → deterministic zero-provider-cost Preview → GENERATED → owner APPROVED → controlled internal share → SENT → public token view → VIEWED`

Evidence:

- Quality: `100/100`
- generation cost: `0`
- provider calls during Preview generation/share: `0`
- outbound triggered: `false`
- `GENERATED` event count: 1
- `APPROVED` event count: 1
- `SENT` event count: 1
- `VIEWED` event count: 1
- repeated public reads do not create duplicate `VIEWED` events
- Preview remains `VIEWED`
- Shadow Mode remained ON
- no outbound message was created after Preview generation

### Public Preview boundary hardening

The first authenticated owner view exposed two real launch bugs that were fixed before calling the gate complete:

1. The global Supabase session proxy redirected unauthenticated `/p/[token]` visitors to `/login`. PR #75 now permits only tokenized `/p/...` public Preview routes to bypass operator session enforcement while `/preview-studio`, CRM and other operator routes remain protected.
2. The public Preview still inherited the internal Control Center sidebar/navigation. PR #76 isolates `/p/...` from the operator AppShell.

Unauthenticated production fetch now returns HTTP 200 with the Preview content and no internal Control Center sidebar/navigation. The public Preview gate is green.

## Agent / Knowledge intelligence status

The multi-agent architecture exists and remains the foundation. Do not build another Agent framework.

Known quality gaps before broad autonomous advisory conversations:

- `/api/ai/process-inbound` does not yet fully hydrate recent conversation history by itself.
- Knowledge Base UI/versioning exists, but Production has no complete active service-knowledge corpus and runtime does not yet consume `knowledge_versions` as canonical service knowledge.
- Agent prompt/version controls exist in the Control Center, but current OpenAI instructions are still primarily code-level rather than active DB prompt versions.
- structured Services/Pricing and the WhatsApp Catalog are not yet fully reconciled as one commercial source of truth.
- natural Smart Visions brand voice needs explicit runtime examples/rules before broad autonomous sales use.

These are runtime-wiring/knowledge tasks, not permission to redesign the system.

## Hunter / Instagram status

Business Hunter remains intact and must not be rebuilt.

Canonical acquisition behavior still includes:

- Google Places IDs-first discovery
- dedupe and minimum qualification
- no standalone website → strong Website opportunity
- social/contact-only URL without standalone site → priority Website opportunity
- standalone website → low Website-opportunity score while other growth routes may remain valid
- Muscat/Oman/international lane routing
- no automatic outreach from qualification itself

Instagram is not currently a production Hunter provider. `META / INSTAGRAM` remains NOT_CONFIGURED and there is no production Instagram monitoring/cold-DM engine. Any later permitted Instagram integration must feed the existing Hunter/Lead/Conversation/Cost Guard model rather than create a second system.

## Cost Guard

Canonical monthly budget remains:

- total: `$25`
- OpenAI: `$10`
- Google Places: `$5`
- Email: `$4`
- WhatsApp: `$3`
- reserve: `$3`
- warning / throttle / critical / hard-stop: `70 / 85 / 95 / 100%`
- daily new leads: `50`
- daily website audits: `15`
- daily deep AI runs: `10`
- max AI runs per lead: `20`
- max voice seconds: `180`
- max automatic retries: `1`

## Remaining launch gates

Do not disable Shadow Mode and do not begin broad autonomous prospecting yet.

Provider connectivity for Google Places, OpenAI, WhatsApp, Email, Voice and Preview is now production-proven. The remaining launch work is behavior/policy evidence rather than reconnecting providers.

Prioritized next work:

1. verify the Project Hunter source inventory uses only public/official/licensed/permitted sources actually intended for V1; do not add a parallel lead system;
2. run the controlled Shadow Mode scenarios using test contacts only: positive reply, no reply/follow-up, objection, DNC/unsubscribe and human takeover;
3. prove follow-up cancellation with an actual pending follow-up, not a synthetic claim;
4. verify DNC/human takeover/global kill/local-time/commercial-price boundaries remain fail-closed in the full path;
5. close the Agent intelligence gaps needed before broad autonomous advice: conversation hydration, Knowledge Base runtime wiring, prompt/settings runtime wiring, service source-of-truth reconciliation and natural brand voice;
6. only after the gates are green, make an explicit owner decision on a tiny Oman pilot and permitted automation level.

Crawl4AI, Redis and Instagram are not current V1 launch blockers unless the owner explicitly chooses a V1 use case that requires them.
