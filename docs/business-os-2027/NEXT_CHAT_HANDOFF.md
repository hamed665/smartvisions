# Smart Visions AI Business OS 2027 — Next Chat Handoff

## Purpose

This file is the canonical handoff for continuing the Business OS 2027 work in a new ChatGPT/Codex/Claude session.

The next session must **continue from repository evidence**, not reconstruct the plan from chat memory.

## Repository

- Repository: `hamed665/smartvisions`
- Existing product: **Smart Visions Growth OS**
- Business OS architecture branch: `architecture/business-os-2027-foundation`
- Foundation PR: **#172**
- Production branch: `main`
- Production must not be modified merely because this handoff exists.

## Read before changing anything

Read in this order:

1. `AGENTS.md`
2. `docs/CURRENT_STATE.md`
3. `docs/EXECUTION_PLAYBOOK.md`
4. `docs/business-os-2027/README.md`
5. `docs/business-os-2027/MASTER_ARCHITECTURE.md`
6. `docs/business-os-2027/IMPLEMENTATION_MAP.md`
7. `docs/business-os-2027/SERVICE_CONTRACT_STANDARD.md`
8. `docs/business-os-2027/STATE_EVENT_CATALOG.md`
9. `docs/business-os-2027/MIGRATION_FROM_GROWTH_OS.md`
10. PR #172 status, changed files, CI and review threads
11. current `main` SHA and latest Production evidence

If documentation conflicts with runtime/Production evidence, runtime/Production wins. Reconcile docs after proven changes.

## Owner-approved product target

Build **Smart Visions AI Business OS 2027** as a:

> Multi-Tenant, Multi-Brand, Multi-Branch, Multi-Industry, Omnichannel AI Business Operating System

It must ultimately cover:

- WhatsApp, Instagram, Facebook, TikTok, Telegram, Email, Web, SMS/RCS, Voice and custom channels;
- native-app coexistence, so humans can still answer inside original channel apps while Smart Visions remains synchronized;
- Unified Inbox and Human/AI reply arbitration;
- complete CRM and Customer 360;
- Business Digital Twin and Industry Packs;
- strong business/customer memory;
- governed Knowledge/RAG;
- multi-agent AI runtime;
- Policy Engine, Action Gateway and Approvals;
- durable Workflows;
- Sales, Quotes, Booking, Commerce, Payments, Support/Case and Field Service;
- Marketing, Consent and customer-facing paid Lead Hunter;
- full SaaS plans, subscriptions, entitlements, setup fees, channel fees and usage billing;
- AI customer billing based on billable raw AI cost × configurable multiplier, initially 4x;
- reporting/BI, XLSX/CSV/PDF/JSON and Google Sheets sync;
- role-aware web/mobile apps;
- professional Smart Visions Super Admin Command Center;
- Enterprise SSO/SCIM, multi-region/cell architecture, marketplace, partner/reseller and developer platform.

## Critical rule: extend, do not duplicate

The current Growth OS already contains production-proven primitives. Reuse or extend them.

Do **not** build a second version of these unless real production evidence proves the existing primitive cannot satisfy the requirement:

- Lead/Business/Campaign/Conversation CRM foundation;
- Hunter / Google Places discovery;
- qualification/service-fit logic;
- Website Audit;
- existing multi-agent pipeline;
- Context Hydrator;
- conversation memory and `sales_state`;
- `knowledge_versions`;
- `prompt_versions`;
- ZERO_COST / LIGHT / FULL routing;
- OpenAI model router;
- Cost Guard;
- canonical provider-bound outbound send gate;
- WhatsApp/Email journals and idempotency;
- `agent_runs.request_key`;
- follow-up/automation primitives;
- Telegram owner assistant/control plane;
- Portfolio matcher and Preview infrastructure.

Every proposed subsystem must be classified:

- `REUSE`
- `EXTEND`
- `ADAPT`
- `MIGRATE`
- `NEW`

`REPLACE` requires explicit evidence and justification.

## Immediate next task

Do **not** jump ahead to Booking, Mobile, Marketplace, or another Agent.

First finish and verify Phase 0 / PR #172, then begin the first implementation slice:

# Control Plane Foundation

Target hierarchy:

```text
Organization
  -> Brand
      -> Business
          -> Branch
              -> Department
                  -> Team
                      -> User
```

The first implementation slice must define and implement backward-compatibly:

