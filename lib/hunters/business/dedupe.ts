import type { DiscoveredBusiness } from './types';

function normalizeText(value?: string) {
  return value?.trim().toLowerCase() || undefined;
}

export function normalizeDomain(url?: string) {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host || undefined;
  } catch {
    return normalizeText(url)?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

export function businessDedupeKeys(business: DiscoveredBusiness) {
  const keys = new Set<string>();
  if (business.googlePlaceId) keys.add(`place:${business.googlePlaceId}`);
  const domain = normalizeDomain(business.officialWebsite);
  if (domain) keys.add(`domain:${domain}`);
  if (business.phone) keys.add(`phone:${business.phone.replace(/\D/g, '')}`);
  if (business.email) keys.add(`email:${normalizeText(business.email)}`);
  return Array.from(keys);
}

export function dedupeBusinesses(items: DiscoveredBusiness[]) {
  const seen = new Set<string>();
  const unique: DiscoveredBusiness[] = [];

  for (const item of items) {
    const keys = businessDedupeKeys(item);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    unique.push(item);
  }

  return unique;
}
