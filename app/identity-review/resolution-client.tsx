'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type Person = {
  id: string;
  display_name: string | null;
  status: string;
};

export function IdentityResolutionClient({
  organizationId,
  identityId,
  people,
  canResolve,
  personConflict,
}: {
  organizationId: string;
  identityId: string;
  people: Person[];
  canResolve: boolean;
  personConflict: boolean;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const activePeople = useMemo(() => people.filter((person) => person.status === 'ACTIVE'), [people]);

  async function submit(payload: Record<string, unknown>) {
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch('/api/crm/identity-graph', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          reason: payload.reason,
          evidence: {
            source: 'identity-review-ui',
            identityId,
          },
          ...payload,
        }),
      });
      const body = await response.json() as { error?: string; action?: string; replayed?: boolean };
      if (!response.ok) throw new Error(body.error || 'Identity resolution failed');
      setMessage(`${body.action || 'Resolution'} ${body.replayed ? 'already applied' : 'applied'}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Identity resolution failed');
    } finally {
      setWorking(false);
    }
  }

  if (!canResolve) {
    return <p className="muted smallText">Read-only. OWNER, ADMIN or SALES_MANAGER is required for identity resolution.</p>;
  }

  return <div className="settingsList">
    {personConflict && activePeople.length > 1 ? <form
      className="settingsRow"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void submit({
          action: 'MERGE',
          sourcePersonId: form.get('sourcePersonId'),
          targetPersonId: form.get('targetPersonId'),
          reason: form.get('reason'),
        });
      }}
    >
      <label>Merge source
        <select name="sourcePersonId" required defaultValue={activePeople[0]?.id}>
          {activePeople.map((person) => <option key={person.id} value={person.id}>{person.display_name || person.id}</option>)}
        </select>
      </label>
      <label>Keep target
        <select name="targetPersonId" required defaultValue={activePeople[1]?.id}>
          {activePeople.map((person) => <option key={person.id} value={person.id}>{person.display_name || person.id}</option>)}
        </select>
      </label>
      <label className="wideField">Reason<input name="reason" required maxLength={500} /></label>
      <button disabled={working}>Merge</button>
    </form> : null}

    {activePeople.length ? <form
      className="settingsRow"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void submit({
          action: 'SPLIT',
          sourcePersonId: form.get('sourcePersonId'),
          identityId,
          newPersonId: crypto.randomUUID(),
          displayName: form.get('displayName'),
          reason: form.get('reason'),
        });
      }}
    >
      <label>Split identity from
        <select name="sourcePersonId" required>
          {activePeople.map((person) => <option key={person.id} value={person.id}>{person.display_name || person.id}</option>)}
        </select>
      </label>
      <label>New display name<input name="displayName" maxLength={200} /></label>
      <label className="wideField">Reason<input name="reason" required maxLength={500} /></label>
      <button disabled={working}>Split</button>
    </form> : null}

    {activePeople.length ? <form
      className="settingsRow"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void submit({
          action: 'UNLINK',
          personId: form.get('personId'),
          identityId,
          reason: form.get('reason'),
        });
      }}
    >
      <label>Unlink from
        <select name="personId" required>
          {activePeople.map((person) => <option key={person.id} value={person.id}>{person.display_name || person.id}</option>)}
        </select>
      </label>
      <label className="wideField">Reason<input name="reason" required maxLength={500} /></label>
      <button disabled={working}>Unlink</button>
    </form> : null}

    {message ? <p className="muted smallText" role="status">{message}</p> : null}
  </div>;
}
