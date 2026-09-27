import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('social identity production schema alignment', () => {
  it('does not use historical identity/link status column names in runtime paths', () => {
    const gate = readFileSync('lib/outreach/canonical-send-gate.ts', 'utf8');
    const repair = readFileSync('supabase/migrations/0114_social_identity_runtime_schema_alignment.sql', 'utf8');
    expect(gate).not.toContain('identity_status');
    expect(gate).not.toContain('link_status');
    expect(repair).not.toContain('identity_status');
    expect(repair).not.toContain('link_status');
    expect(repair).toContain("'source','FACEBOOK_MESSENGER_WEBHOOK'");
  });
});
