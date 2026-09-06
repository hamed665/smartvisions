'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type LiveConversation = {
  id: string;
  lead_id: string | null;
  channel: string;
  stage: string;
  priority: number;
  unread_count: number;
  awaiting_party: string;
  requires_human: boolean;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_message_at: string | null;
  detected_language: string | null;
  detected_dialect: string | null;
  persian_summary: string | null;
  intent_label: string | null;
  sentiment_label: string | null;
  stage_reason: string | null;
  agent_mode: string | null;
  updated_at: string;
};

type LiveLead = {
  id: string;
  status: string;
  agent_mode: string | null;
  recommended_offer: string | null;
} | null;

type LiveMessage = {
  id: string;
  direction: string;
  media_type: string;
  original_text: string | null;
  transcript: string | null;
  detected_language: string | null;
  detected_dialect: string | null;
  persian_translation: string | null;
  intent_label: string | null;
  sentiment_label: string | null;
  confidence: number | null;
  status: string;
  requires_approval: boolean;
  approval_reason: string | null;
  provider_message_id: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  sent_at: string | null;
};

export type LiveConversationSnapshot = {
  conversation: LiveConversation;
  messages: LiveMessage[];
  lead: LiveLead;
  editable: boolean;
  serverTime: string;
};

export type InboxConversationItem = {
  id: string;
  channel: string;
  stage: string;
  unread_count: number;
  requires_human: boolean;
  agent_mode: string | null;
  persian_summary: string | null;
  last_message_at: string | null;
};

function sourceOf(message: LiveMessage) {
  const metadata = message.metadata && typeof message.metadata === 'object' ? message.metadata : {};
  return typeof metadata.source === 'string' ? metadata.source : '';
}

