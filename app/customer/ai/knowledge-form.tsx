'use client';

import { useActionState, useState } from 'react';
import { StudioRecording } from './recording';
import { publishStudioKnowledge, reviseStudioKnowledge, stageStudioKnowledge } from './actions';

const initial = { status: 'idle', message: '' } as const;

export function StudioKnowledgeForm({ businessId }: { businessId: string }) {
  const [mode, setMode] = useState<'text' | 'pdf' | 'voice'>('text');
  const [draft, setDraft] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [state, action, pending] = useActionState(async (previous: Awaited<ReturnType<typeof stageStudioKnowledge>>, form: FormData) => {
    if (mode === 'voice') return previous;
    if (mode === 'pdf' && pdf) form.set('pdf', pdf);
    const next = await stageStudioKnowledge(businessId, form);
    if (next.status === 'questions') {
      setDraft(next.source ?? '');
      setMode('text');
    } else if (next.status === 'success') {
      setDraft('');
      setPdf(null);
    }
    return next;
  }, initial);
  return <form className="studio-form" action={action}>
    <fieldset disabled={pending}>
      <legend>How do you want to share your information?</legend>
      <div className="studio-filters" aria-label="Knowledge input">
        <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Write text</button>
        <button type="button" aria-pressed={mode === 'voice'} onClick={() => setMode('voice')}>Record voice</button>
        <button type="button" aria-pressed={mode === 'pdf'} onClick={() => setMode('pdf')}>Upload PDF</button>
      </div>
      {state.questions?.length ? <div className="studio-followup" role="status">
        <strong>{state.message}</strong>
        <ul>{state.questions.map((question, index) => <li key={index} dir="auto">{question}</li>)}</ul>
      </div> : null}
      {mode === 'voice' ? <StudioRecording businessId={businessId} onTranscript={text => {
        setDraft(text);
        setMode('text');
      }} /> : mode === 'text' ? <label>Describe your business
        <textarea name="text" dir="auto" minLength={10} maxLength={20000} required
          value={draft} onChange={event => setDraft(event.currentTarget.value)}
          placeholder="Services, hours, common questions and when the team should take over." />
      </label> : <label>Text-based PDF
        <input type="file" accept="application/pdf,.pdf" required={!pdf} onChange={event => {
          const next = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.setCustomValidity((next?.size ?? 0) > 700 * 1024 ? 'Choose a PDF under 700 KB.' : '');
          setPdf(next);
        }} />
        <small>{pdf ? pdf.name : 'Up to 700 KB. Use a PDF with selectable text.'}</small>
      </label>}
      {mode !== 'voice' && <>
        <p className="studio-source-note">Analysis sends the business text to the AI provider. Remove personal customer information and credentials before proceeding.</p>
        <button className="studio-button" disabled={pending}>{pending ? 'Analyzing source…' : 'Analyze and prepare draft'}</button>
      </>}
    </fieldset>
    {state.message && state.status !== 'questions' && <p role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
  </form>;
}

export function StudioPublishButton({ businessId, versionId }: { businessId: string; versionId: string }) {
  const [state, action, pending] = useActionState(() => publishStudioKnowledge(businessId, versionId), initial);
  return <form action={action}>
    <button className="studio-button studio-secondary" disabled={pending}>{pending ? 'Publishing…' : 'Publish reviewed version'}</button>
    {state.message && <p role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
  </form>;
}

export function StudioRevisionForm({ businessId, versionId, original }: { businessId: string; versionId: string; original: string }) {
  const [text, setText] = useState(original);
  const [state, action, pending] = useActionState(async (_previous: Awaited<ReturnType<typeof reviseStudioKnowledge>>, form: FormData) => {
    return reviseStudioKnowledge(businessId, versionId, form);
  }, initial);
  return <details className="studio-revision">
    <summary>Revise this draft</summary>
    <form className="studio-form" action={action}>
      <label>Profile text
        <textarea name="revision" value={text} onChange={event => setText(event.currentTarget.value)}
          dir="auto" minLength={10} maxLength={9000} required />
      </label>
      <button type="submit" className="studio-button studio-secondary" disabled={pending || text.trim() === original.trim()}>
        {pending ? 'Saving revision…' : 'Save revised draft'}
      </button>
      {state.message && <p role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
    </form>
  </details>;
}
