# COMM C5 — scoped Chatwoot membership security gate

Status: POLICY CLOSED / RUNTIME FAIL-CLOSED. Business-wide eligible AccountUsers can be reconciled into Inbox/Team desired sets from canonical Smart Core scope. External-first BRANCH/DEPARTMENT/TEAM reductions are implemented through remove → GET-verify → immutable receipt → canonical mutation sequencing. Native Chatwoot AccountUser + SSO is intentionally Business-wide only; scoped-only staff remain outside native Chatwoot and will use the scope-aware Smart Core unified inbox. Production provisioning remains disabled.

## Verified source contract (Chatwoot Community Edition v4.18.0)

- `app/policies/conversation_policy.rb`: `show?` permits an administrator, agent bot, or `inbox_access? || team_access?`. Inbox access checks membership in the conversation's Inbox independently of its Team. Team access checks membership for conversations carrying that Team ID.
- `app/controllers/api/v1/accounts/inbox_members_controller.rb`: PATCH updates the Inbox's member set, adding requested IDs and removing IDs absent from the request.
- `app/policies/inbox_policy.rb`: the Inbox scope resolves `user.assigned_inboxes`; administrator permissions differ from agent permissions.
- `app/policies/contact_policy.rb`: ordinary Chatwoot agents may index, search, filter, show, update and create Contacts at Account scope; these actions are not narrowed by Inbox/Team membership.
- `app/controllers/api/v1/accounts/contacts_controller.rb`: Contact index/search operate on `Current.account.contacts`, proving that a scoped-only AccountUser would receive a broader native CRM surface than Smart Core Branch/Department/Team authority.

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

Migration `0091_chatwoot_scoped_access_reduction_gate.sql` is now Production-live as migration version `20260926100839`. Direct lower-scope reductions remain blocked.

The next migration, `0092_chatwoot_external_first_scoped_demotion.sql`, introduces a five-minute immutable service-recorded verification receipt and an authenticated OWNER-only consumer. The server orchestration computes before/after effective role for every bounded ACTIVE Inbox/Team target, removes the target Chatwoot User only where the post-change role becomes VIEWER, performs GET verification after at most one PATCH, records the verified resource IDs, and only then invokes the canonical scope-assignment update/delete command. Ambiguous PATCH outcomes are reconciled by GET only.

The receipt is not canonical IAM authority. It cannot create or widen a scope assignment, is bound to the exact assignment/version/operation/post-role/post-attributes hash, and becomes unusable after the assignment version advances. service_role may only persist the immutable verification receipt; authenticated OWNER remains the canonical mutation authority.

## Scoped-only native Chatwoot policy closeout

Smart Visions will **not** create a native Chatwoot AccountUser or native Chatwoot SSO session for a user whose canonical Business-wide role resolves to VIEWER, even when that user has a non-VIEWER BRANCH / DEPARTMENT / TEAM assignment.

This is an intentional security boundary, not a missing convenience feature. Chatwoot Community v4.18.0 narrows Conversation access through Inbox/Team membership, but its Contact policy exposes Account-wide Contact list/search/show/update/create actions to ordinary agents. Therefore a scoped-only AccountUser would violate the Smart Core invariant that external access must be no broader than canonical scope.

Native Chatwoot is therefore reserved for users with verified Business-wide non-VIEWER authority:

- OWNER -> Chatwoot administrator;
- ADMIN / SALES_MANAGER / SALES_AGENT at Organization / Brand / Business effective scope -> Chatwoot agent;
- VIEWER at Business scope -> no Chatwoot AccountUser and no native SSO;
- lower-scope-only staff -> no native Chatwoot AccountUser and no native SSO.

Lower-scope staff will operate through `COMM-UNIFIED-INBOX`, where Smart Core can enforce Branch / Department / Team scope before exposing conversations, contacts or actions.

The SSO adapter recomputes live Business-wide canonical authority before issuing a Platform login URL and requires it to match the stored ACTIVE AccountUser projection. A stale ACTIVE AccountUser therefore cannot continue to receive SSO after canonical Business-wide authority disappears.

## Release gate

Scoped-only native Chatwoot AccountUser support is closed as unsupported because source evidence proves Account-wide Contact access for ordinary agents. Scope-aware staff access moves to COMM-UNIFIED-INBOX instead. Keep Shadow Mode on and keep Production provisioning disabled until the real tenant, Platform token, explicit activation and runtime evidence gates are satisfied.
