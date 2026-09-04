import { describe, expect, it } from 'vitest';
import { detectLanguageZeroCost, resolveReplyLanguage } from '../lib/outreach/language-detection';

describe('zero-cost language detection', () => {
  it('detects Persian-specific script', () => {
    expect(detectLanguageZeroCost('قیمت سایت چقدر است؟').language).toBe('fa');
  });

  it('detects Urdu-specific script', () => {
    expect(detectLanguageZeroCost('آپ کیسے ہیں؟').language).toBe('ur');
  });

  it('detects Hindi only when Devanagari has Hindi lexical evidence', () => {
    expect(detectLanguageZeroCost('वेबसाइट की कीमत क्या है?').language).toBe('hi');
    expect(detectLanguageZeroCost('नमस्ते').language).toBe('unknown');
  });

  it('does not force ambiguous Arabic-script text to Arabic', () => {
    expect(detectLanguageZeroCost('سلام').language).toBe('unknown');
    expect(resolveReplyLanguage({ text: 'سلام', marketPrimaryLanguage: 'ar-OM' }).language).toBe('und');
    expect(detectLanguageZeroCost('مرحبا، ممكن أعرف السعر؟').language).toBe('ar');
  });

  it('does not pretend every Latin-script message is English', () => {
    expect(detectLanguageZeroCost('Hola, necesito ayuda con mi negocio').language).toBe('unknown');
    expect(detectLanguageZeroCost('Hi, I need help with my business').language).toBe('en');
  });

  it('does not use the market as an inbound language default for substantive mixed text', () => {
    const detected = detectLanguageZeroCost('ممكن price للموقع؟');
    expect(detected.language).toBe('mixed');
    expect(resolveReplyLanguage({ text: 'ممكن price للموقع؟', marketPrimaryLanguage: 'ar-OM' }).language).toBe('und');
  });

  it('uses the last clear customer language only for language-neutral turns', () => {
    expect(resolveReplyLanguage({ text: '👍', lastConversationLanguage: 'es' })).toMatchObject({
      language: 'es',
      source: 'CONVERSATION_MEMORY',
    });
  });

  it('respects an explicit language without any provider call', () => {
    expect(resolveReplyLanguage({ text: 'hello', explicitLanguage: 'ur' })).toMatchObject({ language: 'ur', source: 'EXPLICIT' });
  });
});
