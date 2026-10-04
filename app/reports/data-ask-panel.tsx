'use client';

import { FormEvent, useState } from 'react';

type MetricResult = {
  metricKey: string;
  label: string;
  definitionVersion: number;
  unit: string;
  value: number | null;
  valuesByUnit: Record<string, number>;
  available: boolean;
  reason: string | null;
  source: 'WAREHOUSE';
};

type AnswerResult = {
  mode: 'ANSWER';
  answer: string;
  window: { days: number; startAt: string; endAt: string };
  scope: { level: string; label: string };
  metrics: MetricResult[];
  freshness: {
    warehouseLagSeconds: number | null;
    historyTruncated: boolean;
  };
  evidence: {
    registry: string;
    warehouse: string;
    arbitrarySql: false;
    causalClaim: false;
  };
  plannerReason: string;
};

type NonAnswerResult = {
  mode: 'CLARIFY' | 'UNSUPPORTED';
  reason: string;
  window: { days: number; startAt: string; endAt: string };
  scope: { level: string; label: string };
  availableMetricKeys: string[];
};

type Payload = {
  result?: AnswerResult | NonAnswerResult;
  error?: string;
};

function metricValue(metric: MetricResult) {
  if (!metric.available) return 'Unavailable';
  const values = Object.entries(metric.valuesByUnit);
  if (values.length) {
    return values
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([unit, value]) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value) + ' ' + unit)
      .join(' · ');
  }
  if (metric.value == null) return '—';
  const value = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(metric.value);
  return metric.unit === 'PERCENT' ? value + '%' : metric.unit === 'COUNT' ? value : value + ' ' + metric.unit;
}

export function DataAskPanel({
  defaultDays,
  businessId,
  branchId,
  scopeLabel,
}: {
  defaultDays: number;
  businessId: string | null;
  branchId: string | null;
  scopeLabel: string;
}) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AnswerResult | NonAnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/data/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          days: defaultDays,
          businessId,
          branchId,
        }),
      });
      const payload = await response.json() as Payload;
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || 'Ask Your Data is unavailable');
      }
      setResult(payload.result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ask Your Data is unavailable');
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel">
    <div className="headerRow">
      <div>
        <h2>Ask Your Data</h2>
        <p className="muted">
          Ask in natural language. AI may select only governed metric keys. It never receives warehouse values
          and cannot generate SQL; the server resolves values from the Metrics Registry + Analytics Warehouse.
        </p>
      </div>
      <span className="status">READ ONLY · {scopeLabel}</span>
    </div>

    <form onSubmit={submit} className="settingsGrid">
      <label className="wideField">
        Question
        <textarea
          rows={3}
          maxLength={4_000}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="مثلاً در ۳۰ روز اخیر چند پیام واتس‌اپ ارسال شده و هزینه AI چقدر بوده؟"
          disabled={busy}
        />
      </label>
      <button disabled={busy || !question.trim()}>{busy ? 'Resolving…' : 'Ask data'}</button>
    </form>

    {result?.mode === 'ANSWER' ? <div className="settingsList">
      <div className="settingsRow">
        <div>
          <strong>Governed answer · {result.window.days}d · {result.scope.label}</strong>
          <span className="smallText">{result.answer}</span>
          <span className="muted smallText">
            Registry {result.evidence.registry} · Warehouse {result.evidence.warehouse} · arbitrary SQL NO · causal claim NO
          </span>
        </div>
      </div>
      {result.metrics.map((metric) => <div className="settingsRow" key={metric.metricKey}>
        <div>
          <strong>{metric.label}</strong>
          <span className="smallText">{metricValue(metric)}</span>
          <span className="muted smallText">
            {metric.metricKey} · definition v{metric.definitionVersion} · {metric.source}
            {metric.reason ? ' · ' + metric.reason : ''}
          </span>
        </div>
      </div>)}
      <div className="settingsRow">
        <div>
          <strong>Freshness</strong>
          <span className="muted smallText">
            Warehouse lag {result.freshness.warehouseLagSeconds == null ? '—' : result.freshness.warehouseLagSeconds + 's'}
            {result.freshness.historyTruncated ? ' · history cap reached' : ' · within history bound'}
          </span>
        </div>
      </div>
    </div> : null}

    {result && result.mode !== 'ANSWER' ? <div className="settingsList">
      <div className="settingsRow">
        <div>
          <strong>{result.mode === 'UNSUPPORTED' ? 'Unsupported by current metrics' : 'Clarification required'}</strong>
          <span className="smallText">{result.reason}</span>
          <span className="muted smallText">
            No SQL fallback and no guessed metric was used.
          </span>
        </div>
      </div>
    </div> : null}

    {error ? <p className="muted smallText">⛔ {error}</p> : null}
  </section>;
}
