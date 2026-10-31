import Link from 'next/link';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { effectiveCampaignStatus } from '@/lib/reliability/operational-truth';

export const dynamic = 'force-dynamic';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

export default async function HuntersPage() {
  const { supabase, organizationId } = await getCurrentOrganization();
  const results = await Promise.all([
    supabase.from('campaigns').select('hunter_type,status,target_count,config,updated_at').eq('organization_id', organizationId),
    supabase.from('discovery_records').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
    supabase.from('intent_opportunities').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
    supabase.from('growth_opportunities').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
    supabase.from('growth_opportunities').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('recommended_acquisition_route', ['GCC_HUMAN_IG_WA', 'HYBRID_EMAIL_HUMAN_GCC']),
    supabase.from('integration_connections').select('provider,channel,status,enabled,config').eq('organization_id', organizationId),
    supabase.from('portfolio_items').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('approved', true),
    supabase.from('memory_items').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('state', 'PENDING_REVIEW'),
    supabase.from('followup_jobs').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'PENDING').lte('scheduled_at', new Date().toISOString()),
    supabase.from('system_controls').select('shadow_mode,global_kill_switch,agents_paused,whatsapp_ai_paused').eq('organization_id', organizationId).maybeSingle(),
  ]);
  if (results.some(result => result.error)) throw new Error('Hunter preparation evidence is unavailable; retry the read before preparing a pilot.');
  const [{ data: campaigns }, { count: discovered }, { count: intents }, { count: growth }, { count: humanAcquisition }, { data: integrations },
    { count: approvedPortfolio }, { count: pendingMemory }, { count: overdueFollowups }, { data: controls }] = results;

  const c = campaigns ?? [];
  const i = integrations ?? [];
  const connected = (provider: string) => i.some((row) => row.provider === provider && row.status === 'CONNECTED' && row.enabled);
  const ready = (provider: string) => i.some((row) => row.provider === provider && (row.status === 'READY' || row.status === 'CONNECTED') && row.enabled);
  const runningBusiness = c.filter((row) => row.hunter_type === 'BUSINESS' && effectiveCampaignStatus(row).status === 'RUNNING');
  const senderIdentity = record(record(i.find(row => row.provider === 'META' && row.channel === 'WHATSAPP')?.config).sender_identity);
  const dailyTargetCampaign = runningBusiness
    .filter((row) => record(row.config).dailyOutreachTarget === true)
    .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))[0] ?? null;
  const acquisitionCampaigns = runningBusiness.filter((row) => record(row.config).dailyOutreachTarget !== true);
  const displayedTargetVolume = dailyTargetCampaign?.target_count
    ?? acquisitionCampaigns.reduce((total, row) => total + (row.target_count ?? 0), 0);

  return <div>
    <div className="headerRow">
      <div><h1>Hunters</h1><p className="muted">Business discovery plus growth-opportunity routing and explicit project demand.</p></div>
      <div><Link className="textLink" href="/hunters/customer-module">Customer module →</Link>{' · '}<Link className="textLink" href="/campaigns">Create campaign →</Link></div>
    </div>
    <section className="grid">
      <div className="card"><span className="muted">Business campaigns</span><div className="value">{c.filter((row) => row.hunter_type === 'BUSINESS').length}</div></div>
      <div className="card"><span className="muted">Discovery records</span><div className="value">{discovered ?? 0}</div></div>
      <div className="card"><span className="muted">Growth opportunities</span><div className="value">{growth ?? 0}</div></div>
      <div className="card"><span className="muted">Human acquisition</span><div className="value">{humanAcquisition ?? 0}</div></div>
      <div className="card"><span className="muted">Intent opportunities</span><div className="value">{intents ?? 0}</div></div>
    </section>
    <section className="panel">
      <h2>Controlled pilot preparation</h2>
      <p className="muted">Prepare up to three evidence-qualified businesses and review each draft. These checks describe preparation; every send still uses the current approval and channel gates.</p>
      <div className="healthList">
        <span>Shadow review <strong>{controls?.shadow_mode === true ? 'ON' : 'OFF · review system controls'}</strong></span>
        <span>Emergency stop <strong>{controls?.global_kill_switch === true ? 'ON' : 'OFF'}</strong></span>
        <span>Organization WhatsApp sender <strong>{String(senderIdentity.status ?? 'NOT_CHECKED')}{senderIdentity.displayPhoneNumber ? ` · ${String(senderIdentity.displayPhoneNumber)}` : ''}</strong></span>
        <span>Approved portfolio <strong>{approvedPortfolio ?? 0}</strong></span>
        <span>Memory awaiting review <strong>{pendingMemory ?? 0}</strong></span>
        <span>Overdue follow-ups requiring review <strong>{overdueFollowups ?? 0}</strong></span>
      </div>
      <p><Link className="textLink" href="/integrations">Check sender identity →</Link>{' · '}<Link className="textLink" href="/portfolio">Review work samples →</Link>{' · '}<Link className="textLink" href="/memory">Review Memory →</Link>{' · '}<Link className="textLink" href="/automations">Review follow-ups →</Link></p>
      {Number(approvedPortfolio ?? 0) === 0 ? <p className="muted">No approved work sample is available. Drafts may ask a relevant question or offer an outline; they must not promise examples, client results or free custom work.</p> : null}
    </section>
    <section className="twoCol">
      <div className="panel">
        <div className="headerRow"><h2>Business Hunter readiness</h2><Link className="textLink" href="/hunters/google-places">Google Places hunter →</Link></div>
        <div className="healthList">
          <span>Google Places <strong>{connected('GOOGLE_PLACES') ? 'CONNECTED' : 'NOT VERIFIED'}</strong></span>
          <span>Crawl4AI <strong>{ready('CRAWL4AI') ? 'READY' : 'NOT READY'}</strong></span>
          <span>Running acquisition campaigns <strong>{acquisitionCampaigns.length}</strong></span>
          <span>Daily outreach target <strong>{displayedTargetVolume}</strong></span>
        </div>
        <p><Link className="textLink" href="/hunters/growth-opportunities">Open Growth Opportunity Router →</Link></p>
        <p><Link className="textLink" href="/hunters/human-acquisition">Open GCC Human Acquisition Queue →</Link></p>
        <p><Link className="textLink" href="/hunters/project-hunter">Open Project Hunter (manual review MVP) →</Link></p>
      </div>
      <div className="panel">
        <h2>Sales lanes</h2>
        <div className="healthList">
          <span>GCC SME <strong>Human Instagram / WhatsApp first</strong></span>
          <span>GCC medium / enterprise <strong>Hybrid email + human social</strong></span>
          <span>Inbound WhatsApp <strong>Agent after customer initiation</strong></span>
          <span>International <strong>Email first</strong></span>
          <span>Physical production <strong>Muscat only</strong></span>
        </div>
      </div>
    </section>
  </div>;
}
