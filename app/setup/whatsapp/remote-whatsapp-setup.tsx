'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';

type ConnectionMode =
  | 'BUSINESS_APP_COEXISTENCE'
  | 'API_NEW_NUMBER'
  | 'EXISTING_API_RECONNECT';

type SetupContext = {
  attemptId: string;
  attemptVersion: number;
  attemptStatus: 'AUTHORIZED' | 'COMPLETED';
  bindingId: string;
  bindingVersion: number;
  currentBindingVersion: number;
  connectionMode: ConnectionMode;
  purpose: 'CONNECT' | 'RECONNECT';
  businessName: string;
  branchName: string | null;
  destinationLabel: string | null;
  sessionExpiresAt: string;
  capability: 'WHATSAPP_SETUP';
};

type Preflight = {
  attemptStatus: 'AUTHORIZED' | 'COMPLETED';
  connectionMode: ConnectionMode;
  purpose: 'CONNECT' | 'RECONNECT';
  providerConfigured: boolean;
  canLaunchMeta: boolean;
  canResume: boolean;
  completed: boolean;
  setupLaterAvailable: boolean;
  sessionExpiresAt: string;
  appId: string | null;
  configurationId: string | null;
  graphVersion: string;
  blockers: Array<{ code: string; message: string }>;
};

type MetaSelection = { wabaId: string; phoneNumberId: string };

type WizardState =
  | 'VERIFYING'
  | 'READY'
  | 'WAITING_META'
  | 'VERIFYING_META'
  | 'PROVISIONING'
  | 'REGISTRATION_REQUIRED'
  | 'PROVISIONING_ERROR'
  | 'DONE'
  | 'BLOCKED'
  | 'PAUSED'
  | 'ERROR';

