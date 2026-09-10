import type { SupportedMarketCode } from './market-profile';

export type EmailContactBasis =
  | 'VERIFIED_FIRST_PARTY_BUSINESS_ENDPOINT'
  | 'CORPORATE_SUBSCRIBER'
  | 'DOCUMENTED_CONSENT'
  | 'VALID_EXISTING_BUSINESS_RELATIONSHIP';

export type EmailComplianceReason =
  | 'ALLOWED'
  | 'MARKET_DISABLED'
  | 'EMAIL_COLD_DISABLED'
  | 'COMMERCIAL_ACTIVATION_BLOCKED'
  | 'CONTACT_BASIS_REQUIRED'
  | 'CORPORATE_OR_CONSENT_BASIS_REQUIRED'
  | 'DOCUMENTED_CONSENT_REQUIRED'
  | 'COMMERCIAL_POSTAL_ADDRESS_REQUIRED'
  | 'UNSUPPORTED_MARKET';

export type EmailMarketPolicy = {
  enabled: boolean;
  coldEmailEnabled: boolean;
  config?: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function validBasis(value: unknown): EmailContactBasis | null {
  const basis = String(value ?? '').trim().toUpperCase();
  if (
    basis === 'VERIFIED_FIRST_PARTY_BUSINESS_ENDPOINT'
    || basis === 'CORPORATE_SUBSCRIBER'
    || basis === 'DOCUMENTED_CONSENT'
    || basis === 'VALID_EXISTING_BUSINESS_RELATIONSHIP'
  ) return basis;
  return null;
}

const GCC_BUSINESS_ENDPOINT_MARKETS = new Set<SupportedMarketCode>(['OM', 'AE', 'SA']);

export function evaluateFirstTouchEmailCompliance(input: {
  marketCode: string;
  market: EmailMarketPolicy;
  contactBasis?: EmailContactBasis | string | null;
}) {
  const marketCode = String(input.marketCode ?? '').trim().toUpperCase() as SupportedMarketCode;
  const config = record(input.market.config);
  const basis = validBasis(input.contactBasis);

  if (!['OM', 'AE', 'SA', 'QA', 'GB', 'US', 'CA'].includes(marketCode)) {
    return { allowed: false as const, reason: 'UNSUPPORTED_MARKET' as EmailComplianceReason };
  }
  if (!input.market.enabled) return { allowed: false as const, reason: 'MARKET_DISABLED' as EmailComplianceReason };
  if (!input.market.coldEmailEnabled) return { allowed: false as const, reason: 'EMAIL_COLD_DISABLED' as EmailComplianceReason };
  if (config.commercialActivationBlocked === true) {
    return { allowed: false as const, reason: 'COMMERCIAL_ACTIVATION_BLOCKED' as EmailComplianceReason };
  }

  if (marketCode === 'QA') {
    if (basis !== 'DOCUMENTED_CONSENT') {
      return { allowed: false as const, reason: 'DOCUMENTED_CONSENT_REQUIRED' as EmailComplianceReason };
    }
  } else if (marketCode === 'GB') {
    if (!['CORPORATE_SUBSCRIBER', 'DOCUMENTED_CONSENT', 'VALID_EXISTING_BUSINESS_RELATIONSHIP'].includes(String(basis ?? ''))) {
      return { allowed: false as const, reason: 'CORPORATE_OR_CONSENT_BASIS_REQUIRED' as EmailComplianceReason };
    }
  } else if (marketCode === 'CA') {
    if (!['DOCUMENTED_CONSENT', 'VALID_EXISTING_BUSINESS_RELATIONSHIP'].includes(String(basis ?? ''))) {
      return { allowed: false as const, reason: 'DOCUMENTED_CONSENT_REQUIRED' as EmailComplianceReason };
    }
  } else if (GCC_BUSINESS_ENDPOINT_MARKETS.has(marketCode)) {
    if (!['VERIFIED_FIRST_PARTY_BUSINESS_ENDPOINT', 'DOCUMENTED_CONSENT', 'VALID_EXISTING_BUSINESS_RELATIONSHIP'].includes(String(basis ?? ''))) {
      return { allowed: false as const, reason: 'CONTACT_BASIS_REQUIRED' as EmailComplianceReason };
    }
  } else if (marketCode === 'US') {
    if (!basis) return { allowed: false as const, reason: 'CONTACT_BASIS_REQUIRED' as EmailComplianceReason };
    if (config.commercialIdentityRequired === true && !stringValue(config.commercialPostalAddress)) {
      return { allowed: false as const, reason: 'COMMERCIAL_POSTAL_ADDRESS_REQUIRED' as EmailComplianceReason };
    }
  }

  return {
    allowed: true as const,
    reason: 'ALLOWED' as EmailComplianceReason,
    contactBasis: basis,
    unsubscribeRequired: config.unsubscribeRequired === true,
    commercialPostalAddress: stringValue(config.commercialPostalAddress) || null,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function buildCommercialEmailEnvelope(input: {
  marketCode: string;
  marketConfig?: unknown;
  businessName: string;
  replyAddress: string;
  text: string;
  html?: string | null;
}) {
  const marketCode = String(input.marketCode ?? '').trim().toUpperCase();
  const config = record(input.marketConfig);
  const name = input.businessName.trim();
  const replyAddress = input.replyAddress.trim();
  if (!name || !replyAddress) throw new Error('Commercial email identity is incomplete');

  const lines: string[] = [];
  if (marketCode === 'US') {
    const postalAddress = stringValue(config.commercialPostalAddress);
    if (!postalAddress) throw new Error('COMMERCIAL_POSTAL_ADDRESS_REQUIRED');
    lines.push(`Business marketing email from ${name}.`, `${name} — ${postalAddress}`);
  } else if (['GB', 'CA'].includes(marketCode)) {
    lines.push(`Sent by ${name}.`);
  }

  const includeOptOut = config.unsubscribeRequired === true || ['US', 'GB', 'CA'].includes(marketCode);
  if (includeOptOut) lines.push(`To stop receiving marketing emails, reply "unsubscribe" to ${replyAddress}.`);
  if (!lines.length) return { text: input.text, html: input.html ?? undefined, footer: '' };

  const footer = lines.join('\n');
  const text = `${input.text.trim()}\n\n${footer}`;
  const htmlFooter = lines.map((line) => escapeHtml(line)).join('<br>');
  const html = input.html ? `${input.html}<hr><p>${htmlFooter}</p>` : undefined;
  return { text, html, footer };
}
