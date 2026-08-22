# Smart Visions Growth OS — Integration Inventory Freeze

**Reconciled:** 2026-08-22 (Oman, UTC+4)

This is the canonical operational inventory for the 19 integration/configuration slots tracked in Master Tracker #18. These are not 19 separately billed APIs. Several rows are credentials or runtime controls belonging to the same provider.

Status vocabulary: `CONNECTED` = controlled production E2E evidence exists; `READY` = code/config path exists but production E2E is not yet proven; `NOT_CONFIGURED` = required runtime credential/config is not confirmed; `OPTIONAL` = not required for V1 unless a concrete need appears.

| # | Slot | Purpose | Current reconciled state | Spend risk | Evidence / next action |
|---|---|---|---|---|---|
| 1 | Supabase public URL/client key | Browser/server authenticated data plane | CONNECTED | No per-call app API budget | Production Auth/RLS and Control Center are live. |
| 2 | Supabase server secret/service credential | Server-side privileged operations | CONNECTED | No provider call budget | Cost Guard/backend production operations have already succeeded. |
| 3 | OpenAI API | Agent reasoning / transcription-capable AI path | CONNECTED by production usage evidence; Integrations row is stale | Yes | Production usage contains a successful `AGENT_INTENT_DISCOVERY` call. Reconcile Integrations status in PR #37/#39 rather than retesting unnecessarily. |
| 4 | OpenAI model routing/config | Cheap/full model selection and token limits | CONNECTED / panel-configured foundation | Yes | Cost-aware runtime/model routing and editable agent settings already exist. Extend, do not rebuild. |
| 5 | Google Places API | Business discovery + qualification | CONNECTED | Yes | `integration_connections` says CONNECTED; production usage proves IDs-only + Place Details. |
| 6 | Crawl4AI service | Controlled website evidence/audit | READY in code, NOT_CONFIGURED in production inventory | Potential infra cost | Owner-only smoke-test path exists. Configure URL then verify once. |
| 7 | Email provider identity/config | Outbound provider selection/account identity | NOT_CONFIGURED | Yes | Existing provider abstraction/outreach model exists; choose/configure one provider in PR #37. |
| 8 | Email provider API credential | Actual send/receive integration | NOT_CONFIGURED | Yes | Configure only after provider choice; then one controlled E2E test. |
| 9 | Email sending domain DNS | SPF/DKIM/DMARC + sender health | NOT_CONFIGURED / external owner action | Indirect | Must be verified before live email pilot; do not fake CONNECTED from API-key presence. |
| 10 | Meta WhatsApp access token | WhatsApp Cloud API auth | NOT_CONFIGURED in production inventory | Yes | Meta provider code exists; credential + production verification remain. |
| 11 | Meta WhatsApp phone number ID | Sender identity | NOT_CONFIGURED in production inventory | No direct spend alone | Configure together with token. |
| 12 | Meta Graph API version | Graph endpoint contract | READY in env contract; production value not independently verified | No | Keep server-side; verify as part of WhatsApp E2E. |
| 13 | Meta App Secret | Webhook HMAC verification | NOT_CONFIGURED in production inventory | No | Signature-verification code exists; verify with real webhook. |
| 14 | Meta webhook verify token | Webhook subscription handshake | NOT_CONFIGURED in production inventory | No | Configure during Meta webhook setup. |
| 15 | Internal API key | Protect internal service endpoints | READY / implementation present; secret presence not exposed in panel | No | Keep server-only. Verify one internal protected route during final QA; never display value. |
| 16 | Redis/runtime queue | Optional async queue | OPTIONAL / NOT_CONFIGURED | Infra cost | Do not add unless PR #39 proves an actual queue/reliability requirement. |
| 17 | Vercel production environment/config | Runtime hosting and secure env | CONNECTED | Hosting cost | `main` deploys production app; env values remain secret and are not duplicated into DB. |
| 18 | Global runtime controls / Kill Switch | Emergency stop / channel controls | CONNECTED | Prevents spend | `system_controls.global_kill_switch=false`; DB is runtime source of truth with env only as bootstrap fallback. |
| 19 | Shadow Mode / autonomous outbound state | Prevent uncontrolled outbound before launch | CONNECTED / intentionally SAFE | Prevents spend | `system_controls.shadow_mode=true`; remain true through #37/#38 and final launch gates. |

## Provider rows currently present in production `integration_connections`

- `GOOGLE_PLACES / DISCOVERY` — `CONNECTED`, enabled.
- `CRAWL4AI / AUDIT` — `NOT_CONFIGURED`, disabled.
- `EMAIL_PROVIDER / EMAIL` — `NOT_CONFIGURED`, disabled.
- `META / WHATSAPP` — `NOT_CONFIGURED`, disabled.
- `META / INSTAGRAM` — `NOT_CONFIGURED`, disabled; Instagram automation remains policy-aware/semi-manual.
- `OPENAI / AI` — currently `NOT_CONFIGURED` in this table even though production usage proves OpenAI previously succeeded. This is a **status reconciliation gap**, not a reason to rebuild or burn another paid test immediately.
- `REDIS / QUEUE` — `NOT_CONFIGURED`, disabled and optional.

## Runtime control evidence

Production `system_controls` currently reports:

- global kill switch: off
- email paused: off
- WhatsApp AI paused: off
- agents paused: off
- Shadow Mode: on
- monthly budget: USD 150

These are existing controls. PR #39 may improve panel wiring/visibility, but must not create a second runtime-control system.

## Cost-first verification rule

Before any new smoke test, check durable DB/usage evidence. Do not repeat a paid provider call merely because `integration_connections` is stale. If prior evidence proves the provider worked, reconcile state first. Only run a new minimal smoke test when current credentials/configuration or an end-to-end path actually remains unproven.

## Locked ownership by remaining PR

- PR #37: Email + Meta WhatsApp + Voice + sales/conversation wiring; reconcile OpenAI status without rebuilding its runtime.
- PR #38: Preview/content production provider paths and generation cost linkage.
- PR #39: final Integrations health/status reconciliation, panel completeness, reliability, QA and launch gates.

No separate integration subsystem or duplicate secret store is allowed.