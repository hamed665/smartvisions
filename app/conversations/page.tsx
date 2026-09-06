import Link from 'next/link';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

const filters = [
  { label: 'All', href: '/conversations', stage: null, owner: false },
  { label: 'Active', href: '/conversations?stage=ACTIVE', stage: 'ACTIVE', owner: false },
  { label: 'Unanswered', href: '/conversations?stage=UNANSWERED', stage: 'UNANSWERED', owner: false },
  { label: 'Closing', href: '/conversations?stage=CLOSING', stage: 'CLOSING', owner: false },
  { label: 'Hot', href: '/conversations?stage=HOT', stage: 'HOT', owner: false },
  { label: 'Owner', href: '/conversations?owner=1', stage: null, owner: true },
  { label: 'Needs Human', href: '/conversations?stage=NEEDS_HUMAN', stage: 'NEEDS_HUMAN', owner: false },
  { label: 'Follow-up', href: '/conversations?stage=FOLLOW_UP_DUE', stage: 'FOLLOW_UP_DUE', owner: false },
  { label: 'Won', href: '/conversations?stage=WON', stage: 'WON', owner: false },
] as const;

type ConversationRow = {
  id: string;
  channel: string;
  stage: string;
  priority: number;
  unread_count: number;
  requires_human: boolean;
  agent_mode: string | null;
  detected_language: string | null;
  detected_dialect: string | null;
  persian_summary: string | null;
  intent_label: string | null;
  sentiment_label: string | null;
  stage_reason: string | null;
  last_message_at: string | null;
};

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; owner?: string }>;
}) {
  const { stage, owner } = await searchParams;
  const ownerOnly = owner === '1';
  const { supabase, organizationId } = await getCurrentOrganization();

  let query = supabase
    .from('sales_conversations')
    .select('id,channel,stage,priority,unread_count,requires_human,agent_mode,detected_language,detected_dialect,persian_summary,intent_label,sentiment_label,stage_reason,last_message_at')
    .eq('organization_id', organizationId)
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(100);

  if (ownerOnly) query = query.eq('agent_mode', 'HUMAN');
  else if (stage) query = query.eq('stage', stage);

  const [{ data, error }, { data: allStates }] = await Promise.all([
    query,
    supabase
      .from('sales_conversations')
      .select('stage,agent_mode')
      .eq('organization_id', organizationId),
  ]);

  const rows = (data ?? []) as ConversationRow[];
  const counts = (allStates ?? []).reduce<{ stages: Record<string, number>; owner: number }>((acc, row) => {
    acc.stages[row.stage] = (acc.stages[row.stage] ?? 0) + 1;
    if (String(row.agent_mode ?? '').toUpperCase() === 'HUMAN') acc.owner += 1;
    return acc;
  }, { stages: {}, owner: 0 });

  return (
    <section>
      <div className="headerRow">
        <div>
          <p className="muted">Live sales inbox</p>
          <h1>Conversations</h1>
          <p className="muted">Open any chat to watch messages live, see Persian meaning, stop AI for that chat, reply manually and resume later.</p>
        </div>
        <div className="status">Per-conversation AI control</div>
      </div>

      <div className="conversationFilters">
        {filters.map((filter) => {
          const active = filter.owner ? ownerOnly : !ownerOnly && (filter.stage ? stage === filter.stage : !stage);
          const count = filter.owner ? counts.owner : filter.stage ? counts.stages[filter.stage] ?? 0 : rows.length;
          return (
            <Link className={`conversationFilter ${active ? 'active' : ''}`} href={filter.href} key={filter.label}>
              {filter.label}{filter.label !== 'All' && count ? ` · ${count}` : ''}
            </Link>
          );
        })}
      </div>

      {error ? <div className="panel">Conversation query failed: {error.message}</div> : null}
      {!error && rows.length === 0 ? (
        <div className="panel">
          <h2>No conversations here</h2>
          <p className="muted">Try another filter. New inbound conversations will appear here automatically.</p>
        </div>
      ) : null}

      <div className="conversationList">
        {rows.map((row) => {
          const ownerControlled = row.requires_human || String(row.agent_mode ?? '').toUpperCase() === 'HUMAN';
          return (
            <Link className="conversationCard conversationLink" href={`/conversations/${row.id}`} key={row.id}>
              <div className="conversationTopline">
                <strong>{row.channel}</strong>
                <span className={`stageBadge stage-${row.stage.toLowerCase().replaceAll('_', '-')}`}>{row.stage.replaceAll('_', ' ')}</span>
                {row.unread_count > 0 ? <span className="unreadBadge">{row.unread_count} unread</span> : null}
                {ownerControlled ? <span className="humanBadge">Owner / Human</span> : <span className="stageBadge">AI</span>}
              </div>
              <p className="persianBrief" dir="rtl">{row.persian_summary || 'خلاصه فارسی پس از پردازش پیام اینجا نمایش داده می‌شود.'}</p>
              <div className="conversationMeta">
                <span>Intent: {row.intent_label || '—'}</span>
                <span>Sentiment: {row.sentiment_label || '—'}</span>
                <span>Language: {row.detected_language || '—'}{row.detected_dialect ? ` / ${row.detected_dialect}` : ''}</span>
                <span>Priority: {row.priority}</span>
              </div>
              {row.stage_reason ? <p className="muted">Why: {row.stage_reason}</p> : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
