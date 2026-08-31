# Smart Visions Growth OS — Mandatory Agent Handoff

> **Read this file before changing code, database schema, infrastructure, integrations, outreach policy, AI behavior, pricing, or production settings.**

## Source of truth

Continue from repository and production state, never from chat memory alone. Read in this order:

1. `AGENTS.md` — non-negotiable engineering/operational rules.
2. `docs/CURRENT_STATE.md` — exact production status and current next action.
3. `docs/MASTER_PLAN.md` — product scope, Production V1 completion state and post-V1 backlog.
4. `docs/V1_FINAL_4_PR_PLAN.md` — actual #36–#40 closure sequence and exit gate.
5. `docs/INTEGRATION_INVENTORY.md` — provider/config state and verification rules.
6. `docs/EXECUTION_PLAYBOOK.md` — implementation/deployment discipline.
7. `.env.example` — integration contract. Never commit real secrets.

If chat history conflicts with repository documentation, verify code, current PR SHA, Supabase schema/state and Vercel deployment first. Update `docs/CURRENT_STATE.md` after every meaningful production change.

## Project identity

- Repository: `hamed665/smartvisions`
- Product: **Smart Visions Growth OS**
- This repository is separate from the Smart Visions Website repository and from DrKhaleej. Never mix their code, databases or deployment state.
- Frontend/control plane: Next.js on Vercel.
- Database/Auth: Supabase.
- Production Supabase ref: `pkypexzpyfbikdnkrzvw`.
- Main Control Center language: English.
- Owner/operator explanations, translations, summaries and handoff context: Persian where applicable.

## Current Production V1 sequence

- PR #36 — Growth Intelligence — COMPLETE.
- PR #37 — AI Sales / Conversations / Outreach foundations — COMPLETE.
- PR #38 — emergency reliability hardening of five real #37 review defects — COMPLETE.
- PR #39 — Website Demo & Content Production Engine — COMPLETE.
- PR #40 — Control Center completeness / reliability / final QA / launch gates — COMPLETE foundation; controlled production verification continues under the same launch plan.
- PRs #49–#69 — provider configuration, WhatsApp controlled E2E, evidence reconciliation and Email inbound reliability/verification work.

The original four-feature-PR plan was shifted by emergency #38. Do not resurrect old numbering by creating duplicate subsystems or reopening completed phases.

## Product operating principles

1. **Automation by default, human approval by exception, but launch permission is explicit.** Routine low-risk work may become autonomous only after its provider/policy launch gate is proven. Human approval/handoff is required for configured high-risk pricing, unusual discounts, payment/contract terms, complaints/legal claims, low confidence, exceptions, or owner-configured cases.
2. **No uncontrolled API spending.** Every paid provider passes runtime safety and Cost Guard before execution and records/reconciles usage after execution.
3. **No fake integrations.** `CONNECTED` means durable production E2E evidence. Credential presence alone is not connectivity.
4. **One source of truth per control.** Budget/quota thresholds live in `cost_guard_settings`; emergency runtime state lives in `system_controls`; pricing remains in existing pricing tables; provider state remains in `integration_connections`. Do not revive legacy duplicate controls such as `system_controls.monthly_budget_usd` as operational inputs.
5. **Do not hardcode business controls that operators must change.** Use existing database settings/config JSON and Control Center surfaces where practical.
6. **Respect recipient-local time and channel policy.** Existing market/outreach windows, DNC/suppression, channel pause, provider policy and reputation safeguards are hard gates.
7. **Localized communication without fake certainty.** Use appropriate market language/tone; if dialect confidence is weak, prefer natural neutral language rather than invented specificity.
8. **Original + Persian operator view.** Preserve original customer content and useful Persian translation/summary/intent for the owner where relevant.
9. **No autonomous platform abuse.** Instagram cold DM and marketplace auto-apply remain policy-aware/semi-manual where required. WhatsApp/email must honor provider policy, consent/opt-out, DNC and reputation safeguards.
10. **No blind retry across paid or externally visible boundaries.** Use the existing journals/claims/caches described below.

## Canonical reliability boundaries

- Business identity: existing Google Place/domain dedupe.
- Google Place Details: `discovery_records` journal; completed replay, PROCESSING/FAILED fail closed against blind rerun.
- Website audit: TTL cache + quota + unique one-RUNNING-per-business guard.
- Inbound AI: caller idempotency key + `agent_runs.request_key/result_payload`; completed replay; PROCESSING/FAILED keys do not blindly rerun AI.
- Voice: media transcription cache with failure/stale-processing recovery policy.
- Preview/content: stable `brief_hash` + organization/lead/brief uniqueness.
- Email/WhatsApp send: pre-provider claim; provider acceptance is final for resend safety, with later persistence failures reconciliation-only.
- Email inbound: signed Resend event identity + stable provider received-email identity; do not call paid AI directly from webhook retry delivery.
- Global kill switch: enforced before controlled provider operations.
- Agent pause: enforced from database state before AI execution; caller input cannot override it.

## Current safety defaults

These are runtime-editable defaults, not permanent constants:

