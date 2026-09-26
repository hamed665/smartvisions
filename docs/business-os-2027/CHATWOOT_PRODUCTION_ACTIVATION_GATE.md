# Chatwoot Production Activation Gate

## Purpose

This contract defines the only supported path for activating Smart Core -> Chatwoot external provisioning.

The goal is to make the Platform token transport server-only, keep the release candidate unable to reach Production Chatwoot, and ensure that enabling provisioning is a separate explicit Production decision after a real canonical tenant exists.

## Current activation state

Default Production state remains:

- `DEPLOYMENT_ENV=production`;
- `CHATWOOT_BASE_URL=https://inbox.smartvisionsai.com`;
- `CHATWOOT_WEBHOOK_PUBLIC_ORIGIN=https://app.smartvisionsai.com`;
- `CHATWOOT_PROVISIONING_ENABLED=false`.

Release Candidate remains:

- `DEPLOYMENT_ENV=candidate`;
- Chatwoot base URL absent;
- Chatwoot webhook public origin absent;
- Chatwoot Platform token absent;
- `CHATWOOT_PROVISIONING_ENABLED=false`.

No provider or Chatwoot external mutation is authorized by merely staging a secret.

## Secret transport

`CHATWOOT_PLATFORM_TOKEN` is a server-only secret.

Allowed transport:

`GitHub Actions secret -> masked step-local environment -> stdin -> Cloudflare Worker secret binding`

The value must not be:

- committed to Git;
- stored in Wrangler plaintext vars;
- copied into browser/client state;
- stored in Supabase tenant mapping rows;
- written to logs;
- exposed to the release candidate;
- echoed by CI.

The permanent deploy workflow may stage the secret on the Production Worker only when the GitHub Actions secret already exists. The workflow validates the binding name, not the value.

Absence of the secret must not break normal deployments while provisioning is disabled.

## Runtime activation contract

External Chatwoot provisioning is allowed only when every condition is true:

1. deployment environment is exactly `production`;
2. `CHATWOOT_PROVISIONING_ENABLED=true`;
3. Production Chatwoot base URL is valid;
4. the server-only Platform token is present and valid;
5. at least one governed ACTIVE communication binding exists for the real tenant Business;
6. the tenant has one live Chatwoot Account mapping prepared through the durable Smart Core command path;
7. the caller passes the existing tenant/business authorization and durable command/reconciliation gates.

Any missing condition fails closed before network mutation.

A Production token may be staged while provisioning remains disabled. This is intentional separation of credential transport from external side-effect activation.

## Tenant gate

Provisioning must not be enabled merely because the token exists.

Before first activation there must be evidence-backed canonical Smart Core scope:

- Organization;
- Brand;
- tenant Business;
- authorized owner/member scope;
- no fabricated mapping from Growth/Hunter `public.businesses`.

The first real tenant projection remains governed by `COMM-TENANT-BRIDGE`.

Projection preparation is deliberately separate from external provisioning. The OWNER-only preparation action may create audited Smart Core `communication_channel_bindings` and a `chatwoot_account_mappings` row in `PROVISIONING` state, but it does not call Chatwoot, create an external Account, or send any provider/customer message.

## Platform App creation evidence

The live Production route `https://inbox.smartvisionsai.com/super_admin` currently redirects to the protected Super Admin sign-in route, confirming that the Super Admin surface exists without exposing it anonymously.

The pinned Chatwoot Community v4.18.0 source also confirms that `PlatformApp` includes `AccessTokenable` and automatically creates one access token when a Platform App is created.

Create the Production integration only from the protected Super Admin surface:

1. sign in to `/super_admin` with the private Production super-admin account;
2. create one Platform App named `Smart Visions Core`;
3. copy its generated access token directly into the GitHub Actions repository secret named `CHATWOOT_PLATFORM_TOKEN`;
4. do not paste the token into chat, source files, Supabase, issue/PR text, logs, or ordinary Worker variables;
5. run the normal exact-main deploy so the workflow stages the value only as a Production Worker secret;
6. verify the readiness surface reports `Platform token: Staged on Production` while provisioning remains disabled.

If token rotation is required, replace the GitHub Actions secret and redeploy before revoking the prior Platform App/token.

## Governed Account execution path

The supported first external projection entrypoint is the OWNER-only Settings action for a prepared Chatwoot Account mapping.

Execution order is fail-closed:

`OWNER action -> sanitized readiness -> Production activation contract -> canonical OWNER/Business re-read -> durable external-create claim -> Chatwoot marker reconciliation -> at most one Account create -> mapping commit`

The Account orchestration refuses to create the durable external-attempt claim unless all Production activation configuration is already present. A missing token, disabled provisioning flag, non-Production deployment, or invalid Production base URL therefore fails before database claim or external HTTP.

