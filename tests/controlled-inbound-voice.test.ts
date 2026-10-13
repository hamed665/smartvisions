import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ message: {} as Record<string, unknown>, transcribe: vi.fn(), provider: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: () => {
  const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
    maybeSingle: async () => ({ data: fixture.message, error: null }) };
  return { from: () => query };
} }));
vi.mock('@/lib/whatsapp/tenant-routing', () => ({ resolveMetaWhatsAppProvider: fixture.provider }));
vi.mock('@/lib/voice/transcription', () => ({ transcribeWhatsAppVoiceOnce: fixture.transcribe }));
vi.mock('@/lib/media/understanding', () => ({ analyzeCanonicalWhatsAppMediaOnce: vi.fn() }));
import { prepareLatestInboundMediaForAi } from '@/lib/media/preprocess';

describe('exact controlled inbound voice preparation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.message = { id: 'message-fixture', conversation_id: 'conversation-fixture', channel: 'WHATSAPP',
      direction: 'INBOUND', media_type: 'VOICE', provider_message_id: 'wamid.fixture',
      original_text: '[WhatsApp voice message]', transcript: null,
      metadata: { media_id: 'media-fixture', tenant_business_id: 'tenant-fixture',
        communication_channel_binding_id: 'binding-fixture', mime_type: 'audio/ogg' } };
    fixture.provider.mockResolvedValue({ bindingId: 'binding-fixture', accessToken: 'fixture-not-a-credential' });
    fixture.transcribe.mockResolvedValue({ status: 'SUCCEEDED', transcript: 'fixture transcript', cached: false });
  });
  const input = { organizationId: 'org-fixture', conversationId: 'conversation-fixture', expectedProviderMessageId: 'wamid.fixture' };
  it('blocks a newer/different inbound before any paid transcription or provider lookup', async () => {
    fixture.message.provider_message_id = 'wamid.another';
    await expect(prepareLatestInboundMediaForAi(input)).rejects.toThrow('EXPECTED_INBOUND_IS_NOT_CURRENT');
    expect(fixture.provider).not.toHaveBeenCalled();
    expect(fixture.transcribe).not.toHaveBeenCalled();
  });
  it('uses the tenant provider and requires the exact binding', async () => {
    fixture.provider.mockResolvedValue({ bindingId: 'wrong-binding' });
    await expect(prepareLatestInboundMediaForAi(input)).rejects.toThrow('VOICE_TENANT_PROVIDER_BINDING_MISMATCH');
    expect(fixture.transcribe).not.toHaveBeenCalled();
  });
  it.each(['PROCESSING', 'FAILED'])('rejects %s instead of interpreting the voice placeholder', async (status) => {
    fixture.transcribe.mockResolvedValue({ status, transcript: '' });
    await expect(prepareLatestInboundMediaForAi(input)).rejects.toThrow('VOICE_TRANSCRIPTION_NOT_READY');
  });
  it('accepts a successful canonical transcript and reuses its cache', async () => {
    expect(await prepareLatestInboundMediaForAi(input)).toMatchObject({ kind: 'VOICE', messageId: 'message-fixture', cached: false });
    fixture.message.transcript = 'fixture transcript';
    expect(await prepareLatestInboundMediaForAi(input)).toMatchObject({ kind: 'VOICE', cached: true });
    expect(fixture.transcribe).toHaveBeenCalledTimes(1);
  });
});
