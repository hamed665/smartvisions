import { describe, expect, it } from 'vitest';
import { STUDIO_VOICE_MAX_BYTES, studioWave, studioWaveDuration } from '@/lib/voice/studio-wave';

describe('Studio recording format', () => {
  it('measures actual PCM samples and produces an exact five-minute bound', () => {
    expect(studioWaveDuration(studioWave(new Float32Array(16_000)))).toBe(1);
    const maximum = studioWave(new Float32Array(16_000 * 300));
    expect(maximum.byteLength).toBe(STUDIO_VOICE_MAX_BYTES);
    expect(studioWaveDuration(maximum)).toBe(300);
    expect(() => studioWave(new Float32Array(16_000 * 300 + 1))).toThrow();
  });

  it('rejects empty audio and forged metadata', () => {
    expect(studioWaveDuration(new ArrayBuffer(44))).toBeNull();
    const truncated = studioWave(new Float32Array(1000)).slice(0, -2);
    expect(studioWaveDuration(truncated)).toBeNull();
    const wrongSampleRate = studioWave(new Float32Array(1000));
    new DataView(wrongSampleRate).setUint32(24, 8_000, true);
    expect(studioWaveDuration(wrongSampleRate)).toBeNull();
  });
});
