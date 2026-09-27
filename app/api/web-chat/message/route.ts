import { NextResponse } from 'next/server';
import {
  persistPublicWebChatMessage,
  PublicWebChatError,
  webChatCorsHeaders,
} from '@/lib/web-chat/runtime';

export const runtime = 'nodejs';

function errorStatus(error: unknown) {
  if (!(error instanceof PublicWebChatError)) return 503;
  if (error.code === 'ORIGIN_NOT_ALLOWED') return 403;
  if (error.code === 'SESSION_UNAVAILABLE') return 401;
  if (error.code === 'MESSAGE_INVALID') return 400;
  if (error.code === 'RATE_LIMITED') return 429;
  if (error.code === 'WIDGET_UNAVAILABLE') return 404;
  if (error.code === 'RECONCILIATION_REQUIRED') return 409;
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
  if (Number.isFinite(size) && size > 16_384) {
    return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413, headers: cors });
  }

  let body: {
    sessionId?: string;
    sessionToken?: string;
    clientMessageId?: string;
    text?: string;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400, headers: cors });
  }

  if (
    typeof body.sessionId !== 'string' ||
    typeof body.sessionToken !== 'string' ||
    typeof body.clientMessageId !== 'string' ||
    typeof body.text !== 'string' ||
    body.sessionToken.length > 256 ||
    body.text.length > 10_000
  ) {
    return NextResponse.json({ error: 'MESSAGE_INVALID' }, { status: 400, headers: cors });
  }

  try {
    const result = await persistPublicWebChatMessage({
      publicKey: key,
      origin: origin ?? '',
      sessionId: body.sessionId,
      sessionToken: body.sessionToken,
      clientMessageId: body.clientMessageId,
      text: body.text,
    });
    return NextResponse.json(result, {
      status: 202,
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
