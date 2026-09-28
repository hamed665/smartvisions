'use client';

import { useMemo, useState } from 'react';

const EXAMPLE = JSON.stringify([
  {
    clientRowKey: 'row-001',
    businessId: '00000000-0000-0000-0000-000000000000',
    identityType: 'EMAIL',
    identityValue: 'contact@example.com',
    displayName: 'Example Contact',
    relationshipType: 'CONTACT',
    jobTitle: 'Operations',
  },
], null, 2);

type PreviewRow = {
  clientRowKey: string;
  businessName?: string | null;
  identityType: string;
  normalizedValue: string;
  status: string;
};

export function DataQualityImport({
  organizationId,
  canApply,
}: {
  organizationId: string;
  canApply: boolean;
}) {
  const [raw, setRaw] = useState(EXAMPLE);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [requestKey, setRequestKey] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const hasBlocked = useMemo(
    () => preview.some(row => row.status.startsWith('BLOCKED_')),
    [preview],
  );

  function parseRows() {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('Import payload must be a JSON array');
    return value as Record<string, unknown>[];
  }

  async function send(action: 'PREVIEW_IMPORT' | 'APPLY_IMPORT') {
    setWorking(true);
    setMessage(null);
    try {
      const rows = parseRows();
      const response = await fetch('/api/crm/data-quality', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          action,
          rows,
          requestKey: action === 'APPLY_IMPORT'
            ? requestKey
            : undefined,
        }),
      });
      const body = await response.json() as {
        error?: string;
        preview?: PreviewRow[];
        result?: {
          batchId: string;
          importedRows: number;
          createdPeople: number;
          linkedRelationships: number;
          replayed: boolean;
        };
      };
      if (!response.ok) throw new Error(body.error || 'Verified import failed');
      setPreview(body.preview ?? []);
      if (body.result) {
        setMessage(
          `Batch ${body.result.batchId}: ${body.result.importedRows} rows, ${body.result.createdPeople} new People, ${body.result.linkedRelationships} relationships${body.result.replayed ? ' (replay)' : ''}.`,
        );
      } else {
        setMessage('Preview complete. Nothing has been written.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Verified import failed');
    } finally {
      setWorking(false);
    }
  }

  return <section className="panel">
    <h2>Verified Contact import</h2>
    <p className="muted">1–100 rows. Preview is read-only. Apply is atomic and idempotent. Every row must point to an existing Account and a verified EMAIL/PHONE/WHATSAPP/INSTAGRAM identity. Raw imported PII is not copied into import receipts or audit summaries.</p>

    <label className="wideField">
      JSON rows
      <textarea
        value={raw}
        onChange={event => {
          setRaw(event.target.value);
          setPreview([]);
        }}
        rows={14}
        spellCheck={false}
      />
    </label>

    <div className="headerRow">
      <button type="button" disabled={working} onClick={() => void send('PREVIEW_IMPORT')}>Preview import</button>
      {canApply ? <div>
        <label>Request key<input value={requestKey} onChange={event => setRequestKey(event.target.value)} maxLength={200} placeholder="contacts-2026-09-28-batch-01" /></label>
        <button
          type="button"
          disabled={working || preview.length === 0 || hasBlocked || !requestKey.trim()}
          onClick={() => void send('APPLY_IMPORT')}
        >
          Apply verified import
        </button>
      </div> : <span className="muted">Apply requires OWNER, ADMIN or SALES_MANAGER.</span>}
    </div>

    {preview.length ? <div className="settingsList">
      {preview.map(row => <article className="settingsRow" key={row.clientRowKey}>
        <div>
          <strong>{row.clientRowKey} · {row.status}</strong>
          <span className="muted smallText">{row.businessName || 'Unknown Account'} · {row.identityType} · {row.normalizedValue}</span>
        </div>
      </article>)}
    </div> : null}

    {message ? <p className="muted" role="status">{message}</p> : null}
  </section>;
}
