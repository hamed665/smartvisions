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

App Review can be prepared **before customer Embedded Signup is fully launched**, according to Meta's official Embedded Signup documentation. Use only the actual provider-authorized test path requested for each permission in the current Meta wizard. Do not insist on a real-customer Production integration as a precondition for starting App Review. A mock Connected state is not acceptable evidence; only working, expressly labeled test/sandbox/provider flows count.

## Public policy prerequisites

- Privacy Policy URL must resolve publicly and describe actual Smart Visions data handling.
- Data Deletion instructions must resolve publicly and provide a real request path.
- The Data Deletion flow may be manual if that is the real process; do not claim automated deletion.
- Reviewer instructions must identify any external dependency that prevents a truthful demo.

## Chatwoot

Chatwoot remains the communication plane, while Smart Core remains Business/data/permission authority. External provisioning stays disabled until the Production platform token and activation prerequisites are verified. Retry must reconcile and reuse canonical mappings instead of creating duplicate accounts/inboxes/bindings.

## Evidence vocabulary

Use only: IMPLEMENTED, CONFIGURED, CONTROLLED_TEST_VERIFIED, PRODUCTION_VERIFIED, BLOCKED_EXTERNAL, DEPENDENCY_PENDING, DEFERRED_WITH_REASON, SUPERSEDED_WITH_EVIDENCE, NOT_REPROBED.


---

## 2026-10-12 — Evidence-based App Review submission pack (NOT submitted)

**Purpose:** supply reviewer-ready, source-grounded text and a concrete completion checklist for Meta App `2838776553165089` / Business `1060156986989312` / existing draft `2879554815753929`. This is a GitHub documentation proposal, **not** a change to Meta Dashboard or a submitted App Review.

### Evidence, environment and freeze

- Fresh GitHub `main` examined: `9d7c45c0db6a7208f4c9021359ba6d2d9e2d536d` (2026-10-12 audit). Main CI run `38134549382` succeeded, but Cloudflare Production deployment run `38134814312` failed at **Production credential preflight**; later deploy workflows for this main SHA were skipped. Do **not** equate a green CI with a deployed app.
- Open, unmerged draft PRs: #488 (Business-only tenant scoping, required before #487) and #487 (customer Business/invite UI, OAuth secret transport hardening, Embedded Signup v4). Do not claim their implementations are live. #487 states `META_APP_SECRET` is missing from GitHub Actions and calls for verification of actual Meta v4 configuration plus `META_WHATSAPP_EMBEDDED_SIGNUP_VERSION=v4` before promoting.
- Main `app/integrations/meta-whatsapp-embedded-signup.tsx` still has `sessionInfoVersion: '3'`; #487 removes this legacy override, using `config_id` with `featureType: 'whatsapp_business_app_onboarding'` only for Coexistence. Main `lib/whatsapp/meta-onboarding.ts` still places the Meta app secret in the OAuth query URL; #487 replaces that with a POST body. Both are deployment blockers for reviewer demonstration.
- Read-only Supabase Production counts on 2026-10-12: `tenant_businesses=0`; `member_scope_assignments=0`; WhatsApp `communication_channel_bindings=0`; `communication_channel_setup_attempts=0`; `unified_inbox_conversation_projections=0`. This prevents any claim of a completed first customer demo.
- The Meta Dashboard was **not** readable through an authenticated session during this audit. The following were *owner-reported from the 2026-10-12 wizard*, not reobserved live: Business Verification Verified; Access Verification In review; App Unpublished; App Review Not submitted; submit button disabled; Wizard Verification 100%, App settings 25%, Allowed usage 0%, Data handling 0%, Reviewer instructions 0%. Recheck all fields in the authenticated Dashboard before every change or submission.
- Real production customer target: Sahara Center / مرکز صحرا. Never use customer secrets, live patients, or messages in a reviewer recording without explicit authorization. Do not create fake businesses, contacts, data, Meta authorizations or message events to pass review.

### Verified public legal pages

