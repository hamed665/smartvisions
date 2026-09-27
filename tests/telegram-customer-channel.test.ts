import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { normalizeTelegramCustomerUpdate } from '@/lib/telegram/customer-webhook';
import { TelegramCustomerProvider } from '@/lib/telegram/customer-provider';
import { getTelegramActivationReadiness } from '@/lib/telegram/customer-activation';

const validToken = '12345:abcdefghijklmnopqrstuvwxyzABCDE_123456789';

describe('OMNI-TELEGRAM customer channel', () => {
  it('normalizes customer messages and keeps provider identity scoped to Telegram chat/message ids', () => {
    const event = normalizeTelegramCustomerUpdate({
      update_id: 991,
      message: {
        message_id: 17,
        date: 1_700_000_000,
        from: { id: 444, is_bot: false },
        chat: { id: 555, type: 'private' },
        caption: 'hello',
        photo: [
          { file_id: 'small', file_unique_id: 'u1', file_size: 100, width: 100, height: 100 },
          { file_id: 'large', file_unique_id: 'u2', file_size: 500, width: 800, height: 600 },
        ],
      },
    });
    expect(event).toEqual(expect.objectContaining({
      updateId: 991,
      eventType: 'MESSAGE',
      providerMessageId: '555:17',
      chatId: '555',
      senderId: '444',
      senderIsBot: false,
      text: 'hello',
    }));
    expect(event?.media).toEqual([
      expect.objectContaining({ kind: 'PHOTO', fileId: 'large', fileUniqueId: 'u2', fileSize: 500 }),
    ]);
  });

  it('normalizes callback updates without inventing a customer text message', () => {
    const event = normalizeTelegramCustomerUpdate({
      update_id: 992,
      callback_query: {
        id: 'cb-1',
        data: 'choice:1',
        from: { id: 444, is_bot: false },
        message: { message_id: 18, chat: { id: 555, type: 'private' } },
      },
    });
    expect(event).toEqual(expect.objectContaining({
      eventType: 'CALLBACK_QUERY',
      providerMessageId: '555:18',
      callbackQueryId: 'cb-1',
      callbackData: 'choice:1',
      text: null,
    }));
  });

  it('fails closed when Telegram update_id is missing', () => {
    expect(() => normalizeTelegramCustomerUpdate({ message: {} }))
      .toThrow('Telegram customer update_id is required');
  });

  it('uses only the tenant-injected Bot token and returns canonical provider message evidence', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`https://api.telegram.org/bot${validToken}/sendMessage`);
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ chat_id: '555', text: 'hello' });
      return new Response(JSON.stringify({
        ok: true,
        result: { message_id: 19, chat: { id: 555 } },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const provider = new TelegramCustomerProvider({ token: validToken, fetchImpl: fetchMock });
    await expect(provider.sendText({ chatId: '555', text: 'hello' }))
      .resolves.toEqual({ providerMessageId: '555:19', status: 'accepted' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects missing or malformed tenant Bot credentials', () => {
    expect(() => new TelegramCustomerProvider({ token: '' })).toThrow('token format');
    expect(() => new TelegramCustomerProvider({ token: 'owner-bot-token' })).toThrow('token format');
  });

  it('maps activation evidence without turning blockers into readiness', async () => {
    const service = {
      rpc: vi.fn().mockResolvedValue({
        data: [{
          ready: false,
          blockers: ['INTEGRATION_NOT_CONNECTED', 'LIVE_ACCEPTANCE_EVIDENCE_MISSING'],
          binding_id: '00000000-0000-4000-8000-000000000001',
          destination_id: '12345',
          inbox_mapping_id: null,
          telegram_ai_paused: true,
          reconciliation_required_count: 2,
        }],
        error: null,
      }),
    };

    await expect(getTelegramActivationReadiness({
      service: service as never,
      organizationId: '00000000-0000-4000-8000-000000000010',
      tenantBusinessId: '00000000-0000-4000-8000-000000000011',
    })).resolves.toEqual({
      ready: false,
      blockers: ['INTEGRATION_NOT_CONNECTED', 'LIVE_ACCEPTANCE_EVIDENCE_MISSING'],
      bindingId: '00000000-0000-4000-8000-000000000001',
      destinationId: '12345',
      inboxMappingId: null,
      telegramAiPaused: true,
      reconciliationRequiredCount: 2,
    });
  });

  it('keeps customer Telegram authority separate from the Owner Assistant', () => {
    const migration = readFileSync('supabase/migrations/0122_omni_telegram_customer_foundation.sql', 'utf8');
    const routing = readFileSync('lib/telegram/customer-routing.ts', 'utf8');
    const provider = readFileSync('lib/telegram/customer-provider.ts', 'utf8');

    expect(migration).toContain("'TELEGRAM','TELEGRAM',false,'NOT_CONFIGURED'");
    expect(migration).toContain('telegram_ai_paused boolean not null default true');
    expect(migration).toContain('provider_secret_ref');
    expect(migration).toContain('TELEGRAM_PROVIDER_USER');
    expect(migration).toContain('TELEGRAM_INBOUND');
    expect(migration).not.toContain('TELEGRAM_BOT_TOKEN');
    expect(routing).not.toContain("from './config'");
    expect(provider).not.toContain("from './config'");
    expect(provider).not.toContain('requireTelegramRuntimeConfig');
  });

  it('extends canonical stores instead of creating a second conversation truth', () => {
    const migration = readFileSync('supabase/migrations/0122_omni_telegram_customer_foundation.sql', 'utf8');
    expect(migration).toContain("check (channel in ('EMAIL','WHATSAPP','INSTAGRAM','FACEBOOK_MESSENGER','WEB_CHAT','TELEGRAM'))");
    expect(migration).toContain("'TELEGRAM','INBOUND'");
    expect(migration).toContain('public.sales_conversations');
    expect(migration).toContain('public.conversation_messages');
    expect(migration).toContain('public.unified_inbox_conversation_projections');
    expect(migration).not.toContain('create table public.telegram_conversations');
    expect(migration).not.toContain('create table public.telegram_customers');
  });
});
