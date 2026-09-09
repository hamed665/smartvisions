import { describe, expect, it } from 'vitest';
import { evaluateGrowthFirstTouchChannelPolicy } from '@/lib/outreach/first-touch-channel-policy';

const base = {
  marketEnabled: true,
  coldEmailEnabled: true,
  whatsappColdEnabled: false,
  whatsappOptInEnabled: false,
  whatsappOptInVerified: false,
};

describe('growth first-touch channel policy', () => {
  it('allows cold email only when the market explicitly enables it', () => {
    expect(evaluateGrowthFirstTouchChannelPolicy({ ...base, channel: 'EMAIL' }))
      .toEqual({ allowed: true, reason: 'ALLOWED' });
    expect(evaluateGrowthFirstTouchChannelPolicy({ ...base, channel: 'EMAIL', coldEmailEnabled: false }))
      .toEqual({ allowed: false, reason: 'EMAIL_COLD_DISABLED' });
  });

  it('keeps the WhatsApp opt-in lane disabled by default', () => {
    expect(evaluateGrowthFirstTouchChannelPolicy({
      ...base,
      channel: 'WHATSAPP',
      whatsappTemplateName: 'smartvisions_business_intro_om',
      whatsappTemplateLanguageCode: 'ar',
    })).toEqual({ allowed: false, reason: 'WHATSAPP_OPT_IN_LANE_DISABLED' });
  });

  it('does not treat the legacy cold flag or a public phone number as consent', () => {
    expect(evaluateGrowthFirstTouchChannelPolicy({
      ...base,
      channel: 'WHATSAPP',
      whatsappColdEnabled: true,
      whatsappOptInEnabled: true,
      whatsappTemplateName: 'smartvisions_business_intro_om',
      whatsappTemplateLanguageCode: 'ar',
    })).toEqual({ allowed: false, reason: 'WHATSAPP_MARKETING_OPT_IN_REQUIRED' });
  });

  it('requires exact template configuration after verified opt-in', () => {
    expect(evaluateGrowthFirstTouchChannelPolicy({
      ...base,
      channel: 'WHATSAPP',
      whatsappOptInEnabled: true,
      whatsappOptInVerified: true,
    })).toEqual({ allowed: false, reason: 'WHATSAPP_TEMPLATE_REQUIRED' });

    expect(evaluateGrowthFirstTouchChannelPolicy({
      ...base,
      channel: 'WHATSAPP',
      whatsappOptInEnabled: true,
      whatsappOptInVerified: true,
      whatsappTemplateName: 'smartvisions_business_intro_om',
    })).toEqual({ allowed: false, reason: 'WHATSAPP_TEMPLATE_LANGUAGE_REQUIRED' });
  });

  it('allows WhatsApp only with lane, verified opt-in, template name and language', () => {
    expect(evaluateGrowthFirstTouchChannelPolicy({
      ...base,
      channel: 'WHATSAPP',
      whatsappOptInEnabled: true,
      whatsappOptInVerified: true,
      whatsappTemplateName: 'smartvisions_business_intro_om',
      whatsappTemplateLanguageCode: 'ar',
    })).toEqual({ allowed: true, reason: 'ALLOWED' });
  });

  it('blocks every first touch when the market itself is disabled', () => {
    expect(evaluateGrowthFirstTouchChannelPolicy({ ...base, channel: 'EMAIL', marketEnabled: false }))
      .toEqual({ allowed: false, reason: 'MARKET_DISABLED' });
  });
});