- **Privacy Policy URL**: `https://smartvisionsai.com/en/company/privacy` — publicly returned HTTP 200 and substantive English policy text on 2026-10-12. Page states effective date 2026-10-06.
- **User Data Deletion instructions URL**: `https://smartvisionsai.com/en/data-deletion` — publicly returned HTTP 200 and substantive English manual deletion-request process on 2026-10-12. Owner authorization is verified before acting; disconnect alone is **not** deletion.
- The guesses `/privacy`, `/privacy-policy` and `/data-deletion` **without the `/en/` locale** returned 404 on the same check. Do not enter them into Meta.
- The legal pages are source-backed by repository `hamed665/smartvisions-website`, routes `app/[locale]/company/privacy/page.tsx` and `app/[locale]/data-deletion/page.tsx`. They are **not** modifications made by this pack.
- Meta App settings: recommend **Business** category only if that is offered and fits the live current Meta choices; use the legal registered app/company name and **existing verified official logo**; audit app icon dimensions/validity and app contact email in the Dashboard. No icon, email, App Domain, data-deletion callback URL, or reviewer login has been verified by this pack. Do not invent or substitute any.

### Permissions: actual use and draft text (English, not yet entered in Meta)

**`whatsapp_business_messaging` — core, supported by source code**

> Smart Visions is a business-scoped customer service and automation platform. After an authorized business completes Meta-hosted WhatsApp Embedded Signup, our application receives inbound WhatsApp message and status webhooks for that business and supports sending authorized service replies through the official WhatsApp Cloud API. Messages and conversation state are shown in the business's scoped Inbox. Sending is restricted by our canonical send policy, provider binding, and human/automation safety controls. We do not collect Facebook passwords or ask customers to paste their access tokens.

Code entry points: `app/api/whatsapp/webhook/route.ts`, `lib/whatsapp/webhook.ts`, `app/api/whatsapp/send/route.ts`, `lib/whatsapp/meta-cloud.ts`; Inbox projection through existing Smart Core / Chatwoot paths. Do not imply first-real-customer Production E2E was already verified.

**`whatsapp_business_management` — core, supported by source code**

> Smart Visions uses this permission to complete a business-authorized WhatsApp connection and manage only the WhatsApp Business Account and phone assets that the business explicitly selects in Meta-hosted Embedded Signup. After authorization, we verify the selected WABA, phone number, and membership through the Meta Graph API, reconcile the app subscription when permitted, and associate the verified identifiers with the existing Business-scoped connection record. This enables connection status, routing, and authorized messaging for that business. We do not access unrelated business assets.

Code entry points: `app/api/integrations/meta/whatsapp/embedded-signup/complete/route.ts`, `lib/whatsapp/meta-onboarding.ts`, `lib/whatsapp/meta-provisioning.ts`, `lib/whatsapp/lifecycle.ts`. The wizard's Business Description can use: **“Smart Visions LLC provides a business-scoped AI-assisted customer communication platform for authorized businesses. Businesses connect their own WhatsApp Business assets using Meta Embedded Signup. The integration verifies WABA/phone ownership and powers their Inbox and authorized service replies.”**

**`business_management` — official Meta Embedded Signup documentation lists Advanced Access as required; actual configured scope still needs verification**

> If required by the verified Facebook Login for Business configuration, Smart Visions uses business-level asset authorization to allow an authorized business administrator to grant the application access to the WhatsApp Business Account and phone assets selected in Meta's Embedded Signup. This access is bounded to the customer's authorized business connection; we do not perform unrelated business portfolio administration.

Do **not** mark this as an implemented separate business portfolio management feature. Meta's official WhatsApp Business Platform Postman documentation for Embedded Signup says Advanced Access to `business_management` and `whatsapp_business_management` is required to release the app (https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup). This supplies an official onboarding justification, but still check the **real `config_id`**, selected features, actual token scopes and current Dashboard instructions before submission. The code itself uses WABA and phone Graph reads; it does not demonstrate unrelated business portfolio administration. Keep the existing draft permission pending that check, rather than deleting or blindly approving it.

**`public_profile` — Facebook Login baseline, independent advanced use not established**

> Smart Visions initiates Meta-hosted Facebook Login for Business to allow the authorized business administrator to approve access to the selected WhatsApp assets. We use Meta authorization only to establish that approved connection; Smart Visions customer workspace access is governed separately by our own authentication and Business-scoped authorization.

No independent user-profile Graph API use has been proven. Determine whether Meta treats `public_profile` as a standard/default Facebook Login permission in this configuration or whether the wizard actually requires its independent review. Do not claim profile enrichment, marketing or social user-data collection.

**No new permissions** may be added, nor existing draft permissions deleted, without exact configuration and flow evidence.

