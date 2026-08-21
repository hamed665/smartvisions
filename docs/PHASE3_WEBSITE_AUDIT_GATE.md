# Phase 3 website audit gate

This gate intentionally starts with one enriched Oman lead and a deterministic, no-LLM website audit.

Production verification order:

1. Open the enriched lead detail page from `/leads`.
2. Run exactly one deterministic audit for its Google-sourced official website.
3. Verify one `website_audits` row completes, lead moves from `NEW` to `AUDITED`, and an audit log is written.
4. Verify no OpenAI/Google paid usage and no outreach rows are created by the audit.
5. Re-run within `audit_cache_days`; it must reuse the completed audit without a second website fetch or a second audit row.
6. Only after this gate passes should crawler provisioning/deeper multi-page audit and rule-based scoring continue.

Safety controls in this first pass:

- official website from the existing business record only;
- owner-only server action;
- DNS/private-address blocking and redirect revalidation;
- HTTP(S) only;
- manual redirects, maximum 2;
- 8-second request timeout;
- 1 MB response cap;
- HTML content only;
- daily website-audit quota from Cost Guard;
- cache window from Cost Guard;
- no LLM;
- no campaign or outreach side effect.
