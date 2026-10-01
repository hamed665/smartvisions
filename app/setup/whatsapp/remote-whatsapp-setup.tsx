'use client';

import { useEffect, useRef, useState } from 'react';

type SetupContext = {
  attemptId: string;
  attemptVersion: number;
  bindingId: string;
  bindingVersion: number;
  connectionMode: 'BUSINESS_APP_COEXISTENCE' | 'API_NEW_NUMBER' | 'EXISTING_API_RECONNECT';
  purpose: 'CONNECT' | 'RECONNECT';
  businessName: string;
  branchName: string | null;
  destinationLabel: string | null;
  sessionExpiresAt: string;
  capability: 'WHATSAPP_SETUP';
};

export function RemoteWhatsAppSetup() {
  const initialized = useRef(false);
  const [context, setContext] = useState<SetupContext | null>(null);
  const [state, setState] = useState<'VERIFYING' | 'READY' | 'ERROR'>('VERIFYING');
  const [message, setMessage] = useState('Checking your secure WhatsApp setup link…');

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    void (async () => {
      try {
        const fragment = window.location.hash.startsWith('#')
          ? window.location.hash.slice(1).trim()
          : '';

        if (fragment) {
          window.history.replaceState(null, '', window.location.pathname);
          const redeem = await fetch('/setup/whatsapp/api/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: fragment }),
            cache: 'no-store',
          });
          const redeemed = await redeem.json() as { error?: string };
          if (!redeem.ok) throw new Error(redeemed.error || 'This setup link is unavailable');
        }

        const response = await fetch('/setup/whatsapp/api/context', { cache: 'no-store' });
        const body = await response.json() as SetupContext & { error?: string };
        if (!response.ok || !body.attemptId) {
          throw new Error(body.error || 'No active WhatsApp setup session');
        }

        setContext(body);
        setState('READY');
        setMessage('Secure setup access confirmed. This session can only be used for the WhatsApp connection shown here.');
      } catch (error) {
        setState('ERROR');
        setMessage(error instanceof Error ? error.message : 'This WhatsApp setup link is invalid or expired.');
      }
    })();
  }, []);

  return <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }}>
    <section className="panel settingsCreate">
      <h1>WhatsApp Business setup</h1>
      <p className="muted">This link grants setup access only. It does not provide Smart Visions account, CRM, billing, organization settings, or access to any other business.</p>
      <p className="muted"><strong>Your existing WhatsApp Business app is never deleted or destructively migrated by this setup.</strong></p>

      {context ? <div className="settingsList">
        <div className="settingsRow">
          <div>
            <strong>{context.businessName}</strong>
            <span className="muted smallText">{context.branchName ?? 'Business-wide'} · {context.purpose}</span>
            {context.destinationLabel ? <span className="muted smallText">Current destination: {context.destinationLabel}</span> : null}
          </div>
          <div>
            <span className="muted smallText">Capability: {context.capability}</span>
            <span className="muted smallText">Session expires: {new Date(context.sessionExpiresAt).toLocaleString()}</span>
          </div>
        </div>
      </div> : null}

      {context?.connectionMode === 'BUSINESS_APP_COEXISTENCE'
        ? <p className="muted smallText">Same-number setup will use official WhatsApp Business App Coexistence only. Delete Account, uninstall, and destructive migration are not allowed.</p>
        : null}
      {context?.connectionMode === 'API_NEW_NUMBER'
        ? <p className="muted smallText">This path is for a separate API number. If a later Meta screen asks to delete an existing WhatsApp account, the flow must be cancelled instead.</p>
        : null}
      {context?.connectionMode === 'EXISTING_API_RECONNECT'
        ? <p className="muted smallText">This session is scoped to reconnect the existing Meta API destination on this binding.</p>
        : null}

      {state === 'READY'
        ? <p className="muted smallText">Secure access is ready. The guided Meta authorization wizard is the next onboarding step and will reuse this exact session rather than creating another identity or connection.</p>
        : null}
      <p role="status" className="muted smallText">{message}</p>
    </section>
  </main>;
}
