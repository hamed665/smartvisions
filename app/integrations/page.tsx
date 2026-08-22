import Link from 'next/link';
import { verifyCrawl4AiIntegration } from '@/app/integration-health-actions';
import { updateIntegration } from '@/app/management-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { evaluateBudgetMode } from '@/lib/reliability/cost-guard';
export const dynamic='force-dynamic';

function credentialReady(provider:string){switch(provider){case'OPENAI':return Boolean(process.env.OPENAI_API_KEY);case'META':return Boolean(process.env.META_WHATSAPP_TOKEN&&process.env.META_WHATSAPP_PHONE_NUMBER_ID);case'GOOGLE_PLACES':return Boolean(process.env.GOOGLE_PLACES_API_KEY);case'CRAWL4AI':return Boolean(process.env.CRAWL4AI_URL);case'REDIS':return Boolean(process.env.REDIS_URL);case'EMAIL_PROVIDER':return Boolean(process.env.EMAIL_PROVIDER&&process.env.EMAIL_PROVIDER_API_KEY);default:return false}}
function effectiveStatus(status:string,credential:boolean){if(!credential)return'NOT_CONFIGURED';if(status==='NOT_CONFIGURED')return'READY';return status}

export default async function IntegrationsPage(){
  const {supabase,organizationId,role}=await getCurrentOrganization();
  const monthStart=new Date();monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0);
  const [{data},{data:healthAudits},{data:costGuard},{data:usage}]=await Promise.all([
    supabase.from('integration_connections').select('*').eq('organization_id',organizationId).order('channel'),
    supabase.from('audit_logs').select('action,after_data,created_at').eq('organization_id',organizationId).in('action',['CRAWL4AI_CONTROLLED_SMOKE_TEST','CRAWL4AI_CONTROLLED_SMOKE_TEST_FAILED','GOOGLE_PLACES_CONTROLLED_TEST']).order('created_at',{ascending:false}).limit(50),
    supabase.from('cost_guard_settings').select('*').eq('organization_id',organizationId).maybeSingle(),
    supabase.from('usage_events').select('cost_usd').eq('organization_id',organizationId).gte('created_at',monthStart.toISOString())
  ]);
  const rows=data??[];const editable=role==='OWNER';const monthSpend=(usage??[]).reduce((sum,row)=>sum+Number(row.cost_usd??0),0);const budget=costGuard?evaluateBudgetMode(monthSpend,costGuard):null;
  const latencyByProvider=new Map<string,number>();
  for(const event of healthAudits??[]){const after=(event.after_data??{}) as Record<string,unknown>;const provider=String(after.provider??(event.action.startsWith('CRAWL4AI')?'CRAWL4AI':'GOOGLE_PLACES'));const latency=Number(after.latencyMs);if(!latencyByProvider.has(provider)&&Number.isFinite(latency))latencyByProvider.set(provider,latency)}
  return <div>
    <div className="headerRow"><div><h1>Integrations</h1><p className="muted">Credential readiness is separate from a verified end-to-end connection. Secrets remain in secure environment storage and checks never run merely because this page loaded.</p></div><div><span className="status">{rows.filter(r=>credentialReady(r.provider)).length}/{rows.length} credentials present</span>{budget?<span className={`status ${budget.mode==='CRITICAL'||budget.mode==='HARD_STOP'?'dangerStatus':''}`}>Budget {budget.mode}</span>:null}</div></div>
    {budget?.mode==='CRITICAL'||budget?.mode==='HARD_STOP'?<section className="panel dangerPanel"><strong>Critical cost state</strong><p className="muted">New paid provider operations are restricted by Cost Guard. Review <Link className="textLink" href="/cost-usage">Cost & Usage</Link> before running smoke tests.</p></section>:null}
    <div className="settingsList">{rows.map(r=>{const credential=credentialReady(r.provider);const status=effectiveStatus(String(r.status),credential);const latency=latencyByProvider.get(String(r.provider));return <form action={updateIntegration} className="settingsRow" key={r.id}><input type="hidden" name="id" value={r.id}/><div><strong>{r.provider}</strong><span className="muted smallText">{r.channel} · Health {status}</span><span className={`smallText ${credential?'credentialReady':'credentialMissing'}`}>{credential?(status==='CONNECTED'?'Credential present · production verified':'Credential present · not production verified'):'Credential missing'}</span>{r.provider==='GOOGLE_PLACES'?<Link className="textLink smallText" href="/hunters/google-places">Controlled discovery test →</Link>:null}{r.provider==='CRAWL4AI'?<span className="muted smallText">Smoke test uses one fixed example.com audit only when you click Verify.</span>:null}</div><label>Account label<input name="account_label" defaultValue={r.account_label??''} disabled={!editable}/></label><label className="toggleLabel"><input type="checkbox" name="enabled" defaultChecked={r.enabled} disabled={!editable||!credential}/> Enabled</label><div className="healthList compactHealth"><span>Status <strong>{status}</strong></span><span>Latency <strong>{latency!==undefined?`${latency} ms`:'—'}</strong></span><span>Last check <strong>{r.last_checked_at?new Date(r.last_checked_at).toLocaleString():'Never'}</strong></span>{r.last_error?<span>Error <strong>{r.last_error}</strong></span>:null}</div><div>{r.provider==='CRAWL4AI'?<button type="submit" formAction={verifyCrawl4AiIntegration} disabled={!editable||!credential}>Verify once</button>:null}<button type="submit" disabled={!editable}>Save label/state</button></div></form>})}</div>
    <section className="panel settingsCreate"><h2>Security and cost note</h2><p className="muted">READY means credentials exist but the provider is not yet verified. CONNECTED means durable production evidence exists. Manual provider verification is intentionally explicit so health monitoring cannot quietly become a paid traffic generator.</p></section>
  </div>
}
