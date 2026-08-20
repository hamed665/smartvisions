# Smart Visions Growth OS

AI-assisted sales and growth operating system for business discovery, intent-led acquisition, localized outreach, multi-agent sales intelligence, human handoff, reporting, cost-controlled automation, and premium business preview generation.

## Mandatory continuation docs

Before changing the project, read these in order:

1. [`AGENTS.md`](./AGENTS.md) — non-negotiable architecture, product and operating rules.
2. [`docs/CURRENT_STATE.md`](./docs/CURRENT_STATE.md) — exact production status and the next unfinished action.
3. [`docs/MASTER_PLAN.md`](./docs/MASTER_PLAN.md) — complete end-to-end completion roadmap.
4. [`docs/EXECUTION_PLAYBOOK.md`](./docs/EXECUTION_PLAYBOOK.md) — branch/PR, migration, integration, Cost Guard, testing and production handoff procedure.

The repository state and these documents are the source of truth across chats. Do not reconstruct the roadmap from memory.

## Current high-level status

Foundation, Control Center, Auth, Supabase, conversation intelligence, Persian operator brief, runtime safety, Cost Guard and cost-aware OpenAI runtime are implemented and deployed. External acquisition/messaging integrations are being production-verified progressively.

See `docs/CURRENT_STATE.md` for the exact next action before starting new work.

## Engineering rule

Product work is developed through isolated pull requests. A feature is not considered complete merely because a UI page exists; applicable runtime, security, Cost Guard, tests, migrations, production deployment and smoke-test requirements must also pass.
