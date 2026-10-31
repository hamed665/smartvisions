import { describe, expect, it } from 'vitest';
import { shouldBypassSession } from '@/lib/supabase/proxy';

describe('session proxy bypass paths', () => {
  it('lets exact mapping-scoped Chatwoot callbacks reach signature verification', () => {
    expect(shouldBypassSession('/api/chatwoot/webhook/00000000-0000-4000-8000-000000001101')).toBe(true);
    for (const path of [
      '/api/chatwoot/webhook',
      '/api/chatwoot/webhook/not-a-uuid',
      '/api/chatwoot/webhook/00000000-0000-4000-8000-000000001101/extra',
      '/api/chatwoot/sso/00000000-0000-4000-8000-000000001101',
      '/api/chatwoot/tenant-bridge',
    ]) expect(shouldBypassSession(path)).toBe(false);
  });

  it('bypasses session auth for signed/public webhooks', () => {
    expect(shouldBypassSession('/api/email/webhook')).toBe(true);
    expect(shouldBypassSession('/api/whatsapp/webhook')).toBe(true);
    expect(shouldBypassSession('/api/telegram/webhook')).toBe(true);
    expect(shouldBypassSession('/api/telegram/customer/webhook/00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(shouldBypassSession('/api/web-chat/session')).toBe(true);
    expect(shouldBypassSession('/api/web-chat/message')).toBe(true);
    expect(shouldBypassSession('/api/web-chat/config')).toBe(true);
    expect(shouldBypassSession('/api/web-chat/messages')).toBe(true);
    expect(shouldBypassSession('/api/web-chat/widget')).toBe(true);
    expect(shouldBypassSession('/api/web-chat/upload')).toBe(true);
    expect(shouldBypassSession('/api/web-chat/attachments/123')).toBe(true);
  });

  it('bypasses session auth only for exact internal-key-protected server endpoints', () => {
    expect(shouldBypassSession('/api/ai/process-inbound')).toBe(true);
    expect(shouldBypassSession('/api/outreach/approved-send')).toBe(true);
    for (const name of ['automation-runtime','automation-notifications','data-reporting-schedules','booking-holds']) {
      expect(shouldBypassSession('/api/operations/' + name)).toBe(true);
      expect(shouldBypassSession('/api/operations/' + name + '/extra')).toBe(false);
    }
    expect(shouldBypassSession('/api/operations/analytics-warehouse')).toBe(true);
    expect(shouldBypassSession('/api/operations/channel-guard')).toBe(true);
    expect(shouldBypassSession('/api/operations/chatwoot-inbox-reconcile')).toBe(true);
    expect(shouldBypassSession('/api/operations/email-shadow')).toBe(true);
    expect(shouldBypassSession('/api/operations/heartbeat')).toBe(true);
    expect(shouldBypassSession('/api/operations/report')).toBe(true);
    expect(shouldBypassSession('/api/operations/telegram-daily-digest')).toBe(true);
    expect(shouldBypassSession('/api/operations/tick')).toBe(true);
    expect(shouldBypassSession('/api/operations/sahra-inbound')).toBe(true);
    expect(shouldBypassSession('/api/telegram/notify')).toBe(true);
  });

  it('keeps normal application and non-exact API routes behind session auth', () => {
    expect(shouldBypassSession('/approvals')).toBe(false);
    expect(shouldBypassSession('/api/outreach/approved-send/extra')).toBe(false);
    expect(shouldBypassSession('/api/ai/process-inbound/extra')).toBe(false);
    expect(shouldBypassSession('/api/operations/analytics-warehouse/extra')).toBe(false);
    expect(shouldBypassSession('/api/operations/tick/extra')).toBe(false);
    expect(shouldBypassSession('/api/operations/sahra-inbound/extra')).toBe(false);
    expect(shouldBypassSession('/api/operations/chatwoot-inbox-reconcile/extra')).toBe(false);
    expect(shouldBypassSession('/api/operations/report/extra')).toBe(false);
    expect(shouldBypassSession('/api/operations/telegram-daily-digest/extra')).toBe(false);
    expect(shouldBypassSession('/api/telegram/webhook/extra')).toBe(false);
    expect(shouldBypassSession('/api/telegram/customer/webhook/not-a-uuid')).toBe(false);
    expect(shouldBypassSession('/api/telegram/customer/webhook/00000000-0000-4000-8000-000000000001/extra')).toBe(false);
    expect(shouldBypassSession('/api/telegram/notify/extra')).toBe(false);
    expect(shouldBypassSession('/api/web-chat/widget/extra')).toBe(false);
    expect(shouldBypassSession('/api/web-chat/upload/extra')).toBe(false);
    expect(shouldBypassSession('/api/web-chat/attachments/123/extra')).toBe(false);
    expect(shouldBypassSession('/api/web-chat/attachments/not-a-number')).toBe(false);
  });
});
