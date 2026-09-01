export type PreviewVertical =
  | 'dental'
  | 'clinic'
  | 'beauty'
  | 'salon'
  | 'restaurant'
  | 'cafe'
  | 'hospitality'
  | 'pet_clinic'
  | 'real_estate'
  | 'automotive'
  | 'fitness'
  | 'professional'
  | 'corporate'
  | 'general';

export type PreviewLocale = 'ar' | 'en';
export type SiteLanguage = PreviewLocale | 'bilingual';
export type SiteLanguageSource = 'customer' | 'owner' | 'internal_test';

export type PreviewInput = {
  businessName: string;
  vertical: PreviewVertical;
  countryCode: string;
  language: SiteLanguage;
  languageSource: SiteLanguageSource;
  city?: string;
  services?: string[];
  phone?: string;
  whatsapp?: string;
  instagram?: string;
  logoUrl?: string;
  imageUrls?: string[];
  brandHint?: string;
  categoryLabel?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  explicitRequest?: boolean;
  intentScore?: number;
};

export type PreviewSection = {
  kind: 'hero' | 'services' | 'proof' | 'gallery' | 'booking' | 'location' | 'offer';
  heading: string;
  body?: string;
  items?: string[];
};

export type PreviewLocalizedCopy = {
  locale: PreviewLocale;
  headline: string;
  subheadline: string;
  primaryCta: string;
  secondaryCta?: string;
  sections: PreviewSection[];
  disclaimer: string;
};

export type PreviewDocument = {
  businessName: string;
  vertical: PreviewVertical;
  templateId: string;
  language: SiteLanguage;
  languageSource: SiteLanguageSource;
  primaryLocale: PreviewLocale;
  availableLocales: PreviewLocale[];
  direction: 'rtl' | 'ltr';
  headline: string;
  subheadline: string;
  primaryCta: string;
  secondaryCta?: string;
  sections: PreviewSection[];
  localized: Partial<Record<PreviewLocale, PreviewLocalizedCopy>>;
  design: {
    family: string;
    mood: string;
    theme: string;
    palette: {
      background: string;
      surface: string;
      text: string;
      muted: string;
      accent: string;
      accentText: string;
      line: string;
    };
    typography: {
      latin: 'manrope';
      arabic: 'noto-sans-arabic';
      display: 'sans' | 'editorial';
    };
    heroLayout: 'split' | 'centered' | 'cinematic' | 'editorial';
    navStyle: 'minimal' | 'floating' | 'transparent';
    mobileCta: 'sticky' | 'inline';
    radius: number;
    maxWidth: number;
    heroMinHeight: number;
    density: 'airy' | 'balanced';
    customerFacing: boolean;
    referenceYear: 2026;
  };
  assets: {
    logoUrl?: string;
    imageUrls: string[];
  };
  evidence: {
    categoryLabel?: string;
    address?: string;
    rating?: number;
    reviewCount?: number;
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
