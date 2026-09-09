import type { WebsiteAuditResult } from '@/lib/audit/types';

export type OfferInput = {
  hasWebsite: boolean;
  audit?: WebsiteAuditResult;
  socialWeak?: boolean;
  whatsappHeavy?: boolean;
  multipleWeaknesses?: boolean;
};

export type OfferRecommendation = {
  primary: 'business_website' | 'premium_bilingual_website' | 'ai_reels_4' | 'whatsapp_ai_setup' | 'skip';
  secondary?: 'whatsapp_ai_setup';
  reasons: string[];
};

export function recommendOffer(input: OfferInput): OfferRecommendation {
  if (!input.hasWebsite) {
    return { primary: 'business_website', reasons: ['No official website detected'] };
  }

  if (input.audit && (input.audit.mobileQuality === 'POOR' || input.audit.ctaQuality === 'POOR' || !input.audit.hasArabic)) {
    return {
      primary: 'premium_bilingual_website',
      secondary: input.whatsappHeavy ? 'whatsapp_ai_setup' : undefined,
      reasons: [
        input.audit.mobileQuality === 'POOR' ? 'Poor mobile experience' : '',
        input.audit.ctaQuality === 'POOR' ? 'Weak conversion path' : '',
        !input.audit.hasArabic ? 'No Arabic experience' : '',
      ].filter(Boolean),
    };
  }

  if (input.multipleWeaknesses) {
    return {
      primary: 'skip',
      reasons: ['Multiple growth gaps require the canonical evidence-backed service-fit engine; no bundle/service ID is invented here'],
    };
  }

  if (input.socialWeak) {
    return { primary: 'ai_reels_4', reasons: ['Verified social/content weakness supports a remote-deliverable canonical reels offer'] };
  }

  if (input.whatsappHeavy) {
    return { primary: 'whatsapp_ai_setup', reasons: ['Business appears highly dependent on WhatsApp conversations'] };
  }

  return { primary: 'skip', reasons: ['No strong, evidence-backed offer fit detected'] };
}
