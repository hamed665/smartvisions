import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const SESSION_BYPASS_PATHS = new Set([
  '/api/email/webhook',
  '/api/whatsapp/webhook',
  '/api/ai/process-inbound',
  '/api/outreach/approved-send',
]);

export function shouldBypassSession(pathname: string) {
  return SESSION_BYPASS_PATHS.has(pathname);
}

export async function updateSession(request: NextRequest) {
  if (shouldBypassSession(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const authenticated = Boolean(data?.claims);
  const publicPath = request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/auth');

  if (!authenticated && !publicPath) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    return NextResponse.redirect(redirect);
  }

  if (authenticated && request.nextUrl.pathname === '/login') {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/';
    return NextResponse.redirect(redirect);
  }

  return response;
}
