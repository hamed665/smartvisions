# Smart Visions Chatwoot Source Component

Work Package: `COMM-CHATWOOT-SOURCE`

This directory defines how Smart Visions consumes Chatwoot Community source without vendoring the upstream repository into Smart Core.

## Canonical source

Read `source.lock.json`.

Current pin:

- upstream: `chatwoot/chatwoot`
- release: `v4.18.0`
- commit: `9f920b549c14491a4e587687a3eed5d21c6ccc7d`

Production must never use a moving upstream branch or `:latest` image.

## Source-build model

Smart Visions uses a reproducible source-build overlay:

1. checkout this Smart Core repository;
2. verify `source.lock.json`;
3. checkout Chatwoot upstream at the exact locked commit into an isolated build workspace;
4. verify the upstream version and Community/Enterprise license boundary;
5. apply only ordered patches from `ops/chatwoot/patches/`;
6. reject any patch that modifies `enterprise/`;
7. generate source provenance;
8. build using the pinned upstream source Dockerfile;
9. inspect the resulting image;
10. on trusted `main`, publish an immutable Smart Visions image to GHCR.

The upstream Chatwoot source tree is therefore used directly, but it is not copied into Smart Core Git history.

If a dedicated `hamed665/smartvisions-chatwoot` fork is later created, it may replace the patch-overlay transport only after the same source lock, license guard and immutable build provenance remain enforced.

## Provider ownership

The source component is a Communication Plane only.

Existing Smart Visions Email and WhatsApp provider credentials remain in Smart Core.

Initial Chatwoot channel projection:

`Channel::Api`

No native Chatwoot Email or WhatsApp connector may be enabled for a Smart Visions-owned provider lane until a separate controlled provider-ownership migration is approved.

## Runtime topology

Production Chatwoot requires a long-running application runtime:

- Rails/Puma web;
- Sidekiq worker;
- PostgreSQL with pgvector capability;
- Redis;
- durable Active Storage.

Do not run Chatwoot inside the Smart Core Cloudflare Worker or Smart Core Supabase schema.

Recommended boundary:

```text
Cloudflare DNS/TLS/WAF
        |
        v
Chatwoot web origin
        |
        +-- Chatwoot PostgreSQL
        +-- Chatwoot Redis
        +-- S3-compatible object storage
        +-- Sidekiq
```

A planned hostname is `inbox.smartvisionsai.com`; it is not canonical runtime evidence until provisioned.

## Database preparation

For a new release, use the upstream task:

`POSTGRES_STATEMENT_TIMEOUT=600s bundle exec rails db:chatwoot_prepare`

Run it as a controlled one-shot release step before the new web/worker version is considered healthy.

Never run an unreviewed database migration directly against Production.

## Production image rule

Deployment must reference an immutable digest, for example:

`ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-<smartvisions-sha>@sha256:<digest>`

Do not deploy `:latest`.

## Secrets

The examples in this directory intentionally contain no real secrets.

Keep these in the deployment secret store:

- `SECRET_KEY_BASE`;
- Chatwoot PostgreSQL password/URL;
- Redis password/URL;
- object-storage credentials;
- SMTP credentials if enabled;
- Platform App token;
- account/API tokens;
- Chatwoot webhook secrets.

Smart Core may persist external IDs, health evidence and secret references, but not raw provider/Chatwoot secrets in ordinary configuration JSON.

## Patches

See `patches/README.md`.

Community-safe source changes only. Never patch proprietary `enterprise/` source without an intentional valid Enterprise license.

## Verification

Local contract verification:

```bash
node scripts/chatwoot/verify-source-lock.mjs ops/chatwoot/source.lock.json
```

With an upstream checkout:

```bash
node scripts/chatwoot/verify-source-lock.mjs \
  ops/chatwoot/source.lock.json \
  --upstream-dir /path/to/chatwoot
```

The dedicated GitHub Actions workflow performs the same checks and builds the image from the exact upstream source.