### Reviewer instructions draft (paste only after the precise demonstrated review path and credentials are verified)

> App: Smart vision company (Smart Visions LLC)
>
> Product URL: https://app.smartvisionsai.com
>
> Smart Visions provides an authenticated, Business-scoped customer communication workspace. A business administrator connects an authorized WhatsApp Business Account using the Meta-hosted Embedded Signup flow. The WhatsApp Business Account and selected phone number are verified through Meta Graph. When an actual eligible connection has been completed, the Business's Inbox can receive inbound WhatsApp messages and send policy-authorized service replies.
>
> **Reviewer access:** We will provide a dedicated, restricted, working reviewer account and the required test Business/integration assets securely through the applicable App Review fields. Do not use administrator Production credentials or real customer credentials.
>
> **Steps:** (1) Log in with the separate reviewer credentials supplied for this review. (2) Open the assigned Business workspace. (3) Navigate to Connections > WhatsApp. (4) Select the approved test connection and start Meta-hosted Embedded Signup. (5) Authorize only the provided, appropriately controlled test business/WABA/phone assets. (6) Return to Connections and inspect the connection result. (7) Open the same Business's Inbox. (8) Send one approved test inbound WhatsApp message from the controlled sender and show it in the Inbox, then send one approved reply and verify receipt.
>
> **Coexistence:** For a phone number currently active in WhatsApp Business App, only the official non-destructive Business App Coexistence onboarding mode is supported, subject to Meta eligibility and the enabled configuration. We never require deleting the account, uninstalling the mobile app, or losing previous chats. Do not switch a review/test number between incompatible modes.
>
> The reviewer credentials, actual test WABA/phone, exact screens and steps are **pending verification**. This text is NOT ready for submission as completed reviewer access until all placeholders become true.

### Screencast capture checklist: real recording only

**Do not confuse the App Review gate with first-customer Production launch.** Meta's official Embedded Signup documentation says to start App Review early, before finishing Embedded Signup. Check the exact *per-permission instructions* in the live Meta wizard first. If they permit real official Quickstart / Try It Out / Meta-issued sandbox assets, use that *genuine provider test path* without claiming the first customer is connected. If the instructions require your deployed app UI, prove the actual customer/reviewer path first; for that **particular recording** the #488 -> #487 + credential + v4 + provider/Chatwoot gates remain relevant. Never show Sahara Center's conversations or credentials without separate authorization.

1. **0:00–0:15:** Working product URL, safe sign-in with the dedicated reviewer account. No password shown.
2. **0:15–0:35:** Customer Business-scoped Home; navigate to Connections/WhatsApp. Demonstrate business scope without exposing unrelated businesses.
3. **0:35–1:15:** Launch Meta-hosted Embedded Signup with the real Meta `config_id`; show the Meta permission/consent screens and the authorized test WABA/phone. No token, App Secret, SMS OTP, private phone numbers or sensitive IDs shown.
4. **1:15–1:40:** Return to Connections; show the actual verified connection status (not simulated success). Show relevant WABA/phone asset management only if the app genuinely exposes it.
5. **1:40–2:25:** Receive a real inbound WhatsApp test message from an authorized controlled sender into the business-scoped Inbox; send a real policy-compliant reply and verify receipt in the controlled WhatsApp device. Use screen redaction for phone identifiers, people, and any private content.
6. **Optional separate Coexistence clip:** On an eligible controlled number already in WhatsApp Business App, show the official same-number selector and verify the existing mobile app remains usable. Do not record this until Meta Coexistence is genuinely available; never claim this from a mocked UI.
7. Capture a **separate focused, real screencast per requested permission** if the live Meta wizard requires separate video upload/description fields. Messaging clip: inbound webhook / Inbox and authorized reply. WhatsApp management clip: real Embedded Signup, WABA/phone verification and connection state. Business management clip, only if required: the Meta business asset selection/authorization actually requested by the current `config_id`. Public profile clip, only if a separate review field requires it: Meta login identity authorization with no fabricated profile UI. If any relevant behavior is blocked, disclose the blocker instead of editing together a fake success.

**Screencast availability:** no verified recording found or uploaded in this audit. Do not link, claim or upload a fabricated video. Verify the exact current video format, duration and placement requirements within the per-permission Meta wizard before upload.


### Independent App Review path vs. real-customer go-live (clarification after official Meta docs)

