import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Web Chat Chatwoot inbound/media migration contract', () => {
  const migration = readFileSync(
    'supabase/migrations/0117_web_chat_inbound_media_chatwoot_sync.sql',
    'utf8',
  );

  it('extends the existing Web Chat journal instead of creating another queue or store', () => {
    expect(migration).toContain('alter table public.web_chat_events');
    expect(migration).not.toMatch(/create\s+table/i);
    expect(migration).toContain("'PENDING','PROCESSING','ACCEPTED','RECONCILIATION_REQUIRED'");
    expect(migration).toContain("set chatwoot_sync_status='PROCESSING'");
    expect(migration).toContain("chatwoot_sync_status='RECONCILIATION_REQUIRED'");
  });

  it('keeps provider sync and media annotation service-role only', () => {
    expect(migration).toContain(
      'grant execute on function public.claim_web_chat_chatwoot_sync(uuid,uuid,text) to service_role',
    );
    expect(migration).toContain(
      'grant execute on function public.finalize_web_chat_chatwoot_sync(uuid,text,bigint) to service_role',
    );
    expect(migration).toContain(
      'grant execute on function public.annotate_web_chat_message_media(uuid,uuid,text,jsonb) to service_role',
    );
    expect(migration.match(/from public,anon,authenticated,service_role/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('bounds media metadata without persisting browser-accessible storage URLs', () => {
    expect(migration).toContain('jsonb_array_length(p_attachments) not between 1 and 4');
    expect(migration).toContain('(a->>\'size\')::bigint>10485760');
    expect(migration).not.toContain('data_url');
    expect(migration).not.toContain('access_token');
  });
});
