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

type SessionInfo = {
  wabaId: string;
  phoneNumberId: string | null;
  event: string | null;
};
type ConnectionMode =
  | 'BUSINESS_APP_COEXISTENCE'
  | 'API_NEW_NUMBER'
  | 'EXISTING_API_RECONNECT';

type SetupAttempt = {
  attemptId: string;
  bindingId: string;
  bindingVersion: number;
  connectionMode: ConnectionMode;
};

declare global {
  interface Window {
    FB?: {
      init(input: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;
      login(callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>): void;
    };
  }
}

function defaultMode(binding: BindingOption | undefined): ConnectionMode {
  return binding?.destinationLabel ? 'EXISTING_API_RECONNECT' : 'BUSINESS_APP_COEXISTENCE';
}

export function MetaWhatsAppEmbeddedSignup(props: {
  appId: string | null;
  configurationId: string | null;
  coexistenceEnabled: boolean;
  graphVersion: string;
  bindings: BindingOption[];
  bootstrapBusinessId?: string | null;
  bootstrapBusinessName?: string | null;
}) {
  const [bindings, setBindings] = useState(props.bindings);
  const [bindingId, setBindingId] = useState(props.bindings[0]?.id ?? '');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(defaultMode(props.bindings[0]));
  const [sdkReady, setSdkReady] = useState(false);
  const [state, setState] = useState<'IDLE' | 'PREPARING' | 'WAITING' | 'SAVING' | 'PROVISIONING' | 'REGISTRATION_REQUIRED' | 'PROVISIONING_ERROR' | 'CHATWOOT_PROVISIONING' | 'CHATWOOT_ACTION_REQUIRED' | 'DONE' | 'ERROR'>('IDLE');
  const [message, setMessage] = useState('');
  const [registrationPin, setRegistrationPin] = useState('');
  const codeRef = useRef<string | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  const attemptRef = useRef<SetupAttempt | null>(null);
  const savingRef = useRef(false);

  const selected = bindings.find((item) => item.id === bindingId);
  const canBootstrap = Boolean(props.bootstrapBusinessId && props.bootstrapBusinessName);

  async function provisionChatwootSelected(targetBindingId: string) {
    setState('CHATWOOT_PROVISIONING');
    setMessage('Meta setup is confirmed. Preparing the existing Smart Visions communication Inbox…');

    try {
      const response = await fetch('/api/integrations/meta/whatsapp/embedded-signup/chatwoot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bindingId: targetBindingId }),
      });
      const body = await response.json() as {
        error?: string;
        ready?: boolean;
        correlationId?: string;
      };
      if (!response.ok || !body.ready) {
        const suffix = body.correlationId ? ` Support ID: ${body.correlationId}` : '';
        throw new Error((body.error || 'Communication Inbox provisioning is not ready.') + suffix);
      }

      savingRef.current = false;
      setState('DONE');
      setMessage('WhatsApp and the Smart Visions communication Inbox are ready. Refreshing…');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      savingRef.current = false;
      setState('CHATWOOT_ACTION_REQUIRED');
      setMessage(error instanceof Error
        ? error.message
        : 'WhatsApp is connected, but the communication Inbox still needs owner reconciliation.');
    }
  }

  async function provisionSelected(targetBindingId: string, pin?: string) {
    setState('PROVISIONING');
    setMessage('Authorization is saved. Confirming Meta webhook subscription and phone readiness…');

    try {
      const response = await fetch('/api/integrations/meta/whatsapp/embedded-signup/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bindingId: targetBindingId,
          attemptId: attemptRef.current?.attemptId,
          ...(pin ? { pin } : {}),
        }),
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
        setMessage(body.message || 'Choose a 6-digit WhatsApp two-step verification PIN to finish registration.');
        return;
      }
      if (!response.ok || !body.provisioned) {
        throw new Error(body.error || 'Unable to confirm WhatsApp provider provisioning');
      }

      setRegistrationPin('');
      setMessage(`WhatsApp provider setup confirmed${body.displayPhoneNumber ? ` · ${body.displayPhoneNumber}` : ''}. Preparing the communication Inbox…`);
      await provisionChatwootSelected(targetBindingId);
    } catch (error) {
      savingRef.current = false;
      if (pin) {
        setState('REGISTRATION_REQUIRED');
        setMessage(error instanceof Error ? error.message : 'Meta did not confirm WhatsApp phone registration');
        return;
      }
      setState('PROVISIONING_ERROR');
      setMessage(error instanceof Error ? error.message : 'Unable to confirm WhatsApp provider provisioning');
    }
  }

  async function finishIfReady() {
    const attempt = attemptRef.current;
    if (
      savingRef.current
      || !codeRef.current
      || !sessionRef.current
      || !attempt
      || (
        !sessionRef.current.phoneNumberId
        && attempt.connectionMode !== 'BUSINESS_APP_COEXISTENCE'
      )
    ) return;

    savingRef.current = true;
    setState('SAVING');
    setMessage('Verifying that the selected number belongs to the selected Meta business and storing the credential securely…');

    try {
      const response = await fetch('/api/integrations/meta/whatsapp/embedded-signup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: attempt.attemptId,
          bindingId: attempt.bindingId,
          expectedVersion: attempt.bindingVersion,
          code: codeRef.current,
          wabaId: sessionRef.current.wabaId,
          phoneNumberId: sessionRef.current.phoneNumberId ?? undefined,
        }),
      });
      const body = await response.json() as { error?: string; displayPhoneNumber?: string | null };
      if (!response.ok) throw new Error(body.error || 'Unable to complete Meta connection');
      setMessage(`Connected securely${body.displayPhoneNumber ? ` · ${body.displayPhoneNumber}` : ''}. Finalizing provider setup…`);
      await provisionSelected(attempt.bindingId);
    } catch (error) {
      savingRef.current = false;
      codeRef.current = null;
      sessionRef.current = null;
      attemptRef.current = null;
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
      const sessionEvent = typeof data.event === 'string' ? data.event.trim() : '';
      const coexistenceFinish = sessionEvent === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';
      if (wabaId && (phoneNumberId || coexistenceFinish)) {
        sessionRef.current = {
          wabaId,
          phoneNumberId: phoneNumberId || null,
          event: sessionEvent || null,
        };
        void finishIfReady();
      }
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  });

  const configured = Boolean(props.appId && props.configurationId);

  async function ensureSelectedBinding() {
    if (selected) return selected;
    if (!props.bootstrapBusinessId || !props.bootstrapBusinessName) {
      throw new Error('No canonical WhatsApp binding is available for this Business.');
    }

    setMessage('Preparing the canonical WhatsApp connection for this Business…');
    const response = await fetch('/api/customer/connections/whatsapp/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: props.bootstrapBusinessId }),
    });
    const body = await response.json() as {
      error?: string;
      binding?: BindingOption;
    };
    if (!response.ok || !body.binding?.id) {
      throw new Error(body.error || 'Unable to prepare WhatsApp setup for this Business.');
    }

    setBindings((current) => (
      current.some((item) => item.id === body.binding?.id)
        ? current
        : [body.binding as BindingOption, ...current]
    ));
    setBindingId(body.binding.id);
    return body.binding;
  }

  function launch() {
    if (
      !configured
      || !sdkReady
      || !window.FB
      || state === 'PREPARING'
      || state === 'WAITING'
      || state === 'SAVING'
      || state === 'PROVISIONING'
      || state === 'CHATWOOT_PROVISIONING'
    ) return;

    if (connectionMode === 'BUSINESS_APP_COEXISTENCE' && !props.coexistenceEnabled) {
      setState('ERROR');
      setMessage('Your WhatsApp Business app will not be deleted or migrated. Same-number connection is not enabled for this Meta Embedded Signup configuration yet. Use a separate API number for now.');
      return;
    }

    codeRef.current = null;
    sessionRef.current = null;
    attemptRef.current = null;
    savingRef.current = false;
    setState('WAITING');
    setMessage('Complete the Meta-hosted signup window. Smart Visions never asks for your Meta password or a copied token.');

    const extras = connectionMode === 'BUSINESS_APP_COEXISTENCE'
      ? {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        }
      : {
          setup: {},
          sessionInfoVersion: '3',
        };

    window.FB.login((response) => {
      const code = response.authResponse?.code?.trim();
      if (!code) {
        setState('ERROR');
        setMessage('Meta signup was cancelled or returned no authorization code. Your existing WhatsApp was not changed.');
        return;
      }

      codeRef.current = code;
      setState('PREPARING');
      setMessage('Authorization returned. Binding this setup to the selected Business…');

      void (async () => {
        try {
          const target = await ensureSelectedBinding();
          const startResponse = await fetch('/api/integrations/meta/whatsapp/embedded-signup/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bindingId: target.id,
              expectedVersion: target.version,
              connectionMode,
            }),
          });
          const attempt = await startResponse.json() as SetupAttempt & { error?: string };
          if (!startResponse.ok || !attempt.attemptId) {
            throw new Error(attempt.error || 'Unable to start WhatsApp setup');
          }

          attemptRef.current = attempt;
          void finishIfReady();
        } catch (error) {
          attemptRef.current = null;
          codeRef.current = null;
          setState('ERROR');
          setMessage(error instanceof Error ? error.message : 'Unable to start WhatsApp setup');
        }
      })();
    }, {
      config_id: props.configurationId,
      response_type: 'code',
      override_default_response_type: true,
      extras,
    });
  }

  const setupAvailable = bindings.length > 0 || canBootstrap;

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
    <p className="muted">Authorization happens on Meta. Smart Visions never asks for your Facebook password or a copied access token.</p>
    <p className="muted"><strong>Your existing WhatsApp Business app is never deleted or destructively migrated by this setup.</strong></p>
    {setupAvailable ? <>
      {bindings.length ? <label>Business destination
        <select
          value={bindingId}
          onChange={(event) => {
            const nextId = event.target.value;
            const next = bindings.find((item) => item.id === nextId);
            setBindingId(nextId);
            setConnectionMode(defaultMode(next));
            setState('IDLE');
            setMessage('');
          }}
        >
          {bindings.map((binding) => <option key={binding.id} value={binding.id}>
            {binding.businessName}{binding.branchName ? ` · ${binding.branchName}` : ''}{binding.destinationLabel ? ` · ${binding.destinationLabel}` : ''}
          </option>)}
        </select>
      </label> : <div className="healthList compactHealth">
        <span>Business <strong>{props.bootstrapBusinessName}</strong></span>
        <span>Binding <strong>Created only when setup starts</strong></span>
      </div>}
      <label>Connection path
        <select
          value={connectionMode}
          onChange={(event) => {
            setConnectionMode(event.target.value as ConnectionMode);
            setState('IDLE');
            setMessage('');
          }}
        >
          <option value="BUSINESS_APP_COEXISTENCE">Keep the current WhatsApp Business app + connect API (Coexistence)</option>
          <option value="API_NEW_NUMBER">Use a separate number for the API</option>
          {selected?.destinationLabel ? <option value="EXISTING_API_RECONNECT">Reconnect the existing API number</option> : null}
        </select>
      </label>
      {connectionMode === 'BUSINESS_APP_COEXISTENCE'
        ? <p className="muted smallText">
            {props.coexistenceEnabled
              ? 'Meta Coexistence keeps the current WhatsApp Business app active on the phone while adding Cloud API access. Smart Visions will not ask you to delete, uninstall, or destructively migrate the app.'
              : 'Same-number setup remains fail-closed until this Meta Embedded Signup configuration is enabled for Coexistence. Smart Visions will not fall back to Delete Account or destructive migration.'}
          </p>
        : null}
      {connectionMode === 'API_NEW_NUMBER'
        ? <p className="muted smallText">Use only a number that is not active in WhatsApp Business on a phone. If Meta asks you to delete an existing WhatsApp account, cancel the flow; Smart Visions does not require that migration.</p>
        : null}
      <button
        type="button"
        onClick={() => void launch()}
        disabled={!configured || !sdkReady || state === 'PREPARING' || state === 'WAITING' || state === 'SAVING' || state === 'PROVISIONING' || state === 'CHATWOOT_PROVISIONING'}
      >
        {state === 'CHATWOOT_PROVISIONING'
          ? 'Preparing communication Inbox…'
          : state === 'PROVISIONING'
            ? 'Finalizing provider setup…'
            : state === 'PREPARING' || state === 'WAITING' || state === 'SAVING'
              ? 'Connecting…'
              : 'Connect with Meta'}
      </button>
      {selected?.destinationLabel && state !== 'PREPARING' && state !== 'WAITING' && state !== 'SAVING' && state !== 'PROVISIONING' && state !== 'CHATWOOT_PROVISIONING'
        ? <button type="button" onClick={() => void provisionChatwootSelected(selected.id)}>
            Finalize communication Inbox
          </button>
        : null}
      {state === 'REGISTRATION_REQUIRED' && bindingId ? <div style={{ display: 'grid', gap: 8 }}>
        <label>WhatsApp two-step verification PIN
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            pattern="[0-9]{6}"
            value={registrationPin}
            onChange={(event) => setRegistrationPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit PIN"
          />
        </label>
        <p className="muted smallText">Choose a new 6-digit PIN. Smart Visions sends it to Meta for Cloud API registration and does not store it.</p>
        <button
          type="button"
          disabled={!/^\d{6}$/.test(registrationPin)}
          onClick={() => void provisionSelected(bindingId, registrationPin)}
        >
          Register WhatsApp number
        </button>
      </div> : null}
      {state === 'PROVISIONING_ERROR' && bindingId
        ? <button type="button" onClick={() => void provisionSelected(bindingId)}>Retry provider verification</button>
        : null}
      {state === 'CHATWOOT_ACTION_REQUIRED' && bindingId
        ? <div style={{ display: 'grid', gap: 8 }}>
            <p className="muted smallText">Meta authorization is already saved. Retrying this step does not repeat Meta login or create another WhatsApp connection.</p>
            <button type="button" onClick={() => void provisionChatwootSelected(bindingId)}>Retry communication Inbox</button>
          </div>
        : null}
    </> : <p className="muted">Create an active tenant Business before connecting Meta assets.</p>}
    {!configured ? <p className="muted">Embedded Signup is code-ready but blocked until the Meta App ID and Embedded Signup Configuration ID are configured for this environment.</p> : null}
    {message ? <p role="status" className="muted smallText">{message}</p> : null}
  </section>;
}
