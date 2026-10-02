import Link from 'next/link';

import {configureOmanPaymentProviderV1} from '../provider-actions';
import {getCurrentOrganization} from '@/lib/supabase/org';

export const dynamic='force-dynamic';

type ProviderRow={provider:string;enabled:boolean;status:string;account_label:string|null;last_checked_at:string|null;last_error:string|null;config:Record<string,unknown>|null};

export default async function OmanPaymentProvidersPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const {data}=await supabase.from('integration_connections')
    .select('provider,enabled,status,account_label,last_checked_at,last_error,config')
    .eq('organization_id',organizationId).eq('channel','PAYMENT').in('provider',['TAP','THAWANI']);
  const rows=new Map((data??[]).map(row=>[String(row.provider),row as ProviderRow]));
  const canConfigure=['OWNER','ADMIN'].includes(String(role));

  return <div>
    <div className="headerRow">
      <div><h1>Oman payment providers</h1><p className="muted">Tap + Thawani adapters over canonical Payment Core</p></div>
      <Link className="textLink" href="/payments">← Payments</Link>
    </div>

    <section className="panel">
      <h2>Authority boundary</h2>
      <p className="muted">Credentials are stored in Supabase Vault. This page never displays stored keys. READY means credentials are configured; CONNECTED is recorded only after a successful real provider API interaction. A provider link never marks an Invoice paid by itself.</p>
    </section>

    {(['TAP','THAWANI'] as const).map(provider=>{
      const row=rows.get(provider);
      const cfg=(row?.config??{}) as Record<string,unknown>;
      const configured=Boolean(cfg.secret_key_ref);
      return <section className="panel" key={provider}>
        <div className="headerRow"><div>
          <h2>{provider==='TAP'?'Tap Payments':'Thawani Pay'}</h2>
          <p className="muted">{row?.status??'NOT_CONFIGURED'} · {String(cfg.mode??'mode not set')} · OMR</p>
        </div>{row?.last_checked_at?<span className="muted smallText">Checked {new Date(row.last_checked_at).toLocaleString()}</span>:null}</div>
        {row?.last_error?<p><strong>Last provider error:</strong> {row.last_error}</p>:null}

        {canConfigure?<form action={configureOmanPaymentProviderV1} className="settingsGrid">
          <input type="hidden" name="provider" value={provider}/>
          <label>Mode<select name="mode" defaultValue={String(cfg.mode??'TEST')}><option value="TEST">TEST</option><option value="LIVE">LIVE</option></select></label>
          <label>Secret API key<input name="secret_key" type="password" autoComplete="new-password" required={!configured} placeholder={configured?'Leave blank to keep current secret':'Secret API key'}/></label>
          {provider==='THAWANI'?<label>Publishable key<input name="publishable_key" type="password" autoComplete="new-password" required={!Boolean(cfg.publishable_key_ref)} placeholder={cfg.publishable_key_ref?'Leave blank to keep current key':'Publishable key'}/></label>:null}
          {provider==='TAP'?<label>Merchant ID<input name="merchant_id" defaultValue={String(cfg.merchant_id??'')} minLength={3} maxLength={160} required/></label>:null}
          <button>{configured?'Update provider':'Configure provider'}</button>
        </form>:<p className="muted">Owner/Admin permission is required to change gateway credentials.</p>}
      </section>;
    })}
  </div>;
}