**Authoritative source:** Meta's WhatsApp Business Platform-owned Embedded Signup collection: https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup . It explicitly says to begin App Review **before** Embedded Signup is fully implemented, and names Advanced Access to business_management and whatsapp_business_management as release requirements. This is separate from Production readiness and real customer same-number entitlement.

**Reviewer requirements cannot be invented from generic guides.** On this account, read the **live per-permission Show Instructions** (Tech Provider / App Review wizard), including actual screencast and test-call rules. A practitioner report dated October 1, 2026 indicates some flows request: a controlled Meta "Try it out" send and live WhatsApp receipt for messaging; WhatsApp Manager template creation plus Meta Postman API calls for management, with up to about a day for calls to appear in the review form. This is **third-party experience, not confirmed instructions for this app**: https://www.amzath.com/blog/meta-whatsapp-app-review-guide . Follow this app's actual instructions over that report.

**Two truthful review demonstrations:**
- A real, official Meta Quickstart/Try It Out/sandbox flow using *Meta-provided* test WABA/phone/recipient where currently allowed. A provider-issued sandbox account is not fabricated client data; distinguish it from Production. Only use API calls that the user has authorized, and never reveal access tokens, credentials or private recipient identifiers in video. This route can often be prepared independently of a fully enabled real-customer Embedded Signup, but must meet the actual Meta form requirements.
- A deployed customer-facing app, with a real authorized reviewer Business, real provider connection, and genuine WhatsApp send/receive where required. This path requires #488 security scope, #487 UX/v4/secret transport, verified deployment and actual test assets; **not** necessarily permission approval yet if Meta gates the connection itself. If provider refuses onboarding pending Advanced Access, report that block, never fake success.

**Production activation remains a separate subsequent gate:** App Review Advanced Access approval + real configured v4 setup + valid GitHub Actions Meta secret/deploy + #488 -> #487 merges + Chatwoot verified provisioning + actual customer consent + official BUSINESS_APP_COEXISTENCE eligibility + isolated Business-scoped Inbox E2E. The existing WhatsApp Business mobile app must remain intact throughout.

**Specific likely video gap requiring live Meta instructions:** current repository code clearly sends WhatsApp messages and reads/subscribes authorized WABA/phone assets, but a dedicated **message-template create/edit UI** has not been identified in the current tree. If the actual WhatsApp Business Management wizard requires a template-creation demonstration, do not falsely claim such a Smart Visions UI exists. Determine whether genuine WhatsApp Manager operations are accepted under this application's exact review instruction, or implement the minimal real capability through the canonical code path only if necessary and approved. Do not invent a parallel template manager.

### Data Handling questionnaire: factual inventory vs. owner confirmation

| Topic | Evidence verified by project | Still requires explicit questionnaire / owner verification |
| --- | --- | --- |
| What data | Business and phone identifiers, integration credentials, WhatsApp messages/status/media metadata, scoped account/access/audit records; see Privacy Policy and code | Exact question wording, selected data categories, whether optional AI/media features have been enabled for any reviewer/customer |
| Meta / WhatsApp | Official Meta-hosted authorization, Graph asset reads, signed incoming webhook path and WhatsApp Cloud API sending | Exact Meta app product configuration and live entitlement; actual authorized reviewer WABA/phone |
| Supabase | Production project `pkypexzpyfbikdnkrzvw`, observed region `ap-south-1`, PostgreSQL 17, canonical records / authorization | Provider contractual disclosures, backups, data lifecycle, encryption in transit/at rest as configured, Vault credential retention and deletion specifics |
| Cloudflare | Workers hosts the production app and API | Actual runtime/logging/analytics processors, transfer/retention configuration, applicable data location policy and contractual terms |
| Chatwoot | Official Chatwoot CE communication plane at `inbox.smartvisionsai.com`, OVH VPS; projections/bridges in code | OVH hosting country/datacenter, VPS backups, message/attachment retention, access roster, activated real-customer provisioning |
| AI / other providers | App code has AI/runtime and provider integrations, controlled by configuration | Exactly which providers/models receive customer messages or media in the *submitted demonstrated flow*, AI on/off policy, opt-in, and any human-review/data-use commitments |
| Retention / deletion | Public deletion instructions describe a **manual identity-verified request**; disconnect is not automatic erasure | Specific retention durations, full processor deletion paths, lawful exceptions and fulfillment timeline before entering definite answers |
| Security and disclosure | Source contains access scope checks, provider signature/credential boundaries and policy controls | Whether the questionnaire requests guarantees for encryption, incident response, selling/sharing, training, cross-border processing, third-party disclosures or developer contact. Do not guess a Yes/No. |

