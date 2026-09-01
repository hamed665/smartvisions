import { LEGACY_TEST_TEMPLATE_IDS } from './templates';
import type { PreviewDocument, PreviewQualityResult } from './types';

const bannedPlaceholderPatterns = [/lorem ipsum/i, /your business/i, /company name/i, /sample text/i, /placeholder/i];

export function evaluatePreviewQuality(document: PreviewDocument): PreviewQualityResult {
  const blockers: string[] = [];
  const sectionKinds = new Set(document.sections.map((section) => section.kind));
  const localizedCopies = Object.values(document.localized).filter(Boolean);
  const joined = [
    document.businessName,
    document.headline,
    document.subheadline,
    ...localizedCopies.flatMap((copy) => [
      copy!.headline,
      copy!.subheadline,
      ...copy!.sections.flatMap((section) => [section.heading, section.body ?? '', ...(section.items ?? [])]),
    ]),
  ].join(' ');
  const rating = document.evidence.rating;
  const reviewCount = document.evidence.reviewCount;
  const hasEvidenceRating = rating !== undefined || reviewCount !== undefined;
  const evidenceRatingValid = !hasEvidenceRating || (
    typeof rating === 'number'
    && rating >= 1
    && rating <= 5
    && typeof reviewCount === 'number'
    && Number.isInteger(reviewCount)
    && reviewCount > 0
  );
  const bilingualComplete = document.language !== 'bilingual' || (
    document.availableLocales.includes('ar')
    && document.availableLocales.includes('en')
    && Boolean(document.localized.ar?.headline)
    && Boolean(document.localized.en?.headline)
  );

  const checks = {
    businessSpecific: document.businessName.trim().length >= 2,
    siteLanguageExplicit: ['customer', 'owner', 'internal_test'].includes(document.languageSource),
    noGenericPlaceholderCopy: !bannedPlaceholderPatterns.some((pattern) => pattern.test(joined)),
    customerGradeTemplate: document.design.customerFacing === true && !LEGACY_TEST_TEMPLATE_IDS.has(document.templateId),
    currentDesignSystem: document.design.referenceYear === 2026 && document.design.maxWidth >= 1180 && document.design.heroMinHeight >= 640,
    premiumTypography: document.design.typography.latin === 'manrope' && document.design.typography.arabic === 'noto-sans-arabic',
    mobileReady: document.design.mobileCta === 'sticky' || document.design.mobileCta === 'inline',
    clearHierarchy: document.headline.length >= 12 && document.subheadline.length >= 40,
    enoughSections: document.sections.length >= 5,
    conversionStructure: (sectionKinds.has('services') || sectionKinds.has('offer')) && sectionKinds.has('proof') && (sectionKinds.has('booking') || sectionKinds.has('location')),
    ctaPresent: document.primaryCta.trim().length >= 3,
    bilingualComplete,
    evidenceSafe: evidenceRatingValid,
    safeAssets: document.assetMode === 'verified_business_assets' || document.assetMode === 'safe_placeholders',
    disclaimerPresent: document.disclaimer.length >= 45,
    rtlConsistent: document.language !== 'ar' || document.direction === 'rtl',
  };

  if (!checks.businessSpecific) blockers.push('BUSINESS_SPECIFICITY_FAILED');
  if (!checks.siteLanguageExplicit) blockers.push('SITE_LANGUAGE_NOT_EXPLICIT');
  if (!checks.noGenericPlaceholderCopy) blockers.push('GENERIC_PLACEHOLDER_COPY');
  if (!checks.customerGradeTemplate) blockers.push('LEGACY_OR_NON_CUSTOMER_TEMPLATE');
  if (!checks.currentDesignSystem) blockers.push('OUTDATED_OR_WEAK_LAYOUT_TOKENS');
  if (!checks.premiumTypography) blockers.push('PREMIUM_TYPOGRAPHY_REQUIRED');
  if (!checks.mobileReady) blockers.push('MOBILE_READINESS_FAILED');
  if (!checks.clearHierarchy) blockers.push('WEAK_CONTENT_HIERARCHY');
  if (!checks.enoughSections) blockers.push('INSUFFICIENT_PREVIEW_DEPTH');
  if (!checks.conversionStructure) blockers.push('CONVERSION_STRUCTURE_INCOMPLETE');
  if (!checks.ctaPresent) blockers.push('CTA_REQUIRED');
  if (!checks.bilingualComplete) blockers.push('BILINGUAL_COPY_INCOMPLETE');
  if (!checks.evidenceSafe) blockers.push('UNVERIFIED_OR_INVALID_TRUST_EVIDENCE');
  if (!checks.safeAssets) blockers.push('UNSAFE_ASSET_MODE');
  if (!checks.disclaimerPresent) blockers.push('CONCEPT_DISCLAIMER_REQUIRED');
  if (!checks.rtlConsistent) blockers.push('RTL_INCONSISTENT');

  const score = Math.round((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);
  return { score, passed: blockers.length === 0 && score >= 90, blockers, checks };
}

export function previewSendGate(input: { quality: PreviewQualityResult; approved: boolean; expired?: boolean }) {
  if (!input.quality.passed) return { allowed: false, reason: 'QUALITY_GATE_FAILED' as const };
  if (!input.approved) return { allowed: false, reason: 'HUMAN_APPROVAL_REQUIRED' as const };
  if (input.expired) return { allowed: false, reason: 'PREVIEW_EXPIRED' as const };
  return { allowed: true, reason: 'PREVIEW_SEND_ALLOWED' as const };
}
