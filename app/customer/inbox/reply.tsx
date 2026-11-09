'use client';

import { useRouter } from 'next/navigation';
import { StudioRecording } from '../ai/recording';
import { useRef, useState, type FormEvent } from 'react';

export function StudioReply({ businessId, threadId, humanControl }: {
  businessId: string; threadId: string; humanControl: boolean;
}) {
  const router = useRouter();
  const active = useRef(false);
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');

  async function send(audio?: Blob) {
    if (active.current || uncertain || (humanControl && !audio && !text.trim())) return false;
    active.current = true;
    setPending(true);
    setMessage('');
    try {
      const path = humanControl ? 'owner-reply' : 'control';
      const requestId = crypto.randomUUID();
      const endpoint = '/api/conversations/'+threadId+'/'+path;
      const url = audio ? endpoint+'?'+new URLSearchParams({ businessId, requestId }) : endpoint;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': audio?.type ?? 'application/json' },
        body: audio ?? JSON.stringify(humanControl ? { businessId, text, requestId } : { businessId, action: 'TAKEOVER' }),
      });
      const result = await response.json();
      if (humanControl && (result.sent || result.providerAccepted)) {
        setText('');
        setMessage(response.status === 202 ? 'Accepted by WhatsApp. History is being reconciled.' : 'Accepted by WhatsApp.');
      } else if (!humanControl && result.ok && (result.result?.claimed || result.result?.reason === 'ALREADY_HUMAN')) {
        setMessage('You have control of this conversation.');
      } else if (humanControl && (response.status >= 500 || result.messageId)) {
        setUncertain(true);
        setMessage('Delivery needs verification. Check the message history before sending again.');
      } else {
        setMessage(audio && response.status === 422 ? 'Use a supported MP3, M4A, or Opus OGG recording under 6 MB.' : humanControl
          ? 'Reply unavailable. Check the WhatsApp connection, reply window and conversation status.'
          : 'Control could not be confirmed. Check the conversation status.');
      }
      router.refresh();
      return Boolean(result.sent || result.providerAccepted);
    } catch {
      if (humanControl) setUncertain(true);
      setMessage(humanControl ? 'Delivery could not be verified. Check message history before sending again.' : 'Control could not be verified.');
      router.refresh();
      return false;
    } finally {
      setPending(false);
      active.current = false;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  return <form className="studio-form studio-reply" onSubmit={submit}>
    {humanControl && <div className="studio-filters" aria-label="Reply format">
      <button type="button" aria-pressed={mode === 'text'} disabled={pending} onClick={() => setMode('text')}>Text</button>
      <button type="button" aria-pressed={mode === 'voice'} disabled={pending} onClick={() => setMode('voice')}>Voice</button>
    </div>}
    {humanControl && mode === 'voice' ? <StudioRecording businessId={businessId} threadId={threadId} disabled={pending || uncertain}
      onSendAudio={send} onTranscript={transcript => { setText(transcript); setMode('text'); }} /> : <>
    {humanControl ? <label>Reply on WhatsApp
      <textarea value={text} onChange={event => setText(event.currentTarget.value)} maxLength={4096}
        dir="auto" placeholder="Write your reply…" disabled={pending || uncertain} required />
    </label> : <p>Take over to pause automated replies and respond personally.</p>}
    <button className="studio-button" type="submit" disabled={pending || uncertain || (humanControl && !text.trim())}>
      {pending ? 'Working…' : humanControl ? 'Send reply' : 'Take control'}
    </button>
    </>}
    {message && <p role="status">{message}</p>}
  </form>;
}
