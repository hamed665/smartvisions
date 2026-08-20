# Smart Visions Growth OS — Mandatory Agent Handoff

> **Read this file before changing code, database schema, infrastructure, integrations, outreach policy, AI behavior, pricing, or production settings.**

## Source of truth

The project must be continued from the repository state, not from memory or assumptions. Before starting work, read these files in order:

1. `AGENTS.md` — non-negotiable project rules and current priorities.
2. `docs/CURRENT_STATE.md` — exact production status and the next unfinished task.
3. `docs/MASTER_PLAN.md` — complete product scope and completion roadmap.
4. `docs/EXECUTION_PLAYBOOK.md` — how changes must be implemented, tested, migrated, deployed, and handed off.
5. `.env.example` — integration contract. Never place real secrets in GitHub.

If chat history conflicts with repository documentation, verify the current code, migrations, Supabase state, and deployment before acting. Update `docs/CURRENT_STATE.md` after every meaningful production change.

## Project identity

- Repository: `hamed665/smartvisions`
- Product: **Smart Visions Growth OS**
- This repository is completely separate from DrKhaleej. Never modify the DrKhaleej repository for Smart Visions work.
- Frontend/control plane: Next.js on Vercel.
- Database/Auth: Supabase.
- Production database project ref: `pkypexzpyfbikdnkrzvw`.
- Main product UI language: **English**.
- Operator-facing explanations, reports, conversation translations, summaries, alerts, and handoff context for the owner: **Persian**.

## Product operating principles

1. **Automation by default, human approval by exception.** The owner cannot sit behind the panel all day. Routine, low-risk work should proceed automatically. Human approval/handoff is reserved for high-risk pricing changes, unusual discounts, custom contractual/payment terms, complaints/legal claims, low-confidence decisions, policy exceptions, or explicitly configured cases.
2. **No uncontrolled API spending.** Every paid provider must pass Cost Guard before execution and record usage afterward. Paid operations fail closed if Cost Guard cannot be evaluated.
3. **No fake integrations.** A UI card may show `NOT CONFIGURED`, `READY`, `DEGRADED`, or `CONNECTED`, but must never imply a provider is active before an end-to-end test succeeds.
4. **Do not hardcode business controls.** Budgets, quotas, market settings, prices, discount ceilings, agent thresholds, runtime safety switches, and outreach windows should be editable from the Control Center and stored in Supabase whenever practical.
5. **Respect local time.** Automated outbound messages are constrained to **09:00–19:00 in the recipient market's local timezone**, unless the owner explicitly changes the market policy in the panel.
6. **Localized communication.** Oman, UAE, Saudi Arabia, Qatar, UK, USA and future markets use the appropriate language/tone. Oman uses Omani Arabic where confidence is high, UAE Emirati Arabic, Saudi Saudi Arabic, Qatar Qatari/Gulf Arabic. If dialect confidence is low, use natural Gulf-neutral Arabic rather than pretending certainty. UK and USA use their respective natural English tone.
7. **Multilingual inbound intelligence.** Text and voice may arrive in Arabic dialects, English variants, Persian, Urdu, Hindi, Pakistani/Indian English, or mixed language. Detect language/dialect conservatively, transcribe voice once, cache transcript, provide Persian operator brief, and reply in the customer's appropriate language/style.
8. **Original + Persian view.** Preserve original customer content. Operator views should show original message, Persian translation, Persian summary, intent, sentiment, stage, relevant risk flags, and the Persian translation of any generated outgoing reply.
9. **Conversation inbox must remain operationally useful.** Core categories include New/Unread, Active Conversation, Closing/Finalizing, Waiting for Customer, Unanswered, Hot Lead, Needs Human, Follow-up Due, Won, Lost/Not Interested, Do Not Contact, Spam/Low Quality, and Paused. Classification should be automatic and explainable.
10. **No autonomous platform abuse.** Do not implement unsafe bulk/cold automation that violates provider/platform terms. Instagram cold DM and marketplace auto-apply should remain policy-aware/semi-manual where required. WhatsApp and email workflows must honor applicable provider rules, consent/opt-out requirements, DNC, send windows, and reputation safeguards.

## Current safety defaults

These are defaults, not permanent constants. The owner can change them from the panel:

- Monthly total paid-API budget: `$25`
- OpenAI: `$10`
- Google Places: `$5`
- Email: `$4`
- WhatsApp: `$3`
- Reserve: `$3`
- Daily new leads: `50`
- Daily website audits: `15`
- Daily deep AI runs: `10`
- Max AI runs per lead before escalation/value check: `20`
- Max voice duration: `180 seconds`
- Automatic retry ceiling: `1`
- Website audit/cache default: `30 days`
- Warning: `70%`
- Throttle: `85%`
- Critical: `95%`
- Hard stop: `100%`

Cost settings are runtime-editable. Large increases must require explicit confirmation and be audit logged.

## Engineering rules

- Work through isolated branches and pull requests.
- Never merge a PR with failing lint, typecheck, tests, or build.
- Prefer least privilege. Do not fix authorization errors by broadly granting access.
- For Supabase DDL/policies/grants, add a migration in `supabase/migrations/` and apply it to production only after review/CI.
- After DDL/RLS work, run Supabase security and performance advisors.
- Secrets stay in Vercel/Supabase/provider secret stores. Never commit real tokens, API keys, passwords, webhook secrets, or service keys.
- Server-paid operations must use server-only credentials and must not expose privileged keys to the browser.
- Preserve idempotency, audit logging, DNC/suppression, human takeover lock, retry limits, and kill switches.
- Any new paid provider must implement: preflight budget check, provider quota check, retry policy, usage recording, and visible integration health.
- Avoid duplicate CRMs, duplicate lead tables, duplicate conversation models, or parallel configuration systems. Extend existing primitives first.
- Do not describe untested functionality as complete. Mark it `implemented`, `configured`, `tested`, or `production-verified` accurately.

## Definition of done for a feature

A feature is not complete because a page exists. It is complete only when applicable items are satisfied:

- Data model/migration exists and RLS/permissions are correct.
- Server action/API/runtime is implemented.
- UI supports useful read/write operation, not decorative statistics only.
- Validation and error states are usable.
- Audit log is written for meaningful operator changes.
- Cost Guard is enforced if the feature can spend money.
- Tests cover important policy/routing/business logic.
- `lint`, `typecheck`, `tests`, and `build` are green.
- Supabase migration is applied if required.
- Vercel production deployment is healthy.
- Integration smoke test is successful if external providers are involved.
- `docs/CURRENT_STATE.md` is updated with exact status and next action.

## Immediate continuation rule

At the start of a new chat/session, **do not invent a new roadmap**. Read `docs/CURRENT_STATE.md`, verify the referenced PR/commit/deployment/database state, and continue from the first unchecked item in `docs/MASTER_PLAN.md` unless the owner explicitly changes priority.
