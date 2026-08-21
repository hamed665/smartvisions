import Link from 'next/link';
import { notFound } from 'next/navigation';
import { runDeterministicWebsiteAudit } from '@/app/audit-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LeadDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const { data: lead } = await supabase
    .from('leads')
    .select('id,status,opportunity_score,intent_score,agent_mode,business_id,businesses(id,name,country_code,city,category,official_website,email,phone,whatsapp,instagram)')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle();
  if (!lead) notFound();
  const business = Array.isArray(lead.businesses) ? lead.businesses[0] : lead.businesses;
  const { data: audits } = business?.id ? await supabase
    .from('website_audits')
    .select('id,status,source_url,title,detected_languages,has_arabic,has_english,has_booking,has_whatsapp,mobile_quality,seo_quality,cta_quality,contact_emails,contact_phones,social_links,evidence,error_message,audited_at,created_at')
    .eq('organization_id', organizationId)
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })
    .limit(10) : { data: [] };
  const latest = audits?.[0];
  const auditMessage = query.audit === 'success' ? 'Website audit completed without an LLM or paid provider.' : query.audit === 'cached' ? 'Fresh cached audit reused; no website request was made.' : query.audit === 'error' ? `Audit failed: ${String(query.message ?? 'unknown error')}` : null;

  return <div>
    <div className="headerRow"><div><h1>{business?.name ?? 'Lead'}</h1><p className="muted">Controlled website evidence and deterministic audit for this lead.</p></div><Link className="textLink" href="/leads">← Leads</Link></div>
    {auditMessage ? <section className="panel"><strong>{auditMessage}</strong></section> : null}
    <section className="statsGrid fourStats">
      <article><span>Status</span><strong>{lead.status}</strong></article>
      <article><span>Website</span><strong>{business?.official_website ? 'PRESENT' : 'MISSING'}</strong></article>
      <article><span>Audit</span><strong>{latest?.status ?? 'NOT RUN'}</strong></article>
      <article><span>Outreach</span><strong>DISABLED</strong></article>
    </section>
    <section className="panel">
      <h2>Controlled website audit</h2>
      <p className="muted">Rule-based first pass only. It fetches the official website with SSRF protection, an 8-second timeout, a 1 MB body cap, daily quota and cache. No LLM or outreach is used.</p>
      <div className="healthList">
        <span>Official website <strong>{business?.official_website ?? 'none'}</strong></span>
        <span>Lead score <strong>{lead.opportunity_score}</strong></span>
        <span>Intent score <strong>{lead.intent_score}</strong></span>
      </div>
      <form action={runDeterministicWebsiteAudit}>
        <input type="hidden" name="leadId" value={lead.id}/>
        <button disabled={role !== 'OWNER' || !business?.official_website}>Run deterministic audit</button>
      </form>
    </section>
    <section className="panel">
      <h2>Latest audit evidence</h2>
      {!latest ? <p className="muted">No audit has been run yet.</p> : <div className="healthList">
        <span>Result <strong>{latest.status}</strong></span>
        <span>Title <strong>{latest.title ?? '—'}</strong></span>
        <span>Languages <strong>{(latest.detected_languages ?? []).join(', ') || '—'}</strong></span>
        <span>Mobile <strong>{latest.mobile_quality ?? '—'}</strong></span>
        <span>SEO <strong>{latest.seo_quality ?? '—'}</strong></span>
        <span>CTA <strong>{latest.cta_quality ?? '—'}</strong></span>
        <span>Booking signal <strong>{latest.has_booking === true ? 'YES' : latest.has_booking === false ? 'NO' : '—'}</strong></span>
        <span>WhatsApp signal <strong>{latest.has_whatsapp === true ? 'YES' : latest.has_whatsapp === false ? 'NO' : '—'}</strong></span>
        <span>Arabic <strong>{latest.has_arabic === true ? 'YES' : latest.has_arabic === false ? 'NO' : '—'}</strong></span>
        <span>English <strong>{latest.has_english === true ? 'YES' : latest.has_english === false ? 'NO' : '—'}</strong></span>
        <span>Audited <strong>{latest.audited_at ? new Date(latest.audited_at).toLocaleString() : '—'}</strong></span>
        {latest.error_message ? <span>Error <strong>{latest.error_message}</strong></span> : null}
      </div>}
    </section>
  </div>;
}
