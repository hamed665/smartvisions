import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const SAFE_AUTH_DESTINATIONS = new Set([
  '/invite/accept',
  '/auth/update-password',
  '/login',
]);

function safeNext(value: string | null) {
  return value && SAFE_AUTH_DESTINATIONS.has(value) ? value : '/login';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL(next, url.origin));
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
  }

  const failure = new URL('/login', url.origin);
  failure.searchParams.set('authError', 'callback');
  const response = NextResponse.redirect(failure);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
