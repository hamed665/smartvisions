import { NextResponse } from 'next/server';
import {
  createPublicWebChatSession,
  PublicWebChatError,
  webChatCorsHeaders,
} from '@/lib/web-chat/runtime';

export const runtime = 'nodejs';

function errorStatus(error: unknown) {
  if (!(error instanceof PublicWebChatError)) return 503;
  if (error.code === 'ORIGIN_NOT_ALLOWED') return 403;
  if (error.code === 'CONSENT_REQUIRED') return 409;
  if (error.code === 'WIDGET_UNAVAILABLE') return 404;
  if (error.code === 'SESSION_UNAVAILABLE') return 401;
  if (error.code === 'MESSAGE_INVALID') return 400;
  if (error.code === 'RATE_LIMITED') return 429;
  return 503;
}

export async function OPTIONS(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key')?.trim() ?? '';
  const headers = await webChatCorsHeaders(key, request.headers.get('origin'));
  if (!headers) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key')?.trim() ?? '';
  const origin = request.headers.get('origin');
  const cors = await webChatCorsHeaders(key, origin);
  if (!cors) {
    return NextResponse.json({ error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
  }

  const size = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(size) && size > 4096) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413, headers: cors });
  }

  let body: { consentAccepted?: boolean };
  try {
    body = await request.json() as { consentAccepted?: boolean };
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400, headers: cors });
  }

  try {
    const session = await createPublicWebChatSession({
      publicKey: key,
      origin: origin ?? '',
      consentAccepted: body.consentAccepted === true,
    });
    return NextResponse.json(session, {
      status: 201,
      headers: { ...cors, 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const code = error instanceof PublicWebChatError ? error.code : 'SERVICE_UNAVAILABLE';
    return NextResponse.json({ error: code }, {
      status: errorStatus(error),
      headers: { ...cors, 'Cache-Control': 'no-store' },
    });
  }
}
