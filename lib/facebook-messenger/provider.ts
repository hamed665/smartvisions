import { extractProviderRateLimitEvidence } from '@/lib/omnichannel/rate-limit-evidence';
import type { ProviderRateLimitEvidence } from '@/lib/omnichannel/rate-limit-evidence';

export type MetaMessengerProviderConfig = {
  token: string;
  pageId: string;
  graphVersion?: string;
};

export type MessengerSendResult = {
  providerMessageId: string;
  status: 'accepted';
  rateLimit?: ProviderRateLimitEvidence | null;
};

export class MetaMessengerProvider {
  private token: string;
  private pageId: string;
  private graphVersion: string;

  constructor(config: MetaMessengerProviderConfig) {
    this.token = config.token.trim();
    this.pageId = config.pageId.trim();
    this.graphVersion = config.graphVersion?.trim() || process.env.META_GRAPH_VERSION?.trim() || 'v23.0';
    if (!this.token || !this.pageId) throw new Error('Messenger Page token and Page ID are required');
  }

  async sendText(input: { recipientId: string; text: string }): Promise<MessengerSendResult> {
    const recipientId = input.recipientId.trim();
    const text = input.text.trim();
    if (!recipientId || !text) throw new Error('Messenger recipient and text are required');

    const response = await fetch(
      `https://graph.facebook.com/${this.graphVersion}/${this.pageId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
      },
    );
    const rateLimit = extractProviderRateLimitEvidence(response.headers);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Meta Messenger send failed (${response.status}): ${detail.slice(0, 500)}`);
    }
    const body = await response.json() as { message_id?: string };
    if (!body.message_id) throw new Error('Meta Messenger response did not include a message id');
    return { providerMessageId: body.message_id, status: 'accepted', rateLimit };
  }
}
