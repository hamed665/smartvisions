import { updateMarket } from '@/app/control-center-actions';
import { createMarket, updateLocaleProfile } from '@/app/extended-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';
export const dynamic='force-dynamic';

export default async function MarketsPage(){
  const{supabase,organizationId,role}=await getCurrentOrganization();
  const[{data:marketData},{data:localeData}]=await Promise.all([
    supabase.from('market_settings').select('id,country_code,enabled,currency,timezone,send_window_start,send_window_end,config').eq('organization_id',organizationId).order('country_code'),
    supabase.from('locale_profiles').select('*').eq('organization_id',organizationId).order('country_code')
  ]);
  const markets=marketData??[],locales=localeData??[];const editable=role==='OWNER';
  return <div>
    <div className="headerRow"><div><h1>Markets & Locales</h1><p className="muted">Country, currency, local send window, dialect, tone and channel policy configuration.</p></div><span className="status">{markets.filter(m=>m.enabled).length} active</span></div>
    <div className="settingsList">{markets.map(m=>{const locale=locales.find(l=>l.country_code===m.country_code);const config=(m.config??{}) as Record<string,unknown>;return <section className="agentControl" key={m.id}>
      <form action={updateMarket} className="settingsRow marketRow">
        <input type="hidden" name="id" value={m.id}/><div><strong>{m.country_code}</strong><span className="muted smallText">{locale?.dialect||locale?.primary_locale||'Locale not configured'}</span></div>
        <label>Currency<input name="currency" defaultValue={m.currency} maxLength={3} disabled={!editable}/></label>
        <label>Timezone<input name="timezone" defaultValue={m.timezone} disabled={!editable}/></label>
        <label>Send from<input type="time" name="send_window_start" defaultValue={String(m.send_window_start).slice(0,5)} disabled={!editable}/></label>
        <label>Send until<input type="time" name="send_window_end" defaultValue={String(m.send_window_end).slice(0,5)} disabled={!editable}/></label>
        <label className="toggleLabel"><input type="checkbox" name="cold_email_enabled" defaultChecked={Boolean(config.coldEmailEnabled)} disabled={!editable}/> Cold email</label>
        <label className="toggleLabel"><input type="checkbox" name="whatsapp_cold_enabled" defaultChecked={Boolean(config.whatsappColdEnabled)} disabled={!editable}/> WhatsApp cold</label>
        <label className="toggleLabel"><input type="checkbox" name="instagram_auto_cold_enabled" defaultChecked={Boolean(config.instagramAutoColdEnabled)} disabled={!editable}/> Instagram auto cold</label>
        <label className="toggleLabel"><input type="checkbox" name="enabled" defaultChecked={m.enabled} disabled={!editable}/> Enabled</label><button disabled={!editable}>Save</button>
      </form>
      <p className="muted smallText">Cold-channel flags reuse the existing market config. Keep restricted channels disabled unless policy and provider verification explicitly allow them.</p>
      {locale&&editable?<details className="promptEditor"><summary>Edit locale intelligence</summary><form action={updateLocaleProfile} className="settingsGrid"><input type="hidden" name="id" value={locale.id}/><label>Primary locale<input name="primary_locale" defaultValue={locale.primary_locale}/></label><label>Fallback locale<input name="fallback_locale" defaultValue={locale.fallback_locale??''}/></label><label>Dialect<input name="dialect" defaultValue={locale.dialect??''} placeholder="Omani Arabic"/></label><label>Tone profile<input name="tone_profile" defaultValue={locale.tone_profile??''} placeholder="warm_business"/></label><label>Dialect intensity<input type="number" min="0" max="1" step="0.05" name="dialect_intensity" defaultValue={locale.dialect_intensity??0.5}/></label><label>First touch max words<input type="number" min="10" name="max_first_touch_words" defaultValue={locale.max_first_touch_words??80}/></label><label>Reply max words<input type="number" min="10" name="max_reply_words" defaultValue={locale.max_reply_words??160}/></label><button>Save locale</button></form></details>:null}
    </section>})}</div>
    {editable?<section className="panel settingsCreate"><h2>Add market</h2><form action={createMarket} className="settingsGrid"><label>Country code<input name="country_code" maxLength={2} placeholder="CA" required/></label><label>Currency<input name="currency" maxLength={3} placeholder="CAD" required/></label><label>Timezone<input name="timezone" placeholder="America/Toronto" required/></label><label>Send from<input type="time" name="send_window_start" defaultValue="09:00"/></label><label>Send until<input type="time" name="send_window_end" defaultValue="19:00"/></label><label>Primary locale<input name="primary_locale" defaultValue="en"/></label><label>Dialect / variant<input name="dialect" placeholder="Canadian English"/></label><label>Tone<input name="tone_profile" defaultValue="professional"/></label><button>Add market</button></form></section>:null}
  </div>
}
