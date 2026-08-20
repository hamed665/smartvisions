import { updateLead } from '@/app/management-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

const statuses = ['HOT','HUMAN','WON','LOST','DO_NOT_CONTACT'];

type HotLeadBusiness = {
  name: string | null;
  country_code: string | null;
  city: string | null;
  category: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
};

type HotLeadRow = {
  id: string;
  status: string;
  opportunity_score: number;
  intent_score: number;
  agent_mode: string;
  recommended_offer: string | null;
  updated_at: string;
  businesses: HotLeadBusiness[];
};

export default async function HotLeadsPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const { data } = await supabase
    .from('leads')
    .select('id,status,opportunity_score,intent_score,agent_mode,recommended_offer,updated_at,businesses(name,country_code,city,category,email,phone,whatsapp)')
    .eq('organization_id', organizationId)
    .in('status', ['HOT','HUMAN','WON'])
    .order('intent_score', { ascending: false });

  const rows: HotLeadRow[] = data ?? [];
  const editable = role === 'OWNER';

  return <div><div className="headerRow"><div><h1>Hot Leads</h1><p className="muted">High-intent prospects, human handoffs and deals close to revenue.</p></div><span className="status">{rows.filter(r=>r.status==='HOT').length} hot</span></div><section className="grid"><div className="card"><span className="muted">HOT</span><div className="value">{rows.filter(r=>r.status==='HOT').length}</div></div><div className="card"><span className="muted">Human takeover</span><div className="value">{rows.filter(r=>r.status==='HUMAN').length}</div></div><div className="card"><span className="muted">Won</span><div className="value">{rows.filter(r=>r.status==='WON').length}</div></div></section><div className="settingsList">{rows.map(r=>{const business=r.businesses[0];return <form action={updateLead} className="settingsRow leadRow" key={r.id}><input type="hidden" name="id" value={r.id}/><div><strong>{business?.name||'Unknown business'}</strong><span className="muted smallText">{[business?.country_code,business?.city,business?.category].filter(Boolean).join(' · ')}</span><span className="muted smallText">Opportunity {r.opportunity_score} · Intent {r.intent_score}</span></div><label>Status<select name="status" defaultValue={r.status} disabled={!editable}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label><label>Agent mode<select name="agent_mode" defaultValue={r.agent_mode} disabled={!editable}><option>AUTO</option><option>PAUSED</option><option>HUMAN</option></select></label><label className="wideField">Offer<input name="recommended_offer" defaultValue={r.recommended_offer??''} disabled={!editable}/></label><div className="contactStack">{business?.email?<span>✉ {business.email}</span>:null}{business?.phone?<span>☎ {business.phone}</span>:null}{business?.whatsapp?<span>WA {business.whatsapp}</span>:null}</div><button disabled={!editable}>Save</button></form>})}</div></div>;
}
