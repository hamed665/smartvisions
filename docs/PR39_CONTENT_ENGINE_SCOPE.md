# PR #39 — Website Demo & Content Production Engine

This PR extends the existing Preview Studio, preview engine, portfolio matcher and Growth Opportunity routing. It must not redesign the Control Center or create a second preview, pricing, lead, CRM, agent or integration subsystem.

## Production rules

- Eligibility comes from the existing lead/growth scores and Preview Director configuration.
- Proposal-level deterministic generation comes before any paid/heavy media generation.
- Existing `previews`, `preview_events` and JSONB payload metadata hold version/fingerprint/lane metadata; no schema expansion unless a measured query or correctness need proves it necessary.
- Unchanged briefs reuse the existing active preview instead of regenerating.
- Website proposals use the existing preview engine/templates/quality gate.
- Muscat local content produces filming/shot/reel/photography proposals.
- Oman remote and international lanes produce AI-content concept packs, not automatic expensive media.
- Portfolio examples are matched by service, industry and market using the existing matcher.
- Deterministic proposal generation records zero-cost usage linked to the lead.
- Heavy generation is gated by explicit interest, owner approval, or configured value threshold.
- Never fabricate business defects, fake bad screenshots, or claim unsupported social weakness.

## Exit gate

One website opportunity and one content opportunity must each produce a versioned, reusable proposal path with quality/cost metadata and no duplicate generation for an unchanged brief. CI and Vercel must be green before merge.
