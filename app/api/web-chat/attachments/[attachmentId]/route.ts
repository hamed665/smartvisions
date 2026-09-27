import { NextResponse } from 'next/server';
import {
  downloadPublicWebChatAttachment,
  PublicWebChatError,
  webChatCorsHeaders,
} from '@/lib/web-chat/runtime';

export const runtime = 'nodejs';

function statusFor(error: unknown) {
  if (!(error instanceof PublicWebChatError)) return 503;
  if (error.code === 'ORIGIN_NOT_ALLOWED') return 403;
  if (error.code === 'SESSION_UNAVAILABLE') return 401;
  if (error.code === 'MESSAGE_INVALID') return 400;
  if (error.code === 'ATTACHMENT_UNAVAILABLE') return 404;
  if (error.code === 'WIDGET_UNAVAILABLE') return 404;
  return 503;
}

export async function OPTIONS(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  await params;
  const url = new URL(request.url);
  const key = url.searchParams.get('key')?.trim() ?? '';
  const headers = await webChatCorsHeaders(key, request.headers.get('origin'));
  if (!headers) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: { ...headers, 'Access-Control-Allow-Methods': 'GET,OPTIONS' },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key')?.trim() ?? '';
  const origin = request.headers.get('origin');
  const cors = await webChatCorsHeaders(key, origin);
  if (!cors) return NextResponse.json({ error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });

  const { attachmentId } = await params;
  const sessionId = request.headers.get('x-web-chat-session-id')?.trim() ?? '';
  const sessionToken = request.headers.get('x-web-chat-session-token')?.trim() ?? '';
  const messageId = Number(url.searchParams.get('messageId'));
  const numericAttachmentId = Number(attachmentId);

  if (
    !sessionId
    || !sessionToken
    || sessionToken.length > 256
    || !Number.isSafeInteger(messageId)
    || messageId <= 0
    || !Number.isSafeInteger(numericAttachmentId)
    || numericAttachmentId <= 0
  ) {
    return NextResponse.json(
      { error: 'ATTACHMENT_UNAVAILABLE' },
      { status: 404, headers: { ...cors, 'Cache-Control': 'private, no-store' } },
    );
  }

  try {
    const result = await downloadPublicWebChatAttachment({
      publicKey: key,
      origin: origin ?? '',
      sessionId,
      sessionToken,
      attachmentId: numericAttachmentId,
      messageId,
    });
    const headers = new Headers({
      ...cors,
      'Cache-Control': 'private, no-store',
      'Content-Type': result.contentType,
      'Content-Disposition': `${result.inline ? 'inline' : 'attachment'}; filename="${result.filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    if (result.contentLength !== null) {
      headers.set('Content-Length', String(result.contentLength));
    }
    return new Response(result.body, { status: 200, headers });
  } catch (error) {
    const code = error instanceof PublicWebChatError ? error.code : 'SERVICE_UNAVAILABLE';
    return NextResponse.json(
      { error: code },
      {
        status: statusFor(error),
        headers: { ...cors, 'Cache-Control': 'private, no-store' },
      },
    );
  }
}
