'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

type BindingOption = {
  id: string;
  version: number;
  tenantBusinessId: string;
  businessName: string;
  branchName: string | null;
  destinationLabel: string | null;
};

type SessionInfo = { wabaId: string; phoneNumberId: string };

declare global {
  interface Window {
    FB?: {
      init(input: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;
      login(callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>): void;
    };
  }
}

export function MetaWhatsAppEmbeddedSignup(props: {
  appId: string | null;
  configurationId: string | null;
  graphVersion: string;
  bindings: BindingOption[];
}) {
  const [bindingId, setBindingId] = useState(props.bindings[0]?.id ?? '');
  const [sdkReady, setSdkReady] = useState(false);
  const [state, setState] = useState<'IDLE' | 'WAITING' | 'SAVING' | 'DONE' | 'ERROR'>('IDLE');
  const [message, setMessage] = useState('');
  const codeRef = useRef<string | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  const savingRef = useRef(false);

  const selected = props.bindings.find((item) => item.id === bindingId);

  async function finishIfReady() {
    if (savingRef.current || !codeRef.current || !sessionRef.current || !selected) return;
    savingRef.current = true;
    setState('SAVING');
    setMessage('Verifying selected Meta assets and storing the credential securely…');
    try {
      const response = await fetch('/api/integrations/meta/whatsapp/embedded-signup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bindingId: selected.id,
          expectedVersion: selected.version,
          code: codeRef.current,
          wabaId: sessionRef.current.wabaId,
          phoneNumberId: sessionRef.current.phoneNumberId,
        }),
      });
      const body = await response.json() as { error?: string; displayPhoneNumber?: string | null };
      if (!response.ok) throw new Error(body.error || 'Unable to complete Meta connection');
      setState('DONE');
      setMessage(`Connected securely${body.displayPhoneNumber ? ` · ${body.displayPhoneNumber}` : ''}. Refreshing…`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      savingRef.current = false;
      codeRef.current = null;
      sessionRef.current = null;
      setState('ERROR');
      setMessage(error instanceof Error ? error.message : 'Unable to complete Meta connection');
    }
  }

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (!/^https:\/\/(www\.)?facebook\.com$/.test(event.origin)) return;
      let payload: unknown = event.data;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      if (!payload || typeof payload !== 'object') return;
      const root = payload as Record<string, unknown>;
      if (root.type !== 'WA_EMBEDDED_SIGNUP') return;
      const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : {};
      const wabaId = typeof data.waba_id === 'string' ? data.waba_id.trim() : '';
      const phoneNumberId = typeof data.phone_number_id === 'string' ? data.phone_number_id.trim() : '';
      if (wabaId && phoneNumberId) {
        sessionRef.current = { wabaId, phoneNumberId };
        void finishIfReady();
      }
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  });

  const configured = Boolean(props.appId && props.configurationId);

  function launch() {
    if (!configured || !sdkReady || !window.FB || !selected || state === 'WAITING' || state === 'SAVING') return;
    codeRef.current = null;
    sessionRef.current = null;
    savingRef.current = false;
    setState('WAITING');
    setMessage('Complete the Meta-hosted signup window. Smart Visions never asks for your Meta password or a copied token.');

    window.FB.login((response) => {
      const code = response.authResponse?.code?.trim();
      if (!code) {
        setState('ERROR');
        setMessage('Meta signup was cancelled or returned no authorization code.');
        return;
      }
      codeRef.current = code;
      void finishIfReady();
    }, {
      config_id: props.configurationId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
    });
  }

  return <section className="panel settingsCreate">
    <Script
      src="https://connect.facebook.net/en_US/sdk.js"
      strategy="afterInteractive"
      onLoad={() => {
        if (!props.appId || !window.FB) return;
        window.FB.init({ appId: props.appId, cookie: true, xfbml: false, version: props.graphVersion });
        setSdkReady(true);
      }}
    />
    <h2>Connect WhatsApp Business</h2>
    <p className="muted">Use Meta Embedded Signup. Authorization happens on Meta; the returned access token is exchanged server-side and stored in Supabase Vault, never in this page.</p>
    {props.bindings.length ? <>
      <label>Business destination
        <select value={bindingId} onChange={(event) => { setBindingId(event.target.value); setState('IDLE'); setMessage(''); }}>
          {props.bindings.map((binding) => <option key={binding.id} value={binding.id}>
            {binding.businessName}{binding.branchName ? ` · ${binding.branchName}` : ''}{binding.destinationLabel ? ` · ${binding.destinationLabel}` : ''}
          </option>)}
        </select>
      </label>
      <button type="button" onClick={launch} disabled={!configured || !sdkReady || !selected || state === 'WAITING' || state === 'SAVING'}>
        {state === 'WAITING' || state === 'SAVING' ? 'Connecting…' : 'Connect with Meta'}
      </button>
    </> : <p className="muted">Create an active tenant Business and its WhatsApp communication binding before connecting Meta assets.</p>}
    {!configured ? <p className="muted">Embedded Signup is code-ready but blocked until the Meta App ID and Embedded Signup Configuration ID are configured for this environment.</p> : null}
    {message ? <p role="status" className="muted smallText">{message}</p> : null}
  </section>;
}
