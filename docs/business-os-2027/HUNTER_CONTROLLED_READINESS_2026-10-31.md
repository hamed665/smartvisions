# Hunter controlled readiness — 2026-10-31

## Bounded delivery package

Existing work packages: HUNTER-CUSTOMER-MODULE, MEMORY-V2 and AI-AGENT-RUNTIME. Owner authorized repairing/preparing the existing Muscat website-sales system. No new CRM, queue, memory table, Knowledge store, model framework or provider-send path is introduced. No schema migration or pricing change is required. The separate Website repository is untouched.

## Acceptance evidence

| Gap | Regression / verification | Result before release |
| --- | --- | --- |
| Scheduler redirected before internal-key auth | proxy-session-bypass + actual POST endpoint auth tests | Reproduced red; exact routes repaired; missing/wrong key returns 401 |
| Delivered/read outbound missing from AI history | conversation-memory-read-model + hydrator query update | Reproduced red; provider-confirmed statuses retained |
| Car-care instructions in organization website sales | hunter-readiness-regression + existing Sahra suite | Generic context independent; Sahra guidance retained |
| Generic human WhatsApp opener claimed an observation | gcc-human-script + persisted hooks wiring | Supported observations rendered; unknown evidence stays an introduction |
| Booking portal mistaken for independent website | exact-domain and lookalike tests | Noona/Altegio/Salonist covered; existing booking never described as absent |
| Expired campaign appears running | market-date boundary regression + Hunters UI | Effective PAUSED with TARGET_DATE_EXPIRED; draft status preserved |
| Memory V2 had no Agent staging path | agent-memory-staging tests | Exact customer turn proposed for owner review, scoped, expiring, no auto-approval |
| Sender status inferred from unrelated tenant binding | whatsapp-sender-identity + sender-action tests | Actual provider GET, owner-only, audited identity comparison, no test send |

Local suite: 298 files / 2191 tests passed. Next and Cloudflare builds passed. Scheduled bundle preserves full production cron `*/2 * * * *` and Sahra-only fast cron `* * * * *`; candidate isolation is unchanged. Full exact-head CI and routed production verification are still required separately.

## Production preparation

Campaign `ecaaff54-8bfa-4e5d-87af-c8fe9e69b7e4`: Muscat Website — Review Pilot — 2026-10-31, DRAFT, target three, no automatic discovery/send flags. OWNER-controlled UI mutations use existing audit actions. Initial audience must be real, freshly verified and independently service-qualified. High rating or missing website alone is not sale-fit proof. A booking portal is a valid existing conversion channel.

The initial operator workflow uses the existing Hunter, Growth Opportunity Router and Human Acquisition Queue. Review source evidence, current website/booking presence, DNC/contact identity and the actual suggested message. Any follow-up must refer to the actual conversation and canonical automation policy. Existing stale pending jobs are not permission to replay them.

In Integrations, enter `96877402910` under Expected organization sender and choose Check sender identity (no message). MATCHED is identity evidence at its timestamp, not proof of customer consent, deliverability or tenant routing. MISMATCH means the configured organization env sender differs; it never means the expected number is disconnected. UNVERIFIED means the read did not establish identity. Reconnect/credential changes require their own canonical workflow; this action cannot modify routing or credentials.

Approved portfolio is currently absent. Never fabricate client examples or sales outcomes. Safe drafts may offer an outline or ask a relevant question until real work is reviewed in the existing Portfolio page. No invented feature list, contract terms, discount or service-price changes are introduced.

## Rollout verification

1. Review exact-head CI and real PR review threads; merge only expected SHA.
2. Verify successful exact-main CI and Cloudflare Production Deploy on the merged SHA.
3. Verify signed OWNER pages render the new sender control and Hunter preparation evidence.
4. Read actual Meta sender identity and persist its comparison with 96877402910.
5. Observe the next natural production sampled heartbeat: exact worker version and repaired operation statuses, not merely public login health. Historical failures remain intact.
6. Re-read campaign/Shadow controls and confirm no prospect send occurred in this preparation.

A passing build does not authorize bulk outreach, disabling Shadow, reviving expired campaigns or claiming end-to-end sales success. No live customer traffic is used just to refresh badges.

## Rollback

Revert this bounded code package through normal exact-head CI/deploy. No schema/data migration rollback is needed. Existing Memory review items remain governed; reject or expire them through Memory V2 rather than deleting evidence. Keep the new campaign DRAFT and preserve old audited campaign history. Sender read evidence may be stale after a credential change; recheck identity explicitly. Never roll back by disabling approval, internal authentication, Cost Guard or DNC/human gates.
