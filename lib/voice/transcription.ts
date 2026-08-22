import { createClient } from '@supabase/supabase-js';
import { evaluateBudgetMode, getCostGuardState, recordUsage, shouldAllowPaidOperation } from '@/lib/reliability/cost-guard';

const TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
const TRANSCRIPTION_USD_PER_MINUTE = 0.003;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const PROCESSING_LEASE_MS = 10 * 60 * 1000;

type VoiceTranscriptionRow = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  conversation_id: string | null;
  provider_message_id: string;
  media_id: string;
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  transcript: string | null;
  detected_language: string | null;
  model: string | null;
  estimated_cost_usd: number;
  error_message: string | null;
  updated_at: string;
};

export type VoiceTranscriptionResult = {
  id: string;
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  transcript?: string;
  detectedLanguage?: string;
  cached: boolean;
  estimatedCostUsd: number;
  error?: string;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for voice transcription');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function estimateVoiceTranscriptionReserve(maxVoiceSeconds: number) {
  const boundedSeconds = Math.max(1, Math.min(3600, Math.floor(maxVoiceSeconds || 0)));
  return Number(((boundedSeconds / 60) * TRANSCRIPTION_USD_PER_MINUTE).toFixed(6));
}

export function extensionForMimeType(mimeType?: string) {
  const normalized = (mimeType || '').toLowerCase();
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('webm')) return 'webm';
  return 'bin';
}

export function voiceCacheAction(status: VoiceTranscriptionRow['status'], updatedAt: string, nowMs = Date.now()) {
  if (status === 'SUCCEEDED') return 'RETURN' as const;
  if (status === 'FAILED') return 'RETRY' as const;
  const updatedMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedMs) || nowMs - updatedMs >= PROCESSING_LEASE_MS) return 'RETRY' as const;
  return 'RETURN' as const;
}

async function findCached(organizationId: string, providerMessageId: string, mediaId: string) {
  const supabase = serviceClient();
  const byMessage = await supabase
    .from('voice_transcriptions')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  if (byMessage.error) throw new Error(`Voice cache lookup failed: ${byMessage.error.message}`);
  if (byMessage.data) return byMessage.data as VoiceTranscriptionRow;

  const byMedia = await supabase
    .from('voice_transcriptions')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('media_id', mediaId)
    .maybeSingle();
  if (byMedia.error) throw new Error(`Voice media cache lookup failed: ${byMedia.error.message}`);
  return (byMedia.data as VoiceTranscriptionRow | null) ?? null;
}

function cachedResult(row: VoiceTranscriptionRow): VoiceTranscriptionResult {
  return {
    id: row.id,
    status: row.status,
    ...(row.transcript ? { transcript: row.transcript } : {}),
    ...(row.detected_language ? { detectedLanguage: row.detected_language } : {}),
    cached: true,
    estimatedCostUsd: Number(row.estimated_cost_usd || 0),
    ...(row.error_message ? { error: row.error_message } : {}),
  };
}

async function reclaimCached(row: VoiceTranscriptionRow) {
  const supabase = serviceClient();
  const now = new Date().toISOString();
  let query = supabase
    .from('voice_transcriptions')
    .update({ status: 'PROCESSING', error_message: null, completed_at: null, updated_at: now })
    .eq('id', row.id)
    .eq('status', row.status);
  if (row.status === 'PROCESSING') query = query.eq('updated_at', row.updated_at);
  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw new Error(`Voice cache reclaim failed: ${error.message}`);
  return (data as VoiceTranscriptionRow | null) ?? null;
}

async function downloadMetaVoice(mediaId: string, fallbackMimeType?: string) {
  const token = process.env.META_WHATSAPP_TOKEN;
  const graphVersion = process.env.META_GRAPH_VERSION;
  if (!token || !graphVersion) throw new Error('Meta WhatsApp media credentials are not configured');

  const metadataResponse = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metadataResponse.ok) {
    const detail = await metadataResponse.text();
    throw new Error(`Meta media lookup failed (${metadataResponse.status}): ${detail.slice(0, 300)}`);
  }
  const metadata = await metadataResponse.json() as { url?: string; mime_type?: string; file_size?: number };
  if (!metadata.url) throw new Error('Meta media lookup did not return a download URL');
  if (metadata.file_size && metadata.file_size > MAX_MEDIA_BYTES) throw new Error('Voice media exceeds the 25 MB transcription limit');

  const mediaResponse = await fetch(metadata.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!mediaResponse.ok) throw new Error(`Meta media download failed (${mediaResponse.status})`);
  const contentLength = Number(mediaResponse.headers.get('content-length') || 0);
  if (contentLength > MAX_MEDIA_BYTES) throw new Error('Voice media exceeds the 25 MB transcription limit');
  const bytes = await mediaResponse.arrayBuffer();
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error('Voice media exceeds the 25 MB transcription limit');

  return { bytes, mimeType: metadata.mime_type || fallbackMimeType || 'application/octet-stream' };
}

