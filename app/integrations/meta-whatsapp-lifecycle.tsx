'use client';

import { useState } from 'react';

type BindingOption = {
  id: string;
  version: number;
  businessName: string;
  branchName: string | null;
  provider: string | null;
  configured: boolean;
  destinationLabel: string | null;
  lastErrorCode: string | null;
  lastVerifiedAt: string | null;
};

function lifecycleLabel(binding: BindingOption | undefined) {
  if (!binding?.configured || binding.provider !== 'META') return 'NOT_CONNECTED';
  if (binding.lastErrorCode === 'MANUAL_DISCONNECTED') return 'DISCONNECTED';
  if (
    binding.lastErrorCode === 'META_CREDENTIAL_INVALID_OR_REVOKED'
    || binding.lastErrorCode === 'META_PROVIDER_SUBSCRIPTION_MISSING'
  ) return 'RECONNECT_REQUIRED';
  if (binding.lastErrorCode === 'META_CREDENTIAL_HEALTH_UNCONFIRMED') return 'ACTION_REQUIRED';
  return binding.lastVerifiedAt ? 'VERIFIED' : 'CONNECTED_NOT_VERIFIED';
}

export function MetaWhatsAppLifecycle(props: { bindings: BindingOption[] }) {
  const eligible = props.bindings.filter((binding) => binding.configured && binding.provider === 'META');
  const [bindingId, setBindingId] = useState(eligible[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selected = eligible.find((binding) => binding.id === bindingId);
  const state = lifecycleLabel(selected);

  async function act(action: 'VERIFY_HEALTH' | 'DISCONNECT') {
    if (!selected || busy) return;
    if (
      action === 'DISCONNECT'
      && !window.confirm('Disconnect Smart Visions from this WhatsApp API binding? This does not delete or uninstall the customer’s WhatsApp Business mobile account.')
    ) return;

    setBusy(true);
    setMessage(action === 'VERIFY_HEALTH'
      ? 'Checking current Meta phone and webhook subscription evidence…'
      : 'Blocking Smart Visions provider actions first, then reconciling the Meta webhook subscription…');

    try {
      const response = await fetch('/api/integrations/meta/whatsapp/lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          bindingId: selected.id,
          expectedVersion: selected.version,
        }),
      });
      const body = await response.json() as {
        error?: string;
        message?: string;
        verified?: boolean;
        localDisconnected?: boolean;
        providerUnsubscribeConfirmed?: boolean;
        reconciliationRequired?: boolean;
        health?: string;
      };

      if (!response.ok) {
        setMessage(body.error || 'WhatsApp lifecycle action was not confirmed');
        if (body.health) window.setTimeout(() => window.location.reload(), 1000);
        return;
      }

      if (action === 'VERIFY_HEALTH' && body.verified) {
        setMessage('Meta phone membership and webhook subscription are verified. No test message was sent.');
        window.setTimeout(() => window.location.reload(), 800);
        return;
      }

      setMessage(body.message || (
        body.reconciliationRequired
          ? 'Smart Visions is disconnected, but Meta provider reconciliation still needs explicit review.'
          : 'WhatsApp API disconnected safely.'
      ));
      window.setTimeout(() => window.location.reload(), 1200);
    } catch {
      setMessage('The lifecycle request did not complete. No destructive WhatsApp mobile action was attempted.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel settingsCreate">
    <h2>WhatsApp connection lifecycle</h2>
    <p className="muted">Verify, reconnect, or disconnect the existing canonical binding. These actions never delete or uninstall the customer’s WhatsApp Business mobile account and never create a second WhatsApp connection record.</p>
    {eligible.length ? <>
      <label>Connected API destination
        <select value={bindingId} onChange={(event) => {
          setBindingId(event.target.value);
          setMessage('');
        }}>
          {eligible.map((binding) => <option key={binding.id} value={binding.id}>
            {binding.businessName}{binding.branchName ? ` · ${binding.branchName}` : ''}{binding.destinationLabel ? ` · ${binding.destinationLabel}` : ''}
          </option>)}
        </select>
      </label>
      {selected ? <div className="healthList compactHealth">
        <span>Lifecycle <strong>{state}</strong></span>
        <span>Binding <strong>v{selected.version}</strong></span>
        <span>Last verified <strong>{selected.lastVerifiedAt ? new Date(selected.lastVerifiedAt).toLocaleString() : 'Never'}</strong></span>
        <span>Incident <strong>{selected.lastErrorCode ?? 'None'}</strong></span>
      </div> : null}
      <div>
        <button
          type="button"
          disabled={busy || !selected || state === 'DISCONNECTED'}
          onClick={() => void act('VERIFY_HEALTH')}
        >
          {busy ? 'Working…' : 'Verify Meta health'}
        </button>
        <button
          type="button"
          disabled={busy || !selected || state === 'DISCONNECTED'}
          onClick={() => void act('DISCONNECT')}
        >
          Disconnect API safely
        </button>
      </div>
      {state === 'DISCONNECTED' || state === 'RECONNECT_REQUIRED' || state === 'ACTION_REQUIRED'
        ? <p className="muted smallText">Use “Reconnect the existing API number” in the Meta connection panel below. It rotates credentials on this same binding rather than manufacturing a new logical connection.</p>
        : null}
    </> : <p className="muted">No real Meta WhatsApp API binding exists yet. Lifecycle actions remain unavailable rather than creating synthetic Production state.</p>}
    {message ? <p role="status" className="muted smallText">{message}</p> : null}
  </section>;
}
