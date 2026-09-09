export const SMART_VISIONS_BUSINESS_INTRO_OM = {
  name: 'smartvisions_business_intro_om',
  languageCode: 'ar',
  metaTemplateId: '1122493946873591',
} as const;

export function buildSmartVisionsBusinessIntroOm(businessName: string) {
  const name = businessName.trim();
  if (!name) throw new Error('Business name is required for the WhatsApp introduction template');

  return {
    templateName: SMART_VISIONS_BUSINESS_INTRO_OM.name,
    templateLanguageCode: SMART_VISIONS_BUSINESS_INTRO_OM.languageCode,
    templateBodyParameters: [name],
    preview: `هلا ${name} 👋
معك Smart Visions.

بناءً على اهتمامك بخدماتنا، عندنا اقتراح مختصر ممكن يساعد نشاطك في تحسين حضوره وجذب عملاء أكثر.

إذا حاب، نرسل لك التفاصيل هنا على واتساب.

Hi 👋
This is Smart Visions.

Based on your interest in our services, we have a short idea that could help improve your business presence and attract more customers.

If you’re interested, we can send you the details here on WhatsApp.

إذا ما يناسبك التواصل، خبرنا ونوقف الرسائل.`,
  };
}
