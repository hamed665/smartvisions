# Smart Visions AI Business OS 2027 — Delivery Packaging Standard

## Purpose

This document defines how the full Business OS roadmap is packaged into implementation changes without turning GitHub Pull Requests into the roadmap itself.

The roadmap unit remains:

`SECTION -> WORK PACKAGE ID -> verified runtime gap -> implementation evidence -> acceptance gate`

A Pull Request is only an implementation/evidence container. It is not a phase, milestone, completeness score, or future numbering system.

The delivery objective is to finish the complete approved architecture with materially less PR fragmentation than a one-work-package-per-PR model, while preserving the same Production, security, rollback, audit, CI, and verification standards.

## Non-negotiable completeness rule

Delivery compression must never be achieved by removing scope.

Every Work Package in `MASTER_PROGRAM_SECTIONS.md` remains in force unless a later evidence-backed architecture decision explicitly marks it as:

- already satisfied by a canonical Production primitive;
- merged into another Work Package because both are the same bounded capability;
- intentionally deferred because an external provider/API does not actually support the capability;
- replaced by a stronger canonical implementation with documented migration/compatibility evidence.

No Work Package may disappear merely to reduce implementation volume.

Completion is measured by satisfied Work Package acceptance criteria and Section exit gates, not by the number of PRs merged.

## Packaging model

Prefer coherent vertical implementation slices over tiny horizontal fragments.

A delivery package may include multiple adjacent Work Packages when all of the following are true:

1. they belong to the same bounded context or a directly dependent boundary;
2. they share the same source-of-truth ownership;
3. they can be reviewed with one understandable threat/failure model;
4. they can be tested through one coherent integration story;
5. they can be promoted and rolled back safely as one unit;
6. they do not require independent Production approval gates;
7. they do not create an oversized review surface that obscures security, money movement, tenant isolation, or provider side effects.

Examples of good consolidation:

- API contract + persistence + RBAC/RLS + audit + tests + UI for one bounded feature;
- identity projection + reconciliation when both use the same canonical identity contract;
- booking catalog + availability read model when they share the same scheduling truth and rollback boundary;
- analytics metric registry + dashboard read model when no OLTP mutation or customer billing boundary is crossed.

Examples of bad consolidation:

- tenant authorization changes mixed with unrelated UI redesign;
- payment execution mixed with general analytics;
- several unrelated providers activated in one change;
- destructive data migration mixed with broad feature development;
- Chatwoot provider activation mixed with unrelated CRM schema work.

## Default consolidation rule

When safe, include the full engineering story in the same delivery package:

- gap/evidence audit;
- schema or storage change;
- API/service contract;
- authorization and tenant isolation;
- runtime implementation;
- UI where required for the feature to be real;
- audit/event/metric hooks;
- idempotency/retry/reconciliation semantics;
- tests;
- migration and rollback evidence;
- operator documentation.

Do not create a separate audit PR, implementation PR, hardening PR, index PR, and documentation PR by habit.

Split them only when a real independent gate exists.

## Mandatory split boundaries

A separate delivery package is justified when fresh evidence shows one of these boundaries:

- a destructive or high-risk migration needs isolated review or rollout;
- a Production provider/account/channel must be activated separately from code deployment;
- a payment or financial side effect needs its own approval and reconciliation gate;
- authentication, RLS, tenant isolation, or privileged-secret handling needs an independently reviewable security boundary;
- a public API compatibility boundary must be versioned independently;
- a third-party platform requires staged certification/approval;
- a rollback or data backfill cannot safely share the feature deploy;
- runtime evidence exposes a defect after promotion that could not reasonably have been known before merge.

Follow-up hardening is evidence-driven, not pre-scheduled.

## Section execution rule

Within a Section, order Work Packages by dependency and runtime risk rather than document order alone.

Prefer this shape:

`foundation -> canonical data contract -> execution path -> reconciliation -> operator/customer surface -> section acceptance`

Do not advance the Section cursor merely because code exists. Advance only when the relevant acceptance gate is satisfied in the real environment.

Cross-Section bundling is allowed only when a feature is impossible to complete cleanly otherwise and the shared dependency is explicit. Do not use cross-Section bundling to hide unfinished ownership decisions.

## Architecture preservation rules

Packaging must preserve all existing architecture invariants:

- Smart Core remains authoritative for tenant/business/customer/CRM truth and provider-action safety.
- Chatwoot remains the Communication Plane.
- Existing canonical CRM, Knowledge, Memory, Agent, workflow, audit, billing-usage and provider-journal primitives are extended rather than duplicated.
- Tenant isolation is structural and fail-closed.
- Human activity overrides AI.
- AI never directly owns provider or financial side effects.
- Provider mutations use idempotency and reconciliation.
- Ambiguous provider acceptance is never blindly retried.
- Paid work remains Cost Guard governed.
- Material mutations remain audited.
- Production/runtime evidence outranks planning documents.

## Review-size rule

A larger coherent delivery package is preferred to several tiny PRs, but "larger" does not mean unbounded.

Split a package if a reviewer can no longer answer these questions quickly:

- What canonical data does this change own or extend?
- What can this change mutate?
- Which tenant can access it?
- What external side effects can occur?
- What happens on replay, timeout, partial failure, or rollback?
- Which tests prove the important invariants?
- What Production evidence proves completion?

If those answers become unclear because too many unrelated changes are combined, the package is too large.

## Documentation rule

Documentation is part of implementation, not a ceremonial follow-up.

Update architecture, runbook, state/event contracts, current-state notes, and handoff material in the same delivery package whenever the facts are already knowable before merge.

A separate Production closeout update is used only when the required facts can exist only after Production promotion, such as:

- a real Worker/runtime version;
- a Production migration result;
- provider/account acceptance;
- backup/restore evidence;
- live reconciliation evidence.

Do not create docs-only PRs merely to repeat facts already known in the implementation PR.

## Traceability rule

Every completed capability must remain traceable from:

`Section -> Work Package -> implementation evidence -> exact merge SHA -> migration/deploy evidence -> Production verification`

The program must be auditable without relying on chat memory.

Actual PR numbers are recorded only after they exist.

No future PR number or PR-count forecast is authoritative project structure.

## Definition of done

A delivery package is complete only when every applicable item is satisfied:

- canonical ownership is explicit;
- schema/storage and migrations are correct;
- RLS/RBAC/permissions are least-privilege and tenant-safe;
- API/runtime behavior is real;
- required UI/operator surface is functional;
- idempotency, retry and reconciliation are explicit;
- failure states fail closed;
- material mutations are audited;
- events/metrics/billing implications are handled;
- Cost Guard applies where paid work can occur;
- meaningful tests cover happy path and failure boundaries;
- lint/typecheck/test/build and applicable Worker/Vinext checks are green;
- review threads are resolved;
- rollback/recovery is understood and proven where relevant;
- Production promotion uses exact verified code;
- Production verification passes;
- Section/Work Package status and handoff are reconciled.

## Owner delivery preference

The owner prefers a compact, high-throughput implementation program rather than one PR per Work Package.

Honor that preference by consolidating compatible work into complete vertical slices.

Do not turn that preference into a hard PR cap, and never trade away architecture, security, rollback safety, testing, observability, or approved product scope to make an arbitrary count look good.
