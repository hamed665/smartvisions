# Control Plane Foundation — Evidence, Gap Map, and Domain Contract

Status: implementation branch `feat/business-os-control-plane-foundation`  
Base: `main@144906c8f72c368851f8c4efb3e85dff8627f863`

## 1. Runtime evidence used for this work package

This work package is based on current repository and Production evidence, not on stale chat state.

Observed Production facts before implementation:

- canonical tenant root is `organizations.id`;
- all important Growth OS runtime tables are already scoped by `organization_id`;
- `organization_members` is the existing user-to-tenant relationship and carries one of `OWNER | ADMIN | SALES_MANAGER | SALES_AGENT | VIEWER`;
- `is_org_member(uuid)` and `is_org_owner(uuid)` are the existing RLS membership primitives;
- current `businesses` rows are CRM/Hunter businesses discovered for leads, not tenant-owned operating businesses;
- current Production contains 1 organization, 1 organization member, 19 CRM businesses, and 19 leads;
- no Brand, Branch, Department, Team, Plan, Subscription, Entitlement, Feature Flag, or Pricing Version tables exist in Production;
- `organization_settings.config` is the existing organization-level configuration JSON;
- `usage_events.cost_usd` is the canonical raw/internal provider-cost ledger used by Cost Guard;
- `audit_logs` is the canonical organization audit table but does not yet carry correlation/causation or hierarchical scope;
- Production migrations are applied through `0067_outreach_provider_message_reconciliation.sql`;
- current runtime safety remains Shadow Mode ON and no part of this work package changes outbound gates or provider execution.

## 2. Canonical naming boundary

The Business OS hierarchy is:

```text
Organization -> Brand -> Business -> Branch -> Department -> Team -> User
```

Storage has one deliberate compatibility distinction:

- Business OS **Business** is stored in `tenant_businesses`.
- Existing `businesses` remains the Growth OS CRM/Hunter prospect-company table.

This is not duplicate source-of-truth ownership. The two entities represent different facts:

- `tenant_businesses`: businesses operated by the tenant.
- `businesses`: external/prospect/customer businesses known by CRM/Hunter.

Renaming or repurposing `businesses` is explicitly out of scope because current leads, Hunter, Google Places, website audit, outreach, and conversation workflows depend on its current meaning.

## 3. Gap Map

| Capability | CURRENT | TARGET | Decision | Migration risk | Backward-compatibility plan |
| --- | --- | --- | --- | --- | --- |
| Tenant root | `organizations` | canonical Organization | **REUSE** | Low | Keep IDs and all existing `organization_id` columns unchanged. |
| User identity | Supabase `auth.users` | User | **REUSE** | Low | Do not create a parallel user table. |
| Organization membership | `organization_members` + role | org-wide IAM membership | **EXTEND** | Medium | Existing role remains authoritative at Organization scope; add scoped assignments only below Organization. |
| CRM business | `businesses` used by leads/Hunter | external CRM business | **REUSE** | High if repurposed | Do not rename, reshape, or attach tenant hierarchy semantics in this PR. |
| Brand | none | Brand | **NEW** | Low | Additive table, no existing runtime dependency. |
| Tenant Business | none | Business under Brand | **NEW** | Low | Store as `tenant_businesses` to avoid collision with CRM `businesses`. |
| Branch | none | Branch under tenant Business | **NEW** | Low | Additive table with organization-consistent composite FK. |
| Department | none | Department under Branch | **NEW** | Low | Additive table with organization-consistent composite FK. |
| Team | none | Team under Department | **NEW** | Low | Additive table with organization-consistent composite FK. |
| Scoped member access | org-wide role only | RBAC + scope attributes | **EXTEND** | Medium | Preserve org role; add lower-scope role assignments referencing existing membership. |
| Organization config | `organization_settings.config` | inherited Organization/Brand/Business/Branch/Department/Team configuration | **EXTEND** | Medium | Existing org config remains authoritative for legacy keys; new scope overrides layer on top. No forced dual-write. |
| IAM boundary | `is_org_member`, `is_org_owner`, RLS | tenant-safe hierarchical IAM | **EXTEND** | Medium | New rows always carry `organization_id`; cross-org hierarchy is prevented by composite FKs; existing RLS helpers remain canonical. |
| RBAC | fixed org role vocabulary | org + lower-scope roles | **EXTEND** | Medium | Reuse current role vocabulary initially; no role semantics are removed. |
| ABAC | none | constrained scope attributes | **NEW** | Low | Scoped assignments support fail-closed scalar attribute matching in runtime policy; attributes never bypass RLS. |
| Plans | none | plan catalog | **NEW** | Low | New global catalog, tenant users read only. |
| Pricing Versions | service prices exist for agency offerings, but no SaaS plan pricing versions | immutable/versioned SaaS pricing | **NEW** | Medium | Do not replace `service_prices`; SaaS pricing is versioned independently per Plan + Currency + Billing Period lane. |
| Subscriptions | none | tenant subscription lifecycle | **NEW** | Low | Read-only to tenant users; service-side mutation only until billing Action Gateway exists. |
| Entitlements | none | versioned plan entitlements + tenant override | **NEW** | Low | Entitlements gate future features but do not disable existing Growth OS paths in this PR. |
| Usage ledger | `usage_events` raw provider costs | usage classification for customer billing | **EXTEND** | Medium | Preserve `cost_usd` and Cost Guard aggregation; add classification defaulting to `INTERNAL` so historical/current internal cost is never accidentally customer-billed. |
| Customer AI charge | none | billable raw AI cost × 4 | **NEW** contract over existing ledger | Low | Calculation is deterministic and dormant until billing consumes it; only `BILLABLE` classification is chargeable. |
| Audit | `audit_logs` | correlation + causation + hierarchy scope | **EXTEND** | Low | New nullable fields; existing writers continue working unchanged. |
| Feature flags | runtime env/control flags and settings, no hierarchy override model | hierarchical feature-flag override scopes | **EXTEND** | Medium | Existing safety flags remain untouched and higher priority; new flags cannot disable current safety gates. |
| Shadow Mode / outbound gates | proven runtime primitives | unchanged | **REUSE** | Critical if altered | This PR does not alter them. |

