import { readBoundedAudio } from '@/lib/voice/bounded-audio';
import { NextResponse } from 'next/server';
import { customerStudioScope, isStudioRequestOrigin, studioOwnerThread } from '@/lib/access/customer-studio';
import { normalizeCustomerBusinessId } from '@/lib/access/customer-business-scope';
import { assertPaidOperationAllowed, finalizeCostGuardUsage, getCostGuardState, reserveCostGuardUsage } from '@/lib/reliability/cost-guard';
import { assertRuntimeOperationAllowed } from '@/lib/reliability/runtime-safety';
import { estimateVoiceTranscriptionReserve, transcribeWithOpenAI } from '@/lib/voice/transcription';
import { STUDIO_VOICE_MAX_BYTES, studioWaveDuration } from '@/lib/voice/studio-wave';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const businessId = normalizeCustomerBusinessId(url.searchParams.get('businessId'));
  if (!isStudioRequestOrigin(request) || !businessId) {
    return NextResponse.json({ error: 'This recording request is invalid.' }, { status: 403 });
  }
  const { business, userId } = await customerStudioScope(businessId);
  if (!['OWNER', 'ADMIN'].includes(business.organizationRole) || !['OWNER', 'ADMIN'].includes(business.businessRole)) {
    return NextResponse.json({ error: 'Only a business manager can add a knowledge recording.' }, { status: 403 });
  }
  const thread = url.searchParams.get('thread');
  if (thread !== null && !await studioOwnerThread(businessId, thread)) {
    return NextResponse.json({ error: 'Conversation is unavailable in this workspace.' }, { status: 403 });
  }
  if (request.headers.get('content-type') !== 'audio/wav') {
    return NextResponse.json({ error: 'Unsupported recording format.' }, { status: 415 });
  }
  const bytes = await readBoundedAudio(request, STUDIO_VOICE_MAX_BYTES);
  const duration = bytes && studioWaveDuration(bytes);
  if (!bytes || !duration) return NextResponse.json({ error: 'The recording is empty or exceeds the format or length limit.' }, { status: 422 });

  const organizationId = business.organizationId;
  try {
    if (!process.env.OPENAI_API_KEY) throw new Error('Transcription provider unavailable');
    await assertRuntimeOperationAllowed(organizationId, 'AI');
    const guard = await getCostGuardState(organizationId);
    if (!guard) throw new Error('Cost Guard unavailable');
    const limit = Number(guard.settings.max_voice_seconds);
    if (!Number.isFinite(limit) || limit < 1) throw new Error('Voice budget configuration unavailable');
    if (duration > limit) return NextResponse.json({ error: 'This workspace allows recordings up to '+limit+' seconds.' }, { status: 422 });

    const reservedUsd = estimateVoiceTranscriptionReserve(Math.ceil(duration));
    assertPaidOperationAllowed(guard, 'NORMAL');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const fingerprint = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    const operation = thread ? 'STUDIO_REPLY_TRANSCRIPTION' : 'STUDIO_KNOWLEDGE_TRANSCRIPTION';
    const reservation = await reserveCostGuardUsage({
      organizationId, provider: 'OPENAI', operation, reservedUsd,
      reservationKey: ['studio-audio', business.id, userId, thread ?? 'knowledge', fingerprint].join(':'),
      metadata: { duration_seconds: duration, automatic_retry: false },
    });
    if (reservation.replayed) {
      return NextResponse.json({ error: 'This recording was already submitted for transcription. Use its previous result or provide text.' }, { status: 409 });
    }
    const transcript = await transcribeWithOpenAI(bytes, 'audio/wav', AbortSignal.timeout(40_000));
    await finalizeCostGuardUsage({
      organizationId, reservationKey: reservation.key, state: 'SETTLED', actualCostUsd: reservedUsd, units: 1,
    });
    return NextResponse.json({ text: transcript.text });
  } catch {
    return NextResponse.json({ error: 'Transcription could not finish. Keep your recording. You can use the text or file option if the result is unavailable.' }, { status: 503 });
  }
}
