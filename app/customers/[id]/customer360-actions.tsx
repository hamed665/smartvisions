'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type EntityType = 'LEAD' | 'CONVERSATION' | 'TASK' | 'DEAL';
type Candidate = {
  entityType: EntityType;
  entityId: string;
  businessId?: string | null;
  label?: string | null;
};
type Linked = {
  entityType: EntityType;
  entityId: string;
  label: string;
};

export function Customer360Actions({
  organizationId,
  personId,
  canResolve,
  candidates,
  linked,
}: {
  organizationId: string;
  personId: string;
  canResolve: boolean;
  candidates: Candidate[];
  linked: Linked[];
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function mutate(input: {
    action: 'LINK' | 'UNLINK';
    entityType: EntityType;
    entityId: string;
    reason: string;
  }) {
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch('/api/crm/customer360', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          personId,
          ...input,
        }),
      });
      const body = await response.json() as { error?: string; action?: string; replayed?: boolean };
      if (!response.ok) throw new Error(body.error || 'Customer 360 mutation failed');
      setMessage(`${body.action || input.action} ${body.replayed ? 'already applied' : 'applied'}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Customer 360 mutation failed');
    } finally {
      setWorking(false);
    }
  }

  if (!canResolve) {
    return <p className="muted smallText">Read-only. OWNER, ADMIN or SALES_MANAGER is required to confirm or correct Person attribution.</p>;
  }

  return <div className="settingsList">
    {candidates.length ? candidates.map((candidate) => <form
      className="settingsRow"
      key={`candidate-${candidate.entityType}-${candidate.entityId}`}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void mutate({
          action: 'LINK',
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          reason: String(form.get('reason') || ''),
        });
      }}
    >
      <div>
        <strong>Link {candidate.entityType}: {candidate.label || candidate.entityId}</strong>
        <span className="muted smallText">{candidate.entityId}</span>
        {candidate.businessId ? <span className="muted smallText">Company {candidate.businessId}</span> : null}
      </div>
      <label className="wideField">Confirmation reason<input name="reason" required maxLength={500} /></label>
      <button disabled={working}>Confirm link</button>
    </form>) : <p className="muted">No relationship-derived unlinked candidates.</p>}

    {linked.length ? linked.map((item) => <form
      className="settingsRow"
      key={`linked-${item.entityType}-${item.entityId}`}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void mutate({
          action: 'UNLINK',
          entityType: item.entityType,
          entityId: item.entityId,
          reason: String(form.get('reason') || ''),
        });
      }}
    >
      <div>
        <strong>Correct {item.entityType}: {item.label}</strong>
        <span className="muted smallText">{item.entityId}</span>
      </div>
      <label className="wideField">Correction reason<input name="reason" required maxLength={500} /></label>
      <button className="rejectButton" disabled={working}>Unlink</button>
    </form>) : null}

    {message ? <p className="muted smallText" role="status">{message}</p> : null}
  </div>;
}
