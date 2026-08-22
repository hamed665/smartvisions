import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { transcribeWhatsAppVoiceOnce } from '@/lib/voice/transcription';

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;

  let body: {
    organizationId?: string;
    providerMessageId?: string;
    mediaId?: string;
    mimeType?: string;
    leadId?: string;
    conversationId?: string;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.organizationId || !body.providerMessageId || !body.mediaId) {
    return NextResponse.json({ error: 'organizationId, providerMessageId and mediaId are required' }, { status: 400 });
  }

  try {
    const result = await transcribeWhatsAppVoiceOnce({
      organizationId: body.organizationId,
      providerMessageId: body.providerMessageId,
      mediaId: body.mediaId,
      mimeType: body.mimeType,
      leadId: body.leadId,
      conversationId: body.conversationId,
      priority: body.priority,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Voice transcription failed';
    const blocked = /blocked|Cost guard|not configured|required/i.test(message);
    return NextResponse.json({ error: message }, { status: blocked ? 409 : 500 });
  }
}