function formatClock(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function statusClass(value: string) {
  return `liveState liveState-${value.toLowerCase().replaceAll('_', '-')}`;
}

export function LiveConversationConsole({
  initialSnapshot,
  inbox,
}: {
  initialSnapshot: LiveConversationSnapshot;
  inbox: InboxConversationItem[];
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'TAKEOVER' | 'RESUME' | 'SEND' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState(() => Date.now());
  const endRef = useRef<HTMLDivElement | null>(null);
  const initialScrollDone = useRef(false);
  const requestInFlight = useRef(false);

  const conversation = snapshot.conversation;
  const lead = snapshot.lead;
  const fullOwnerTakeover = Boolean(
    conversation.requires_human
      && String(conversation.agent_mode ?? '').toUpperCase() === 'HUMAN'
      && String(lead?.agent_mode ?? '').toUpperCase() === 'HUMAN',
  );
  const anyHumanLock = Boolean(
    conversation.requires_human
      || String(conversation.agent_mode ?? '').toUpperCase() === 'HUMAN'
      || String(lead?.agent_mode ?? '').toUpperCase() === 'HUMAN',
  );
  const terminal = ['WON', 'LOST', 'DO_NOT_CONTACT', 'SPAM'].includes(String(conversation.stage).toUpperCase());
  const manualReplyAvailable = fullOwnerTakeover && conversation.channel === 'WHATSAPP' && snapshot.editable && !terminal;

  const refresh = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const response = await fetch(`/api/conversations/${conversation.id}/live`, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const body = await response.json() as LiveConversationSnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Live refresh failed');
      setSnapshot(body);
      setLastSync(Date.now());
      setLiveError(null);
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : 'Live refresh failed');
    } finally {
      requestInFlight.current = false;
    }
  }, [conversation.id]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const interval = window.setInterval(tick, 2500);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  useEffect(() => {
    if (!initialScrollDone.current) {
      endRef.current?.scrollIntoView({ block: 'end' });
      initialScrollDone.current = true;
    }
  }, []);

  const latestMessageId = snapshot.messages.at(-1)?.id;
  useEffect(() => {
    if (!latestMessageId || !initialScrollDone.current) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [latestMessageId]);

  const stateLabel = useMemo(() => {
    if (terminal) return conversation.stage.replaceAll('_', ' ');
    if (fullOwnerTakeover) return 'OWNER TAKEOVER';
    if (anyHumanLock) return 'SAFETY HOLD';
    if (String(conversation.agent_mode ?? 'AUTO').toUpperCase() === 'PAUSED') return 'PAUSED';
    return 'AI ACTIVE';
  }, [anyHumanLock, conversation.agent_mode, conversation.stage, fullOwnerTakeover, terminal]);

  async function changeControl(action: 'TAKEOVER' | 'RESUME') {
    if (busy) return;
    setBusy(action);
    setNotice(null);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Conversation control failed');
      setNotice(action === 'TAKEOVER'
        ? 'AI stopped for this conversation only. You can reply manually now.'
        : 'AI resumed for future inbound messages. No older message was replayed.');
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Conversation control failed');
    } finally {
      setBusy(null);
    }
  }

  async function sendOwnerReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !manualReplyAvailable) return;
    const text = draft.trim();
    if (!text) return;

    setBusy('SEND');
    setNotice(null);
    const requestId = crypto.randomUUID();
    try {
      const response = await fetch(`/api/conversations/${conversation.id}/owner-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, requestId }),
      });
      const body = await response.json() as {
        sent?: boolean;
        error?: string;
        warning?: string;
        reconciliationWarnings?: string[];
      };
      if (!response.ok && !body.sent) throw new Error(body.error ?? 'Manual reply failed');
      setDraft('');
      if (body.warning || body.reconciliationWarnings?.length) {
        setNotice('Message was accepted by WhatsApp. A local reconciliation warning was recorded; do not resend it.');
      } else {
        setNotice('Manual reply sent. AI remains stopped for this conversation.');
      }
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Manual reply failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="liveConsolePage">
      <aside className="liveInboxRail" aria-label="Conversation inbox">
        <div className="liveRailHeader">
          <Link href="/conversations" className="textLink">← Inbox</Link>
          <strong>Recent chats</strong>
        </div>
        <div className="liveRailList">
          {inbox.map((item) => (
            <Link
              key={item.id}
              href={`/conversations/${item.id}`}
              className={`liveRailItem ${item.id === conversation.id ? 'active' : ''}`}
            >
              <div className="liveRailTopline">
                <strong>{item.channel}</strong>
                <span>{formatClock(item.last_message_at)}</span>
              </div>
              <p dir="rtl">{item.persian_summary || 'هنوز خلاصه فارسی ندارد'}</p>
              <div className="liveRailBadges">
                <span>{item.stage.replaceAll('_', ' ')}</span>
                {item.requires_human || String(item.agent_mode ?? '').toUpperCase() === 'HUMAN'
                  ? <span className="humanBadge">Owner</span>
                  : null}
                {item.unread_count > 0 ? <span className="unreadBadge">{item.unread_count}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      </aside>

      <section className="liveChatPanel">
        <header className="liveChatHeader">
          <div>
            <Link className="liveMobileBack" href="/conversations">← Inbox</Link>
            <div className="liveTitleRow">
              <h1>Live Conversation</h1>
              <span className={statusClass(stateLabel)}>{stateLabel}</span>
            </div>
            <p className="muted">
              {conversation.channel} · {conversation.detected_language || 'language pending'}
              {conversation.detected_dialect ? ` / ${conversation.detected_dialect}` : ''}
            </p>
          </div>
          <div className="liveHeaderActions">
            <span className={`livePulse ${liveError ? 'error' : ''}`}>
              <i /> {liveError ? 'Reconnect' : 'Live'}
            </span>
            {!terminal && snapshot.editable && !fullOwnerTakeover ? (
              <button
                type="button"
                className="ownerTakeoverButton"
                disabled={Boolean(busy)}
                onClick={() => void changeControl('TAKEOVER')}
              >
                {busy === 'TAKEOVER' ? 'Stopping…' : anyHumanLock ? 'Confirm Take Over' : 'Stop AI · Take Over'}
              </button>
            ) : null}
            {!terminal && snapshot.editable && fullOwnerTakeover ? (
              <button
                type="button"
                className="resumeAiButton"
                disabled={Boolean(busy)}
                onClick={() => void changeControl('RESUME')}
              >
                {busy === 'RESUME' ? 'Resuming…' : 'Resume AI'}
              </button>
            ) : null}
          </div>
        </header>

        {notice ? <div className="liveNotice" role="status">{notice}</div> : null}
        {liveError ? <div className="liveNotice liveNoticeError">Live refresh issue: {liveError}. The page will keep retrying.</div> : null}

        <div className="liveMessageStream" aria-live="polite">
          {snapshot.messages.length === 0 ? (
            <div className="liveEmptyState">No messages in this conversation yet.</div>
          ) : snapshot.messages.map((message) => {
            const inbound = message.direction === 'INBOUND';
            const source = sourceOf(message);
            const sender = inbound ? 'Customer' : source === 'OWNER_MANUAL_REPLY' ? 'You' : 'Smart Visions AI';
            const body = message.transcript || message.original_text || 'Media without transcript';
            return (
              <article key={message.id} className={`liveBubbleRow ${inbound ? 'inbound' : 'outbound'}`}>
                <div className={`liveBubble ${inbound ? 'inbound' : 'outbound'} ${message.status === 'FAILED' ? 'failed' : ''}`}>
                  <div className="liveBubbleMeta">
                    <strong>{sender}</strong>
                    <span>{message.media_type}</span>
                    <span>{formatShortDate(message.created_at)}</span>
                  </div>
                  <div className="liveOriginalText">{body}</div>
                  {inbound ? (
                    <div className="liveTranslation" dir="rtl">
                      <span>ترجمه فارسی</span>
                      <p>{message.persian_translation || 'ترجمه هنوز آماده نشده است.'}</p>
                    </div>
                  ) : null}
                  <div className="liveDeliveryRow">
                    <span>{message.status}</span>
                    {message.requires_approval ? <span>Approval required</span> : null}
                    {message.status === 'FAILED' && message.approval_reason ? <span>{message.approval_reason}</span> : null}
                  </div>
                </div>
              </article>
            );
          })}
          <div ref={endRef} />
        </div>

        <form className="liveComposer" onSubmit={sendOwnerReply}>
          <div className="liveComposerStatus">
            {manualReplyAvailable
              ? 'You are replying manually. AI is stopped only for this chat.'
              : terminal
                ? 'This conversation is terminal and cannot send.'
                : conversation.channel !== 'WHATSAPP'
                  ? 'Manual reply is currently available for WhatsApp conversations.'
                  : 'Take over this conversation to reply manually.'}
            <span>Synced {new Date(lastSync).toLocaleTimeString()}</span>
          </div>
          <div className="liveComposerRow">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={manualReplyAvailable ? 'Type your reply…' : 'Stop AI to reply as Owner'}
              disabled={!manualReplyAvailable || Boolean(busy)}
              maxLength={4096}
              rows={2}
              aria-label="Owner manual reply"
            />
            <button
              type="submit"
              disabled={!manualReplyAvailable || Boolean(busy) || !draft.trim()}
            >
              {busy === 'SEND' ? 'Sending…' : 'Send'}
            </button>
          </div>
          <div className="liveComposerFoot">
            <span>{draft.length}/4096</span>
            <span>No automatic retry. WhatsApp 24h, DNC, suppression, market and Cost Guard still apply.</span>
          </div>
        </form>
      </section>

      <aside className="liveDetailsPanel">
        <div className="panel">
          <h2>Customer context</h2>
          <div className="persianBrief" dir="rtl">
            {conversation.persian_summary || 'هنوز خلاصه فارسی ایجاد نشده است.'}
          </div>
          <div className="healthList">
            <span>Stage <strong>{conversation.stage.replaceAll('_', ' ')}</strong></span>
            <span>Intent <strong>{conversation.intent_label || '—'}</strong></span>
            <span>Sentiment <strong>{conversation.sentiment_label || '—'}</strong></span>
            <span>Priority <strong>{conversation.priority}</strong></span>
            <span>Lead <strong>{lead?.status || '—'}</strong></span>
            <span>Agent <strong>{fullOwnerTakeover ? 'OWNER' : conversation.agent_mode || 'AUTO'}</strong></span>
            <span>Waiting for <strong>{conversation.awaiting_party || '—'}</strong></span>
          </div>
        </div>
        {lead?.recommended_offer ? (
          <div className="panel">
            <h2>Recommended offer</h2>
            <p>{lead.recommended_offer}</p>
          </div>
        ) : null}
        <div className="panel liveSafetyPanel">
          <h2>Takeover safety</h2>
          <p className="muted">Take Over stops autonomous sending only for this conversation. A final provider-boundary check prevents an in-flight AI draft from sending after the human lock is claimed.</p>
          <p className="muted">Resume AI affects future inbound messages only. It never replays an older draft or blocked message.</p>
        </div>
      </aside>
    </div>
  );
}
