import Link from 'next/link';

import {
  configureServiceCatalogV2,
  saveCatalogMediaV2,
  saveCatalogProductPriceV2,
  saveCatalogProductV2,
  saveCatalogRelationV2,
  saveCatalogVariantV2,
} from './actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

type BranchRow = {
  id: string;
  tenant_business_id: string;
  name: string;
  code: string;
  status: string;
};

function subjectRef(kind: 'SERVICE' | 'PRODUCT' | 'VARIANT', id: string) {
  return kind + ':' + id;
}

function catalogSubjectRef(serviceId: unknown, productId: unknown, variantId: unknown) {
  if (serviceId) return subjectRef('SERVICE', String(serviceId));
  if (productId) return subjectRef('PRODUCT', String(productId));
  if (variantId) return subjectRef('VARIANT', String(variantId));
  throw new Error('Catalog subject is missing');
}

function money(value: unknown, currency: string | null | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${currency ?? ''}`.trim();
}

export default async function CatalogPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const editable = role === 'OWNER';

  const [
    { data: services },
    { data: servicePrices },
    { data: serviceProfiles },
    { data: businesses },
    { data: branches },
    { data: products },
    { data: variants },
    { data: productPrices },
    { data: availability },
    { data: media },
    { data: relations },
    { data: portfolio },
  ] = await Promise.all([
    supabase.from('services')
      .select('id,name,enabled')
      .eq('organization_id', organizationId)
      .order('name'),
    supabase.from('service_prices')
      .select('id,service_id,country_code,currency,price,minimum_price,premium_price')
      .eq('organization_id', organizationId)
      .order('country_code'),
    supabase.from('catalog_service_profiles')
      .select('service_id,description,warranty_text,availability_mode,version')
      .eq('organization_id', organizationId),
    supabase.from('tenant_businesses')
      .select('id,name,status')
      .eq('organization_id', organizationId)
      .eq('status', 'ACTIVE')
      .order('name'),
    supabase.from('branches')
      .select('id,tenant_business_id,name,code,status')
      .eq('organization_id', organizationId)
      .eq('status', 'ACTIVE')
      .order('name'),
    supabase.from('catalog_products')
      .select('id,tenant_business_id,sku,name,description,status,warranty_text,availability_mode,inventory_mode,inventory_reference,version')
      .eq('organization_id', organizationId)
      .order('name'),
    supabase.from('catalog_product_variants')
      .select('id,product_id,sku,name,attributes,status,inventory_mode,inventory_reference,version')
      .eq('organization_id', organizationId)
      .order('name'),
    supabase.from('catalog_product_prices')
      .select('id,product_id,variant_id,country_code,currency,price,minimum_price,compare_at_price,version')
      .eq('organization_id', organizationId)
      .order('country_code'),
    supabase.from('catalog_branch_availability')
      .select('branch_id,service_id,product_id,variant_id,enabled')
      .eq('organization_id', organizationId)
      .eq('enabled', true),
    supabase.from('catalog_media_assets')
      .select('id,service_id,product_id,variant_id,media_type,source_type,public_url,portfolio_item_id,alt_text,sort_order,approved,version')
      .eq('organization_id', organizationId)
      .order('sort_order'),
    supabase.from('catalog_item_relations')
      .select('id,source_service_id,source_product_id,source_variant_id,target_service_id,target_product_id,target_variant_id,relation_type,quantity,required,sort_order,version')
      .eq('organization_id', organizationId)
      .order('sort_order'),
    supabase.from('portfolio_items')
      .select('id,title,service_id,public_url,approved')
      .eq('organization_id', organizationId)
      .eq('approved', true)
      .order('title'),
  ]);

  const serviceRows = services ?? [];
  const servicePriceRows = servicePrices ?? [];
  const profileRows = serviceProfiles ?? [];
  const businessRows = businesses ?? [];
  const branchRows = (branches ?? []) as BranchRow[];
  const productRows = products ?? [];
  const variantRows = variants ?? [];
  const priceRows = productPrices ?? [];
  const availabilityRows = availability ?? [];
  const mediaRows = media ?? [];
  const relationRows = relations ?? [];
  const portfolioRows = portfolio ?? [];

  const profileByService = new Map(profileRows.map((row) => [String(row.service_id), row]));
  const pricesByService = new Map<string, typeof servicePriceRows>();
  for (const row of servicePriceRows) {
    const key = String(row.service_id);
    const current = pricesByService.get(key) ?? [];
    current.push(row);
    pricesByService.set(key, current);
  }

  const branchesByService = new Map<string, Set<string>>();
  const branchesByProduct = new Map<string, Set<string>>();
  for (const row of availabilityRows) {
    if (row.service_id) {
      const set = branchesByService.get(String(row.service_id)) ?? new Set<string>();
      set.add(String(row.branch_id));
      branchesByService.set(String(row.service_id), set);
    }
    if (row.product_id && !row.variant_id) {
      const set = branchesByProduct.get(String(row.product_id)) ?? new Set<string>();
      set.add(String(row.branch_id));
      branchesByProduct.set(String(row.product_id), set);
    }
  }

  const variantsByProduct = new Map<string, typeof variantRows>();
  for (const row of variantRows) {
    const key = String(row.product_id);
    const current = variantsByProduct.get(key) ?? [];
    current.push(row);
    variantsByProduct.set(key, current);
  }

  const pricesByProduct = new Map<string, typeof priceRows>();
  for (const row of priceRows) {
    const key = String(row.product_id);
    const current = pricesByProduct.get(key) ?? [];
    current.push(row);
    pricesByProduct.set(key, current);
  }

  const businessNameById = new Map(businessRows.map((row) => [String(row.id), String(row.name)]));
  const productNameById = new Map(productRows.map((row) => [String(row.id), String(row.name)]));
  const variantNameById = new Map(variantRows.map((row) => [String(row.id), String(row.name)]));
  const serviceNameById = new Map(serviceRows.map((row) => [String(row.id), String(row.name)]));

  const subjects = [
    ...serviceRows.map((row) => ({
      ref: subjectRef('SERVICE', String(row.id)),
      label: `Service · ${row.name}`,
    })),
    ...productRows.map((row) => ({
      ref: subjectRef('PRODUCT', String(row.id)),
      label: `Product · ${row.name}`,
    })),
    ...variantRows.map((row) => ({
      ref: subjectRef('VARIANT', String(row.id)),
      label: `Variant · ${productNameById.get(String(row.product_id)) ?? 'Product'} / ${row.name}`,
    })),
  ];

  const productCreateId = crypto.randomUUID();
  const mediaCreateId = crypto.randomUUID();
  const relationCreateId = crypto.randomUUID();

  function relationLabel(row: typeof relationRows[number], side: 'source' | 'target') {
    const serviceId = side === 'source' ? row.source_service_id : row.target_service_id;
    const productId = side === 'source' ? row.source_product_id : row.target_product_id;
    const variantId = side === 'source' ? row.source_variant_id : row.target_variant_id;
    if (serviceId) return `Service · ${serviceNameById.get(String(serviceId)) ?? serviceId}`;
    if (productId) return `Product · ${productNameById.get(String(productId)) ?? productId}`;
    if (variantId) return `Variant · ${variantNameById.get(String(variantId)) ?? variantId}`;
    return 'Unknown';
  }

  return <div>
    <div className="headerRow">
      <div>
        <h1>Catalog</h1>
        <p className="muted">
          Canonical Services, Products, Variants, media, availability and bundle/add-on metadata.
          Service pricing remains owned by <code>service_prices</code>; Product pricing is owned by <code>catalog_product_prices</code>.
        </p>
      </div>
      <div>
        <span className="status">{serviceRows.length} services</span>
        <span className="status">{productRows.length} products</span>
      </div>
    </div>

    <section className="panel">
      <h2>Authority boundaries</h2>
      <p className="muted">
        This page does not create stock quantities, reservations, fulfillment, quotes, orders, invoices or payments.
        Inventory reference is descriptive linkage only until <strong>INVENTORY-FULFILLMENT</strong>.
      </p>
      <p className="muted">
        Existing Service identity and pricing stay in <code>services</code> and <code>service_prices</code>.
        Edit Service prices in <Link className="textLink" href="/pricing">Pricing</Link>.
      </p>
    </section>

    <section className="panel">
      <div className="headerRow">
        <div>
          <h2>Services</h2>
          <p className="muted">CATALOG-V2 metadata extends the existing Service authority; it does not replace it.</p>
        </div>
      </div>
      <div className="settingsList">
        {serviceRows.map((service) => {
          const profile = profileByService.get(String(service.id));
          const selectedBranches = branchesByService.get(String(service.id)) ?? new Set<string>();
          const prices = pricesByService.get(String(service.id)) ?? [];
          return <form action={configureServiceCatalogV2} className="settingsRow" key={service.id}>
            <input type="hidden" name="service_id" value={service.id} />
            <input type="hidden" name="request_key" value={`catalog-v2-service:${service.id}:${crypto.randomUUID()}`} />
            {profile ? <input type="hidden" name="expected_version" value={profile.version} /> : null}
            <div>
              <strong>{service.name}</strong>
              <span className="muted smallText">{service.id} · {service.enabled ? 'Enabled' : 'Disabled'} · Catalog v{profile?.version ?? 'new'}</span>
              <span className="muted smallText">
                Pricing: {prices.length
                  ? prices.map((row) => `${row.country_code} ${money(row.price, row.currency)}`).join(' · ')
                  : 'No service price'}
              </span>
            </div>
            <label>Description
              <textarea name="description" defaultValue={profile?.description ?? ''} disabled={!editable} rows={3} />
            </label>
            <label>Warranty
              <textarea name="warranty_text" defaultValue={profile?.warranty_text ?? ''} disabled={!editable} rows={2} />
            </label>
            <label>Availability
              <select name="availability_mode" defaultValue={profile?.availability_mode ?? 'ALL_ACTIVE_BRANCHES'} disabled={!editable}>
                <option value="ALL_ACTIVE_BRANCHES">All active branches</option>
                <option value="EXPLICIT_BRANCHES">Selected branches</option>
                <option value="ONLINE_ONLY">Online only</option>
                <option value="NOT_OFFERED">Not offered</option>
              </select>
            </label>
            <div>
              <strong className="smallText">Explicit branches</strong>
              {branchRows.length ? branchRows.map((branch) => <label className="toggleLabel" key={branch.id}>
                <input
                  type="checkbox"
                  name="branch_id"
                  value={branch.id}
                  defaultChecked={selectedBranches.has(String(branch.id))}
                  disabled={!editable}
                />
                {branch.name} · {branch.code}
              </label>) : <span className="muted smallText">No tenant Branches exist yet.</span>}
            </div>
            <button disabled={!editable}>Save Service catalog</button>
          </form>;
        })}
      </div>
    </section>

    <section className="panel settingsCreate">
      <h2>Create Product</h2>
      <p className="muted">Products require an existing active tenant Business. Production currently stays empty until a real Business exists.</p>
      {businessRows.length ? <form action={saveCatalogProductV2} className="settingsGrid">
        <input type="hidden" name="product_id" value={productCreateId} />
        <input type="hidden" name="request_key" value={`catalog-v2-product:${productCreateId}:${crypto.randomUUID()}`} />
        <label>Business
          <select name="tenant_business_id" required disabled={!editable}>
            {businessRows.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
          </select>
        </label>
        <label>SKU<input name="sku" required maxLength={80} disabled={!editable} /></label>
        <label>Name<input name="name" required maxLength={240} disabled={!editable} /></label>
        <label>Status
          <select name="status" defaultValue="ACTIVE" disabled={!editable}>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <label>Description<textarea name="description" rows={3} disabled={!editable} /></label>
        <label>Warranty<textarea name="warranty_text" rows={2} disabled={!editable} /></label>
        <label>Availability
          <select name="availability_mode" defaultValue="ALL_ACTIVE_BRANCHES" disabled={!editable}>
            <option value="ALL_ACTIVE_BRANCHES">All active Business branches</option>
            <option value="EXPLICIT_BRANCHES">Selected branches</option>
            <option value="ONLINE_ONLY">Online only</option>
            <option value="NOT_OFFERED">Not offered</option>
          </select>
        </label>
        <label>Inventory mode
          <select name="inventory_mode" defaultValue="NONE" disabled={!editable}>
            <option value="NONE">No inventory linkage</option>
            <option value="REFERENCE_ONLY">External/reference only</option>
          </select>
        </label>
        <label>Inventory reference<input name="inventory_reference" maxLength={512} disabled={!editable} placeholder="ERP/SKU/reference only" /></label>
        <div>
          <strong className="smallText">Explicit branches</strong>
          {branchRows.map((branch) => <label className="toggleLabel" key={branch.id}>
            <input type="checkbox" name="branch_id" value={branch.id} disabled={!editable} />
            {businessNameById.get(String(branch.tenant_business_id)) ?? 'Business'} · {branch.name}
          </label>)}
        </div>
        <button disabled={!editable}>Create Product</button>
      </form> : <p className="muted">No active tenant Business exists. Product creation is intentionally unavailable instead of inventing one.</p>}
    </section>

    <div className="settingsList">
      {productRows.map((product) => {
        const productVariants = variantsByProduct.get(String(product.id)) ?? [];
        const productPrices = pricesByProduct.get(String(product.id)) ?? [];
        const selectedBranches = branchesByProduct.get(String(product.id)) ?? new Set<string>();
        const productBranches = branchRows.filter((branch) => String(branch.tenant_business_id) === String(product.tenant_business_id));
        const variantCreateId = crypto.randomUUID();
        const priceCreateId = crypto.randomUUID();

        return <section className="panel" key={product.id}>
          <form action={saveCatalogProductV2} className="settingsRow">
            <input type="hidden" name="product_id" value={product.id} />
            <input type="hidden" name="tenant_business_id" value={product.tenant_business_id} />
            <input type="hidden" name="expected_version" value={product.version} />
            <input type="hidden" name="request_key" value={`catalog-v2-product:${product.id}:${crypto.randomUUID()}`} />
            <div>
              <strong>{product.name}</strong>
              <span className="muted smallText">{product.sku} · {businessNameById.get(String(product.tenant_business_id)) ?? product.tenant_business_id}</span>
              <span className="muted smallText">v{product.version} · {product.status} · inventory {product.inventory_mode}</span>
            </div>
            <label>SKU<input name="sku" defaultValue={product.sku} required disabled={!editable} /></label>
            <label>Name<input name="name" defaultValue={product.name} required disabled={!editable} /></label>
            <label>Status
              <select name="status" defaultValue={product.status} disabled={!editable}>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <label>Description<textarea name="description" defaultValue={product.description ?? ''} rows={3} disabled={!editable} /></label>
            <label>Warranty<textarea name="warranty_text" defaultValue={product.warranty_text ?? ''} rows={2} disabled={!editable} /></label>
            <label>Availability
              <select name="availability_mode" defaultValue={product.availability_mode} disabled={!editable}>
                <option value="ALL_ACTIVE_BRANCHES">All active Business branches</option>
                <option value="EXPLICIT_BRANCHES">Selected branches</option>
                <option value="ONLINE_ONLY">Online only</option>
                <option value="NOT_OFFERED">Not offered</option>
              </select>
            </label>
            <label>Inventory mode
              <select name="inventory_mode" defaultValue={product.inventory_mode} disabled={!editable}>
                <option value="NONE">No inventory linkage</option>
                <option value="REFERENCE_ONLY">External/reference only</option>
              </select>
            </label>
            <label>Inventory reference<input name="inventory_reference" defaultValue={product.inventory_reference ?? ''} disabled={!editable} /></label>
            <div>
              <strong className="smallText">Explicit branches</strong>
              {productBranches.length ? productBranches.map((branch) => <label className="toggleLabel" key={branch.id}>
                <input
                  type="checkbox"
                  name="branch_id"
                  value={branch.id}
                  defaultChecked={selectedBranches.has(String(branch.id))}
                  disabled={!editable}
                />
                {branch.name} · {branch.code}
              </label>) : <span className="muted smallText">No active Business branches.</span>}
            </div>
            <button disabled={!editable}>Save Product</button>
          </form>

          <div className="settingsCreate">
            <h3>Variants</h3>
            <p className="muted smallText">Variants inherit Product branch availability in CATALOG-V2. Stock quantities remain deferred.</p>
            <form action={saveCatalogVariantV2} className="settingsGrid">
              <input type="hidden" name="variant_id" value={variantCreateId} />
              <input type="hidden" name="product_id" value={product.id} />
              <input type="hidden" name="request_key" value={`catalog-v2-variant:${variantCreateId}:${crypto.randomUUID()}`} />
              <label>SKU<input name="sku" required disabled={!editable} /></label>
              <label>Name<input name="name" required disabled={!editable} /></label>
              <label>Attributes JSON<input name="attributes_json" defaultValue="{}" disabled={!editable} /></label>
              <label>Status
                <select name="status" defaultValue="ACTIVE" disabled={!editable}>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
              <label>Inventory mode
                <select name="inventory_mode" defaultValue="INHERIT" disabled={!editable}>
                  <option value="INHERIT">Inherit Product</option>
                  <option value="NONE">No inventory linkage</option>
                  <option value="REFERENCE_ONLY">External/reference only</option>
                </select>
              </label>
              <label>Inventory reference<input name="inventory_reference" disabled={!editable} /></label>
              <button disabled={!editable}>Add Variant</button>
            </form>

            {productVariants.map((variant) => <form action={saveCatalogVariantV2} className="settingsRow" key={variant.id}>
              <input type="hidden" name="variant_id" value={variant.id} />
              <input type="hidden" name="product_id" value={product.id} />
              <input type="hidden" name="expected_version" value={variant.version} />
              <input type="hidden" name="request_key" value={`catalog-v2-variant:${variant.id}:${crypto.randomUUID()}`} />
              <div>
                <strong>{variant.name}</strong>
                <span className="muted smallText">{variant.sku} · v{variant.version}</span>
              </div>
              <label>SKU<input name="sku" defaultValue={variant.sku} required disabled={!editable} /></label>
              <label>Name<input name="name" defaultValue={variant.name} required disabled={!editable} /></label>
              <label>Attributes JSON
                <input name="attributes_json" defaultValue={JSON.stringify(variant.attributes ?? {})} disabled={!editable} />
              </label>
              <label>Status
                <select name="status" defaultValue={variant.status} disabled={!editable}>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
              <label>Inventory mode
                <select name="inventory_mode" defaultValue={variant.inventory_mode} disabled={!editable}>
                  <option value="INHERIT">Inherit Product</option>
                  <option value="NONE">No inventory linkage</option>
                  <option value="REFERENCE_ONLY">External/reference only</option>
                </select>
              </label>
              <label>Inventory reference<input name="inventory_reference" defaultValue={variant.inventory_reference ?? ''} disabled={!editable} /></label>
              <button disabled={!editable}>Save Variant</button>
            </form>)}
          </div>

          <div className="settingsCreate">
            <h3>Product pricing</h3>
            <p className="muted smallText">This is Product/Variant pricing only. Existing Service prices are not copied here.</p>
            <form action={saveCatalogProductPriceV2} className="settingsGrid">
              <input type="hidden" name="price_id" value={priceCreateId} />
              <input type="hidden" name="product_id" value={product.id} />
              <input type="hidden" name="request_key" value={`catalog-v2-price:${priceCreateId}:${crypto.randomUUID()}`} />
              <label>Variant
                <select name="variant_id" defaultValue="" disabled={!editable}>
                  <option value="">Base Product</option>
                  {productVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} · {variant.sku}</option>)}
                </select>
              </label>
              <label>Country<input name="country_code" defaultValue="OM" maxLength={2} required disabled={!editable} /></label>
              <label>Currency<input name="currency" defaultValue="OMR" maxLength={3} required disabled={!editable} /></label>
              <label>Price<input name="price" type="number" min="0" step="0.0001" required disabled={!editable} /></label>
              <label>Minimum<input name="minimum_price" type="number" min="0" step="0.0001" disabled={!editable} /></label>
              <label>Compare-at<input name="compare_at_price" type="number" min="0" step="0.0001" disabled={!editable} /></label>
              <button disabled={!editable}>Add Price</button>
            </form>
            {productPrices.map((price) => <form action={saveCatalogProductPriceV2} className="settingsRow" key={price.id}>
              <input type="hidden" name="price_id" value={price.id} />
              <input type="hidden" name="product_id" value={product.id} />
              <input type="hidden" name="expected_version" value={price.version} />
              <input type="hidden" name="request_key" value={`catalog-v2-price:${price.id}:${crypto.randomUUID()}`} />
              <div>
                <strong>{price.variant_id ? variantNameById.get(String(price.variant_id)) ?? 'Variant' : 'Base Product'}</strong>
                <span className="muted smallText">v{price.version}</span>
              </div>
              <input type="hidden" name="variant_id" value={price.variant_id ?? ''} />
              <label>Price subject
                <span className="muted smallText">
                  {price.variant_id ? variantNameById.get(String(price.variant_id)) ?? 'Variant' : 'Base Product'}
                </span>
              </label>
              <label>Country<input name="country_code" defaultValue={price.country_code} required disabled={!editable} /></label>
              <label>Currency<input name="currency" defaultValue={price.currency} required disabled={!editable} /></label>
              <label>Price<input name="price" type="number" step="0.0001" min="0" defaultValue={price.price} required disabled={!editable} /></label>
              <label>Minimum<input name="minimum_price" type="number" step="0.0001" min="0" defaultValue={price.minimum_price ?? ''} disabled={!editable} /></label>
              <label>Compare-at<input name="compare_at_price" type="number" step="0.0001" min="0" defaultValue={price.compare_at_price ?? ''} disabled={!editable} /></label>
              <button disabled={!editable}>Save Price</button>
            </form>)}
          </div>
        </section>;
      })}
    </div>

    <section className="panel settingsCreate">
      <h2>Catalog media</h2>
      <p className="muted">Media is metadata/reference only. No parallel binary media store is created.</p>
      {subjects.length ? <form action={saveCatalogMediaV2} className="settingsGrid">
        <input type="hidden" name="media_id" value={mediaCreateId} />
        <input type="hidden" name="request_key" value={`catalog-v2-media:${mediaCreateId}:${crypto.randomUUID()}`} />
        <label>Catalog item
          <select name="subject_ref" required disabled={!editable}>
            {subjects.map((subject) => <option value={subject.ref} key={subject.ref}>{subject.label}</option>)}
          </select>
        </label>
        <label>Media type
          <select name="media_type" defaultValue="IMAGE" disabled={!editable}>
            <option value="IMAGE">Image</option>
            <option value="VIDEO">Video</option>
            <option value="DOCUMENT">Document</option>
          </select>
        </label>
        <label>Source
          <select name="source_type" defaultValue="HTTPS_URL" disabled={!editable}>
            <option value="HTTPS_URL">HTTPS URL</option>
            <option value="PORTFOLIO_ITEM">Approved Service portfolio item</option>
          </select>
        </label>
        <label>HTTPS URL<input name="public_url" type="url" placeholder="https://…" disabled={!editable} /></label>
        <label>Approved portfolio item
          <select name="portfolio_item_id" defaultValue="" disabled={!editable}>
            <option value="">None</option>
            {portfolioRows.map((item) => <option value={item.id} key={item.id}>{item.title} · {item.service_id ?? 'unscoped'}</option>)}
          </select>
        </label>
        <label>Alt text<input name="alt_text" maxLength={500} disabled={!editable} /></label>
        <label>Sort order<input name="sort_order" type="number" defaultValue={0} disabled={!editable} /></label>
        <label className="toggleLabel"><input name="approved" type="checkbox" defaultChecked disabled={!editable} /> Approved</label>
        <button disabled={!editable}>Add Media</button>
      </form> : <p className="muted">No catalog subjects exist yet.</p>}

      <div className="settingsList">
        {mediaRows.map((item) => <form action={saveCatalogMediaV2} className="settingsRow" key={item.id}>
          <input type="hidden" name="media_id" value={item.id} />
          <input type="hidden" name="expected_version" value={item.version} />
          <input type="hidden" name="request_key" value={`catalog-v2-media:${item.id}:${crypto.randomUUID()}`} />
          <input
            type="hidden"
            name="subject_ref"
            value={catalogSubjectRef(item.service_id, item.product_id, item.variant_id)}
          />
          <div>
            <strong>{item.media_type}</strong>
            <span className="muted smallText">{item.source_type} · v{item.version}</span>
          </div>
          <label>Media type
            <select name="media_type" defaultValue={item.media_type} disabled={!editable}>
              <option value="IMAGE">Image</option>
              <option value="VIDEO">Video</option>
              <option value="DOCUMENT">Document</option>
            </select>
          </label>
          <label>Source
            <select name="source_type" defaultValue={item.source_type} disabled={!editable}>
              <option value="HTTPS_URL">HTTPS URL</option>
              <option value="PORTFOLIO_ITEM">Approved Service portfolio item</option>
            </select>
          </label>
          <label>HTTPS URL
            <input name="public_url" type="url" defaultValue={item.public_url ?? ''} disabled={!editable} />
          </label>
          <label>Approved portfolio item
            <select name="portfolio_item_id" defaultValue={item.portfolio_item_id ?? ''} disabled={!editable}>
              <option value="">None</option>
              {portfolioRows.map((portfolioItem) => <option value={portfolioItem.id} key={portfolioItem.id}>
                {portfolioItem.title} · {portfolioItem.service_id ?? 'unscoped'}
              </option>)}
            </select>
          </label>
          <label>Alt text
            <input name="alt_text" maxLength={500} defaultValue={item.alt_text ?? ''} disabled={!editable} />
          </label>
          <label>Sort order
            <input name="sort_order" type="number" defaultValue={item.sort_order} disabled={!editable} />
          </label>
          <label className="toggleLabel">
            <input name="approved" type="checkbox" defaultChecked={Boolean(item.approved)} disabled={!editable} />
            Approved
          </label>
          <button disabled={!editable}>Save Media</button>
        </form>)}
      </div>
    </section>

    <section className="panel settingsCreate">
      <h2>Bundles & add-ons</h2>
      <p className="muted">Relations reference canonical Service/Product/Variant identities. Product-to-Product cross-Business relations fail closed.</p>
      {subjects.length >= 2 ? <form action={saveCatalogRelationV2} className="settingsGrid">
        <input type="hidden" name="relation_id" value={relationCreateId} />
        <input type="hidden" name="request_key" value={`catalog-v2-relation:${relationCreateId}:${crypto.randomUUID()}`} />
        <label>Source
          <select name="source_ref" required disabled={!editable}>
            {subjects.map((subject) => <option value={subject.ref} key={subject.ref}>{subject.label}</option>)}
          </select>
        </label>
        <label>Target
          <select name="target_ref" required disabled={!editable}>
            {subjects.map((subject) => <option value={subject.ref} key={subject.ref}>{subject.label}</option>)}
          </select>
        </label>
        <label>Type
          <select name="relation_type" defaultValue="ADD_ON" disabled={!editable}>
            <option value="ADD_ON">Add-on</option>
            <option value="BUNDLE_COMPONENT">Bundle component</option>
          </select>
        </label>
        <label>Quantity<input name="quantity" type="number" min="0.0001" step="0.0001" defaultValue={1} disabled={!editable} /></label>
        <label>Sort order<input name="sort_order" type="number" defaultValue={0} disabled={!editable} /></label>
        <label className="toggleLabel"><input name="required" type="checkbox" disabled={!editable} /> Required</label>
        <button disabled={!editable}>Add Relation</button>
      </form> : <p className="muted">At least two catalog subjects are needed for a relation.</p>}

      <div className="settingsList">
        {relationRows.map((row) => <form action={saveCatalogRelationV2} className="settingsRow" key={row.id}>
          <input type="hidden" name="relation_id" value={row.id} />
          <input type="hidden" name="expected_version" value={row.version} />
          <input type="hidden" name="request_key" value={`catalog-v2-relation:${row.id}:${crypto.randomUUID()}`} />
          <input
            type="hidden"
            name="source_ref"
            value={catalogSubjectRef(row.source_service_id, row.source_product_id, row.source_variant_id)}
          />
          <div>
            <strong>{relationLabel(row, 'source')}</strong>
            <span className="muted smallText">Source is immutable · v{row.version}</span>
          </div>
          <label>Target
            <select
              name="target_ref"
              defaultValue={catalogSubjectRef(row.target_service_id, row.target_product_id, row.target_variant_id)}
              disabled={!editable}
            >
              {subjects.map((subject) => <option value={subject.ref} key={subject.ref}>{subject.label}</option>)}
            </select>
          </label>
          <label>Type
            <select name="relation_type" defaultValue={row.relation_type} disabled={!editable}>
              <option value="ADD_ON">Add-on</option>
              <option value="BUNDLE_COMPONENT">Bundle component</option>
            </select>
          </label>
          <label>Quantity
            <input name="quantity" type="number" min="0.0001" step="0.0001" defaultValue={String(row.quantity)} disabled={!editable} />
          </label>
          <label>Sort order
            <input name="sort_order" type="number" defaultValue={row.sort_order} disabled={!editable} />
          </label>
          <label className="toggleLabel">
            <input name="required" type="checkbox" defaultChecked={Boolean(row.required)} disabled={!editable} />
            Required
          </label>
          <button disabled={!editable}>Save Relation</button>
        </form>)}
      </div>
    </section>
  </div>;
}
