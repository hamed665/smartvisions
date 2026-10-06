# Meta App Review and Production Readiness

Status scope: Customer Access + WhatsApp execution overlay. This file does not create a new roadmap cursor.

## State separation

- Meta Business Verification: verified.
- Meta Tech Provider / Access Verification: external review; do not infer approval from Business Verification.
- Meta App Review: draft only until the Meta submission is actually completed.
- WhatsApp Business App Coexistence: capability remains fail-closed until official eligibility and provider/config evidence exist.
- Real customer end-to-end: dependency pending until a real authorized Business/asset exists and the complete path is observed.

## Production credential preflight

The Cloudflare deployment must not treat the presence of a `META_APP_SECRET` binding name as proof that the secret belongs to the configured Meta App ID.

When customer WhatsApp public identifiers are configured, the deploy fails closed unless the GitHub Actions `META_APP_SECRET` is present and can authenticate the exact configured `META_APP_ID` against Meta Graph. The check sends the app access credential only in the `Authorization` header, never in the URL or logs, and accepts only a response whose application id matches the configured id.

After verification, that same masked secret is supplied to Wrangler through an ephemeral `--secrets-file` while deploying the exact Candidate and Production bundles. Cloudflare preserves secret bindings omitted from that file, so unrelated provider secrets are not replaced. The temporary file is mode-restricted and removed by the step trap.

This makes the deployed Worker secret deterministic without reading the existing encrypted Worker value and without enabling public Production Version URLs. Candidate and Production safe-smoke steps may use the same masked GitHub secret to exercise the valid Meta-signature no-op path; they do not print it.

`META_WHATSAPP_COEXISTENCE_ENABLED` remains a separate capability gate and is not enabled by credential pairing.

## Embedded Signup version readiness

Meta's June 16, 2026 developer guidance describes Embedded Signup v4 as the unified onboarding architecture and migration target for legacy v2/v3. Meta Developers also announced retirement of Embedded Signup v2/v3 on October 15, 2026 for new onboarding.

Smart Visions now fails closed unless the deployed environment explicitly attests `META_WHATSAPP_EMBEDDED_SIGNUP_VERSION=v4`. That variable is not inferred from a Configuration ID. It must only be set after the actual Meta App Dashboard Embedded Signup configuration has been verified as v4.

The existing `sessionInfoVersion: '3'` launch value is intentionally retained. It describes the Embedded Signup session-info event payload format used by the current Coexistence completion parser; it is not an assertion that the Meta configuration itself is v3. Do not replace it with `4` merely because the configuration is v4.

The official non-destructive Coexistence selector `featureType: 'whatsapp_business_app_onboarding'` remains present. `META_WHATSAPP_COEXISTENCE_ENABLED` remains an independent fail-closed capability gate and must not be enabled merely because v4 is configured.

App Review remains **DEPENDENCY_PENDING** until the real Meta configuration is verified as v4 and the authorization/session event, selected asset identifiers, Coexistence completion, and account-model assumptions pass controlled testing. No App Review screencast should present the flow as final before that evidence exists.

## App Review submission preparation

### Permission usage

`whatsapp_business_messaging`
: Used to receive customer WhatsApp messages and send authorized human or governed automation replies through the official WhatsApp Cloud API. Smart Visions does not collect a Facebook password or require customers to paste an access token.

`whatsapp_business_management`
: Used after Meta-hosted authorization to read and bind only the WhatsApp Business Account and phone assets selected/authorized by the business.

`business_management`
: Used only where Meta requires business-level authorization/asset discovery for the customer-selected business assets. Do not claim broad portfolio management that is not implemented.

`public_profile`
: Basic Meta identity context required by the authorization flow; it is not a substitute for Smart Visions Business authorization.

### Reviewer path

1. Open Smart Visions customer sign-in/invitation flow.
2. Enter a Business-scoped workspace using a reviewer account that actually exists for review.
3. Open Connections.
4. Start Meta-hosted WhatsApp authorization.
5. Show the Meta consent surface and selected authorized business assets.
6. Return to Smart Visions and show the connection state derived from provider evidence.
7. Open Inbox and, only when a real test asset is available, demonstrate a real inbound message and an authorized reply.
8. For a phone number already active in WhatsApp Business App, demonstrate only official Business App Coexistence. Never demonstrate account deletion or destructive migration.

Do not record a screencast until the exact reviewer account, Meta test/business asset, authorization configuration, and the demonstrated message path are actually working. A mock Connected state is not acceptable evidence.

## Public policy prerequisites

- Privacy Policy URL must resolve publicly and describe actual Smart Visions data handling.
- Data Deletion instructions must resolve publicly and provide a real request path.
- The Data Deletion flow may be manual if that is the real process; do not claim automated deletion.
- Reviewer instructions must identify any external dependency that prevents a truthful demo.

## Chatwoot

Chatwoot remains the communication plane, while Smart Core remains Business/data/permission authority. External provisioning stays disabled until the Production platform token and activation prerequisites are verified. Retry must reconcile and reuse canonical mappings instead of creating duplicate accounts/inboxes/bindings.

## Evidence vocabulary

Use only: IMPLEMENTED, CONFIGURED, CONTROLLED_TEST_VERIFIED, PRODUCTION_VERIFIED, BLOCKED_EXTERNAL, DEPENDENCY_PENDING, DEFERRED_WITH_REASON, SUPERSEDED_WITH_EVIDENCE, NOT_REPROBED.