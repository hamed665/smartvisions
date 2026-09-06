import type { Quality, WebsiteAuditor, WebsiteAuditResult } from './types';

export type WebsiteAuditFailureCode = 'TIMEOUT' | 'FETCH' | 'HTTP' | 'PARSE' | 'VALIDATION';

export class WebsiteAuditProviderError extends Error {
  constructor(
    public readonly code: WebsiteAuditFailureCode,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'WebsiteAuditProviderError';
  }
}

function normalizeQuality(value: unknown): Quality {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'GOOD' || normalized === 'FAIR' || normalized === 'POOR' || normalized === 'UNKNOWN'
    ? normalized
    : 'UNKNOWN';
}

function stringList(value: unknown, limit = 50) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item ?? '').trim()).filter(Boolean))].slice(0, limit);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function providerFailure(error: unknown) {
  if (error instanceof WebsiteAuditProviderError) return error;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : 'Website audit provider request failed';
  if (name === 'AbortError' || name === 'TimeoutError' || /timeout/i.test(message)) {
    return new WebsiteAuditProviderError('TIMEOUT', true, 'Crawl4AI request timed out');
  }
  return new WebsiteAuditProviderError('FETCH', true, message.slice(0, 180));
}

export class Crawl4AiAuditor implements WebsiteAuditor {
  constructor(private readonly baseUrl: string) {}

  async audit(url: string): Promise<WebsiteAuditResult> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/audit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      throw providerFailure(error);
    }

    if (!response.ok) {
      throw new WebsiteAuditProviderError(
        'HTTP',
        response.status >= 500 || response.status === 429,
        `Crawl4AI audit returned HTTP ${response.status}`,
      );
    }

    let rawValue: unknown;
    try {
      rawValue = await response.json();
    } catch {
      throw new WebsiteAuditProviderError('PARSE', false, 'Crawl4AI returned invalid JSON');
    }
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      throw new WebsiteAuditProviderError('VALIDATION', false, 'Crawl4AI returned a non-object audit payload');
    }

    const raw = rawValue as Record<string, unknown>;
    const sourceUrl = typeof raw.sourceUrl === 'string' && raw.sourceUrl.trim() ? raw.sourceUrl.trim() : url;
    const socialLinks = record(raw.socialLinks);
    const evidence = Array.isArray(raw.evidence)
      ? raw.evidence.filter(item => item && typeof item === 'object' && !Array.isArray(item)).slice(0, 100)
      : [];
    const brokenLinks = Number(raw.brokenLinks ?? 0);

    return {
      sourceUrl,
      title: typeof raw.title === 'string' ? raw.title.slice(0, 500) : undefined,
      detectedLanguages: stringList(raw.detectedLanguages, 20),
      services: stringList(raw.services, 50),
      contactEmails: stringList(raw.contactEmails, 50),
      contactPhones: stringList(raw.contactPhones, 50),
      socialLinks: Object.fromEntries(Object.entries(socialLinks).flatMap(([key, value]) => typeof value === 'string' ? [[key, value.slice(0, 1000)]] : [])),
      hasArabic: raw.hasArabic === true,
      hasEnglish: raw.hasEnglish === true,
      hasBooking: raw.hasBooking === true,
      hasWhatsapp: raw.hasWhatsapp === true,
      mobileQuality: normalizeQuality(raw.mobileQuality),
      seoQuality: normalizeQuality(raw.seoQuality),
      ctaQuality: normalizeQuality(raw.ctaQuality),
      brokenLinks: Number.isFinite(brokenLinks) ? Math.max(0, Math.round(brokenLinks)) : 0,
      evidence: evidence as WebsiteAuditResult['evidence'],
    };
  }
}
