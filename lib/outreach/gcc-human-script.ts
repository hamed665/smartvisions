import { buildCanonicalFirstTouchDraft } from './message-plan';

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
  OM: (name, focus) => `هلا فريق ${name}، معكم Smart Visions. نساعد الأعمال في ${focus}. إذا مناسب لكم، أرسل لكم فكرة باختصار هنا؟`,
  AE: (name, focus) => `مرحبا فريق ${name}، معكم Smart Visions. نساعد الأعمال في ${focus}. إذا يناسبكم، أشارككم فكرة باختصار هنا؟`,
  SA: (name, focus) => `السلام عليكم فريق ${name}، معكم Smart Visions. نساعد الأعمال في ${focus}. إذا مناسب، أشارككم فكرة بشكل مختصر هنا؟`,
  QA: (name, focus) => `مرحبا فريق ${name}، معكم Smart Visions. نساعد الأعمال في ${focus}. إذا مناسب لكم، أرسل فكرة باختصار هنا؟`,
};

export function buildGccHumanOpener(input: {
  marketCode: string | null | undefined;
  businessName: string | null | undefined;
  primaryServiceId?: string | null;
  industry?: string | null;
  evidence?: string[];
}) {
  const marketCode = clean(input.marketCode).toUpperCase() as GccMarketCode;
  if (!['OM', 'AE', 'SA', 'QA'].includes(marketCode)) return null;
  const businessName = clean(input.businessName).slice(0, 120) || 'الفريق';
  let arabic = ARABIC_OPENERS[marketCode](businessName, serviceFocusArabic(input.primaryServiceId));
  let english = `Hi ${businessName} team, this is Smart Visions. We help businesses with ${serviceFocusEnglish(input.primaryServiceId)}. May I share a brief idea here?`;
  let evidenceBased = false;
  if (input.evidence?.length && input.primaryServiceId) {
    try {
      const draft = buildCanonicalFirstTouchDraft({ marketCode, businessName, industry: input.industry ?? undefined,
        evidence: input.evidence, recommendedOffer: input.primaryServiceId });
      // Render both languages even when the non-Oman plan chooses a single language.
      const bilingual = marketCode === 'OM' ? draft : buildCanonicalFirstTouchDraft({ marketCode: 'OM', businessName,
        industry: input.industry ?? undefined, evidence: input.evidence, recommendedOffer: input.primaryServiceId });
      arabic = `معكم Smart Visions. ${bilingual.sections.arabic}`;
      english = `This is Smart Visions. ${bilingual.sections.english}`;
      evidenceBased = true;
    } catch {
      // Unknown evidence must not be converted into a personalized factual claim.
    }
  }
  return {
    marketCode,
    mode: 'HUMAN_SEND_ONLY' as const,
    arabic,
    english,
    evidenceBased,
    requiresHumanSend: true as const,
    automatedSendAllowed: false as const,
  };
}