No **REPLACE** decision is made in this work package.

## 4. Canonical tenant-scope contract

Every new tenant-owned row MUST include `organization_id`.

Hierarchy rows enforce both identity and tenant consistency:

- Brand: `organization_id`
- Business: `organization_id + brand_id`
- Branch: `organization_id + tenant_business_id`
- Department: `organization_id + branch_id`
- Team: `organization_id + department_id`

Child foreign keys use `(organization_id, parent_id)`, not only `parent_id`. A valid UUID from another tenant therefore cannot be attached to the current tenant.

Existing Growth OS tables remain organization-scoped and do not require a branch/business backfill in this PR.

Runtime consumers MUST validate the assembled scope against trusted hierarchy lineage loaded from persistence. A syntactically complete chain is not sufficient: Brand must belong to the Organization, Business to that Brand, Branch to that Business, Department to that Branch, and Team to that Department. Configuration inheritance and scoped IAM fail closed when that lineage does not match.

## 5. Configuration inheritance contract

Resolution order, lowest to highest precedence:

```text
legacy organization_settings.config
-> Organization override
-> Brand override
-> Business override
-> Branch override
-> Department override
-> Team override
```

Rules:

1. only layers that belong to the same `organization_id` are eligible;
2. a lower scope overrides a higher-scope key;
3. missing keys inherit;
4. explicit JSON `null` is a value, not a request to read another tenant;
5. legacy `organization_settings.config` remains readable and is not rewritten;
6. Shadow Mode, global kill switch, provider send gates, approval rules, and Cost Guard do not become ordinary inheritable config in this PR.

## 6. IAM / RBAC / ABAC contract

### Source of truth

- identity: Supabase `auth.users`;
- organization membership and organization-wide role: `organization_members`;
- lower-scope role assignment: `member_scope_assignments`;
- tenant boundary: `organization_id` plus RLS.

### RBAC

The organization role vocabulary remains:

- OWNER
- ADMIN
- SALES_MANAGER
- SALES_AGENT
- VIEWER

`OWNER` is organization-wide only. Lower-scope assignments may use `ADMIN | SALES_MANAGER | SALES_AGENT | VIEWER`; they cannot manufacture another organization owner. Runtime role resolution is keyed by both `user_id` and tenant scope, so an assignment belonging to another user or another organization is never applicable.

### ABAC

A scoped assignment may contain policy attributes. In this foundation, attribute requirements are scalar equality constraints (`string | number | boolean`) evaluated by the runtime role resolver. Every declared requirement must match the trusted policy context; unsupported/nested values fail closed and do not grant the scoped role.

Attributes are inputs to application policy only. They cannot override RLS, ownership checks, entitlements, consent, approval, Cost Guard, or outbound safety.

For backward compatibility, hierarchy/configuration rows remain organization-readable to existing organization members in this slice. Scoped assignments refine runtime role/policy decisions; they do not silently narrow the existing organization-level read contract at the database boundary. `member_scope_assignments` itself is readable only by the assigned user or the organization OWNER.

## 7. Entitlement and subscription contract

### Source of truth

- plan identity: `plans`;
- immutable commercial revision: `pricing_versions`;
- included capabilities: `plan_entitlements`;
- tenant commercial state: `subscriptions`;
- exceptional tenant grant/limit: `organization_entitlement_overrides`.

