import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CommunicationChannel } from '@/lib/chatwoot/tenant-bridge';
import { ACTIVE_CHANNEL_ADAPTERS } from '@/lib/omnichannel';

const migration = readFileSync(
  new URL('../supabase/migrations/0102_instagram_tenant_binding_readiness.sql', import.meta.url),
  'utf8',
);

describe('Instagram tenant binding readiness', () => {
  it('allows Instagram in the governed canonical binding contract', () => {
    const channel: CommunicationChannel = 'INSTAGRAM';
    expect(channel).toBe('INSTAGRAM');
    expect(migration).toContain("channel in ('EMAIL','WHATSAPP','INSTAGRAM')");
    expect(migration).toContain("v_channel not in ('EMAIL','WHATSAPP','INSTAGRAM')");
  });

  it('does not falsely activate an Instagram customer messaging adapter', () => {
    expect(Object.keys(ACTIVE_CHANNEL_ADAPTERS)).toEqual(['EMAIL', 'WHATSAPP']);
    expect(ACTIVE_CHANNEL_ADAPTERS).not.toHaveProperty('INSTAGRAM');
  });

  it('keeps binding creation behind the existing governed command and integration contract', () => {
    expect(migration).toContain('chatwoot_bridge_can_manage');
    expect(migration).toContain('claim_chatwoot_bridge_command');
    expect(migration).not.toContain('access_token');
    expect(migration).not.toContain('client_secret');
  });
});
