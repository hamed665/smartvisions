import { describe, expect, it } from 'vitest';
import { studioReplyAudio } from '@/lib/voice/studio-reply-audio';
import { studioAudioEvidence, studioAudioRange } from '@/lib/voice/studio-media';

describe('Studio audio replies', () => {
  it('accepts an Opus Ogg header and blocks mislabeled WebM and non-Opus Ogg', () => {
    const ogg = new Uint8Array(64);
    ogg.set(new TextEncoder().encode('OggS'));
    ogg[26] = 1;
    ogg[27] = 19;
    ogg.set(new TextEncoder().encode('OpusHead'), 28);
    expect(studioReplyAudio(ogg.buffer, 'audio/ogg; codecs=opus')?.filename).toBe('voice.ogg');
    expect(studioReplyAudio(ogg.buffer, 'audio/webm')).toBeNull();
    ogg[28] = 0;
    expect(studioReplyAudio(ogg.buffer, 'audio/ogg')).toBeNull();
  });

  it('requires matching tenant and binding evidence before resolving a provider media id', () => {
    const row = {
      metadata: { source: 'META_WHATSAPP_WEBHOOK', tenant_business_id: 'business', communication_channel_binding_id: 'binding',
        media_id: '123456', mime_type: 'audio/ogg; codecs=opus' },
      direction: 'INBOUND', sourcePlane: 'META_WHATSAPP', mediaType: 'VOICE', providerMessageId: 'wamid.fixture',
    };
    expect(studioAudioEvidence(row, 'business', 'binding')).toEqual({ mediaId: '123456', mimeType: 'audio/ogg' });
    expect(studioAudioEvidence(row, 'other', 'binding')).toBeNull();
    expect(studioAudioEvidence(row, 'business', 'other')).toBeNull();
    expect(studioAudioEvidence({ ...row, sourcePlane: 'SMART_CORE' }, 'business', 'binding')).toBeNull();
  });

  it('supports Safari-style probe and suffix ranges without accepting invalid or multipart ranges', () => {
    expect(studioAudioRange('bytes=0-1', 100)).toEqual({ start: 0, end: 1 });
    expect(studioAudioRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(studioAudioRange('bytes=30-', 100)).toEqual({ start: 30, end: 99 });
    expect(studioAudioRange('bytes=100-', 100)).toBeNull();
    expect(studioAudioRange('bytes=0-1,30-40', 100)).toBeNull();
  });
});
