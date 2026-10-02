-- QUOTE-ENGINE post-deploy hardening.
-- Remove only redundant indexes detected by Production advisor after 0171.
-- Keep the older equivalent indexes as the canonical physical structures.

drop index if exists public.businesses_org_id_uidx;
drop index if exists public.catalog_product_prices_org_id_uidx;
drop index if exists public.quote_automation_projection_request_uidx;
