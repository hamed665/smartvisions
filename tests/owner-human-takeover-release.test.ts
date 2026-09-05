import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0059_owner_release_human_takeover.sql'), 'utf8');
const hardening = readFileSync(resolve(process.cwd(), 'supabase/migrations/0060_harden_owner_release_human_takeover.sql'), 'utf8');
const actions = readFileSync(resolve(process.cwd(), 'app/management-actions.ts'), 'utf8');
const page = readFileSync(resolve(process.cwd(), 'app/conversations/[id]/page.tsx'), 'utf8');

describe('owner human-takeover release', () => {
  it('is one atomic DB operation with owner verification and row locks', () => {
    expect(migration).toContain("om.role = 'OWNER'");
    expect(migration.match(/for update;/g)?.length).toBe(2);
    expect(migration).toContain('update public.leads');
    expect(migration).toContain('update public.sales_conversations');
    expect(migration).toContain("'RELEASE_HUMAN_TAKEOVER'");
    expect(hardening).toContain('security invoker');
    expect(hardening).toContain('revoke all on function public.release_human_takeover(uuid, uuid) from public');
    expect(hardening).toContain('revoke all on function public.release_human_takeover(uuid, uuid) from anon');
    expect(hardening).toContain('grant execute on function public.release_human_takeover(uuid, uuid) to authenticated');
  });

  it('fails closed for terminal states and never replays an old message', () => {
    expect(migration).toContain("v_conversation.stage in ('WON','LOST','DO_NOT_CONTACT','SPAM')");
    expect(migration).toContain("v_lead.status in ('WON','LOST','DO_NOT_CONTACT')");
    expect(migration).not.toMatch(/conversation_messages\s+set|outreach_messages\s+set|approved_send|provider/i);
  });

  it('resumes both linked automation states rather than only changing the UI flag', () => {
    expect(migration).toContain("agent_mode = 'AUTO'");
    expect(migration).toContain('requires_human = false');
    expect(migration).toContain("stage = case when stage = 'NEEDS_HUMAN' then 'ACTIVE' else stage end");
    expect(migration).toContain("awaiting_party = 'NONE'");
    expect(actions).toContain("rpc('release_human_takeover'");
  });

  it('exposes one owner-only release button only while the conversation is human locked and nonterminal', () => {
    expect(page).toContain("const editable=role==='OWNER'");
    expect(page).toContain('const humanLocked=conversation.requires_human');
    expect(page).toContain('humanLocked&&!terminal');
    expect(page).toContain('Release human takeover');
    expect(page).toContain('It never replays or sends an older message.');
  });
});
