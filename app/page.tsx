import Link from 'next/link';
import { setDailyOutreachTarget } from '@/app/daily-target-actions';
import { calculateDailyOutreachProgress, omanDayUtcRange } from '@/lib/outreach/daily-target';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

type GrowthBusiness = {
  country_code?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  international_phone?: string | null;
};

type GrowthOpportunity = {
  prospect_tier?: string | null;
  should_contact?: boolean | null;
  businesses?: GrowthBusiness | GrowthBusiness[] | null;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

export default async function HomePage() {
  const { supabase, organizationId } = await getCurrentOrganization();
  const day = omanDayUtcRange();

  const [
    { data: leads },
    { data: controls },
    { count: approvalCount },
    { data: integrations },
    { data: conversations },
    { data: dailyTargets },
    { count: sentToday },
    { count: pendingToday },
    { data: growthRows },
    { data: omanMarket },
  ] = await Promise.all([
    supabase.from('leads').select('status').eq('organization_id', organizationId),
    supabase.from('system_controls').select('*').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('conversation_messages').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('requires_approval', true).eq('status', 'APPROVAL_REQUIRED'),
    supabase.from('integration_connections').select('status,enabled').eq('organization_id', organizationId),
    supabase.from('sales_conversations').select('stage,requires_human,unread_count').eq('organization_id', organizationId),
    supabase.from('campaigns').select('id,name,target_count,status,config,updated_at').eq('organization_id', organizationId).eq('hunter_type', 'BUSINESS').eq('country_code', 'OM').contains('config', { dailyOutreachTarget: true, targetDate: day.dateKey, marketCode: 'OM' }).order('updated_at', { ascending: false }).limit(1),
    supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('direction', 'OUTBOUND').eq('status', 'SENT').gte('sent_at', day.startIso).lt('sent_at', day.endIso),
    supabase.from('conversation_messages').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('direction', 'OUTBOUND').in('status', ['APPROVAL_REQUIRED', 'APPROVED', 'PROCESSING']).gte('created_at', day.startIso).lt('created_at', day.endIso),
    supabase.from('growth_opportunities').select('prospect_tier,should_contact,businesses(country_code,email,whatsapp,phone,international_phone)').eq('organization_id', organizationId).eq('prospect_tier', 'A').eq('should_contact', true),
    supabase.from('market_settings').select('enabled,config').eq('organization_id', organizationId).eq('country_code', 'OM').maybeSingle(),
  ]);

  const l = leads ?? [];
  const c = conversations ?? [];
  const ints = integrations ?? [];
  const count = (...statuses: string[]) => l.filter((lead) => statuses.includes(lead.status)).length;
  const metrics = [
    ['New Leads', count('NEW')],
    ['Qualified', count('QUALIFIED', 'READY_TO_CONTACT')],
    ['Contacted', count('CONTACTED')],
    ['Replies', count('REPLIED', 'INTERESTED', 'HOT', 'HUMAN', 'WON')],
    ['HOT', count('HOT')],
    ['Won', count('WON')],
    ['Needs Human', c.filter((conversation) => conversation.requires_human).length],
    ['Approvals', approvalCount ?? 0],
  ];

  const dailyTarget = dailyTargets?.[0] ?? null;
  const omanConfig = record(omanMarket?.config);
  const coldEmailEnabled = omanConfig.coldEmailEnabled === true;
  const whatsappColdReady = omanConfig.whatsappColdEnabled === true
    && typeof omanConfig.whatsappColdTemplateName === 'string'
    && omanConfig.whatsappColdTemplateName.trim().length > 0
    && typeof omanConfig.whatsappColdTemplateLanguageCode === 'string'
    && omanConfig.whatsappColdTemplateLanguageCode.trim().length > 0;

  const channelReadyTierA = ((growthRows ?? []) as GrowthOpportunity[]).filter((row) => {
    const relation = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
    if (!relation || String(relation.country_code ?? '').toUpperCase() !== 'OM') return false;
    const hasEmail = String(relation.email ?? '').trim().includes('@');
    const hasPhone = String(relation.whatsapp ?? relation.international_phone ?? relation.phone ?? '').replace(/\D/g, '').length >= 8;
    return (coldEmailEnabled && hasEmail) || (whatsappColdReady && hasPhone);
  }).length;

  const progress = calculateDailyOutreachProgress({
    target: Number(dailyTarget?.target_count ?? 30),
    sent: sentToday ?? 0,
    pending: pendingToday ?? 0,
    eligible: channelReadyTierA,
  });
  const targetActive = dailyTarget?.status === 'RUNNING';
  const targetStatus = !dailyTarget
    ? 'NOT SET'
    : !targetActive
      ? String(dailyTarget.status)
      : progress.status.replaceAll('_', ' ');

  return <div>
    <div className="headerRow">
      <div><h1>Control Center</h1><p className="muted">Live production overview and operator shortcuts.</p></div>
      <span className={`status ${controls?.global_kill_switch ? 'dangerStatus' : ''}`}>{controls?.global_kill_switch ? 'GLOBAL STOP' : controls?.shadow_mode ? 'Shadow Mode' : 'Autonomous Mode'}</span>
    </div>

    <section className="panel" style={{ marginBottom: 18 }}>
      <div className="headerRow">
        <div>
          <h2>Daily Outreach Target · Oman</h2>
          <p className="muted">{day.dateKey} · Counts only real provider sends. Safety and channel policy are never bypassed to hit the number.</p>
        </div>
        <span className="status">{targetStatus}</span>
      </div>
      <section className="grid">
        <div className="card"><div className="muted">Target</div><div className="value">{progress.target}</div></div>
        <div className="card"><div className="muted">Sent Today</div><div className="value">{progress.sent}</div></div>
        <div className="card"><div className="muted">In Approval / Processing</div><div className="value">{progress.pending}</div></div>
        <div className="card"><div className="muted">Remaining</div><div className="value">{progress.remaining}</div></div>
        <div className="card"><div className="muted">Channel-ready Tier A</div><div className="value">{progress.eligible}</div></div>
      </section>
      <progress max={progress.target} value={Math.min(progress.sent, progress.target)} style={{ width: '100%', marginTop: 12 }} aria-label="Daily outreach progress" />
      <div className="muted" style={{ marginTop: 8 }}>{progress.progressPct}% complete · Shadow approval remains {controls?.shadow_mode ? 'ON' : 'OFF'} · Oman window 09:00–19:00.</div>
      <form action={setDailyOutreachTarget} className="inlineForm" style={{ marginTop: 14 }}>
        <label>Today&apos;s target <input name="target" type="number" min="1" max="100" defaultValue={progress.target} /></label>
        <button type="submit">Set / Start Daily Target</button>
      </form>
      {!whatsappColdReady && <p className="muted" style={{ marginTop: 10 }}>Cold WhatsApp is not counted as channel-ready until the canonical Meta template is configured. The system will not invent contact data or bypass the WhatsApp policy.</p>}
    </section>

    <section className="quickActions">
      <Link href="/campaigns">+ Create Campaign</Link><Link href="/leads">Manage Leads</Link><Link href="/conversations">Open Inbox</Link><Link href="/approvals">Review Approvals</Link><Link href="/messages">Edit Messages</Link><Link href="/system">Safety Controls</Link>
    </section>
    <section className="grid">{metrics.map(([label, value]) => <div className="card" key={String(label)}><div className="muted">{label}</div><div className="value">{value}</div></div>)}</section>
    <section className="twoCol">
      <div className="panel"><h2>Runtime safety</h2><div className="healthList"><span>Global kill switch <strong>{controls?.global_kill_switch ? 'ON' : 'OFF'}</strong></span><span>Email <strong>{controls?.email_paused ? 'PAUSED' : 'ENABLED'}</strong></span><span>WhatsApp AI <strong>{controls?.whatsapp_ai_paused ? 'PAUSED' : 'ENABLED'}</strong></span><span>AI agents <strong>{controls?.agents_paused ? 'PAUSED' : 'ENABLED'}</strong></span><span>Monthly budget <strong>${controls?.monthly_budget_usd ?? 20}</strong></span></div></div>
      <div className="panel"><h2>Integration readiness</h2><div className="healthList"><span>Ready <strong>{ints.filter((integration) => integration.status === 'READY').length}</strong></span><span>Not configured <strong>{ints.filter((integration) => integration.status === 'NOT_CONFIGURED').length}</strong></span><span>Degraded / error <strong>{ints.filter((integration) => ['DEGRADED', 'ERROR'].includes(integration.status)).length}</strong></span><span>Enabled connections <strong>{ints.filter((integration) => integration.enabled).length}</strong></span></div><Link className="textLink" href="/integrations">Open integrations →</Link></div>
    </section>
  </div>;
}