async function transcribeWithOpenAI(bytes: ArrayBuffer, mimeType: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const form = new FormData();
  form.set('model', TRANSCRIPTION_MODEL);
  form.set('file', new Blob([bytes], { type: mimeType }), `voice.${extensionForMimeType(mimeType)}`);
  form.set('response_format', 'json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI transcription failed (${response.status}): ${detail.slice(0, 400)}`);
  }
  const body = await response.json() as { text?: string; language?: string };
  const text = body.text?.trim();
  if (!text) throw new Error('OpenAI transcription returned no text');
  return { text, language: body.language };
}

export async function transcribeWhatsAppVoiceOnce(input: {
  organizationId: string;
  providerMessageId: string;
  mediaId: string;
  mimeType?: string;
  leadId?: string;
  conversationId?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
}): Promise<VoiceTranscriptionResult> {
  const cached = await findCached(input.organizationId, input.providerMessageId, input.mediaId);
  let row: VoiceTranscriptionRow | null = null;
  if (cached) {
    if (voiceCacheAction(cached.status, cached.updated_at) === 'RETURN') return cachedResult(cached);
    row = await reclaimCached(cached);
    if (!row) {
      const raced = await findCached(input.organizationId, input.providerMessageId, input.mediaId);
      if (raced) return cachedResult(raced);
      throw new Error('Voice cache retry reservation was lost');
    }
  }

  const costState = await getCostGuardState(input.organizationId);
  if (!costState) throw new Error('Cost guard state is unavailable; voice transcription blocked');
  const reserve = estimateVoiceTranscriptionReserve(costState.settings.max_voice_seconds);
  const projected = evaluateBudgetMode(costState.monthSpendUsd + reserve, costState.settings);
  if (!shouldAllowPaidOperation(projected.mode, input.priority || 'NORMAL')) {
    throw new Error(`Voice transcription blocked by projected cost guard (${projected.mode})`);
  }

  const supabase = serviceClient();
  if (!row) {
    const insert = await supabase
      .from('voice_transcriptions')
      .insert({
        organization_id: input.organizationId,
        lead_id: input.leadId ?? null,
        conversation_id: input.conversationId ?? null,
        provider_message_id: input.providerMessageId,
        media_id: input.mediaId,
        mime_type: input.mimeType ?? null,
        status: 'PROCESSING',
        model: TRANSCRIPTION_MODEL,
        estimated_cost_usd: reserve,
      })
      .select('*')
      .single();

    if (insert.error) {
      if (insert.error.code === '23505') {
        const raced = await findCached(input.organizationId, input.providerMessageId, input.mediaId);
        if (raced) return cachedResult(raced);
      }
      throw new Error(`Voice cache reservation failed: ${insert.error.message}`);
    }
    row = insert.data as VoiceTranscriptionRow;
  }

  let providerAccepted = false;
  try {
    const media = await downloadMetaVoice(input.mediaId, input.mimeType);
    const transcription = await transcribeWithOpenAI(media.bytes, media.mimeType);
    providerAccepted = true;

    const completed = await supabase
      .from('voice_transcriptions')
      .update({
        status: 'SUCCEEDED',
        transcript: transcription.text,
        detected_language: transcription.language ?? null,
        mime_type: media.mimeType,
        error_message: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (completed.error) throw new Error(`Voice cache completion failed: ${completed.error.message}`);

    await recordUsage({
      organizationId: input.organizationId,
      provider: 'OPENAI',
      operation: 'VOICE_TRANSCRIPTION',
      costUsd: reserve,
      units: 1,
      leadId: input.leadId,
      metadata: {
        provider_message_id: input.providerMessageId,
        media_id: input.mediaId,
        model: TRANSCRIPTION_MODEL,
        pricing_status: 'CONSERVATIVE_MAX_DURATION_ESTIMATE',
        max_voice_seconds: costState.settings.max_voice_seconds,
      },
    });

    return {
      id: row.id,
      status: 'SUCCEEDED',
      transcript: transcription.text,
      ...(transcription.language ? { detectedLanguage: transcription.language } : {}),
      cached: false,
      estimatedCostUsd: reserve,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown voice transcription failure';
    if (!providerAccepted) {
      await supabase
        .from('voice_transcriptions')
        .update({ status: 'FAILED', error_message: message.slice(0, 1000), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', row.id);
    } else {
      await supabase
        .from('voice_transcriptions')
        .update({ error_message: `POST_PROVIDER_RECONCILIATION_REQUIRED: ${message}`.slice(0, 1000), updated_at: new Date().toISOString() })
        .eq('id', row.id);
    }
    throw error;
  }
}
