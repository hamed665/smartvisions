'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RegisteredWhatsAppImport(props: { businessId: string; displayPhoneNumber: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function connect() {
    setBusy(true);
    setMessage('Verifying the registered number with Meta…');
    try {
      const response = await fetch('/api/customer/connections/whatsapp/vault-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: props.businessId }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || 'Connection could not be confirmed.');
      setMessage('Registered number connected. Inbox and AI readiness still need verification.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection could not be confirmed.');
    } finally { setBusy(false); }
  }
  return <section className="panel settingsCreate">
    <h2>Connect a registered API number</h2>
    <p className="muted">{props.displayPhoneNumber} is prepared for this Business. Verify and connect it without registering the number again.</p>
    <button type="button" disabled={busy} onClick={() => void connect()}>{busy ? 'Connecting…' : 'Connect registered number'}</button>
    <p role="status" aria-live="polite" className="muted">{message}</p>
  </section>;
}
