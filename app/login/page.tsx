'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type BusinessContextResponse = {
  selectedBusiness?: { id?: string } | null;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function destinationAfterSignIn() {
    try {
      const response = await fetch('/api/access/business-context', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-store' },
      });
      if (!response.ok) return '/';
      const body = await response.json() as BusinessContextResponse;
      const businessId = body.selectedBusiness?.id?.trim();
      return businessId
        ? `/customer?businessId=${encodeURIComponent(businessId)}`
        : '/';
    } catch {
      return '/';
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const supabase = createClient();
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        setError('Invalid email or password.');
        return;
      }
      router.replace(await destinationAfterSignIn());
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">SMART VISIONS</p>
        <h1>Sign in</h1>
        <p>Access your Smart Visions workspace.</p>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        <Link href="/auth/forgot-password">Forgot password?</Link>
      </form>
    </main>
  );
}
