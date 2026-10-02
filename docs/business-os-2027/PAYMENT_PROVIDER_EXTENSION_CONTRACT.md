# Payment Provider Extension Contract

## Purpose

`PAYMENT-EXTENSION` is the provider plug-in boundary for countries and gateways beyond the currently registered Tap and Thawani adapters. It extends the canonical `PAYMENT-CORE`; it is not a second payment system.

## Canonical authority

The following remain owned by PAYMENT-CORE for every provider:

- Payment Intent identity and lifecycle.
- Payment Link evidence.
- immutable provider event evidence.
- immutable transaction ledger.
- Refund request and result truth.
- Invoice settlement projection.
- reconciliation, idempotency and ambiguous-result handling.

A provider adapter must never create its own ledger, Invoice balance, Refund authority, scheduler, queue, IAM, secret store or generic webhook journal.

## Provider registration

Every executable provider must have one catalog definition and one server adapter. A definition declares:

- stable uppercase provider code;
- display label;
- supported ISO country codes;
- supported ISO currencies;
- explicit capabilities;
- credential/configuration strategy;
- `settlementAuthority=PAYMENT_CORE`.

Unregistered providers fail closed. A configured `integration_connections` row alone does not make an arbitrary provider executable.

## Capability contract

Current capabilities are:

- `HOSTED_PAYMENT_LINK`
- `VERIFIED_WEBHOOK`
- `SERVER_READBACK`
- `REFUND`
- `PARTIAL_REFUND`

The runtime checks currency and capability support before provider execution. Provider limitations are truth, not UI decoration. For example, the current Thawani adapter does not advertise partial refunds because the implemented safe path requires the full remaining refundable amount.

## Credentials

Provider plaintext credentials belong in the existing Supabase Vault boundary. `integration_connections` may retain only Vault references and non-secret configuration/evidence.

Each new provider configuration strategy must:

1. be service-role governed;
2. preserve Owner/Admin authorization at the application boundary;
3. avoid returning stored plaintext credentials to the browser;
4. distinguish configured `READY` state from verified `CONNECTED` provider evidence;
5. use the existing integration connection identity instead of creating a provider-specific credential table.

## Payment Link execution

The generic runtime resolves a registered adapter, validates the Payment Intent currency and required capability, then delegates protocol details to the provider adapter. The adapter must record the resulting link through canonical `record_payment_link_v1`.

Creating a provider resource or receiving HTTP 2xx is never settlement proof.

## Provider callbacks and reconciliation

Provider-specific signature/hash verification stays inside the provider protocol boundary. Only verified webhook evidence or authenticated server-to-server readback may enter canonical `record_payment_provider_event_v1`.

Unsigned or weak callbacks may trigger authenticated readback, but may not directly mark money paid/refunded.

Ambiguous network outcomes must enter the existing `RECONCILIATION_REQUIRED` path instead of blind retry or assumed success.

## Refund execution

Refund requests remain canonical PAYMENT-CORE records. A provider adapter may execute the provider API operation only when its catalog capabilities allow it. Partial refund behavior must be explicitly declared and enforced before provider execution.

A provider API request does not make a Refund successful; canonical success requires verified provider evidence/reconciliation.

## Adding a future provider

A future country/gateway should normally require:

1. catalog registration;
2. one provider adapter;
3. provider-specific credential configuration strategy;
4. verified callback and/or authenticated readback implementation;
5. capability/currency/country tests;
6. safe public callback routing where required;
7. controlled test evidence;
8. real merchant credentials/approval before claiming live E2E.

No provider should require changes to the PAYMENT-CORE ledger model merely because its API vocabulary differs.

## Current registered providers

- `TAP`: Oman / OMR; hosted link, verified webhook, server readback, refund and partial refund.
- `THAWANI`: Oman / OMR; hosted link, server readback and refund; current safe implementation does not advertise partial refund.

Real merchant activation and real-money E2E remain external evidence, not something a registry abstraction can manufacture.
