import Link from 'next/link';
import { getCurrentOrganization } from '@/lib/supabase/org';
import {
  loadUnifiedInboxPage,
  parseUnifiedInboxQuery,
  type UnifiedInboxCounters,
  type UnifiedInboxQuery,
} from '@/lib/conversations/unified-inbox-query';

export const dynamic = 'force-dynamic';

type SearchParamsInput = Record<string, string | string[] | undefined>;

const primaryFilters: Array<{
  label: string;
  stage?: string;
  human?: boolean;
  unread?: boolean;
  count: (counters: UnifiedInboxCounters) => number;
}> = [
  { label: 'All', count: (counters) => counters.total },
  { label: 'Active', stage: 'ACTIVE', count: (counters) => counters.stages.ACTIVE ?? 0 },
  { label: 'Unanswered', stage: 'UNANSWERED', count: (counters) => counters.stages.UNANSWERED ?? 0 },
  { label: 'Closing', stage: 'CLOSING', count: (counters) => counters.stages.CLOSING ?? 0 },
  { label: 'Hot', stage: 'HOT', count: (counters) => counters.stages.HOT ?? 0 },
  { label: 'Human', human: true, count: (counters) => counters.human },
  { label: 'Unread', unread: true, count: (counters) => counters.unread },
  { label: 'Needs Human', stage: 'NEEDS_HUMAN', count: (counters) => counters.stages.NEEDS_HUMAN ?? 0 },
  { label: 'Follow-up', stage: 'FOLLOW_UP_DUE', count: (counters) => counters.stages.FOLLOW_UP_DUE ?? 0 },
  { label: 'Won', stage: 'WON', count: (counters) => counters.stages.WON ?? 0 },
];

function toUrlSearchParams(input: SearchParamsInput) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (typeof value === 'string') {
      params.set(key, value);
    }
  }

  if (params.get('owner') === '1' && !params.has('human')) {
    params.set('human', '1');
  }
  params.delete('owner');
  return params;
}

