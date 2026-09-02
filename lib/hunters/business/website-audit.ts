export type WebsiteAuditQuality = 'GOOD' | 'FAIR' | 'POOR' | 'UNKNOWN';

export type WebsiteAuditResult = {
  title: string | null;
  detectedLanguages: string[];
  services: string[];
  contactEmails: string[];
  contactPhones: string[];
  socialLinks: Record<string, string>;
  hasArabic: boolean;
  hasEnglish: boolean;
  hasBooking: boolean;
  hasWhatsapp: boolean;
  mobileQuality: WebsiteAuditQuality;
  seoQuality: WebsiteAuditQuality;
  ctaQuality: WebsiteAuditQuality;
  evidence: Array<{ key: string; value: string }>;
};

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
]);

const unique = (items: string[]) => [...new Set(items.map((item) => item.trim()).filter(Boolean))];
const stripTags = (value: string) => value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function normalizeAuditUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) websites can be audited');
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local')) throw new Error('Local/private hosts are blocked');
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.hash = '';
  return url;
}

export function isPrivateIp(value: string) {
  const ip = value.toLowerCase();
  if (/^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  return false;
}

export function analyzeWebsiteHtml(html: string): WebsiteAuditResult {
  const text = stripTags(html);
  const lower = `${html}\n${text}`.toLowerCase();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || null;
  const hasArabic = /[\u0600-\u06ff]/.test(text);
  const hasEnglish = /[a-z]{4,}/i.test(text);
  const emails = unique((html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).slice(0, 12));
  const phones = unique((text.match(/(?:\+?\d[\d\s().-]{6,}\d)/g) ?? []).slice(0, 12));
  const hasWhatsapp = /wa\.me|whatsapp\.com|whatsapp/i.test(lower);
  const hasBooking = /book(?:ing)?|appointment|reserve|schedule|احجز|موعد/i.test(lower);
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const hasDescription = /<meta[^>]+name=["']description["'][^>]+content=/i.test(html) || /<meta[^>]+content=["'][^"']+["'][^>]+name=["']description["']/i.test(html);
  const hasH1 = /<h1\b/i.test(html);
  const hasCta = /(call|contact|book|appointment|whatsapp|احجز|اتصل|تواصل)/i.test(text);
  const socialLinks: Record<string, string> = {};
  for (const [key, regex] of Object.entries({
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/[^"'\s<>]+/i,
    facebook: /https?:\/\/(?:www\.)?facebook\.com\/[^"'\s<>]+/i,
    linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/[^"'\s<>]+/i,
    tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/[^"'\s<>]+/i,
  })) {
    const match = html.match(regex)?.[0];
    if (match) socialLinks[key] = match;
  }
  const serviceSignals = unique((text.match(/(?:dental|dentist|implant|orthodont|whitening|cleaning|cosmetic|clinic|تقويم|أسنان|زراعة|تبييض)/gi) ?? []).map((s) => s.toLowerCase())).slice(0, 12);
  const evidence: Array<{ key: string; value: string }> = [
    { key: 'viewport', value: hasViewport ? 'present' : 'missing' },
    { key: 'meta_description', value: hasDescription ? 'present' : 'missing' },
    { key: 'h1', value: hasH1 ? 'present' : 'missing' },
    { key: 'booking_signal', value: hasBooking ? 'present' : 'missing' },
    { key: 'whatsapp_signal', value: hasWhatsapp ? 'present' : 'missing' },
  ];
  return {
    title,
    detectedLanguages: [hasArabic ? 'ar' : '', hasEnglish ? 'en' : ''].filter(Boolean),
    services: serviceSignals,
    contactEmails: emails,
    contactPhones: phones,
    socialLinks,
    hasArabic,
    hasEnglish,
    hasBooking,
    hasWhatsapp,
    mobileQuality: hasViewport ? 'GOOD' : 'POOR',
    seoQuality: hasDescription && hasH1 && title ? 'GOOD' : 'POOR',
    ctaQuality: hasCta ? 'GOOD' : 'POOR',
    evidence,
  };
}
