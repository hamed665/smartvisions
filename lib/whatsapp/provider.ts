import type { ProviderRateLimitEvidence } from '@/lib/omnichannel/rate-limit-evidence';

import type { SmartVisionsCatalogContentId } from './catalog';

export type WhatsAppSendInput = {
  to: string;
  text: string;
  replyToMessageId?: string;
};

export type WhatsAppTemplateSendInput = {
  to: string;
  templateName: string;
  languageCode: string;
  bodyParameters?: string[];
};

export type WhatsAppCatalogProductSendInput = {
  to: string;
  contentId: SmartVisionsCatalogContentId;
  bodyText: string;
  replyToMessageId?: string;
};

export type WhatsAppAudioUploadInput = {
  bytes: ArrayBuffer;
  mimeType: 'audio/mpeg' | 'audio/mp4' | 'audio/aac' | 'audio/amr' | 'audio/ogg';
  filename?: string;
};

export type WhatsAppAudioSendInput = {
  to: string;
  mediaId: string;
  replyToMessageId?: string;
};

export type WhatsAppAudioUploadResult = {
  mediaId: string;
};

export type WhatsAppSendResult = {
  providerMessageId: string;
  status: 'accepted';
  rateLimit?: ProviderRateLimitEvidence | null;
};

export interface WhatsAppProvider {
  sendText(input: WhatsAppSendInput): Promise<WhatsAppSendResult>;
  sendTemplate(input: WhatsAppTemplateSendInput): Promise<WhatsAppSendResult>;
  sendCatalogProduct(input: WhatsAppCatalogProductSendInput): Promise<WhatsAppSendResult>;
  uploadAudio(input: WhatsAppAudioUploadInput): Promise<WhatsAppAudioUploadResult>;
  sendAudio(input: WhatsAppAudioSendInput): Promise<WhatsAppSendResult>;
  health(): Promise<{ healthy: boolean; detail?: string }>;
}
