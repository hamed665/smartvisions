import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Web Chat outbound/session lifecycle migration contract',()=>{
  const migration=readFileSync('supabase/migrations/0116_web_chat_outbound_session_lifecycle.sql','utf8');
  it('reuses signed Chatwoot journal and canonical conversation_messages idempotency',()=>{
    expect(migration).toContain("e.event_type <> 'message_created'");
    expect(migration).toContain("'CHATWOOT_SIGNED_WEBHOOK'");
    expect(migration).toContain("v_provider_id := 'chatwoot:'||v_message_id::text");
    expect(migration).toContain("channel='WEB_CHAT'");
    expect(migration).not.toMatch(/create table/i);
  });
  it('keeps privileged lifecycle RPCs service-role only',()=>{
    expect(migration).toContain('grant execute on function public.reconcile_web_chat_chatwoot_outbound_event(uuid) to service_role');
    expect(migration).toContain('grant execute on function public.close_web_chat_session(text,uuid,text,text) to service_role');
    expect(migration).toContain('grant execute on function public.expire_web_chat_sessions(integer) to service_role');
    expect(migration).toContain('from public,anon,authenticated,service_role');
  });
});
