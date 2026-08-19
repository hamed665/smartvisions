export type Quality = 'GOOD' | 'FAIR' | 'POOR' | 'UNKNOWN';

export type AuditEvidence = {
  signal: string;
  value: string | number | boolean | null;
  sourceUrl: string;
  note?: string;
};

export type WebsiteAuditResult = {
  sourceUrl: string;
  title?: string;
  detectedLanguages: string[];
  services: string[];
  contactEmails: string[];
  contactPhones: string[];
  socialLinks: Record<string, string>;
  hasArabic: boolean;
  hasEnglish: boolean;
  hasBooking: boolean;
  hasWhatsapp: boolean;
  mobileQuality: Quality;
  seoQuality: Quality;
  ctaQuality: Quality;
  brokenLinks: number;
  evidence: AuditEvidence[];
};

export interface WebsiteAuditor {
  audit(url: string): Promise<WebsiteAuditResult>;
}
