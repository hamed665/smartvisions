import Link from 'next/link';
import { customerStudioScope, loadStudioThreads, studioTimeZone, type StudioQuery } from '@/lib/access/customer-studio';
import { StudioBadge, StudioEmpty, StudioHeading, studioDate, studioHref, studioLabel } from '../studio-ui';

export const dynamic = 'force-dynamic';

export default async function CustomerCrmPage({ searchParams }: { searchParams: Promise<StudioQuery> }) {
  const params = await searchParams;
  const scope = await customerStudioScope(params.businessId);
  const { business } = scope;
  const zone = studioTimeZone(business.timezone);
  const threads = await loadStudioThreads(scope, { page: params.page });

  return <>
    <StudioHeading section="RELATIONSHIPS" title="CRM" description="Follow WhatsApp relationships and review the evidence behind each lead score." />
    <section className="studio-panel">
      <div className="studio-panel-heading"><h2>Conversation signals</h2><span>Business-scoped</span></div>
      {threads.items.length ? <div className="studio-table-wrap"><table className="studio-table">
        <thead><tr><th scope="col">Contact</th><th scope="col">Stage</th><th scope="col">Lead score</th><th scope="col">Last activity</th></tr></thead>
        <tbody>{threads.items.map(thread => <tr key={thread.id}>
          <td><Link href={studioHref('/customer/inbox', business.id, { thread: thread.id })} dir="auto">{thread.name} ↗</Link>
            <small>{thread.intent ? studioLabel(thread.intent) : 'No intent recorded'}</small></td>
          <td><StudioBadge tone={thread.requiresHuman ? 'attention' : 'neutral'}>{studioLabel(thread.stage)}</StudioBadge></td>
          <td>{thread.score === null ? 'Not scored' : <strong>{thread.score} / 100</strong>}
            {thread.scoreReasons.length > 0 && <details><summary>Score evidence</summary><ul>{thread.scoreReasons.map((reason, index) => <li key={index} dir="auto">{reason}</li>)}</ul></details>}</td>
          <td>{studioDate(thread.activity, zone)}</td>
        </tr>)}</tbody>
      </table></div> : <StudioEmpty title="No CRM signals yet" description="Linked WhatsApp conversations will appear here as they arrive." />}
      {(threads.page > 1 || threads.hasMore) && <div className="studio-pagination">
        {threads.page > 1 && <Link href={studioHref('/customer/crm', business.id, { page: String(threads.page - 1) })}>← Previous</Link>}
        {threads.hasMore && <Link href={studioHref('/customer/crm', business.id, { page: String(threads.page + 1) })}>Next →</Link>}
      </div>}
    </section>
  </>;
}
