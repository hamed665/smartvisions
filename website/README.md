# Smart Visions Global Website

This directory is intentionally isolated from the existing Smart Visions Growth OS application.

## Safety boundary
- The existing repository root remains the Growth OS runtime.
- This website is a standalone Next.js application under `/website`.
- Do not change root app, root proxy, agent runtime, outreach providers, or current Supabase migrations from website PRs.
- Vercel must use a separate project with **Root Directory = `website`** before this site is put into production.
- The existing Growth OS Vercel project must remain attached to the repository root.

## Local checks
```bash
cd website
npm install
npm run lint
npm run typecheck
npm run build
```

## Environment
Copy `.env.example` values into the website Vercel project only. Never copy Growth OS server secrets into public website variables.

## PR roadmap
1. Global foundation + design system + i18n + SEO shell
2. Corporate + services + industries + markets
3. Independent multilingual editorial + SEO/GEO + knowledge graph
4. Signup + client portal + conversion + WhatsApp sales
5. Admin OS + CMS + CRM + automation integrations
6. Portfolio + authority + analytics + security + production hardening
