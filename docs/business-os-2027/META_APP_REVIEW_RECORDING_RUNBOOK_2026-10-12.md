# Smart Visions Meta App Review — real recording runbook (2026-10-12)

> STATUS: PREPARATION ONLY. No videos captured or uploaded by this document; App Review draft 2879554815753929 remains unsubmitted. Do not substitute a marketing video, mock, synthetic tenant, fabricated connection, provider request sample response, or slideshow for running behavior.

## Scope and evidence priority

- Meta App: 2838776553165089; Meta Review draft: 2879554815753929; production app: https://app.smartvisionsai.com.
- In this session PR #494 at dbe0375955eac234891f39e655c6589a79dd3d6a was verified Draft/open; workflow 38237499207 job `validate` concluded SUCCESS. That proves docs validation only.
- Merged Production main 9414fea7d131db46c96171e594e2e8a1bf65b043 and successful deploy 38233938930 remain the latest documented runtime evidence, not freshly redeployed in this session.
- PR #487 at 1113cc37a50f1daf3926e3b3c50202f7da3be97e is Draft/unmerged. Its v4 and OAuth adjustments are NOT PRODUCTION_VERIFIED.
- Current Meta wizard information below is from the latest authenticated session transcribed in META_APP_REVIEW_READINESS.md, NOT from a fresh authenticated re-open of the private Show Instructions in this execution. Record and reconcile actual Show Instructions before filming or upload.
- Online Desktop Commander device observed: `vps-eae2ade9` (server); the user's interactive Windows desktop `DESKTOP-0K3842L` was offline. Neither is proof of an authorized browser session in Meta nor of a working camera/screen recorder.

## First action in the actual Meta Dashboard (human operator in an authenticated session)

1. Open the exact app in Meta for Developers, verify App ID and the existing draft ID. Do not create a second submission.
2. In the Tech Provider / App Review verification flow, open `whatsapp_business_messaging` and click **Show Instructions**. Capture a privacy-redacted screenshot and the literal required screencast actions, test-call instructions, format, size and duration if shown.
3. Repeat independently for `whatsapp_business_management` and `business_management`. Do not infer instructions from a generic online guide, even when its wording is similar.
4. Confirm whether `public_profile` still has no individual recording requirement. Inspect access levels, API-test counters, allowed-use states, reviewer access, Data Handling and whether Submit remains disabled.
5. The latest saved form observation: messaging API tests Completed; WhatsApp management API tests Completed; business_management API test 0/1; declarations saved; public_profile had no separate video field; no videos uploaded.
6. If the live Meta instructions differ from these assumptions, stop and update this runbook before generating or uploading evidence.

## Meta official early-review policy

- Official Meta Embedded Signup collection: https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup
- Meta recommends beginning App Review before Embedded Signup implementation is fully complete; it cites Advanced Access to `business_management` and `whatsapp_business_management` for release. This is NOT evidence that this app's live reviewer will accept a specific alternative scene.
- Official Cloud API collection: https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api
- Its Get Started information supports genuine API tests with permitted Meta test sender / WABA / recipient. Do not claim its response examples are real test results.

## Evidence and recording hygiene (all clips)

- Record continuous real application or official Meta tool actions using an actual screen recorder (OBS, operating-system recorder, etc.). No AI-generated video, stitched simulated output, prefilled developer-tool state, spoofed HTTP response, mock connection, avatar, or synthetic screenshot.
- Use a specifically owned/authorized Meta business, approved test phone/WABA, and whitelisted controlled recipient. Do not use the customer's existing WhatsApp Business number, inbox, or contacts.
- Hide actual passwords, OTPs, bearer tokens, cookies, app secrets, recipient/private phone numbers, unrelated business names, patient messages and developer-console credentials. Do not open these fields while recording.
- Preserve visible provenance: Meta App identity, official Meta UI/API result, actual authorized asset selected, timestamps, real sent/received message and observable status. Stop on failure and mark BLOCKED, not 'Connected'.
- If using a test environment, mark it plainly: 'This recording demonstrates Smart Visions using Meta’s official test environment. It does not represent a live customer connection.' Do not place this statement over a non-Test live screen or advertise production activation.
- Start and end with privacy review. Retain uncropped original privately; prepare redacted version without changing causal meaning. Only upload after the per-permission required actions are genuinely visible.
- MP4/H.264 landscape screen recordings can be a practical default for capture, NOT a verified Meta format requirement. Use exact form restrictions if they differ.

