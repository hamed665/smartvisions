export type PreviewStrategy = 'NONE' | 'SHOW_PORTFOLIO' | 'CUSTOM_PREVIEW';

export function previewIntent(message: string) {
  const text = message.trim();
  const customPreviewRequested = /\b(preview|mockup|tailored concept|custom concept|custom design)\b|معاينة|موك.?اب|تصور مخصص|نموذج مخصص/i.test(text);
  const portfolioRequested = /\b(portfolio|past work|previous work|examples?|samples?|case studies?)\b|نمونه.?کار|نمونه‌ها|أعمال سابقة|اعمال سابقة|أمثلة|امثلة/i.test(text);
  return { customPreviewRequested, portfolioRequested };
}

export function decidePreviewStrategy(input: { message: string; approvedPortfolio?: string[] | null }): {
  strategy: PreviewStrategy;
  approvedExamples: string[];
} {
  const intent = previewIntent(input.message);
  const approvedExamples = (input.approvedPortfolio ?? []).filter((item) => String(item).trim()).slice(0, 3);

  if (intent.portfolioRequested && approvedExamples.length) {
    return { strategy: 'SHOW_PORTFOLIO', approvedExamples };
  }
  if (intent.customPreviewRequested) {
    return { strategy: 'CUSTOM_PREVIEW', approvedExamples };
  }
  return { strategy: 'NONE', approvedExamples };
}

export function draftOffersUnrequestedCustomPreview(input: { customerMessage: string; draft: string }) {
  if (previewIntent(input.customerMessage).customPreviewRequested) return false;
  const draft = input.draft.trim();
  if (!draft) return false;

  const englishOffer = /\b(?:i|we)\s+(?:can|could|will|would|can also)\s+(?:prepare|make|create|build|design|show|send)\b.{0,70}\b(?:custom\s+)?(?:preview|mockup|tailored concept|custom concept|custom design)\b/i;
  const arabicOffer = /(?:أقدر|اقدر|نقدر|يمكننا|ممكن)\s*.{0,55}(?:نسوي|نسوّي|نجهز|نجهّز|نصمم|نعمل|نرسل)?.{0,45}(?:معاينة|موك.?اب|تصور مخصص|نموذج مخصص)/i;
  const persianOffer = /(?:می.?تونم|می.?توانم|می.?تونیم|می.?توانیم)\s*.{0,55}(?:بساز|آماده|طراحی|ارسال)?.{0,45}(?:پیش.?نمایش|موک.?آپ|موکاپ|نمونه مخصص|طرح اختصاصی)/i;
  return englishOffer.test(draft) || arabicOffer.test(draft) || persianOffer.test(draft);
}
