export type PreviewVertical = 'dental' | 'beauty' | 'salon' | 'restaurant' | 'cafe' | 'pet_clinic' | 'real_estate' | 'corporate' | 'general';

export type PreviewInput = {
  businessName: string;
  vertical: PreviewVertical;
  countryCode: string;
  language: 'ar' | 'en';
  city?: string;
  services?: string[];
  phone?: string;
  whatsapp?: string;
  instagram?: string;
  logoUrl?: string;
  imageUrls?: string[];
  brandHint?: string;
  explicitRequest?: boolean;
  intentScore?: number;
};

export type PreviewSection = {
  kind: 'hero' | 'services' | 'proof' | 'gallery' | 'booking' | 'location' | 'offer';
  heading: string;
  body?: string;
  items?: string[];
};

export type PreviewDocument = {
  businessName: string;
  vertical: PreviewVertical;
  templateId: string;
  language: 'ar' | 'en';
  direction: 'rtl' | 'ltr';
  headline: string;
  subheadline: string;
  primaryCta: string;
  secondaryCta?: string;
  sections: PreviewSection[];
  design: {
    family: string;
    mood: string;
    radius: number;
    maxWidth: number;
    heroMinHeight: number;
    density: 'airy' | 'balanced';
  };
  assetMode: 'verified_business_assets' | 'safe_placeholders';
  disclaimer: string;
};

export type PreviewQualityResult = {
  score: number;
  passed: boolean;
  blockers: string[];
  checks: Record<string, boolean>;
};
