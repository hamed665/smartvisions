export type WhatsAppSendInput = {
  to: string;
  text: string;
  replyToMessageId?: string;
};

export type WhatsAppTemplateSendInput = {
  to: string;
  templateName: string;
  languageCode: string;
};

export type WhatsAppSendResult = {
  providerMessageId: string;
  status: 'accepted';
};

export interface WhatsAppProvider {
  sendText(input: WhatsAppSendInput): Promise<WhatsAppSendResult>;
  sendTemplate(input: WhatsAppTemplateSendInput): Promise<WhatsAppSendResult>;
  health(): Promise<{ healthy: boolean; detail?: string }>;
}
