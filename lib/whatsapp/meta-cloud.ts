import { extractProviderRateLimitEvidence, ProviderHttpError } from '@/lib/omnichannel/rate-limit-evidence';
import type {
  WhatsAppCatalogProductSendInput,
  WhatsAppProvider,
  WhatsAppSendInput,
  WhatsAppSendResult,
  WhatsAppTemplateSendInput,
} from './provider';
import { assertSmartVisionsCatalogContentId, resolveWhatsAppCatalogId } from './catalog';

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

export type MetaCloudWhatsAppProviderConfig = {
  token?: string;
  phoneNumberId?: string;
  graphVersion?: string;
  catalogId?: string;
};

export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  private readonly token?: string;
  private readonly phoneNumberId?: string;
  private readonly graphVersion: string;
  private readonly catalogId?: string;

  constructor(config: MetaCloudWhatsAppProviderConfig = {}) {
    this.token = config.token ?? resolveMetaWhatsAppToken();
    this.phoneNumberId = config.phoneNumberId ?? resolveMetaPhoneNumberId();
    this.graphVersion = config.graphVersion ?? resolveMetaGraphVersion();
    this.catalogId = config.catalogId ?? resolveWhatsAppCatalogId();
  }

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

    const rateLimit = extractProviderRateLimitEvidence(response.headers);

    if (!response.ok) {
      const detail = await response.text();
      throw new ProviderHttpError(`Meta WhatsApp send failed (${response.status}): ${detail.slice(0, 500)}`, response.status, rateLimit);
    }

    const body = await response.json() as { messages?: Array<{ id: string }> };
    const providerMessageId = body.messages?.[0]?.id;
    if (!providerMessageId) throw new Error('Meta WhatsApp response did not include a message id');
    return { providerMessageId, status: 'accepted', rateLimit };
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
    const bodyParameters = (input.bodyParameters ?? []).map((value) => value.trim());
    if (bodyParameters.some((value) => !value)) {
      throw new Error('WhatsApp template body parameters must be non-empty text');
    }
    return this.sendPayload({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        ...(bodyParameters.length ? {
          components: [{
            type: 'body',
            parameters: bodyParameters.map((text) => ({ type: 'text', text })),
          }],
        } : {}),
      },
    });
  }

  async sendCatalogProduct(input: WhatsAppCatalogProductSendInput): Promise<WhatsAppSendResult> {
    assertSmartVisionsCatalogContentId(input.contentId);
    if (!this.catalogId) throw new Error('WhatsApp catalog ID is required for catalog product messages');
    if (!input.bodyText.trim()) throw new Error('WhatsApp catalog product body text is required');

    return this.sendPayload({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'interactive',
      interactive: {
        type: 'product',
        body: { text: input.bodyText.trim() },
        action: {
          catalog_id: this.catalogId,
          product_retailer_id: input.contentId,
        },
      },
      ...(input.replyToMessageId ? { context: { message_id: input.replyToMessageId } } : {}),
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