### Subscription states

```text
TRIAL -> ACTIVE -> PAST_DUE -> GRACE_PERIOD -> SUSPENDED -> CANCELED | EXPIRED

Recovery explicitly allowed by the canonical catalog:

PAST_DUE -> ACTIVE
```

This PR stores and validates state. It does not call a payment provider and does not create a billing side effect.

### Pricing/subscription invariants

- active pricing is unique per `Plan + Currency + Billing Period` lane, so multi-currency/monthly/annual pricing can coexist without rewriting the model;
- published commercial fields and the effective window are immutable while ACTIVE/RETIRED; `effective_to` may be set only as part of ACTIVE -> RETIRED retirement when it was previously unset;
- one organization may have at most one live primary subscription in `TRIAL | ACTIVE | PAST_DUE | GRACE_PERIOD | SUSPENDED`;
- `CANCELED` and `EXPIRED` subscriptions remain historical evidence and do not block a later subscription.

### Entitlement precedence

1. active organization override when present;
2. entitlement from the subscription's immutable pricing version;
3. absent entitlement means not granted for new Business OS features.

Existing Growth OS features are not denied merely because no subscription has yet been backfilled.

## 8. Usage classification and AI billing contract

Canonical classifications:

- `BILLABLE`
- `NON_BILLABLE`
- `SYSTEM_RETRY`
- `CACHED`
- `PROMOTIONAL`
- `INTERNAL`

`usage_events.cost_usd` remains raw/internal provider cost and remains included in Cost Guard regardless of customer-billing classification.

Customer AI charge policy:

```text
if usage_classification == BILLABLE:
    Customer AI Charge = Billable Raw AI Cost * 4
else:
    Customer AI Charge = 0
```

Existing rows and unspecified new rows default to `INTERNAL`. This deliberately fails closed for customer billing.

## 9. Audit correlation contract

Important Business OS mutations MUST be able to carry:

- `correlation_id`
- `causation_id`
- optional Brand / Business / Branch / Department / Team scope

Existing audit writers are backward compatible because all new audit fields are nullable.

## 10. Feature flag scopes

Feature flag overrides follow the same hierarchy:

```text
Organization -> Brand -> Business -> Branch -> Department -> Team
```

A lower-scope override wins only inside the same tenant hierarchy.

Runtime safety controls are not ordinary feature flags. Global kill switch, Shadow Mode, provider send gates, consent, approval, and Cost Guard always retain their existing independent enforcement.

# 11. Service contract

## Identity

Domain: `CONTROL_PLANE_FOUNDATION`  
Version: `v1`

## Source of Truth

- tenancy: `organizations`;
- user membership: `organization_members`;
- hierarchy: `brands`, `tenant_businesses`, `branches`, `departments`, `teams`;
- lower-scope IAM: `member_scope_assignments`;
- configuration inheritance: legacy `organization_settings.config` plus `scope_configuration_overrides`;
- feature overrides: `feature_flag_overrides`;
- SaaS commercial model: `plans`, `pricing_versions`, `plan_entitlements`, `subscriptions`, `organization_entitlement_overrides`;
- usage accounting: existing `usage_events` plus fail-closed classification; trusted classification changes go through the service-role-only `classify_usage_event` RPC and are audited;
- audit: existing `audit_logs` plus correlation/scope and control-plane mutation triggers.

## Commands

Schema/runtime foundation recognizes these command intents for later application handlers:

- CreateBrand / UpdateBrand / ArchiveBrand
- CreateTenantBusiness / UpdateTenantBusiness / ArchiveTenantBusiness
- CreateBranch / UpdateBranch / ArchiveBranch
- CreateDepartment / UpdateDepartment / ArchiveDepartment
- CreateTeam / UpdateTeam / ArchiveTeam
- AssignMemberScope / RevokeMemberScope
- PutScopeConfiguration / DeleteScopeConfiguration
- PutFeatureFlagOverride / DeleteFeatureFlagOverride
- CreatePlan / PublishPricingVersion / RetirePricingVersion
- StartSubscription / ChangeSubscriptionState
- PutEntitlementOverride / RevokeEntitlementOverride
- RecordUsageClassification

No provider-bound command is introduced by this PR.

## Queries

- GetOrganizationHierarchy
- GetCanonicalTenantScope
- GetMemberScopes
- ResolveConfiguration
- ResolveFeatureFlag
- GetEffectiveEntitlements
- GetSubscription
- GetUsageBillingClassification
- GetAuditCorrelation

## Events

The schema is prepared for these event names; event transport is not introduced in this PR:

