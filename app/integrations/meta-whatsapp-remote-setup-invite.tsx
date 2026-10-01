'use client';

import { useState } from 'react';

type BindingOption = {
  id: string;
  version: number;
  businessName: string;
  branchName: string | null;
  destinationLabel: string | null;
};

type ConnectionMode =
  | 'BUSINESS_APP_COEXISTENCE'
  | 'API_NEW_NUMBER'
  | 'EXISTING_API_RECONNECT';

type InviteResult = {
  attemptId: string;
  attemptVersion: number;
  bindingId: string;
  setupPath: string;
  expiresAt: string;
  error?: string;
};

function defaultMode(binding: BindingOption | undefined): ConnectionMode {
  return binding?.destinationLabel ? 'EXISTING_API_RECONNECT' : 'BUSINESS_APP_COEXISTENCE';
}

export function MetaWhatsAppRemoteSetupInvite(props: {
  configured: boolean;
  bindings: BindingOption[];
}) {
  const [bindingId, setBindingId] = useState(props.bindings[0]?.id ?? '');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(defaultMode(props.bindings[0]));
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selected = props.bindings.find((row) => row.id === bindingId);

  function resetInvite() {
    setInvite(null);
  }

  async function issue() {
    if (!selected || busy) return;
    setBusy(true);
    resetInvite();
    setMessage('Creating a short-lived WhatsApp setup link…');

    try {
      const response = await fetch('/api/integrations/meta/whatsapp/remote-setup/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bindingId: selected.id,
          expectedVersion: selected.version,
          connectionMode,
        }),
      });
      const body = await response.json() as InviteResult;
      if (!response.ok || !body.setupPath || !body.attemptId || !body.attemptVersion) {
        throw new Error(body.error || 'Unable to create remote setup link');
      }
      setInvite({ ...body, setupPath: `${window.location.origin}${body.setupPath}` });
      setMessage('Secure setup link created. Share it only with the person authorized to connect this WhatsApp business in Meta.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create remote setup link');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!invite || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/integrations/meta/whatsapp/remote-setup/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: invite.attemptId,
          attemptVersion: invite.attemptVersion,
          bindingId: invite.bindingId,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to revoke setup link');
      resetInvite();
      setMessage('Remote setup access revoked. The customer’s WhatsApp account and phone app were not changed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to revoke setup link');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!invite?.setupPath) return;
    try {
      await navigator.clipboard.writeText(invite.setupPath);
      setMessage('Setup link copied. It is one-time, short-lived, and grants WHATSAPP_SETUP only.');
    } catch {
      setMessage('Copy failed. Select the link manually and copy it.');
    }
  }

  return <section className="panel settingsCreate">
    <h2>Remote WhatsApp setup</h2>
    <p className="muted">Create a one-time setup-only link for the person who controls the customer’s Meta business. They do not become a Smart Visions user and receive no CRM, billing, organization settings, or other integration access.</p>
    <p className="muted"><strong>The customer’s current WhatsApp Business app is never deleted or destructively migrated.</strong></p>

    {props.bindings.length ? <>
      <label>Business destination
        <select value={bindingId} onChange={(event) => {
          const nextId = event.target.value;
          const next = props.bindings.find((row) => row.id === nextId);
          setBindingId(nextId);
          setConnectionMode(defaultMode(next));
          resetInvite();
          setMessage('');
        }}>
          {props.bindings.map((binding) => <option key={binding.id} value={binding.id}>
            {binding.businessName}{binding.branchName ? ` · ${binding.branchName}` : ''}{binding.destinationLabel ? ` · ${binding.destinationLabel}` : ''}
          </option>)}
        </select>
      </label>

      <label>Connection path
        <select value={connectionMode} onChange={(event) => {
          setConnectionMode(event.target.value as ConnectionMode);
          resetInvite();
          setMessage('');
        }}>
          <option value="BUSINESS_APP_COEXISTENCE">Keep the current WhatsApp Business app + API Coexistence</option>
          <option value="API_NEW_NUMBER">Use a separate API number</option>
          {selected?.destinationLabel ? <option value="EXISTING_API_RECONNECT">Reconnect the existing API number</option> : null}
        </select>
      </label>

      {connectionMode === 'BUSINESS_APP_COEXISTENCE'
        ? <p className="muted smallText">This link may establish setup access, but same-number Meta activation remains fail-closed until official Coexistence is provider-verified. There is no Delete Account fallback.</p>
        : null}

      <button type="button" onClick={() => void issue()} disabled={busy || !selected || !props.configured}>
        {busy ? 'Preparing…' : 'Create secure setup link'}
      </button>

      {!props.configured
        ? <p className="muted smallText">Meta provider configuration is not ready for customer setup links in this environment.</p>
        : null}

      {invite ? <div className="settingsRow">
        <label>One-time setup link
          <input value={invite.setupPath} readOnly />
          <span className="muted smallText">Expires {new Date(invite.expiresAt).toLocaleString()}.</span>
        </label>
        <div>
          <button type="button" onClick={() => void copy()}>Copy link</button>
          <button type="button" onClick={() => void revoke()} disabled={busy}>Revoke</button>
        </div>
      </div> : null}
    </> : <p className="muted">Create an active tenant Business and its WhatsApp communication binding before creating a setup link.</p>}

    {message ? <p role="status" className="muted smallText">{message}</p> : null}
  </section>;
}
