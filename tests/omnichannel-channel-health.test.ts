import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('OMNI-CHANNEL-HEALTH evidence aggregation', () => {
  const health = readFileSync('lib/omnichannel/health.ts', 'utf8');
  const page = readFileSync('app/integrations/page.tsx', 'utf8');
  const types = readFileSync('lib/omnichannel/types.ts', 'utf8');
  const bootstrap = readFileSync('supabase/migrations/0120_omnichannel_health_messenger_bootstrap.sql', 'utf8');

  it('does not activate deferred channels through the active adapter registry', () => {
    expect(types).toContain("ACTIVE_OMNICHANNEL_CHANNELS = ['EMAIL', 'WHATSAPP']");
    expect(health).toContain("channel: 'INSTAGRAM'");
    expect(health).toContain("channel: 'FACEBOOK_MESSENGER'");
    expect(health).toContain("channel: 'WEB_CHAT'");
    expect(health).toContain("channel: 'TELEGRAM'");
    expect(health).toContain("channel: 'TIKTOK'");
    expect(health).toContain("channel: 'SMS_RCS'");
  });

  it('derives health from existing authorities rather than a new health table', () => {
    expect(health).toContain("from('integration_connections')");
    expect(health).toContain("from('communication_channel_bindings')");
    expect(health).toContain("from('system_controls')");
    expect(health).toContain("latestEvent('email_events'");
    expect(health).toContain("latestEvent('whatsapp_events'");
    expect(health).toContain("latestEvent('instagram_events'");
    expect(health).toContain("latestEvent('facebook_messenger_events'");
    expect(health).toContain('getInstagramActivationReadiness');
    expect(health).toContain('getMessengerActivationReadiness');
    expect(health).toContain('getWebChatConnectionHealth');
    expect(health).not.toContain("from('channel_health");
  });

  it('keeps provider quota evidence explicit instead of inventing green status', () => {
    expect(health).toContain("'NO_PROVIDER_QUOTA_EVIDENCE'");
    expect(health).toContain("quotaHealth: 'NOT_APPLICABLE_BUILT_IN'");
    expect(health).toContain('quotaHealth: emailRateLimit.state');
    expect(health).toContain('quotaHealth: whatsappRateLimit.state');
    expect(health).not.toContain("quotaHealth: 'HEALTHY'");
  });

  it('surfaces missing Messenger bootstrap evidence rather than hiding it', () => {
    expect(health).toContain("'INTEGRATION_ROW_MISSING'");
    expect(health).toContain("'REAL_BINDING_MISSING'");
    expect(health).toContain("'AWAITING_REAL_BINDING'");
  });

  it('bootstraps Messenger configuration without activating the provider', () => {
    expect(bootstrap).toContain("'FACEBOOK_MESSENGER'");
    expect(bootstrap).toContain('false');
    expect(bootstrap).toContain("'NOT_CONFIGURED'");
    expect(bootstrap).toContain('on conflict (organization_id,provider,channel) do nothing');
    expect(bootstrap).not.toContain("'CONNECTED'");
    expect(bootstrap).not.toContain('provider_secret_ref');
  });

  it('renders the unified health dimensions in Connection Center', () => {
    expect(page).toContain('Unified customer channel health');
    expect(page).toContain('Credential');
    expect(page).toContain('Webhook');
    expect(page).toContain('Quota/rate');
    expect(page).toContain('Last verified evidence');
    expect(page).toContain('Capabilities');
    expect(page).toContain('Incident');
  });
});