The action remains dormant while `CHATWOOT_PROVISIONING_ENABLED=false`. Adding the code path does not authorize Production mutation.

## First activation sequence

1. verify current main, Production deploy, Supabase migration head and safety controls;
2. verify Production Chatwoot health;
3. bootstrap one real Brand and tenant Business through the governed OWNER-only surface;
4. verify audit evidence and tenant scope;
5. prepare the tenant Communication Plane projection, creating only governed Smart Core communication bindings and the Account mapping;
6. verify the preparation is idempotent, tenant-scoped and contains no external Chatwoot side effect;
7. stage `CHATWOOT_PLATFORM_TOKEN` through the server-only transport;
8. verify only the Production Worker has the secret binding name;
9. keep `CHATWOOT_PROVISIONING_ENABLED=false`;
10. run the owner-only readiness check and require zero activation blockers;
11. explicitly change the activation flag in a separately reviewed Production change;
12. provision one tenant through durable claims/reconciliation;
13. verify Account/User/Membership/API Inbox/Team mappings;
14. keep provider/customer sends disabled until their separate action gate is proven.

## OWNER identity and membership activation

The first human Chatwoot access projection is deliberately restricted to the currently authenticated Smart Visions Organization OWNER.

The governed sequence is:

1. require the full Production activation contract before any User/AccountUser mapping mutation;
2. authenticate the current Smart Core user and require canonical Organization `OWNER` role;
3. require an `ACTIVE` verified Chatwoot Account mapping for the tenant Business;
4. create/adopt the global Chatwoot User mapping through `create_chatwoot_user_mapping`;
5. create/adopt the external Chatwoot User, persist a server-only reconciliation receipt, then activate the mapping through `activate_chatwoot_user_mapping_verified`;
6. create the Account membership through `create_chatwoot_account_membership`, which recomputes canonical Smart Core role at the database mutation boundary;
7. project OWNER only as Chatwoot `administrator`;
8. reconcile external AccountUser identity/role into the immutable receipt path;
9. activate the membership only through `activate_chatwoot_account_membership_verified`;
10. existing ACTIVE projections are re-verified instead of recreated.

The service-role client is used only for the existing immutable reconciliation receipt writers. It is not used to create/update User mappings, Account memberships, role state, or activation state. Those mutations remain authenticated SECURITY INVOKER command paths.

General ADMIN / SALES_MANAGER / SALES_AGENT projection remains a later governed expansion. VIEWER remains intentionally unprojected because Community Chatwoot has no equivalent read-only AccountUser role.

## Canonical operating hierarchy and downstream projection

API Inbox and Chatwoot Team projection require real Smart Core operating scope. No synthetic Branch, Department or Team may be created merely to unlock Chatwoot.

The canonical lineage is:

`Organization -> Brand -> tenant Business -> Branch -> Department -> Team`

The OWNER-only hierarchy bootstrap surface reuses the existing Control Plane tables, RLS and audit triggers. Exact code/name replay is idempotent; a reused natural code with different canonical data fails closed.

Downstream external projection remains ordered:

1. ACTIVE canonical tenant Business;
2. ACTIVE Branch/Department/Team lineage as applicable;
3. ACTIVE communication binding;
4. ACTIVE verified Chatwoot Account mapping;
5. ACTIVE OWNER Chatwoot administrator projection;
6. only then may an API Inbox or Chatwoot Team mapping claim be created;
7. API Inbox secrets are captured immediately into Supabase Vault and only secret references persist;
8. Team identity is reconciled through its deterministic Smart marker;
9. receipt-backed activation is required before either mapping becomes ACTIVE.

The Inbox and Team provisioning adapters independently re-check the Production activation contract and verified OWNER administrator projection before creating a mapping claim. This prevents a direct internal caller from leaving orphaned PROVISIONING mappings while external provisioning is disabled or OWNER access is not active.

## Stop conditions

Do not activate provisioning when any of these are true:

- no real canonical tenant Business exists;
- no governed ACTIVE communication binding exists for the tenant;
- no live Smart Core Chatwoot Account mapping is prepared;
- token binding is absent;
- release candidate contains the Platform token;
- Production Chatwoot health fails;
- tenant mapping is ambiguous;
- unresolved reconciliation receipt/claim exists;
- Shadow/safety state is not understood;
- CI or Production deploy evidence is not green;
- activation would bypass Smart Core provider-action safety.

## Security invariant

Credential presence is not authorization.

The Platform token only permits authenticated Chatwoot API access. Smart Core policy, tenant scope, durable command ownership, reconciliation, and explicit provisioning activation remain mandatory before any external mutation.
