import { describe, expect, it } from 'vitest';
import {
  buildSmartVisionsBusinessIntroOm,
  SMART_VISIONS_BUSINESS_INTRO_OM,
} from '@/lib/whatsapp/business-intro-template';

describe('Smart Visions Oman WhatsApp introduction template', () => {
  it('uses the active Meta template and exactly one business-name parameter', () => {
    const result = buildSmartVisionsBusinessIntroOm('Al Noor Dental Clinic');
    expect(SMART_VISIONS_BUSINESS_INTRO_OM).toEqual({
      name: 'smartvisions_business_intro_om',
      languageCode: 'ar',
      metaTemplateId: '1122493946873591',
    });
    expect(result.templateName).toBe('smartvisions_business_intro_om');
    expect(result.templateLanguageCode).toBe('ar');
    expect(result.templateBodyParameters).toEqual(['Al Noor Dental Clinic']);
    expect(result.preview).toBe(`هلا Al Noor Dental Clinic 👋
معك Smart Visions.

بناءً على اهتمامك بخدماتنا، عندنا اقتراح مختصر ممكن يساعد نشاطك في تحسين حضوره وجذب عملاء أكثر.

إذا حاب، نرسل لك التفاصيل هنا على واتساب.

Hi 👋
This is Smart Visions.

Based on your interest in our services, we have a short idea that could help improve your business presence and attract more customers.

If you’re interested, we can send you the details here on WhatsApp.

إذا ما يناسبك التواصل، خبرنا ونوقف الرسائل.`);
  });

  it('refuses an empty variable value', () => {
    expect(() => buildSmartVisionsBusinessIntroOm('   ')).toThrow(/Business name is required/);
  });
});
