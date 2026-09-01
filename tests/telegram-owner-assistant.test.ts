import { describe, expect, it } from 'vitest';
import { confirmationKeyboard } from '@/lib/telegram/client';
import { isAuthorizedTelegramOwner, verifyTelegramWebhookSecret, type TelegramRuntimeConfig } from '@/lib/telegram/config';
import { isSafeServiceOptionKey } from '@/lib/telegram/commands';
import { MUTATING_COMMANDS } from '@/lib/telegram/contracts';
import { normalizeCountryCode, parseTelegramOwnerCommand } from '@/lib/telegram/parser';
import { normalizeWhatsAppLink } from '@/lib/telegram/notifications';

const config: TelegramRuntimeConfig = {
  botToken: 'bot-token',
  webhookSecret: 'webhook-secret',
  ownerUserId: '123',
  ownerChatId: '456',
  organizationId: '00000000-0000-0000-0000-000000000001',
};

describe('Telegram owner assistant safety boundaries', () => {
  it('normalizes supported country aliases without guessing unknown markets', () => {
    expect(normalizeCountryCode('عمان')).toBe('OM');
    expect(normalizeCountryCode('UAE')).toBe('AE');
    expect(normalizeCountryCode('uk')).toBe('GB');
    expect(normalizeCountryCode('ZZZ')).toBeUndefined();
  });

  it('keeps pricing questions read-only and requires explicit mutation language for changes', () => {
    expect(parseTelegramOwnerCommand('قیمت عمان رو نشون بده').type).toBe('SHOW_PRICING');
    expect(parseTelegramOwnerCommand('/pricing OM')).toEqual({ type: 'SHOW_PRICING', countryCode: 'OM', serviceQuery: undefined });

    expect(parseTelegramOwnerCommand('/price OM business_website 189')).toEqual({
      type: 'SET_PRICE',
      countryCode: 'OM',
      serviceQuery: 'business_website',
      price: 189,
    });
    expect(parseTelegramOwnerCommand('قیمت business website در عمان رو 199 کن')).toEqual({
      type: 'SET_PRICE',
      countryCode: 'OM',
      serviceQuery: 'business website',
      price: 199,
    });
  });

  it('parses owner control commands conservatively', () => {
    expect(parseTelegramOwnerCommand('/service business_website off')).toEqual({
      type: 'SET_SERVICE_ENABLED', serviceQuery: 'business_website', enabled: false,
    });
    expect(parseTelegramOwnerCommand('/market OM on')).toEqual({ type: 'SET_MARKET_ENABLED', countryCode: 'OM', enabled: true });
    expect(parseTelegramOwnerCommand('/pause whatsapp')).toEqual({ type: 'SET_PAUSE', target: 'WHATSAPP', paused: true });
    expect(parseTelegramOwnerCommand('/resume agents')).toEqual({ type: 'SET_PAUSE', target: 'AGENTS', paused: false });
    expect(parseTelegramOwnerCommand('/hunt OM Muscat dental-clinic 5')).toEqual({
      type: 'CREATE_HUNTER_CAMPAIGN', countryCode: 'OM', city: 'Muscat', industry: 'dental-clinic', targetCount: 5,
    });
  });

  it('requires both configured Telegram owner identity dimensions', () => {
    expect(isAuthorizedTelegramOwner({ userId: 123, chatId: 456 }, config)).toBe(true);
    expect(isAuthorizedTelegramOwner({ userId: 999, chatId: 456 }, config)).toBe(false);
    expect(isAuthorizedTelegramOwner({ userId: 123, chatId: 999 }, config)).toBe(false);
    expect(verifyTelegramWebhookSecret('webhook-secret', config)).toBe(true);
    expect(verifyTelegramWebhookSecret('wrong', config)).toBe(false);
    expect(verifyTelegramWebhookSecret(null, config)).toBe(false);
  });

  it('blocks sensitive service option keys from Telegram writes', () => {
    expect(isSafeServiceOptionKey('requiresCustomQuote')).toBe(true);
    expect(isSafeServiceOptionKey('productionMode')).toBe(true);
    expect(isSafeServiceOptionKey('api_key')).toBe(false);
    expect(isSafeServiceOptionKey('webhookSecret')).toBe(false);
    expect(isSafeServiceOptionKey('access-token')).toBe(false);
  });

  it('classifies every write command as mutating', () => {
    for (const type of [
      'SET_PRICE','SET_SERVICE_ENABLED','SET_SERVICE_OPTION','CREATE_HUNTER_CAMPAIGN',
      'SET_MARKET_ENABLED','SET_PAUSE','APPROVE_MESSAGE','REJECT_MESSAGE','REVERT_LAST_CHANGE',
    ] as const) expect(MUTATING_COMMANDS.has(type)).toBe(true);
    expect(MUTATING_COMMANDS.has('SHOW_STATUS')).toBe(false);
  });

  it('builds safe WhatsApp links and compact confirmation callback payloads', () => {
    expect(normalizeWhatsAppLink('+968 7740 2910')).toBe('https://wa.me/96877402910');
    expect(normalizeWhatsAppLink('123')).toBeNull();
    const keyboard = confirmationKeyboard('00000000-0000-0000-0000-000000000001');
    const callbacks = keyboard.inline_keyboard.flat().map((button) => button.callback_data ?? '');
    expect(callbacks).toEqual([
      'tg:ok:00000000-0000-0000-0000-000000000001',
      'tg:no:00000000-0000-0000-0000-000000000001',
    ]);
    for (const callback of callbacks) expect(Buffer.byteLength(callback, 'utf8')).toBeLessThanOrEqual(64);
  });
});