- control.organization.hierarchy_changed.v1
- control.member.scope_assigned.v1
- control.member.scope_revoked.v1
- control.configuration.changed.v1
- control.feature_flag.changed.v1
- billing.pricing_version.published.v1
- billing.subscription.state_changed.v1
- billing.entitlement.override_changed.v1
- billing.usage.classified.v1

## States

Hierarchy entities:

`ACTIVE | ARCHIVED`

Plans / pricing versions:

`DRAFT | ACTIVE | RETIRED`

Subscriptions:

`TRIAL | ACTIVE | PAST_DUE | GRACE_PERIOD | SUSPENDED | CANCELED | EXPIRED`

## Permissions

- member reads require existing organization membership;
- hierarchy/configuration/scoped-IAM mutations require existing organization OWNER;
- hierarchy/subscription/organization-entitlement runtime mutation is service-side or OWNER-gated as defined by RLS and is audited;
- Plan/Pricing Version/Plan Entitlement authoring is deliberately runtime read-only in this foundation and remains migration-managed until an audited platform-level catalog command boundary is introduced;
- RLS remains the database tenant boundary;
- no scoped assignment may grant access outside its organization.

## Idempotency

- hierarchy slugs/codes are unique inside the relevant parent scope;
- scope configuration and feature overrides are unique for one scope + key;
- pricing versions are unique by `plan_id + currency + billing_period + version`, with at most one ACTIVE row per pricing lane;
- at most one live primary subscription exists per organization;
- one provider subscription identifier cannot be attached twice;
- future command handlers must provide request keys before side effects are introduced.

## Failure Modes

- cross-tenant parent ID: database FK failure;
- non-member read: RLS returns no rows;
- non-owner hierarchy/config mutation: RLS denies mutation;
- invalid scope shape: check constraint failure;
- invalid subscription or catalog state: check constraint/application transition failure;
- missing classification: usage is `INTERNAL`, never implicitly billable.

## Compensation

No external side effect exists in this PR. Database writes are transactional. Future provider-backed subscription/payment commands must use Action Gateway + verification + compensating state.

## Audit

Hierarchy, scoped IAM, configuration, feature-flag, subscription, and organization-entitlement runtime mutations are audited through the existing `audit_logs` primitive. Correlation/causation fields are additive and nullable for backward compatibility.

Global Plan/Pricing/Plan-Entitlement authoring has no tenant `organization_id`, so this foundation does **not** pretend the tenant audit table is a valid platform audit sink. Runtime DML for that global catalog is revoked from `service_role` until a platform-level audit/command boundary exists. Reviewed migrations may still seed or evolve the catalog.

The migration does not fabricate audit events for untouched historical data.

## Billing impact

The migration itself has no customer billing impact.

`usage_events.cost_usd` stays raw provider cost. Customer charge is computed only from explicitly `BILLABLE` AI usage and the current policy multiplier **4×**. Pricing Version storage is constrained to exactly 4 for this phase; changing the commercial multiplier later requires an explicit versioned migration/policy change. All other classifications produce zero customer AI charge.

## Retention

- hierarchy/IAM/subscription records: retained while the organization exists, then cascaded;
- audit logs: existing retention policy remains unchanged;
- usage events: existing Cost Guard/usage retention remains unchanged;
- this PR does not delete or shorten existing retention.

## SLO

Foundation operations are transactional database operations with no provider call. Target:

- tenant-scope validation: fail closed;
- configuration/feature resolution: deterministic;
- no cross-tenant row visibility under authenticated RLS;
- no runtime outbound behavior change.

## Metrics

Initial implementation metrics are test/assertion based:

- hierarchy tenant-integrity constraint coverage;
- RLS coverage on every new tenant table;
- classification coverage for usage billing classes;
- configuration precedence test coverage;
- role/scope evaluation test coverage.

No high-cardinality analytics workload is added to Production transactional request paths.

## Tests

Required before merge:

- migration structure and least-privilege assertions;
- tenant-isolation FK assertions;
- configuration inheritance precedence;
- feature-flag precedence;
- RBAC/scope applicability;
- fail-closed ABAC attribute matching;
- multi-currency pricing-lane uniqueness and one-live-subscription invariant;
- least-privilege service-role/catalog grants;
- entitlement precedence;
- AI billing classification ×4 and exclusion classes;
- lint;
- typecheck;
- full Vitest suite;
- Next build;
- Vinext build;
- Cloudflare scheduled-bundle verification.

## 12. Explicit non-scope

This work package does not add:

- new omnichannel providers;
- CRM v2;
- mobile application;
- marketplace;
- booking;
- agent redesign;
- provider billing integration;
- real customer messages;
- Production migration application.

Production remains unchanged until this implementation PR is reviewed, green, migration-safe, and explicitly promoted.
