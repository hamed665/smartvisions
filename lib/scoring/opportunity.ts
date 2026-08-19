import type { WebsiteAuditResult } from '@/lib/audit/types';

export type OpportunityInput = {
  hasWebsite: boolean;
  audit?: WebsiteAuditResult;
  activeSocial?: boolean;
};

export function scoreOpportunity(input: OpportunityInput) {
  let score = 0;
  const reasons: string[] = [];
  const add = (condition: boolean, points: number, reason: string) => {
    if (!condition) return;
    score += points;
    reasons.push(`${reason} +${points}`);
  };

  add(!input.hasWebsite, 30, 'No website');
  add(Boolean(input.audit && input.audit.mobileQuality === 'POOR'), 20, 'Poor mobile experience');
  add(Boolean(input.audit && !input.audit.hasArabic), 15, 'No Arabic experience');
  add(Boolean(input.audit && !input.audit.hasBooking), 10, 'No booking flow');
  add(Boolean(input.audit && input.audit.ctaQuality === 'POOR'), 10, 'Weak CTA');
  add(Boolean(input.audit && input.audit.seoQuality === 'POOR'), 10, 'Weak SEO basics');
  add(Boolean(input.audit && input.audit.brokenLinks > 0), 5, 'Broken links');
  add(Boolean(input.activeSocial), 5, 'Active business/social signal');

  const normalized = Math.min(100, score);
  return {
    score: normalized,
    reasons,
    priority: normalized >= 75 ? 'A' : normalized >= 55 ? 'B' : normalized >= 35 ? 'C' : 'SKIP',
  } as const;
}
