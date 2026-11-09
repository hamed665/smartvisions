'use client';

import { useActionState, useState } from 'react';
import { rehearseStudioAssistant } from './rehearsal-action';

const initial: Awaited<ReturnType<typeof rehearseStudioAssistant>> = {};

export function StudioRehearsal({ businessId }: { businessId: string }) {
  const [message, setMessage] = useState('');
  const [state, action, pending] = useActionState(async (previous: typeof initial, data: FormData) => {
    if (data.get('intent') === 'reset') {
      setMessage('');
      return initial;
    }
    const next = await rehearseStudioAssistant(businessId, { history: previous.turns ?? [], message });
    if (!next.error) setMessage('');
    return next.error ? { ...previous, error: next.error } : next;
  }, initial);

  return <form className="studio-form" action={action}>
    <p>Use test messages without personal details. This session uses your published profile and sends nothing to WhatsApp.</p>
    {state.turns?.length ? <ol className="studio-messages">
      {state.turns.map((item, index) => <li key={index} data-direction={item.from === 'customer' ? 'INBOUND' : 'OUTBOUND'}>
        <span className="studio-message-meta">{item.from === 'customer' ? 'Test customer' : 'Assistant preview'}</span>
        <p dir="auto">{item.text}</p>
      </li>)}
    </ol> : null}
    {state.action && <p>Suggested action: {state.action.toLowerCase().replaceAll('_', ' ')}</p>}
    <label>Test message
      <textarea value={message} onChange={event => setMessage(event.currentTarget.value)} maxLength={1200} dir="auto" disabled={pending} />
    </label>
    <div className="studio-filters">
      <button className="studio-button" disabled={pending || !message.trim()}>{pending ? 'Running test…' : 'Run test turn'}</button>
      {state.turns?.length ? <button name="intent" value="reset" disabled={pending}>Clear test</button> : null}
    </div>
    {state.error && <p role="alert">{state.error}</p>}
  </form>;
}
