import { updatePrice } from '@/app/control-center-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export default async function PricingPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const { data } = await supabase.from('service_prices').select('id,service_id,country_code,currency,price,minimum_price,max_auto_discount_pct,max_discount_with_approval_pct').eq('organization_id', organizationId).order('country_code').order('service_id');
  const prices = data ?? [];
  const editable = role === 'OWNER';

  return <div>
    <div className="headerRow"><div><h1>Pricing</h1><p className="muted">Live country-specific prices and autonomous discount boundaries.</p></div><span className="status">{prices.length} price rules</span></div>
    <div className="settingsList">
      {prices.map((row) => <form action={updatePrice} className="settingsRow pricingRow" key={row.id}>
        <input type="hidden" name="id" value={row.id} />
        <div><strong>{row.service_id}</strong><span className="muted smallText">{row.country_code} · {row.currency}</span></div>
        <label>Price<input type="number" step="0.01" name="price" defaultValue={row.price} disabled={!editable} /></label>
        <label>Minimum<input type="number" step="0.01" name="minimum_price" defaultValue={row.minimum_price} disabled={!editable} /></label>
        <label>Auto discount %<input type="number" step="0.1" min="0" max="100" name="max_auto_discount_pct" defaultValue={row.max_auto_discount_pct} disabled={!editable} /></label>
        <label>Approval discount %<input type="number" step="0.1" min="0" max="100" name="max_discount_with_approval_pct" defaultValue={row.max_discount_with_approval_pct} disabled={!editable} /></label>
        <button disabled={!editable}>Save</button>
      </form>)}
    </div>
  </div>;
}
