import type { WebsiteAuditor, WebsiteAuditResult } from './types';

export class Crawl4AiAuditor implements WebsiteAuditor {
  constructor(private readonly baseUrl: string) {}

  async audit(url: string): Promise<WebsiteAuditResult> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/audit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      throw new Error(`Crawl4AI audit failed: ${response.status}`);
    }

    const raw = (await response.json()) as Partial<WebsiteAuditResult>;
    return {
      sourceUrl: raw.sourceUrl ?? url,
      title: raw.title,
      detectedLanguages: raw.detectedLanguages ?? [],
      services: raw.services ?? [],
      contactEmails: raw.contactEmails ?? [],
      contactPhones: raw.contactPhones ?? [],
      socialLinks: raw.socialLinks ?? {},
      hasArabic: Boolean(raw.hasArabic),
      hasEnglish: Boolean(raw.hasEnglish),
      hasBooking: Boolean(raw.hasBooking),
      hasWhatsapp: Boolean(raw.hasWhatsapp),
      mobileQuality: raw.mobileQuality ?? 'UNKNOWN',
      seoQuality: raw.seoQuality ?? 'UNKNOWN',
      ctaQuality: raw.ctaQuality ?? 'UNKNOWN',
      brokenLinks: Math.max(0, raw.brokenLinks ?? 0),
      evidence: raw.evidence ?? [],
    };
  }
}
