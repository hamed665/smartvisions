'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

export function StudioReply({ businessId, threadId, humanControl }: {
  businessId: string; threadId: string; humanControl: boolean;
}) {
  const router = useRouter();
  const active = useRef(false);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || uncertain || (humanControl && !text.trim())) return;
    active.current = true;
    setPending(true);
    setMessage('');
    try {
      const path = humanControl ? 'owner-reply' : 'control';
      const response = await fetch('/api/conversations/'+threadId+'/'+path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(humanControl
          ? { businessId, text, requestId: crypto.randomUUID() }
          : { businessId, action: 'TAKEOVER' }),
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
        setMessage(humanControl
          ? 'Reply unavailable. Check the WhatsApp connection, reply window and conversation status.'
          : 'Control could not be confirmed. Check the conversation status.');
      }
      router.refresh();
    } catch {
      if (humanControl) setUncertain(true);
      setMessage(humanControl ? 'Delivery could not be verified. Check message history before sending again.' : 'Control could not be verified.');
      router.refresh();
    } finally {
      setPending(false);
      active.current = false;
    }
  }

  return <form className="studio-form studio-reply" onSubmit={submit}>
    {humanControl ? <label>Reply on WhatsApp
      <textarea value={text} onChange={event => setText(event.currentTarget.value)} maxLength={4096}
        dir="auto" placeholder="Write your reply…" disabled={pending || uncertain} required />
    </label> : <p>Take over to pause automated replies and respond personally.</p>}
    <button className="studio-button" type="submit" disabled={pending || uncertain || (humanControl && !text.trim())}>
      {pending ? 'Working…' : humanControl ? 'Send reply' : 'Take control'}
    </button>
    {message && <p role="status">{message}</p>}
  </form>;
}