## Clip A — whatsapp_business_messaging

**Prerequisite**: Confirm whether the current Show Instructions explicitly accept Meta WhatsApp -> API Setup -> 'Try It Out' (or equivalent), as the previously inspected form pointed to it. Require an authorized Meta-provided test sender, permitted controlled WhatsApp recipient and usable sending permission.

Human capture sequence, ONLY when approved by the live instructions:
1. Show the logged-in Meta App / official WhatsApp API Setup for the correct app. Briefly identify the test-only WABA/phone; mask sensitive identifiers.
2. Show the real allowed test-recipient setup without exposing OTP/token/private number.
3. On-screen, initiate the actual Meta test send using the official tool or genuinely running Smart Visions app path specified by the form. Never claim a Meta console send came through Smart Visions Inbox.
4. Show the provider's actual successful send response or message id with sensitive portions redacted.
5. Show the controlled recipient actually receiving that matching message in real WhatsApp Web/mobile in the same recording if the form requests receipt.
6. If the form specifically requires Smart Visions Inbox inbound and reply, that is a separate, currently unproven Production E2E prerequisite. Do not substitute a Meta-only send as Inbox evidence.

**Gate**: No controlled test asset and recipient explicitly authorized for this recording in this conversation, and no live Meta session accessible to this execution: BLOCKED_EXTERNAL for direct capture. Historic API-test counter Completed does not equal a reviewed video.

## Clip B — whatsapp_business_management

**Prerequisite**: Open its live Show Instructions; the latest account-specific form showed genuine video plus terminal/Postman Management API tests and cited phone/WABA settings as examples, but DID NOT establish that template creation is mandatory.

Human capture sequence, strictly adapted to actual instructions:
1. Show a real authorized WABA and phone in WhatsApp Manager / official UI or an operational Smart Visions Connections path.
2. Show the exact requested authorized management action on those assets (for example actual phone details/authorized settings). Do not create/change a message template unless the app's live Show Instructions require it and the operator approves that real provider-side mutation.
3. Show actual permitted management API call(s) in Postman/terminal using official Meta API against the authorized test asset. Expose request path/method and HTTP status, mask Authorization header/tokens and sensitive response details.
4. If showing Embedded Signup, show actual Meta-hosted authorization and provider-verified WABA/phone returning to a real Business connection. An unfinished signup must not be edited to look successful.
5. Do not call internal `message_templates` UI a WhatsApp Manager template. It is not proof of Meta-side template administration.

**Gate**: Meta historical API-test Completed, but no fresh current video or verified working customer-connected WABA/inbox. Exact required scene pending live Show Instructions. No unauthorized Graph mutations.

## Clip C — business_management

**Current material discrepancy**: Previously observed Embedded Signup configuration ID `945907201473210` explicitly selected `whatsapp_business_management` and `whatsapp_business_messaging`, NOT `business_management`; code search did not prove a separate business-portfolio-admin feature. Meta's official Embedded Signup requirements may nevertheless require `business_management` Advanced Access. Neither drop nor fabricate this permission from inference.

