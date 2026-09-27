import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Web Chat anonymous identity contract', () => {
  it('keeps anonymous sessions out of fabricated Business records', () => {
    const migration = readFileSync('supabase/migrations/0115_web_chat_session_inbound_foundation.sql', 'utf8');
    expect(migration).toContain("'WEBCHAT_SESSION'");
    expect(migration).toContain("values(s.organization_id,null,'WEB_CHAT'");
    expect(migration).not.toMatch(/insert into public\.businesses/i);
    expect(migration).toContain("'WEB_CHAT_VERIFIED'");
    expect(migration).toContain("evidence_strength='VERIFIED'");
  });
});
