'use client';

import { FormEvent, useState } from 'react';

type BusinessOption = {
  id: string;
  name: string;
};

type InviteResult = {
  inviteUrl: string;
  email: string;
  role: string;
  expiresAt: string;
};

export default function CustomerInviteForm({
  businesses,
}: {
  businesses: BusinessOption[];
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function issueInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const role = String(form.get('role') ?? '').trim();
    const tenantBusinessId = String(form.get('tenant_business_id') ?? '').trim();

    setSubmitting(true);
    setError('');
    setResult(null);
    setCopied(false);

    try {
      const response = await fetch('/api/access/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ email, role, tenantBusinessId }),
      });
      const payload = await response.json().catch(() => null) as
        | (InviteResult & { error?: string })
        | null;

      if (!response.ok || !payload?.inviteUrl) {
        throw new Error(payload?.error || 'Unable to issue the customer invitation.');
      }

      setResult({
        inviteUrl: payload.inviteUrl,
        email: payload.email,
        role: payload.role,
        expiresAt: payload.expiresAt,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to issue the customer invitation.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInvite() {
    if (!result?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <form className="settingsGrid" onSubmit={issueInvite}>
        <label>
          Business
          <select name="tenant_business_id" defaultValue={businesses[0]?.id} required>
            {businesses.map((business) => (
              <option key={business.id} value={business.id}>
                {business.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Customer email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Business role
          <select name="role" defaultValue="ADMIN" required>
            <option value="ADMIN">Admin</option>
            <option value="SALES_MANAGER">Sales manager</option>
            <option value="SALES_AGENT">Sales agent</option>
            <option value="VIEWER">Viewer</option>
          </select>
        </label>
        <button disabled={submitting}>
          {submitting ? 'Issuing…' : 'Issue one-time invite'}
        </button>
      </form>

      {error ? <p className="muted smallText">{error}</p> : null}

      {result ? (
        <div className="settingsList">
          <div className="settingsRow">
            <strong>Invitation ready · {result.email}</strong>
            <span>{result.role} · expires {new Date(result.expiresAt).toLocaleString()}</span>
          </div>
          <label>
            One-time invitation URL
            <input value={result.inviteUrl} readOnly spellCheck={false} />
          </label>
          <button type="button" onClick={copyInvite}>
            {copied ? 'Copied' : 'Copy invitation URL'}
          </button>
          <p className="muted smallText">
            Send this URL to the intended customer. Smart Visions stores only its hash; issuing a
            replacement invitation produces a different secret.
          </p>
        </div>
      ) : null}
    </>
  );
}
