const SAMPLE_RATE = 16_000;
export const STUDIO_VOICE_MAX_SECONDS = 300;
export const STUDIO_VOICE_MAX_BYTES = 44 + SAMPLE_RATE * 2 * STUDIO_VOICE_MAX_SECONDS;

export function studioWave(samples: Float32Array) {
  if (!samples.length || samples.length > SAMPLE_RATE * STUDIO_VOICE_MAX_SECONDS) throw new Error('Recording length is unsupported');
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  view.setUint32(0, 0x52494646);
  view.setUint32(4, buffer.byteLength - 8, true);
  view.setUint32(8, 0x57415645);
  view.setUint32(12, 0x666d7420);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461);
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  }
  return buffer;
}

export function studioWaveDuration(buffer: ArrayBuffer) {
  const size = buffer.byteLength;
  if (size <= 44 || size > STUDIO_VOICE_MAX_BYTES || size % 2 !== 0) return null;
  const view = new DataView(buffer);
  if (view.getUint32(0) !== 0x52494646 || view.getUint32(4, true) !== size - 8
    || view.getUint32(8) !== 0x57415645 || view.getUint32(12) !== 0x666d7420 || view.getUint32(16, true) !== 16
    || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== SAMPLE_RATE
    || view.getUint32(28, true) !== SAMPLE_RATE * 2 || view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16
    || view.getUint32(36) !== 0x64617461 || view.getUint32(40, true) !== size - 44) return null;
  return (size - 44) / (SAMPLE_RATE * 2);
}
