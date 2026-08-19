export type FunnelInput = {
  newLeads: number;
  audited: number;
  qualified: number;
  contacted: number;
  replies: number;
  positive: number;
  hot: number;
  won: number;
  lost: number;
  revenue: number;
  apiCost: number;
  previewSent?: number;
  previewViewed?: number;
  previewHot?: number;
  previewWon?: number;
};

const rate = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;

export function calculateFunnelMetrics(input: FunnelInput) {
  return {
    ...input,
    replyRate: rate(input.replies, input.contacted),
    positiveRate: rate(input.positive, input.replies),
    hotRate: rate(input.hot, input.positive),
    closeRate: rate(input.won, input.contacted),
    hotToWonRate: rate(input.won, input.hot),
    roi: input.apiCost > 0 ? (input.revenue - input.apiCost) / input.apiCost : null,
    costPerReply: input.replies > 0 ? input.apiCost / input.replies : null,
    costPerHot: input.hot > 0 ? input.apiCost / input.hot : null,
    costPerSale: input.won > 0 ? input.apiCost / input.won : null,
    previewViewRate: rate(input.previewViewed ?? 0, input.previewSent ?? 0),
    previewToHotRate: rate(input.previewHot ?? 0, input.previewViewed ?? 0),
    previewToWonRate: rate(input.previewWon ?? 0, input.previewViewed ?? 0),
  };
}
