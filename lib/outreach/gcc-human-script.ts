export type GccMarketCode = 'OM' | 'AE' | 'SA' | 'QA';

const clean = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ');

function serviceFocusArabic(serviceId?: string | null) {
  const id = clean(serviceId).toLowerCase();
  if (id.includes('seo')) return 'الظهور في Google وجذب عملاء محليين';
  if (id.includes('website')) return 'الموقع وتحويل الزيارات إلى استفسارات';
  if (id.includes('content') || id.includes('reel')) return 'المحتوى والريلز وجذب تفاعل أقوى';
  if (id.includes('whatsapp')) return 'تنظيم محادثات WhatsApp وتحويلها إلى فرص بيع';
  if (id.includes('automation') || id.includes('agent')) return 'الأتمتة وتقليل العمل اليدوي';
  return 'الحضور الرقمي وتحويله إلى فرص عملاء أكثر';
}

function serviceFocusEnglish(serviceId?: string | null) {
  const id = clean(serviceId).toLowerCase();
  if (id.includes('seo')) return 'Google visibility and local customer acquisition';
  if (id.includes('website')) return 'your website and converting visits into enquiries';
  if (id.includes('content') || id.includes('reel')) return 'content, reels and stronger engagement';
  if (id.includes('whatsapp')) return 'WhatsApp conversations and turning them into sales opportunities';
  if (id.includes('automation') || id.includes('agent')) return 'automation and reducing manual work';
  return 'your digital presence and converting it into more customer opportunities';
}

const ARABIC_OPENERS: Record<GccMarketCode, (name: string, focus: string) => string> = {
  OM: (name, focus) => `هلا فريق ${name}، معكم Smart Visions. لاحظنا فرصة بسيطة ممكن تساعدكم في ${focus}. إذا مناسب لكم، أرسل لكم الملاحظة باختصار هنا؟`,
  AE: (name, focus) => `مرحبا فريق ${name}، معكم Smart Visions. لاحظنا فرصة واضحة ممكن تساعدكم في ${focus}. إذا يناسبكم، أشارككم الفكرة باختصار هنا؟`,
  SA: (name, focus) => `السلام عليكم فريق ${name}، معكم Smart Visions. لاحظنا فرصة ممكن تفيدكم في ${focus}. إذا مناسب، أشارككم الملاحظة بشكل مختصر هنا؟`,
  QA: (name, focus) => `مرحبا فريق ${name}، معكم Smart Visions. لاحظنا فرصة ممكن تساعدكم في ${focus}. إذا مناسب لكم، أرسل الفكرة باختصار هنا؟`,
};

export function buildGccHumanOpener(input: {
  marketCode: string | null | undefined;
  businessName: string | null | undefined;
  primaryServiceId?: string | null;
}) {
  const marketCode = clean(input.marketCode).toUpperCase() as GccMarketCode;
  if (!['OM', 'AE', 'SA', 'QA'].includes(marketCode)) return null;
  const businessName = clean(input.businessName).slice(0, 120) || 'الفريق';
  const arabic = ARABIC_OPENERS[marketCode](businessName, serviceFocusArabic(input.primaryServiceId));
  const english = `Hi ${businessName} team, this is Smart Visions. We noticed a practical opportunity around ${serviceFocusEnglish(input.primaryServiceId)}. If useful, I can share the observation briefly here.`;
  return {
    marketCode,
    mode: 'HUMAN_SEND_ONLY' as const,
    arabic,
    english,
    requiresHumanSend: true as const,
    automatedSendAllowed: false as const,
  };
}