**Do not complete Data Handling by inference from code.** Obtain the exact wizard questions and owner/legal confirmations for any declarations not demonstrated by runtime and contractual evidence. Never invent retention periods, encryption assurances, subprocessors or blanket AI-training restrictions.

### Meta policy, distinct approvals and decision gates

Meta's official 2026-10-09 post:
`https://developers.facebook.com/blog/post/2026/10/09/retiring-access-verification-for-tech-provider-apps/`

The public article says Access Verification is being removed from Tech Provider onboarding and no longer gates the affected API calls. It explicitly preserves **Business Verification**, **App Review of advanced permissions**, and **data-handling obligations**. This announcement is not proof that this exact app's Dashboard has transitioned or that its particular permissions are approved. Do not withdraw or resubmit the previously in-review Access Verification.

**Meta Dashboard App Review submission gate (not equivalent to first-customer Production launch):**

- [ ] Authenticated live read of current app, draft ID, app settings, permission statuses, unpublished/publish status.
- [ ] Verified company contact, approved category and icon; publicly reachable Privacy Policy and deletion instructions registered in the actual app.
- [ ] Actual Meta `config_id`, requested scopes and permission set are inspected. For a deployed customer connection/demo, Embedded Signup **v4** is verified first; App Review preparation/submission itself need not wait for production customer v4 activation unless the per-permission wizard says so.
- [ ] The required **review demonstration path** is operational, either an officially supported Meta-controlled real test/Quickstart route permitted by the per-permission wizard, **or** a deployed restricted reviewer-facing app route. For the latter only: GitHub Actions credentials, secure #488 -> #487 merge/deploy, v4 config and scoped access must be verified. Never claim a Meta test sender is a live customer.
- [ ] If a Coexistence demonstration is actually requested, official eligibility and genuine same-number authorization are verified; otherwise App Review may be demonstrated through the correct Meta-permitted independent test path. `META_WHATSAPP_COEXISTENCE_ENABLED` stays fail-closed for customers until eligibility is proven.
- [ ] Any requested reviewer login is a scoped, limited and tested account; any WhatsApp test asset is actually issued/authorized by Meta or owned with explicit consent. If per-permission official test tools do not require product login, explain their exact legitimate use without fabricating credentials.
- [ ] Actual authorized send/receive evidence is shown as specifically required by the current `whatsapp_business_messaging` instructions (Meta test sender/recipient or working scoped Inbox, whichever legitimately matches the form). Show WhatsApp receipt; no fake E2E claim. For `whatsapp_business_management`, inspect whether Meta specifically requests a real WhatsApp Manager template demo and API test calls, rather than assuming a Coexistence recording suffices.
- [ ] Exact per-permission screencast requirements inspected and genuine video captured, uploaded and reviewed.
- [ ] Exact Data Handling questions answered with authoritative technical + owner/legal support; explicit allowed-use acknowledgments accepted by authorized person.
- [ ] Current reviewer instructions saved in the actual Meta draft; all wizard sections green, Submit enabled.
- [ ] Only then submit the necessary permissions, capture the **actual Meta submission ID and final status**, and separately decide Publish/Live mode. Do not publish early.

**Historical preparation-only audit:** at the earlier audit no Meta fields were modified. The later live Dashboard execution below supersedes that no-access/no-mutation statement. App Review remains unsubmitted.

## Live Dashboard execution — 2026-10-12 Muscat (supersedes earlier no-access audit)

Authenticated Cloud Browser access is now available. App Review draft remains `2879554815753929`; this is not a final submitted request. App stays Unpublished, Submit remains disabled.

### Changes actually saved in Meta