Human/operator procedure:
1. Read live `business_management` Show Instructions and identify the exact allowed business-level API behavior. Confirm that the chosen app's token has this scope (the previous Graph API Explorer token did not).
2. Before expanding a token scope or generating a privileged token, ask for separate owner approval for this specific business and read-only query. Never paste tokens into chat or recording.
3. If live instructions accept a portfolio asset discovery read, the official Cloud API Postman documents `GET /{Business-ID}/owned_whatsapp_business_accounts` or `GET /{Business-ID}/client_whatsapp_business_accounts`; select an endpoint ONLY if the genuine product/config use and permission requirements align. These examples are not automatically justified by merely executing a GET.
4. Use Graph API Explorer's real test panel. Show application selection, authorized business, requested permission and redacted actual 200 response. Check whether Meta's '1 API call' counter increments (the form states it may take up to 24 hours to update).
5. Video must demonstrate a real feature actually depending on the reviewed permission, or the legitimately required Embedded Signup authorization flow, if accepted by exact instructions. Otherwise report BLOCKED and reconsider necessity with Meta rather than filming a fake portfolio UI.

**Gate**: 0/1 Meta API test and scope gap observed; no new permission/token grant authorized in current execution. BLOCKED_EXTERNAL for performing Graph test and clip now.

## public_profile

The most recent live Meta account observation treated this as baseline/automatically granted and required only accepted allowed use. If no new independent video control is shown on re-open, do NOT fabricate a fourth recording.

## Reviewer access

- Do not make a new Production Business, contact, invitation, binding, credential, Meta test asset or WhatsApp send merely to make a recording look convincing.
- A dedicated reviewer principal requires explicit owner approval specifying the target environment, role, email and test Business assets. Validate least privilege, expiration/cleanup plan, and Business isolation BEFORE adding access.
- If the per-permission official Meta Try It Out route legitimately needs no product login, don't invent one. If the form requires manual product access, only provide real working restricted credentials via Meta's secure reviewer fields, not GitHub or chat.
- Current historical Production evidence says no real customer Business/binding/inbox projection in the audited Smart Visions org. Do not claim a complete customer E2E.

## Customer protection and deployment separation

- For Sahara Center / مرکز صحرا: `BUSINESS_APP_COEXISTENCE` only. Keep same-number Coexistence fail-closed until official eligibility, real v4 config and safe approval are verified.
- Never delete WhatsApp Business App/account or its chat history, change number mode as a shortcut, set `META_WHATSAPP_COEXISTENCE_ENABLED=true`, merge #487 or turn on Chatwoot provisioning just to film before independent gates pass.
- Never introduce fake production messages or duplicate architecture. Documentation does not enact any production change.

## App Review final gate and honest disposition

| Permission | Real API test (last account observation) | Captured video | Direct executable state |
|---|---|---|---|
| whatsapp_business_messaging | Completed | None verified | DEPENDENCY_PENDING: current Show Instructions + owned authorized test sender/recipient + recording |
| whatsapp_business_management | Completed | None verified | DEPENDENCY_PENDING: current Show Instructions + genuine asset/operation + recording |
| business_management | 0/1 | None verified | BLOCKED_EXTERNAL: actual required usage, scope grant approval, authorized Graph Explorer call, recording |
| public_profile | separate test not observed | no separate field observed | Recheck live wizard; do not invent a clip |

Do not upload video until authentic clip is reviewed against the exact per-permission Meta Show Instructions, with credentials/sensitive fields removed. Complete Data Handling and authorized restricted reviewer access if demanded; only submit after Meta's actual Submit control enables.

## Separate legal question (MUST ask owner; never infer from customer-history)

Over the last 12 months, has Smart Visions or any service provider acting for it disclosed user/platform data to a public authority under a request concerning national security, excluding criminal warrants or court orders as the Meta form specifies? If Yes, obtain count/range and exact Meta form wording; if No, get an explicit No; if unknown, leave unanswered pending legal verification. This is NOT the question 'Have you previously connected a customer on Meta?'

Prepared as operational instructions, not evidence of a completed recording. All real media must be captured from the live authorized provider/product flow.
