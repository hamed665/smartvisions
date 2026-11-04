# Smart Visions Growth OS

AI-assisted sales and growth operating system for business discovery, intent-led acquisition, localized outreach, multi-agent sales intelligence, human handoff, reporting, cost-controlled automation, and premium business preview generation.

## Platform overview

**Maintainer:** [Hamed Minaei](https://github.com/hamed665)

Growth OS brings CRM, business discovery, controlled AI workflows and communication operations into a shared application. Its engineering design keeps model suggestions separate from authorization, spending and provider-side effects.

| Area | Source entry point |
| --- | --- |
| Operator application and HTTP routes | [app/](app/) |
| Agent context, orchestration and runtime | [lib/agents/](lib/agents/) |
| CRM and customer records | [lib/crm/](lib/crm/) |
| Database evolution and access policy | [supabase/migrations/](supabase/migrations/) |
| Chatwoot integration and operations | [lib/chatwoot/](lib/chatwoot/) · [Operations guide](ops/chatwoot/README.md) |
| Verification and release checks | [Package scripts](package.json) · [CI](.github/workflows/ci.yml) |

## Local development

Use a Node.js version compatible with [package.json](package.json) and a separate local/disposable configuration described in [.env.example](.env.example). Review the mandatory continuation documents before connecting any service.

```bash
git clone https://github.com/hamed665/smartvisions.git
cd smartvisions
npm ci
npm run dev
```

`npm run dev` starts the Next.js development server. Application features depend on their configured services; this repository is not a credential-free demo. Do not point a local review environment at production data or live messaging channels.

The repository exposes these verification commands:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Cloudflare runtime work also has Vinext and scheduled-bundle checks; the [execution playbook](docs/EXECUTION_PLAYBOOK.md) defines when they apply. These commands are instructions, not a claim that checks were rerun for this documentation update.

## Architecture and operations

Provider-bound actions use deterministic safety gates and durable state. Cost controls, idempotency, suppression and human takeover belong at the execution boundary. The current status, exact deployment evidence and activation requirements remain in [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md).

The corporate website is developed separately in `hamed665/smartvisions-website`. This repository's historical `website/` directory is frozen; it is not the current website development entry point.

## Mandatory continuation docs

Before changing the project, read these in order:

1. [`AGENTS.md`](./AGENTS.md) — non-negotiable architecture, product and operating rules.
2. [`docs/CURRENT_STATE.md`](./docs/CURRENT_STATE.md) — exact verified Production status, current main/deployment and the next unfinished gates.
3. [`docs/MASTER_PLAN.md`](./docs/MASTER_PLAN.md) — long-term product-scope map; older PR numbering inside it is historical and must not override `CURRENT_STATE.md`.
4. [`docs/EXECUTION_PLAYBOOK.md`](./docs/EXECUTION_PLAYBOOK.md) — branch/PR, migration, integration, Cost Guard, testing and Production handoff procedure.

The repository state, Production evidence, Issue #18 and these documents are the source of truth across chats. Do not reconstruct the roadmap from memory or repeat already-proven paid smoke tests.

## Current high-level status

The core Growth OS platform, Business Hunter, Google Places, OpenAI Agent runtime, WhatsApp, Email/Resend, Voice, Preview, multi-agent sales consensus, Telegram owner command plane, Cost Guard, selective paid-AI routing, provider-cost classification and atomic OpenAI/Google paid-budget reservations are implemented and Production-deployed.

Shadow Mode remains ON. The remaining launch work is primarily controlled behavior evidence, owner-alert E2E and a small reviewed Knowledge/brand corpus, not another architecture rewrite.

See `docs/CURRENT_STATE.md` before starting any new work.

## Engineering rule

Product work is developed through isolated pull requests. A feature is not complete merely because a UI page or code path exists; applicable runtime, security, Cost Guard, tests, migrations, Production deployment and durable evidence must also pass.
