# Smart Visions Growth OS — Execution Playbook

This file defines how future work must be executed so progress stays clean across chats/engineers.

## 1. Start-of-session checklist

Before writing code:

1. Read `AGENTS.md`.
2. Read `docs/CURRENT_STATE.md`.
3. Read the relevant phase in `docs/MASTER_PLAN.md`.
4. Inspect current `main`, open PRs, recent CI, relevant migrations and production status.
5. Verify any claimed provider connection or deployment rather than assuming it from old chat text.
6. Continue from the first unfinished dependency unless the owner explicitly changes priority.

## 2. Branch and PR discipline

- One coherent goal per branch/PR.
- Use descriptive branches such as `feat/business-hunter-google-places` or `fix/whatsapp-webhook-signature`.
- Keep production stable while PR work is in progress.
- Do not merge when CI is red.
- Required CI before merge: lint, typecheck, tests, build.
- When a PR changes database schema/policies/grants, review migration content before applying it to production.
- When possible, merge with a clean/squashed history after checks pass.

## 3. Database changes

For DDL, RLS, grants, triggers or indexes:

1. Add an ordered SQL migration under `supabase/migrations/`.
2. Prefer least privilege.
3. Avoid hardcoding generated production IDs into schema migrations.
4. Apply the migration to production only after code review/CI when the app depends on it.
5. Run Supabase Security Advisor after RLS/grant changes.
6. Run Performance Advisor after schema/index changes.
7. Verify the exact production behavior with a minimal query or controlled UI flow.
8. Update `docs/CURRENT_STATE.md`.

Never solve a 403 by broadly granting all privileges without understanding the caller role. Example precedent: Cost Guard backend only needs SELECT on settings and SELECT/INSERT on usage events.

## 4. External integration lifecycle

Every paid/external provider goes through these states:

`NOT_CONFIGURED → CONFIGURED/READY → SMOKE_TESTED → PRODUCTION_VERIFIED`

Do not skip terminology.

For each provider:

1. Add only server-side secret placeholders to `.env.example`; never commit real values.
2. Add/verify Cost Guard provider allocation.
3. Add a preflight paid-operation guard.
4. Add timeout and retry ceiling.
5. Add usage/cost recording.
6. Add provider health status.
7. Add a low-risk owner-only smoke test.
8. Run smoke test once.
9. Inspect provider/Supabase/Vercel logs if it fails; do not spam retries.
10. Only then enable the feature in real acquisition/conversation flows.

## 5. Cost-control rules

Before any paid operation:

- Load organization Cost Guard settings server-side.
- Calculate total/monthly provider consumption.
- Check global mode and provider-specific budget.
- Check daily/lead/channel quota when relevant.
- Check whether the operation is low/normal/high/critical priority.
- Fail closed if budget state cannot be determined.

After successful paid operation:

- Record provider, operation, organization, lead/campaign if relevant, units/tokens, estimated cost, timestamp and useful metadata.

Optimization rules:

- deterministic code before LLM;
- cheap model before expensive model;
- deep analysis only for qualified leads;
- cache stable data;
- never re-transcribe the same media unnecessarily;
- rolling conversation summary + recent turns, not entire history;
- at most configured automatic retries;
- stop paid work on DNC/lost/spam/unqualified leads;
- do not generate personalized demos for weak leads.

## 6. AI agent changes

When modifying agents:

- Keep structured input/output contracts.
- Agent output must never directly bypass policy/pricing/send controls.
- Customer-facing reply is generated only after configured service/price/risk constraints are available.
- Specialist agents should be invoked conditionally, not mechanically.
- Store compact agent result/trace, not private chain-of-thought.
- Maintain Persian operator-facing summary/translation fields.
- If language/dialect confidence is low, prefer neutral safe language over invented certainty.
- Model selection must respect runtime Cost Guard/model-routing settings.

## 7. Conversation automation rules

Before sending any automated customer message, verify:

- conversation is not human-locked;
- lead/contact is not DNC/suppressed;
- channel is not paused;
- global kill switch is off;
- local send window permits the send;
- rate/frequency limit permits the send;
- campaign/sequence is active;
- customer has not already replied in a way that stops the sequence;
- current action does not require approval;
- confidence is high enough;
- price/discount is valid;
- Cost Guard permits any paid work involved.

After send, record message/status/idempotency key and update conversation stage.

## 8. Human approval/handoff boundary

Do not make the owner approve routine answers. Route to `REVIEW` or `HANDOFF` when, for example:

- discount exceeds automatic ceiling;
- custom pricing/payment/contract terms are requested;
- complaint/refund/legal threat appears;
- customer asks for a commitment outside configured services;
- AI confidence drops below configured threshold;
- policy/provider constraint is ambiguous;
- account/security/privacy request needs a human decision;
- customer explicitly asks for a human;
- final closing step is configured to require operator confirmation.

When handoff is active, AI send is hard-locked until explicitly released.

## 9. Localization test matrix

Before expanding a market, manually review sample messages for:

- Oman — Omani Arabic and English.
- UAE — Emirati/Gulf Arabic and English.
- Saudi — Saudi Arabic and English.
- Qatar — Qatari/Gulf Arabic and English.
- UK — British English.
- USA — American English.
- Persian inbound.
- Urdu/Hindi inbound.
- Indian/Pakistani English.
- mixed-language voice/text.

Message quality criteria: concise, natural, useful, specific to the business, no generic AI filler, no fake familiarity, no cultural overconfidence.

## 10. Production verification template

After a feature deploy, record in `docs/CURRENT_STATE.md`:

- PR number and merge status.
- Migration name/status if relevant.
- Vercel production result.
- Supabase advisor result if relevant.
- Provider smoke-test result.
- What is implemented vs merely configured.
- Any known issue.
- **Exact next action.**

Use language like:

- `Implemented` = code exists and CI is green.
- `Configured` = credentials/settings exist.
- `Smoke-tested` = controlled provider call worked.
- `Production-verified` = end-to-end production behavior and persistence were verified.

Do not collapse those into one vague `done`.

## 11. Failure procedure

When production fails:

1. Stop repeated user clicks/retries if the action spends money or sends messages.
2. Record timestamp and affected route/action.
3. Check Vercel function/deployment logs.
4. Check Supabase API/Auth/Postgres logs if database/auth is involved.
5. Check provider logs/status if external API was reached.
6. Confirm whether the request reached each boundary in order.
7. Fix the narrowest root cause.
8. Add regression test where practical.
9. Run full CI.
10. Deploy/migrate.
11. Re-run one controlled test.
12. Update current-state documentation.

## 12. Completion gate before autonomous outreach

Do not broadly enable autonomous outreach until all are true:

- discovery source is production-verified;
- dedup is verified;
- lead scoring is explainable;
- DNC/suppression works;
- send window works using recipient timezone;
- channel daily limits work;
- Cost Guard works under simulated limit conditions;
- reply ingest stops follow-up sequences;
- human takeover hard-lock works;
- pricing/discount enforcement works;
- locale samples were reviewed;
- provider status/error handling is visible;
- pilot sample has been reviewed in Shadow Mode.

## 13. Documentation maintenance

After every meaningful phase/PR:

- check completed boxes in `docs/MASTER_PLAN.md`;
- update `docs/CURRENT_STATE.md` with exact production state and next action;
- update `AGENTS.md` only if a durable architectural/business rule changes;
- update `.env.example` only with names/placeholders, never secrets;
- keep the GitHub master tracking issue synchronized with major phase completion.

This documentation is part of the product. A future session that cannot determine the next safe action from the repository is considered a documentation failure.
