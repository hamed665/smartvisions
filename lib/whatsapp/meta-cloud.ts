import type { WhatsAppProvider, WhatsAppSendInput, WhatsAppSendResult, WhatsAppTemplateSendInput } from './provider';

function resolveMetaWhatsAppToken() {
  return process.env.META_WHATSAPP_ACCESS_TOKEN?.trim()
    || process.env.META_WHATSAPP_TOKEN?.trim()
    || process.env.WHATSAPP_ACCESS_TOKEN?.trim();
}

function resolveMetaPhoneNumberId() {
  return process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim()
    || process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
}

function resolveMetaGraphVersion() {
  return process.env.META_GRAPH_VERSION?.trim() || 'v23.0';
}

export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  constructor(
    private readonly token = resolveMetaWhatsAppToken(),
    private readonly phoneNumberId = resolveMetaPhoneNumberId(),
    private readonly graphVersion = resolveMetaGraphVersion(),
  ) {}

  private assertConfigured() {
    if (!this.token || !this.phoneNumberId) {
      throw new Error('WhatsApp access token and phone-number ID are required');
    }
  }

  private async sendPayload(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
    this.assertConfigured();
    const response = await fetch(`https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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

  async sendText(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    return this.sendPayload({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'text',
      text: { preview_url: false, body: input.text },
      ...(input.replyToMessageId ? { context: { message_id: input.replyToMessageId } } : {}),
    });
  }

  async sendTemplate(input: WhatsAppTemplateSendInput): Promise<WhatsAppSendResult> {
    return this.sendPayload({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
      },
    });
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
