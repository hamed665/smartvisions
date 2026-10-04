'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type InviteContext = {
  invitationId: string;
  organizationId: string;
  organizationName?: string;
  email: string;
  role: string;
  version: number;
  expiresAt: string;
  acceptedAt?: string | null;
};

type AccessResult = {
  organizationId: string;
  role: string;
  acceptedAt: string;
  replayed: boolean;
};

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function AcceptInvitePage() {
  const [invite, setInvite] = useState<InviteContext | null>(null);
  const [access, setAccess] = useState<AccessResult | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const acceptAccess = useCallback(async () => {
    const response = await fetch('/api/access/invites/accept', {
      method: 'POST',
      headers: { 'Cache-Control': 'no-store' },
    });
    const body = await readJson(response);
    if (!response.ok) throw new Error(body.error || 'Unable to accept invitation.');
    setAccess(body as AccessResult);
    setNotice('Your Smart Visions access is active.');
  }, []);

  const loadSession = useCallback(async () => {
    const response = await fetch('/api/access/invites/session', { cache: 'no-store' });
    const body = await readJson(response);
    if (!response.ok) throw new Error(body.error || 'Invitation session is unavailable.');
    setInvite(body as InviteContext);

    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const hasUser = Boolean(data.user);
    setAuthenticated(hasUser);
    if (hasUser) {
      await acceptAccess();
    }
  }, [acceptAccess]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setLoading(true);
      setError('');
      try {
        const token = window.location.hash.slice(1).trim().toLowerCase();
        if (token) {
          if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('Invitation link is invalid.');
          const response = await fetch('/api/access/invites/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify({ token }),
          });
          const body = await readJson(response);
          if (!response.ok) throw new Error(body.error || 'Invitation link is no longer valid.');
          window.history.replaceState(null, '', '/invite/accept');
        }

        if (!cancelled) await loadSession();
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load invitation.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void start();
    return () => { cancelled = true; };
  }, [loadSession]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invite) return;
    setBusy(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: invite.email,
        password,
      });
      if (signInError) throw new Error('Email or password is incorrect.');
      setAuthenticated(true);
      await acceptAccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invite) return;
    setBusy(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');

    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      setBusy(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/invite/accept`,
        },
      });
      if (signUpError) throw new Error('Unable to create this account. If it already exists, sign in instead.');

      if (data.session) {
        setAuthenticated(true);
        await acceptAccess();
      } else {
        setNotice('Check your email to confirm the account, then this invitation will continue securely.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create account.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setAuthenticated(false);
    setAccess(null);
    setNotice('');
    setError('');
  }

  if (loading) {
    return <main className="login-shell"><section className="login-card"><p>Validating invitation…</p></section></main>;
  }

  if (error && !invite) {
    return <main className="login-shell"><section className="login-card"><p className="eyebrow">SMART VISIONS</p><h1>Invitation unavailable</h1><p role="alert">{error}</p></section></main>;
  }

  if (!invite) return null;

  if (access) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <p className="eyebrow">SMART VISIONS</p>
          <h1>Access activated</h1>
          <p>{invite.organizationName || 'Your organization'} · {access.role}</p>
          <p>{notice}</p>
          <p>Your Business workspace will only appear when its explicit Business scope is assigned. No operator-only access is granted by this invitation.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">SMART VISIONS</p>
        <h1>Accept invitation</h1>
        <p>{invite.organizationName || 'Smart Visions Business'} invited <strong>{invite.email}</strong> as {invite.role}.</p>
        {notice ? <p>{notice}</p> : null}
        {error ? <p role="alert">{error}</p> : null}

        {authenticated ? (
          <div>
            <button type="button" disabled={busy} onClick={() => void acceptAccess()}>
              {busy ? 'Activating…' : 'Activate access'}
            </button>
            <button type="button" className="secondaryButton" onClick={() => void signOut()}>Use another account</button>
          </div>
        ) : (
          <>
            <form onSubmit={createAccount}>
              <h2>Create account</h2>
              <label>Email<input value={invite.email} readOnly autoComplete="email" /></label>
              <label>Password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
              <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
            </form>
            <form onSubmit={signIn}>
              <h2>Already have an account?</h2>
              <label>Email<input value={invite.email} readOnly autoComplete="email" /></label>
              <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
              <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in and accept'}</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
