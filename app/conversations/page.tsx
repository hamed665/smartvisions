import { createClient } from '@/lib/supabase/server';

const filters = [
  ['All', ''],
  ['Active', 'ACTIVE'],
  ['Unanswered', 'UNANSWERED'],
  ['Closing', 'CLOSING'],
  ['Hot', 'HOT'],
  ['Needs Human', 'NEEDS_HUMAN'],
  ['Follow-up', 'FOLLOW_UP_DUE'],
  ['Won', 'WON'],
] as const;

type ConversationRow = {
  id: string;
  channel: string;
  stage: string;
  priority: number;
  unread_count: number;
  requires_human: boolean;
  detected_language: string | null;
  detected_dialect: string | null;
  persian_summary: string | null;
  intent_label: string | null;
  sentiment_label: string | null;
  stage_reason: string | null;
  last_message_at: string | null;
};

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const { stage } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('sales_conversations')
    .select('id,channel,stage,priority,unread_count,requires_human,detected_language,detected_dialect,persian_summary,intent_label,sentiment_label,stage_reason,last_message_at')
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(100);

  if (stage) query = query.eq('stage', stage);
  const { data, error } = await query;
  const rows = (data ?? []) as ConversationRow[];

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.stage] = (acc[row.stage] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section>
      <div className="headerRow">
        <div>
          <p className="muted">AI-sorted sales inbox</p>
          <h1>Conversations</h1>
          <p className="muted">Panel stays English. Customer meaning and operator briefs can be shown in Persian.</p>
        </div>
        <div className="status">Auto mode · risk-based approval</div>
      </div>

      <div className="conversationFilters">
        {filters.map(([label, value]) => (
          <a className={`conversationFilter ${stage === value || (!stage && !value) ? 'active' : ''}`} href={value ? `/conversations?stage=${value}` : '/conversations'} key={label}>
            {label}{value && counts[value] ? ` · ${counts[value]}` : ''}
          </a>
        ))}
      </div>

      {error ? <div className="panel">Conversation schema is not deployed yet: {error.message}</div> : null}
      {!error && rows.length === 0 ? (
        <div className="panel">
          <h2>No conversations yet</h2>
          <p className="muted">Inbound Email, WhatsApp, Instagram and web chats will land here and be classified automatically.</p>
        </div>
      ) : null}

      <div className="conversationList">
        {rows.map((row) => (
          <article className="conversationCard" key={row.id}>
            <div className="conversationTopline">
              <strong>{row.channel}</strong>
              <span className={`stageBadge stage-${row.stage.toLowerCase().replaceAll('_', '-')}`}>{row.stage.replaceAll('_', ' ')}</span>
              {row.unread_count > 0 ? <span className="unreadBadge">{row.unread_count} unread</span> : null}
              {row.requires_human ? <span className="humanBadge">Needs Human</span> : null}
            </div>
            <p className="persianBrief" dir="rtl">{row.persian_summary || 'خلاصه فارسی پس از پردازش پیام اینجا نمایش داده می‌شود.'}</p>
            <div className="conversationMeta">
              <span>Intent: {row.intent_label || '—'}</span>
              <span>Sentiment: {row.sentiment_label || '—'}</span>
              <span>Language: {row.detected_language || '—'}{row.detected_dialect ? ` / ${row.detected_dialect}` : ''}</span>
              <span>Priority: {row.priority}</span>
            </div>
            {row.stage_reason ? <p className="muted">Why: {row.stage_reason}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
