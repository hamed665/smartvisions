import { describe, expect, it } from 'vitest';
import { estimateVoiceTranscriptionReserve, extensionForMimeType } from '@/lib/voice/transcription';

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
});
