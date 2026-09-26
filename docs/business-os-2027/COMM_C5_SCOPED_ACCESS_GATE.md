# COMM C5 — scoped Chatwoot membership security gate

Status: PARTIALLY IMPLEMENTED / FAIL-CLOSED. Business-wide eligible AccountUsers can now be reconciled into Inbox/Team desired sets from canonical Smart Core scope. Scoped-only users that lack a verified Business-wide AccountUser remain blocked. Lower-scope authority reductions that would remove projected access are also blocked until external-first demotion orchestration is completed. Production provisioning remains disabled.

## Verified source contract (Chatwoot Community Edition v4.18.0)

- `app/policies/conversation_policy.rb`: `show?` permits an administrator, agent bot, or `inbox_access? || team_access?`. Inbox access checks membership in the conversation's Inbox independently of its Team. Team access checks membership for conversations carrying that Team ID.
- `app/controllers/api/v1/accounts/inbox_members_controller.rb`: PATCH updates the Inbox's member set, adding requested IDs and removing IDs absent from the request.
- `app/policies/inbox_policy.rb`: the Inbox scope resolves `user.assigned_inboxes`; administrator permissions differ from agent permissions.

Source: https://github.com/chatwoot/chatwoot/blob/v4.18.0/app/policies/conversation_policy.rb and https://github.com/chatwoot/chatwoot/blob/v4.18.0/app/controllers/api/v1/accounts/inbox_members_controller.rb.

## Counterexample

Organization VIEWER has SALES_AGENT on one Smart Core Team. An Inbox holds conversations for that Team and for another Team. If C5 creates the agent AccountUser and adds the user to that Inbox to satisfy the narrower Team role, `inbox_access?` allows the user to view conversations of the other Team as well. A correct Team desired set cannot undo the broader Inbox permission. A Team membership alone allows conversations bearing that Team ID, but Inbox membership must not be inferred from Team eligibility.

The current `lib/business-os/control-plane.ts` resolver is canonical for scope precedence. The current `lib/chatwoot/sso.ts` requires ACTIVE AccountUser membership and a non-VIEWER projected Account role. It does not represent the distinction between AccountUser as external identity prerequisite and Business-wide Smart Core authority. Existing reverse-role interlocks and global User activation also assume Business-wide eligibility. Changing only an Inbox/Team desired-set calculator would leave those guards inconsistent.

## Required C5 invariant and sequencing

External Chatwoot access must be no broader than canonical Smart Core access. Before a scoped-only user is granted an AccountUser, establish that the Chatwoot agent role, Team association, and every exposed Inbox/Conversation path respect the Smart scope. Never give a Team-only user Inbox membership in a mixed-scope Inbox. If a Chatwoot Team can see conversations across branches through one shared Team, its lineage must be constrained too.

For a branch-bound Inbox, calculate `effectiveRoleForScope` at BRANCH. For an unbound Inbox, calculate it at BUSINESS. For a Team, resolve canonical Team → Department → Branch → Business → Brand lineage and calculate at TEAM. Conditional assignments without trusted attributes add no access. A user with an eligible role but missing ACTIVE global User, AccountUser, or verified external IDs is reconciliation-required, never silently absent from a claimed synced set.

Before any external change, prove the exact v4.18.0 GET/PATCH member response shapes, and implement GET → one replace-set PATCH → GET exact verification; ambiguous PATCH permits GET reconciliation only. Reuse the existing Chatwoot command claim and receipt patterns if they bind the resource, desired-set hash, membership version, and observed external state. Avoid a second event system. Do not perform HTTP in a database transaction.

For authority reductions, external access removal and GET verification must precede canonical reduction; retain the current interlock until a scope-aware interlock can prove the external state. Changes to SSO, User and AccountUser activation must be part of that coherent scope-aware boundary, not a bypass through service_role or a caller-declared role.

## 2026-09-26 implementation checkpoint

The source-backed member APIs have now been incorporated into the runtime contract:

- Inbox members: GET `/api/v1/accounts/:account_id/inbox_members/:inbox_id`;
- Inbox exact replace set: PATCH `/api/v1/accounts/:account_id/inbox_members` with `inbox_id + user_ids`;
- Team members: GET `/api/v1/accounts/:account_id/teams/:team_id/team_members`;
- Team exact replace set: PATCH the same Team-member collection with `user_ids`.

The runtime performs `GET -> at most one PATCH -> GET exact verification`. Ambiguous PATCH outcomes never trigger a second PATCH; only GET reconciliation is permitted.

Desired membership is calculated from canonical Organization role plus applicable Brand/Business/Branch/Department/Team assignments through the existing `effectiveRoleForScope` resolver with no caller-provided ABAC attributes. Conditional assignments therefore fail closed.

Only users that already have a verified ACTIVE Business-wide Chatwoot AccountUser/User projection can enter a desired set. If canonical scoped authority expects access but that prerequisite is missing, reconciliation fails rather than silently claiming a complete synced set. This intentionally keeps scoped-only users blocked.

Migration `0091_chatwoot_scoped_access_reduction_gate.sql` extends the reverse-role safety boundary to BRANCH / DEPARTMENT / TEAM. Once a projected resource and live Account membership exist, a canonical mutation that would reduce effective scoped authority from non-VIEWER to VIEWER is blocked. Promotions/equivalent Chatwoot-agent role changes remain allowed because temporary under-privilege is safe.

This gate deliberately does not pretend the external-first demotion workflow is complete. The next security unit must remove/verify scoped external access first, then commit the canonical reduction.

## Release gate

No implementation of scoped-only Inbox/Team membership is safe until its external effective permissions are proven with source-backed policy checks and tests for mixed Team conversations in a shared Inbox. Keep this PR Draft and keep Shadow Mode on. Production has no Chatwoot tables at this audit checkpoint.
