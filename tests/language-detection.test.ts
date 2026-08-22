import { describe, expect, it } from 'vitest';
import { detectLanguageZeroCost, resolveReplyLanguage } from '../lib/outreach/language-detection';

describe('zero-cost language detection', () => {
  it('detects Persian-specific script', () => {
    expect(detectLanguageZeroCost('قیمت سایت چقدر است؟').language).toBe('fa');
  });

  it('detects Urdu-specific script', () => {
    expect(detectLanguageZeroCost('آپ کیسے ہیں؟').language).toBe('ur');
  });

  it('detects Hindi Devanagari', () => {
    expect(detectLanguageZeroCost('वेबसाइट की कीमत क्या है?').language).toBe('hi');
  });

  it('marks Arabic plus English as mixed and falls back safely', () => {
    const detected = detectLanguageZeroCost('ممكن price للموقع؟');
    expect(detected.language).toBe('mixed');
    expect(resolveReplyLanguage({ text: 'ممكن price للموقع؟', marketPrimaryLanguage: 'ar-OM' }).language).toBe('ar-OM');
  });

  it('respects an explicit language without any provider call', () => {
    expect(resolveReplyLanguage({ text: 'hello', explicitLanguage: 'ur' })).toMatchObject({ language: 'ur', source: 'EXPLICIT' });
  });
});
