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
5. the caller passes the existing tenant/business authorization and durable command/reconciliation gates.

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

## First activation sequence

1. verify current main, Production deploy, Supabase migration head and safety controls;
2. verify Production Chatwoot health;
3. stage `CHATWOOT_PLATFORM_TOKEN` through the server-only transport;
4. verify only the Production Worker has the secret binding name;
5. keep `CHATWOOT_PROVISIONING_ENABLED=false`;
6. bootstrap one real Brand and tenant Business through the governed OWNER-only endpoint;
7. verify audit evidence and tenant scope;
8. run a no-mutation readiness check;
9. explicitly change the activation flag in a separately reviewed Production change;
10. provision one tenant through durable claims/reconciliation;
11. verify Account/User/Membership/API Inbox/Team mappings;
12. keep provider/customer sends disabled until their separate action gate is proven.

## Stop conditions

Do not activate provisioning when any of these are true:

- no real canonical tenant Business exists;
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