function inboxHref(
  base: URLSearchParams,
  patch: Record<string, string | null | undefined>,
) {
  const next = new URLSearchParams(base);
  for (const [key, value] of Object.entries(patch)) {
    if (!value) next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `/conversations?${query}` : '/conversations';
}

function filterActive(
  query: UnifiedInboxQuery,
  filter: (typeof primaryFilters)[number],
) {
  if (filter.stage) return query.stage === filter.stage && !query.humanOnly && !query.unreadOnly;
  if (filter.human) return query.humanOnly && !query.stage && !query.unreadOnly;
  if (filter.unread) return query.unreadOnly && !query.stage && !query.humanOnly;
  return !query.stage && !query.humanOnly && !query.unreadOnly;
}

function formatActivity(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const rawParams = await searchParams;
  const params = toUrlSearchParams(rawParams);
  const { supabase, organizationId } = await getCurrentOrganization();

  let query: UnifiedInboxQuery;
  let inbox: Awaited<ReturnType<typeof loadUnifiedInboxPage>>;

  try {
    query = parseUnifiedInboxQuery(params);
    inbox = await loadUnifiedInboxPage({ supabase, organizationId, query });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Unified Inbox';
    return (
      <section>
        <div className="headerRow">
          <div>
            <p className="muted">Scoped Unified Inbox</p>
            <h1>Conversations</h1>
          </div>
        </div>
        <div className="panel">
          <h2>Inbox filters could not be loaded</h2>
          <p className="muted">{message}</p>
          <Link className="textLink" href="/conversations">Reset filters</Link>
        </div>
      </section>
    );
  }

  const pageStartHref = inboxHref(params, { cursor: null });
  const nextHref = inbox.nextCursor
    ? inboxHref(params, { cursor: inbox.nextCursor })
    : null;

  return (
    <section>
      <div className="headerRow">
        <div>
          <p className="muted">Scoped Unified Inbox</p>
          <h1>Conversations</h1>
          <p className="muted">
            Per-user unread state, deterministic cursor pagination and Smart Core scope controls.
          </p>
        </div>
        <div className="status">
          {inbox.counters.unread} unread · {inbox.counters.human} human
        </div>
      </div>

      <div className="conversationFilters">
        {primaryFilters.map((filter) => {
          const href = inboxHref(params, {
            stage: filter.stage ?? null,
            human: filter.human ? '1' : null,
            unread: filter.unread ? '1' : null,
            cursor: null,
          });
          const count = filter.count(inbox.counters);
          return (
            <Link
              className={`conversationFilter ${filterActive(query, filter) ? 'active' : ''}`}
              href={href}
              key={filter.label}
            >
              {filter.label} · {count}
            </Link>
          );
        })}
      </div>

      <form className="settingsGrid panel" method="get">
        {query.stage ? <input type="hidden" name="stage" value={query.stage} /> : null}
        {query.humanOnly ? <input type="hidden" name="human" value="1" /> : null}
        {query.unreadOnly ? <input type="hidden" name="unread" value="1" /> : null}
        {query.branchId ? <input type="hidden" name="branch" value={query.branchId} /> : null}
        {query.teamId ? <input type="hidden" name="team" value={query.teamId} /> : null}

        <label>
          Search
          <input
            name="q"
            maxLength={100}
            defaultValue={query.query ?? ''}
            placeholder="Customer, summary, intent or conversation ID"
          />
        </label>

        <label>
          Channel
          <select name="channel" defaultValue={query.channel ?? ''}>
            <option value="">All channels</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">Email</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="TELEGRAM">Telegram</option>
            <option value="WEB_CHAT">Web Chat</option>
            <option value="FACEBOOK">Facebook</option>
            <option value="TIKTOK">TikTok</option>
          </select>
        </label>

        <label>
          Chatwoot status
          <select name="chatwootStatus" defaultValue={query.chatwootStatus ?? ''}>
            <option value="">Any status</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="snoozed">Snoozed</option>
          </select>
        </label>

        <label>
          Label
          <input
            name="label"
            maxLength={120}
            defaultValue={query.label ?? ''}
            placeholder="Exact Chatwoot label"
          />
        </label>

        <button type="submit">Apply filters</button>
        <Link className="textLink" href="/conversations">Clear all</Link>
      </form>

      {inbox.items.length === 0 ? (
        <div className="panel">
          <h2>No conversations here</h2>
          <p className="muted">
            The current scoped filters returned no conversations. New inbound conversations appear after reconciliation.
          </p>
        </div>
      ) : null}

      <div className="conversationList">
        {inbox.items.map((row) => {
          const humanControlled = row.requires_human
            || String(row.agent_mode ?? '').toUpperCase() === 'HUMAN';
          return (
            <Link
              className="conversationCard conversationLink"
              href={`/conversations/${row.conversation_id}`}
              key={row.conversation_id}
            >
              <div className="conversationTopline">
                <strong>{row.customer_name || 'Customer'}</strong>
                <span className="stageBadge">{row.channel}</span>
                <span className={`stageBadge stage-${row.stage.toLowerCase().replaceAll('_', '-')}`}>
                  {row.stage.replaceAll('_', ' ')}
                </span>
                {row.chatwoot_status ? <span className="stageBadge">{row.chatwoot_status}</span> : null}
                {row.unread_count > 0 ? <span className="unreadBadge">{row.unread_count} unread</span> : null}
                {humanControlled ? <span className="humanBadge">Human</span> : <span className="stageBadge">AI</span>}
              </div>

              <p className="persianBrief" dir="rtl">
                {row.persian_summary || 'خلاصه فارسی پس از پردازش پیام اینجا نمایش داده می‌شود.'}
              </p>

              <div className="conversationMeta">
                <span>Intent: {row.intent_label || '—'}</span>
                <span>Sentiment: {row.sentiment_label || '—'}</span>
                <span>
                  Language: {row.detected_language || '—'}
                  {row.detected_dialect ? ` / ${row.detected_dialect}` : ''}
                </span>
                <span>Priority: {row.priority}</span>
                <span>Activity: {formatActivity(row.activity_at)}</span>
                {row.labels.length ? <span>Labels: {row.labels.join(', ')}</span> : null}
              </div>

              {row.stage_reason ? <p className="muted">Why: {row.stage_reason}</p> : null}
            </Link>
          );
        })}
      </div>

      <div className="quickActions">
        {query.cursor ? <Link href={pageStartHref}>First page</Link> : null}
        {nextHref ? <Link href={nextHref}>Next {query.limit}</Link> : null}
      </div>
    </section>
  );
}
