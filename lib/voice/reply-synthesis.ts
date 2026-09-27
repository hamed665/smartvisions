const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_TTS_VOICE = 'marin';
const MAX_TTS_INPUT_CHARS = 4096;
const MAX_WHATSAPP_AUDIO_BYTES = 16 * 1024 * 1024;

const BUILT_IN_VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
]);

export type VoiceReplySynthesisConfig = {
  model: string;
  voice: string;
};

export type SynthesizedVoiceReply = VoiceReplySynthesisConfig & {
  bytes: ArrayBuffer;
  mimeType: 'audio/mpeg';
  responseFormat: 'mp3';
};

export function resolveVoiceReplySynthesisConfig(
  env: NodeJS.ProcessEnv = process.env,
): VoiceReplySynthesisConfig {
  const model = env.OPENAI_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL;
  const voice = env.OPENAI_TTS_VOICE?.trim() || DEFAULT_TTS_VOICE;
  if (model !== 'gpt-4o-mini-tts' && !model.startsWith('gpt-4o-mini-tts-')) {
    throw new Error('Controlled voice reply requires the approved GPT-4o Mini TTS model family');
  }
  if (!BUILT_IN_VOICES.has(voice)) {
    throw new Error('Controlled voice reply requires an approved built-in TTS voice');
  }
  return { model, voice };
}

export function normalizeVoiceReplyText(value: string) {
  const text = value.trim();
  if (!text) throw new Error('Voice reply text is required');
  if (text.length > MAX_TTS_INPUT_CHARS) {
    throw new Error(`Voice reply text exceeds ${MAX_TTS_INPUT_CHARS} characters`);
  }
  return text;
}

export async function synthesizeOpenAiVoiceReply(input: {
  text: string;
  env?: NodeJS.ProcessEnv;
}): Promise<SynthesizedVoiceReply> {
  const env = input.env ?? process.env;
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const text = normalizeVoiceReplyText(input.text);
  const config = resolveVoiceReplySynthesisConfig(env);

  // OpenAI's current Speech API contract supports MP3 output. We deliberately
  // use MP3 for the controlled foundation because Meta accepts audio/mpeg
  // without relying on voice-note-specific OGG/Opus container semantics.
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      voice: config.voice,
      input: text,
      response_format: 'mp3',
      instructions: 'Speak naturally, clearly, and professionally. Preserve the language and wording of the input. Do not add or omit content.',
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI voice synthesis failed (${response.status}): ${detail.slice(0, 400)}`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_WHATSAPP_AUDIO_BYTES) {
    throw new Error('Generated voice reply exceeds the WhatsApp 16 MB audio limit');
  }
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('OpenAI voice synthesis returned empty audio');
  if (bytes.byteLength > MAX_WHATSAPP_AUDIO_BYTES) {
    throw new Error('Generated voice reply exceeds the WhatsApp 16 MB audio limit');
  }

  return {
    ...config,
    bytes,
    mimeType: 'audio/mpeg',
    responseFormat: 'mp3',
  };
}
