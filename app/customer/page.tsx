import Link from 'next/link';
import { loadCustomerConnections } from '@/lib/access/customer-connections';
import { customerStudioScope, loadStudioKnowledge, loadStudioToday, loadStudioThreads, studioTimeZone, type StudioQuery } from '@/lib/access/customer-studio';
import { StudioBadge, StudioEmpty, StudioHeading, studioDate, studioHref, studioLabel } from './studio-ui';

export const dynamic = 'force-dynamic';

export default async function CustomerHomePage({ searchParams }: { searchParams: Promise<StudioQuery> }) {
  const { businessId } = await searchParams;
  const scope = await customerStudioScope(businessId);
  const { business, supabase } = scope;
  const [connection, today, threads, knowledge] = await Promise.all([
    loadCustomerConnections({ requestedBusinessId: business.id, supabase }),
    loadStudioToday(scope),
    loadStudioThreads(scope),
    loadStudioKnowledge(scope),
  ]);
  const zone = studioTimeZone(business.timezone);
  const day = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', timeZone: zone }).format(new Date());
  const connected = connection.whatsapp.status === 'Connected';
  const inbox = studioHref('/customer/inbox', business.id);
  const connectionUrl = studioHref('/customer/connections', business.id);
  const assistantUrl = studioHref('/customer/ai', business.id);
  const profilePublished = knowledge.some(version => version.active && version.approval_status === 'APPROVED');
  const steps = [
    { title: 'Connect WhatsApp', detail: 'Use Meta authorization for your business number.', href: connectionUrl, done: connected },
    { title: 'Prepare your assistant', detail: 'Add your services and rules, then review and publish the profile.', href: assistantUrl, done: profilePublished },
    { title: 'Open your first conversation', detail: 'Check an incoming message and review who can respond.', href: inbox, done: threads.items.length > 0 },
  ];

  return <>
    <StudioHeading section={day} title="Today" description={'WhatsApp activity for '+business.name+'.'}
      action={<Link className="studio-button" href={inbox}>Open inbox <span aria-hidden="true">↗</span></Link>} />
    <section className="studio-overview" aria-label="WhatsApp activity">
      <div className="studio-feature">
        <div className="studio-feature-top"><span>WHATSAPP CHANNEL</span><StudioBadge tone={connected ? 'positive' : 'attention'}>{connection.whatsapp.status}</StudioBadge></div>
        <div><h2>{connected ? 'Your channel is connected' : 'Connect your WhatsApp'}</h2>
          <p>{connected ? 'Review conversations and prepare the assistant for your team.' : 'Connect your existing business number through Meta to start receiving conversations here.'}</p></div>
        <Link className="studio-feature-link" href={connectionUrl}>{connected ? 'Manage connection' : 'Review connection setup'} <span aria-hidden="true">↗</span></Link>
      </div>
      <div className="studio-metrics">
        {[['received', 'Received today', today.received], ['waiting', 'Waiting for us', today.waiting], ['human', 'Need a person', today.human]].map(([key, label, count]) =>
          <Link className="studio-metric" key={key} href={studioHref('/customer/inbox', business.id, { focus: String(key) })}>
            <span>{label}</span><strong>{count}</strong><span aria-hidden="true">↗</span>
          </Link>)}
      </div>
    </section>
    {steps.some(step => !step.done) && <section className="studio-panel studio-recent" aria-label="Getting started">
      <div className="studio-panel-heading"><div><span className="studio-kicker">SETUP</span><h2>Getting started</h2></div>
        <span>{steps.filter(step => step.done).length} of {steps.length} complete</span></div>
      <ol className="studio-list">{steps.map((step, index) => <li key={step.title}><Link href={step.href}>
        <span><strong>{index + 1}. {step.title}</strong><small>{step.detail}</small></span>
        <StudioBadge tone={step.done ? 'positive' : 'neutral'}>{step.done ? 'Complete' : 'Open step'}</StudioBadge>
      </Link></li>)}</ol>
    </section>}
    <section className="studio-panel studio-recent">
      <div className="studio-panel-heading"><div><span className="studio-kicker">YOUR INBOX</span><h2>Recent conversations</h2></div><Link href={inbox}>View all →</Link></div>
      {!threads.items.length ? <StudioEmpty title="No conversations yet" description="Messages linked to this business will appear here." />
        : <ul className="studio-list">{threads.items.slice(0, 6).map(thread => <li key={thread.id}><Link href={studioHref('/customer/inbox', business.id, { thread: thread.id })}>
          <span><strong dir="auto">{thread.name}</strong><small>{thread.intent ? studioLabel(thread.intent) : 'WhatsApp conversation'}</small></span>
          <span><StudioBadge tone={thread.requiresHuman ? 'attention' : 'neutral'}>{studioLabel(thread.stage)}</StudioBadge><small>{studioDate(thread.activity, zone)}</small></span>
        </Link></li>)}</ul>}
    </section>
  </>;
}
