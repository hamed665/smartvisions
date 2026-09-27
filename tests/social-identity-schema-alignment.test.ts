import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('social identity production schema alignment', () => {
  it('does not execute historical identity/link status column names', () => {
    const gate = readFileSync('lib/outreach/canonical-send-gate.ts', 'utf8');
    const repair = readFileSync('supabase/migrations/0114_social_identity_runtime_schema_alignment.sql', 'utf8');

    expect(gate).not.toContain(".eq('link_status'");
    expect(gate).not.toContain('crm_identities.identity_status');
    expect(repair).not.toMatch(/\bl\.link_status\b/);
    expect(repair).not.toMatch(/\bi\.identity_status\b/);
    expect(repair).toContain("'source','FACEBOOK_MESSENGER_WEBHOOK'");
  });
});