declare global {
  interface Window {
    FB?: {
      init(input: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;
      login(
        callback: (response: { authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>,
      ): void;
    };
  }
}

function modeMessage(mode: ConnectionMode) {
  if (mode === 'BUSINESS_APP_COEXISTENCE') {
    return 'Your current WhatsApp Business app stays on the phone. Same-number activation will only use official Coexistence after that provider path is verified.';
  }
  if (mode === 'API_NEW_NUMBER') {
    return 'This setup is for a separate API number. If Meta asks you to delete an existing WhatsApp account, cancel the Meta flow instead.';
  }
  return 'This setup reconnects the existing Meta API destination already assigned to this business.';
}

export function RemoteWhatsAppSetup() {
  const initialized = useRef(false);
  const contextRef = useRef<SetupContext | null>(null);
  const preflightRef = useRef<Preflight | null>(null);
  const codeRef = useRef<string | null>(null);
  const selectionRef = useRef<MetaSelection | null>(null);
  const savingRef = useRef(false);

  const [context, setContext] = useState<SetupContext | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [state, setState] = useState<WizardState>('VERIFYING');
  const [message, setMessage] = useState('Checking your secure WhatsApp setup link…');
  const [errorMessage, setErrorMessage] = useState('');
  const [registrationPin, setRegistrationPin] = useState('');

  const loadStatus = useCallback(async () => {
    const [contextResponse, preflightResponse] = await Promise.all([
      fetch('/setup/whatsapp/api/context', { cache: 'no-store' }),
      fetch('/setup/whatsapp/api/preflight', { cache: 'no-store' }),
    ]);

    const contextBody = await contextResponse.json() as SetupContext & { error?: string };
    const preflightBody = await preflightResponse.json() as Preflight & { error?: string };

    if (!contextResponse.ok || !contextBody.attemptId) {
      throw new Error(contextBody.error || 'This setup session is no longer available.');
    }
    if (!preflightResponse.ok) {
      throw new Error(preflightBody.error || 'WhatsApp setup preflight failed.');
    }

    contextRef.current = contextBody;
    preflightRef.current = preflightBody;
    setContext(contextBody);
    setPreflight(preflightBody);

    if (contextBody.attemptStatus === 'COMPLETED' || preflightBody.completed) {
      setState('PROVISIONING');
      setMessage('Authorization is complete. Verifying the Meta webhook subscription and phone readiness…');
      setErrorMessage('');
      return;
    }

    if (preflightBody.blockers.length > 0 || !preflightBody.canLaunchMeta) {
      setState('BLOCKED');
      setMessage('This setup session is valid, but Meta authorization cannot continue yet.');
      setErrorMessage(preflightBody.blockers.map((item) => item.message).join(' '));
      return;
    }

    setState('READY');
    setMessage('Preflight passed. Continue with Meta when you are ready.');
    setErrorMessage('');
  }, []);

  const redeemAndLoad = useCallback(async () => {
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
      if (!redeem.ok) throw new Error(redeemed.error || 'This setup link is unavailable.');
    }

    await loadStatus();
  }, [loadStatus]);

  const provisionCompleted = useCallback(async (pin?: string) => {
    setState('PROVISIONING');
    setMessage('Verifying the Meta webhook subscription and phone readiness…');
    setErrorMessage('');

    try {
      const response = await fetch('/setup/whatsapp/api/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pin ? { pin } : {}),
        cache: 'no-store',
      });
      const body = await response.json() as {
        error?: string;
        provisioned?: boolean;
        displayPhoneNumber?: string | null;
        registrationRequired?: boolean;
        message?: string;
      };
      if (body.registrationRequired) {
        setState('REGISTRATION_REQUIRED');
        setMessage('Meta authorization and webhook subscription are confirmed. One final registration step is required.');
        setErrorMessage(body.message || 'Choose a 6-digit WhatsApp two-step verification PIN.');
        return;
      }
      if (!response.ok || !body.provisioned) {
        throw new Error(body.error || 'Unable to confirm WhatsApp provider provisioning.');
      }

      setRegistrationPin('');
      setState('DONE');
      setMessage(
        `WhatsApp is authorized and provider provisioning is confirmed${body.displayPhoneNumber ? ` · ${body.displayPhoneNumber}` : ''}.`,
      );
      setErrorMessage('');
    } catch (error) {
      setState('PROVISIONING_ERROR');
      setMessage('Authorization is saved, but provider provisioning is not confirmed yet.');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to confirm WhatsApp provider provisioning.');
    }
  }, []);

  async function tryComplete() {
    if (savingRef.current || !codeRef.current || !selectionRef.current) return;
    const active = contextRef.current;
    if (!active || active.attemptStatus !== 'AUTHORIZED') return;

    savingRef.current = true;
    setState('VERIFYING_META');
    setMessage('Verifying the selected WhatsApp number with Meta and saving access securely…');
    setErrorMessage('');

    try {
      const response = await fetch('/setup/whatsapp/api/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: codeRef.current,
          wabaId: selectionRef.current.wabaId,
          phoneNumberId: selectionRef.current.phoneNumberId,
        }),
      });
      const body = await response.json() as {
        error?: string;
        completed?: boolean;
        displayPhoneNumber?: string | null;
      };
      if (!response.ok || !body.completed) {
        throw new Error(body.error || 'Unable to finish WhatsApp authorization.');
      }

      setMessage(
        `WhatsApp authorization completed securely${body.displayPhoneNumber ? ` · ${body.displayPhoneNumber}` : ''}. Finalizing provider setup…`,
      );
      setErrorMessage('');
      await loadStatus();
    } catch (error) {
      codeRef.current = null;
      selectionRef.current = null;
      savingRef.current = false;

      try {
        await loadStatus();
        if (contextRef.current?.attemptStatus === 'COMPLETED') return;
      } catch {
        // Keep the actionable completion error below when status refresh also fails.
      }

      setState('READY');
      setMessage('The secure setup session is still available. You can retry Meta authorization.');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to finish WhatsApp authorization.');
    }
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    void redeemAndLoad().catch((error) => {
      setState('ERROR');
      setMessage('This setup session cannot continue.');
      setErrorMessage(error instanceof Error ? error.message : 'This WhatsApp setup link is invalid or expired.');
    });
  }, [redeemAndLoad]);

  useEffect(() => {
    if (state !== 'PROVISIONING' || context?.attemptStatus !== 'COMPLETED') return;
    void provisionCompleted();
  }, [state, context?.attemptStatus, provisionCompleted]);

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
      const data = root.data && typeof root.data === 'object'
        ? root.data as Record<string, unknown>
        : {};
      const wabaId = typeof data.waba_id === 'string' ? data.waba_id.trim() : '';
      const phoneNumberId = typeof data.phone_number_id === 'string' ? data.phone_number_id.trim() : '';

      if (wabaId && phoneNumberId) {
        selectionRef.current = { wabaId, phoneNumberId };
        void tryComplete();
      }
    }

    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  });

  function initializeSdk() {
    const active = preflightRef.current;
    if (!active?.appId || !window.FB) return;
    window.FB.init({
      appId: active.appId,
      cookie: true,
      xfbml: false,
      version: active.graphVersion,
    });
    setSdkReady(true);
  }

  function launchMeta() {
    const active = preflightRef.current;
    if (
      !active
      || !active.canLaunchMeta
      || !active.configurationId
      || !sdkReady
      || !window.FB
      || state === 'WAITING_META'
      || state === 'VERIFYING_META'
    ) return;

    codeRef.current = null;
    selectionRef.current = null;
    savingRef.current = false;
    setState('WAITING_META');
    setMessage('Continue in the Meta window. Smart Visions never asks for your Meta password or a copied access token.');
    setErrorMessage('');

    window.FB.login((response) => {
      const code = response.authResponse?.code?.trim();
      if (!code) {
        setState('READY');
        setMessage('Meta authorization was cancelled or the window did not complete. Nothing was changed.');
        setErrorMessage('You can retry from this same secure setup session.');
        return;
      }
      codeRef.current = code;
      void tryComplete();
    }, {
      config_id: active.configurationId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
    });
  }

  function setupLater() {
    setState('PAUSED');
    setMessage('Setup is paused safely. You can close this page and return on this same device before the secure session expires.');
    setErrorMessage('');
  }

  const activeMode = context?.connectionMode;
  const expiresAt = context?.sessionExpiresAt
    ? new Date(context.sessionExpiresAt).toLocaleString()
    : null;
  const step = state === 'DONE' || state === 'PROVISIONING' || state === 'REGISTRATION_REQUIRED' || state === 'PROVISIONING_ERROR'
    ? 3
    : state === 'WAITING_META' || state === 'VERIFYING_META'
      ? 2
      : 1;

  return <main style={{ maxWidth: 720, margin: '0 auto', padding: '20px 14px 40px' }}>
    {preflight?.appId ? <Script
      src="https://connect.facebook.net/en_US/sdk.js"
      strategy="afterInteractive"
      onLoad={initializeSdk}
      onReady={initializeSdk}
    /> : null}

    <section className="panel settingsCreate" style={{ display: 'grid', gap: 16 }}>
      <div>
        <p className="muted smallText" style={{ marginBottom: 6 }}>Secure WhatsApp setup · Step {step} of 3</p>
        <h1 style={{ marginTop: 0 }}>Connect WhatsApp Business</h1>
        <p className="muted">Meta handles the login. Smart Visions never receives your Facebook password.</p>
        <p className="muted"><strong>Your existing WhatsApp Business app is never deleted or destructively migrated by this setup.</strong></p>
      </div>

      {context ? <div className="settingsList">
        <div className="settingsRow">
          <div>
            <strong>{context.businessName}</strong>
            <span className="muted smallText">{context.branchName ?? 'Business-wide'} · {context.purpose}</span>
            {context.destinationLabel ? <span className="muted smallText">Current WhatsApp: {context.destinationLabel}</span> : null}
          </div>
          <div>
            <span className="muted smallText">Setup access only</span>
            {expiresAt ? <span className="muted smallText">Expires: {expiresAt}</span> : null}
          </div>
        </div>
      </div> : null}

      {activeMode ? <div>
        <strong>Connection path</strong>
        <p className="muted smallText">{modeMessage(activeMode)}</p>
      </div> : null}

      {state === 'READY' ? <>
        <div>
          <strong>Preflight complete</strong>
          <p className="muted smallText">Your setup link, business scope and Meta provider configuration are ready. Continue with Meta to choose the authorized WhatsApp asset.</p>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <button type="button" onClick={launchMeta} disabled={!sdkReady || !preflight?.canLaunchMeta}>
            {sdkReady ? 'Continue with Meta' : 'Loading Meta…'}
          </button>
          <button type="button" onClick={setupLater}>Set up later</button>
        </div>
      </> : null}

      {state === 'PAUSED' ? <div style={{ display: 'grid', gap: 10 }}>
        <strong>Setup paused</strong>
        <p className="muted smallText">Nothing has been changed. Return before the session expires to continue from the same setup attempt. If it expires, the business owner can issue a fresh setup link without affecting WhatsApp on the phone.</p>
        <button type="button" onClick={() => {
          setState('READY');
          setMessage('Secure setup resumed. Continue with Meta when ready.');
        }}>Resume setup</button>
      </div> : null}

      {state === 'WAITING_META' ? <div>
        <strong>Waiting for Meta</strong>
        <p className="muted smallText">Finish the Meta-hosted authorization. If you cancel or the popup is blocked, you can retry without creating another WhatsApp connection.</p>
      </div> : null}

      {state === 'VERIFYING_META' ? <div>
        <strong>Verifying selection</strong>
        <p className="muted smallText">Smart Visions is checking that the selected phone belongs to the selected WhatsApp Business Account before storing the credential in the existing secure Vault.</p>
      </div> : null}

      {state === 'BLOCKED' ? <div style={{ display: 'grid', gap: 10 }}>
        <strong>Setup cannot continue yet</strong>
        <p className="muted smallText">{errorMessage || 'A provider prerequisite is not ready.'}</p>
        <button type="button" onClick={setupLater}>Set up later</button>
      </div> : null}

      {state === 'PROVISIONING' ? <div>
        <strong>Finalizing provider setup</strong>
        <p className="muted smallText">Smart Visions is confirming the selected phone still belongs to this WABA and that the existing Meta app is subscribed to WhatsApp webhooks.</p>
      </div> : null}

      {state === 'REGISTRATION_REQUIRED' ? <div style={{ display: 'grid', gap: 10 }}>
        <strong>Set WhatsApp two-step verification</strong>
        <p className="muted smallText">Choose a new 6-digit PIN for this WhatsApp Cloud API number. Smart Visions sends it directly to Meta for registration and does not store it.</p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          pattern="[0-9]{6}"
          value={registrationPin}
          onChange={(event) => setRegistrationPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-label="6-digit WhatsApp two-step verification PIN"
          placeholder="6-digit PIN"
        />
        <button
          type="button"
          disabled={!/^\d{6}$/.test(registrationPin)}
          onClick={() => void provisionCompleted(registrationPin)}
        >
          Register WhatsApp number
        </button>
        {errorMessage ? <p className="muted smallText">{errorMessage}</p> : null}
      </div> : null}

      {state === 'PROVISIONING_ERROR' ? <div style={{ display: 'grid', gap: 10 }}>
        <strong>Provider setup needs a retry</strong>
        <p className="muted smallText">{errorMessage}</p>
        <button type="button" onClick={() => void provisionCompleted()}>Retry provider verification</button>
      </div> : null}

      {state === 'DONE' ? <div>
        <strong>WhatsApp setup complete</strong>
        <p className="muted smallText">Authorization, phone ownership readback and Meta webhook subscription are confirmed on the existing Smart Core binding and secure Vault. No destructive WhatsApp migration was performed.</p>
      </div> : null}

      {state === 'ERROR' ? <div style={{ display: 'grid', gap: 10 }}>
        <strong>Setup link unavailable</strong>
        <p className="muted smallText">{errorMessage}</p>
        <button type="button" onClick={() => {
          setState('VERIFYING');
          setMessage('Checking the secure setup session again…');
          setErrorMessage('');
          void loadStatus().catch((error) => {
            setState('ERROR');
            setErrorMessage(error instanceof Error ? error.message : 'Unable to resume setup.');
          });
        }}>Check again</button>
      </div> : null}

      {message ? <p role="status" className="muted smallText">{message}</p> : null}
      {state !== 'ERROR' && state !== 'BLOCKED' && errorMessage
        ? <p role="alert" className="muted smallText">{errorMessage}</p>
        : null}
    </section>
  </main>;
}
