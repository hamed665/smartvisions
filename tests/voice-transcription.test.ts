import { describe, expect, it } from 'vitest';
import {
  estimateVoiceTranscriptionReserve,
  extensionForMimeType,
  resolveMetaVoiceConfig,
  voiceCacheAction,
} from '@/lib/voice/transcription';

describe('voice transcription cost controls', () => {
  it('reserves against the configured maximum voice duration', () => {
    expect(estimateVoiceTranscriptionReserve(60)).toBe(0.003);
    expect(estimateVoiceTranscriptionReserve(120)).toBe(0.006);
  });

  it('never reserves zero and caps pathological configuration at one hour', () => {
    expect(estimateVoiceTranscriptionReserve(0)).toBe(0.00005);
    expect(estimateVoiceTranscriptionReserve(999999)).toBe(0.18);
  });

  it('maps common WhatsApp audio mime types to safe filenames', () => {
    expect(extensionForMimeType('audio/ogg; codecs=opus')).toBe('ogg');
    expect(extensionForMimeType('audio/mpeg')).toBe('mp3');
    expect(extensionForMimeType('audio/mp4')).toBe('m4a');
    expect(extensionForMimeType('audio/webm')).toBe('webm');
    expect(extensionForMimeType(undefined)).toBe('bin');
  });

  it('uses the same Meta token aliases and graph-version default as the WhatsApp provider', () => {
    expect(resolveMetaVoiceConfig({ NODE_ENV: 'test', META_WHATSAPP_ACCESS_TOKEN: ' preferred ' })).toEqual({
      token: 'preferred',
      graphVersion: 'v23.0',
    });
    expect(resolveMetaVoiceConfig({ NODE_ENV: 'test', META_WHATSAPP_TOKEN: 'legacy', META_GRAPH_VERSION: 'v99.0' })).toEqual({
      token: 'legacy',
      graphVersion: 'v99.0',
    });
    expect(resolveMetaVoiceConfig({ NODE_ENV: 'test', WHATSAPP_ACCESS_TOKEN: 'fallback' })).toEqual({
      token: 'fallback',
      graphVersion: 'v23.0',
    });
  });

  it('retries failed rows and stale processing leases but not fresh work', () => {
    const now = Date.parse('2026-08-22T12:00:00Z');
    expect(voiceCacheAction('SUCCEEDED', '2026-08-22T11:00:00Z', now)).toBe('RETURN');
    expect(voiceCacheAction('FAILED', '2026-08-22T11:59:00Z', now)).toBe('RETRY');
    expect(voiceCacheAction('PROCESSING', '2026-08-22T11:55:00Z', now)).toBe('RETURN');
    expect(voiceCacheAction('PROCESSING', '2026-08-22T11:40:00Z', now)).toBe('RETRY');
  });

  it('never retries a stale processing row after OpenAI already accepted the paid transcription', () => {
    const now = Date.parse('2026-08-22T12:30:00Z');
    expect(voiceCacheAction(
      'PROCESSING',
      '2026-08-22T11:00:00Z',
      now,
      'POST_PROVIDER_RECONCILIATION_REQUIRED: usage ledger unavailable',
    )).toBe('RETURN');
  });
});
