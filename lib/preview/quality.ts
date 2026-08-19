import type { PreviewDocument, PreviewQualityResult } from './types';

const bannedPlaceholderPatterns = [/lorem ipsum/i, /your business/i, /company name/i, /sample text/i, /placeholder/i];

export function evaluatePreviewQuality(document: PreviewDocument): PreviewQualityResult {
  const blockers: string[] = [];
  const sectionKinds = new Set(document.sections.map((section) => section.kind));
  const joined = [document.businessName, document.headline, document.subheadline, ...document.sections.flatMap((section) => [section.heading, section.body ?? '', ...(section.items ?? [])])].join(' ');

  const checks = {
    businessSpecific: document.businessName.trim().length >= 2,
    noGenericPlaceholderCopy: !bannedPlaceholderPatterns.some((pattern) => pattern.test(joined)),
    modernTemplate: document.design.heroMinHeight >= 600 && document.design.maxWidth >= 1100 && document.design.radius >= 16,
    clearHierarchy: document.headline.length >= 12 && document.subheadline.length >= 30,
    enoughSections: document.sections.length >= 4,
    servicesPresent: sectionKinds.has('services'),
    ctaPresent: document.primaryCta.trim().length >= 3,
    disclaimerPresent: document.disclaimer.length >= 30,
    rtlConsistent: document.language !== 'ar' || document.direction === 'rtl',
  };

  if (!checks.businessSpecific) blockers.push('BUSINESS_SPECIFICITY_FAILED');
  if (!checks.noGenericPlaceholderCopy) blockers.push('GENERIC_PLACEHOLDER_COPY');
  if (!checks.modernTemplate) blockers.push('OUTDATED_OR_WEAK_LAYOUT_TOKENS');
  if (!checks.clearHierarchy) blockers.push('WEAK_CONTENT_HIERARCHY');
  if (!checks.enoughSections) blockers.push('INSUFFICIENT_PREVIEW_DEPTH');
  if (!checks.servicesPresent) blockers.push('SERVICES_SECTION_REQUIRED');
  if (!checks.ctaPresent) blockers.push('CTA_REQUIRED');
  if (!checks.disclaimerPresent) blockers.push('CONCEPT_DISCLAIMER_REQUIRED');
  if (!checks.rtlConsistent) blockers.push('RTL_INCONSISTENT');

  const score = Math.round((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);
  return { score, passed: blockers.length === 0 && score >= 85, blockers, checks };
}

export function previewSendGate(input: { quality: PreviewQualityResult; approved: boolean; expired?: boolean }) {
  if (!input.quality.passed) return { allowed: false, reason: 'QUALITY_GATE_FAILED' as const };
  if (!input.approved) return { allowed: false, reason: 'HUMAN_APPROVAL_REQUIRED' as const };
  if (input.expired) return { allowed: false, reason: 'PREVIEW_EXPIRED' as const };
  return { allowed: true, reason: 'PREVIEW_SEND_ALLOWED' as const };
}
