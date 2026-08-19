import type { WhatsAppProvider, WhatsAppSendInput, WhatsAppSendResult } from './provider';

export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  constructor(
    private readonly token = process.env.META_WHATSAPP_TOKEN,
    private readonly phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID,
    private readonly graphVersion = process.env.META_GRAPH_VERSION,
  ) {}

  private assertConfigured() {
    if (!this.token || !this.phoneNumberId || !this.graphVersion) {
      throw new Error('META_WHATSAPP_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID and META_GRAPH_VERSION are required');
    }
  }

  async sendText(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    this.assertConfigured();
    const response = await fetch(`https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.to,
        type: 'text',
        text: { preview_url: false, body: input.text },
        ...(input.replyToMessageId ? { context: { message_id: input.replyToMessageId } } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Meta WhatsApp send failed (${response.status}): ${detail.slice(0, 500)}`);
    }

    const body = await response.json() as { messages?: Array<{ id: string }> };
    const providerMessageId = body.messages?.[0]?.id;
    if (!providerMessageId) throw new Error('Meta WhatsApp response did not include a message id');
    return { providerMessageId, status: 'accepted' };
  }

  async health() {
    try {
      this.assertConfigured();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, detail: error instanceof Error ? error.message : 'Unknown configuration error' };
    }
  }
}
