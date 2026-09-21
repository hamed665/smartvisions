# Migration / Evolution Map from Growth OS

Owner direction changes the product target from Growth OS to the broader AI Business OS. This does **not** authorize throwing away production-proven primitives.

## Reuse as canonical

The following existing primitives remain authoritative and should be extended:

| Existing primitive | Business OS role |
|---|---|
| Business / Lead / Campaign / Conversation CRM | foundation for CRM + Customer 360 |
| Google Places Hunter | Hunter discovery provider/path |
| deterministic qualification/service fit | Hunter/CRM qualification rule layer |
| Website Audit | prospect/business intelligence tool |
| multi-agent pipeline | initial Agent runtime |
| Context Hydrator | precursor to Context Compiler |
| conversation memory / sales_state | precursor to typed memory |
| knowledge_versions | Knowledge governance foundation |
| prompt_versions | Prompt Registry foundation |
| ZERO_COST/LIGHT/FULL routing | model/cost routing policy |
| OpenAI router | first provider adapter behind future AI Gateway |
| Cost Guard | internal paid-boundary and usage foundation |
| provider-bound send gate | outbound Action/Policy boundary foundation |
| WhatsApp/Email journals | channel adapter idempotency/reconciliation foundation |
| agent_runs.request_key | logical AI-run idempotency boundary |
| follow-up/automation primitives | workflow foundation |
| Telegram owner assistant | early Super Admin/Owner command plane |
| Portfolio matcher / Preview | specialized sales tooling |

## Extend, do not duplicate

### CRM

Do not create a parallel CRM database. Add contacts/identities/deals/custom objects/activities around the current canonical model through migrations and compatibility layers.

### Agents

Do not add another agent framework merely to obtain named agents. Introduce Agent Registry, Tool Registry, Policy Engine and Action Gateway around the existing runtime.

### Memory

Do not create an unrelated vector-only memory system. Evolve current conversation memory into typed memory with scope, confidence, source, freshness, sensitivity and validity.

### Knowledge

Continue versioned publishing. Add ownership, lifecycle, conflict/freshness and retrieval contracts.

### Automation

Do not introduce a second scheduler/outbox without measured production need. Formalize durable state, commands and compensation over current primitives first.

### Analytics

Reuse durable operational events/evidence. Add a governed analytics/metrics layer later; do not create competing transactional truth.

## New capabilities with no equivalent canonical primitive

These require new domain work, but must integrate through existing boundaries:

- Brand/Business/Branch hierarchy and config inheritance;
- Entitlement engine;
- customer-facing subscription/billing/pricing-version system;
- native-app coexistence abstraction across channels;
- contact identity resolution;
- Business Digital Twin;
- Industry Packs;
- explicit Policy Engine;
- explicit Action Gateway;
- typed long-term memory;
- booking/quote/commerce/payment domains;
- customer portal;
- Google Sheets reporting/export platform;
- enterprise SSO/SCIM;
- marketplace/partner portal;
- mobile business app.

## Production migration rule

Each implementation PR must classify changes as:

- REUSE;
- EXTEND;
- ADAPT;
- MIGRATE;
- NEW.

Any proposal marked REPLACE must include production evidence proving the canonical primitive cannot safely satisfy the Business OS requirement.

## First implementation slice

After Phase 0 docs are approved, the first code slice should be **Control Plane identity + business hierarchy + entitlement contract**, implemented backward-compatibly around the existing organization model.

It must not change outreach autonomy, Shadow Mode, current provider send behavior or current production pricing.
