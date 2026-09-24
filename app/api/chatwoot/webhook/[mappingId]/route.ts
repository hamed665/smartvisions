import { NextResponse } from 'next/server';
import {
  ChatwootWebhookError,
  persistSignedChatwootWebhook,
} from '@/lib/chatwoot/webhook-receiver';

const MAX_WEBHOOK_BYTES = 1024 * 1024;

class WebhookBodyTooLargeError extends Error {}

async function readWebhookBody(request: Request) {
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        throw new WebhookBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder('utf-8', { fatal: true }).decode(merged);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ mappingId: string }> },
) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return NextResponse.json(
      { error: 'Unsupported Chatwoot webhook content type' },
      { status: 415 },
    );
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_WEBHOOK_BYTES
  ) {
    return NextResponse.json(
      { error: 'Chatwoot webhook body too large' },
      { status: 413 },
    );
  }

  const { mappingId } = await context.params;

  let rawBody: string;
  try {
    rawBody = await readWebhookBody(request);
  } catch (error) {
    if (error instanceof WebhookBodyTooLargeError) {
      return NextResponse.json(
        { error: 'Chatwoot webhook body too large' },
        { status: 413 },
      );
    }
    return NextResponse.json(
      { error: 'Invalid Chatwoot webhook request' },
      { status: 400 },
    );
  }

  try {
    const result = await persistSignedChatwootWebhook({
      mappingId,
      rawBody,
      deliveryId: request.headers.get('x-chatwoot-delivery'),
      timestamp: request.headers.get('x-chatwoot-timestamp'),
      signature: request.headers.get('x-chatwoot-signature'),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ChatwootWebhookError) {
      if (error.code === 'INVALID_REQUEST') {
        return NextResponse.json(
          { error: 'Invalid Chatwoot webhook request' },
          { status: 400 },
        );
      }
      if (error.code === 'UNAUTHORIZED') {
        return NextResponse.json(
          { error: 'Invalid Chatwoot webhook' },
          { status: 401 },
        );
      }

      return NextResponse.json(
        { error: 'Chatwoot webhook temporarily unavailable' },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: 'Chatwoot webhook temporarily unavailable' },
      { status: 503 },
    );
  }
}
