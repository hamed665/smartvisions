import { describe, expect, it } from 'vitest';
import {
  normalizeVoiceReplyText,
  resolveVoiceReplySynthesisConfig,
} from '@/lib/voice/reply-synthesis';

describe('OMNI-VOICE reply synthesis contract', () => {
  it('uses the approved current TTS family and built-in voice by default', () => {
    expect(resolveVoiceReplySynthesisConfig({} as NodeJS.ProcessEnv)).toEqual({
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
    });
  });

  it('accepts a pinned GPT-4o Mini TTS snapshot but rejects other models', () => {
    expect(resolveVoiceReplySynthesisConfig({
      NODE_ENV: 'test',
      OPENAI_TTS_MODEL: 'gpt-4o-mini-tts-2025-12-15',
      OPENAI_TTS_VOICE: 'cedar',
    })).toEqual({
      model: 'gpt-4o-mini-tts-2025-12-15',
      voice: 'cedar',
    });

    expect(() => resolveVoiceReplySynthesisConfig({
      NODE_ENV: 'test',
      OPENAI_TTS_MODEL: 'custom-voice-clone',
    })).toThrow('approved GPT-4o Mini TTS model family');
  });

  it('rejects custom or unknown voice identifiers', () => {
    expect(() => resolveVoiceReplySynthesisConfig({
      NODE_ENV: 'test',
      OPENAI_TTS_VOICE: 'voice_custom_123',
    })).toThrow('approved built-in TTS voice');
  });

  it('bounds and normalizes synthesis text', () => {
    expect(normalizeVoiceReplyText('  مرحبا  ')).toBe('مرحبا');
    expect(() => normalizeVoiceReplyText('   ')).toThrow('required');
    expect(() => normalizeVoiceReplyText('x'.repeat(4097))).toThrow('4096');
  });
});
