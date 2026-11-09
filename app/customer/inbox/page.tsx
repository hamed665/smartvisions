import Link from 'next/link';
import { customerStudioScope, loadStudioHistory, loadStudioThreads, studioTimeZone, type StudioQuery } from '@/lib/access/customer-studio';
import { StudioAudioPlayer } from './audio-player';
import { StudioMessageStream } from './message-stream';
import { StudioReply } from './reply';
import { StudioBadge, StudioEmpty, StudioHeading, studioDate, studioHref, studioLabel } from '../studio-ui';

export const dynamic = 'force-dynamic';

export default async function CustomerInboxPage({ searchParams }: { searchParams: Promise<StudioQuery> }) {
  const params = await searchParams;
  const scope = await customerStudioScope(params.businessId);
  const { business } = scope;
  const zone = studioTimeZone(business.timezone);
  const focus = ['received', 'waiting', 'human'].includes(params.focus ?? '') ? params.focus : undefined;
  const [threads, history] = await Promise.all([
    loadStudioThreads(scope, { page: params.page, focus }),
    params.thread ? loadStudioHistory(scope, params.thread, params.before) : Promise.resolve(null),
  ]);
  const href = (fields: Record<string, string | null | undefined> = {}) =>
    studioHref('/customer/inbox', business.id, { focus, page: threads.page > 1 ? String(threads.page) : undefined, ...fields });
  const filters = [['All', undefined], ['Received today', 'received'], ['Waiting for us', 'waiting'], ['Need a person', 'human']];

  return <>
    <StudioHeading section="MESSAGING" title="Inbox" description="Read WhatsApp conversations in this business." />
    <div className="studio-filters" aria-label="Conversation filters">
      {filters.map(([label, value]) => <Link href={href({ focus: value, page: undefined })} key={label}
        aria-current={focus === value ? 'true' : undefined}>{label}</Link>)}
    </div>
    <div className="studio-inbox" data-thread={Boolean(history)}>
      <section className="studio-panel studio-threads" aria-label="Conversation list">
        <div className="studio-panel-heading"><h2>Conversations</h2><span>{threads.items.length} on this page</span></div>
        {threads.items.length ? <ul className="studio-list">{threads.items.map(thread => <li key={thread.id}>
          <Link href={href({ thread: thread.id })} aria-current={history?.thread.id === thread.id ? 'true' : undefined}>
            <span><strong dir="auto">{thread.name}</strong><small>{studioDate(thread.activity, zone)}</small></span>
            <StudioBadge tone={thread.requiresHuman ? 'attention' : 'neutral'}>{studioLabel(thread.stage)}</StudioBadge>
          </Link></li>)}</ul> : <StudioEmpty title="No matching conversations" description="Select another filter or check your WhatsApp connection." />}
        {(threads.page > 1 || threads.hasMore) && <div className="studio-pagination">
          {threads.page > 1 && <Link href={href({ page: String(threads.page - 1) })}>← Previous</Link>}
          {threads.hasMore && <Link href={href({ page: String(threads.page + 1) })}>Next →</Link>}
        </div>}
      </section>
      <section className="studio-panel studio-conversation" aria-label="Message history">
        {history ? <>
          <div className="studio-panel-heading">
            <div><Link className="studio-thread-back" href={href()}>← All conversations</Link><h2 dir="auto">{history.thread.name}</h2>
              <span>{history.thread.language ?? 'WhatsApp'} · Message history</span></div>
            <StudioBadge tone={history.thread.requiresHuman ? 'attention' : 'neutral'}>{studioLabel(history.thread.stage)}</StudioBadge>
          </div>
          {history.older && <Link className="studio-history-link" href={href({ thread: history.thread.id, before: history.older })}>← Earlier messages</Link>}
          {params.before && <Link className="studio-history-link" href={href({ thread: history.thread.id })}>Latest messages →</Link>}
          {history.messages.length ? <StudioMessageStream key={params.before ?? history.thread.id} latestId={params.before ? undefined : history.messages.at(-1)?.id}>
            {history.messages.map(message => <li key={message.id} data-direction={message.direction}>
              <span className="studio-message-meta">{message.direction === 'INBOUND' ? 'Customer' : 'Business'} · {studioDate(message.created_at, zone)}</span>
              <p dir="auto">{message.original_text || message.transcript || studioLabel(message.media_type)+' message'}</p>
              {message.playable && <StudioAudioPlayer src={studioHref('/api/customer/studio-media/'+message.id, business.id, { thread: history.thread.id })} />}
              {message.original_text && message.transcript && message.original_text !== message.transcript &&
                <details><summary>Transcript</summary><p dir="auto">{message.transcript}</p></details>}
              <small>{studioLabel(message.provider_delivery_status ?? message.status)}</small>
            </li>)}
          </StudioMessageStream> : <StudioEmpty title="No message history available" description="The thread is linked, but its messages are not available here yet." />}
          {!params.before && business.organizationRole === 'OWNER'
            && !['WON','LOST','DO_NOT_CONTACT','SPAM'].includes(history.thread.stage)
            && <StudioReply key={history.thread.id} businessId={business.id}
              threadId={history.thread.id} humanControl={history.thread.humanControl} />}
        </> : <StudioEmpty title="Open a conversation" description="Choose a customer on the left to review their messages and current status." />}
      </section>
    </div>
  </>;
}
