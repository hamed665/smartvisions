import type { WebsiteAuditResult } from '@/lib/audit/types';

export type OfferInput = {
  hasWebsite: boolean;
  audit?: WebsiteAuditResult;
  socialWeak?: boolean;
  whatsappHeavy?: boolean;
  multipleWeaknesses?: boolean;
};

export type OfferRecommendation = {
  primary: 'business_website' | 'premium_bilingual_website' | 'ai_content' | 'whatsapp_ai_setup' | 'growth_package' | 'skip';
  secondary?: string;
  reasons: string[];
};

export function recommendOffer(input: OfferInput): OfferRecommendation {
  if (!input.hasWebsite) {
    return { primary: 'business_website', reasons: ['No official website detected'] };
  }

  if (input.multipleWeaknesses) {
    return { primary: 'growth_package', reasons: ['Multiple meaningful growth gaps detected'] };
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

  if (input.socialWeak) {
    return { primary: 'ai_content', reasons: ['Website is acceptable but social/content presence is weak'] };
  }

  if (input.whatsappHeavy) {
    return { primary: 'whatsapp_ai_setup', reasons: ['Business appears highly dependent on WhatsApp conversations'] };
  }

  return { primary: 'skip', reasons: ['No strong, evidence-backed offer fit detected'] };
}
