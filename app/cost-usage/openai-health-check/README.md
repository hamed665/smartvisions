# OpenAI Health Check

Owner-only production smoke test for Smart Visions. The page runs only the `intent_discovery` agent on a fixed sample message, enforces Cost Guard first, records token/cost usage, and never sends outreach or mutates lead/campaign state.
