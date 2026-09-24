# COMM C5 — scoped Chatwoot membership security gate

Status: BLOCKED for scoped-only users on a shared Inbox. This is a source-backed audit on top of PR #221; it does not activate provisioning or change Production.

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

## Release gate

No implementation of scoped-only Inbox/Team membership is safe until its external effective permissions are proven with source-backed policy checks and tests for mixed Team conversations in a shared Inbox. Keep this PR Draft and keep Shadow Mode on. Production has no Chatwoot tables at this audit checkpoint.
