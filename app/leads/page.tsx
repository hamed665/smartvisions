import { updateLead } from '@/app/management-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

const statuses = ['NEW','AUDITED','QUALIFIED','READY_TO_CONTACT','CONTACTED','REPLIED','INTERESTED','HOT','HUMAN','WON','LOST','DO_NOT_CONTACT'];

type LeadBusiness = {
  name: string | null;
  country_code: string | null;
  city: string | null;
  category: string | null;
  official_website: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
};

type LeadRow = {
  id: string;
  status: string;
  opportunity_score: number;
  intent_score: number;
  agent_mode: string;
  recommended_offer: string | null;
  updated_at: string;
  businesses: LeadBusiness | null;
};

export default async function LeadsPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const { data } = await supabase
    .from('leads')
    .select('id,status,opportunity_score,intent_score,agent_mode,recommended_offer,updated_at,businesses(name,country_code,city,category,official_website,email,phone,whatsapp,instagram)')
    .eq('organization_id', organizationId)
    .order('opportunity_score', { ascending: false })
    .limit(250);

  const rows = (data ?? []) as LeadRow[];
  const editable = role === 'OWNER';

  return <div><div className="headerRow"><div><h1>Leads</h1><p className="muted">Live CRM workspace with stage, agent mode, scores, contacts and recommended offer.</p></div><span className="status">{rows.length} loaded</span></div><section className="conversationFilters">{statuses.map(s=><span className="conversationFilter" key={s}>{s} {rows.filter(r=>r.status===s).length}</span>)}</section><div className="settingsList">{rows.map(r=><form action={updateLead} className="settingsRow leadRow" key={r.id}><input type="hidden" name="id" value={r.id}/><div><strong>{r.businesses?.name||'Unknown business'}</strong><span className="muted smallText">{[r.businesses?.country_code,r.businesses?.city,r.businesses?.category].filter(Boolean).join(' · ')}</span><span className="muted smallText">Opportunity {r.opportunity_score} · Intent {r.intent_score}</span></div><label>Status<select name="status" defaultValue={r.status} disabled={!editable}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label><label>Agent mode<select name="agent_mode" defaultValue={r.agent_mode} disabled={!editable}><option>AUTO</option><option>PAUSED</option><option>HUMAN</option></select></label><label className="wideField">Recommended offer<input name="recommended_offer" defaultValue={r.recommended_offer??''} disabled={!editable}/></label><div className="contactStack">{r.businesses?.email?<span>✉ {r.businesses.email}</span>:null}{r.businesses?.phone?<span>☎ {r.businesses.phone}</span>:null}{r.businesses?.whatsapp?<span>WA {r.businesses.whatsapp}</span>:null}{r.businesses?.instagram?<span>IG {r.businesses.instagram}</span>:null}</div><button disabled={!editable}>Save</button></form>)}</div></div>;
}
