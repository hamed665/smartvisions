import type { WebsiteAuditResult } from '@/lib/audit/types';
import { scoreOpportunity } from '@/lib/scoring/opportunity';
import { recommendOffer } from '@/lib/scoring/offer';

export type BusinessEvaluationInput = {
  hasWebsite: boolean;
  audit?: WebsiteAuditResult;
  activeSocial?: boolean;
  socialWeak?: boolean;
  whatsappHeavy?: boolean;
};

export function evaluateBusiness(input: BusinessEvaluationInput) {
  const multipleWeaknesses = Boolean(
    input.audit && [
      input.audit.mobileQuality === 'POOR',
      input.audit.ctaQuality === 'POOR',
      input.audit.seoQuality === 'POOR',
      !input.audit.hasArabic,
      !input.audit.hasBooking,
    ].filter(Boolean).length >= 3,
  );

  return {
    opportunity: scoreOpportunity({
      hasWebsite: input.hasWebsite,
      audit: input.audit,
      activeSocial: input.activeSocial,
    }),
    recommendation: recommendOffer({
      hasWebsite: input.hasWebsite,
      audit: input.audit,
      socialWeak: input.socialWeak,
      whatsappHeavy: input.whatsappHeavy,
      multipleWeaknesses,
    }),
  };
}