1. canonical tenant/business scope;
2. Organization/Brand/Business/Branch hierarchy;
3. configuration inheritance;
4. IAM role/permission boundary;
5. Entitlement contract;
6. Plan/Subscription/Pricing Version contract;
7. usage classification;
8. audit correlation standard;
9. feature-flag scope;
10. compatibility mapping from existing Growth OS organization/business records.

## Before writing code for Control Plane

Inspect the current production schema and code. Identify:

- existing organization tables;
- business/lead/customer relationships;
- current auth/RLS model;
- current roles;
- current plan/billing concepts if any;
- current Cost Guard ownership;
- current audit/logging primitives;
- all code that assumes one organization/business shape.

Produce a short gap map:

```text
CURRENT
TARGET
REUSE/EXTEND/NEW
MIGRATION RISK
BACKWARD-COMPATIBILITY PLAN
```

Do not invent a new table when an existing canonical table can be safely extended.

## Required implementation contract

For every new/changed domain, follow `SERVICE_CONTRACT_STANDARD.md`.

At minimum specify:

- Source of Truth
- commands
- queries
- events produced/consumed
- state transitions
- permissions
- idempotency
- failure modes
- audit
- billing impact
- retention
- SLO/metrics
- tests

## Architecture invariants

Never violate these:

1. Tenant data must never leak across businesses.
2. Human reply takes priority over AI.
3. AI cannot call payment/channel/business side effects directly; use Action Gateway.
4. AI cannot silently modify canonical Business Truth.
5. All critical external sends/actions are idempotent and fail closed.
6. Provider acceptance with ambiguous result is reconciled, not blindly retried.
7. Billing comes from durable usage evidence.
8. System retries/internal/cached/promotional work are distinguishable from customer-billable usage.
9. Heavy analytics must not depend on expensive transactional dashboard queries.
10. Every important mutation is audited.
11. Every critical entity has a formal state machine.
12. No cross-tenant memory retrieval.
13. Current Shadow Mode / safety state is not disabled as part of Business OS foundation work.
14. No broad autonomous outreach is enabled by architecture work.

## Production safety

Until the owner explicitly approves a later release:

- do not change Production outreach autonomy;
- do not disable Shadow Mode;
- do not send real customer messages for architecture verification;
- do not change live pricing;
- do not change live channel credentials;
- do not apply unsafe DB migrations;
- do not create a second queue/CRM/Agent/Knowledge system for convenience;
- do not merge with failing CI.

Work through isolated branches and coherent PRs.

## First implementation PR expected after foundation

Suggested scope:

> `feat/business-os-control-plane-foundation`

Keep it narrowly focused.

Expected outputs:

- reviewed domain/gap map;
- backward-compatible schema migration(s), if needed;
- typed organization/brand/business/branch domain model;
- tenant scope helpers;
- configuration inheritance primitive;
- entitlement interface/model;
- permission checks;
- audit/correlation support;
- contract tests and tenant-isolation tests;
- docs update.

Do not combine Omnichannel, CRM v2, Billing UI, Mobile or Agent redesign into this PR.

## Verification required

Before claiming the slice complete:

- lint green;
- typecheck green;
- tests green;
- build green;
- relevant migration reviewed;
- tenant isolation tests pass;
- existing Growth OS behavior remains compatible;
- no duplicate source of truth introduced;
- no Production send/provider behavior changed;
- PR review threads resolved;
- exact head SHA known;
- docs updated with the exact next action.

## How to continue after Control Plane

Follow `IMPLEMENTATION_MAP.md` in dependency order:

1. Control Plane
2. Omnichannel Adapter Boundary
3. Customer 360 / CRM
4. Business Twin / Industry Packs
5. AI Control Plane
6. Memory v2
7. Workflow + operational modules
8. Billing/commercial platform
9. Analytics/BI/Sheets
10. customer-facing paid Hunter
11. Enterprise/ecosystem
12. Mobile/customer-facing surfaces

Do not skip dependency layers just to create visible UI faster.

## Communication to the owner

The owner wants production-grade work, not placeholder file counts.

For each work package, report clearly:

- what was inspected;
- what already existed;
- what was reused;
- what changed;
- what remains;
- tests/CI status;
- whether Production was touched;
- exact next implementation step.

Never call something "complete" merely because a page or schema stub exists.

## Instruction for the next chat

Continue the project autonomously from repository evidence. Do not ask the owner to repeat architecture already recorded here. Do not propose a new roadmap unless repository evidence invalidates this one.

Start by verifying PR #172 and current `main`, then execute the next safe unfinished dependency.
