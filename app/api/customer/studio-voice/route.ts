import { NextResponse } from 'next/server';
import { customerStudioScope } from '@/lib/access/customer-studio';
import { normalizeCustomerBusinessId } from '@/lib/access/customer-business-scope';
import { assertPaidOperationAllowed, finalizeCostGuardUsage, getCostGuardState, reserveCostGuardUsage } from '@/lib/reliability/cost-guard';
import { assertRuntimeOperationAllowed } from '@/lib/reliability/runtime-safety';
import { estimateVoiceTranscriptionReserve, transcribeWithOpenAI } from '@/lib/voice/transcription';
import { STUDIO_VOICE_MAX_BYTES, studioWaveDuration } from '@/lib/voice/studio-wave';

async function readAudio(request: Request) {
  const stream = request.body?.getReader();
  if (!stream) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await stream.read();
      if (done) break;
      size += value.byteLength;
      if (size > STUDIO_VOICE_MAX_BYTES) {
        await stream.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    stream.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const businessId = normalizeCustomerBusinessId(url.searchParams.get('businessId'));
  if (request.headers.get('origin') !== url.origin || !businessId) {
    return NextResponse.json({ error: 'This recording request is invalid.' }, { status: 403 });
  }
  const { business } = await customerStudioScope(businessId);
  if (!['OWNER', 'ADMIN'].includes(business.organizationRole) || !['OWNER', 'ADMIN'].includes(business.businessRole)) {
    return NextResponse.json({ error: 'Only a business manager can add a knowledge recording.' }, { status: 403 });
  }
  if (request.headers.get('content-type') !== 'audio/wav') {
    return NextResponse.json({ error: 'Unsupported recording format.' }, { status: 415 });
  }
  const bytes = await readAudio(request);
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
    const reservation = await reserveCostGuardUsage({
      organizationId, provider: 'OPENAI', operation: 'STUDIO_KNOWLEDGE_TRANSCRIPTION', reservedUsd,
      metadata: { duration_seconds: duration, automatic_retry: false },
    });
    const transcript = await transcribeWithOpenAI(bytes, 'audio/wav', AbortSignal.timeout(40_000));
    await finalizeCostGuardUsage({
      organizationId, reservationKey: reservation.key, state: 'SETTLED', actualCostUsd: reservedUsd, units: 1,
    });
    return NextResponse.json({ text: transcript.text });
  } catch {
    return NextResponse.json({ error: 'Transcription could not finish. Keep your recording and try again when the service is available.' }, { status: 503 });
  }
}
