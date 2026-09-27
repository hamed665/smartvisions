import { extractProviderRateLimitEvidence, ProviderHttpError } from '@/lib/omnichannel/rate-limit-evidence';
import type { ProviderRateLimitEvidence } from '@/lib/omnichannel/rate-limit-evidence';

export type MetaInstagramProviderConfig = {
  token: string;
  destinationId: string;
  graphVersion?: string;
};

export type InstagramSendResult = {
  providerMessageId: string;
  status: 'accepted';
  rateLimit?: ProviderRateLimitEvidence | null;
};

export class MetaInstagramProvider {
  private readonly token: string;
  private readonly destinationId: string;
  private readonly graphVersion: string;

  constructor(config: MetaInstagramProviderConfig) {
    this.token = config.token.trim();
    this.destinationId = config.destinationId.trim();
    this.graphVersion = config.graphVersion?.trim() || process.env.META_GRAPH_VERSION?.trim() || 'v23.0';
    if (!this.token || !this.destinationId) throw new Error('Instagram tenant token and destination ID are required');
  }

  async sendText(input: { recipientId: string; text: string }): Promise<InstagramSendResult> {
    const recipientId = input.recipientId.trim();
    const text = input.text.trim();
    if (!recipientId || !text) throw new Error('Instagram recipient and text are required');

    const response = await fetch(
      `https://graph.facebook.com/${this.graphVersion}/${this.destinationId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
        }),
      },
    );
    const rateLimit = extractProviderRateLimitEvidence(response.headers);
    if (!response.ok) {
      const detail = await response.text();
      throw new ProviderHttpError(`Meta Instagram send failed (${response.status}): ${detail.slice(0, 500)}`, response.status, rateLimit);
    }
    const body = await response.json() as { message_id?: string; messageId?: string };
    const providerMessageId = body.message_id ?? body.messageId;
    if (!providerMessageId) throw new Error('Meta Instagram response did not include a message id');
    return { providerMessageId, status: 'accepted', ...(rateLimit ? { rateLimit } : {}) };
  }
}
