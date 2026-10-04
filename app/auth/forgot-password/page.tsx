'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
      });
      setMessage('If an account exists for that email, a recovery link has been sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">SMART VISIONS</p>
        <h1>Reset password</h1>
        <p>Enter the email used for your Smart Visions account.</p>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        {message ? <p>{message}</p> : null}
        <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send recovery link'}</button>
        <Link href="/login">Back to sign in</Link>
      </form>
    </main>
  );
}