- Basic settings: Privacy Policy `https://smartvisionsai.com/en/company/privacy`, manual Data Deletion Instructions `https://smartvisionsai.com/en/data-deletion`, Category **Business and pages**. Meta displayed **Changes saved**; a separate Basic-page read confirmed all three persisted.
- Added **Website** platform with Site URL `https://app.smartvisionsai.com/`; Meta displayed **Changes saved**. This resolved the previously hidden prerequisite for Reviewer Instructions (no platform configured).
- Saved evidence-bounded usage descriptions for `whatsapp_business_messaging`, `business_management`, and `whatsapp_business_management` through each permission's **Save** button. No allowed-usage checkbox accepted. WhatsApp Management Business Description was entered to open its form; the written description intentionally does not claim unsupported template/QR administration or blanket legal compliance.
- Saved reviewer instructions and Facebook Login integrated = Yes. Reopening the form confirmed persisted text. Instructions explicitly identify the dedicated restricted reviewer account, demonstrated integration and exact final test steps as pending; they are **not submission-ready**. No reviewer credential or real customer account was created.
- Data Handling: inspected real questions, selected factual existence of processors (Yes). The complete section and provider list remain incomplete; no unsupported country/authority-policy declaration was entered. Do not treat the selection as a completed questionnaire.

### Exact observed permission/testing requirements

| Permission | Live form requirement/status |
| --- | --- |
| whatsapp_business_messaging | Description, genuine screen recording, API testing, allowed-usage agreement. API calls **Completed**; no video uploaded. Form points to WhatsApp Try it out / Cloud Messaging API. |
| whatsapp_business_management | Description, genuine screen recording, terminal/Postman management API testing, allowed-usage agreement. API calls **Completed**; no video uploaded. Form gives phone/WABA settings as examples; no mandatory template-create demonstration stated in this inspected form. |
| business_management | Description, genuine recording, **0 of 1 API call(s) required**, allowed-usage agreement. Testing panel directs to Graph API Explorer. Existing Explorer token's selected permissions did not include business_management; no new permission grant or token was generated. |
| public_profile | Auto-granted baseline per live form; allowed-usage confirmation only. No independent description/video field appeared. No checkbox accepted. |

Testing page states successful test data may take 24 hours to appear and tests are valid for 30 days. Green test markers are Meta test evidence, not customer Production E2E.

### Configuration observed, not modified

Actual configuration **Smart Visions WhatsApp Signup**, ID `945907201473210`:
- Login variation: WhatsApp Embedded Signup.
- Products: WhatsApp Cloud API and Marketing Messages API for WhatsApp.
- System-user access token; expiration Never.
- Required asset: WhatsApp accounts. Tasks: develop, manage_templates, view_phone_assets, manage_phone_assets, view_templates, messaging, manage.
- Selected permissions: whatsapp_business_management, whatsapp_business_messaging. business_management is not listed in this configuration; retain review permission pending authoritative dependency verification, do not add/remove blindly.
- Read-only edit wizard inspection did not expose an explicit v4 version field. Cancelled without Save. No v4 attestation variable or Coexistence activation changed.

### Verification and Production evidence

- Live Verification: Business **Verified**, Access Verification **In review**. The app's Dashboard has not shown completed retirement/approval. Previously cited October 9 policy article could not be freshly retrieved through web lookup in this run; do not infer this app's entitlement from it.
- main remains `9d7c45c0db6a7208f4c9021359ba6d2d9e2d536d`.
- #494 head `8c2da6fd63b7330fdf95c5a7ceafb3c254f7d84c` CI `38194493805` **SUCCESS** (before this documentation update).
- #488 head `939590d05a904b56196aa3b817639e0214c64972` CI `37528770429` SUCCESS; #487 head `5f8ecde2fe3a990fcbc80fd38985c2dac01d188b` CI `37538031464` SUCCESS. Both remain Draft/unmerged; dependency order unchanged.
- Deploy `38134814312` latest inspected job `114456411747`: failed at Production credential preflight because META_APP_SECRET was absent; deployment steps skipped. Later same-main run `38194737290` skipped. No rerun without credential change.
- Live GitHub Actions secrets UI confirmed no repository META_APP_SECRET and no environment secrets. No secret read, copied, generated or configured by this execution.
- Read-only Supabase: tenant_businesses=0, member_scope_assignments=0, communication_channel_setup_attempts=0, unified_inbox_conversation_projections=0.
- Live authenticated Production Integrations: WhatsApp tenant Bindings=0, no real lifecycle binding, active tenant Business required, Embedded Signup blocked because App ID/config identifiers are not configured in the deployed environment. Existing legacy Meta/WhatsApp health is **STALE**, not new acceptance evidence.
- No first customer connected, no message sent, no production data mutation, no safety flag changes. Chatwoot current runtime version not independently verified in this execution.

