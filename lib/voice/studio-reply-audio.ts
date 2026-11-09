export const STUDIO_REPLY_AUDIO_LIMIT = 6 * 1024 * 1024;
export const STUDIO_REPLY_RECORDING_SECONDS = 180;
export const STUDIO_REPLY_RECORDING_FORMATS = ['audio/mp4;codecs=mp4a.40.2', 'audio/ogg;codecs=opus', 'audio/mp4'];

const format = {
  'audio/mpeg': 'voice.mp3',
  'audio/mp4': 'voice.m4a',
  'audio/ogg': 'voice.ogg',
} as const;

type AudioMime = keyof typeof format;

export function studioReplyAudioMime(value: string | null | undefined): AudioMime | null {
  const mime = value?.split(';', 1)[0]?.trim().toLowerCase();
  if (mime === 'audio/x-m4a') return 'audio/mp4';
  if (mime === 'audio/mp3') return 'audio/mpeg';
  return mime === 'audio/mpeg' || mime === 'audio/mp4' || mime === 'audio/ogg' ? mime : null;
}

export function studioReplyAudio(bytes: ArrayBuffer, contentType: string | null) {
  const mimeType = studioReplyAudioMime(contentType);
  if (!mimeType || bytes.byteLength < 32 || bytes.byteLength > STUDIO_REPLY_AUDIO_LIMIT) return null;
  const view = new DataView(bytes);
  let valid: boolean;
  if (mimeType === 'audio/mp4') {
    const header = view.getUint32(0);
    valid = header >= 16 && header <= bytes.byteLength && view.getUint32(4) === 0x66747970;
  } else if (mimeType === 'audio/ogg') {
    const segmentCount = view.getUint8(26);
    const opusOffset = 27 + segmentCount;
    valid = view.getUint32(0) === 0x4f676753 && view.getUint8(4) === 0 && segmentCount > 0
      && opusOffset + 19 <= bytes.byteLength && view.getUint32(opusOffset) === 0x4f707573
      && view.getUint32(opusOffset + 4) === 0x48656164;
  } else {
    const header = view.getUint16(0);
    valid = (header === 0x4944 && view.getUint8(2) === 0x33) || (header & 0xffe0) === 0xffe0;
  }
  return valid ? { bytes, mimeType, filename: format[mimeType] } : null;
}
