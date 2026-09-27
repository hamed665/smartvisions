import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const SESSION_BYPASS_PATHS = new Set([
  '/api/email/webhook',
  '/api/whatsapp/webhook',
  '/api/ai/process-inbound',
  '/api/outreach/approved-send',
  '/api/operations/channel-guard',
  '/api/operations/email-shadow',
  '/api/operations/heartbeat',
  '/api/operations/report',
  '/api/operations/telegram-daily-digest',
  '/api/operations/tick',
  '/api/telegram/webhook',
  '/api/telegram/notify',
  '/api/web-chat/session',
  '/api/web-chat/message',
  '/api/web-chat/config',
  '/api/web-chat/messages',
  '/api/web-chat/widget',
  '/api/web-chat/upload',
]);

export function shouldBypassSession(pathname: string) {
  return SESSION_BYPASS_PATHS.has(pathname)
    || /^\/api\/web-chat\/attachments\/[1-9][0-9]*$/.test(pathname)
    || /^\/api\/telegram\/customer\/webhook\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pathname)
    || pathname.startsWith('/p/');
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
