import Link from 'next/link';

import {configurePaymentProviderV1} from '../provider-actions';
import {listPaymentProviders} from '@/lib/payments/providers/catalog';
import {getCurrentOrganization} from '@/lib/supabase/org';

export const dynamic='force-dynamic';

type ProviderRow={provider:string;enabled:boolean;status:string;account_label:string|null;last_checked_at:string|null;last_error:string|null;config:Record<string,unknown>|null};

export default async function PaymentProvidersPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const providers=listPaymentProviders();
  const providerCodes=providers.map(provider=>provider.code);
  const {data}=await supabase.from('integration_connections')
    .select('provider,enabled,status,account_label,last_checked_at,last_error,config')
    .eq('organization_id',organizationId).eq('channel','PAYMENT').in('provider',providerCodes);
  const rows=new Map((data??[]).map(row=>[String(row.provider),row as ProviderRow]));
  const canConfigure=['OWNER','ADMIN'].includes(String(role));

  return <div>
    <div className="headerRow">
      <div><h1>Payment providers</h1><p className="muted">Registered gateway adapters over one canonical Payment Core</p></div>
      <Link className="textLink" href="/payments">← Payments</Link>
    </div>

    <section className="panel">
      <h2>Provider extension boundary</h2>
      <p className="muted">Gateway adapters declare countries, currencies and capabilities but never own settlement truth. Credentials stay in Supabase Vault and this page never displays stored keys. Provider links are evidence only, and a future country/gateway must register an adapter instead of creating another payment ledger or refund engine.</p>
    </section>

    {providers.map(provider=>{
      const row=rows.get(provider.code);
      const cfg=(row?.config??{}) as Record<string,unknown>;
      const configured=Boolean(cfg.secret_key_ref);
      return <section className="panel" key={provider.code}>
        <div className="headerRow"><div>
          <h2>{provider.label}</h2>
          <p className="muted">{row?.status??'NOT_CONFIGURED'} · {String(cfg.mode??'mode not set')} · {provider.countries.join(', ')} · {provider.currencies.join(', ')}</p>
          <span className="muted smallText">{provider.capabilities.join(' · ')}</span>
        </div>{row?.last_checked_at?<span className="muted smallText">Checked {new Date(row.last_checked_at).toLocaleString()}</span>:null}</div>
        {row?.last_error?<p><strong>Last provider error:</strong> {row.last_error}</p>:null}

        {canConfigure?<form action={configurePaymentProviderV1} className="settingsGrid">
          <input type="hidden" name="provider" value={provider.code}/>
          <label>Mode<select name="mode" defaultValue={String(cfg.mode??'TEST')}><option value="TEST">TEST</option><option value="LIVE">LIVE</option></select></label>
          <label>Secret API key<input name="secret_key" type="password" autoComplete="new-password" required={!configured} placeholder={configured?'Leave blank to keep current secret':'Secret API key'}/></label>
          {provider.configuration.requiresPublishableKey?<label>Publishable key<input name="publishable_key" type="password" autoComplete="new-password" required={!Boolean(cfg.publishable_key_ref)} placeholder={cfg.publishable_key_ref?'Leave blank to keep current key':'Publishable key'}/></label>:null}
          {provider.configuration.requiresMerchantId?<label>Merchant ID<input name="merchant_id" defaultValue={String(cfg.merchant_id??'')} minLength={3} maxLength={160} required/></label>:null}
          <button>{configured?'Update provider':'Configure provider'}</button>
        </form>:<p className="muted">Owner/Admin permission is required to change gateway credentials.</p>}
      </section>;
    })}
  </div>;
}
