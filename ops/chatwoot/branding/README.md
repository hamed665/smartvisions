# Smart Visions Branding Overlay

This directory is the canonical customer-facing brand layer for `COMM-CHATWOOT-SOURCE`.

Identity:
- Product: **Smart Visions Inbox**
- Brand URL: `https://smartvisionsai.com`
- Visual reference: owner-approved SV blue/indigo mark with SMART VISIONS and `AI • DIGITAL GROWTH • TECHNOLOGY`.

Assets are clean SVG reconstructions, not screenshots. The build overlay copies them into Chatwoot Community and applies the shared auth stylesheet.

The overlay is limited to login, forgot-password and password-reset presentation. It does not touch `enterprise/`, provider ownership, API Inbox activation, customer data, Smart Core authority, Shadow Mode or outbound safety.

On every upstream upgrade, the overlay must be reapplied to the exact locked Chatwoot commit and Candidate-verified. Any source-fragment drift fails the build instead of silently shipping a partial rebrand.

Chatwoot remains the internal Communication Plane; Smart Core remains authoritative for business and provider truth.
