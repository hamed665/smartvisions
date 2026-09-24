import { NextResponse } from 'next/server';
import {
  ChatwootWebhookError,
  persistSignedChatwootWebhook,
} from '@/lib/chatwoot/webhook-receiver';

const MAX_WEBHOOK_BYTES = 1024 * 1024;

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
  const rawBody = await request.text();

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
