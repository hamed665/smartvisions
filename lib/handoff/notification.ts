export function buildHotLeadNotification(input: {
  businessName?: string;
  countryCode?: string;
  contact?: string;
  interest?: string;
  quotedPrice?: number;
  currency?: string;
  intentScore: number;
  customerQuote: string;
  recommendation: string;
}) {
  return {
    title: `HOT lead${input.businessName ? ` · ${input.businessName}` : ''}`,
    priority: input.intentScore >= 85 ? 'URGENT' as const : 'HIGH' as const,
    fields: {
      business: input.businessName ?? 'Unknown',
      country: input.countryCode ?? 'Unknown',
      contact: input.contact ?? 'Unknown',
      interest: input.interest ?? 'Not classified',
      price: input.quotedPrice != null && input.currency ? `${input.quotedPrice} ${input.currency}` : 'Not quoted',
      intentScore: input.intentScore,
      customerQuote: input.customerQuote,
      recommendation: input.recommendation,
    },
  };
}