### Concrete owner/legal gates

1. Official existing white PNG is 1024x1024, 58,809 bytes, visually checked. Basic confirms missing icon. Prepared crop dialog but **did not click Upload** because Meta requires certification of distribution rights and non-pornographic content. Obtain exact owner confirmation first.
2. Each of the four permission forms asks: “If approved, I agree that any data I receive through [permission] will be used in accordance with the allowed usage.” Obtain explicit owner confirmation before accepting.
3. Data Handling asks for every processor name, service categories, **all** processing/remote-access countries, legal controller and country, national-security disclosure history for past 12 months (excluding criminal warrant/court-order requests), and actual authority-request policies. Complete processor geography cannot be inferred from Supabase primary region alone; OVH location and provider access/processing countries remain pending.
4. Dedicated restricted reviewer account creation and test permission/asset authorization require specific approval before expanding access. No owner/customer Production credentials may be supplied.
5. Owner must enter the existing Meta App Secret directly in GitHub Actions encrypted secret `META_APP_SECRET`. Never through chat, docs, URL or logs. Then require exact App-ID/secret preflight and deployment success before #488 -> #487 promotion.
6. No genuine permission screencast has been provided/uploaded in this run. Independent official Meta test route remains possible; no test send is authorized without a specific controlled recipient/asset.

**Execution outcome:** settings/descriptions/reviewer draft saved; App Review NOT submitted; no new final Submission ID, permission approval, support Case ID or first-customer Production verification.

## Credential and scope-hardening closeout — 2026-10-12 Muscat (latest)

This entry supersedes earlier missing-secret, #488 unmerged and old-runtime statements above.

- Owner entered the existing Meta App Secret directly in GitHub Actions. Live settings list showed META_APP_SECRET dated October 12; value was not read/copied by the agent.
- Exact original-main deploy `38134814312` attempt 2 SUCCESS on `9d7c45c0db6a7208f4c9021359ba6d2d9e2d536d`: credential pairing, read-only Supabase validation, build, Candidate smoke, controlled SSR, promotion, routed Production and API/webhook rejection smokes passed. Runtime Integrations no longer showed the missing App ID/config banner; real Business/binding still absent.
- #488 existing branch synced to main with head `4b608a30fb286e8606e37053d1ecfbb2cc8ccd8c`; CI `38232962051` SUCCESS including PostgreSQL 17 Business isolation smoke. No unresolved reviews. Squash-merged to main `9414fea7d131db46c96171e594e2e8a1bf65b043`.
- Exact merged SQL blob `2093205be7b60736a691608ea8bb2736127bc6ef` applied to Production as `customer_business_membership_scope_hardening`, migration version `20261012100357`. Initial migration tool transport error was reconciled read-only (no migration/changed function), then one retry succeeded. Post-read confirmed one migration, scoped normalization guard/audit, canonical mapping policy and EXECUTE authenticated=true, anon=false, service_role=false. Businesses/scopes/invitations remain 0. No fake customer/isolation rows inserted in Production.
- Post-DDL security advisors unchanged from same-run baseline: rls_enabled_no_policy=17 INFO, auth_leaked_password_protection=1 WARN. No new finding claimed.
- Merged-main CI `38233479261` SUCCESS. Exact-main Cloudflare deploy `38233938930` attempt 1 failed on Wrangler's GET Candidate deployments response (HTTP 200 malformed body) before Production promotion. No successful new upload was reported. One controlled retry, attempt 2, SUCCESS including Candidate and routed Production smokes. Production is now verified on main `9414fea7d131db46c96171e594e2e8a1bf65b043`.
- #487 synced on its existing branch with #488/current main. Head `1113cc37a50f1daf3926e3b3c50202f7da3be97e`, behind main 0, original 22-file scope retained. Three-way merged shared Telegram coverage test preserved both Project Hunter classification and createCanonicalBusiness classification. CI `38234611779` **SUCCESS**, including PostgreSQL 17 migration smoke, full tests, Next build, Vinext and scheduled verification. **Still Draft/unmerged**: no v4 attestation variable changed and no provider-controlled v4 flow proven.
- App Review still not submitted. Icon rights certification, four allowed-usage declarations, complete processor geography/controller/authority-history answers, genuine recordings and restricted reviewer access remain pending. No new permission/token grant, customer consent, Coexistence activation, Chatwoot provisioning or provider send.
