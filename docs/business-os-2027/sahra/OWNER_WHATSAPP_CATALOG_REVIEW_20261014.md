# Sahra owner catalog review (2026-10-14)

**Not imported into Production.** The attached JSON is a controlled owner-review input derived from WhatsApp Business screenshots, not an authorized catalog mutation and not customer-facing inventory. Original visible titles and provisional categories are preserved without fabricating stock or prices.

## Canonical import only
Use Smart Visions Catalog-V2 with an authenticated OWNER. Action: saveCatalogProductV2 in app/catalog/actions.ts, using governed RPC upsert_catalog_product_v2. Scope: Sahra tenant Business only. The connected SQL role cannot authorize owner-controlled mutations. Do not insert into catalog_products directly or impersonate an owner.

Each item must be checked, deduplicated, and approved. Until verified: availability_mode=NOT_OFFERED, inventory_mode=NONE, no price, warranty, fitment, installation or in-stock claim. Catalog labels such as 'German leather' and 'waterproof' are unverified. The US website desertcarcare.com must not be advertised as Sahra's website.

After owner-authorized import, verify tenant scope, revision audit receipts, absence of unapproved availability claims and actual customer reply behavior. No Meta bindings, old customer messages or safety settings should be changed.
