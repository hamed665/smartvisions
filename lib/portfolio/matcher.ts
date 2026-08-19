export type PortfolioItem = {
  id: string;
  title: string;
  serviceId?: string;
  industry?: string;
  countryCode?: string;
  approved: boolean;
  tags?: string[];
};

export function matchPortfolio(input: {
  items: PortfolioItem[];
  serviceId?: string;
  industry?: string;
  countryCode?: string;
  limit?: number;
}) {
  const scored = input.items
    .filter((item) => item.approved)
    .map((item) => {
      let score = 0;
      const reasons: string[] = [];
      if (input.serviceId && item.serviceId === input.serviceId) { score += 5; reasons.push('SERVICE_MATCH'); }
      if (input.industry && item.industry?.toLowerCase() === input.industry.toLowerCase()) { score += 4; reasons.push('INDUSTRY_MATCH'); }
      if (input.countryCode && item.countryCode === input.countryCode) { score += 2; reasons.push('MARKET_MATCH'); }
      const tags = new Set((item.tags ?? []).map((tag) => tag.toLowerCase()));
      if (input.industry && tags.has(input.industry.toLowerCase())) { score += 1; reasons.push('TAG_MATCH'); }
      return { item, score, reasons };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));

  return scored.slice(0, input.limit ?? 3);
}
