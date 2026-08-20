import { updateMarket } from '@/app/control-center-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export default async function MarketsPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const { data } = await supabase.from('market_settings').select('id,country_code,enabled,currency,timezone,send_window_start,send_window_end').eq('organization_id', organizationId).order('country_code');
  const markets = data ?? [];
  const editable = role === 'OWNER';

  return <div>
    <div className="headerRow"><div><h1>Markets</h1><p className="muted">Live country, timezone, currency, and local send-window configuration.</p></div><span className="status">{markets.filter((m) => m.enabled).length} active</span></div>
    <div className="settingsList">
      {markets.map((market) => <form action={updateMarket} className="settingsRow marketRow" key={market.id}>
        <input type="hidden" name="id" value={market.id} />
        <div><strong>{market.country_code}</strong><span className="muted smallText">Market profile</span></div>
        <label>Currency<input name="currency" defaultValue={market.currency} maxLength={3} disabled={!editable} /></label>
        <label>Timezone<input name="timezone" defaultValue={market.timezone} disabled={!editable} /></label>
        <label>Send from<input type="time" name="send_window_start" defaultValue={String(market.send_window_start).slice(0,5)} disabled={!editable} /></label>
        <label>Send until<input type="time" name="send_window_end" defaultValue={String(market.send_window_end).slice(0,5)} disabled={!editable} /></label>
        <label className="toggleLabel"><input type="checkbox" name="enabled" defaultChecked={market.enabled} disabled={!editable} /> Enabled</label>
        <button disabled={!editable}>Save</button>
      </form>)}
    </div>
  </div>;
}
