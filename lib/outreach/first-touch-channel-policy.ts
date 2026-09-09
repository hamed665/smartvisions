export type GrowthFirstTouchChannel = 'EMAIL' | 'WHATSAPP';

export type GrowthFirstTouchChannelPolicyInput = {
  channel: GrowthFirstTouchChannel;
  marketEnabled: boolean;
  coldEmailEnabled: boolean;
  /** Legacy kill-switch retained only for compatibility. Cold WhatsApp is never authorized. */
  whatsappColdEnabled?: boolean;
  whatsappOptInEnabled?: boolean;
  whatsappOptInVerified?: boolean;
  whatsappTemplateName?: string | null;
  whatsappTemplateLanguageCode?: string | null;
};

export type GrowthFirstTouchChannelPolicyReason =
  | 'ALLOWED'
  | 'MARKET_DISABLED'
  | 'EMAIL_COLD_DISABLED'
  | 'WHATSAPP_OPT_IN_LANE_DISABLED'
  | 'WHATSAPP_MARKETING_OPT_IN_REQUIRED'
  | 'WHATSAPP_TEMPLATE_REQUIRED'
  | 'WHATSAPP_TEMPLATE_LANGUAGE_REQUIRED';

export function evaluateGrowthFirstTouchChannelPolicy(
  input: GrowthFirstTouchChannelPolicyInput,
): { allowed: boolean; reason: GrowthFirstTouchChannelPolicyReason } {
  if (!input.marketEnabled) return { allowed: false, reason: 'MARKET_DISABLED' };

  if (input.channel === 'EMAIL') {
    return input.coldEmailEnabled
      ? { allowed: true, reason: 'ALLOWED' }
      : { allowed: false, reason: 'EMAIL_COLD_DISABLED' };
  }

  if (input.whatsappOptInEnabled !== true) {
    return { allowed: false, reason: 'WHATSAPP_OPT_IN_LANE_DISABLED' };
  }
  if (input.whatsappOptInVerified !== true) {
    return { allowed: false, reason: 'WHATSAPP_MARKETING_OPT_IN_REQUIRED' };
  }
  if (!input.whatsappTemplateName?.trim()) {
    return { allowed: false, reason: 'WHATSAPP_TEMPLATE_REQUIRED' };
  }
  if (!input.whatsappTemplateLanguageCode?.trim()) {
    return { allowed: false, reason: 'WHATSAPP_TEMPLATE_LANGUAGE_REQUIRED' };
  }

  return { allowed: true, reason: 'ALLOWED' };
}
