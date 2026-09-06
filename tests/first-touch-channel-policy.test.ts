import { describe, expect, it } from 'vitest';
import { evaluateGrowthFirstTouchChannelPolicy } from '@/lib/outreach/first-touch-channel-policy';

const base = {
  marketEnabled: true,
  coldEmailEnabled: true,
  whatsappColdEnabled: false,
};

describe('growth first-touch channel policy', () => {
  it('allows cold email only when the market explicitly enables it', () => {
    expect(evaluateGrowthFirstTouchChannelPolicy({ ...base, channel: 'EMAIL' }))
      .toEqual({ allowed: true, reason: 'ALLOWED' });
    expect(evaluateGrowthFirstTouchChannelPolicy({ ...base, channel: 'EMAIL', coldEmailEnabled: false }))
      .toEqual({ allowed: false, reason: 'EMAIL_COLD_DISABLED' });
  });

  it('blocks cold WhatsApp when Oman policy disables it', () => {
    expect(evaluateGrowthFirstTouchChannelPolicy({
      ...base,
      channel: 'WHATSAPP',
      whatsappTemplateName: 'smartvisions_first_touch',
      whatsappTemplateLanguageCode: 'en',
    })).toEqual({ allowed: false, reason: 'WHATSAPP_COLD_DISABLED' });
  });

  it('requires explicit template configuration before cold WhatsApp can be queued', () => {
    expect(evaluateGrowthFirstTouchChannelPolicy({
      ...base,
      channel: 'WHATSAPP',
      whatsappColdEnabled: true,
    })).toEqual({ allowed: false, reason: 'WHATSAPP_TEMPLATE_REQUIRED' });

    expect(evaluateGrowthFirstTouchChannelPolicy({
      ...base,
      channel: 'WHATSAPP',
      whatsappColdEnabled: true,
      whatsappTemplateName: 'smartvisions_first_touch',
    })).toEqual({ allowed: false, reason: 'WHATSAPP_TEMPLATE_LANGUAGE_REQUIRED' });
  });

  it('allows configured cold WhatsApp only with both template name and language', () => {
    expect(evaluateGrowthFirstTouchChannelPolicy({
      ...base,
      channel: 'WHATSAPP',
      whatsappColdEnabled: true,
      whatsappTemplateName: 'smartvisions_first_touch',
      whatsappTemplateLanguageCode: 'en',
    })).toEqual({ allowed: true, reason: 'ALLOWED' });
  });

  it('blocks every first touch when the market itself is disabled', () => {
    expect(evaluateGrowthFirstTouchChannelPolicy({ ...base, channel: 'EMAIL', marketEnabled: false }))
      .toEqual({ allowed: false, reason: 'MARKET_DISABLED' });
  });
});
