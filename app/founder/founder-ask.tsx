'use client';

import { FormEvent, useMemo, useState } from 'react';

import type { FounderIntelligenceResult } from '@/lib/founder/intelligence-core';

type Message =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; result: FounderIntelligenceResult };

export function FounderAskPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const history = useMemo(
    () => messages.slice(-6).map((message) => ({ role: message.role, text: message.text })),
    [messages],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || busy) return;

    setBusy(true);
    setError('');
    setQuestion('');
    setMessages((current) => [...current, { role: 'user', text: nextQuestion }]);

    try {
      const response = await fetch('/api/founder/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: nextQuestion, history }),
      });
      const payload = await response.json() as {
        result?: FounderIntelligenceResult;
        error?: string;
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || 'Founder intelligence is unavailable');
      }
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: payload.result!.answer, result: payload.result! },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Founder intelligence is unavailable');
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel">
    <div className="headerRow">
      <div>
        <h2>Ask Founder Copilot</h2>
        <p className="muted">
          Evidence-first, read-only analysis. External market and investor facts are treated as missing
          until a governed research source is connected.
        </p>
      </div>
      <span className="status">READ ONLY</span>
    </div>

    {messages.length ? <div className="settingsList">
      {messages.map((message, index) => message.role === 'user'
        ? <div className="settingsRow" key={index}>
            <div><strong>You</strong><span className="muted smallText">{message.text}</span></div>
          </div>
        : <div className="settingsRow" key={index}>
            <div>
              <strong>Founder Copilot · {message.result.confidence}</strong>
              <span className="smallText">{message.text}</span>
              {message.result.facts.length
                ? <span className="muted smallText">
                    Facts: {message.result.facts.map((fact) => `${fact.text} [${fact.authority}]`).join(' · ')}
                  </span>
                : null}
              <span className="muted smallText">Next: {message.result.nextAction}</span>
              <span className="muted smallText">KPI: {message.result.kpi}</span>
              {message.result.gaps.length
                ? <span className="muted smallText">Gaps: {message.result.gaps.join(' · ')}</span>
                : null}
              {message.result.risks.length
                ? <span className="muted smallText">Risks: {message.result.risks.join(' · ')}</span>
                : null}
              <span className="muted smallText">
                Evidence: {message.result.evidenceAuthorities.join(', ') || 'No verified authority cited'}
              </span>
            </div>
          </div>
      )}
    </div> : <p className="muted smallText">
      Ask questions such as “الان مهم‌ترین کار چیست؟”, “وضعیت فروش چطور است؟” or
      “برای تصمیم سرمایه‌گذاری چه شواهدی کم داریم؟”.
    </p>}

    <form onSubmit={submit} className="settingsGrid">
      <label className="wideField">
        Founder question
        <textarea
          rows={3}
          maxLength={4_000}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about status, priorities, risks, pricing evidence, or investor readiness…"
          disabled={busy}
        />
      </label>
      <button disabled={busy || !question.trim()}>{busy ? 'Analyzing…' : 'Ask'}</button>
    </form>
    {error ? <p className="muted smallText">{error}</p> : null}
  </section>;
}