- Canonical monthly paid-API budget: `$25`
- OpenAI: `$10`
- Google Places: `$5`
- Email: `$4`
- WhatsApp: `$3`
- Reserve: `$3`
- Daily new leads: `50`
- Daily website audits: `15`
- Daily deep AI runs: `10`
- Max AI runs per lead: `20`
- Max voice duration: `180 seconds`
- Automatic retry ceiling: `1`
- Website audit cache: `30 days`
- Warning / throttle / critical / hard stop: `70 / 85 / 95 / 100%`

Large budget/quota increases require explicit confirmation and audit logging. The legacy System monthly-budget field is not a second source of truth.

## Current provider launch state

Read `docs/CURRENT_STATE.md` and `docs/INTEGRATION_INVENTORY.md` for the exact evidence IDs. Current production truth after the 2026-08-31 controlled verification is:

- Google Places / Discovery: production-evidenced CONNECTED.
- OpenAI / AI: production-evidenced CONNECTED.
- Meta / WhatsApp: production-evidenced CONNECTED. Real inbound → Agent → Shadow Approval → owner approval → canonical Catalog send → SENT → DELIVERED → READ is proven for the INTERNAL_TEST path.
- Email Provider / Resend: production-evidenced CONNECTED. Real outbound delivery and real custom-domain inbound to `hello@smartvisionsai.com` through Resend Receiving are proven.
- Email receiving DNS: root MX is configured and Resend-verified; sending DKIM/SPF remain verified; DMARC exists with `p=none`.
- Crawl4AI / Audit: code-ready but production NOT_CONFIGURED; optional for V1 because deterministic website audit exists.
- Meta / Instagram: NOT_CONFIGURED; there is no production page-monitoring/DM runtime. Keep restricted automation semi-manual/policy-aware and feed any later permitted source into the existing Hunter/CRM.
- Redis / Queue: OPTIONAL / NOT_CONFIGURED. Do not add merely because queues are fashionable.
- Shadow Mode: remains ON. Controlled provider proof is not permission for broad autonomous outbound.

Known post-transport Agent gap: Email webhook persistence currently does not itself run paid Agent intelligence, and the canonical AI endpoint does not yet fully hydrate conversation history/Knowledge Base/operator prompt settings. Close those gaps later by wiring existing primitives, not by building another agent stack.

## Engineering rules

- Work through isolated branches and PRs.
- Never merge with failing install, lint, typecheck, tests or build.
- Merge with expected head SHA so a moving branch cannot slip through the gate.
- Prefer least privilege. Never fix authorization errors with broad grants.
- Supabase DDL/policy/grant changes require a migration and production verification.
- Run Supabase Security and Performance Advisors after final DDL/RLS changes.
- Secrets stay in Vercel/Supabase/provider secret stores. Never commit tokens, API keys, passwords, webhook secrets or service keys.
- Server-paid operations use server-only credentials.
- Preserve idempotency, audit logging, DNC/suppression, human takeover, retry ceilings, Cost Guard and kill/pause controls.
- Any newly activated paid provider needs: runtime-safety preflight, Cost Guard/provider quota, explicit retry semantics, usage evidence and visible health state.
- Extend existing primitives before adding schema or services. No duplicate CRM, pricing, conversations, agents, previews, Cost Guard or integration state.
- Do not describe untested work as production-verified. Use `implemented`, `configured`, `tested`, `READY`, or `CONNECTED` accurately.
- Do not run paid smoke tests just to refresh a dashboard badge when durable evidence already proves the provider works.
- Historical failed rows are evidence, not visual clutter. Do not delete them merely to make dashboards look clean.

## Definition of done

A feature/closure item is complete only when applicable items are satisfied:

- schema/migration and RLS/permissions are correct;
- server action/API/runtime works;
- existing UI supports useful operation without decorative duplication;
- validation/failure states are usable and fail closed;
- meaningful operator changes are audited;
- paid work is runtime-safety + Cost Guard protected;
- idempotency/retry behavior is explicit;
- tests cover important business/safety logic;
- install/lint/typecheck/tests/build are green on the exact final head;
- migrations are applied and Advisors reviewed if schema changed;
- Vercel Preview is READY on the exact final head;
- review threads are resolved/absent;
- merge uses expected head SHA;
- exact merge commit is READY in Production;
- `docs/CURRENT_STATE.md` reflects the resulting truth.

## Immediate continuation rule

At the start of a new chat/session, **do not invent another roadmap**. Read `docs/CURRENT_STATE.md`, verify the referenced commit/PR/deployment/database state, then continue only the listed real gap.

Current controlled launch sequence after the verified WhatsApp and custom-domain Email transport milestones:

1. one real controlled WhatsApp Voice transcription using the existing OpenAI + media-cache path;
2. Preview generate → share/send → public view E2E;
3. Crawl4AI only if configured/needed;
4. smallest safe remaining suppression/bounce/unsubscribe evidence;
5. five Shadow Mode behavior scenarios;
6. close the existing Agent intelligence wiring gaps required for safe multi-turn autonomous advisory behavior;
7. only then an explicit owner decision about a tiny Oman pilot and automation level.

Do not wire provider webhook retries directly to paid Agent execution merely to make a demo feel automatic. Use the existing idempotent internal/owner-controlled boundaries, prove them, then automate only after the behavior is safe.
