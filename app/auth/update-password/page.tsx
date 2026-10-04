'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function UpdatePasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      setBusy(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError('This recovery session is invalid or expired.');
        return;
      }
      setMessage('Password updated. You can now continue securely.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">SMART VISIONS</p>
        <h1>Choose a new password</h1>
        <label>New password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
        {error ? <p role="alert">{error}</p> : null}
        {message ? <p>{message}</p> : null}
        <button type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
        <Link href="/login">Return to sign in</Link>
      </form>
    </main>
  );
}
