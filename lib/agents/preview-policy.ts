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
